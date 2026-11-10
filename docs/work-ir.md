# 作品模型第二轮：内部重构的实现契约（D103，2026-11-10）

第一轮（D102，`docs/work-model.md`）把“外面”按“作品 → 切片 + 能力”定对，内部仍是“一个 `Feature` + 一个隐藏的 `Option`”。这一轮把内部也改成同一个模型，并清掉第一轮记下的其余遗留。

- 没有用户，不做兼容：不留别名、不读旧 IR、不保留旧文件布局。
- 实现者以本文档为准；与 `docs/work-model.md` 冲突时以本文档为准。发现不可行或自相矛盾时写 `.blocked-<任务>` 文件说明，不要各自发挥。
- 全部工作做完后，由文档任务把两份文档合成一份 `docs/work-model.md`，删除本文件。

## 1. 模型（不变）

- **作品（work）**：一个舞台加一组切片；有封面，能进首页。
- **切片（scenario）**：舞台上的一段步骤。内部名继续用 `Scenario`，这一轮不改名。
- **功能（feature）**：叠在作品上面的一层，把几件互为备选的作品放在一起做设计评审（情况、覆盖、规则、待决问题、选定）。功能下面的一件作品在界面上叫“方案”。
- 接续（`sequencing`）、草稿（`draft`）、封面与首页同第一轮。

“方案 / option / alternative”从此只是**界面与文档里的称呼**（功能下面的作品），不再是 IR 容器、创作函数或目录名。

## 2. IR（`SCHEMA_VERSION = 3`）

```ts
Project {
  schemaVersion: 3,
  features: Record<Id, Feature>,   // 只有真正的功能
  works: Record<Qid, Work>,        // 取代 options
  entryIds: Id[],                  // 取代 featureIds：首页条目的演示顺序 = 功能 id 与独立作品 id；必填，每个条目恰好出现一次
  cases, rules, scenes, scenarios, issues, routes, …   // 其余不变
}

Feature {
  id, name, goal, roles, constraints, caseIds, source,   // 不变
  workIds: Qid[],                  // 取代 optionIds；声明顺序
  pick: Qid | null,                // 选定的作品 id
  // 评审信息从作品移到功能；键 = 作品 id，workIds 里的每件作品恰好一项
  alternatives: Record<Qid, { decisionFocus: string; tradeoffs: string[]; coverage: Record<Qid, Coverage> }>,
}
// 删除：Feature.standalone、Feature.audience、Feature.draft、Feature.optionIds

Work {
  id: Qid,                 // 独立作品：<key>；功能下面的：<featureId>.<key>
  key: Id,                 // 文件名
  featureId?: Id,          // 没有 = 独立作品
  title: string,           // 取代 Option.name
  summary: string,         // 取代 Option.idea
  audience?: string,       // 只有独立作品
  roles: Role[],           // 只有独立作品有内容（形状同 Feature.roles）；功能下面的作品为空，角色读功能的
  draft?: true,            // 只有独立作品；只在 dev IR
  sequencing?: 'linear',
  free?, routes: string[], layers, source,   // 同原 Option
}
// 删除：Option.decisionFocus、Option.tradeoffs、Option.coverage（移到 Feature.alternatives）

Scenario.workId   // 取代 optionId
Scene.workId      // 取代 optionId（可为 null）
Rule.workId? / Issue.workId?   // 取代 optionId
Route.addedBy     // 仍是作品 id
```

- **切片 id = `${workId}.${sliceKey}`**。独立作品 `midterms` 的切片是 `midterms.hook`（两段）；功能下面的仍是 `invite.a-modal.happy`。作品的画面 id 同理由作品 id 推出（独立作品的 `stage` 层级是 `midterms~stage`）。任何地方不再出现 `.main`。
- 独立作品的键与功能的文件夹名共用一个命名空间（`WORK_ID_CONFLICT`，已有）。因此 `works`、`features` 的键不会相撞。
- 角色统一用一个函数取：`rolesOf(project, workId)` = 作品挂着功能时读功能的，否则读作品的。层级的 `role` 引用它。
- `SCHEMA_VERSION` 的规则（本轮定下）：**公开载荷（publish / review 模式的 IR）的结构只要变了——增、删、改名、改语义——就升一版**；读取方（云端）按版本号严格解析。只在 dev IR 里的字段变化不升。

### 发布载荷

`packages/server/src/build.ts` 的白名单按新结构重写，保留 / 去掉的**信息**与现在相同：现在保留的每一项仍保留（换到新位置），现在去掉的仍去掉。`draft` 不进公开载荷。

### 条目投影（`packages/core/src/entries.ts`）

`Entry` / `EntrySlice` 的形状与含义不变，仍是界面、命令行、技能读作品结构的入口：

- `Entry.id` = 功能 id 或独立作品 id；`featureId` = 挂着的功能或 `null`；`workId` = 播放用的作品 id（独立作品就是它自己；功能是选定的，没有选定时取第一件）。
- `scenariosOf(project, workId)`、`playSequence(project, workId)` 不变。
- 新增 `rolesOf`；`orderedFeatures` 换成按 `entryIds` 取条目的函数。

## 3. 创作

```tsx
// works/midterms.tsx —— 独立作品（不变）
export default work({ title, summary, audience?, roles?, stage | layers, …, scenarios });

// features/invite/feature.ts —— 功能（不变；pick 是作品的键）
export default feature({ name, goal, roles, cases, rules?, questions?, pick: 'a-modal' });

// features/invite/works/a-modal.tsx —— 功能下面的作品（原 options/a-modal.tsx 的 option()）
export default work({
  title: 'A · 弹窗邀请',            // 原 name
  summary: '在成员列表里直接邀请',   // 原 idea
  focus: '入口放在哪',              // 只在功能下面有意义的字段：focus、tradeoffs、coverage、rules、questions
  tradeoffs: ['…'],
  on: { … }, routes: { … }, state, layers | stage, free,
  scenarios: { happy: flow('…', { cases: ['happy'] }).user(…) },
});
```

- **`option()` 删除**，kit 不导出、不留别名。`work()` 是唯一的作品入口。
- **目录 `features/<f>/options/` 改为 `features/<f>/works/`**。仍存在 `options/` 目录时报一条错误 `OPTIONS_DIR_RENAMED`，说明改名为 `works/` 并把 `option({ name, idea })` 换成 `work({ title, summary })`。
- 字段按位置校验：
  - 只在功能下面可用（独立作品里写了报 `WORK_FEATURE_ONLY`，已有）：`focus`、`tradeoffs`、`coverage`、`rules`、`questions`、切片的 `cases`、步骤的 `uses()`。
  - 只在独立作品可用（功能下面写了报新增的 `WORK_STANDALONE_ONLY`）：`audience`、`roles`、`draft`、`order`。
  - 其余（`title`、`summary`、`stage` | `layers`、`viewport`、`on`、`routes`、`state`、`free`、`scenarios`）两处都可用，校验规则相同（`WORK_INVALID`）。
- 编译：独立作品与功能下面的作品走**同一段**降级代码；不再合成假的功能与隐藏方案（`authoring-works.ts` 的合成逻辑删除）。
- 没有任何 `/` 页面时合成的空白页：标题不再是空格，改成不参与显示与翻译的内部标记，并且不出现在任何界面、大纲、发布站的路径列表里。
- 只有一个裸目录（没有 `tsconfig.json`、`package.json` 没写 `type: module`）的项目：`joplo check` / `dev` 要么能正常载入，要么给出一条指明缺什么、怎么补的错误；不能是一段看不懂的加载异常。

## 4. 不变量

1. `project.features` 里只有真正的功能；独立作品不产生功能，也没有隐藏的作品。全仓库（`packages/`、`plugins/`、`examples/`、`templates/`、`skills/`、`scripts/`、`docs/` 的现行文档）不再出现 `standalone` 标志、`.main` 作品、`option(`、`optionId`、`optionIds`、`project.options`、`features/*/options/`。历史决策记录（`DECISIONS.md` 旧条目、`CHANGELOG.md`）不改。
2. **不靠拆 id 字符串推结构**：从切片找作品用 `scenario.workId`，从作品找功能用 `work.featureId`，切片键只在 `entries.ts` 一处算。
3. **行为等价**：对每个示例，新 IR = 旧 IR 经过纯改名映射（容器改名、字段搬家、`<key>.main` → `<key>`）后的结果——画面、步骤、状态、时长、诊断（除改名的文字）都相同。实现者在动代码前把旧 IR（dev / publish / review 三种模式，至少 `examples/joplo`、`invite`、`midterms-2026`、`llm-explainer`、`templates/starter`）存到仓库外，写一个映射脚本做这项比较，并在完成报告里给出结果。
4. 外面仍然不判断形态：界面与命令行只问 `entry.featureId !== null`、`entry.sequencing`、`entry.draft`，结构一律经 `entries.ts`。`packages/web/src`、`packages/cli/src` 不直接读 `Work.featureId` 来判断“是不是独立作品”（更新现有的源码守护测试）。
5. 每个新字段端到端有消费者：`Feature.alternatives` 的写入点（编译）→ 读取点（看板的覆盖 / 取舍、`outline`、评审版、发布白名单）；`Work.roles`、`Work.audience` 同理。
6. 任何作品走同一条编译路径；章节的默认接续仍只在编译期解析一次。

## 5. 对外的线上格式

- 代码标识符与机器可读的输出（IR、`outline --json`、评审清单、反馈记录、看板与服务端之间的接口）一律用新名字：`workId`、`works`、`entryIds`、`alternatives`。
- 给人看的文字不变：功能下面的作品仍叫“方案”（各语言沿用现有译法），i18n 的键名可以不动。
- 发给云端的评审清单与反馈里，`optionId` 改成 `workId`。云端由单独的任务跟着改（第 7 节）。
- 路由与深链的格式不变；独立作品切片的 id 少了 `.main`。

## 6. 第一轮留下的小项（各归各的任务）

- 界面：混合项目里条目下拉的无障碍名称改成不带“功能”的说法（各语言）；“下一章”卡片带上章节编号。
- 界面：`packages/web/src/index.css` 的 `@source "../../../plugins/ui/src"` 查清是否还需要——发布站的样式已只从公开载荷生成（`packages/server/src/publish-css.ts`）；看板仍需要就保留并写一行注释说明原因，不需要就删。
- 文档：第一轮契约与界面字面不同的三处，以界面的现状为准改文档——功能在条目下拉里的摘要、功能卡片不写总时长、功能选定的作品是 linear 时封面沿用 D61。

## 7. 云端（`Joplo-app/joplo-cloud`）

主仓库全部完成后进行。云端把 `@joplo-app/*` 升到包含本轮改动的版本，按 `schemaVersion: 3` 解析公开 IR，Agent 读取接口、作品集、评审（清单与投票）、反馈都改用新结构。数据库不做破坏性迁移：已有的列名可以保留，在边界上映射。旧版本（`schemaVersion: 2`）的分享在 Agent 接口上继续返回现有的“不支持”错误，上传与播放不受影响。
