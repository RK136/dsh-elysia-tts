/**
 * 插件配置 schema。
 * 所有跟这台机器相关的路径都走配置，分享给别人时只改配置、不改代码。
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
    .default('GPT_SoVITS/configs/tts_infer_v2pro.yaml')
    .description('推理配置（相对 gptSovitsDir，或绝对路径）'),
  port: Schema.number()
    .default(9880)
    .description('推理服务端口'),
  autoStart: Schema.boolean()
    .default(true)
    .description('DSH 启动时自动拉起推理服务，并在掉线后自动重启'),
  startTimeoutMs: Schema.number()
    .default(180000)
    .description('等待服务就绪的最长时间（毫秒），模型首次加载通常 10~60 秒'),
  outputDir: Schema.string()
    .description('合成 wav 的默认输出目录；留空则用 <DSH_HOME>/elysia-tts'),
  refAudio: Schema.string()
    .description('默认参考音 wav 绝对路径（GPT-SoVITS 零样本 / 音色锚点）'),
  promptText: Schema.string()
    .description('默认参考音对应的台词（用于韵律对齐）'),
  temperature: Schema.number()
    .default(0.7)
    .description('采样温度，越高越活跃、越容易飘'),
  noiseScale: Schema.number()
    .default(0.35)
    .description('noise_scale，控制音色抖动'),
})
