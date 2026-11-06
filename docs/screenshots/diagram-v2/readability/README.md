# 可读性修复前后对比（D69 补充）

用户看了 v2 的效果：“在屏幕上几乎看不到到底是谁调用了谁”。`-before` 是 9522af2（上→下细长条、出线并行、所有连着焦点的线都加粗），`-after` 是这次修复（按舞台比例自动选方向并压缩层次、连线间距与端口分散、标签贴在自己的线上、只有本步调用突出）。都用 `npx joplo render` 在 1280×800 舞台截图。

| 截图 | 本步调用 | 改造后能看出 |
| --- | --- | --- |
| [before](a-happy-03-precheck-before.png) / [after](a-happy-03-precheck-after.png) | Biz Server → Billing「① 额度预检」 | 只有这一条蓝色粗线，从 Biz Server 直接下到左边“计费”里的 Billing；别的出线变浅 |
| [before](a-happy-07-read-files-before.png) / [after](a-happy-07-read-files-after.png) | 大脑 → Biz Server → 端侧执行器 | ⑤ 工具调用回到 Biz Server，再「下发端侧工具」上到用户设备 |
| [before](a-happy-09-make-sheet-before.png) / [after](a-happy-09-make-sheet-after.png) | Biz Server → 云端沙箱 | 「下发云端工具」一条线到右边“云端的手” |
| [before](a-happy-12-usage-before.png) / [after](a-happy-12-usage-after.png) | 大脑 → SQS → Billing（异步） | 用量事件进 SQS，「入账（幂等）」贴在短线旁边，不再盖住箭头 |
| [before](a-quota-03-fail-before.png) / [after](a-quota-03-fail-after.png) | Biz Server → Billing 失败 | 红色虚线与标红的“计费”分组 |
| [before](a-tour-06-billing-before.png) / [after](a-tour-06-billing-after.png) | 镜头对准 Biz Server 与计费分组（没有 trace） | 只突出焦点之间的两条线 |
| [before](a-tour-07-overview-before.png) / [after](a-tour-07-overview-after.png) | 全景 | 业务域并排（计费 / 大脑 / 云端的手在控制面下面），不再是细长条 |
| [before](a-approval-09-deny-before.png) / [after](a-approval-09-deny-after.png) | Biz Server → 端侧执行器 失败 | 失败的一段与“用户设备”标红 |
| [before](b-happy-09-read-s3-before.png) / [after](b-happy-09-read-s3-after.png) | 大脑 → Biz Server → 云端沙箱 → S3 | 三段调用连成一条蓝线 |
| [before](b-happy-11-usage-before.png) / [after](b-happy-11-usage-after.png) | 大脑 → SQS → Billing | 同 A |
| [before](b-tour-06-billing-before.png) / [after](b-tour-06-billing-after.png) | 镜头对准计费分组 | 同 A |
