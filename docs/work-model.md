# 作品模型：现行实现契约（D102 / D103）

决策见 `DECISIONS.md` D102、D103。本文合并两轮契约：创作、内部 IR、界面、命令行与发布都使用同一个作品模型。没有用户，不保留旧创作入口、旧文件布局或旧 IR 的读取别名；发现实现与本文冲突时应报告并修正，不能各自推断另一套结构。

## 1. 模型

核心是 **作品 → 切片 → 步骤**：

- **作品（work）**：一个舞台（画面、层级、初始状态）加一组切片；有封面，能进首页。
- **切片（scenario）**：舞台上的一段步骤。内部名继续用 `Scenario`；界面按能力叫“场景”或“章节”。
- **步骤（step）**：一次用户操作或系统事件，以及它造成的可见变化。
- **项目**：作品集。发布时可以只发其中一件。

其余是叠在作品上的能力，可以组合，引擎不为“形态”分支：

| 能力 | 含义 | 常见用法 |
| --- | --- | --- |
| 功能（feature） | 把几件互为备选的作品放在一起做设计评审：情况、覆盖、规则、待决问题、选定。功能下面的一件作品在界面上叫“方案” | 功能演示 |
| 接续（sequencing） | 切片之间独立（缺省 `independent`），或按顺序、默认接着上一章结束画面的章节（`linear`） | 影片用 linear |
| 草稿（draft） | 独立作品留在本地，不进发布与分享 | 重做一版时保留旧版 |
| 封面与首页 | 所有作品都有，不是可选能力 | 全部 |

IR 没有“形态”字段。“影片”“功能演示”是常见搭配：影片 = 独立作品 + linear；功能演示 = 功能 + 若干作品（方案）。同一项目可以同时有两者。“方案 / option / alternative”只是功能下面作品的界面与文档称呼，不是另一种 IR 容器、创作函数或目录。

新增能力的标准：只有创作结构或外围流程不同才加；3D、代码、媒体等内容差别交给插件。互动小说 / 游戏的观众选择分支与跨切片持久状态尚未实现，不能把一次本地自由体验误认为持久状态。

## 2. 创作 API 与文件布局

`work()` 是唯一的作品入口；切片用 `flow()` 或 `chapter()`。创作原语来自 `@joplo-app/kit`，组件来自项目显式启用的插件。项目保留 `package.json` 的 `type: module` 与 JSX tsconfig（starter 使用 `jsx: react-jsxdev`、`jsxImportSource: @joplo-app/kit`）。

```tsx
// works/explainer.tsx —— 独立作品，文件名就是作品键
import { $, work, chapter, narrate, set } from '@joplo-app/kit';
import { Stack, Text } from '@joplo-app/plugin-ui';

export default work({
  title: '请求为什么需要排队？',
  summary: '跟随一个请求看懂队列',
  audience: '第一次接触队列的观众',
  state: { ui: { status: '等待请求' } },
  stage: <Stack><Text>{$.ui.status}</Text></Stack>,
  scenarios: {
    arrival: chapter('请求到达', { expected: '理解请求为什么等待' })
      .system('入队', set($.ui.status, '排队中'), narrate('一个请求加入队列。')),
    finish: chapter('处理完成')
      .system('响应', set($.ui.status, '已完成'), narrate('工作进程处理请求。')),
  },
});
```

```ts
// features/invite/feature.ts —— 功能的 pick 写作品的文件名键，或显式 null 表示未选定
import { feature } from '@joplo-app/kit';
export default feature({
  name: '邀请成员', goal: '在成员列表里完成邀请',
  cases: { happy: { title: '邀请一个成员', expected: '看到邀请已发出' } },
  pick: 'a-modal',
});
```

```tsx
// features/invite/works/a-modal.tsx —— 功能下面的作品，界面称为方案
import { $, work, flow, set } from '@joplo-app/kit';
import { Stack, Text } from '@joplo-app/plugin-ui';
export default work({
  title: 'A · 列表内邀请', summary: '让管理员留在成员列表',
  focus: '入口放在哪', tradeoffs: ['列表需要放下邀请状态'],
  state: { ui: { status: '尚未邀请' } },
  stage: <Stack><Text>{$.ui.status}</Text></Stack>,
  scenarios: {
    happy: flow('发出邀请', { cases: ['happy'] })
      .system('已发送', set($.ui.status, '邀请已发出')),
  },
});
```

### 字段按位置校验

| 位置 | 字段 | 误用时诊断 |
| --- | --- | --- |
| 两处都可用 | `title`、`summary`（必填），`stage` 或 `layers`、`viewport`、`on`、`routes`、`state`、`free`、`scenarios`（必填，可空对象） | 值或结构不合格为 `WORK_INVALID` |
| 只在功能下面 | `focus`、`tradeoffs`、`coverage`、`rules`、`questions`、切片的 `cases`、步骤的 `uses()` | 独立作品误用为 `WORK_FEATURE_ONLY` |
| 只在独立作品 | `audience`、`roles`、`draft`、`order` | 功能下面误用为 `WORK_STANDALONE_ONLY` |

- 位置校验看字段是否显式出现：`roles: {}`、`draft: false`、`order: 0` 仍会触发功能下的位置错误；不是只检查真值。
- `title` / `summary` 分别是标题与一句话简介；功能仍用 `name` / `goal` 描述功能本身。
- `roles` 的键值写法为 `{ me: role('我') }`。功能下面的作品共用功能的角色；不要在每个作品重复声明。
- `stage` 是单层舞台的简写，与 `layers` 二选一；`viewport` 只对 `stage` 生效。`on` 向已有页面插槽添加内容，`routes` 新增作品页面；`free` 是命名的本地反应字典。
- `flow(title, opts)` 定义独立切片；`chapter(title, opts)` 的选项和步骤方法相同，只有默认接续不同：省略 `from` 接声明顺序里的上一章，第一章从初始状态开始；`from: null` 从初始状态重来；`from: '键'` 接指定切片。
- 一件作品全部用 `chapter()` 或全部用 `flow()`，不混用（`WORK_SLICES_MIXED`）。章节标题不要手写编号；界面和 outline 按播放顺序自动编号。
- `works/<key>.tsx`（或 `.ts`）放独立作品；`features/<f>/feature.ts` 和 `features/<f>/works/<key>.tsx` 放功能与它的作品。独立作品键与功能文件夹名共用命名空间，冲突报 `WORK_ID_CONFLICT`。
- 遗留的功能备选目录必须改为 `works`，否则报 `OPTIONS_DIR_RENAMED`；同时统一为 `work({ title, summary })`，不留旧构造器别名。
- 没有路由页面时，编译器合成空白 `/` 页面。其标题是内部标记，不参与显示、翻译，也不出现在界面、大纲或发布站路径列表。作者不需要占位页面。
- 裸目录缺少模块 / JSX 配置时，`check` / `dev` 必须能载入，或给出说明缺什么、如何补齐的诊断，不能只抛加载堆栈。

## 3. IR v3

`SCHEMA_VERSION = 3`。独立作品与功能下面的作品走同一段降级逻辑，不合成假的功能或隐藏作品。

以下结构摘要逐项对应 `packages/core/src/schema.ts`，不是作者直接编辑的格式。所有对象严格解析，未声明字段会被拒绝。

```ts
Project {
  schemaVersion: 3,
  name: string, description: string, theme: string,
  autoFocus?: boolean,
  voiceConfig?: VoiceConfig, voiceIndex?: VoiceIndex,
  mediaAssets?: Record<string, string>, mediaInfo?: Record<string, AudioRegion>,
  i18n?: ContentI18n, plugins?: Record<string, PluginMetadata>,
  themes: Record<string, string>, mode: 'dev' | 'publish' | 'review',
  routes: Record<string, Route>,
  features: Record<Id, Feature>, // 只有真正的功能
  entryIds: Id[],               // 必填，每个条目恰好一次
  cases: Record<Qid, Case>, works: Record<Qid, Work>,
  rules: Record<Qid, Rule>, scenes: Record<Qid, Scene>,
  scenarios: Record<Qid, Scenario>, issues: Record<Qid, Issue>,
}
Feature {
  id: Id, name: string, goal: string,
  roles: { id?: Id, name: string, desc: string, color: string }[],
  constraints: { id: Id, text: string, hard: boolean }[],
  caseIds: Qid[], workIds: Qid[], pick: Qid | null,
  alternatives: Record<Qid, {
    decisionFocus: string;
    tradeoffs: string[];
    coverage: Record<Qid, Coverage>;
  }>,                          // workIds 中每件作品恰好一项
  source?: string,
}
Work {
  sequencing?: 'linear',
  free?: Record<Id, { action: Action, effects: Effect[], source?: string }>,
  id: Qid,                     // 独立：<key>；功能下：<featureId>.<key>
  featureId?: Id, key: Id,
  title: string, summary: string,
  audience?: string,           // 只在独立作品；非空
  roles: Feature['roles'],     // 功能下为空，统一由 rolesOf 继承
  draft?: true,                // 只在独立作品、dev IR
  routes: string[],
  layers: Record<Id, { title: string, sceneId: Qid, role?: Id, icon?: LayerIcon }>,
  source?: string,
}
Coverage {
  status: 'expressed' | 'undecided' | 'missing' | 'not_applicable' | 'excluded',
  scenarioIds: Qid[], reason?: string, basis: 'derived' | 'declared',
}
Scenario.workId: Qid
Scene.workId: Qid | null
Rule.workId?: Qid
Issue.workId?: Qid
Route.addedBy?: Qid             // 仍然是作品 id
```

- schema 默认值：Project.description 为 `''`、theme 为 `sketch`、themes 和实体字典为空对象；entryIds 必填、不补默认。Feature 的 roles/constraints/caseIds/workIds 默认空数组，pick 默认 null，alternatives 必填且键必须与无重复的 workIds 完全一致。Work.roles 默认空数组、routes 默认空数组、layers 默认空对象，未写 sequencing 表示 independent；audience、draft、free 等可选字段不会伪造值。Coverage.scenarioIds 默认空数组、basis 默认 declared。
- 评审信息归功能的 `alternatives`：作者的 `focus` 降级为 `decisionFocus`；`tradeoffs` 与 `coverage` 同样按作品 id 归档。作品不存这三个评审字段。**dev IR 才保留评审值**；publish / review IR 仍为每个 workId 保留一项，但值归空为 `{ decisionFocus: '', tradeoffs: [], coverage: {} }`，不是删除 alternatives 或其键。`Feature` 不存独立作品的受众、草稿或独立标记。
- 切片 id 为 `${workId}.${sliceKey}`：独立作品 `explainer.arrival` 是两段；功能下面 `invite.a-modal.happy` 是三段。画面 id 同理由作品 id 推出，例如独立作品的 stage 为 `explainer~stage`。
- 不靠拆 id 字符串找结构：切片找作品读 `scenario.workId`，作品找功能读 `work.featureId`，切片键只由 `entries.ts` 的 `sliceKey(scenario)` 按已知 workId 计算。
- 统一的 `rolesOf(project, workId)`：挂功能时读功能角色，否则读作品角色。层级的 `role` 引用同一组声明。
- 章节默认接续只在编译期解析一次，写入 `Scenario.from`；`from: null` 时没有该字段。下游只读降级结果。
- **版本规则**：公开载荷（publish / review IR）的结构，只要增、删、改名或改语义，就升 `SCHEMA_VERSION`；读取方按版本号严格解析。只在 dev IR 的字段变化不升版本。

### 首页条目投影（`packages/core/src/entries.ts`）

界面与 CLI 经 `entriesOf` / `entryOf`、`scenariosOf` / `playSequence` 读作品结构，不自己推断容器关系。`featuresOf(project)` 按 entryIds 只取真正功能；`rolesOf(project, workId)` 统一取角色；`sliceKey(scenario)` 是切片键的唯一计算入口；`visibleRoutes(project)` 排除内部空白页面后提供路径列表。

- `Entry.id` 是功能 id 或独立作品 id；`featureId` 是挂着的功能或 `null`。
- `Entry.workId` 是播放用作品 id：独立作品是它自己；功能是选定作品，没有选定时取第一件，无可用作品时为 `null`。
- `title` / `summary`：功能用 `name` / `goal`，独立作品用自身的标题 / 简介。其余为 `audience`、角色名字 `roles`、`draft`、`sequencing`、`slices`、`ms`。
- `slices` 先是连续播放顺序，再是支线。时长来自 core `stepPlan`：操作演示 + 停留与朗读估算中较长者；界面不另算。`EntrySlice.ms` 是切片时长，`Entry.ms` 是连续播放合计。
- `entriesOf` 按 `entryIds` 取条目，`entryOf` 未找到返回 `null`。空功能、只有一件作品的功能、没有功能或没有独立作品的项目都不能依赖假容器兜底。
- 外围只问能力：`entry.featureId !== null`、`entry.sequencing`、`entry.draft`。web / CLI 不直接读 `Work.featureId` 判断独立作品；源码守护测试固定此边界。

### 发布与信息边界

compile 的 publish / review 模式先把 alternatives 的各项评审值归空；私有评审清单必须从 dev IR 生成。普通版保留每个功能 picked 作品；独立作品不需要 pick。review 版保留功能的全部作品。独立草稿与没有切片的作品留在本地，publish / review 连同切片、画面跳过并提示；显式范围选中它们时报错。只有一个零步骤切片与完全没有切片不同：前者可用于显示初始状态。

`packages/server/src/build.ts` 的白名单保留 / 去除的信息与重构前相同，只换容器和字段位置。`draft` 不进公开载荷；私有规则、问题、取舍、源码位置不因公开过程展示而泄漏。普通 build 的自设计过程需整理为可见场景，不直接发布私有 review manifest。

草稿页面与 `on` 贡献在插件钩子之前隔离；评审清单、范围分享和朗读入口共用发布归属边界。发布 CSS 只从最终公开载荷生成，不扫描草稿或未选定源码。真实凭证与音色配置不进 IR。

### 字段流向

| 字段 | 写入点 → 存储 → 读取点 → 消费者 |
| --- | --- |
| `works`、`Work.title/summary`、`workId` | 两种位置的 `work()` → 同一编译降级与 Project.works / 场景等归属字段 → entries、播放器、scope、白名单 → 看板、outline、发布、渲染、评审 / 反馈 |
| `entryIds` | 文件发现与条目排序 → Project.entryIds → entriesOf → 首页、下拉、大纲与演示顺序 |
| `Feature.workIds/pick` | 功能下作品声明顺序与 feature.pick 文件键 → 限定作品 id / 可空选定 → 条目投影、发布筛选 → 本地评审与普通 / 评审版 |
| `Feature.alternatives` | 作者 focus/tradeoffs/coverage 与编译推导 → dev 功能上按作品 id 的评审记录 → validate、outline、reviewManifest、翻译与 scope → 看板覆盖 / 取舍、大纲、私有清单；publish/review IR 同键值归空，再由发布白名单消费 |
| `Work.roles/audience` | 独立作品作者字段 → Work；功能角色仍在 Feature → rolesOf、entries、翻译与语音 / 发布白名单 → 层级角色、字幕 / 朗读、给谁看、封面与首页 |
| `Work.sequencing`、`Scenario.from` | chapter 声明顺序 / 例外 → 编译期一次解析 → playSequence、entries → 编号、封面、连续播放与链式导出 |
| `Work.draft` | 独立作品 draft → dev IR → 发布归属与模式过滤 → 本地草稿标记、构建跳过诊断；不存公开 IR |
| 机器输出 `works/workId` | IR 投影、评审清单与反馈归一化 → JSON / NDJSON、本地会话与云端边界 → CLI、Agent、看板与云端读取方 → 按作品筛选、评审与回写 |

## 4. 诊断

| 代码 | 级别 | 何时 / 修法 |
| --- | --- | --- |
| `WORK_INVALID` | error | 按具体原因分别报告：默认导出必须为 work；title / summary 各自非空；scenarios 为 flow/chapter 对象且切片条目有效；stage 必须 JSX、layers 必须层级对象，两者不能同写；无项目页面时需 stage/layers/on/routes。独立 order 非有限数字也用该代码并提供 work ref |
| `PROJECT_MODULE_CONFIG` | error | 无 tsconfig 项目载入失败时，提示补 jsx: react-jsxdev、jsxImportSource 与 type: module；末尾 underlying error 带底层错误，继续排查依赖或作者代码，不只修 JSX |
| `WORK_ID_CONFLICT` | error | 独立作品键与功能文件夹名重复，改其中一方 |
| `WORK_SLICES_MIXED` | error | 同一作品混用章节与独立切片，统一 builder |
| `WORK_FEATURE_ONLY` | error | 独立作品使用评审字段、切片 cases 或 uses；移除或挂到功能下 |
| `WORK_STANDALONE_ONLY` | error | 功能下作品写 audience/roles/draft/order；共享角色和排序改放功能，独立字段留在独立作品 |
| `OPTIONS_DIR_RENAMED` | error | 发现旧备选目录；迁至 features/<f>/works 并使用 work({ title, summary }) |
| `FROM_UNKNOWN` | error | from 不存在，按诊断列出的切片键修正 |
| `WORK_EMPTY` | info | 没有切片，本地空状态可编辑；发布跳过，显式范围选中报错 |
| `WORK_DRAFT_SKIPPED` | info | publish / review 跳过草稿，准备好后才去掉 draft |

`HAPPY_PATH_ONLY`、`CASE_NOT_COVERED` 等评审诊断只对功能生效，不为独立影片编造失败情况。linear 切片的 `SCENARIO_TOO_LONG` / `EMPTY_SCENARIO` 等代码不变，文案用 Chapter 与自动编号；独立作品称 work，功能下仍称 option。诊断源位置指向真实作者文件。`WORK_INVALID` 可因多个无效字段产生多条具体原因；机器按代码与 ref 判断，不匹配整段旧兜底文案。功能 order 错误仍是 FEATURE_ORDER_INVALID，ref 为 feature；独立 order 的 WORK_INVALID ref 为 work。

## 5. 命令行与线上格式

- `check`、`outline`、`feedback` 的 `--work <id>` 接受独立作品键或功能下限定作品 id；不存在时报用法错误。项目仍整体编译，筛选不掩盖全项目错误。
- `build` / `share --work <id>` 接受条目 id：独立作品键或功能键（普通版选定作品，评审版全部作品）；可重复。`--scenario <id>` 保持切片范围。草稿 / 无切片作品不能被显式发布。
- `outline` 按条目分组：独立作品显示标题、切片数、总时长、每个切片的键 / 标题 / 步数 / 时长；linear 自动编号，草稿标 `(draft)`；功能仍显示情况、方案和覆盖。
- 机器可读大纲使用现有命令 `outline --format json`。容器与归属字段用 `works` / `workId`，功能名、切片名等字段以各自模型为准，不从显示用“方案”反推旧结构。
- `build` / `share` 摘要按条目计数，列出跳过的草稿。帮助文字同时覆盖独立作品与功能下作品。
- 代码标识符与机器输出（IR、评审清单、反馈记录、看板 / 服务端接口）统一用 `workId`、`works`、`entryIds`、`alternatives`。给人看的“方案”和各语言现有译法保持，i18n 键不要求改名。
- 范围错误：未知或未选定条目的 `error.details` 是 `{ scope: 'entry', id }`，切片错误用 `{ scope: 'scenario', id }`。ScopeRequest 用 entryIds，ScopeInfo 用 entryIds；借用项用 entryId / entryTitle / workId，不再按功能特例推断。
- 路由与深链格式保持；独立切片使用两段 id，例如 `render --scenario-id explainer.arrival`、`#/s/explainer.arrival`；反馈 context.scenarioId 同样使用它。不要按固定段数猜归属。
- 发布需遵守既有显式可见性与评审选择，不因本次重构自动获得上传或发布授权。

### 私有评审清单 v2

`REVIEW_MANIFEST_VERSION = 2`，独立于公开 IR 的 schemaVersion 3；清单结构变更单独升清单版本，由云端严格解析。由 `reviewManifest(devProject, mode)` 从 **dev IR** 读取规则与评审值，不能把 publish / review IR 当私有清单输入。

- 顶层必有 `works: { id, key, title, summary }[]`，只放独立作品，按 entryIds 排序；纯功能项目为 `[]`。功能下作品仍在 `features[].works[]`，并带 tradeoffs；不是把独立作品包装成假功能。
- 清单顶层为 `{ v: 2, mode, works, features, scenarios, elements }`。场景以 `workId` 关联元信息，必须在顶层 works 与 features[].works 的并集中恰好匹配一项；独立场景的 featureId 是 null。
- 独立草稿与空作品不入清单。元信息先按数量上限裁剪，再收场景，不产生元信息已丢弃但场景仍在的悬空引用。独立作品最多 100 件，功能最多 100 个、每个功能最多 20 件作品；文字标题 200 码点、简介 2000 码点，id/key 不截断，仍受总计 512 KiB 限制。
- 流向：作者 title/summary → Project.works → reviewManifest 读取 / 截断 → 顶层 works → 请求体 review → 服务端 / 云端 / CLI 显示独立作品标题与简介。清单不作为静态分享文件上传。

### 云端边界

`Joplo-app/joplo-cloud` 在主仓库完成后由单独任务升级相应版本，按 `schemaVersion: 3` 严格解析公开 IR，Agent 接口、作品集、评审清单 / 投票与反馈统一读新结构。数据库不做破坏性迁移，可保留已有列名，在边界映射。schemaVersion 2 分享的 Agent 接口继续返回现有“不支持”错误，上传和播放不受影响。这是独立的下游交接，不表示本文档任务已验证云端上线。

## 6. 界面

以当前 `WorkNav.tsx`、`nav-model.ts`、`player/cover-content.ts`、`site/SiteApp.tsx` 为依据；自设计原型在 `examples/joplo/features/film_form`，选定 A「左栏章节清单」。

### 看板

- 条目下拉分组先“作品”（独立作品）后“功能”，只有一组不出分组标题。独立作品右侧如“5 章 · 4:40”或“3 个场景 · 0:40”，草稿加“草稿 · 不发布”；功能沿用当前的选定方案字母与缺口摘要，未选定时显示未选定，**不是方案数量**。混合项目的无障碍名称使用不限定功能的说法。
- 独立作品左栏：切片数 / 约时长、标题、简介、观众（有才显示）与草稿标记。linear 行带两位编号，independent 不编号；标题可换行，第二行为时长 / 步数；当前切片高亮，点击跳到开头，支线单列。
- linear 左栏提供胶片条命令 `npx joplo render --film --chain --scenario-id <第一章 id>` 与复制。空作品说明应在哪个源文件写第一段切片。
- 独立作品不显示方案区、情况区、覆盖缺口、其他方案小标或“确认方案”。功能条目保留评审界面。
- “下一章”卡片包含章节编号。看板样式扫描是否保留标准 UI 来源，由看板所需样式决定并在代码注明；发布站仍只从公开载荷产出 CSS。

### 发布站与嵌入

- 多条目首页每个条目一张卡片：标题、简介、缩略图、打开按钮；独立作品显示切片数 / 总时长与 audience（没有时用角色名字）。**功能卡片只显示角色与切片数，不写总时长**；选定作品 linear 时切片数用“章”。
- 任意发布项目先落首页或封面：一个条目直接到其封面，多个条目到首页；范围分享、嵌入、评审模式、手机观看同样。只发布一件作品时没有首页与条目切换。
- 独立作品第一个切片的第 0 步是作品封面：标题、简介、给谁看、切片数 / 时长、播放。从中间打开时是切片封面：linear 用“第 n 章 · 作品标题”（支线另标）加切片标题与 description。
- **功能选定作品即使 linear，封面也沿用 D61 场景封面**：所属功能与方案、切片标题 / description（缺省功能 goal）、步数 / 约时长、出场角色；不换成独立作品封面。
- 用词按能力：linear 叫“章节”（电脑 / 手机一致，编号与时长），independent 叫“场景”；功能选定作品为 linear 同样叫章节。
- 所有时长来自 stepPlan / Entry / EntrySlice，不由界面再算。新增界面文案补齐全部 10 种语言，遵循 `packages/web/src/i18n/README.md`。

## 7. 验证、技能与示例

- 所有作品走相同的 lowerStep 与插件钩子。重构前保存仓库外 dev / publish / review IR（至少 joplo、invite、midterms-2026、llm-explainer、starter），用纯改名 / 字段搬家映射比较：画面、步骤、状态、时长与非改名诊断等价。
- 没有功能、没有独立作品、空切片、pick 为 null、功能只有一件作品都需验证。外面不判断形态、不拆 id 推结构，章节默认接续只编译一次。
- 技能先讲作品 → 切片 → 步骤；story 的 PM 视角、cases / coverage 明确只适用于功能下作品。内容技能用 work / chapter 教影片，不借情况当章节。
- 引擎指南 / 入口与插件指南是权威来源；常见坑逐条保留，字段位置、诊断、两段切片 id 与 JSON 输出同步。运行 `pnpm skills:build` 和 `pnpm skills:build --check`，生成物与安装版逐字一致，不用强制覆盖掩盖用户修改。
- 内容示例统一迁至 works：llm-explainer、midterms-2026、manus-voice、button-40-years、code-change、media-upload。重做旧版用另一件独立作品加 draft。保留实际角色、接续语义与翻译，移除占位页面与手写章节编号；case.expected 迁到章节 expected。
- 自设计项目只维护 examples/joplo；保留稳定功能 ID 和真实决策证据，不伪造选定历史。starter 继续以功能评审起步，作品文件同样用 work 与功能下 works 目录；独立作品起步模板已提供：joplo init <dir> --template work，包含两个默认接续的章节与可暂停修改的状态绑定输入，只启用 ui，无需占位页面。

## 8. 遗留

- `branching`：由观众选择决定切片去向。
- 观众状态跨切片保留（互动小说 / 游戏）；当前自由体验仍会在播放、跳步、换切片、重置时丢弃。
