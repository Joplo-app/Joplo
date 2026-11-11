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
| `mobile_watch` | 手机上怎样看分享 | `examples/joplo/features/mobile_watch`、D79 | 竖屏被挤成竖条的现状、视频式播放页、横屏沉浸、iPhone 伪横屏与连续播放 |
| `content_i18n` | 观众怎样看到自己语言的作者内容 | `examples/joplo/features/content_i18n`、D57、D74、D84 | 加一种语言、观众自动匹配与退回、过期译文、重新发布沿用音频、没有音频时浏览器朗读（设计阶段，未实现） |

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

- **真实备选**：[A 按方案](../../examples/joplo/features/player/works/a-by-option.tsx)、[B 按情况](../../examples/joplo/features/player/works/b-by-case.tsx)。D39 与 `a8dbe9a` 记载选 B；原型 `pick: b-by-case` 与记录一致。
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

### mobile_watch：在手机上像看视频一样看分享

- **最初问题与真实决定**：D79 记载用户在手机上看真实分享（2026 中期选举讲解）后指出体验差，要求横屏、移动端适配和自动播放下一个场景。原型直接在本项目新建，用户在本地看板确认方案 A，并回复“可以，就按这个方案搞”；三个待定点（横屏字幕位置、电脑也连续播放、iPhone 伪横屏）按默认处理。
- **已有设计**：`a-video`；四个场景为现状、从头看到尾并横过来看、iPhone 锁竖屏、最后一章播完。为画横放手机先给 `Phone` 加了 `landscape`。
- **当前实现**：`packages/web/src/player/WatchView.tsx`、`watch.ts`、`fit.ts`（`videoStage`）、`runtime/demo.ts`（`autoNext`）、`site/SiteApp.tsx`。
- **边界**：只在发布站且设备是手机时启用；本地看板与嵌入模式不变。iPhone 的伪横屏依赖旋转画面，地址栏和系统手势仍在；真机效果以发布后的站点为准。

### content_i18n：作者内容按观众的语言

- **最初问题与真实决定**：D57 只翻译界面，作者内容不翻译。2026-11-08 用户提出分享链接应按观众的环境和语言给出本地化内容，并包括 TTS；随后选定写法 A（原文作为 key，译文放 `locales/`）、界面跟随观众且内容退回、config 新增语言字段、第一版只做语言、机翻初稿由当前 Agent 完成；又澄清 Cloud 像 YouTube，只存分享出去的作品。记录见 D84。
- **已有设计**：`a-locales`；六个场景为加日语、日语观众自动匹配、葡萄牙语观众退回英文、原文改动后译文过期、换电脑重新发布沿用音频、英文没有音频时浏览器朗读。
- **当前实现**：`packages/core/src/content-i18n.ts`（收集、换语言、退回、裁剪）、`compile.ts`（locales 校验与译文检查）、`load.ts`、`packages/cli/src/i18n.ts`（`joplo i18n add`）、`packages/server/src/voice.ts`（按语言选音色、打包、`reuseSharedVoice`）、`packages/cli/src/cloud-share.ts`（`previousShareVoice`）、`packages/web/src/i18n/content.ts`、`board/ContentLanguage.tsx`、`site/ContentNotice.tsx`；英文译文示例见 `examples/invite/locales/en.json`。
- **原型确认**：用户看过原型后定下：退回默认语言；语言菜单列出全部语言，有内容的打 ✓；分享清单记「缓存键 → 音频哈希」。
- **边界**：按国家区分内容放到第二期。

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
| `review` 构建 | 所有 feature/work 的画面与场景，含未pick内容 | 同样剥离创作字段；它不是 dev 数据的公开拷贝 |
| 私有 review manifest | 单独请求体可带规则、问题、取舍等评审内容 | 不是静态资产，不随公开分享页取得；有边界与体积上限，不能为展示历史直接公开 |

仅把五个目录合并，然后 `joplo build`，用户会看不到未选方案、取舍和不少未 pick 的功能。建议使用现有表达能力，不改业务 schema：

1. 统一项目保留真实 `feature/works` 用于本地创作与对比；历史原文件与 Git 提交作为可追溯来源。
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

### share_visibility：发布前选择公开还是私密

- 依据：D85 的公开与私密、CLI 强制选择、作品集与自动 SEO 决定（决策分支 `DJJ/decision-capacity-show-tts`），以及本轮 D85 第二阶段客户端任务契约。
- 新增原生 Feature `share_visibility` / Work `a-explicit`：整项目公开、私密加独立评审版、范围只能私密、更新已有私密链接。它是按当前已决定行为制作的演示，不是历史评审记录，也不代表云端已上线。已有 Feature IDs 不变。
- 该任务不做密码分享；Pen 工具因未打开设计文档不可用，画面沿用既有发布浮层与原生组件。实际浏览器/移动端手动检查清单在 PR 与 docs/web.md，未运行浏览器 E2E。

### P1-E 模型资产（2026-11-08）

新增稳定功能 ID `model_assets`，依据 DECISIONS D90 与 docs/plugins.md 第 17 节整理当前实现。三个原生场景展示明确付费、Git/离线复用、断网恢复；不会真实调用供应商。普通构建只展示其 picked 方案，未新增历史批准或修改旧归档。

### M / D93 配乐（2026-11-09）

新增稳定 Feature `music` / Work `a-render`，依据 D93 与本任务已实现的 SoundFont 管线，展示 marker 核对、离线音色缓存恢复、未知 marker 修复。复用现有终端页面、Cmd 与输入动作；终端结果显式标为示意，不执行 shell、不下载或发布，不伪造新 UI 评审批准。Pen 未打开文档，无法操作，因此沿用项目已有终端视觉。可复用的曲式/鼓谱/RMS 与 LUFS 区别/未经人耳验证报告已同步插件技能。

### 2026-11 本轮创作与导出能力：根据源码整理，尚未发布

此节是对本轮 issue 与整合分支源码的整理，不是历史原型的人工批准记录，也不覆盖上方 `d566856` 的历史核对基线。未查询 npm registry 或生产服务；Cloud reader 的本地契约更新不等于已部署，十二包代码与 tarball 冒烟通过也不等于已发行。

保留原 Feature / Work / Scenario IDs，在现有 picked 作品追加 `source_update` 场景；原操作场景及历史备选继续保留：

| 稳定入口 | 本轮可见内容 | 来源与状态 |
| --- | --- | --- |
| `voice.a-read-along.source_update` | 作品/章节旁白 dry-run 范围、`narrate(false)` 显式静音、`pace.systemLead` 与 `hold` 的前后节奏 | Issues #72 / #73 / #95；`packages/cli/src/voice.ts`、`packages/kit/src/index.ts`、`packages/web/src/runtime/demo.ts`；本地已实现与测试，不生成真实旁白 |
| `frames.a-builtin.source_update` | 原生逻辑画幅与输出像素分离、去外框、Canvas 内 diagram 高亮与字号、宿主覆盖层安全区 | Issues #75 / #77 / #79 / #87；`packages/server/src/render.ts`、`capture.ts`、`plugins/diagram/src/`；本地已实现，命令为示意 |
| `film_form.a-chapters.source_update` | 实际播放时间轴、逐帧导出、可恢复检查点、只读素材审计与状态边界 | Issues #71 / #77 / #79 / #80 / #85 / #86 / #88 / #90–#92 / #96；`packages/server/src/film.ts`、`timeline.ts`、`asset-usage.ts`；本地已实现的契约整理；#85 已通过真实横竖画幅、字体 Range 及提交/入场/漂移/镜头节点动态采样验收，容差 50ms；仍只给几何告警和明确 unknown |

共用 `examples/joplo/shared/production/update.tsx`，使用既有 UI 组件、状态绑定、系统步骤和稳定步骤 key。展示的命令不会执行，不请求付费资源、不自动清理素材、不上传或发布。素材引用、发布入包与实际采样可见性分别叙述，动态与未知情况不冒称未使用。恢复明确要求先有检查点，仍重放引擎恢复状态，不虚构任意时刻跳入能力。

公开文字主动写在场景画面里，不依赖私有 review manifest。没有新增 `origin: user / status: confirmed` 规则，也没有替原用户批准未决项。当前 npm/Cloud 发布状态与版面审查边界直接显示，后续验收有新证据时应更新此处及同一场景，而不是悄悄改写历史场景。

本次整理验证：`joplo check examples/joplo` 为 0 error（保留历史方案既有的 16 warning / 40 info）；项目类型检查以 Node 类型声明执行通过；普通 build 通过，129 个文件，三个 `source_update` 场景分别含 3 / 2 / 4 步并进入公开构建。使用当前 checkout、独立 JOPLO_HOME 的静态渲染逐帧核对三组场景，宿主角标和旁白条未遮挡正文。Pen 当前连接的是另一 worktree 的共享画布，因此未修改该画布，沿用既有 UI 组件与视觉约定。没有启动或停止其他 worktree 的看板，没有生成付费声音或素材。

### 2026-11 资源局部生成范围（根据源码整理，待本轮发行）

保留 `model_assets.a-explicit.generate`，在既有生成流程中追加“限定当前作品”系统步骤，展示 `resources --work <qid> --dry-run`。来源为 issue #117 与本轮 `loadAuthoring` / `resources-run.ts` 源码及真实 CLI 离线测试，不构成人工批准记录。未选作品模块不求值；共享配置、布局和路由仍需有效；未使用的共享页面资源不会扩大生成计划，跨作品接续依赖未包含时明确报错。这里的命令是场景文字，不执行生成、不请求付费资源，也不表示本轮已发布。

沿用既有模型状态页、组件和场景，不调整布局或新增平行项目。可复用的范围选择与依赖失败边界已同步引擎 authoring 及 3D generation 指南；资源对象应直接传 prop、不能插值成 CSS URL 的经验已同步 plugins 与 UI 指南。

本轮验证：`joplo check examples/joplo` 为 0 error / 16 warning / 41 info；当前 checkout 普通 build 通过。修改仅追加既有系统步骤与状态文案，未修改页面布局。资源与技能相关 72 项测试及仓库类型检查通过；实际读取 authoring/plugins/ui/scene3d-generation 技能，并运行限定作品的 CLI JSON dry-run。

### 音轨增量：根据本轮源码整理，尚未发行

在既有 `music.a-render` 追加 `playback_policy`，复用终端 Cmd 和状态绑定，呈现 issues #93 / #109 的显式 startDelayMs、duck 豁免与每轨 maxRetiring。未修改 voice 功能场景，未新增人工批准记录；命令是文字示意，不执行 Alda、不生成付费声音。原计划与剩余等待、源位置、自然截止及轨级退场边界已同步引擎 plugins、Alda 与 media 指南。只追加文案和既有组件，未调整视觉布局。

本轮验证：当前 checkout `check examples/joplo` 为 0 error / 16 warning / 41 info，普通 build 129 文件通过；独立 JOPLO_HOME 静态截图核对 `music.a-render.playback_policy#1` 正文与命令均完整，既有宿主角标覆盖导航链接的提示未因本轮改变。Core/播放器/插件媒体测试通过，技能生成及安装一致性测试通过，实际读取 plugins / alda / media 指南。离线 PCM WAV 的 Chromium 双事件、跨章录制保留全部延迟/duck字段及独立音频资产，400ms计划延迟实测提交到声能阈值387.07ms，按现有 timeline 50ms 容差验收；这是本机录制证据，不新增声学精度承诺，也不代替人工听感审查。未调用 TTS、Alda 渲染或付费生成。

### #104 视频采样提交验证（当前源码，待本轮发行）

`works/sampling-proof.tsx` 是独立实现验证作品，入口为 `sampling-proof.decode` / `sampling-proof.relay`，不是 `film_form` 的第三种章节布局方案。原 `film_form` 的方案、pick 与稳定 ID 不变。场景使用本地产生的编号视频与原生 Video，两个实例共享引擎时钟；逐帧 film/frames 等解码与 canvas 提交后采样，实时 video 录制保持原生播放，不冒称逐输出帧握手。素材来源见 `examples/joplo/assets/SOURCES.md`。

从当前 checkout 核对：

```sh
pnpm joplo check examples/joplo --format json
pnpm joplo render examples/joplo --scenario-id sampling-proof.decode --chain --frames-out scratch/output/sampling-proof-frames --fps 10 --voice off --viewport 1280x800 --no-frame
```

本地 check 为 0 error / 16 warning / 41 info；以上公开 frames 命令成功导出 35 帧、3400ms，验证独立作品与连续章节可运行。编号源视频逐帧像素、双视频、暂停恢复、跳转、解码失败及清理的回归在 `packages/server/test/sampling-video.test.ts`；沿用 50ms 观察容差，不承诺更严格调度或源帧插值。可复用的采样/实播区别与失败恢复已沉淀到引擎 demo/plugins 和 AV media 技能。本验证不执行付费生成、上传或发布。
