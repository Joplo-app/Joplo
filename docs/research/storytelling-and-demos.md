# 讲好一个演示：叙事、节奏、字幕与 PM 视角（调研与落地）

日期：2026-11-06。来源：用户 2026-11-06（“提供足够强大、足够好用的系统给 Agent，帮助快速构建演示”），以及用户当天的更正：不新增“用户故事”字段或 API，而是用 PM 写用户故事的视角审视 Joplo 现有能力，补上接不住的地方。决策见 [DECISIONS.md](../../DECISIONS.md) D67、D68。

逐仓库的原始笔记（每条结论都带仓库路径、行号和不超过 25 词的原文引用）在 [storytelling-sources.md](storytelling-sources.md)。下文引用写成 `仓库:路径 L行号`，节号如“§5-8.5”指笔记第 5 节（仓库）第 8.5 条。

| 仓库 | 提交 | 是什么 |
| --- | --- | --- |
| feitangyuan/onetake | abb6d17 | 产品 / 技能宣传短片与带旁白的功能演示（HTML 动画 + 录屏） |
| Pluviobyte/video-production-skills | e19f1f3 | 一组动效视频技能，核心是“反 PPT 闸门”与节拍图 |
| farhan-syah/motion-video-skill | 0a21eb7 | 从想法到成片的动效视频流程：概念、分镜、旁白、验收 |
| linyqh/speclip-skills | cb51e23 | 短剧解说与字幕排版技能（中文为主） |
| deanpeters/Product-Manager-Skills | cfcb697 | PM 技能集：用户故事、拆分、故事地图、JTBD、PRD |

只读：克隆到系统临时目录，只读文字，没有运行任何脚本。

## 1. 结论与落点

“落点”一栏：**技能**＝写进 `npx joplo skill story`（及 cases / check）；**check**＝新的诊断；**命令**＝`npx joplo outline`；**看板 / 发布站**＝默认呈现；**组件**＝D68 目录组件；**焦点 worker**＝归 joplo-narrative-focus（每段时间看哪里、聚光、标注气泡、强调框）；**不采纳**写明理由。

### 1.1 先规划，再动手

| 结论 | 出处 | 对 Joplo 意味着什么 | 落点 |
| --- | --- | --- | --- |
| 先写规划稿（节拍表 / 分镜），实现照着它做；规划稿是唯一真相源 | onetake:references/reference-deconstruction.md L57；motion-video-skill:references/direction.md L185；speclip:drama-explainer/SKILL.md L55（笔记 §6.1-1） | Agent 写 TSX 前先回答：受众、要讲清的 1–3 件事、每个场景一行（Given → When → Then、怎么开场、怎么收尾），给用户看 | 技能（story §1；起步顺序第 2 步） |
| 先给 2–3 个候选框架再选 | onetake:SKILL.md L54–71；motion-video-skill:references/concepts.md L10–11（§6.1-2） | 方向不确定时给两三句不同的讲法让用户挑 | 技能 |
| 只问少数会改变方向的问题，并给默认答案 | motion-video-skill（≤5 个问题，每个带默认）等（§6.1-15） | 与现有 cases 技能“只问关键问题”一致；story 里要求“每个问题带默认” | 技能 |
| 不要逐个展示功能，要讲一条故事；“a feature tour … reads as slides” | onetake:SKILL.md L84–88；motion-video-skill:references/direction.md L79；video-production-skills:ai-motion-director/references/anti-ppt-gate.md（§6.1-3） | 一个场景从入口走到可见结果；不是功能巡游 | 技能（story 开头、起步顺序） |
| 一拍 / 一行 / 一步只讲一件事；一个场景一个 When、一个 Then | motion-video-skill（一拍一个想法）；speclip:playbook（一行一个意思）；Product-Manager-Skills:skills/user-story/SKILL.md L147–151（§6.1-9、§5-8.5） | 字幕一句一事（已有 24 字上限）；场景多个 When 就拆 | 技能 + check（SCENARIO_TOO_LONG） |
| 功能演示 30–60 秒；带旁白最长约 60 秒 | onetake:SKILL.md L7；onetake:references/product-demo.md L3–4（§1-3.1） | 一个场景常见 5–12 步、约 20–60 秒；超过 90 秒（按 1× 估算）提示拆分。阈值取 90 而不是 60：Joplo 是逐步可停的播放器，观众可以暂停，且 4 个官网示例最长 77 秒（见 §4） | 技能 + check |

### 1.2 开场、中段、收尾、转场

| 结论 | 出处 | 对 Joplo 意味着什么 | 落点 |
| --- | --- | --- | --- |
| 开场 2–3 秒内点出谁在做什么；不以 logo 开场，不要“So you open the app…” | motion-video-skill:references/direction.md L98–105；speclip:playbook L27–28（§3-2、§6.1-5） | 第一步或开场过渡卡一句话说清谁想做成什么、为什么 | 技能（story §3） |
| 每个功能用一个看得见的动作证明；原因必须可见，“没有触发就自己变化的页面像屏保” | onetake:SKILL.md L209–210；motion-video-skill:references/direction.md L133–148；Product-Manager-Skills:skills/user-story-mapping/SKILL.md L177–180（§6.1-4） | 每一步落在可见的变化上；结果由步骤效果（set / toast / go）产生 | 技能 |
| 结尾只选一种策略：停在结果上，或预告下一个；落版至少停 1.5 秒 | speclip:playbook L35–36；motion-video-skill:references/direction.md L100（§6.1-6） | 结束在 done + 画面上的结果，或一张要点 ≤ 3–4 条的收尾卡 | 技能 + check（CARD_TEXT_TOO_LONG） |
| 段落交界要有元素留下来，什么都没留下就是换幻灯片 | onetake:SKILL.md L84–88、L200–202（§1-5.1） | 换人、换时间时保留一个延续元素（同一个人、同一份列表）；过渡卡只用于开场、收尾、时间跳跃、换人 | 技能；层级切换的形变动画归焦点 / 镜头 worker |
| 想先给结果当钩子：在原画面上叠一个预览，不要跳过去再跳回来 | onetake:references/product-demo.md L138–140；speclip:drama-explainer/SKILL.md L289、L299（§6.3） | 属于“看哪里、怎么呈现” | 焦点 worker |
| 镜头只在有理由时动；推近 1.6–2.5 倍；界面演示不抖动 | onetake:references/product-demo.md L53–64、L141–142；motion-video-skill:references/building.md L90（§6.1-13） | 镜头取景 | 焦点 / diagram worker（本任务不碰 shot） |

### 1.3 节奏与字幕

| 结论 | 出处 | 对 Joplo 意味着什么 | 落点 |
| --- | --- | --- | --- |
| 字幕在标点处切块：拉丁 ≤42 字符、中日韩 ≤20 字；最多两行 | onetake:scripts/vo_tools.py L183（当文本读）；speclip:portrait-subtitle-layout/SKILL.md L66–72；motion-video-skill:references/narration.md L221（§6.1-10） | 42 拉丁 ≈ 21 个“半字”，与 Joplo“中文 1、其他 0.5、上限 24”的换算一致；现有 CAPTION_TOO_LONG 保留 | 已有（验证） |
| 单条字幕 1–6 秒；每段文字至少停“词数 ÷ 3”秒 | motion-video-skill:references/craft.md L18；speclip（VO 1.5–5.5 秒）（§6.2-12） | 与 Joplo 的 3–7 秒基本重合；五个仓库都没有中文阅读速度数据，8 字 / 秒维持不变 | 不改 |
| 一行一个意思；先写看得见的动作再写含义；主动句；称呼前后一致；每句都要有功能（“不是短，而是没有功能”） | speclip:drama-script-writer/SKILL.md L99–113；speclip:playbook L104–133；motion-video-skill:references/delivery.md L108 | 字幕＝主语 + 动作（“Ana 发出邀请”），explain＝为什么 / 意味着什么，不复述；系统步骤写发生了什么；按钮名与画面一致；不用空话 | 技能（story §4） |
| 换语言要重写不要翻译；提到界面标签时用画面上的标签 | onetake:references/product-demo.md L95–97（§1-4.3） | 字幕里的按钮名与画面文字一致 | 技能 |
| 镜头长度至少差 4 倍，变异系数 < 0.25 就是“节拍器” | onetake:SKILL.md L81；onetake:references/rhythm.md L49（§1-3.2） | Joplo 的 3 秒下限让一串短步骤等长。技能里要求合并琐碎步骤、给关键结果加 explain；**暂不做** CV 提示：现有示例大多是表单逐步操作，CV 天然偏低，会成为噪音 | 技能；check 不采纳（噪音） |
| 停顿要完全静止，“慢推不算停” vs “不能有死帧” | onetake:references/rhythm.md L50、L135 与 motion-video-skill:references/craft.md L77 相互矛盾（§6.2-1） | Joplo 的停留就是阅读时间，取 onetake 的立场；镜头动画在停留前完成（已是 700ms ease-out） | 不改 |
| 不编造内容和数字 | 五个仓库都提到（§6.1-7） | 不编数字；推测写成 ai_assumption 规则（与现有规则来源一致） | 技能 |

### 1.4 验收成片

| 结论 | 出处 | 对 Joplo 意味着什么 | 落点 |
| --- | --- | --- | --- |
| 验收＝关键帧拼图 + 自动检查 + 人工复核问题清单；不看字幕只看关键帧能否看懂 | video-production-skills:ai-motion-director/references/anti-ppt-gate.md L15；motion-video-skill:references/craft.md L10；speclip:evals/review-rubric.md L37–44（§6.1-14） | 交付前：只读字幕从头读一遍；只看关键帧（`npx joplo render --step-id`）；`npx joplo outline` 与 check | 技能（story §5）+ 命令 |
| 封面上的“约 M 秒”由规则算出，不手填；承诺时长前先测量 | onetake:references/product-demo.md L83–84（§1-3.9） | outline 用与自动播放同一份 stepDwell 估算每个场景 | 命令（outline） |
| 字号不低于 26–28 像素 | onetake:references/product-demo.md L52–53；motion-video-skill:references/craft.md L10 | 镜头推近与取景 | 焦点 worker |

### 1.5 用户故事（Product-Manager-Skills）

| 结论 | 出处 | 对 Joplo 意味着什么 | 落点 |
| --- | --- | --- | --- |
| As a / I want to / so that；角色要具体（不是“user”），want 是用户的动作，so that 是动机而非复述 | skills/user-story/SKILL.md L38–51、L119–126（§5-8.1、8.3） | roles 写具体的人；goal 一句话写“谁能做成什么、为了什么”，和方案无关 | 技能 + 看板 / 发布站呈现 roles、goal |
| Given 可以多个，只能一个 When、一个 Then；When 对齐 I want，Then 对齐 so that；Then 必须可测、可见 | skills/user-story/SKILL.md L130–155、L247–252（§5-8.5、8.6） | case 标题＝Given，case.expected＝Then，场景步骤＝When；一个场景一个 When / Then | 技能；outline 与看板显示 expected；CASE_NOT_COVERED 带 expected |
| INVEST；Small 1–5 天；不满足 Valuable 就别拆 | skills/epic-breakdown-advisor/SKILL.md L42–45、L104–160（§5-8.8） | 映射到场景：Independent＝有自己的起始状态；Valuable＝结束在可见结果；Small＝长度上限；Testable＝expected 写清 | 技能 |
| 拆分：先一条薄的端到端主线，再按业务规则、数据、角色、异常各拆一个；不要按步骤拆（PM 仓库内部有矛盾，取 epic-breakdown-advisor） | skills/epic-breakdown-advisor/SKILL.md L58–62、L168–182；skills/user-story-splitting/SKILL.md L39–48（§5-8.9–8.11、§6.2-9） | 每个场景从入口走到结果；高优先级情况超过 5–6 条或两个角色目标不同时拆功能 | 技能 |
| 从故事推异常：乱序、跳过可选步骤；每个异常有自己的验收标准；超过 5–6 条就拆 | skills/prd-development/template.md L493、L499–500（§5-8.18） | 与 cases 的八个维度互补，加进 story 技能 | 技能 |
| 高不确定性时只做 1–2 个学习型故事 | skills/epic-breakdown-advisor/SKILL.md L403–419（§5-8.13） | 方向未定时只做 A/B 的主场景，选定后再补全情况 | 技能 |
| 问题陈述 / 开场：“<角色>想<目标>，但<障碍>” | skills/problem-statement/SKILL.md L38–46（§5-8.17） | 开场过渡卡的写法 | 技能（story §3） |

## 2. 用 PM 用户故事视角审视 Joplo 现有能力

用户的更正（2026-11-06）：不新增 story / acceptance 一类的概念，而是看 PM 用 Joplo 表达需求时哪里接不住。逐项对照：

| PM 概念 | Joplo 已有的字段 | 改动前的呈现（实查代码） | 差距 | 本次改进（不加新概念） |
| --- | --- | --- | --- | --- |
| 角色（As a） | `feature.roles`（名字数组，或 `role()` 键） | 只有键写法、且层级或过渡卡引用时才显示；名字数组写法**在任何地方都不显示** | 评审者看不到“给谁” | 看板演示页左栏、发布站首页卡片与左栏写“面向：角色”；outline 列出角色 |
| 目标与价值（I want / so that） | `feature.goal` | 看板首页卡片、发布站首页与左栏；**看板演示页看不到**；场景封面只写 flow description（多数示例没写，封面只有标题） | 看演示时说不清“解决什么” | 看板左栏顶部写 goal；封面说明缺省时用 goal；技能给出 goal 的好坏例子 |
| 验收标准 Given | `case.title`、`case.dimension` | 情况行显示标题；dimension 不显示 | 可以接受 | outline 显示维度 |
| 验收标准 Then | `case.expected`、`flow('Slice title', { expected })` | 写进 IR，但**看板、check、发布站都不消费** | PM 最在意的“期望结果”写了也看不见 | 看板情况悬停卡写“期望结果”（没写时提示）；CASE_NOT_COVERED 带上 expected；outline 每个情况一行“标题 → 期望” |
| 优先级 | `case.priority` | 写进 IR，**没有任何地方使用** | 缺口汇总分不出轻重 | 情况行的高优先级带「!」；缺口汇总写“高优先级 N”；CASE_NOT_COVERED 标出 high priority |
| 约束 | `feature.constraints` | 写进 dev IR，不显示也不检查；与 rules 重叠 | 两套写法 | 不改（记为已知问题：技能只推荐 rules） |
| 验收覆盖 | `Feature.alternatives[workId].coverage`（由场景推导） | 情况行状态图标、其他方案小标、缺口汇总 | 已有，但看不到“要验收什么” | 同上（expected 进悬停卡）；outline 给出“情况 × 方案”的矩阵 |
| 只演示顺利路径 | — | 只有缺失情况时提示 | 功能只声明 main 情况、所有场景都成功时，什么都不提示（Joplo 要解决的“看不全”） | 新 check：HAPPY_PATH_ONLY（info） |
| 拆分 / INVEST | 功能、方案、场景、fork | 技能里没有方法 | Agent 容易按步骤拆、或一个场景塞多件事 | story 技能的拆分顺序与 INVEST 映射；SCENARIO_TOO_LONG |

结论：Joplo 的 feature / roles / goal / cases / rules / scenarios 已经覆盖用户故事的全部要素，缺的是**呈现**（roles、goal、expected、priority 写了看不见）、**检查**（只有顺利路径时不提醒）和**方法**（怎么从需求拆到情况和场景）。这三处都在现有字段上补齐，没有新增作者 API 与 IR 字段（发布站完整性测试的允许清单不变）。

## 3. check 新提示与噪音实测

新增 4 个诊断，CASE_NOT_COVERED 的说明补充优先级与期望结果（数量不变）：

| 代码 | 级别 | 条件 |
| --- | --- | --- |
| DESCRIPTION_TOO_LONG | warning | flow 的 description（封面说明）超过 30 个“字”（D61 的上限） |
| CARD_TEXT_TOO_LONG | info | 过渡卡副标题 > 48、某条要点 > 24，或要点多于 4 条 |
| SCENARIO_TOO_LONG | info | 单个场景按 1× 估算超过 90 秒 |
| HAPPY_PATH_ONLY | info | 功能只声明了 main 情况，且参与的方案里每个场景都成功（只在 dev IR 上判断） |

评估过、但因噪音不采纳的候选：情况没写 expected（在示例上 9 条 info，改为在 outline 和看板里显示）；单步场景（joplo-dist 有 11 个有意的单步场景）；字幕含多句（示例里只有 2 处，且都合理）；停留时长 CV < 0.25（表单类演示天然偏低）。

实测（`npx joplo check`，改动前 → 改动后，只列有变化或新增的代码）：

| 项目 | 新提示数量 | 说明 |
| --- | --- | --- |
| examples/camping | 0 | |
| examples/agent-arch | 0 | |
| examples/invite | 0 | 样板更新后 CASE_NOT_COVERED 9 → 8（revoked 有了场景） |
| examples/joplo-board | 0 | |
| examples/joplo-dist | 0 | |
| 官网 showcase/camping | 0 | |
| 官网 showcase/team-invite | 0 | |
| 官网 showcase/agent-architecture | 0 | |
| 官网 showcase/intelligent-ui | 4（CARD_TEXT_TOO_LONG，info） | 收尾卡 6 条要点、两张卡单条要点 28 字、一张副标题 58 字，确属过长 |

`packages/core/test/narrative.test.ts` 覆盖每条新诊断的边界（恰好等于上限不提示、超过一点就提示、空场景不提示、发布 IR 不误报）。

## 4. 节奏数据（4 个官网示例 + examples/）

按与自动播放同一份 `stepDwell` 估算（1×）：官网示例的场景 6–19 步、21–77 秒，几乎都以过渡卡开场和收尾；仓库示例 1–15 步、3–49 秒，多数没有开场 / 收尾卡（它们是功能原型而非对外演示）。所以“开场 / 收尾卡”只在 outline 里显示，不做 check 提示；单个场景的提示阈值取 90 秒，比所有现有场景都长。

## 5. UI 组件盘点

方法：逐个读 4 个官网示例和 examples/，找作者用 Box / Group / Paper + 内联 style 手工拼出的常见界面，按“出现频率 × 拼凑代码量 × 观感影响”排序；两次新 Agent 测试（X2 / X3）里没有“缺组件只好手拼”的记录（它们都是表单演示，目录够用），缺口主要来自官网示例的消费级界面。

补进目录（D68）：

| 组件 | 证据（官网示例里的手拼） | 要点 |
| --- | --- | --- |
| EmptyState | 空状态与失效 / 过期 / 结果页约 9 处，每处 10–57 行 | 图标圈、标题、说明、操作按钮 |
| ListRow | 头像 + 两行文字 + 右侧操作 10 处以上；有的拿 NavLink 冒充 | 右侧内容放子节点；可点的行仍用 NavLink |
| Menu（Mantine） | 表格行的「⋯」一律标 unmodeled，行操作演示不了 | opened 写在 Menu 上；下拉浮到弹窗层，不被表格裁掉；Menu.Item 可点 |
| TabBar | 移动端底部 Tab 每屏都有，手拼 51 行 | select 切换，带角标 |
| Stat、KeyValue | KPI 卡与“名称 …… 值”清单各 3–5 处 | Stat 的 diff 按正负着色；KeyValue 的合计行 |
| BarChart / LineChart（@mantine/charts 名字） | 用 Progress 冒充柱状图约 70 行 | 低保真 SVG，数据可绑定，换数据时动画 |
| Avatar.Group、Radio.Card（Mantine） | 叠放头像 26 行；拿 NavLink 冒充选项卡片 8 处 | |
| Notification 的 position | 横幅、撤回条、锁屏推送约 130 行 | 浮在当前页面的角或边；用 when 控制出现 |
| DataTable 补齐 | 单元格只能是文字，团队邀请示例改用 Table.* 手写约 200 行 | 列的 badge / avatar、sortStatus、selectedRecords、fetching |

顺带修复：Indicator 的 disabled 从来不生效（编译器把 disabled 移出了 props）；手绘描边下头像底色是方块；Skeleton 加呼吸动画；Tabs.Tab 的 rightSection 计数；发布 IR 里 `go()` 跳转回放报 MISSING_SCENE（选定方案里有跳转的项目在发布站播放到那一步会出错）。

没有补：Tooltip / Popover（没有需求证据，且与焦点 worker 的标注气泡容易混淆）、TopBar、Slider、TagsInput、toast 带操作按钮（要改 IR 的 toast 效果）、Modal footer、ToolCall 审批态、Stepper 的错误态。见 D68 的后续候选。

## 6. 留给其他 worker、或不采纳

- 每段时间看哪里、用什么形式呈现（聚光、标注气泡、强调框、对比、默认焦点、结果前置预览、点击按下 / 抬起节奏）：归 joplo-narrative-focus；story 技能只写一句指向 `npx joplo skill demo`。
- 镜头取景、推近倍数、Diagram：归 joplo-diagram-v2。
- 配音（TTS）与“节拍落在词上”：D61 已排在之后，字幕与旁白分开存。
- 粒子 / 闪光等装饰特效：onetake 与 dark-saas 风格正面冲突（笔记 §6.2-3），Joplo 的低保真风格不需要。
- 评审清单（云端契约 8.1）里加入 expected / priority：要改云端契约，记为后续。
