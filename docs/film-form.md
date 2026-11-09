# 影片形态：实现契约（D102）

决策背景见 `DECISIONS.md` D102；原型在 `examples/joplo/features/film_form`（画面 `examples/joplo/shared/film/lab.tsx`，用户选定方案 A「左栏章节清单」）。
这份文档是实现的契约：创作 API、文件布局、IR 映射、不变量、诊断、界面。各部分的实现者以它为准；发现它不可行或自相矛盾时，停下来说明，不要各自发挥。

## 1. 概念

- **作品（work）**：项目里可以独立观看的一件东西。两种形态：
  - **功能演示（demo）**：功能 → 方案 → 情况 × 场景 → 步骤，带设计评审（覆盖、规则、待决问题、选定）。保持原样。
  - **影片（film）**：影片 → 章节 → 步骤，对标视频创作。**没有“方案”这一层**；章节和功能演示的场景是同一种东西（可以单独打开、分享、导出），只是不挂在方案下面。
- 一个项目可以同时有影片和功能演示。
- **所有形态都有首页与封面**（用户要求：以后再加交互作品等形态，也一定有这个能力）。实现方式：任何形态都经 `packages/core/src/works.ts` 投影成同一个 `Work`（标题、简介、给谁看、切片与时长），首页卡片和封面只读 `Work`。

## 2. 创作 API（`@joplo-app/kit`）

```tsx
// films/midterms.tsx        文件名 = 影片的键（规则同 features/ 下的文件夹名）
import { film, chapter, narrate } from '@joplo-app/kit';

export default film({
  title: '特朗普丢掉国会之后',                 // 必填
  summary: '五分钟看懂 2026 美国中期选举',     // 必填：一句话简介（首页卡片、封面）
  audience: '关心时事、不熟悉美国选举制度的人', // 可选：给谁看
  roles: { me: role('我') },                    // 可选：出场说话的人（say / 层级 role / 朗读音色），写法同 feature.roles 的键值写法
  stage: <World />,                             // 画面：stage（一个画面）或 layers（多个视角）二选一
  // layers: { world: layer('世界', <World />), data: layer('数据', <Charts />) },
  viewport: 'desktop',                          // 可选，只对 stage 生效；缺省 desktop
  state: { ui: { … } },                         // 可选：初始状态
  free: { … },                                  // 可选：自由体验的反应，同 option.free
  draft: true,                                  // 可选：草稿，只在本地看板里
  order: 1,                                     // 可选：在项目里的顺序，同 feature.order
  chapters: {                                   // 必填（可以是空对象）：键 = 章节键，声明顺序 = 播放顺序
    hook: chapter('一夜之间，特朗普丢掉了整个国会', { takeaway: '知道发生了什么，带着三个问题往下看' })
      .system('开票夜', narrate('十一月三号晚上……')),
    basics: chapter('中期选举，到底在选什么？')   // 默认接着上一章结尾的画面
      .system(…),
  },
});
```

- `chapter(title, opts?)` 返回的对象有和 `flow()` 一样的步骤方法（`.click / .type / .system / .card / .key …`），效果函数（`set`、`narrate`、`shot`、插件效果……）全部通用。
- `chapter` 的选项：
  - `takeaway?: string` —— 这一章结束时观众应该看懂的那件事（创作侧信息）；
  - `description?: string` —— 章节封面上的一句话；
  - `from?: string | null` —— 接着哪一章结尾的画面。**缺省 = 声明顺序里的上一章**（第一章缺省从初始状态开始）；`null` = 从初始状态重新开始；`'键'` = 接指定的章节；
  - `state?`、`layer?`、`autoplay?`、`actionEntry?` —— 含义同 `flow()`。
- 影片里**不能写**：`cases`、`start`、`mock`、`outcome`、`expected`（章节选项）；`go()` 效果（影片没有路径页面）；`uses()` 效果（影片没有规则）。写了要报错并说明换什么写法。
- 标题里不手写 `00`、`01` 编号：编号由看板、发布站、outline 按播放顺序自动加（从 1 开始，两位）。

## 3. 文件布局

- `films/<key>.tsx`（或 `.ts`）：`export default film({...})`。和 `features/<f>/` 并列。
- 影片不需要 `routes/`：只有影片的项目可以没有 `routes/` 与 `layouts/` 目录。
- 影片的键与功能的文件夹名共用一个命名空间（都是 IR 的 feature id）：重名报错。

## 4. IR 映射（不新增容器，不升 `SCHEMA_VERSION`）

影片编译成现有的 `Feature` + 一个 `Option` + 若干 `Scenario`：

| 影片 | IR |
| --- | --- |
| 键 `midterms` | `Feature.id = 'midterms'`，`Feature.kind = 'film'` |
| `title` / `summary` | `Feature.name` / `Feature.goal`；`Option.name` / `Option.idea` 也用它们 |
| `audience` | `Feature.audience` |
| `roles` | `Feature.roles`（带 id） |
| `draft: true` | `Feature.draft = true`（只在 dev IR；publish / review 模式整支影片不进 IR） |
| （无） | `Feature.caseIds = []`，`Feature.optionIds = ['midterms.main']`，`Feature.pick = 'midterms.main'` |
| 唯一的方案 | `Option.id = 'midterms.main'`，`key = 'main'`，`coverage = {}`，`routes = []` |
| `stage` | 一个层级：`Option.layers = { stage: { title: <影片标题>, sceneId: 'midterms.main~stage' } }` |
| `layers` | 原样成为 `Option.layers` |
| 章节 `hook` | `Scenario.id = 'midterms.main.hook'`，`name = 章节标题`，`description`，`expected = takeaway`，`caseIds = []`，`mock = { label, outcome: 'success', auto: true }` |
| 章节的接续 | `Scenario.from`（缺省上一章；`from: null` 时没有这个字段） |

- 场景 id 里的 `.main.` 是唯一暴露给作者的“方案层”痕迹（`render --scenario-id midterms.main.hook`、深链）。它是固定的，不需要作者命名。
- 已加好的 schema 字段（`packages/core/src/schema.ts` 的 `Feature`）：`kind?: 'demo' | 'film'`（缺省 = demo，编译器只给影片写 `'film'`）、`audience?: string`、`draft?: true`。
- 影片没有路径页面：`Scenario.initial.sceneId` 需要指向一个存在的画面。编译器为“没有任何 `routes/` 页面的项目”合成一个空白的 `/` 页面（内部细节，不要求作者写）；影片的章节从它开始，显示的是层级画面。项目有 `routes/` 时影片照样不引用它们。
- 发布：没有标 `draft` 的影片总是发布（不需要 `pick`）；`draft` 的影片在 publish / review 模式下连同它的方案、场景、画面都不进 IR，并给一条 info（`FILM_DRAFT_SKIPPED`）。范围分享（scope）对影片的章节与功能演示的场景同样生效。

### 不变量

1. **形态只由 `Feature.kind` 决定**。任何地方都不靠“有没有情况”“有几个方案”推断形态。读取用 `workKind(feature)`（`works.ts`）。
2. **影片恰好一个方案**，id 固定为 `<影片键>.main`；`Feature.pick` 指向它。
3. **章节的默认接续 = 声明顺序里的上一章**。这条规则只在编译期应用一次，写进 `Scenario.from`；播放器、看板、outline 只读 `from`，不重新推导。
4. **功能演示的行为、IR、诊断、界面不变**：没有影片的项目编译出的 IR 与改动前逐字节相同（除非本文档明确说了要改）。
5. **首页与封面只读 `Work`**（`worksOf` / `workOf`）：标题、简介、给谁看、切片、时长都从它取；不在界面里重新拼这些信息。
6. 插件契约不变：影片里的画面、效果、层级走和功能演示完全相同的编译路径（同一个 `lowerStep`、同一批插件钩子）。

## 5. 诊断

| 代码 | 级别 | 何时 |
| --- | --- | --- |
| `FILM_INVALID` | error | `films/<key>.tsx` 的默认导出不是 `film({...})`；缺 `title` / `summary`；`stage` 与 `layers` 同时写或都没写；`chapters` 不是对象或某一项不是 `chapter()` |
| `FILM_ID_CONFLICT` | error | 影片的键和某个功能的文件夹名相同 |
| `FILM_CHAPTER_OPTION` | error | 章节用了影片不支持的选项（`cases`、`start`、`mock`、`outcome`、`expected`），说明该换成什么 |
| `FILM_EFFECT_UNSUPPORTED` | error | 章节里用了 `go()` 或 `uses()` |
| `FROM_UNKNOWN` | error | `from` 写了不存在的章节键。影片的文案用“章节”，并列出这支影片的全部章节键 |
| `FILM_EMPTY` | info | 影片还没有章节。说明下一步怎么写 |
| `FILM_DRAFT_SKIPPED` | info | publish / review 模式跳过了草稿影片 |

- 影片**不报** `HAPPY_PATH_ONLY`、`CASE_NOT_COVERED` 等评审类诊断（没有情况，自然不触发；`HAPPY_PATH_ONLY` 要显式跳过 `kind === 'film'`）。
- 对影片的章节，`SCENARIO_TOO_LONG` / `EMPTY_SCENARIO` 等诊断的**代码不变**，文案里把 Scenario 换成 Chapter（带上自动编号）。
- 现有的 `FROM_CYCLE`、`FROM_FAILED`、`FROM_WITH_START` 等照常适用。

## 6. 命令行

- `joplo check`：见上。
- `joplo outline`：按作品分组。影片一段：`<标题> · film · N chapters · about M`，下面每章一行（编号、键、标题、步数、时长）；草稿标 `(draft)`。功能演示的输出不变。`--json` 里每个作品带 `kind`。
- `joplo build` / `share`：摘要里影片按“film”计数；跳过的草稿列出来。`share --feature <id>` 对影片的键同样可用，`--scenario <id>` 对章节可用。
- `joplo render`、`voice`、`resources`、`feedback`：按场景 id 工作，不需要改语义；面向人的文案里影片的场景叫 chapter。

## 7. 界面（方案 A：左栏章节清单）

对照原型的 `ff_*` 画面。**功能演示打开时界面与现在完全一样。**

### 看板（`packages/web/src/board`）

- 顶栏的作品下拉：按形态分两组，先“影片”后“功能演示”；每项右侧写摘要（影片：`5 章 · 4:40`；功能演示：`2 个方案`）；草稿影片带“草稿 · 不发布”。只有一种形态时不显示分组标题。
- 左栏（当前作品是影片时）：
  - 影片信息：形态徽标“影片”+ `N 章 · 约 M`，标题，简介，“给：audience”（有才显示）；
  - 章节清单：每章一行——自动编号（两位）在左，标题（可换行，不截断到看不懂），第二行“时长 · 步数”；当前章高亮；点一下跳到这一章的开头；不在连续播放顺序里的章节（`autoplay: false`）单独一组“支线”；
  - 审片：一行说明 + 胶片条命令 `npx joplo render --film --chain --scenario-id <第一章 id>` + 复制按钮（做法同现在的“复制 check 命令”）；
  - 空状态（没有章节）：说明 + 第一章怎么写的代码片段。
- 影片**不显示**：方案区、情况区、覆盖缺口、其他方案的小标、“确认方案”。
- 草稿影片在左栏的影片信息里带“草稿 · 不发布”。

### 发布站与嵌入（`packages/web/src/site`、`player`）

- 首页（多个作品时）：每个作品一张卡片，读 `Work`——形态徽标、标题、简介、“给：…”（影片用 `audience`，功能演示用 `roles` 的名字，沿用现有的 `forRoles` 文案）、切片数与总时长（影片“5 章 · 约 4 分 40 秒”，功能演示“N 个场景 · 约 M”）、缩略图、打开按钮。
- **每个项目打开时都先落在首页或封面上**，不直接开始播放第一步：
  - 只有一个作品：打开就是这个作品的封面；
  - 多个作品：打开是首页。
- 作品的封面（第 0 步、没在播放时）：
  - 影片：影片封面——标题、简介、给谁看、`N 章 · 约 M`、播放按钮；从中间某一章直接打开（深链）时显示这一章的封面（“第 n 章 · 标题”与章节的 description）；
  - 功能演示：保持现在的场景封面（D61），数据改从 `Work` 与现有的 `coverFor` 取，外观不变。
- 影片的左栏标题用“章节”（电脑和手机一致）；带自动编号与时长。功能演示仍叫“场景”。
- 浏览器标签页标题、“下一章”卡片、手机端的“第 n / N 章”沿用现有实现。

### 文案

- 新增的界面文字要补齐全部 10 种界面语言（`packages/web/src/i18n/*.ts`、`i18n/board/*.ts`），遵循 `packages/web/src/i18n/README.md`。

## 8. 示例、技能、模板

- 迁到 `film()`：`llm-explainer`、`midterms-2026`、`manus-voice`、`button-40-years`、`code-change`、`media-upload`。迁移后删除占位的 `routes/page.tsx`、`features/` 目录；章节标题去掉手写编号。
  - `midterms-2026` 有两个方案（`a-explainer` 旧版、`b-film` 现行版）：`b-film` 迁成 `films/midterms.tsx`；`a-explainer` 迁成 `films/midterms-v1.tsx` 并标 `draft: true`。
- 技能：`plugins/content/src/guide.ts`（内容主题）改成按 `film()` / `chapter()` 讲，去掉“功能当一集、情况当章节”“忽略 HAPPY_PATH_ONLY”“重做时加一个方案”；`packages/core/src/guide.ts` 里讲创作结构、讲解片、发布的段落同步；功能演示相关的主题（story 的 PM 视角、cases）明确只适用于功能演示。改完运行 `pnpm skills:build`。
- `examples/joplo/features/film_form` 是这次设计的记录，保留；实现完成后把 `pick` 设为 `a-chapters`。
- `templates/starter` 暂不改（仍是功能演示）；是否提供影片模板待定。

## 9. 已知的遗留

- `Feature.kind` / `audience` 是公开 IR 的新字段：joplo-cloud 的 Worker 用固定版本的 core 严格解析公开 IR（给 Agent 的 JSON / Markdown 接口），会拒绝带这些字段的分享；上传与播放不受影响。需要云端升级 core（与 D86、D101 记录的同类问题一起处理）。
