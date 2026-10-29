# dsh-elysia-tts

把 **GPT-SoVITS** 的语音合成接进 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）。

- 随 DSH 启动自动拉起 GPT-SoVITS 的 `api_v2.py`，并做存活守护（掉线自动重启）；
- 插件跑在宿主进程里，不受会话沙箱限制，能正常写推理配置（这是手动拉服务时 `PermissionError` 的根因）；
- 注册 `elysia_tts` 工具：任何会话里都能「文本 → wav」。

## 依赖

1. 本机已装好 [GPT-SoVITS](https://github.com/RVC-Boss/GPT-SoVITS)，且 `api_v2.py` 能正常跑（v2Pro 推理配置）；
2. 训练好的 GPT / SoVITS 权重，或用一段参考音做零样本合成；
3. 对应 Python 环境；
4. DSH ≥ 0.2。

## 安装

```bash
# 从 npm（发布后）
dsh plugin add dsh-elysia-tts

# 或从本地目录
dsh plugin add /path/to/dsh-elysia-tts
```

## 配置（必填）

装完到 profile 的 `cordis.patch.yml` 里改这两项（**换成你自己机器上的绝对路径**）：

```yaml
- id: elysia-tts
  config:
    gptSovitsDir: 'D:/GPT-SoVITS'          # api_v2.py 所在目录
    pythonPath: 'D:/conda/envs/sovits/python.exe'
```

其余可选项：

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `apiConfig` | `GPT_SoVITS/configs/tts_infer_v2pro.yaml` | 推理配置，相对 `gptSovitsDir` 或绝对路径 |
| `port` | `9880` | 推理服务端口（被占用就换一个） |
| `autoStart` | `true` | 随 DSH 拉起 + 守护 |
| `startTimeoutMs` | `180000` | 等待服务就绪上限（模型首次加载 10~60 秒） |
| `refAudio` | 空 | 默认参考音 wav 绝对路径 |
| `promptText` | 空 | 参考音对应的台词（韵律对齐用，缺了容易飘） |
| `temperature` / `noiseScale` | `0.7` / `0.35` | 音色稳定性，越高越活跃也越容易飘 |

改完重启 DSH。

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

- **首次合成很慢**：模型要进显存，第一次通常 10~60 秒；之后单句几秒。
- **`PermissionError: tts_infer_v2pro.yaml`**：说明服务不是由 DSH 拉起的（被沙箱拦了）。让插件拉起，或给该目录写权限。
- **端口冲突**：改 `port`，工具会自动指向新端口。
- **日志**：`<DSH_HOME>/elysia-tts/api.log`，合成产物默认也在该目录。

## 分享注意

- 本仓库**不带模型权重和参考音**：体积大、且有角色音色的版权问题，请使用者自备。
- 插件不联网，只拉起本地进程。
- 不要把 AppSecret / token 之类的东西写进配置再提交。

## 许可

MIT
