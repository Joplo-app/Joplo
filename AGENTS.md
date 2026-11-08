# AGENTS.md

本文件适用于整个 Joplo 仓库。默认使用简体中文沟通；用户的明确要求优先。

## 功能变更必须同步 Joplo 技能

每次新增、修改用户可见功能，或修复会改变使用方式的行为，都要在**同一个 PR** 中及时更新 Joplo 随产品提供的 skill。技能更新是功能完成的一部分，不留给后续任务，也不能只把经验留在聊天记录里。

技能不仅要告诉 Agent 有什么命令，还要帮助它在实际任务中正确使用：何时使用、如何开始、如何判断成功、常见失败如何恢复，以及哪些边界不能误判。根据这次功能变更补齐相关内容，不机械复制一份完整操作手册。

## 把实践经验变成可复用的指导

- 用户反馈、调试结论和真实使用中的踩坑，应提炼成能让其他用户和 Agent 受益的用法、示例或最佳实践。
- 写清触发条件、正确做法与原因。例如：后台命令输出不等于 Agent 自动收到通知；评审期间需要持续读取、先回执再处理，不能只启动后台进程就结束响应却声称仍实时接收。
- 区分已验证行为、实现限制和待决定事项。不要把某次任务的临时方案或用户个人偏好无条件推广成通用规则。
- 不把真实会话 ID、个人路径、凭证、私人反馈或其他任务专属数据写进可分发技能。示例使用可替换的参数，并说明参数从哪里取得。
- 指导应尊重用户已经授权的范围：确认方案不等于反馈已实现，也不自动授权上传、发布或其他无关操作。

## 做示例时，好的实践与新范式也要沉淀进技能

做任何 Example（`examples/` 下的示例，或为用户制作的任何演示项目）时，凡是发现了好的实践、新的范式（新的画面手法、组织方式、叙事结构）、踩过的坑，或为此修复了 Joplo 的问题，都要在**同一个 PR** 里写进 Joplo 技能，不只留在示例代码或聊天记录里。

- 写进 `packages/core/src/guide.ts` 的对应主题（叙事进 story，画面与动效进 demo，焦点进 focus，组件进 components，诊断进 check）；主题范围变了就同步 `SKILL_TOPICS` 的简介，再运行 `pnpm skills:build`。
- 写成可复用的做法：什么情况下用、怎么写、为什么这样做、常见错误是什么。不写示例专属的数据、文案、人名或素材。
- 交付示例时向用户说明这次沉淀了哪些条目；没有新东西可沉淀时也说一声。

## 技能的权威来源与生成方式

- `packages/core/src/agent-skill.ts`：官方 `joplo`、`joplo-feedback` 技能和安装到项目的 `AGENTS.md` 托管段的唯一模板。
- `packages/core/src/guide.ts`：`joplo skill <topic>` 的版本对应使用指南。需要更多条件化细节时优先放到合适的主题，保持技能入口易发现、易读取。
- `skills/*/SKILL.md`：生成产物。修改模板后运行 `pnpm skills:build`，不要只手改生成文件。
- 新增或调整主题时，同步 `SKILL_TOPICS`、相关主题链接、技能路由、README 和 CLI 文档。命令、参数、事件、退出码与实现保持一致。
- `joplo skill install` 与仓库官方技能应逐字一致；保留安装器对用户修改的保护，不用 `--force` 掩盖差异。

## 合入前检查

1. 运行 `pnpm skills:build` 和 `pnpm skills:build --check`。
2. 实际运行受影响的 `pnpm joplo skill <topic>`，检查命令与示例可理解、相关主题存在。
3. 运行适合本次改动的类型检查和测试；技能相关验证包括 `packages/cli/test/skill.test.ts`、`packages/core/test/guide.test.ts` 和 `scripts/test/skills.test.ts`。安装、更新及生成一致性不能退化。
4. PR 描述说明更新了哪些技能入口，以及沉淀了哪些可复用经验。功能已实现但技能未同步时，不应标为完成。

## 发布

遵循 [docs/release.md](docs/release.md)：六个包统一版本，版本变化后重新生成技能，检查通过后合并，再按 tag 流程发布并验证 registry。发布时检查技能是否随相同版本正确安装，不能只验证工作区中的源码。

## Joplo 自身的设计项目

`examples/joplo/` 是统一的自设计项目。新增自身功能时，在其中新增或迭代原生 Feature/Option/Scenario，不再创建平行的 `examples/joplo-<feature>` 项目。历史证据与边界见 `docs/self-design/EVIDENCE.md`；保留稳定 feature IDs，真实备选与未决项不因公开展示而伪装成已批准。

公开设计过程要主动整理为可见画面与场景。普通 build 只包含 picked options，并剥离规则、问题、取舍等创作信息；不可为展示过程直接公开私有 review manifest。历史重建须有来源且显式标注；现存 `_v1` 归档继续作为证据。

`Self-design preview` 在成功 CI 后自动发布同仓 PR 差异及 main 固定分享。维护 `.github/workflows/self-design.yml` 时遵循 `docs/self-design/CI-CONTRACT.md`：工具固定为可信 workflow SHA，PR 作者模块只在无发布凭证的独立 runner 构建，发布任务只读静态产物。Key 仅放 main 限定的 `joplo-design-publisher` environment；不要改成仓库级 Secret、执行 PR 工作流或伪造空基线。自动设计分享不等于 npm 发行。
