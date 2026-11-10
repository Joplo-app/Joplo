# 用 Joplo 做 AI 讲解内容：专业创作者的做法、公开技能的借鉴与能力缺口

日期：2026-11-08。任务：content-production。

目标：Joplo 不只做产品演示，也能做讲解、科普、教程、资讯解读这类“视频式内容”，质量对标视频平台上的专业讲解频道。本文汇总三件事：

1. 专业创作者怎么做（第 1 节）；
2. 公开的优秀 Agent Skill 里有哪些可复用的做法（第 2 节）；
3. 做示例 `examples/llm-explainer` 时撞到的 Joplo 能力缺口（第 4 节）。

落进技能的条目见第 3 节，对应 `npx joplo skill content`。

调研方法：
- 网页只读公开资料，访问日期均为 2026-11-08。
- 技能仓库用 `gh` 浅克隆到临时目录，只读文字，不运行脚本、不安装依赖。
- 下文都是转述；英文引用不超过 25 个词。
- 没有复制任何技能原文进 Joplo 技能；各仓库的许可证见第 2.3 节。

“落点”一栏的写法：

| 写法 | 含义 |
|---|---|
| **直接可用** | 现有能力就能做到，已经写进技能 |
| **需要新能力** | 见第 4 节 |
| **不采纳** | 写明理由 |

已在 [storytelling-and-demos.md](storytelling-and-demos.md) 里用过的五个仓库（onetake、video-production-skills、motion-video-skill、speclip-skills、Product-Manager-Skills），本次不再重复。

---

## 1. 专业创作者的制作方法

### 1.1 开头钩子与留存

| 结论 | 来源 | 落点 |
|---|---|---|
| YouTube 把“开头”量化成 30 秒后仍在看的比例。比例低时，官方建议先改标题和封面，让它们贴合真实内容 | [YouTube Help：audience retention key moments](https://support.google.com/youtube/answer/9314415?hl=en) | **直接可用**：前约 30 秒（Joplo 约 1–6 步）兑现封面承诺。**需要新能力**：发布站按步统计离开率（缺口 C10） |
| 高光往前放，留存下滑点逐个复盘 | 同上 | **直接可用**：最有冲击的画面变化放第 1–2 步 |
| 开头三拍：约 7 秒确认这次点击 → 约 10 秒建立可信 → 15–30 秒抛新钩子，并预告要经历哪些环节 | [The Transcript Desk：Colin and Samir 节目编辑稿](https://thetranscriptdesk.substack.com/p/the-youtube-playbook-in-37-minutes) | **直接可用**：示例开场是“熟悉的一幕 → 反常 → 四个问题钉在世界里” |
| 好奇来自“知道一点、还缺一块”：先给具体事实，再指出矛盾，而不是一上来就问陌生问题 | [Golman & Loewenstein《Information Gaps》](https://www.cmu.edu/dietrich/sds/docs/golman/Information%20Gaps--Golman%20and%20Loewenstein.pdf)（仅搜索结果确认） | **直接可用** |
| 三种坏开头：显而易见的观点、第一句讲完全部、复述标题的“假开头” | [George Blackman《5 Retention-Killing YouTube Mistakes》](https://georgeblackman.substack.com/p/5-retention-killing-youtube-mistakes) | **直接可用**：第 1 步不复述场景标题 |
| 开头要快，但关键揭示可以等观众有了语境再给 | [The Open Notebook：Vox 黑洞视频 Videogram](https://www.theopennotebook.com/2020/01/07/videogram-how-a-vox-video-explains-the-science-behind-the-first-photo-of-a-black-hole/) | **直接可用** |

### 1.2 脚本结构

| 结论 | 来源 | 落点 |
|---|---|---|
| 相邻两拍用“但是 / 所以”连，不用“然后”（South Park 原则） | [No Film School](https://nofilmschool.com/2015/04/tony-zhou-storytelling-video-essay-f-fake-therefore-but-and-then) | **直接可用**：技能要求逐对检查相邻字幕。**需要新能力**：脚本体检（缺口 C13） |
| 节奏 = 新问题出现的节奏，不是剪得更快 | [Transcript Desk](https://thetranscriptdesk.substack.com/p/the-youtube-playbook-in-37-minutes) | **直接可用**：每章用一个问题开场 |
| 没有新闻钩子时，用一串问题撑起全片 | [Storybench：Vox Atlas 的 Sam Ellis](https://www.storybench.org/vox-atlas-producer-sam-ellis-on-his-map-animations/) | **直接可用**：一章一个问题，写成章节名 |
| 先说出常见误解再纠正，学习效果几乎翻倍；只讲得“清楚”会让人更自信却没学会（Derek Muller 的研究） | [THE Journal](https://thejournal.com/articles/2015/05/05/watching-videos-does-not-necessarily-lead-to-learning.aspx) | **直接可用**：`say()` 说误解，`narrate()` 加画面推翻 |
| 具体先于抽象，“永远不要从定义开始” | [3Blue1Brown FAQ](https://www.3blue1brown.com/faq/) | **直接可用**：示例用一个贯穿全片的具体例子（给橘猫起名） |
| 章节让观众能定位、回看；每章要能单独看懂 | [YouTube Help：Video Chapters](https://support.google.com/youtube/answer/9884579?hl=en) | **直接可用**：一个场景 = 一章，发布站连播 |
| 每段用一句总结收尾 | [Open Notebook：Vox](https://www.theopennotebook.com/2020/01/07/videogram-how-a-vox-video-explains-the-science-behind-the-first-photo-of-a-black-hole/) | **直接可用**：示例在章末把问题标签翻成“✓ 答案”，不用全屏要点卡 |

### 1.3 节奏与信息密度

| 结论 | 来源 | 落点 |
|---|---|---|
| 长短交替，不要匀速 | [ScienceDaily：Cutting 等对镜头长度的研究](https://www.sciencedaily.com/releases/2010/02/100223121435.htm)（电影研究，属于类推） | **直接可用**：几步快速变化后接一个 `hold()` |
| 一次只让一处动，别为动而动 | [NN/g：Animation purpose](https://www.nngroup.com/articles/animation-purpose-ux/)；[Dartmouth：Mayer 多媒体学习原则](https://services.dartmouth.edu/TDClient/1806/Portal/KB/PrintArticle?ID=171655) | **直接可用** |
| 数字要翻译成能想象的（“5 个里有 2 个”“365 天里蒙中 1 天”） | [Stanford GSB：Make Numbers Count](https://www.gsb.stanford.edu/insights/make-numbers-count-how-translate-data-your-audience) | **直接可用** |
| 一句话一个数字，并且取整 | [UBC：Writing for the Ear](https://wiki.ubc.ca/Course:LFS400/Workshops/Writing_For_the_Ear) | **直接可用** |
| 简中字幕每行最多 16 字，成人约 9 字/秒 | [Netflix 简中字幕规范](https://partnerhelp.netflixstudios.com/hc/en-us/articles/215986007-Chinese-Simplified-Timed-Text-Style-Guide) | **直接可用**：Joplo 的 8 字/秒合理；技能建议字幕常态 ≤16 字，24 字是上限 |
| 中文 TTS 约 4.5–5 字/秒 | [stem-explainer-video teaching-script.md](https://github.com/liangdabiao/stem-explainer-video/blob/6b00eb2dd9679342e0d6a0b157fa4a62fac781ef/references/teaching-script.md)（只引用思路） | **直接可用**：按旁白字数估章节时长。**需要新能力**：outline 和封面计入旁白（缺口 C9） |

### 1.4 画面叙事

| 结论 | 来源 | 落点 |
|---|---|---|
| 先找“让人看懂的那个画面”，再写稿 | [Video Consortium：Cleo Abram](https://videoconsortium.org/mag/episode-8-cleo-abram)；[The Explainers：Phil Edwards](https://theexplainers.substack.com/p/making-the-trivialnontrivial-how) | **直接可用** |
| 三栏脚本：耳朵（旁白）、眼睛（画面）、来源 | 同上 Cleo Abram | **直接可用**：narrate / 状态变化 / 数据模块。来源栏的发布站呈现属于**需要新能力**（缺口 C11） |
| 信号原则：用箭头、高亮、标注引导视线；标签贴在它命名的东西旁边 | [Mayer 原则](https://services.dartmouth.edu/TDClient/1806/Portal/KB/PrintArticle?ID=171655) | **直接可用**：`callout` / `highlight`，以及世界里钉着的问题标签 |
| 时间邻近：画面元素在被讲到的同一刻出现 | 同上 | 步级同步**直接可用**。一步内按词同步属于**需要新能力**（缺口 C12） |
| 冗余原则：有旁白时，屏幕上别铺同样的长文本 | 同上 | **直接可用**：字幕短、旁白完整；画面上只放标签不放段落 |
| 地图：俯视与地面交替，颜色和标签做重点 | [Storybench：Vox Atlas](https://www.storybench.org/vox-atlas-producer-sam-ellis-on-his-map-animations/) | **需要新能力**：地图组件（缺口 C14） |
| 视觉隐喻和转场在故事板阶段就定好 | [Kurzgesagt 制作过程（转录）](https://rosetta.to/u/kurzgesagt/how-to-make-a-kurzgesagt-video-in-1200-hours) | **直接可用**：先只写 step 列表 |

### 1.5 口播与旁白

| 结论 | 来源 | 落点 |
|---|---|---|
| “你会这样说话吗？”编辑靠听稿判断 | [NPR Training](https://www.npr.org/sections/npr-training/2025/05/31/g-s1-66074/would-you-say-it-that-way-tips-on-writing-for-your-voice)（仅搜索结果确认） | **直接可用**：用浏览器朗读完整听一遍 |
| 短句、一句一意、主动语态、动词有力 | [UBC](https://wiki.ubc.ca/Course:LFS400/Workshops/Writing_For_the_Ear)；[Human Kinetics](https://us.humankinetics.com/blogs/excerpt/tips-for-writing-for-broadcast) | 已在 story §6 |
| 旁白要朴素，可以用“看这里”指着画面说 | [Open Notebook：Vox](https://www.theopennotebook.com/2020/01/07/videogram-how-a-vox-video-explains-the-science-behind-the-first-photo-of-a-black-hole/) | **直接可用** |
| 口语化、对一个人说话（个性化原则） | [Mayer 原则](https://services.dartmouth.edu/TDClient/1806/Portal/KB/PrintArticle?ID=171655) | **直接可用** |
| 人声好过机器声 | 同上 | 浏览器朗读处在劣势一侧。付费供应商已有（D74），本任务不调用 |

### 1.6 标题与封面

| 结论 | 来源 | 落点 |
|---|---|---|
| YouTube 的标题和封面测试按观看时长判赢家，不按点击率 | [YouTube Help：A/B test](https://support.google.com/youtube/answer/16391400?hl=en) | **直接可用**：标题必须准确 |
| 封面承诺不兑现属于违规的“恶意标题党”，资讯类查得更严 | [YouTube 政策](https://support.google.com/youtube/answer/2801973?hl=en)；[Google India Blog](https://blog.google/intl/en-in/products/platforms/strengthening-enforcement-against-egregious-clickbait-on-youtube/) | **直接可用** |
| 标题制造好奇缺口；封面“熟悉中带一个意外”；标题和封面互补，不重复 | [Colin and Samir：Paddy Galloway](https://www.colinandsamir.com/resources/the-new-rules-of-youtube-from-paddy-galloway) | **直接可用**：示例片名问“怎么写出一句话”，封面答“它不是在写，是在猜” |
| 先定包装，再做内容 | [Simon Willison 转述的 MrBeast 制作文档](https://simonwillison.net/2024/Sep/15/how-to-succeed-in-mrbeast-production/)（泄露材料，二手报道） | **直接可用**：计划阶段先写片名、封面一句、章节问题 |
| 缩略图兼作嵌入播放器的预览图 | [YouTube Help：thumbnails](https://support.google.com/youtube/answer/72431?hl=en) | Joplo 预览图 = 默认场景的初始画面，技能写明按缩略图设计这一帧。**需要新能力**：指定封面帧（缺口 C7） |

### 1.7 结尾与引导

| 结论 | 来源 | 落点 |
|---|---|---|
| 结尾就是行动号召：不寒暄、不长篇总结，价值一交付就结束 | [George Blackman](https://georgeblackman.substack.com/p/5-retention-killing-youtube-mistakes) | **直接可用**：示例最后一步是一个马上能做的小实验 |
| 结束屏只占最后 5–20 秒，最多 4 个元素，剪辑时预留 | [YouTube Help：end screens](https://support.google.com/youtube/answer/6388789?hl=en) | **需要新能力**：可点击的结束屏（缺口 C15） |
| 在本章答案刚给出时，顺势抛下一章的问题 | 同 1.1 | **直接可用**。“Up next 显示下一章的问题”属于**需要新能力**（缺口 C15） |

### 1.8 事实与可信

| 结论 | 来源 | 落点 |
|---|---|---|
| 来源公开、专家核查、观点标成观点；公开更正 | [Kurzgesagt：Can You Trust Kurzgesagt Videos?](https://rosetta.to/u/kurzgesagt/can-you-trust-kurzgesagt-videos) | **直接可用**：数据模块 + 画面来源行。**需要新能力**：来源面板、更正记录（缺口 C11） |
| 柱状 / 条形图从 0 开始，图形变化幅度要等于数据变化幅度 | [Datawrapper Academy](https://www.datawrapper.de/academy/why-our-column-and-bar-charts-start-at-zero)；[Wikipedia：Tufte 谎言因子](https://en.wikipedia.org/wiki/Edward_Tufte) | **直接可用**：示例概率条从 0 开始、长度按比例，抽签带每段宽度 = 概率 |
| 先想清楚表达什么关系，再选图 | [FT Visual Vocabulary](https://github.com/Financial-Times/chart-doctor/blob/main/visual-vocabulary/README.md) | **直接可用** |
| 叙事别建立在未确认的结果上；已确认与推测分开 | [Open Notebook：Vox](https://www.theopennotebook.com/2020/01/07/videogram-how-a-vox-video-explains-the-science-behind-the-first-photo-of-a-black-hole/) | 已在 story §7 |

---

## 2. 公开 Agent Skill 的可复用做法

### 2.1 内容制作做法

| 做法 | 来源（许可证） | 落点 |
|---|---|---|
| 先定“一件事”，给 2–3 条手法差异很大的讲法；推荐的放第一位并写理由；用户选定后再动手 | [HyperFrames story.md](https://github.com/heygen-com/hyperframes/blob/fa2e63515f3a4b80c7f0399c4f393a9a4c6f6d3f/skills/hyperframes/references/story.md)（Apache-2.0） | 技能 content §1 |
| 讲解片从观众熟悉的处境讲起，抽象装置在处境里出现；用“一张会长大的图”，部件被念到时才出现 | [HyperFrames types/explainer.md](https://github.com/heygen-com/hyperframes/blob/fa2e63515f3a4b80c7f0399c4f393a9a4c6f6d3f/skills/hyperframes/references/types/explainer.md)（Apache-2.0） | 技能 content §2、§3 |
| 先选信息形状（一个数字落地、前后对比、部分与整体、流程、误解被翻转），相似的句子用不同的画面 | 同上 | 技能 content §4 |
| 3b1b 的视觉原则：渐进揭示、变形而不是替换、颜色即含义、用空间表达关系 | [manim_skill visual-techniques.md](https://github.com/adithya-s-k/manim_skill/blob/cef045011722d285692e3381d12d4d637da56e18/skills/manim-composer/references/visual-techniques.md)（MIT） | 技能 content §3（**示例的核心手法**） |
| 叙事模式：错 → 没那么错 → 对；具体 → 一般；节奏“快快慢” | [manim_skill narrative-patterns.md](https://github.com/adithya-s-k/manim_skill/blob/cef045011722d285692e3381d12d4d637da56e18/skills/manim-composer/references/narrative-patterns.md)（MIT） | 技能 content §2 |
| 每一拍回答四个问题：看哪一个东西；布局表达什么关系；什么出现、什么离开；下一拍什么不动 | [explainroo AGENTS.md](https://github.com/vincentsch/explainroo/blob/e95232c8d535ed2aa390e7b1caee0d1326dd9e83/AGENTS.md)（MIT） | 技能 content §3 |
| 问题驱动加覆盖度清单：资料里的知识点逐项打勾，不能因为难画就跳过 | [stem-explainer-video teaching-script.md](https://github.com/liangdabiao/stem-explainer-video/blob/6b00eb2dd9679342e0d6a0b157fa4a62fac781ef/references/teaching-script.md)（README 声明 MIT，无 LICENSE 文件，只引用思路） | 技能 content §1 |
| 可机械检查的“反 PPT”测试：三个以上画面只靠显隐切换就是幻灯片；文字层级不超过两层 | [bang-motion SKILL.md](https://github.com/bangtutorial/bang-motion/blob/c1aa65e921c970d858705fcb4a53a8294d1a4131/SKILL.md)（MIT） | 技能 content §3、常见坑 |
| 运动手艺：到达用长尾 ease-out，退场比入场短；错峰 60–120ms；标题落定后静止；转场要有画面上的原因 | [HyperFrames motion.md](https://github.com/heygen-com/hyperframes/blob/fa2e63515f3a4b80c7f0399c4f393a9a4c6f6d3f/skills/hyperframes/references/motion.md)（Apache-2.0） | 技能 content §5 |
| 规格化：形容词换成数字（色值、字号、留白），并维护一份不断变长的“禁用清单” | [HyperFrames spec.md](https://github.com/heygen-com/hyperframes/blob/fa2e63515f3a4b80c7f0399c4f393a9a4c6f6d3f/skills/hyperframes/references/spec.md)（Apache-2.0） | 技能 content §5 |
| 事实约束：每个说法追溯到来源；示例数字标“示意”；不推导来源没说的结论 | HyperFrames story.md；[product-demo-director](https://github.com/crimeacs/product-demo-director/blob/8de3b3b8d8f55bec01b0d57bbc2fd0ed9b703bf6/SKILL.md)（MIT） | 技能 content §6 |
| 像挑剔的导演审片：一句话描述每张关键帧；问题按 P0/P1/P2 一行一条；不打分；交付时写明没检查到的部分 | [HyperFrames review.md](https://github.com/heygen-com/hyperframes/blob/fa2e63515f3a4b80c7f0399c4f393a9a4c6f6d3f/skills/hyperframes/references/review.md)（Apache-2.0） | 技能 content §8 |
| 默认第一次渲染一定有问题；用没有上下文的子代理只看截图挑问题 | [anthropics/skills pptx](https://github.com/anthropics/skills/blob/2c5958ecac7cee2b583967a2c4981d0f4a75c579/skills/pptx/SKILL.md)（Apache-2.0）；doc-coauthoring（无 LICENSE 文件，只引用思路） | 技能 content §8 |

### 2.2 技能写法本身

| 做法 | 来源（许可证） | 落点 |
|---|---|---|
| description 只写“什么时候用”，不概括流程（实测会让 agent 只照 description 做事）；点名相邻说法，防止触发不足 | [superpowers discovery.md](https://github.com/obra/superpowers/blob/22f0b463e7a5e579904dd6211a520321035526f7/skills/writing-skills/references/discovery.md)（MIT）；[skill-creator](https://github.com/anthropics/skills/blob/2c5958ecac7cee2b583967a2c4981d0f4a75c579/skills/skill-creator/SKILL.md)（Apache-2.0） | `joplo` 技能 description 补“讲解 / 科普 / 教程 / 资讯解读”触发词，不写流程 |
| 必经流程写成 Required，并配“声明 → 需要的证据 → 不算数的证据”表 | [superpowers verification-before-completion](https://github.com/obra/superpowers/blob/22f0b463e7a5e579904dd6211a520321035526f7/skills/verification-before-completion/SKILL.md)（MIT）；[brag](https://github.com/latent-spaces/brag/blob/669ab9286aa28b6c3ee30e75f181ee74319d012a/skills/brag/SKILL.md)（MIT） | 技能 content §8 |
| 按失败类型选写法：形状问题写配方，纪律问题写禁令和证据，漏项问题加必填槽位 | [superpowers writing-skills](https://github.com/obra/superpowers/blob/22f0b463e7a5e579904dd6211a520321035526f7/skills/writing-skills/SKILL.md)（MIT） | 技能 content 以配方为主（“一个世界、物件贯穿、变形不替换”），审片用证据表 |
| 入口短，按请求类型路由到子文件 | [HyperFrames SKILL.md](https://github.com/heygen-com/hyperframes/blob/fa2e63515f3a4b80c7f0399c4f393a9a4c6f6d3f/skills/hyperframes/SKILL.md)（Apache-2.0）；[Remotion skills](https://github.com/remotion-dev/skills/blob/a2824c67f8b4585c294a8101db9f9f0ad3c643f8/skills/remotion-best-practices/SKILL.md)（无 LICENSE 文件，只引用思路） | 新增 content 主题，`joplo` 技能的“何时使用”路由过去 |
| 每个技能配一份触发评测（该触发、擦边不该触发） | [elevenlabs/skills trigger_eval](https://github.com/elevenlabs/skills/blob/9763c39a9d7add478b2f2d8229f0caadf5414f5f/evals/text-to-speech/trigger_eval.json)（MIT） | **不采纳（本次）**：属于仓库流程，记为后续 |

### 2.3 仓库、版本与许可证

| 仓库 | 提交 | 许可证 |
|---|---|---|
| [anthropics/skills](https://github.com/anthropics/skills) | 2c5958ec | Apache-2.0；doc-coauthoring 目录无 LICENSE 文件，只引用思路 |
| [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) | 1a2c79d4 | 根目录无 LICENSE 文件，README 声明 MIT |
| [vercel-labs/writing-guidelines](https://github.com/vercel-labs/writing-guidelines) | 83e2316b | MIT |
| [remotion-dev/skills](https://github.com/remotion-dev/skills) | a2824c67 | 无 LICENSE 文件，只引用思路 |
| [heygen-com/hyperframes](https://github.com/heygen-com/hyperframes) | fa2e6351 | Apache-2.0 |
| [elevenlabs/skills](https://github.com/elevenlabs/skills) | 9763c39a | MIT |
| [obra/superpowers](https://github.com/obra/superpowers) | 22f0b463 | MIT |
| [iart-ai/explainer-video-skills](https://github.com/iart-ai/explainer-video-skills) | 3e2d411b | MIT |
| [latent-spaces/brag](https://github.com/latent-spaces/brag) | 669ab928 | MIT |
| [adithya-s-k/manim_skill](https://github.com/adithya-s-k/manim_skill) | cef04501 | MIT |
| [liangdabiao/stem-explainer-video](https://github.com/liangdabiao/stem-explainer-video) | 6b00eb2d | README 声明 MIT，无 LICENSE 文件，只引用思路 |
| [bangtutorial/bang-motion](https://github.com/bangtutorial/bang-motion) | c1aa65e9 | MIT |
| [vincentsch/explainroo](https://github.com/vincentsch/explainroo) | e95232c8 | MIT |
| [crimeacs/product-demo-director](https://github.com/crimeacs/product-demo-director) | 8de3b3b8 | MIT |
| [mattpocock/skills](https://github.com/mattpocock/skills) | 4ae2317d | MIT |
| [skills.sh](https://skills.sh/)（排行，2026-11-08 访问） | — | 目录站 |

Joplo 的技能以 PolyForm Shield 1.0.0 分发。上面的做法都是用自己的话重新表述的思路，没有复制原文段落。

---

## 3. 示例与沉淀

### 3.1 示例：三版迭代

示例在 [`examples/llm-explainer`](../../examples/llm-explainer)：《大模型是怎么“写”出一句话的？》，五个场景 = 开场 + 四章，带旁白约 4 分 20 秒。贯穿全片的例子是“给我的橘猫起个名字”。

| 版本 | 做法 | 结论 |
|---|---|---|
| 第一版 | 每章一块图版（大标题、面板、底部来源、章末横幅），章节开场用遮罩 | 用户：“太像 PPT”，要更好的可视化、动效、连贯性 |
| 第二版 | 一张大画布 + 手写镜头；所有物件的坐标按状态预先算好写进状态（约 250 行几何代码） | 效果对了，但作者（Agent）要手算镜头和每个物件的位置；机位算错一次，就出现内容挤在上半屏 |
| 第三版（提交版） | 用本次新增的 Joplo 原语：`Canvas`、`camera()`、`motion`、`screen`、`flow('Slice title', { from })`、`patch()` | 不再有坐标数学：只摆容器，每种排法写成静态 JSX，用 `when` 切换，同一 motion 键自动飞行；镜头写元素 id |

画面手法（第三版）：
- **开场**：熟悉的一幕 → 定格，每块露出概率 → 名字那一块翻成“南瓜” → 镜头拉远，露出旁边的“机器”，四个问题钉在各自要讲的位置。
- **第 1 章**：你问的那句话在气泡里裂成词元、翻成编号，再飞上纸带。
- **第 2 章**：机器扫描纸带，概率条从出口长出，第一名的标签飞回纸带末尾；先慢放一圈，再快进。
- **第 3 章**：同一组概率条重排成抽签带，指针落下；温度旋钮让抽签带变尖或变平。
- **第 4 章**：同一条带子被几百个日期摊平，“不知道”只剩一条细缝；计分板比较两种考法。
- **收尾**：镜头拉回全景，四个问题标签都已翻成“✓ 答案”；片尾号召固定在屏幕上。

事实与示意分开：

| 类别 | 内容与来源 |
|---|---|
| 事实 | 词元经验换算：[OpenAI Help](https://help.openai.com/en/articles/4936856-what-are-tokens-and-how-to-count-them)<br>逐块生成、按概率采样、温度：[3Blue1Brown](https://www.3blue1brown.com/lessons/mini-llm/)、[Hugging Face《How to generate text》](https://huggingface.co/blog/how-to-generate)<br>只按答对计分会鼓励蒙：[OpenAI《Why language models hallucinate》，2025-09](https://openai.com/index/why-language-models-hallucinate/) |
| 示意 | 候选和概率（画面标“示意数据”）。温度下的概率由同一组分数按 softmax 换算，彼此自洽 |

### 3.2 沉淀进技能的条目

- **新主题 `npx joplo skill content`**（SKILL_TOPICS、README 主题列表同步），共九节：
  1. Required：先定包装和计划；
  2. 开场三拍；
  3. 不做幻灯片：一个世界、物件贯穿、镜头移动（附代码骨架与“反 PPT”测试）；
  4. 信息形状；
  5. 运动与版面数值（一镜一簇约 16:10、同一主体同一机位）；
  6. 旁白、字幕与数字；
  7. 事实与示意；
  8. 收尾；
  9. Required 审片（分镜、看板试播、证据表）。
- **authoring**：`flow('Slice title', { from, layer })`、`patch()`、`camera()`。
- **demo**：Canvas 一节、`render --sheet`。
- **focus**：讲解片用 `camera()`，不用 `shot()`。
- **check**：`CAMERA_*`、`FROM_*`、`LAYER_UNKNOWN`（flow 的 layer）；讲解类内容可以忽略 `HAPPY_PATH_ONLY`。
- **story §7**：指向 content。
- **`joplo` 技能**：
  - description 增加讲解 / 科普 / 教程 / 资讯解读的触发；
  - “何时使用”路由到 content，“何时不用”加上真实视频剪辑；
  - 常见坑新增 8 条，原有条目一条不删；
  - 同时去掉测试里“常见坑最多 8 条”的上限。

---

## 4. 能力缺口（做示例时撞到的）与本次落地

每条写：想要的效果 / 原来的变通办法 / Joplo 能力及状态。用户看过第二版后要求“直接开始做，然后调试”，所以 C1–C4、C7–C9 本次实现了（D86），其余记为后续。

| # | 想要的效果 | 原来的变通办法 | 能力与状态 |
|---|---|---|---|
| C1 | 在大画布上推、拉、摇，推近 2 倍以上，不画焦点框 | `shot()` 对界面最多 1.25 倍且画脉冲框；示例手写整张画布的 transform 与机位数学 | **已实现**：`<Canvas>` + `camera(...ids, { pad, zoom, ms })`，按内容取景、放大上限默认 3 倍、跨步保留 |
| C2 | 同一个物件换排法 / 换容器时自动飞过去 | 每个物件、每一步的坐标预先算好写进状态 | **已实现**：`motion="key"`（FLIP），`motionDelay` / `motionMs`；与镜头同一步时同步落定 |
| C3 | 下一章从上一章结尾接着演；一步改多处 | 自写 `S + go()` 累积状态，逐章 `flow('Slice title', { state })` | **已实现**：`flow('Slice title', { from })`（按依赖回放解析，成环 / 失败报错）、`patch()`、步骤参数可传数组 |
| C4 | 讲解画面按设计尺寸等比缩放 | 容器查询单位自造 `--u`，所有尺寸包 `U()` | **已实现**：Canvas 的 `view`（默认 1280×800）；`screen` 子元素固定在屏幕上 |
| C5 | 绑定能做简单计算 | 预先拼好样式字符串 | 有了 C2 后大多不再需要；**后续**视需要做受限派生绑定 |
| C6 | 讲解类部件（翻面词元、计数器、可变形条形图、指针、问题标签） | 示例里手写 | **后续：扩展包**（见 4.1），先在示例里沉淀成可复制的作者组件 |
| C7 | 只有系统步骤的场景也能从指定层开始 | 封面塞进世界层做遮罩 | **已实现**：`flow('Slice title', { layer })`；`camera()` 也会切导演层。**后续**：指定封面帧 |
| C8 | 一条命令看完整场分镜 | ffmpeg 拼联系表、Playwright 脚本 | **已实现**：`joplo render --sheet`（每格带步号、字幕、旁白）。**后续**：看板里的分镜视图、按真实节奏回放的时间线 |
| C9 | 封面“约 M 秒”与 outline 计入旁白 | 手算（示例 outline 显示 2 分 26 秒，实际约 4 分 20 秒） | **已实现**：按朗读估算（中日韩约 4.5 字 / 秒） |
| C10 | 发布站按步留存统计 | 无 | 后续（Cloud） |
| C11 | 每步挂来源、发布站来源面板、更正记录 | 画面底部一行字 | 后续 |
| C12 | 旁白念到某个词时元素亮起 | 拆成多步 | 后续 |
| C13 | 脚本体检（只能用“然后”衔接、一步多个数字、字幕超过 16 字） | 人读 | 后续 |
| C14 | 地图组件 | 方块瓦片地图 | 后续 |
| C15 | 可点击的结束屏；Up next 显示下一章的问题 | 片尾号召画在画面里 | 后续 |
| C16 | 讲解类内容不收到产品向提示 | 忽略 `HAPPY_PATH_ONLY` | 后续：`feature({ kind: 'explainer' })` |

### 4.1 扩展包的设计输入

用户的方向：基于这些原语，以后可以做各种扩展包（npm 包 / 插件）。

现状：作者组件就是普通 TSX 函数，所以一个包已经可以导出讲解部件（`Token`、`Bars`、`Pointer`、`Pin`、`Scoreboard`），由原语拼成。真正缺的是下面三件：

1. **包里的 CSS**：出场动画（`@keyframes`）现在只能写在项目的 `themes/<name>.css` 里。包需要一种声明“我的样式片段”的方式，由编译器内联进舞台作用域。
2. **包的技能**：包的用法要能出现在 `npx joplo skill` 里，例如 `npx joplo skill <包名>`。需要约定包里的技能文件位置，以及安装和更新时的版本对齐。
3. **组件目录**：包只能用目录里的组件拼装，不能新增渲染器组件。这样安全边界清楚，作为第一期足够。

### 4.2 本次修改的 Joplo 代码

- **kit**：`camera()`、`patch()`、`flow('Slice title', { from, layer })`、步骤参数可传效果数组、`Canvas` 组件与 `motion` / `motionDelay` / `motionMs` / `screen` 属性。
- **core**：
  - 编译 `camera` 与 `from` / `layer`（新诊断 `CAMERA_*`、`FROM_*`）；
  - `Scenario.initial.layer`，`cameraAt` 读起始层；
  - `voiceMs`，outline 估算计入旁白；
  - 目录与组件文档。
- **web**：
  - `Canvas` 渲染（取景、FLIP、`screen` 层）；
  - 静态画面里，画布内作者写的动画和过渡直接显示终态；
  - 封面估算计入旁白。
- **server / cli**：
  - `renderSheet` 与 `render --sheet`；
  - 截图报告不再对画布里被镜头移出画面的元素报“出画”，除非它是下一步的目标。
- **测试**：`packages/core/test/canvas.test.ts`（8 个）、`packages/web/test/canvas-frame.test.ts`（3 个）。

没有修已有功能的 bug。
