# 本机 Token 对照

用冻结的两份 OMP 可执行文件运行六类任务，每类官方版与实验版各一次。实验组同时开启 `tokenOptimization.skillCacheReuse` 和 `tokenOptimization.programmatic`；配置、技能目录、会话和原生缓存均隔离在输出目录。计量代理记录请求用量元数据，任务产物与会话只写到本机。

离线校准不需要提供商配置：

```powershell
bun run bench:tokens --original D:/bench/original/omp.exe --experimental D:/bench/experimental/omp.exe --output D:/bench/preflight --preflight
```

真实对照读取本机 JSON 配置文件，字段为 `baseUrl`、`apiKey`、`modelId`、`thinking`。首次运行使用空输出目录；以下操作会实际调用配置的供应商：

```powershell
bun run bench:tokens --original D:/bench/original/omp.exe --experimental D:/bench/experimental/omp.exe --provider D:/bench/provider.json --output D:/bench/comparison
```

中断后使用相同参数追加 `--resume`。已完成结果直接保留；未完成任务从已有会话续接并标记计时/计量不完整，不作为完整成本样本。`--timeout-ms` 设置每题时限，默认 600000。

`results.json` 保留每题质量、工具调用与计量，`report.md` 提供摘要，`metadata.json` 固定二进制摘要、模型与思考程度。`meter/attempts.jsonl` 每请求有开始和终态记录，必须按 ID 归并，不能直接按行求和。输入包含缓存子集，输出包含思考；缺失用量/缓存值保留未知，失败和重试均计入成本。

程序化开关增加使用原生 `eval` 的指导，不保证模型采用，也不保证净收益。技能缓存开关只避免等待压缩槽位期间另一会话已完成的重复压缩；每题空缓存用于隔离，不能据此验证跨会话复用收益。比较完成率和独立验收后，再比较整任务 token 与耗时。

仓库内的配置与运行证据应放在忽略的 `.cache/token-bench/`。`check-token-meter.ts`、`check-token-rpc.ts` 与 `check-token-fixtures.ts` 使用本机替身和确定性断言，不调用真实供应商。
