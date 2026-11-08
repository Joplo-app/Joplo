# 用 Joplo 设计 Joplo

## 已确认目标

把分散的自设计项目收敛为 `examples/joplo/`。它是 Joplo 自己持续维护的真实产品设计项目：每个 Feature 保存问题、方案、可回放交互、取舍与当前边界，让用户直接看到我们怎样用 Joplo 迭代 Joplo。不是另写一部使用教程，也不补造历史反馈或审批。

## 功能目录

保留稳定 ID：`home`、`player`、`views`、`frames`、`npm`、`skill`、`review`、`share_scope`、`voice`。补齐有源码和决策证据的 `workbench_origin`（最初三套工作台）、`authoring_model`（功能建模）、`feature_diff`（PR 功能差异）。历史方案与当前实现边界明确区分；缺少记录就说明缺少记录。

每个功能仍使用原生 Feature / Option / Scenario，不建立另一套业务模型。公开播放中的设计过程仅使用主动整理的公开说明，不放入私有评审记录。未选择的方案继续留在源码与本地看板中；需要公开呈现的取舍要显式建模，不能依赖 publish 会暴露私有字段。

## 并行分工

| Task | 范围 | 状态 |
| --- | --- | --- |
| E1 | 真实证据目录 + workbench_origin | completed |
| M1 | 迁移既有九个 Feature、对应路由与布局 | completed |
| N1 | authoring_model、feature_diff | completed |
| I1 | 统一入口、公开设计过程、文档/技能/测试引用、集成与浏览器验收 | completed |

共享一个独立 worktree，按不重叠文件分工。保留 `_v1` 历史归档及非 Joplo 产品示例，不覆盖其他工作区未提交的设计稿。

## 验收

- 一条命令打开统一项目；12个原生Feature可发现，原有方案/场景迁移完整。
- 观众能理解每个功能的设计问题、实际方案、依据与边界；作者可以继续修改原生Feature。
- check、类型/技能一致性、相关回归、全仓测试和静态build通过。
- 浏览器逐功能核对公开设计过程与主要交互，验证本地/公开的边界和无未建模的成功假象。
- 更新官方skill模板/guide、生成技能、README、CHANGELOG、测试/脚本引用，避免旧目录残留为活跃入口。

## 集成结果

已完成统一项目与本地预览；完整验证见 [VERIFICATION.md](VERIFICATION.md)。后续用户授权配置 PR 自动预览和 main 固定分享，已创建[公开设计过程](https://joplo.app/s/nZT1VP67LU/)；工作流边界见 [CI-CONTRACT.md](CI-CONTRACT.md)。代码提交与 PR 不代表 npm 已发布。后续新增自身功能继续迭代同一项目。
