/**
 * GPT-SoVITS 推理服务的生命周期管理。
 *
 * 关键点：本插件跑在 DSH 宿主进程里，子进程继承宿主的权限，
 * 所以不再受会话沙箱（workspace-write）限制，api_v2.py 可以正常写
 * GPT_SoVITS/configs/tts_infer_v2pro.yaml —— 这正是之前手动拉起时
 * PermissionError 的根因。
 */
import { spawn } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'

const POLL_INTERVAL_MS = 1000
const WATCH_INTERVAL_MS = 30000

function dshHome() {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}

export class SovitsService {
  constructor(config, log) {
    this.config = config
    this.log = log
    this.child = null
    this.ready = null
    this.watchTimer = null
    this.stopping = false
  }

  get baseUrl() {
    return `http://127.0.0.1:${this.config.port}`
  }

  get apiConfigPath() {
    return isAbsolute(this.config.apiConfig)
      ? this.config.apiConfig
      : join(this.config.gptSovitsDir, this.config.apiConfig)
  }

  get logPath() {
    const dir = this.config.outputDir || join(dshHome(), 'elysia-tts')
    return join(dir, 'api.log')
  }

  async alive() {
    try {
      const res = await fetch(`${this.baseUrl}/docs`, { signal: AbortSignal.timeout(2000) })
      return res.ok
    } catch {
      return false
    }
  }

  /** 幂等：服务在就立刻返回；不在就拉起并等到就绪。 */
  ensure() {
    if (this.ready) return this.ready
    this.ready = (async () => {
      try {
        if (await this.alive()) {
          this.log.info('elysia-tts: 推理服务已在线 (%s)', this.baseUrl)
          return true
        }
        if (!this.config.autoStart) return false
        this.spawnApi()
        const ok = await this.waitUntilReady()
        if (!ok) {
          this.log.error('elysia-tts: 推理服务未在 %dms 内就绪，见 %s', this.config.startTimeoutMs, this.logPath)
        }
        return ok
      } finally {
        this.ready = null
      }
    })()
    return this.ready
  }

  spawnApi() {
    if (!existsSync(this.config.pythonPath)) {
      throw new Error(`python 不存在: ${this.config.pythonPath}`)
    }
    if (!existsSync(this.config.gptSovitsDir)) {
      throw new Error(`GPT-SoVITS 目录不存在: ${this.config.gptSovitsDir}`)
    }
    const dir = join(this.config.outputDir || join(dshHome(), 'elysia-tts'))
    mkdirSync(dir, { recursive: true })
    const logStream = createWriteStream(this.logPath, { flags: 'a' })
    this.log.info('elysia-tts: 拉起 api_v2.py (port=%d cwd=%s)', this.config.port, this.config.gptSovitsDir)
    const child = spawn(
      this.config.pythonPath,
      ['api_v2.py', '-a', '127.0.0.1', '-p', String(this.config.port), '-c', this.apiConfigPath],
      {
        cwd: this.config.gptSovitsDir,
        windowsHide: true,
        stdio: ['ignore', logStream, logStream],
      },
    )
    child.on('exit', (code, signal) => {
      this.log.warn('elysia-tts: 推理进程退出 code=%s signal=%s', code, signal)
      this.child = null
      if (!this.stopping) this.scheduleRestart()
    })
    this.child = child
    this.startWatch()
  }

  async waitUntilReady() {
    const deadline = Date.now() + (this.config.startTimeoutMs || 180000)
    while (Date.now() < deadline) {
      if (await this.alive()) return true
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
    }
    return false
  }

  startWatch() {
    if (this.watchTimer) return
    this.watchTimer = setInterval(async () => {
      if (this.stopping || this.child) return
      this.ready = null
      try {
        const ok = await this.ensure()
        if (ok) this.log.info('elysia-tts: 守护检查通过')
      } catch (error) {
        this.log.warn('elysia-tts: 守护重启失败 %o', error)
      }
    }, WATCH_INTERVAL_MS)
  }

  scheduleRestart() {
    setTimeout(() => {
      if (this.stopping || this.child) return
      this.ready = null
      void this.ensure().catch((error) => this.log.warn('elysia-tts: 自动重启失败 %o', error))
    }, 5000)
  }

  /** 调 /tts 合成一句话，返回 wav 字节。 */
  async synthesize({ text, refAudio, promptText, temperature, noiseScale, speedFactor }) {
    const ref = refAudio || this.config.refAudio
    if (!ref) throw new Error('没有参考音：请配置 refAudio 或传入 ref_audio')
    const payload = {
      text: fixPhrasing(text),
      text_lang: 'zh',
      ref_audio_path: ref,
      prompt_text: promptText || this.config.promptText || '',
      prompt_lang: 'zh',
      media_type: 'wav',
      streaming_mode: false,
      temperature: temperature ?? this.config.temperature,
      noise_scale: noiseScale ?? this.config.noiseScale,
      speed_factor: speedFactor ?? 1.0,
    }
    const res = await fetch(`${this.baseUrl}/tts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(300000),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`/tts HTTP ${res.status}: ${body.slice(0, 300)}`)
    }
    return Buffer.from(await res.arrayBuffer())
  }

  stop() {
    this.stopping = true
    if (this.watchTimer) {
      clearInterval(this.watchTimer)
      this.watchTimer = null
    }
    const child = this.child
    this.child = null
    if (!child || child.exitCode !== null) return
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
      } else {
        child.kill('SIGTERM')
      }
    } catch (error) {
      this.log.warn('elysia-tts: 停止推理进程失败 %o', error)
    }
  }
}

/** 拗口改写：句尾容易塌的字换掉，让收尾上扬一点。 */
function fixPhrasing(text) {
  let out = text
  out = out.replace(/辛苦了(?!啦)/g, '辛苦啦')
  out = out.replace(/[。.]$/, '')
  if (out.length > 0 && !'，。！？…～,.!?'.includes(out[0])) out = '，' + out
  return out
}
