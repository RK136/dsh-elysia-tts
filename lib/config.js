/**
 * 插件配置 schema。
 * 所有跟这台机器相关的路径都走配置，分享给别人时只改配置、不改代码。
 *
 * 目标是「装完就能用」：音色权重自动从 Release 下载，推理配置自动生成，
 * 参考音插件自带，用户最多只需要填 gptSovitsDir / pythonPath 两项。
 */
import Schema from '@deepseek-ai/schemastery'

export const Config = Schema.object({
  gptSovitsDir: Schema.string()
    .required()
    .description('GPT-SoVITS 源码目录（api_v2.py 所在目录）'),
  pythonPath: Schema.string()
    .required()
    .description('运行 api_v2.py 的 Python 解释器绝对路径'),
  apiConfig: Schema.string()
    .description('推理配置（相对 gptSovitsDir 或绝对路径）；留空则插件自动生成一份'),
  port: Schema.number()
    .default(9880)
    .description('推理服务端口'),
  autoStart: Schema.boolean()
    .default(true)
    .description('DSH 启动时自动拉起推理服务，并在掉线后自动重启'),
  startTimeoutMs: Schema.number()
    .default(240000)
    .description('等待服务就绪的最长时间（毫秒）；首次自动下载权重会更久'),
  modelDir: Schema.string()
    .description('音色权重存放目录；留空则用 <DSH_HOME>/elysia-tts/models'),
  autoDownloadModels: Schema.boolean()
    .default(true)
    .description('缺少音色权重时自动从 weightsBaseUrl 下载'),
  weightsBaseUrl: Schema.string()
    .default('https://github.com/RK136/dsh-elysia-tts/releases/download/models-v1')
    .description('音色权重的下载地址前缀（目录或 Release tag 地址）'),
  outputDir: Schema.string()
    .description('合成 wav 的默认输出目录；留空则用 <DSH_HOME>/elysia-tts'),
  refAudio: Schema.string()
    .description('默认参考音 wav 路径；留空则用插件自带的 assets/ref/g-06.wav'),
  promptText: Schema.string()
    .description('参考音对应台词（韵律对齐）；留空则用自带参考音对应的台词'),
  temperature: Schema.number()
    .default(0.7)
    .description('采样温度，越高越活跃、越容易飘'),
  noiseScale: Schema.number()
    .default(0.35)
    .description('noise_scale，控制音色抖动'),
})
