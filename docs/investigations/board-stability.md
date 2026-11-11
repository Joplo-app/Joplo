# 共享看板登记与失败编译调查

基线：0.7.1 / `878aa532`。相关问题：#115、#122、#121。

## 已确认的登记竞态

注册项目的 HTTP POST 原先在 `activate()` 发起异步编译后立即返回，初次 `startDev()` 也没有等待项目 ready。CLI 此时可以打印 watch 命令，而 `.joplo/reviews/` 尚无登记。浏览器访问 IR 接口会等待编译，所以“打开页面后正常”可以遮住竞态。

修复让两条启动路径等待初次编译完成。成功编译建立登记后才返回，失败仍保留看板诊断，不伪造评审。加入请求的客户端超时提高到 120 秒，以容纳真实的初次编译；ping 仍为 1.5 秒。回归不访问任何浏览器页面，在加入响应后直接读取评审文件；在修复前稳定失败、修复后通过。

评审记录没有闲置 TTL。源码事件、编译错误、作品移除、宿主停止可以关闭记录；确认也是结束当前评审而非登记过期。`feedback list --local --all --json` 可检查历史及关闭原因。#115 的“几分钟后失效”不能仅由初次登记竞态解释，不能在没有关闭事件证据时宣称整个问题已解决。

加入项目仍依赖原看板进程。此修复没有实现后台托管或宿主接管，也没有停其他看板。

## 失败编译实验

真实临时项目与随机端口；不访问付费服务。`board-stability.test.ts` 每次修改失败项目后等待真实 Vite 编译，断言失败诊断、读取健康项目 HTTP IR，并测量 heap、SSR 模块图规模及日志长度。四类输入为模块 throw、asset 文件缺失、共享依赖 undefined 求值、非法样式数据（NaN）。这不声称与原问题的具体业务项目或 `Invalid input` 文本完全相同。

复现命令：

```sh
pnpm exec vitest run packages/server/test/board-stability.test.ts
JOPLO_STABILITY_ITERATIONS=240 JOPLO_STABILITY_GC_PASSES=1 pnpm exec vitest run packages/server/test/board-stability.test.ts -t 'measures repeated' --execArgv=--expose-gc --reporter=verbose
JOPLO_STABILITY_IDLE_MS=180000 pnpm exec vitest run packages/server/test/board-stability.test.ts -t 'while idle' --reporter=verbose
```

实验控制仅存在于测试中：`JOPLO_STABILITY_GC_PASSES=1|2` 控制单/双 GC；`JOPLO_STABILITY_NATIVE_MAPS=off` 强制覆盖 native maps setter并报告实际开关；`JOPLO_STABILITY_SNAPSHOT_DIR=<private-temp-dir>` 写首尾堆快照（可能包含夹具源码，不公开上传）。`JOPLO_STABILITY_HEAP_GROWTH_MB=<n>` 是显式探索阈值，不是产品内存承诺。

逐轮原始数值见 [board-stability-samples.json](./board-stability-samples.json)。未包含个人路径、凭证或项目内容。所有实验都让健康项目每轮可读，未复现 OOM。

| Node 26.13.0 实验 | heap 开始→结束 / 峰值 | 模块图 | 结论限制 |
| --- | --- | --- | --- |
| 1,200 轮、单次 GC、响应体未消费 | 62→155 / 155 MiB | 42–43 | 早期探针存在未读网络响应干扰；探索性 32 MiB 增长阈值失败，不作为产品泄漏证据 |
| 240 轮、消费 JSON、单次 GC | 62→83 / 83 MiB | 42–43 | 消费响应未消除趋势；不是内存上界证明 |
| 240 轮、消费 JSON、native maps 实际 off | 60→81 / 81 MiB | 42–43 | 仅测试覆盖 setter，防止 loadAuthoring 重开；不能支持全局禁用映射的修复 |
| 240 轮、消费 JSON、两次 GC 间让出事件循环 | 62→83 / 83 MiB | 42–43 | 仍存在 GC/cache 状态差异，不能据此断定无限增长 |
| 120 轮、首尾堆快照 | 60→63 / 72 MiB | 42–43 | 写快照额外收集，改变测量状态；终点显著回落 |

所有实验最大日志为 2,384 字符。首尾快照保留差异主要在 V8 code、TrustedByteArray、FeedbackVector、指令及 JIT 元数据；普通字符串约 +37 KiB，普通 Object 约 +43 KiB，未见错误文本或模块对象随轮数膨胀。快照不是严格匹配的收集策略，不能据此证明没有泄漏；原始堆快照仅保留在本机私有临时目录，不纳入可分发产物。没有为改善数值调整产品缓存、禁用 native source maps 或改变编译语义。

闲置测试在没有访问浏览器页面的情况下等待 180 秒，两个原登记 ID 仍为 open。该结果覆盖已测环境，不排除其他源码事件或现场编译错误关闭登记。

## 尚缺的原始现场

只读检查了获准的两个相关项目目录下现存 `.log`、`.crash`、stderr 文本（排除依赖、Git、嵌套引擎源码和凭证），没有发现 `heap out of memory`、`FATAL ERROR`、`Runtime_FlattenString`、`compilation failed` 或相关 undefined 错误记录。未启动、停止或修改这些项目；不能把“现存日志未找到”说成现场没发生。

#121 保持未解决：需要原崩溃时的开发服务 stderr、可触发的最小源文件/资源和编辑序列，以及实际宿主 Node/Joplo 版本与启动参数，才可定位原 OOM retaining path。当前只能确认这些有限失败负载未重现原崩溃，不能宣称失败编译的内存已经有界。

不要仅凭 `join(...).slice(...)` 代码形状推定根因，或提高堆限制掩盖问题。宿主接管、守护进程或每项目独立进程改变生命周期与资源模型，需另行确认；本修复不引入这些架构。常规修复可独立交付，调查数据不构成关闭 #121 的依据。
