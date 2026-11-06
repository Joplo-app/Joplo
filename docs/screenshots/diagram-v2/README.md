# D69 改造前后对比：examples/agent-arch

用 `npx joplo render`（导出组件装在 JOPLO_HOME）在 1280×800 舞台、sketch 主题下截图。`-before` 是 0.2.7（浏览器 dagre 布局 + D47 聚焦布局），`-after` 是 D69（编译期 ELK 布局、分组带图标与色调、取景保留上下文）；`-new` 是新增的时序图、状态机和界面取景。

| 场景 · 步骤 | 改造前 | 改造后 | 看什么 |
| --- | --- | --- | --- |
| A happy #3 额度预检 | [before](a-happy-03-precheck-before.png) | [after](a-happy-03-precheck-after.png) | 前：Biz Server 与 Billing 被挪到中央拼成小图；后：节点原地不动，镜头带上“控制面”“计费”两个分组 |
| A happy #7 端侧读文件 | [before](a-happy-07-read-files-before.png) | [after](a-happy-07-read-files-after.png) | 前：三个节点散开再重排，看不出端侧执行器属于用户设备；后：“用户设备 / AWS / 控制面 / 大脑”标题都在画面里，经过的分组高亮 |
| A happy #12 用量入账 | [before](a-happy-12-usage-before.png) | [after](a-happy-12-usage-after.png) | 异步链路 brain → SQS → Billing 原地点亮 |
| A tour #4 大脑 | [before](a-tour-04-brain-before.png) | [after](a-tour-04-brain-after.png) | 逐段出现时已有元素不动 |
| A tour #7 全景 | [before](a-tour-07-overview-before.png) | [after](a-tour-07-overview-after.png) | 分组色调与图标：一眼看出业务域；标签进布局不再压线 |
| A quota #3 预检失败 | [before](a-quota-03-fail-before.png) | [after](a-quota-03-fail-after.png) | 失败只标红终点所在的“计费”分组 |
| A approval 用户拒绝 | [before](a-approval-deny-before.png) | [after](a-approval-deny-after.png) | 失败的一段连同“用户设备”分组标红 |
| A client_offline #8 超时 | [before](a-offline-08-timeout-before.png) | [after](a-offline-08-timeout-after.png) | 同上 |
| A usage_retry #2 | [before](a-usage-retry-02-before.png) | [after](a-usage-retry-02-after.png) | 重试链路 |
| B happy #5 大脑推理 | [before](b-happy-05-brain-before.png) | [after](b-happy-05-brain-after.png) | 前：Biz → 大脑 → Bedrock 被拉到中央拼成小图，周围全是淡掉的碎片；后：原地点亮，“控制面”“大脑”分组可见 |
| B happy #9 make_sheet | [before](b-happy-09-make-sheet-before.png) | [after](b-happy-09-make-sheet-after.png) | 4 个节点的 trace：取景容纳全部节点和各自分组 |
| B tour #5 手都在云端 | [before](b-tour-05-hands-before.png) | [after](b-tour-05-hands-after.png) | 多节点镜头不再重排 |
| B quota #3 预检失败 | [before](b-quota-03-fail-before.png) | [after](b-quota-03-fail-after.png) | 同 A |

新增（方案 A）：

| 截图 | 看什么 |
| --- | --- |
| [调用时序 #3](a-calls-03-task-infer-new.png) | Sequence：trace 两条消息，镜头带上两端参与者头部；已走过的行变为完成 |
| [调用时序 #8](a-calls-08-async-new.png) | `par` 片段里的异步入账 |
| [调用时序 #9 全景](a-calls-09-overview-new.png) | 参与者按业务域分组、消息编号、返回虚线 |
| [任务状态 #8](a-approval-08-lifecycle-new.png) | StateMachine：当前状态“等待用户确认”，取景带上复合状态“执行中” |
| [任务状态全景](a-approval-11-lifecycle-overview-new.png) | 起点圆点、终态双线、复合状态 |
| [客户端回答](a-happy-11-ui-framing-new.png) | 界面元素取景：保留所在面板，不再放大到只剩一张卡片 |
