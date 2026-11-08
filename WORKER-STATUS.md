# J1 · Feature diff worker

状态：J1 已实现，本地验证通过，待协调者集成与 Cloud 实际路由联调。基线 `9163968`，分支 `feat/pr-feature-diff-core`。不部署、不发布、不发送外部消息。

## 内部模块与不变量

- Kit `flow.key(key)` 为前一步指定稳定身份；Core 保留原序号 `id`，另存可选 `key`，同场景重复 key 编译失败。
- Core `feature-diff.ts` 拥有版本化公开 manifest、功能/场景匹配、保守步骤匹配和影响检测。仅消费 publish IR；序号 id 不作身份。重复候选保留 `uncertain`，不猜测配对。画面、初始状态、主题等变更单独保留原因。
- Server 从两份真实静态 build 读取 publish IR，构建根 viewer、`before/`、`after/`、`feature-diff.json`；复用发布播放器的 ready/position/goto 协议恢复完整状态。新增/删除单栏，修改双栏；显式无变化、不兼容、未确定匹配状态。
- CLI 分离构建与带凭证发布：本地 diff 只读静态产物；prepare 固定基线；publish 只读产物，不加载项目、执行脚本或构建。沿用现有上传安全验证、内容寻址、finalize，不替换旧 Share。
- 文档、技能模板、生成技能及测试同批交付。双方 wire 字段保持 CONTRACT v1。

## CLI 计划

```sh
joplo build before-project --out before-site
joplo build after-project --out after-site
joplo diff before-site after-site --out diff-site --base-sha <40hex> --head-sha <40hex>
joplo diff prepare --pr <number> --repo owner/name --base-sha <candidate-merge-base> --sha <head> --out comparison.json
joplo diff publish diff-site --prepared comparison.json --pr <number> --repo owner/name --sha <head>
```

prepare 输出必须先交给无凭证构建任务，再按返回 baseSha 构建基线；publish 校验 artifact 与 prepare 来源一致。缺失基线失败，不伪装新增。安全 CI 示例将展示分离 runner、固定可信 CLI、fork 跳过。

## 里程碑

- 已读取仓库 AGENTS、协调 PLAN/CONTRACT/PROGRESS、原型 README/DECISIONS、现有 schema/build/share/播放器入口。
- 已尝试 Pen：当前画布属于其他工作区，不修改该文件；待在本工作区建立设计或记录不可用原因。
- 接口疑问：暂无；Cloud 联调尚未开始。

### 里程碑 1 · 实现接通

- Kit `.key()`、编译器稳定身份、Core 公开 manifest 与保守匹配已实现。匹配可靠性首轮 12 项通过，包括重复次数变化、稳定 key 重排、effects、初始状态、画面、主题、角色和完整状态恢复。
- Server 双版本 bundle 与真实播放器同步壳、CLI 本地 diff / prepare / publish 已接通。发布复用现有内容寻址上传和 finalize；无凭证构建与带凭证发布分离。
- 当前类型检查通过；既有 CLI 回归 219 项中 218 项通过，一项上传日志格式回归已修正，待复跑。
- Pen 接口对新文档 URI 返回当前其他工作区的变量，未创建目标文件；无法确认隔离，不编辑该画布。实现沿用现有黄/灰 UI tokens 与播放器，新增状态仅在本工作区实现和浏览器验证。
- 真实 fixture 正在生成，目录 `scratch/feature-diff/bundle`；可分发 manifest 将写入 `docs/feature-diff/manifest.fixture.json`。

### Cloud 错误原因对齐（不改变 CONTRACT v1 wire 字段）

客户端将保留既有 `{ code, data/details }` 错误 envelope。需要 C1 明确 stale head、closed PR、App missing、stale generation 对应的实际 code / reason；不能只把它们显示为通用 BAD_REQUEST/CONFLICT。当前不假定新的字段名，也不退化普通 share。上传 comparison 字段与 CONTRACT v1 完全一致。

### 里程碑 2 · 可共享产物已落盘

- `pnpm exec tsx scripts/feature-diff-fixture.ts` 已成功实际构建两个版本和 diff bundle。
- Cloud 可读取 `docs/feature-diff/manifest.fixture.json`；完整本地静态包为 `scratch/feature-diff/bundle/`（忽略产物，不入 Git）。fixture 来源 SHA 为公开占位 `111…` / `222…`，不伪装真实提交。
- manifest v1 公开字段：`kind`, `formatVersion`, `base.sha`, `head.sha`, `status`, `reasons`, `summary`, `scenarios[]`；每个步骤的 before/after 是实际 id + 1-based position 或 null，match 明确 key/content/action/none/uncertain。Cloud 只需要读取 summary 和文件摘要，不复制此业务 schema。
- fixture 包含单人邀请修改、批量邀请新增、旧流程删除、未变化场景、重复重试 uncertain。查看服务仅本机 `http://127.0.0.1:4189`，未上传。

### 兼容性审查 · 公开 IR 与 Cloud Agent Reader

已核对 C1 `packages/share-contract/agent.ts`：`publicPlaybackSchema.project` 首先以 0.2.10 `Project.refine(...)` 严格校验，然后才投影；因此 Step.key 确实会导致新普通分享不兼容，不能靠后续 `.strip()` 修复。

建议与实现方向：保留 Core 内存 IR 的可选 key 和旧 id；`publishPayload` 从 `joplo-ir.project.scenarios[].steps[]` 移除 key，另用独立 `joplo-step-keys` JSON script 保存 `{formatVersion:1,scenarios:{scenarioId:{stepId:key}}}`。diff 读取它时校验所有引用、格式和重复键，再仅在内存恢复 key。不改 Cloud transport 字段、不放宽旧 schema、不要求 Cloud 升级 Core 才能读普通分享。将用实际 0.2.10 Reader 校验新静态产物。

根 diff viewer 刻意没有 `joplo-ir`（它不是单个 Project）。本轮不声称 Cloud Agent content negotiation 已完整支持 diff：根业务数据入口是 `feature-diff.json`，两份发布播放器在 `before/`、`after/`。Cloud Reader 对根 comparison 的协商返回/提示由 C1 明确；不能把根 viewer 解析失败当普通项目无变化。

### 错误契约已对齐

已读取 C1 CONTRACT-NOTES，按现有 code/HTTP 组合保留 `PR_APP_MISSING`、`PR_CLOSED`、`PR_STALE_HEAD`、`PR_STALE_GENERATION`、`PR_MISMATCH`、`PR_UNAVAILABLE`，使用本地可信恢复提示，不回显远端错误 message。repo 统一小写。相关端到端 CLI 错误测试已通过；此前错误码问题关闭。

### 里程碑 3 · 旧 Reader 兼容已实测

- 新版 before/after fixture 已重建，`joplo-ir.project` 不含 Step.key；独立 `joplo-step-keys` 为 v1，每份包含 1 个 keyed 场景。
- 使用实际 pinned npm `@joplo-app/core@0.2.10` 的严格 `Project.safeParse` 读取 **两份真实 build**：均 PASS。新增测试依赖 alias `@joplo-app/core-legacy` 仅在 server devDependencies；版本化 identity 的引用与重复验证测试一并覆盖。
- `scratch/feature-diff/bundle/` 与 `docs/feature-diff/manifest.fixture.json` 已更新，C1 请使用此新 bundle，不使用此前直接带 Step.key 的旧产物。
- 已实际运行 `pnpm joplo skill diff`、`pnpm joplo skill publish`；技能模板、生成入口、README、CLI、CHANGELOG、安全 CI 示例已同步。
- Agent 限制按协调决定修正：只承诺根 HTML viewer 和直接 manifest；Cloud Markdown/JSON 协商及 before/after 路由支持待 C1 路由实测，不假定可读。

### 播放器兼容补充

浏览器验证发现旧播放器 `goto(0)` 会显示场景封面，遮挡初始状态；这不是状态重建失败，但会误导初始状态对比。当前播放器将以 `diff=1` 隐去初始封面并保持静音。CI 示例需用同一固定新 CLI 构建两份源码，不能让 baseline checkout 的旧 CLI 决定播放器版本。将为构建加入可校验的 diff 播放能力标记；缺少能力的旧静态产物显示不兼容并要求重建，不伪称已展示初始状态。不改 Cloud transport；旧作者项目/序号 ID 仍兼容。

### 里程碑 4 · 回归与本地 pack

- `pnpm typecheck`、`pnpm --filter @joplo-app/web typecheck` 通过。
- `pnpm test` 全仓 **98 个文件、1231 项全部通过**，包括匹配可靠性、实际 pinned 0.2.10 Reader、身份元数据、CLI prepare/upload/finalize、全部 PR 错误与技能一致性。
- `pnpm build:packages`、`pnpm release:pack` 通过；`release/` 包含六个 **0.2.12** 本地 tarball，未改版本、未发布。
- `pnpm release:smoke --keep` 通过：仓库外从六个 tarball 安装；新增 smoke 已实际运行 packed `skill diff` 与 packed `diff`，确认两版、runtime、manifest、词典存在，且没有源码转译 helper／工作区路径。其余 init/build/dev/review/selection 原有冒烟也通过。
- 浏览器在与 Cloud 同样的 opaque sandbox CSP 下验证：插入后旧 2 ↔ 新 3、完整上下文、新增/删除单栏、uncertain、未变化展开、独立移动后 realign、12 秒加载失败和 reload 恢复、390px 无水平溢出；运行时异常 0。
- UI 词典与 CLI 英文输出分离，新增差异壳十语言覆盖测试。初始位置不再显示场景封面，`diff=1` 禁用旁白控件；旧运行时缺少能力标记时返回明确不兼容，要求用同一固定 CLI 重建两版源码。
- CI 示例已改成可信默认分支的 workflow_run，发布 key 放受默认分支限制的 environment；prepare / uncredentialed build / publish 分离 runner，静态产物与可信 receipt 分别下载，不执行 PR 源码于有 key 的任务。

### 最终交付检查与边界

- `actionlint docs/feature-diff/ci.example.yml` 退出 0。模板必须放默认分支，配置受分支保护的 `joplo-publisher` environment 和固定 CLI 版本后启用；没有在本任务启用远端工作流。
- 额外真实 CLI build 验证 `invite.main.initial`：旧状态 `Old initial state` 与新状态 `New initial state` 在 0/1 位置直接可见，封面和旁白控件均不存在；浏览器异常 0。手机端滚动后新版预览画面/控件实际截图已复核。
- fixture 最终增加 `Initial status` 场景，覆盖纯初始状态差异。最新 `docs/feature-diff/manifest.fixture.json` 与 `scratch/feature-diff/bundle/` 包含六个场景（五个默认可见、一个未变化）。
- 所有代码只修改本 worktree；基线确认 `9163968b00395676d23380091206272e01403b32`。无部署、merge、npm publish、真实 PR 评论或其他外部消息。
- C1 联调请复制最新整个 bundle，保留 before/after HTML 内的独立 identity 与 player capability 标记；上传字段保持 CONTRACT v1。当前 CLI 的端到端发布验证使用本地 HTTP server fixture，生产 API 和评论由协调者/C1 验收。
- Cloud Agent 内容协商的根／before／after 支持范围由 Cloud 实际路由决定，本 worker 不宣称已支持。旧作者项目可无 key；旧静态播放器需同一固定新 CLI 重建，不绕过兼容检查。
- `release/` 六个本地 tarball 可用于集成，版本仍为 0.2.12，不代表 registry 已发布这次功能。截图和日志只留 `scratch/feature-diff/`，不进入分发包。

### C1 联调证据回读

已只读 C1 最终状态：独立 identity 版本的真实 bundle 已通过其一次性 Postgres/MinIO checksum PUT → finalize 全文件/hash 验证，以及 Worker 实际路由（245 测试）：根 HTML 200，根 Markdown/JSON 422 IR_UNAVAILABLE，before/after Markdown/JSON 200（单版资源），过期后 410。因此文档已按实际证据收窄／明确协商范围，不宣称根跨版本 Agent 模型受支持，也不声称生产已部署。C1 当次验证 fixture manifest hash 为 `730cfd5429c2e76ba59455ab141cba6cb276ae138cb3a94d8dc0209822fba546`；本 worker 最终 fixture 追加初始状态场景及能力标记，最新摘要/hash 见下次输出，可供协调者最终复扫。

Final fixture: 6 scenarios; sha256=e6accf8aca5d1ffb6a30fd6db42f40678930abdd1a4ba62fab535ae564bad9b4; summary={"added":["Invitations / Batch invitation"],"modified":["Invitations / Single invitation","Invitations / Initial status","Invitations / Repeated retry"],"removed":["Invitations / Legacy invitation"]}

### 最终提交门禁

- 提交前补齐 mixed identity 迁移：只在一侧有 key 时允许唯一 content/action 匹配；不同显式 key 不配对；重复候选仍全部 uncertain。新增测试未降低已有匹配断言。
- 最后全仓 `pnpm test`：98 文件 / **1232 项通过**；随后新增 future IR + future identity 的不兼容边界测试，`pnpm test packages/core/test/feature-diff.test.ts packages/server/test/feature-diff.test.ts packages/cli/test/feature-diff.test.ts` **36 项通过**。
- 最终 `pnpm typecheck`、web typecheck、skills build/check、两个实际 skill 命令、actionlint、node --check、git diff --check 通过。最终 `pnpm release:pack` 再次通过，六包反映最终源码与指南。
- 本地 conventional commit：`feat: add feature diff bundles and isolated PR publication`（具体 SHA 见本分支 HEAD / worker 完成 envelope）。
