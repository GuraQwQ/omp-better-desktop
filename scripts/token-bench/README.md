# 本机 Token 对照

用冻结的两份 OMP 可执行文件运行六类任务，每类官方版与实验版各一次，共12个根任务。实验组同时开启 `tokenOptimization.skillCacheReuse` 和 `tokenOptimization.programmatic`；配置、技能目录、会话和原生缓存均隔离在输出目录。计量代理记录请求用量元数据，任务产物与会话只写到本机。

离线校准不需要提供商配置：

```powershell
bun run bench:tokens --original D:/bench/original/omp.exe --experimental D:/bench/experimental/omp.exe --output D:/bench/preflight --preflight
```

真实对照读取本机 JSON 配置文件，字段为 `baseUrl`、`apiKey`、`modelId`、`thinking`。首次运行使用空输出目录；以下操作会实际调用配置的供应商：

```powershell
bun run bench:tokens --original D:/bench/original/omp.exe --experimental D:/bench/experimental/omp.exe --provider D:/bench/provider.json --output D:/bench/comparison --concurrency 2
```

`--concurrency` 仅接受1或2，默认2。同题A/B成对启动，两者均完成收尾后再启动下一题；显式1用于串行诊断。根任务上限为2，上游任务内部的子代理能力不受限制，所有请求仍计入所属根任务。并发A/B可能共享供应商缓存与限流，不表示消除了供应商影响。

中断后使用相同参数追加 `--resume`。已保存的completed、timeout、error等终态全部跳过，不自动重试失败样本。单题result.json为恢复依据，即使汇总尚未写完也不会重跑；缺失终态的任务从run-state.json记录的根会话续接，不按“最新文件”猜测子会话。续跑标记计时/计量不完整，不作为完整成本样本。`--timeout-ms` 设置每题时限，默认600000。

元数据冻结两份二进制、夹具源码摘要、模型/思考、供应商端点摘要、并发和时限。续跑要求这些相同；旧格式的冻结轮次继续使用其原驱动，不能混入新策略。新版本应使用新输出目录。

单题结果、results.json和report.md由同一个写入队列以临时同目录文件+重命名原子提交，汇总固定为题目顺序和A/B顺序。一个任务失败不会取消另一任务；结束失败同样保存质量与已消耗用量。独立任务的其它产物可以并行写入各自目录。

`meter/attempts.jsonl` 每请求先保存开始记录，再向上游转发；结束时追加同ID终态，恢复按ID归并。孤立开始行记为中断/用量未知，不永久pending；半行和矛盾终态保留原文件并拒绝猜测用量。metadata请求不计入模型用量。输入包含缓存子集，输出包含思考；缺失usage/cache保持未知，失败和上游原有重试均计入成本，计量器不新增重试或改变请求正文。

`observations.json` 在任务结束后只读分析会话usage。按总token、输出和含缓存输入唯一匹配，归为前台、持久化model_usage辅助调用、其它会话或unknown；不唯一就unknown，不凭“小请求”猜测技能压缩。其它会话的脚本输入与根任务process.execPath调用只能共同提示“疑似误启”，确认仍需审查。分析不写入提示词、生成正文、工具参数或错误原文。

观测同时记录usage/cache覆盖、来源已知用量、eval次数与错误类别、tool-only/Todo-only轮数。tool-only指有工具调用且无普通文本的助手轮；Todo-only指该轮工具全为todo，即使伴随文本。两者不是互斥分类。未归属请求仍计入总用量；辅助调用、同进程子代理不会按PID双计。

`slotWaitMs`为本次调度入队到取得槽位的等待；executionMs从提交prompt到会话终态；totalMs另含进程启动、辅助请求收尾和关闭，不含槽位等待与外部oracle。请求firstByteMs是响应正文首字节，不是模型TTFT；首包后响应时长也不能直接称为模型计算时间。开始/结束时间支持区间并集，请求耗时之和可能重叠；工具忙碌时间来自RPC接收事件，不是CPU时间。中断前缺失的计时不补造。

程序化开关启用原生 eval 的 `await readBatch(paths)`，最多同时执行四个 read，按输入顺序返回 `{path,result,error?}`；原始文本、元数据、图像及每项错误保留。JS/Python 共用宿主实现，取消沿原工具传递。项目测试使用项目原生运行时，Todo 和写入按依赖顺序执行。是否采用批次及其净收益仍以完整任务结果为准。

技能缓存开关在现有 SQLite 描述库中协调压缩认领，成功和无效结果与认领释放使用短事务；持有进程退出后可过期接管，当前会话描述继续冻结。普通 A/B 的两组缓存保持隔离，单技能题不能替代共享库并发验证；该机制另有真实双进程的受控压缩测试。

`bun scripts/check-token-harness.ts --runtime <实验OMP可执行文件> --python` 使用本机固定响应验证真实 eval/read/Node/Todo 链路及开关撤回，不请求真实模型。加 `--baseline` 验证原版已有接口。无参数调用只提示显式入口，完整合同检查在运行时构建后执行。

仓库内的配置与运行证据应放在忽略的 `.cache/token-bench/`。`check-token-meter.ts`、`check-token-rpc.ts`、`check-token-runner.ts` 与 `check-token-fixtures.ts` 使用本机替身和确定性断言，不调用真实供应商。
