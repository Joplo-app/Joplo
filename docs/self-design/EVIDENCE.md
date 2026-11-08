# Joplo 自设计项目：证据目录

核对基线：`Joplo-app/Joplo` 的 `d566856`（2026-11-08）。本目录依据仓库内的原型、决策、实现和可达 Git 提交整理；没有重新核验 npm registry 或生产 Cloud。文中的“已实现”仅表示该基线具有相应源码，不自动代表已发布或已完成线上验收。

## 阅读边界

- [DECISIONS.md](../../DECISIONS.md) 是有日期的决策记录，较晚的明确替代条目优先；其顶部“当前 0.1.2”“仓库只有初始提交”等旧摘要不能用作当前状态。
- [初始 PRD](../../Joplo-PRD-v0.1.md) 记录产品出发点与早期建议，不等于每条建议后来都实现。D21–D35 已改变其中不少实现方向。
- `origin: user` / `status: confirmed` 只有原始材料明确记载用户决定时才能沿用。补写的说明、重建的画面和新整理的观看场景应标为“历史重建”或“根据源码整理”。
- 原型里的点击、输入、终端与事件均是预设演示。不能把这些模拟输出当成实际命令执行、真实评审记录或生产结果。
- 现存 `_v1` 归档与早期方案保留。当前重建只是让用户在新播放器里观看旧设计，不冒称历史文件原本就使用了现行 TSX API。

## 建议的 12 个 Feature

保留现有九个稳定 ID，新增三个有证据的缺口。以下排列用于产品的设计目录，不是规定所有功能都必须走同一套虚构的八步流程。

| ID | 主题 | 已有材料 | 建议呈现 |
| --- | --- | --- | --- |
| `workbench_origin` | 最初的工作区减负 | `_v1/joplo-self`、D32、D39 | 历史 A/B/C 的可操作重建，明确 B 当时被采用，后来被新布局替代 |
| `authoring_model` | 文件怎样成为产品设计 | PRD、D21–D35、ADR-0002 | 从 JSON/patch 到 TSX + Git 的真实方向调整，展示一次局部功能修改 |
| `home` | 首页、项目与功能 | `joplo-board/features/home`、D39、D55 | 原先草图中的首页与后来视觉整理；空状态、切项目、目录失效 |
| `player` | 演示页的信息结构 | `joplo-board/features/player`、D39、D55、D61 | A 按方案 / B 按情况，采用 B 后的细节迭代 |
| `views` | 层级、导演与取景 | `joplo-board/features/views`、D43–D46、D60、D69–D70 | A 切换 / B 并排的取舍，层级模型和镜头的后续修订 |
| `frames` | 终端与手机外框 | `joplo-board/features/frames`、D40、D44 | 用正式组件替换临时拼装；从设备切换收敛为每页面固定设备 |
| `npm` | 仓库外怎样开始使用 | `joplo-dist/features/npm`、D36、D38、D54、D65–D66、D72–D73 | A 单包 / B 轻入口与作用域包；包名、导出安装和发行流程的实际调整 |
| `skill` | Agent 怎样拿到正确用法 | `joplo-dist/features/skill`、D37、D64–D65、D71 | A 输出 / B 指针 / C 复制，后来演变为官方薄技能和按需主题 |
| `voice` | 演示旁白与声音 | `joplo-voice`、D74 | 零配置朗读、供应商升级、等待声音、失败兜底与试听反馈后的调整 |
| `share_scope` | 只分享允许别人看的部分 | `joplo-share-scope`、D75–D76 | 深链接为什么不保密，构建裁剪的选择，借用元素与独立分享记录 |
| `review` | 反馈怎样回到 Agent | `joplo-local-review`、D77–D78 | 浮层原型、真实实施后的可拖动入口、版本绑定和监听恢复 |
| `feature_diff` | 怎样看见一个 PR 改了什么 | `docs/feature-diff`、`4603038`、`397310e` | 固定基线、稳定步骤身份、单/双栏、无法匹配和重新对齐的实际取舍 |

“整个产品”是这些功能的统一目录与共享项目，不要求把无关功能的场景强行串成一个端到端操作，也不把 `camping`、`invite`、`agent-arch` 这些独立业务演示改名成 Joplo 的自身功能。

## 每个 Feature 的设计证据

### workbench_origin：让原型成为主角

- **原始问题**：打开方案时，原型被侧栏和检查器挤压；需要保留规则追溯，又让人先看懂画面。源为 [v1 项目](../../examples/_v1/joplo-self/project.joplo.json) 的 `feat_focus`。
- **真实备选**：`opt_fold` A“保留三栏，默认收起”；`opt_mode` B“模式决定信息量”；`opt_anno` C“规则就地标注，情况即场景”。当时的 patch 文件仍在同目录 `patches/`。
- **决定与迭代**：D32 明确记载用户比较 A/B/C 后选 B；`9809bde` 实现 B 的演示/审阅布局；`2bd1236` 归档旧 JSON 项目；D39 后来取消双模式，采用左栏与检查抽屉。
- **当前边界**：当前 CLI 不读取 v1 JSON（[归档说明](../../examples/_v1/README.md)）；该项目的 `decisions` 对象为空，不能伪造一个当时不存在的机器审批记录。采用 B 的证据是 D32 的文字记录。
- **呈现原则**：重建三种布局的实际可点击行为，标题明确“历史方案”，结果区说明“当时采用 B；后来由 D39 替代”。不将 B 重新宣称为今天的最终工作区。

### authoring_model：权威源从受控 patch 转为 TSX 文件

- **原始问题**：想法需要迅速成为可看、可局部修改的功能演示；作者需要规则与画面保持一致。见 PRD 1.1–1.4、D9、D17、D25。
- **实际方向变化**：早期 JSON 项目及 apply/修订/回执方案在 `_v1` 中；D21–D30 改为类 Hugo 的写/看分离、路径优先、TSX 收集 IR、Git 管版本。D35 又把组件词汇改为 Mantine。
- **提交**：`d9332f4` 引入 TSX/IR v2 并退役 apply/锁/回执；`7d6bd94` 迁移检查与 CLI；`d1f9d5a` 切换 Mantine 词汇。
- **当前证据**：[ADR-0002](../adr/0002-hugo-like-authoring.md)、`packages/core/src/compile.ts`、`packages/kit/src/`。TSX 作者模块在本机加载时执行，浏览器只消费 IR；不能照搬旧 D18 的“不执行任何作者代码”来描述本地加载边界。
- **未决/缺失**：没有找到一个现成、完整的“创作方式 A/B”可操作自设计原型。可据这些确实发生的方向调整新增重建场景，但应标明依据文档重建，不虚构当时的对比截图或用户点击记录。

### home：首页的项目与功能

- **原始问题与方案**：[home 定义](../../examples/joplo/features/home/feature.ts) 要让一个看板记住多个项目，切项目后显示功能；只有一个已保存方案 `a-recent`，不应为了凑数补“历史 B”。
- **真实迭代**：`f9cc713` 按用户草图加入首页原型；D39 固定单进程和最近项目；`86e67c7` 实现；D55 的 Pen 方案继续整理视觉，`dad74d6` 实现首页/全屏/发布站。
- **可复用场景**：首次空列表、切项目、第二终端加入、目录失效、编译错误、发布站隐藏本机信息。
- **当前实现**：`packages/web/src/board/Home.tsx`、`home-model.ts`、`packages/server/src/hub.ts`。原型里的示例目录和项目都是模拟数据，不是用户本机的真实清单。
- **待核对**：原型 `remove_scope` 问题是早期未决项；有无 Finder 入口应查当前实现，不能仅因原型仍留问题就宣称产品尚不能移除项目。

### player：演示页按什么组织

- **真实备选**：[A 按方案](../../examples/joplo/features/player/options/a-by-option.tsx)、[B 按情况](../../examples/joplo/features/player/options/b-by-case.tsx)。D39 与 `a8dbe9a` 记载选 B；原型 `pick: b-by-case` 与记录一致。
- **迭代证据**：`86e67c7` 实现情况分组/检查抽屉；D55 / `b3253bc` / `3054a0a` 整理外观浮层、舞台层级标签、时间线；D61 / `1564840` 增加场景封面、字幕角色与全屏过渡。
- **当前实现**：`packages/web/src/board/App.tsx`、`CaseNav.tsx`、`InspectDrawer.tsx`、`packages/web/src/player/controls.tsx`。
- **旧信息警告**：原型 still-open 的 inspect 手势、发布站导出问题不等同当前未实现。当前页面的 UI 要依据实现校对，早期原型保留为历史阶段。
- **缺失证据**：原型中并没有每轮完整版本快照；后续 D55/D61 需引用各自提交/设计文档，不能创造逐次人工确认事件。

### views：一次看一层，如何跟随导演

- **真实备选**：`66e805d` 新增 A 切换层级 / B 并排两层；`e1566fa` 与 D43 记载选 A。A 保留空间，B 便于并排对应但压缩每层。
- **真实反馈与修订**：D45 / `4c7cea8` 改为独立层级页面，取消自动全景；D46 / `1f55335` 增加手动缩放平移、阅读节奏、解说；D55 恢复当前层高亮并加导演角标；D60 / `699afe7` 改为书签标签；D69 / `9522af2` 以稳定图布局与取景取代 D47 的节点移动；D70 / `01074ff` 增加叙事焦点。
- **当前实现**：`packages/core/src/focus.ts`、`packages/web/src/player/cameraFor.ts`、`packages/web/src/renderer/camera-math.ts`，`packages/web/src/player/` 与图表运行时。
- **重要过时内容**：现有 `views/feature.ts` 的 `layer_decl` 仍声称自动“全景”，已被 D45 取代；原型“只重放一层”与当前播放器能力需分开标示，不能照搬为已实现。
- **未决项**：当时的 `skip_idle` 记录是设计问题，不构成今天的默认实现契约。

### frames：为真实表达补正式组件

- **问题**：终端和手机外框不应由每个原型重复拼装。D40 明确要求先补正式表达能力，再拿它画 Joplo 自己。
- **已有方案**：`a-builtin`，没有已保存的竞争备选。`09c5f1b` 加入 Terminal/Phone；`072ae3f` 让原型改用正式组件；`570a67d` 调整手绘终端与手机安全区。
- **实际修订**：D44 / `fb8d4aa` 删除同一原型电脑/手机切换，每个页面固定设备；需要手机则独立设计对应页面。原型已有反映该决定。
- **当前边界**：`viewport: mobile` 与终端组件是演示的表达能力，不是自动把任意桌面设计转换成移动版。其他外框仍是原型中的待询问事项，不能写成路线承诺。

### npm：从仓库项目到可安装产品

- **真实备选**：A 单包 `joplo` 与 B 轻入口 + 作用域 SDK，见 [npm 示例](../../examples/joplo/features/npm/feature.ts)。D36 / `abedf48` 记载选 B，`3904c6d` 实现。
- **真实迭代**：D38 / `1a33f32` 因组织不可用改到 `@tokenroll`；D54 / `997c0ff` 再改到 `@joplo-app`。D65–D66 / `d1cebdc` 将浏览器导出依赖搬到 JOPLO_HOME，保护用户项目；D72 / `e6d56dd` 增加自动发布，D73 / `c8b6ac6` 改为显式推 tag 才发布。
- **当前实现**：`packages/joplo/`、`packages/cli/src/`、`scripts/release.mjs`、`.github/workflows/release.yml`。各包基线版本为 0.2.12，不等于新合入的 diff 已发布。
- **历史文本警告**：A 方案的 0.1.0、约 14 MB、旧包结构是当时演示/估算，不能展示为当前下载大小；`first_version`、`mantine_first` 已有后续决定，保留时须标“早期问题已解决”。

### skill：让 Agent 读到对应版本的用法

- **真实备选**：A 打印用法、B 安装薄指针、C 复制正文；D37 / `abedf48` 记载选 B；`6521a50` 实现主题化用法、用户修改保护、guide 兼容。
- **实际反馈与调整**：D64 根据两个从零使用 npm 版的 Agent 试验暴露心智模型、`when`、HTML 回退、绑定和截图问题；`daa3eb0` 引入官方薄技能和单一生成模板。D65 修正固定技能版本 URL；D71 / `834ce5c` 明确“演示产品功能，不是 PPT”。
- **当前实现**：`packages/core/src/agent-skill.ts`、`guide.ts`、`scripts/build-skills.ts`、生成的 `skills/`。不能继续把当前安装结果说成“约 10 行指针”；D64 已明确替代。
- **待保留的边界**：技能不能替代实际渲染与回放，不应让 Agent 在缺能力时静默转成任意 React 应用。原型 A/B/C 留作真实选择的历史。

### voice：从朗读字幕到短旁白

- **问题/方案**：D74 与 [voice 定义](../../examples/joplo/features/voice/feature.ts) 记录零配置浏览器朗读、外部供应商升级、人的操作优先、声音长于画面时等待。
- **实际迭代**：`b24b768` 实现浏览器/供应商、narrate/say 与音频随分享；`69102f3` 根据试听调整旁白规范并同步原型；`f76dd5b` 修复切供应商后状态、重复生成和 profile 存储位置。D74 记录“可以边放边生成”等反馈。
- **当前实现**：`packages/core/src/voice.ts`、`packages/server/src/voice.ts`、`voice-http.ts`、`packages/web/src/runtime/voice.ts`、`board/Voice.tsx`。
- **重要边界**：默认静音、生成兜底与 profile 行为依据实现核对；视频带声音仍是第二期。旧 feature 留有 speed/site_default/other_locales/git_cache/profile_in_config 问题，不能全部当成当下仍未解决，也不能伪造每一条的人类确认。
- **公开构建风险**：此原型基线没有 `pick`，普通 publish 会跳过整项；整理时不可为“凑齐公开列表”静默捏造采用决定。

### share_scope：隐藏入口不等于保密

- **最初问题与真实决定**：D75 记录用户要分享一个 feature 或其中一条“链路”，澄清为场景与保密；原型看过后同意实现。`098cb85` 是决策/原型提交，`944a1cc` 实现。
- **已有设计**：`a-prune`；场景演示深链接仍含全项目 → 构建裁剪 → 借用依赖元素 → 同范围重新分享 → 错误 ID 失败。`pick` 与 D75 记录一致。
- **扩展**：D76 由同一实现加入看板发布浮层、默认当前场景、未登录时复制 CLI 命令，不需要另造一段“历史 A/B”。
- **当前实现**：`packages/core/src/scope.ts`、`packages/cli/src/cloud-share.ts`、`packages/web/src/board/CloudPublish.tsx`。
- **边界**：作者 CSS 仍整份分发；共用基础页面保留，借用贡献子树明确报告。这里的“保密”是范围裁剪，不是登录控制或不可转发的私密链接。D75 不做跨 feature 自动串链。

### review：浮层、确认与 Agent 监听

- **原始设计**：`joplo-local-review` 有一套 `a-session`，五条场景为反馈后确认、直接确认、切页定位、多实例隔离、断线补收。没有已保存的多备选版本。
- **真实反馈与实现**：D77 记载“不挤压页面”的浮层、“点击反馈图标直接结束 review”，随后增加可拖动入口与 1–5 秒主动读取/回执。`24494f6` 实现本地评审、反馈监听并准备0.2.12。D78 统一 `feedback` 主入口并以 10–30 秒 Share 轮询兼容 Cloud。
- **当前实现**：`packages/core/src/local-review.ts`、`local-review-files.ts`、`packages/server/src/local-review.ts`、`packages/web/src/board/LocalReview.tsx`、`useReviewDrag.ts`；命令文档见 `docs/cloud-feedback-watch.md`。
- **过时原型须保留身份**：原 README 声称“未实现、无 pick、会话协议待评审”，与当前源码不符；feature 的 session/context/durability/approval 仍为拟议。应标示“当时的设计稿”，另展示后来已实现的机制，不能把当时稿件直接改写成“每条规则都经用户确认”。
- **能力边界**：确认绑定方案版本、不等于反馈已实现，也不自动 pick/发布；旧确认不沿用新版；Share 轮询可能漏掉期间消失的记录，无云端 seq/SSE，不承诺完整事件历史。

### feature_diff：比较实际演示变化

- **问题与来源**：当前基线的 [功能差异文档](../feature-diff/README.md)、合成 fixture 和 `4603038` 为可追溯材料；没有找到早期独立 `examples/joplo-*` 设计目录。可据现存规格和实现新增自设计 Feature，并明确这是本轮补入的设计表达。
- **有据的取舍**：固定 PR 首次基线；旧无 key 项目保守匹配；重复动作 uncertain；新增/删除单栏、修改双栏；恢复完整前置状态后只展示变化；Cloud 只验证 transport，Core 定义业务 manifest；构建与持有凭证的发布隔离。
- **真实后续修复**：`397310e` 修正某一侧独立切场景后仍显示对齐，要求两边新回执；`8b24ceb` 只修 CI 上传测试时序，不应被包装为产品设计方案。
- **当前实现**：`packages/core/src/feature-diff.ts`、`step-identity.ts`、`packages/server/src/feature-diff*.ts/js`、`packages/cli/src/feature-diff.ts`。本地包与 fixture 不能冒充已发生的真实 PR 或线上发布结果。
- **后续线上证据（2026-11-08）**：本仓库临时 PR #15 已实际验证自动预览、第二次推送原评论更新、比较起点不变以及关闭后两版链接 410。固定主分享由 main CI 更新；凭证隔离、账号归属和账号级并发约束见 [自动发布说明](CI-CONTRACT.md) 与 [验收记录](VERIFICATION.md)。这组证据与原先合成 fixture 分开记录，未发布新的 npm CLI。
- **缺失/待验收**：独立初版视觉稿的来源不在此 Joplo worktree；不能创造一段原始用户评审。该基线文档明确尚未发布新 CLI、根跨版本 Agent 协商未提供；生产状态需另查 Cloud，不由本目录推断。

## 公开页面为什么不能直接依赖规则与问题字段

当前行为由 `packages/core/src/compile.ts` 和 `packages/server/src/build.ts` 的 `publishPayload` 确定：

| 方式 | 保留 | 排除 / 重要约束 |
| --- | --- | --- |
| 本地 `dev` | 所有方案、情况、规则/来源/确认、问题、取舍、源位置 | 是实际作者工作区，加载作者模块等同本机执行代码 |
| 普通 `publish` / `build` | 每个 feature 的 picked option、画面、场景与字幕、可演示的角色/层级/镜头 | 无 pick 的 feature 整项省略；规则、情况、问题、源位置、元素备注、取舍/decisionFocus不进入公开产物 |
| `review` 构建 | 所有 feature/option 的画面与场景，含未pick内容 | 同样剥离创作字段；它不是 dev 数据的公开拷贝 |
| 私有 review manifest | 单独请求体可带规则、问题、取舍等评审内容 | 不是静态资产，不随公开分享页取得；有边界与体积上限，不能为展示历史直接公开 |

仅把五个目录合并，然后 `joplo build`，用户会看不到未选方案、取舍和不少未 pick 的功能。建议使用现有表达能力，不改业务 schema：

1. 统一项目保留真实 `feature/options` 用于本地创作与对比；历史原文件与 Git 提交作为可追溯来源。
2. 若要普通公开分享也展示过程，为每个 Feature 增加**明确选作公开叙述的设计回放方案**，把已核验且适合公开的动机、方案差异、决定和限制写入画面、场景字幕或 `explain`；不是把私有规则表直接拷贝为资产。
3. 历史 UI 的回放仍展示具体操作与结果，使用现有 `flow/when/set/shot/layer/Terminal`，避免变成整屏文字 PPT（D71）。例如 B：进入演示 → 切审阅 → 打开规则；C：选择原型标注 → 展开对应规则。
4. 给这些回放写稳定 `.key()`，方便今后对同一个设计过程做 diff。区分“演示中选择历史方案”与“真正修改作者项目的 pick”；前者只改演示状态，不能假装触发实际审批。
5. 普通公开叙述的 pick 应说明是**本轮选择展示哪个整理稿**；原始人工决定照证据单独叙述。选一个用于发布的回放方案不等于替原用户批准所有历史/待定产品规则。
6. 若本轮只交付可运行统一源码与本地 Board，应明确这个范围；“任何用户已能在线打开完整设计历史”必须在实际公开构建、上线和浏览器检查后才能声称。

## 证据可信度和后续维护

- 本目录列出的提交均已通过 `git merge-base --is-ancestor <sha> d566856` 验证可达主线；没有拿旁支未合入实现当现状。
- `DECISIONS.md` 是当前能找到的人工决定文字记录；它不等同带身份认证的签署。旧 JSON 的空 `decisions`、原型中的 pending 规则、以及不存在的截图应原样承认。
- 持续迭代时，先在此项目新增/调整真实 Feature 的方案与场景，再根据用户反馈更新同一份源文件；决定理由与 commit 保持可追溯。不要每次新建另一套 `joplo-xxx` 项目。
- 本次未访问生产服务、未发布任何分享。证据盘点后补入 `workbench_origin`：保留三种原生方案，B 的公开回放中可操作地比较 A/B/C，并说明 D32 与 D39 的先后关系。
- 局部验证：统一项目 `joplo check` 为 0 error（其他历史/待定方案有 warning/info）；`tsc -p examples/joplo/tsconfig.json --noEmit` 通过；实际 `joplo render` 检查 B.history 第 7 步的 C 标注布局与第 9 步的采用/后续替代画面。最终跨 Feature 集成、全仓 gates 与公开产物验收由协调者执行。
