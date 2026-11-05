# ADR-0001：M0 架构、项目契约与模块边界

> 历史 ADR，已被 [0002](0002-hugo-like-authoring.md) / [0003](0003-demo-model.md) 取代；仅供查阅，不作为当前用法。

- 状态：已采纳（2026-11-05）
- 依据：`Joplo-PRD-v0.1.md`、`DECISIONS.md`（D10–D20）

## 决定

1. **语言与仓库**：TypeScript 单仓库（pnpm workspace），Node ≥ 22。用 `tsx` 直接运行 TS 源码，M0 不做构建产物。
2. **唯一权威源**：`project.joplo.json`，结构由 `packages/core/src/schema.ts`（zod）定义，`schemaVersion: 1`。对象按 ID 归一化存放。不另外维护可自由修改的 TSX 作为第二权威源。
3. **创作方式**（D18）：画面是声明式节点树，只能使用 `catalog.ts` 中的组件类型，只解析不执行。属性可以写字面量，也可以写 `$ui.x` / `$data.x` / `$inputs.x` 形式的整值绑定。条件只允许受控操作（truthy / eq / in / and…），不允许 `eval`。目录里没有的组件用 `Custom`，M0 渲染为带说明的占位框。
4. **播放器**：`packages/core/src/player.ts` 是纯函数状态机。手动体验、逐步查看、自动播放、回放校验和截图全部通过它推进状态。
   - 位置语义：position 0 是初始状态，k 是执行完前 k 步之后的状态。
   - “上一步”通过从初始状态重放实现。
   - Toast 只保留最近一步产生的。
5. **渲染栈**（D18、D20）：
   - React + Vite + Tailwind；shadcn/ui 组件做实现底座。
   - 默认手绘主题：Rough.js 描边加手写字体，种子由元素 ID 派生，保证截图稳定。可以一键切换成干净线框。
   - Motion 负责动画。演示动画（鼠标轨迹、点击、输入、弹窗、Toast）由运行时根据步骤自动生成，Agent 不写动画代码。
6. **本地服务**：只绑定 `127.0.0.1`，校验 Host；写接口需要 serve 时生成的本地令牌。
   - 画板的“当前选中”写入 `.joplo/selection.json`，不进入修订历史，Agent 通过 `get --scope selection` 读取（D15）。
   - 截图用 Playwright 打开渲染专用路由。
7. **写入**：
   - 整批原子提交，必须带 `expectRevision`，乐观并发冲突时拒绝写入。
   - 幂等键回执存放在 `.joplo/receipts/`。
   - 每个修订的不可变快照存放在 `.joplo/revisions/`。
   - 写锁 + 临时文件 + 原子 rename。
8. **人工确认边界**：受控写入接口不能把规则设为 `confirmed`、不能创建 Decision、不能把评论设为 `resolved`。这些只能来自本地 UI 的人工操作。

## 模块边界与所有权

| 路径 | 职责 | 依赖 |
| --- | --- | --- |
| `packages/core/src/{schema,catalog,player,result}.ts` | 共享契约（只能由协调者修改） | zod |
| `packages/core/src/{store,ops,validate,scope,guide}.ts` | 存储、修订、变更操作、校验、范围读取、工作说明 | core 契约 |
| `packages/cli` | `joplo` 命令；之后接入 MCP | core、server |
| `packages/server` | 本地预览服务、渲染截图（Playwright） | core、web 构建产物 |
| `packages/web` | 方案工作区：渲染器、演示、审阅、选中 | core（浏览器端只用 schema、player、catalog） |

## 后果

- Agent 不需要学习新的组件名，但能表达的东西受组件目录限制。目录覆盖不到的界面用 `Custom` 兜底，具体限制记录在已知限制中。
- 第一版只支持线性场景，分支通过拆成多个场景来表达。条件分支和输入驱动分支以后再做。
- 依赖的许可证与版本记录在 `docs/dependencies.md`，由实现者补全。
