# 自设计项目集成验收

基线：`d566856`。日期：2026-11-08。证据以实际命令与画面为准。

## 迁移与公开内容

- `examples/joplo/`：12 个 Feature、20 个原生 Option、99 条本地 Scenario。
- 原五项目的 9 个 Feature、14 个 Option、65 条 Scenario ID 全部保留；回归夹具固定原始 ID 清单，检测今后误删。
- 保留 `_v1` 原始归档；原评审 README 移入历史材料，注明旧命令与状态不能代替当前实现。
- 普通静态构建：12 个选定 Option、67 条 Scenario、122 文件，约 2.55 MB。检查实际 HTML 中的公开 IR，确认没有 rules/cases/issues、私有取舍字段、规则引用或未选 Option。
- 公开叙述来自主动整理的场景，不读取私有评审清单。首轮仅做本地 build；后续按明确授权创建固定分享并接入自动发布，见文末。没有发布 npm。

## 命令结果

| 检查 | 实际结果 |
| --- | --- |
| 新 worktree `pnpm install` | 通过 |
| `pnpm joplo check examples/joplo --format json` | 0 error；12 warning / 24 info 与原五项目合计一致 |
| `pnpm exec tsc -p examples/joplo/tsconfig.json` | 通过 |
| `pnpm typecheck` | 通过 |
| `pnpm --filter @joplo-app/web typecheck` | 通过 |
| `pnpm skills:build` / `pnpm skills:build --check` | 生成后逐字一致 |
| 实际 `pnpm joplo skill authoring` / `review` | 可输出更新后的指导 |
| 最终 `pnpm test` | 101 文件 / 1248 项通过 |
| `pnpm joplo build examples/joplo --out <temporary-output>` | 通过 |
| `git diff --check` | 通过 |

保留的检查提示为旧原型的 `CASE_NOT_COVERED`、`OUTCOME_MISMATCH` 和 `PENDING_AI_ASSUMPTION`；没有为消除提示而伪造覆盖或人工确认。新增的三项 Feature 与设计回放没有新增这些提示。

## 实际画面与交互

- 原九个 Feature 各检查开场、代表操作、收尾，共 27 张实际渲染图；另检查最早工作台、创作模型、功能差异的关键画面。
- 浏览器中实际操作历史 A/B/C 切换与规则标注，确认“历史重建”和 D39 后续替代说明可见。
- 公开播放器中实际点击创作模型的重新发送，成功状态出现，失败表单关闭；这仍是明确标注的场景模拟。
- 功能差异回放在仅旧版回执到达时保留等待状态，播放按钮为 `aria-disabled`，不误用原生 `disabled` 属性判断模拟控件。
- 公开播放器的设计收尾完整可读；构建后的内容没有私有作者字段。

## 导出遮挡修复

画面复核发现 RenderApp 的幕布与作者画面直接并列，高 z-index 的 Terminal / Diagram 会盖住卡片文字。正常播放器已有幕布隔离，未复现此问题。

导出路径现在分别隔离舞台与幕布的堆叠上下文，保留 passive、固定尺寸、手机外框和字幕。新增实际 Chromium 回归：修复前 1 项失败、2 项通过；修复后全部通过。高 z-index 终端／图表、固定尺寸／外框、手机封面、非卡片步骤均覆盖。重新检查 views/npm/review 六张开场和收尾图，文字无遮挡，0 渲染告警、0 页面异常。

少量保留的旧原型仍有长标题省略，以及舞台底部辅助说明／作者代码块局部裁切；主操作和状态可见。这些属于历史稿的既有表现，未把它们当成当前产品界面的视觉验收结果。

## 自动发布集成（2026-11-08）

- 固定公开分享 `dn1MWCcnDW` 已首次发布，version 1、无到期时间；浏览器验证首页包含 12 个 Feature，并回放功能差异的对齐等待场景。公开 Markdown 路由也返回正确的版本与功能导航。
- GitHub environment `joplo-design-publisher` 只允许 main；专用 `shares:publish` Key 已写入 environment Secret，固定 Share ID 写入仓库 variable。未复制设备会话到 Actions。
- 主站发布器 31 项 HTTP/CLI 测试通过，包括固定替换、真实 PUT/finalize、每次 finalize 重试前检查、公开 IR、重复私有 IR、文件边界与错误脱敏。独立审查用真实产物插入第二个 review IR，在认证前拒绝。
- 新脚本纳入根 `pnpm typecheck`；技能生成与一致性检查通过，实际 diff guide 可用。全仓 102 文件 / 1279 项通过；workflow 的 actionlint 通过。
- 随后新增的事件筛选专项 49 项通过；与发布器合计 80 项再次通过。两个不含 node_modules 的独立项目目录均由可信源码 CLI 构建成功（每版 122 文件），真实 diff 返回 `unchanged`，没有依赖 PR 自带工具或安装步骤。
- 公共播放器控制台有 Cloudflare RUM 被既有 `connect-src 'none'` 拒绝的提示；播放器及资源正常，本次没有放宽 CSP。

- 合入 PR #14 后 main CI [42480531987](https://github.com/Joplo-app/Joplo/actions/runs/42480531987) 的远端 102 文件 / 1327 项通过，另有 1 文件 / 1 项按平台跳过；发布冒烟通过。首次自动发布发现设备会话与 CI Key 账号不一致，固定链接跨账号覆盖返回 NOT_FOUND；随后用专用 Key 所属账号重建固定链接并修正 variable，未扩大权限。
- 临时 PR #15 的自动流程 [42480773753](https://github.com/Joplo-app/Joplo/actions/runs/42480773753) 全部成功，Joplo App 自动创建[预览评论](https://github.com/Joplo-app/Joplo/pull/15#issuecomment-6721552697)：固定 base `1a72004`、head `0672b4c`，准确报告一个修改场景。
