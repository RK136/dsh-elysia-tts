import { writeFileSync } from 'node:fs'
import { SovitsService } from './lib/sovits.js'

const log = {
  info: (...a) => console.log('[i]', ...a),
  warn: (...a) => console.warn('[w]', ...a),
  error: (...a) => console.error('[e]', ...a),
  debug: () => {},
}

const svc = new SovitsService({
  port: 9880,
  gptSovitsDir: 'E:\\GPT-SoVITS',
  pythonPath: 'E:\\Miniconda\\envs\\sovits\\python.exe',
  apiConfig: 'GPT_SoVITS/configs/tts_infer_v2pro.yaml',
  autoStart: false,
  startTimeoutMs: 10000,
  refAudio: 'E:\\deepseek\\DEEPSEEK整合包\\人格包\\elysia-pkg2-elysia\\voice-clips\\g-06.wav',
  promptText: '一段時間不見,芽衣變得越來越彈帥了,這也太犯規了吧',
  temperature: 0.7,
  noiseScale: 0.35,
}, log)

console.log('alive =', await svc.alive())
const buf = await svc.synthesize({ text: '插件测试成功' })
writeFileSync('plugins/dsh-elysia-tts/smoke.wav', buf)
console.log('bytes =', buf.length)
