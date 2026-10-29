# dsh-elysia-tts

> 这是第一次做 DSH 插件，UP 本身也是计算机小白，代码和文档难免有粗糙、想不周全的地方。
> 遇到问题欢迎到 Issues 里反馈，多多交流、一起把它改好；如果有帮到你，点个 ⭐ Star 支持一下就好啦，谢谢~

把 **GPT-SoVITS** 的语音合成接进 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）。

- 随 DSH 启动自动拉起 GPT-SoVITS 的 `api_v2.py`，并做存活守护（掉线自动重启）；
- **音色权重缺失时自动从 Release 下载**，推理配置自动生成，参考音自带——装完只填两个路径就能用；
- 注册 `elysia_tts` 工具：任何会话里都能「文本 → wav」。

## 三步开始

1. 装好 [GPT-SoVITS](https://github.com/RVC-Boss/GPT-SoVITS)（能跑 `api_v2.py` 即可）；
2. `dsh plugin add dsh-elysia-tts` 装插件；
3. 在 profile 的 `cordis.patch.yml` 里只填这两项：

```yaml
- id: elysia-tts
  config:
    gptSovitsDir: 'D:/GPT-SoVITS'              # api_v2.py 所在目录
    pythonPath: 'D:/conda/envs/sovits/python.exe'
```

重启 DSH，第一次会下载音色权重（约 460MB）并生成推理配置，之后就能用 `elysia_tts` 说话啦。

## 仓库文件说明

| 文件 | 干什么的 |
| --- | --- |
| `lib/index.js` | 插件入口：随 DSH 启动、注册 `elysia_tts` 工具、生命周期管理 |
| `lib/sovits.js` | GPT-SoVITS 服务管家：自动下载权重、生成推理配置、拉起/守护 `api_v2.py`、调 `/tts` 合成 |
| `lib/config.js` | 配置 schema（所有可调项和默认值） |
| `assets/tts_infer_v2pro.yaml` | 推理配置模板（自动生成配置时用它，替换权重路径） |
| `assets/ref/g-06.wav`、`g-12.wav` | 自带的参考音（音色锚点），不用额外找音频 |
| `cordis.patch.yml` | 装插件时插入到 profile 的默认配置（示例路径，需要改） |
| `package.json` | npm 包信息与 DSH bundle 声明 |
| `README.md` / `LICENSE` | 说明文档 / MIT 许可 |

## Release 资产说明

`models-v1` 这个 Release 页面上的四个文件：

| 资产 | 是什么 | 要不要下 |
| --- | --- | --- |
| `elysia_v2pro-e10.ckpt` | GPT（t2s）权重，约 148MB，负责语气和韵律 | 插件会自动下 |
| `elysia_v2Pro.pth` | SoVITS（vits）权重，约 309MB，负责音色 | 插件会自动下 |
| `Source code (zip)` | GitHub 自动打包的仓库源码压缩包 | 不用下 |
| `Source code (tar.gz)` | 同上，tar.gz 格式 | 不用下 |

> 插件下载时只取前两个重量文件，地址是
> `https://github.com/RK136/dsh-elysia-tts/releases/download/models-v1/<文件名>`；
> 两个 source code 包是 GitHub 给仓库打的快照，跟音色无关。

## 配置项

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `gptSovitsDir` | 必填 | GPT-SoVITS 源码目录（`api_v2.py` 所在） |
| `pythonPath` | 必填 | 跑 `api_v2.py` 的 Python |
| `apiConfig` | 留空自动生成 | 推理配置，相对或绝对路径；留空时插件用自带模板生成 |
| `port` | `9880` | 推理服务端口（被占用就换） |
| `autoStart` | `true` | 随 DSH 拉起 + 守护 |
| `startTimeoutMs` | `240000` | 等待就绪上限（首次下载权重会更久） |
| `modelDir` | `<DSH_HOME>/elysia-tts/models` | 音色权重目录 |
| `autoDownloadModels` | `true` | 缺权重时自动下载；已有训练好的权重可关掉 |
| `weightsBaseUrl` | 本仓库 Release `models-v1` | 权重下载地址前缀 |
| `refAudio` | 自带 `assets/ref/g-06.wav` | 参考音 wav |
| `promptText` | 自带参考音对应台词 | 韵律对齐用 |
| `temperature` / `noiseScale` | `0.7` / `0.35` | 音色稳定性 |

> 已经有训练好的权重、且推理配置可用时：把 `autoDownloadModels` 设成 `false`，
> `apiConfig` 指向你自己的 yaml 即可，不会重复下载。

## 用工具

```json
{
  "name": "elysia_tts",
  "arguments": { "text": "在呀，听到爱莉的声音了吗" }
}
```

返回：

```json
{ "path": "C:\\...\\elysia-tts\\在呀-1720000000000.wav", "bytes": 190764 }
```

可选参数：`out`（指定输出路径）、`ref_audio` / `prompt_text`（本次覆盖参考音）、`temperature`、`noise_scale`、`speed`。

想发到 QQ：把生成的 wav 交给 QQ 通道的媒体发送能力（例如 `qq_send_media`，或直接用 QQ 开放平台 `file_type=3` 上传、`msg_type=7` 发送）。

## 常见问题

- **首次启动很慢**：要下载权重 + 模型进显存，通常几分钟；之后启动几十秒。
- **`PermissionError: tts_infer_v2pro.yaml`**：服务不是由 DSH 拉起的（被沙箱拦了）。让插件拉起。
- **端口冲突**：改 `port`。
- **日志**：`<DSH_HOME>/elysia-tts/api.log`；合成产物默认在同目录。

## 关于音色

仓库自带的参考音与 Release 里的权重，来自《崩坏3》爱莉希雅的角色语音。
**仅供个人学习交流，非商用；角色音色版权归米哈游及原配音演员所有**，请勿用于冒充、商用或二次分发牟利。

## 许可

MIT
