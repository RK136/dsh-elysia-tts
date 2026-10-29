/**
 * GPT-SoVITS 推理服务的生命周期管理。
 *
 * 关键点：本插件跑在 DSH 宿主进程里，子进程继承宿主的权限，
 * 所以不再受会话沙箱（workspace-write）限制，api_v2.py 可以正常写
 * GPT_SoVITS/configs/tts_infer_v2pro.yaml —— 这正是之前手动拉起时
 * PermissionError 的根因。
 *
 * 为「装完就能用」做了三件事：
 *   1. 音色权重缺失时自动从 GitHub Release 下载；
 *   2. 没有可用的推理配置时，用插件自带模板生成一份（权重指向下载目录）；
 *   3. 参考音默认用插件自带的，不用用户另找。
 */
import { spawn } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const POLL_INTERVAL_MS = 1000
const WATCH_INTERVAL_MS = 30000

const ASSETS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets')
const DEFAULT_GPT_NAME = 'elysia_v2pro-e10.ckpt'
const DEFAULT_SOVITS_NAME = 'elysia_v2Pro.pth'
const DEFAULT_REF = join(ASSETS_DIR, 'ref', 'g-06.wav')
const CONFIG_TEMPLATE = join(ASSETS_DIR, 'tts_infer_v2pro.yaml')

function dshHome() {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}

/** 自带的参考音（配置留空时使用）。 */
export function bundledRefAudio() {
  return existsSync(DEFAULT_REF) ? DEFAULT_REF : ''
}

export class SovitsService {
  constructor(config, log) {
    this.config = config
    this.log = log
    this.child = null
    this.ready = null
    this.modelsReady = null
    this.watchTimer = null
    this.stopping = false
  }

  get baseUrl() {
    return `http://127.0.0.1:${this.config.port}`
  }

  get modelDir() {
    return this.config.modelDir || join(dshHome(), 'elysia-tts', 'models')
  }

  get gptWeightsPath() {
    return join(this.modelDir, DEFAULT_GPT_NAME)
  }

  get sovitsWeightsPath() {
    return join(this.modelDir, DEFAULT_SOVITS_NAME)
  }

  /** 用户给了 apiConfig 且文件存在 → 用它；否则用自动生成的配置。 */
  get apiConfigPath() {
    if (this.config.apiConfig) {
      const p = isAbsolute(this.config.apiConfig)
        ? this.config.apiConfig
        : join(this.config.gptSovitsDir || '.', this.config.apiConfig)
      if (existsSync(p)) return p
    }
    return join(dshHome(), 'elysia-tts', 'tts_infer.yaml')
  }

  get logPath() {
    const dir = join(dshHome(), 'elysia-tts')
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
        await this.ensureModels()
        this.ensureInferConfig()
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

  /** 权重没下全就自动下载。 */
  ensureModels() {
    if (this.modelsReady) return this.modelsReady
    this.modelsReady = (async () => {
      if (this.config.autoDownloadModels === false) return
      const haveGpt = existsSync(this.gptWeightsPath)
      const haveSovits = existsSync(this.sovitsWeightsPath)
      if (haveGpt && haveSovits) return
      const base = (this.config.weightsBaseUrl || '').replace(/\/+$/, '')
      if (!base) {
        this.log.warn('elysia-tts: 缺少音色权重，且未配置 weightsBaseUrl，跳过自动下载')
        return
      }
      mkdirSync(this.modelDir, { recursive: true })
      if (!haveGpt) await this.download(`${base}/${DEFAULT_GPT_NAME}`, this.gptWeightsPath)
      if (!haveSovits) await this.download(`${base}/${DEFAULT_SOVITS_NAME}`, this.sovitsWeightsPath)
    })()
    return this.modelsReady.finally(() => { this.modelsReady = null })
  }

  async download(url, dest) {
    this.log.info('elysia-tts: 下载音色权重 %s -> %s', url, dest)
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(3600000) })
    if (!res.ok || !res.body) throw new Error(`下载失败 HTTP ${res.status}: ${url}`)
    const tmp = `${dest}.part`
    await pipeline(Readable.fromWeb(res.body), createWriteStream(tmp))
    renameSync(tmp, dest)
    this.log.info('elysia-tts: 权重就绪 %s (%d MB)', dest, Math.round(statSync(dest).size / 1048576))
  }

  /** 用插件自带模板生成本机推理配置（custom 段指向下载的权重）。 */
  ensureInferConfig() {
    const target = this.apiConfigPath
    if (existsSync(target)) return
    if (!existsSync(CONFIG_TEMPLATE)) {
      this.log.warn('elysia-tts: 缺少配置模板 %s，无法自动生成推理配置', CONFIG_TEMPLATE)
      return
    }
    let text = readFileSync(CONFIG_TEMPLATE, 'utf8')
    text = text.replace(
      /(custom:\n(?:.*\n)*?\s+t2s_weights_path:\s*).*/,
      `$1${this.gptWeightsPath.replace(/\\/g, '\\\\')}`,
    )
    text = text.replace(
      /(custom:\n(?:.*\n)*?\s+vits_weights_path:\s*).*/,
      `$1${this.sovitsWeightsPath.replace(/\\/g, '\\\\')}`,
    )
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, text, 'utf8')
    this.log.info('elysia-tts: 已生成推理配置 %s', target)
  }

  spawnApi() {
    if (!this.config.pythonPath) throw new Error('没有配置 pythonPath（跑 api_v2.py 的 Python）')
    if (!existsSync(this.config.pythonPath)) {
      throw new Error(`python 不存在: ${this.config.pythonPath}`)
    }
    if (!this.config.gptSovitsDir || !existsSync(this.config.gptSovitsDir)) {
      throw new Error(`GPT-SoVITS 目录不存在: ${this.config.gptSovitsDir || '(未配置)'}`)
    }
    const dir = join(dshHome(), 'elysia-tts')
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
    const useBundled = !refAudio && !this.config.refAudio
    const ref = refAudio || this.config.refAudio || bundledRefAudio()
    if (!ref) throw new Error('没有参考音：请配置 refAudio 或传入 ref_audio')
    const prompt = promptText || this.config.promptText
      || (useBundled ? '一段時間不見,芽衣變得越來越彈帥了,這也太犯規了吧' : '')
    const payload = {
      text: fixPhrasing(text),
      text_lang: 'zh',
      ref_audio_path: ref,
      prompt_text: prompt,
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
