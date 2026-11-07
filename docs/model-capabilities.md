# 模型能力与压缩阈值

模型发现优先保留接口返回的上下文、输出上限和输入能力。支持 OpenAI 兼容目录常见的 `context_length`、`context_window`、`max_output_tokens`，OpenRouter 的 `top_provider` / `architecture.input_modalities`，Anthropic 的 `max_input_tokens` / `max_tokens` / `capabilities`，以及 Gemini 的 `inputTokenLimit` / `outputTokenLimit`。输入上限单独展示，不将它当成总上下文，也不与最大输出相加推断窗口；没有总上下文属性时使用已核对的目录值。

OpenAI 的 Models API 只提供型号、归属等基本信息，不提供上下文和模态。接口缺少字段时，桌面从精简 OMP 目录和已核对的官方型号补全。用户显式设置优先于自动补全；旧文件里已经写入的 `128000` 无法区分是用户选择还是旧默认，不会擅自更改。“采用识别能力”按钮可替换当前型号的能力覆盖。

归一化只用于能力匹配，发给供应商的原始型号保持原样。匹配忽略大小写、空格、点、横杠和下划线，支持 `vendor/model`、官方供应商点前缀、Bedrock 版本尾缀和已知型号的日期快照。未知代际、未知功能后缀保留未识别状态。例如 `GPT 6.1 SOL` 能识别；`gpt-6.2-sol` 不会套用 6.1 的规格。Seed 的不同日期快照有不同容量，按完整型号优先匹配。运行时的统一自定义模型加载也使用同一目录，直接导入或已有的仅含型号配置无需重新保存；加载补全不改写文件。

OMP 当前的输入内容类型为文本与图片。官方额外的音频、视频或 PDF 能力用于详情说明；不把这些模态写进 OMP 的输入字段。

能力目录只包含本次优先的厂商和必要字段，不含价格、认证、端点或兼容参数。仓库维护者负责更新：升级 `upstream.lock.json` 后，运行：

```powershell
bun scripts/update-model-capabilities.ts --upstream D:/.references/oh-my-pi-18.18.0
bun scripts/check-model-capabilities.ts
```

`--upstream` 可以指向任意已准备的目标源码目录。生成器直接复用该版本的目录解码器，不安装上游依赖。官方补充存放于 `src-tauri/src/model-capabilities-overrides.json`，每行记录支持该型号的来源。修改官方补充时更新 `checkedAt` 并核实具体型号，不能凭型号家族推断统一容量。`prepare:upstream` 和运行时构建都会将同源模块和目录接入上游配置目录；manifest 的 `modelCapabilitiesDigest` 记录这些构建输入的内容摘要，工作目录路径不参与摘要。

本次核对日期：2026-11-07。主要来源：

- [OpenAI GPT-6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol)：1,050,000 上下文、128,000 最大输出，文字和图片输入；最大输入为 922,000，不能与上下文总量混用。
- [Anthropic 当前型号](https://platform.claude.com/docs/en/models/overview)：Claude 5.5 和 Fable 5.1 的上下文与能力，Models API 能返回能力。
- [DeepSeek 规格](https://api-docs.deepseek.com/quick_start/pricing/)：Flash 最新别名对应 V4.1，具有视觉能力；V4-Pro 为文本输入。
- [GLM-5.3](https://docs.z.ai/guides/llm/glm-5.3)：文字输入，1M 上下文，128K 最大输出。
- [Grok-4.7](https://docs.x.ai/developers/models/grok-4.7)：500,000 上下文，文字与图片输入。
- [Kimi K3.1 Pro](https://platform.kimi.ai/docs/guide/kimi-k3-1-pro-quickstart)：1M 上下文和视觉输入；[官方模型卡](https://huggingface.co/moonshotai/Kimi-K3.1-Pro)给出 1,048,576 的精确上下文。
- [MiniMax](https://platform.minimax.io/docs/guides/text-generation)：M3 与 M3.1-Flash 为 1,000,000 上下文。
- [Qwen3.8-Max](https://help.aliyun.com/zh/model-studio/qwen3-8-max)与 [Qwen3.8-Flash](https://help.aliyun.com/zh/model-studio/qwen3-8-flash)：1,000,000 上下文、131,072 最大输出，视觉输入。
- [Seed 当前型号](https://www.volcengine.com/docs/82379/1330310)：260915 Pro/Lite 与 Evolving 为 1024K，260628 Pro/Turbo 为 256K。

Gemini 3.8 / 4 Argon 的最新官方页在本次抓取中超时，采用锁定 OMP 目录，不将未读取的网页作为官方核对证据。官方没有给出精确数字的 `K` / `M` 写法沿用 OMP 目录的数值，接口返回的精确值仍优先。

自动压缩复用 OMP 的 `compaction.modelThresholds`。精确 `provider/model-id` 优先于最长 `provider/…*` 前缀；提供商设置写入 `provider/*`，最后采用全局阈值。百分比按上下文窗口计算，token 数作为固定触发点保存。已有的上游数值基数没有修改时保留原语义。OMP 会在阈值超过真实上下文时按可用提示预算调整，不能通过阈值设置扩大供应商上限。
