# 产品演示与科普视频的叙事设计及复杂信息可视动化

> 本文档整理自专项调研与架构讨论（2026-11-27），聚焦 Joplo 在具备画面绘制、交互回放与成片导出能力之后的上层核心命题：**当 Agent 拿到一份产品需求或技术/知识材料时，如何规划讲什么、按什么认知顺序讲、如何把抽象信息翻译成连续空间变化，以及何时闭嘴让观众自己观察。**

## 1. 两类内容共享引擎，但叙事目标截然不同

内部产品演示与科普/原理解析视频可以共用同一套 Joplo 编译、舞台与回放引擎，但内容生成策略必须分离：

| 维度 | 内部产品演示（Product Demo） | 科普与原理解析（Explainer） |
| --- | --- | --- |
| **核心目标** | 建立团队共识、暴露隐含规则、辅助决策 | 建立心智模型（Mental Model）、消除认知差 |
| **叙事主体** | 具体角色及其行为、阻塞与结果 | 一个具体问题、反常现象及其机制答案 |
| **叙事驱动力** | 痛点阻力 → 目标体验 → 方案取舍 | 直觉误区 / 好奇心冲突（ABT） → 逐步推导 |
| **重点展示** | 操作输入、状态迁移、异常兜底、待决分歧 | 现象对比、内部结构、守恒流转、权衡消长 |
| **成功标准** | 评审者能准确判断方案优劣并拍板待决项 | 观众能用自己的话复述原理并迁移到新例子 |
| **最大忌讳** | 罗列 UI 功能清单却不交代解决什么问题 | 堆砌术语或照搬论文目录却没有理解路径 |

## 2. 三层创作能力架构：双导演 + 复杂信息可视动化底座

避免编写笼统的 `video-generation` 提示词，而是按职责拆分为「两个上层叙事导演 + 一个共享可视动化底座」，再落到 Joplo 现有引擎与插件原语：

```
  [需求 / PRD / 变更]                      [论文 / 原理 / 复杂主题]
          │                                         │
          ▼                                         ▼
┌───────────────────────────┐             ┌───────────────────────────┐
│   product-demo-director   │             │    explainer-director     │
│  · 四类演示分流           │             │  · 误区破立与 ABT 主线     │
│  · 六层漏斗与时间倾斜     │             │  · Mechanism/Discovery    │
│  · Action→Reaction→Meaning│             │  · 6 层导演管线与事实边界 │
└─────────────┬─────────────┘             └─────────────┬─────────────┘
              └────────────────────┬────────────────────┘
                                   ▼
                 ┌───────────────────────────────────┐
                 │        visual-explanation         │
                 │       （复杂信息可视动化）         │
                 │  1. 信息同构 → 空间骨架选型       │
                 │  2. 具象主角与对象守恒（FLIP）     │
                 │  3. 渐进搭台与工作记忆控制         │
                 │  4. 动静皆语义（静止 = 复用/不变量）│
                 │  5. 闭嘴观察窗口（narrate(false)） │
                 └─────────────────┬─────────────────┘
                                   ▼
                 ┌───────────────────────────────────┐
                 │   Joplo Engine & Plugin Runtime   │
                 │  work / chapter / flow / Canvas / │
                 │  Diagram (TALA) / Sequence / UI   │
                 └───────────────────────────────────┘
```

### 为什么暂不在 Core 编译器中固化重型 Narrative IR

调研中提出的 `Narrative Beat`（先确定“已有认知 → 新增认知 → 视觉焦点 → 完成条件”，再决定画面实现）是防止 AI 从资料直接跳向“花哨 PPT”的关键中间层。

工程落地上采取**渐进固化策略**：
1. **现阶段（创作契约层）**：将 `Research Brief → Narrative Outline → Beat Sheet → A/V Script` 定义为导演 Skill 的前置轻量结构化产物（如项目内的 `BEAT_SHEET.md`），执行层直接复用 Joplo 现有的 `work()`、`chapter()` / `flow()`、`expected`、`narrate()` / `narrate(false)`、`hold()`、`camera()` 与 `trace()`。
2. **演进阶段（静态诊断层）**：待多类样片验证稳定后，只把可客观判定的反模式（例如连续多步纯文字卡无状态迁移、高密度旁白长链缺少观察停留等）沉淀为 `joplo check` 的启发式提示，避免过早把探索性叙事字段锁死在编译器 Schema 中。

## 3. 第一支柱：内部产品演示（Product Demo Director）

### 3.1 行业实践依据
- **Meta（Paragraph + Prototype + Eval Set）**：用一段清晰的问题定义、可上手交互的原型及评估用例集替代冗长抽象文字（Jagjit Chawla, *The Skip Podcast*, 2026-06-24；系部分团队实践，非全公司废除文档）。
- **Amazon（Working Backwards）**：先定义用户是谁、旧体验卡在哪里、新体验完成了什么结果，再用演示证明该结果如何达成。
- **GitLab（Speed Run / Demo / Walk-through）**：按立项说服、单流程速览与内部连贯性走查区分视频形态，围绕验收标准暴露隐含依赖。
- **SVPG（Prototype as Spec）**：可交互原型承担行为规格职责，提前暴露业务分支与可用性漏洞；非功能指标（吞吐、可靠性等）由文字规则补充。

### 3.2 四种演示形态与 Joplo 映射

| 类型 | 典型时长 | 解决的问题 | Joplo 组织方式 |
| --- | --- | --- | --- |
| **Concept Demo（概念提案）** | 60–120s | 这件事值不值得做？目标体验长什么样？ | `work() + chapter()` 或单方案 `feature()`，重在 Problem → Outcome 反差 |
| **Feature Walkthrough（方案评审）** | 2–5 min | 具体怎么做？主流程、状态迁移与异常怎么兜底？ | `feature() + work() + flow()`，配齐 `cases`、`rules`、`mock()` 多结果与 `questions` |
| **Design Comparison（多方案对比）** | 2–5 min | A 和 B 到底差在哪？各自牺牲了什么？ | 同一 `feature` 下多个 `works/<a>.tsx`、`works/<b>.tsx`，跑完全相同的输入与 `cases` |
| **Release Demo（发布介绍）** | 30–90s | 新能力给用户带来了什么立竿见影的改变？ | 独立 `work() + chapter()`，直奔痛点消除与核心结果，省去内部边界细节 |

### 3.3 六层内容漏斗与最小单元 `Action → Reaction → Meaning`
1. **内容优先级**：`Context（场景） → Problem（阻塞） → Outcome（目标结果预览） → Workflow（核心操作） → Behavior（状态与异常分支） → Decision（待拍板问题）`。切忌平均分配时间：省略登录、常规跳转等低信息量步骤，把时长倾斜给有争议的业务规则与关键状态翻转。
2. **最小演示单元**：每一步必须同时具备 **Action（触发动作）**、**Reaction（界面/架构状态变化）** 与 **Meaning（这一变化对用户的实际意义，由 `explain` / `narrate` / 结果态点明）**。功能只是手段，用户处境的改变才是主线。

## 4. 第二支柱：科普与原理解析（Explainer Director）

### 4.1 标杆方法论与认知理论依据
- **回形针 PaperClip**：从日常具体现象切入，构建知识树后只选一条最高效的因果路径把黑箱拆成透明结构，用具体数字替代空洞形容词。
- **3Blue1Brown**：需求先行——先让观众撞上具体困惑，产生对某个机制的迫切需求，再引出公式或名称（禁止术语先行）。
- **Kurzgesagt**：严格分离原始研究材料（Research Brief）与逐字稿，逐句核查事实与估算，标明简化或隐喻失效的边界。
- **Veritasium（Derek Muller, 2007）**：先呈现符合直觉的常见误解，再用可视化证据推翻并重建（Refutation / Dialogue 显著优于平铺直叙的 Exposition）。
- **Mayer 多媒体学习认知理论（2021）**：工作记忆容量有限，必须执行 **Coherence（删无关装饰）**、**Signaling（单焦点高亮）**、**Segmenting（分段推进）**、**Pre-training（先认组件再演关系）**、**Spatial/Temporal Contiguity（标签贴体、音画同步）**、**Modality & Non-redundancy（画面演结构，耳朵听原因，不在屏幕上贴旁白大段原话）**。

### 4.2 叙事主线与三层节奏
- **ABT 骨架**：`AND`（共同常识与前置背景）→ `BUT`（现有认知解释不了的矛盾、瓶颈或代价）→ `THEREFORE`（引出新机制完成推导，并自然引出下一层权衡）。
- **三种叙事模型**：`Mechanism`（现象 → 结构 → 过程 → 权衡，最适合计算机与工程原理）、`Discovery`（问题 → 猜想 → 实验对照 → 结论）、`Evolution`（初始方案 → 瓶颈 → 演进突破 → 新边界）。禁止把论文 `Intro / Method / Results / Conclusion` 原样搬成章节。
- **三层节奏（Macro / Beat / Micro）**：首次出现的新机制、关键状态跃迁、反直觉权衡要**慢放**（慢放第一圈）；观众已看懂的同类循环要**快进**（如“同样规则快进三轮”）。

## 5. 共享底座：复杂信息可视动化（Visual Explanation）五大定律

1. **信息同构选型**：把抽象关系映射为空间同构体——模块边界用 `Diagram`（TALA 二维簇 + `trace`），往返协议用 `Sequence`，状态门禁用 `StateMachine`，数据拆解/缓存/搬运用 `<Canvas>` 守恒实体飞行，成本与收益权衡用成比例几何量纲联动。严禁退化为圆角文字卡片墙。
2. **具象主角与对象守恒**：选定一个贯穿全片的具象样本（如一句真实输入词序列、一笔具体请求），赋予唯一 `motion` 键；观众亲眼看到**同一个对象**被切分、提取、存入、复用。
3. **渐进搭台**：首帧只出最小触发物，按认知依赖逐拍浮现容器与连接，单拍只改一个变量，标签直接贴在对象旁。
4. **动静皆语义**：运动编码流转与量纲变化；**静止不动编码复用、锁定与不变量**（如缓存命中的历史块保持静止，与新计算的动态块形成鲜明对照）。
5. **闭嘴观察窗口**：在跨容器迁徙、多跳链路或量纲反转的关键拍，先用半句话指明观察位置，再配 `narrate(false)` + `hold()` 留出纯视觉演进窗口，让观众自己看懂变化。

## 6. 理解度评估（Comprehension Eval）优于主观打分

演示质量的终极检验是**观众看完后能否答对核心问题**：
- **产品演示检验**：用户是谁及卡在哪？主流程核心状态如何迁移？失败/超时如何兜底？需要团队拍板的待决项是什么？
- **科普解析检验**：能否用一句话复述核心机制？能否指出最容易混淆的误区（例如 KV Cache 缓存的不是最终回答而是历史 K/V）？能否把原理迁移判断一个新场景？

## 7. 参考资料索引

- Jagjit Chawla, *How Meta Is Reinventing Product Management*, The Skip Podcast (2026-06-24)
- Amazon, *Working Backwards PR/FAQ Process*
- GitLab Handbook, *Product Processes* & *Engineering Demo Process*
- Marty Cagan, *Revisiting the Product Spec*, SVPG (2006)
- Richard E. Mayer, *Evidence-Based Principles for How to Design Effective Instructional Videos*, JARMAC (2021)
- Derek A. Muller et al., *Saying the Wrong Thing: Improving Learning with Multimedia by Including Misconceptions*, JCAL (2007)
- Randy Olson / MIT Communication Lab, *ABT Scientific Storytelling*
- Philip J. Guo et al., *How Video Production Affects Student Engagement*, L@S (2014)
- 回形针 PaperClip，《幕后故事：回形针是怎么做视频的》
- Grant Sanderson (3Blue1Brown), *Attention in Transformers*
- Kurzgesagt, *How Research and Factchecking Work at Kurzgesagt*
