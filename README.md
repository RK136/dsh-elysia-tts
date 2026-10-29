# dsh-elysia-tts

把 **GPT-SoVITS** 的语音合成接进 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）。

- 随 DSH 启动自动拉起 GPT-SoVITS 的 `api_v2.py`，并做存活守护（掉线自动重启）；
- 插件跑在宿主进程里，不受会话沙箱限制，能正常写推理配置（这是手动拉服务时 `PermissionError` 的根因）；
- 注册 `elysia_tts` 工具，任何会话都能「文本 → wav」。

## 依赖

- 本机已装好 [GPT-SoVITS](https://github.com/RVC-Boss/GPT-SoVITS)（v2Pro 推理配置可用）；
- 训练好的 GPT / SoVITS 权重（或零样本参考音）；
- 对应 Python 环境（能跑 `api_v2.py` 即可）；
- DSH ≥ 0.2。

## 安装

```bash
# 从 npm（发布后）
dsh plugin add dsh-elysia-tts

# 或本地目录
dsh plugin add /path/to/dsh-elysia-tts
```

首次启动会在 profile 的 `cordis.patch.yml` 里插入一行 `elysia-tts`，按自己机器改下面这些路径。

## 配置

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `gptSovitsDir` | `E:\GPT-SoVITS` | 源码目录（`api_v2.py` 所在） |
| `pythonPath` | `E:\Miniconda\envs\sovits\python.exe` | 跑 api 的 Python |
| `apiConfig` | `GPT_SoVITS/configs/tts_infer_v2pro.yaml` | 推理配置，相对或绝对路径 |
| `port` | `9880` | 推理服务端口 |
| `autoStart` | `true` | 随 DSH 拉起 + 守护 |
| `startTimeoutMs` | `180000` | 等待就绪上限 |
| `refAudio` | 空 | 默认参考音 wav |
| `promptText` | 空 | 参考音对应台词（韵律对齐） |
| `temperature` / `noiseScale` | `0.7` / `0.35` | 音色稳定性 |

## 工具

```json
{
  "name": "elysia_tts",
  "arguments": { "text": "在呀，听到爱莉的声音了吗" }
}
```

返回 `{ "path": "...\\elysia-tts\\xxx.wav", "bytes": 190764 }`。
可选参数：`out`（输出路径）、`ref_audio` / `prompt_text`（本次覆盖参考音）、`temperature`、`noise_scale`、`speed`。

想要「在 QQ 里回语音」，再配合对应 QQ 通道插件的媒体发送能力（例如 `qq_send_media`）。

## 分享注意

- 仓库/包里**不带模型权重与参考音**：它们体积大、且有角色音色的版权问题，请让使用者自备。
- 服务日志在 `<DSH_HOME>/elysia-tts/api.log`，合成产物默认也在该目录。
- 插件只拉起一个本地进程，不联网；端口冲突时改 `port`。

## 许可

MIT
