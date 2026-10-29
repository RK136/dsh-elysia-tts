/**
 * dsh-elysia-tts —— 把 GPT-SoVITS 的语音合成接进 DSH。
 *
 * 一个宿主级 Cordis 插件：
 *   1. 随 DSH 启动：自动拉起并守护 GPT-SoVITS 的 api_v2.py（宿主权限，
 *      不受会话沙箱限制，所以能写推理配置）；
 *   2. 掉线自动重启；
 *   3. 注册 `elysia_tts` 工具：文本 → wav 文件路径，任何会话都能直接调用。
 *
 * 分享给别人时需要自备 GPT-SoVITS 与权重，路径全部走配置。
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, isAbsolute } from 'node:path'
import { Config } from './config.js'
import { SovitsService } from './sovits.js'

export { Config }
export const name = 'elysia-tts'
export const inject = ['tools']

function dshHome() {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}

function resolveOutputDir(config) {
  if (config.outputDir) return config.outputDir
  return join(dshHome(), 'elysia-tts')
}

function safeFileName(text) {
  const base = text.replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 24) || 'tts'
  return `${base}-${Date.now()}.wav`
}

export function apply(ctx, config) {
  const log = ctx.logger('elysia-tts')
  const service = new SovitsService(config, log)

  ctx.effect(() => {
    if (config.autoStart) {
      void service.ensure().catch((error) => log.error('elysia-tts: 启动推理服务失败 %o', error))
    }
    return () => service.stop()
  }, 'elysia-tts.lifecycle()')

  ctx.tools.register({
    name: 'elysia_tts',
    description: '把一段文字合成为语音（GPT-SoVITS，爱莉希雅音色）。'
      + '返回生成的 wav 绝对路径；发到 QQ 等通道时再用对应通道的媒体工具。'
      + '服务未启动时会自动拉起（首次可能要几十秒）。',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        text: { type: 'string', description: '要合成的文字（中文为主，短句效果最好）' },
        out: { type: 'string', description: '可选：输出 wav 的绝对路径；缺省写到输出目录' },
        ref_audio: { type: 'string', description: '可选：本次使用的参考音 wav 路径' },
        prompt_text: { type: 'string', description: '可选：参考音对应台词（韵律对齐用）' },
        temperature: { type: 'number', description: '可选：采样温度，默认取插件配置' },
        noise_scale: { type: 'number', description: '可选：noise_scale，默认取插件配置' },
        speed: { type: 'number', description: '可选：语速倍率，默认 1.0' },
      },
      required: ['text'],
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          path: { type: 'string' },
          bytes: { type: 'number' },
        },
        required: ['path', 'bytes'],
      },
      render: (_args, value) => [{ type: 'text', text: `语音已生成: ${value.path}` }],
    },
    timeoutMs: 320000,
    async execute(args) {
      const input = args
      const ready = await service.ensure()
      if (!ready) throw new Error('GPT-SoVITS 推理服务不可用，检查 DSH 日志与 api.log')
      const buf = await service.synthesize({
        text: input.text,
        refAudio: input.ref_audio,
        promptText: input.prompt_text,
        temperature: input.temperature,
        noiseScale: input.noise_scale,
        speedFactor: input.speed,
      })
      const out = input.out && isAbsolute(input.out)
        ? input.out
        : join(resolveOutputDir(config), safeFileName(input.text))
      mkdirSync(dirname(out), { recursive: true })
      writeFileSync(out, buf)
      log.info('elysia-tts: 合成完成 %s (%d bytes)', out, buf.length)
      return { path: out, bytes: buf.length }
    },
  })
}
