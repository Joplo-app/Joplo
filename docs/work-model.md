# 作品模型：实现契约（D102，2026-11-09）

决策见 `DECISIONS.md` D102。**这一轮的范围：外面按最终模型定对，里面先不动。**

- “外面”= 作者的创作入口与文件布局、首页条目的投影、界面、命令行、发布站、技能与文档。它们一律按第 1 节的模型说话。
- “里面”= IR 的容器与引擎内部。这一轮不改名、不搬结构：独立作品在 IR 里仍然是“一个 `Feature` + 一个隐藏的 `Option`”。丑的部分关在两个接缝后面：**编译映射**（`packages/core/src/films.ts` 一带）与**条目投影**（`packages/core/src/entries.ts`）。以后设计互动作品时再重构内部，届时外面不用跟着改。
- 实现者以本文档为准；发现它不可行或自相矛盾时停下来说明，不要各自发挥。

## 1. 模型

核心只有两层，引擎（编译、回放、调度、渲染、发布）只认识这两层：

- **作品（work）**：一个舞台（画面、层级、初始状态）加一组切片；有封面，能进首页。
- **切片（scenario）**：舞台上的一段步骤。内部名沿用 `Scenario`；界面上按能力叫“场景”或“章节”。
- **项目**：作品集。发布时可以只发其中一件。

其余都是叠在作品上的**能力**，可以组合，引擎不为“形态”分支：

| 能力 | 是什么 | 谁在用 |
| --- | --- | --- |
| 功能（feature） | 把几件**互为备选的作品**放在一起做设计评审：情况、覆盖、规则、待决问题、选定。一个“方案”就是功能下面的一件作品 | 功能演示 |
| 接续（sequencing） | 作品的切片之间的关系：`independent`（各自独立，缺省）或 `linear`（章节：按顺序、默认接着上一章结尾的画面）。以后加 `branching`（观众的选择决定去向） | 影片用 linear |
| 草稿（draft） | 独立作品不进发布与分享 | 重做一版时的旧版 |
| 封面与首页 | 所有作品都有，不是可选能力 | 全部 |

- IR 里**没有“形态”字段**。“影片”“功能演示”只是技能里教的两种常见搭配：影片 = 独立作品 + linear；功能演示 = 功能 + 若干作品（方案）。
- 互动小说 / 游戏以后需要的两项（观众的选择决定去向、观众的状态跨切片保留）这一轮不做，只在 `sequencing` 的取值上留位置。
- 判断“该不该加一种新能力”的标准：只有创作结构或外围流程不同才加；内容类型的差别（3D、代码、媒体）交给插件。

## 2. 创作 API（`@joplo-app/kit`）

新增 `work()`（独立作品）与 `chapter()`（章节）。没有 `film()`。功能下面的方案这一轮仍然用 `option()`（字段不变）；把它也并成 `work()` 属于内部重构的一部分，以后做。

```tsx
// works/midterms.tsx —— 独立作品（文件名 = 作品的键）
import { work, chapter, narrate } from '@joplo-app/kit';

export default work({
  title: '特朗普丢掉国会之后',                 // 必填
  summary: '五分钟看懂 2026 美国中期选举',     // 必填：一句话简介（首页卡片、封面）
  audience: '关心时事、不熟悉美国选举制度的人', // 可选：给谁看
  roles: { me: role('我') },                    // 可选：出场说话的人
  stage: <World />,                             // 画面：stage 是“只有一个层级”的简写
  state: { ui: { … } },
  scenarios: {                                  // 切片；键 = 切片键，声明顺序 = 播放顺序
    hook: chapter('一夜之间，特朗普丢掉了整个国会', { expected: '知道发生了什么，带着三个问题往下看' })
      .system('开票夜', narrate('十一月三号晚上……')),
    basics: chapter('中期选举，到底在选什么？')   // 默认接着上一章结尾的画面
      .system(…),
  },
});
```

- `work()` 的字段：`title`、`summary`（必填）、`audience`、`roles`（写法同 `feature.roles` 的键值写法）、`stage` | `layers`、`on`、`routes`、`viewport`（只对 `stage`）、`state`、`free`、`draft`、`order`、`scenarios`（必填，可以是空对象）。
- 独立作品里不能写只有功能下面才有意义的东西：切片选项里的 `cases`、步骤效果 `uses()`（没有情况，也没有规则）。
- `flow(name, opts)`：独立的切片，不变。
- `chapter(name, opts)`：章节。选项与 `flow` 相同，区别只有一条：`from` 缺省 = 声明顺序里的上一章（第一章从初始状态开始）；`from: null` = 从初始状态重新开始；`from: '键'` = 接指定的切片。
- `chapter()` 在独立作品和功能下面的方案（`option()` 的 `scenarios`）里都能用。
- 一件作品（一个 `work()` 或一个 `option()`）的切片要么全是 `chapter()`，要么全是 `flow()`，不混用（`WORK_SLICES_MIXED`）。全是 `chapter()` 的作品是 linear。
- 标题里不手写 `00`、`01` 编号：linear 作品的编号由看板、发布站、outline 按播放顺序自动加。

## 3. 文件布局

- `works/<key>.tsx`（或 `.ts`）：独立作品，`export default work({...})`。
- `features/<f>/feature.ts` + `features/<f>/options/<o>.tsx`：功能与它的方案，不变。
- 独立作品的键与功能的文件夹名共用一个命名空间，重名报错。
- 只用 `stage` / `layers` 的作品不需要 `routes/`：没有任何 `routes/` 页面的项目由编译器合成一个空白 `/` 页面（内部细节）。

## 4. IR（内部不动，不升 `SCHEMA_VERSION`）

独立作品编译成现有容器：

| 独立作品 | IR |
| --- | --- |
| 键 `midterms` | `Feature.id = 'midterms'`，`Feature.standalone = true` |
| `title` / `summary` | `Feature.name` / `Feature.goal`；`Option.name` / `Option.idea` 也用它们 |
| `audience` | `Feature.audience` |
| `roles` | `Feature.roles`（带 id） |
| `draft: true` | `Feature.draft = true`（只在 dev IR；publish / review 模式整件作品不进 IR） |
| （无） | `Feature.caseIds = []`，`Feature.optionIds = ['midterms.main']`，`Feature.pick = 'midterms.main'` |
| 隐藏的方案 | `Option.id = 'midterms.main'`，`key = 'main'`，`coverage = {}` |
| `stage` | 一个层级：`Option.layers = { stage: { title: <作品标题>, sceneId: 'midterms.main~stage' } }` |
| 切片 `hook` | `Scenario.id = 'midterms.main.hook'`，`name`、`description`、`expected`，`caseIds = []`，`mock = { label, outcome: 'success', auto: true }` |
| 切片全是 `chapter()` | `Option.sequencing = 'linear'`（功能下面的方案同样适用） |
| 章节的接续 | `Scenario.from`（缺省上一章；`from: null` 时没有这个字段） |

- 内部字段（相对今天早些时候的基线）：`Feature.kind` 删除，换成 `Feature.standalone?: true`；`Feature.audience?`、`Feature.draft?` 保留；新增 `Option.sequencing?: 'linear'`（缺省 = independent）。
- 切片 id 里的 `.main.` 是内部结构在外面唯一的痕迹（`render --scenario-id midterms.main.hook`、深链）。这一轮接受它；内部重构时会变成两段。
- 没有任何 `routes/` 页面的项目由编译器合成一个空白 `/` 页面。
- 发布：没有标 `draft` 的独立作品总是发布（不需要 `pick`）；`draft` 的在 publish / review 模式下连同它的切片、画面都不进 IR，并给一条 info（`WORK_DRAFT_SKIPPED`）。功能照旧。范围分享对任何切片同样生效。
- 发布载荷（`packages/server/src/build.ts` 的白名单等）保留 `Feature.standalone`、`Feature.audience`、`Option.sequencing`；`draft` 不进公开载荷。

### 首页条目的投影（`packages/core/src/entries.ts`，取代 `works.ts`）

这是“外面”读内部结构的唯一入口：界面、命令行、技能生成都通过它（以及 `playSequence` / `scenariosOf`）看作品，不直接读 `Feature.standalone`、`Option.sequencing`、`Feature.pick`。

```ts
type Entry = {
  id: string;            // 功能 id 或独立作品 id
  featureId: string | null; // 挂着的功能；独立作品为 null（内部：Feature.standalone）
  workId: string | null; // 播放用的作品的内部 id（现在是 Option id）：独立作品是隐藏的那个；功能是选定的方案，没有选定时取第一个
  title: string;         // 功能：feature.name；独立作品：work.title
  summary: string;       // 功能：feature.goal；独立作品：work.summary
  audience: string | null;
  roles: string[];
  draft: boolean;
  sequencing: 'independent' | 'linear';
  slices: EntrySlice[];  // 先是连续播放顺序里的，再是支线
  ms: number;
};
entriesOf(project): Entry[]      // 按演示顺序（现有的 orderedFeatures）
entryOf(project, id): Entry | null
```

首页卡片、封面、看板的下拉、outline 都只读 `Entry`。

### 不变量

1. **外面不判断形态，也不读内部结构**：界面、命令行、技能里没有“是不是影片”这种判断，只问能力——`entry.featureId !== null`（有没有挂功能）、`entry.sequencing`（切片是不是章节）、`entry.draft`。`packages/web/src`、`packages/cli/src` 不直接读 `Feature.standalone` 与 `Option.sequencing`（用源码守护测试固定）。
2. **章节的默认接续只在编译期应用一次**，写进 `Scenario.from`；下游只读 `from`。
3. **功能演示的行为不变**：没有独立作品、没有用 `chapter()` 的项目，编译出的 IR 与诊断和改动前相同（除 `kind` 字段本来就不存在）。
4. **首页与封面只读 `Entry`**，时长就是 `Entry.ms` / `EntrySlice.ms`（来自 stepPlan），界面不另算。
5. **每个发布出去的项目打开时先落在首页或封面上**：只有一个条目 → 它的封面；多个 → 首页。范围分享、嵌入、评审模式、手机观看同样。
6. 任何作品走同一条编译路径（同一个 `lowerStep`、同一批插件钩子）。

### 与云端的边界

- 内部不动，所以发给云端的接口字段不变。
- `Feature.standalone` / `audience`、`Option.sequencing` 是公开 IR 的新字段：云端给 Agent 的 JSON / Markdown 接口用固定版本的 core 严格解析公开 IR，会拒绝带这些字段的分享（上传与播放不受影响）。需要云端升级 core，记为遗留。

## 5. 诊断

| 代码 | 级别 | 何时 |
| --- | --- | --- |
| `WORK_INVALID` | error | 默认导出不是 `work({...})`；缺 `title` / `summary`；`scenarios` 不是对象或某一项不是 `flow()` / `chapter()` |
| `WORK_ID_CONFLICT` | error | 独立作品的键和某个功能的文件夹名相同 |
| `WORK_SLICES_MIXED` | error | 一件作品里 `chapter()` 与 `flow()` 混用 |
| `WORK_FEATURE_ONLY` | error | 独立作品写了只有功能下面才有意义的东西（切片的 `cases`、`uses()`） |
| `FROM_UNKNOWN` | error | `from` 写了不存在的切片键；列出这件作品的全部切片键 |
| `WORK_EMPTY` | info | 独立作品还没有切片 |
| `WORK_DRAFT_SKIPPED` | info | publish / review 模式跳过了草稿作品 |

- `HAPPY_PATH_ONLY`、`CASE_NOT_COVERED` 等评审类诊断只对功能生效（它们本来就按功能遍历）。
- 对 linear 作品的切片，`SCENARIO_TOO_LONG` / `EMPTY_SCENARIO` 等诊断的**代码不变**，文案里用 Chapter 和自动编号。
- 诊断文案里，功能下面的方案仍然说 option；独立作品说 work，不出现它那个隐藏的方案（`<键>.main`）。

## 6. 命令行

- `--option <id>`（`check`、`outline`、`feedback` 等）改成 `--work <id>`：接受方案的限定 id（`<功能>.<方案>`）或独立作品的键（内部解析成它隐藏的方案）。
- `share` / `build` 的范围：`--work <id>` 取代 `--feature <id>`，接受条目 id（独立作品的键，或功能的键 = 它选定的作品；评审版是它的全部作品）；`--scenario <id>` 不变。选到草稿时报错，不静默发布空内容。
- `joplo outline`：按条目分组。独立作品一段：`<title> · N chapters|scenarios · about M`，每个切片一行（linear 带编号）；草稿标 `(draft)`。功能的输出不变（列名里的 option 保留）。`--format json` 里每个条目带 `standalone`、`sequencing`、`draft`。
- `joplo build` / `share` 的摘要：按条目计数；跳过的草稿列出来。
- 帮助文字里只说 feature / option 的地方，改成同时覆盖独立作品。

## 7. 界面

对照原型 `examples/joplo/features/film_form`（用户选定方案 A「左栏章节清单」）。**打开功能时，看板、发布站、嵌入与现在完全一样**（文案里的“方案”“情况”“场景”都保留）。

### 看板

- 顶栏的条目下拉：分两组，先“作品”（独立作品）后“功能”；每项右侧写摘要（独立作品：`5 章 · 4:40` 或 `3 个场景 · 0:40`；功能：`2 个方案`）；草稿带“草稿 · 不发布”。只有一组时不显示分组标题。
- 左栏（当前条目是独立作品时）：
  - 作品信息：`N 章 · 约 M`（或 `N 个场景 · 约 M`），标题，简介，“给：audience”（有才显示），草稿标记；
  - 切片清单：linear 时每行带自动编号（两位）、标题（可换行）、第二行“时长 · 步数”；independent 时不编号；当前切片高亮；点一下跳到它的开头；不在连续播放顺序里的切片单独一组“支线”；
  - 审片（linear 时）：胶片条命令 `npx joplo render --film --chain --scenario-id <第一个切片 id>` + 复制；
  - 空状态：说明 + 第一个切片怎么写。
- 独立作品**不显示**：方案区、情况区、覆盖缺口、其他方案的小标、“确认方案”。

### 发布站与嵌入

- 首页（多个条目时）：每个条目一张卡片，读 `Entry`——标题、简介、“给：…”（`audience`，没有时用 `roles` 的名字，沿用现有的 `forRoles` 文案）、切片数与总时长（linear 写“5 章 · 约 4 分 40 秒”，independent 写“N 个场景 · 约 M”）、缩略图、打开按钮。
- 不变量 6：打开先落在首页或封面上。
- 封面（第 0 步、没在播放时）：标题、简介、给谁看、切片数与时长、播放。linear 作品从中间某一章直接打开时显示这一章的封面（“第 n 章 · 标题”与 description）。功能的封面外观不变（D61），数据从 `Entry` 取。
- 用词按能力：linear → “章节”（电脑和手机一致，带编号与时长）；independent → “场景”。**功能选定的作品如果是 linear，同样叫章节。**
- 只发布一件作品（`--work`）时，发布站就是这件作品：打开直接是它的封面，没有首页与条目切换。
- 路由与深链的格式不变（条目 id 就是现在的 feature id）。

### 文案

新增 / 改动的界面文字补齐全部 10 种界面语言，遵循 `packages/web/src/i18n/README.md`。

## 8. 示例、技能、模板

- 迁成独立作品（`works/<key>.tsx`，切片用 `chapter()`）：`llm-explainer`、`midterms-2026`、`manus-voice`、`button-40-years`、`code-change`、`media-upload`。删除占位的 `routes/page.tsx` 与 `features/`；章节标题去掉手写编号；`case.expected` 搬到对应章节的 `expected`。
  - `midterms-2026`：`b-film` → `works/midterms.tsx`；`a-explainer` → `works/midterms-v1.tsx`，标 `draft: true`。
- 技能（发布站与技能是这次改动的一部分，不是收尾）：
  - 引擎技能先讲模型：作品 → 切片 → 步骤；能力怎么叠（功能评审、章节接续、草稿）；“要比较方案、列情况、做设计决定 → 功能 + 方案；要做一支给人看的片子 → 独立作品 + 章节；同一个项目可以都有”。
  - story 的 PM 视角、cases、coverage 这些主题开头写明只适用于挂了功能的作品。
  - `plugins/content/src/guide.ts`（内容主题）按 `work()` / `chapter()` 讲，删掉“功能当一集、情况当章节”“忽略 HAPPY_PATH_ONLY”“重做时加一个方案”“每章写 flow({ from })”“路径页面只是占位”。
  - check 的常见代码表加上第 5 节的新代码与修法；发布相关段落说明独立作品不需要 pick、草稿不发布、`--work` 只发一件。
  - 常见坑逐条保留，不合并、不删减。改完运行 `pnpm skills:build`。
- `examples/joplo/features/film_form` 是这次设计的记录：把里面的代码示例、规则、待决问题更新到最终的模型（`works/`、`work()`、没有 `film()`），`pick` 设为 `a-chapters`。
- `templates/starter` 仍是功能演示，不改；是否再提供一个独立作品的模板待定。

## 9. 遗留（内部重构时一起做）

- IR 改成中性的两层：`Option` → `Work`、功能变成作品上面可选的一层、评审信息（覆盖、取舍）从作品移到功能、切片 id 变两段、`option()` 并成 `work()`。
- 云端的 IR 解析升级。
- `branching` 与跨切片保留观众状态（互动小说 / 游戏）。
