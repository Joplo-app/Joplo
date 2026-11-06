# Joplo 叙事与用户故事最佳实践：5 个仓库调研笔记

调研日期：2026-11-06。只读：在系统临时目录下 `gh repo clone --depth 1`，只用 cat/grep/sed 读文字；没有执行任何脚本，没有安装依赖。有几处默认参数取自脚本源码（`.py`/`.mjs`），只是当文本读，没有运行。

| 仓库 | 提交 | 提交日期 |
|---|---|---|
| feitangyuan/onetake | abb6d17 | 2026-11-04 |
| Pluviobyte/video-production-skills | e19f1f3 | 2026-07-14 |
| farhan-syah/motion-video-skill | 0a21eb7 | 2026-10-19 |
| linyqh/speclip-skills | cb51e23 | 2026-04-13 |
| deanpeters/Product-Manager-Skills | cfcb697 | 2026-10-15 |

格式说明：每条 = 结论；出处（仓库/路径 + 行号或小标题）；引用（原文照抄，英文 ≤25 词）；可选的 “Joplo 建议”，方括号里注明可能落到哪一层：技能文字 / 作者 API / 组件 / 看板功能 / 不适用。建议是我的推断，不是来源原话。

Joplo 背景（来自委托方）：feature（goal、cases、rules、roles）→ option（A/B）→ scenario（flow，步骤 `.click/.type/.system/.card`）；字幕 ≤24 中文字（英文算半字），explain ≤48；自动播放按中文 8 字/秒，钳在 3–7 秒；第 0 步是封面（标题、30 字说明、约 N 步约 M 秒）；有过渡卡、镜头推近 shot、多层级页面。

---

## 1. feitangyuan/onetake

这个仓库是一个 Claude Agent Skill，用单个 HTML 合成文件（`window.__seek(t)`）做 10–30 秒的产品动效短片，以及最长约 60 秒、带配音的功能演示。核心主张是“每个节拍都从上一个节拍里长出来”（carry），并用自动验收脚本（oracle）在人看之前判掉像幻灯片的成片。许可证 PolyForm Noncommercial。

### 主题 1：从想法到分镜

- **1.1 先把参考片“拆成数字”，再动手。**
  出处：`onetake/SKILL.md` L41–52（§1 Deconstruct the reference）
  引用：“Read the energy map and the sheets and write down the numbers the film has to match.”
  Joplo 建议：〔技能文字〕让作者先写下目标总时长、步数、哪里停留最久，再写 flow。

- **1.2 先出三个“概念”，每个概念是一句关于“画面”的话，不是关于产品的话；三个概念要在核心想法上不同；每个都写清钩子帧、每个交界靠什么接住、它排除什么、用什么视觉风格；由用户来选。**
  出处：`onetake/SKILL.md` L54–57、L68–71（§2 Concept）
  引用：“A concept is one sentence about the *picture*, not the product: the single idea the film is made of.”／“Show the three and let the user pick.”
  Joplo 建议：〔看板功能〕和 option A/B 天然对应：每个 option 写一句“概念”，再写钩子步骤和收尾步骤。

- **1.3 节拍表字段：`t · beat · what moves · what is still · what carries into the next beat`；参考片拆解版的列是 `t · beat · picture · what is still · sound`。**
  出处：`onetake/SKILL.md` L78–79（§3 Storyboard）；`onetake/references/reference-deconstruction.md` L55–59（The beat sheet）
  引用：“Write the chosen concept as a **beat sheet**: `t · beat · what moves · what is still · what carries into the next beat`.”
  Joplo 建议：〔作者 API〕每一步除字幕外，可以选填 `carries`（什么元素留到下一步）、`still`（什么不动）；看板可据此标出“断开的交界”。

- **1.4 不要默认套模板的故事线：一个操作演示照搬模板节拍，每项验收都通过，仍被打回。**
  出处：`onetake/SKILL.md` L72–74、L192–193（§2；Hard rules）
  引用：“an operation demo built on it passed every oracle leg (carry 1.00) and was sent back as 「和 motion web 很像…没有创造力」.”
  Joplo 建议：〔技能文字〕示例 flow 只能当参考，技能里明确“不要复用上一个演示的节拍顺序”。

- **1.5 向非技术用户要素材时，不要让他们写镜头表，只要一件具体的事。**
  出处：`onetake/references/product-demo.md` L24–27（§1 Reference takes）
  引用：“Asking a non-technical user for a shot list fails (「看不懂让我录什么」). Ask for one concrete thing”
  Joplo 建议：〔技能文字〕Agent 向用户要截图时，按“打开 X → 点 Y → 每步截一张”来问。

- **1.6 操作演示节拍表实例（15 秒）：三个词 → 输入框聚焦、斜杠菜单筛选、选中、输入、发送 → 输入框缩成已发送消息，卡片从选中项长出 → agent 工作（工具调用、进度、PASS）→ 按播放，结果出现 → 三下硬切 → 落版。每行都写了“接进下一拍的是什么”。**
  出处：`onetake/cases/skill-demo-15s/README.md` L14–26
  引用：“the chosen row flies up into the input as a chip; send”
  Joplo 建议：〔技能文字〕可以当 Agent 写 flow 的范例：每步写动作，再写“哪个元素变成下一步”。

### 主题 2：开场钩子与收尾

- **2.1 没有钩子、没有落版的版本被打回；改成“第 1 秒就有钩子”并加上落版后通过。**
  出处：`onetake/cases/clawd-desktop-19s/README.md` L55–58（Versions）
  引用：“one verb all film — hop, hop, hop; … the payoff showed nothing; no hook, no end card”／“a hook in second one … an end card”
  Joplo 建议：〔技能文字〕每个 scenario 都要有钩子步骤和收尾卡；看板缺任意一个就提示。

- **2.2 不接住的硬切只允许出现在“连续硬切打点”和落版里。**
  出处：`onetake/SKILL.md` L87–88；`onetake/references/rhythm.md` L133
  引用：“Bare cuts only in a burst of hits or into the end card.”
  Joplo 建议：〔组件〕收尾过渡卡可以硬切；场景中间的卡片最好保留一个延续元素（见 5.x）。

- **2.3 用品牌官方片尾收尾时，先把主体落到片尾第一帧 logo 的精确位置，再切进去，这样切点不可见。**
  出处：`onetake/references/product-demo.md` L129–134（§6 Ending on the brand's own clip）
  引用：“land the film's subject on the **exact screen spot** of the logo in frame 1 … The cut into the clip is then invisible.”
  Joplo 建议：〔组件〕收尾卡可以提供“从最后一步的结果元素飞到卡片标题位置”的过渡。

### 主题 3：节奏与时长

- **3.1 时长：宣传短片 10–30 秒；带配音的功能演示最长约 60 秒，通常 30–60 秒。**
  出处：`onetake/SKILL.md` L7（description）；`onetake/references/product-demo.md` L3–4
  引用：“Make short product / skill motion videos (10–30 s, narrated feature demos up to ~60 s)”
  Joplo 建议：〔看板功能〕封面上的“约 M 秒”超过 60 秒时提示作者拆 scenario。

- **3.2 镜头长度至少相差 4 倍；变异系数（CV）低于 0.25 就算“节拍器”，判不通过。**
  出处：`onetake/SKILL.md` L81；`onetake/references/rhythm.md` L49；`onetake/scripts/verify_promo.py` L8（docstring，只读）
  引用：“Vary shot length by ≥ 4× (0.25 s words next to 2.5 s holds).”／“coefficient of variation ≥ 0.25 or it is a metronome.”
  Joplo 建议：〔看板功能〕Joplo 的停留规则是 8 字/秒、钳在 3–7 秒，24 字字幕正好 3 秒。没有 explain 的步骤会全部停 3 秒，形成节拍器（这是我按委托方给的规则推出来的，不是来源原话）。看板可以算每个 scenario 停留时长的 CV，低于 0.25 时提示；作者 API 可以给关键结果步骤加 `hold`。

- **3.3 至少 25% 的帧完全静止，并且至少有一段 ≥1 秒的安静段；参考片 34% 的时间完全静止。**
  出处：`onetake/references/rhythm.md` L50；`onetake/SKILL.md` L50、L205–206
  引用：“Never let the frame be always in motion. Rests are what make the bursts land; the reference is still a third of the time.”
  Joplo 建议：〔组件〕结果步骤到位后真正静止（不要在停留时加缓慢推镜），见 3.4。

- **3.4 慢推镜头不算停顿；停顿必须完全静止。**
  出处：`onetake/references/rhythm.md` L135；`onetake/references/composition.md` L218–219
  引用：“Rests are dead still: no `drift`, no settling camera. A push in a hold is motion to verify.”
  Joplo 建议：〔组件〕shot 推近动画应在停留开始前完成。

- **3.5 爆发段：1.5 秒内至少 3 次大变化，且不能按均匀间隔出现；没有打点的概念可以没有爆发段。**
  出处：`onetake/references/rhythm.md` L51–52
  引用：“at least one burst (≥ 3 big changes inside 1.5 s), not at a uniform interval.”
  Joplo 建议：〔不适用〕功能演示一般不需要；如果做“发布预告”类 scenario 才考虑。

- **3.6 剪切次数：参考片 26 秒内 7 次；不是每秒一切。**
  出处：`onetake/references/reference-deconstruction.md` L38
  引用：“Cut count. 7 in 26 s. A cut every second is not this genre.”

- **3.7 具体速度：打字 38 字符/秒；检查清单 7 行，每行间隔 0.24 秒。**
  出处：`onetake/cases/motion-web-15s/README.md` L23–24
  引用：“text types at 38 cps”／“7 lines tick .24 s apart”
  Joplo 建议：〔组件〕`.type` 默认打字速度可参考 38 cps（英文字符）。

- **3.8 配音连续，句间换气 0.45 秒；片长跟着配音走，不要为凑时长拉开句子。**
  出处：`onetake/references/product-demo.md` L79–80（§4 Narration）
  引用：“**Continuous narration**: 0.45 s breaths. … Never space lines out to fill a length. The film's length follows the VO.”
  Joplo 建议：〔不适用〕Joplo 目前没有配音；以后加配音时，时长应由文本推出，不要先定时长。

- **3.9 承诺时长前先测量（“删 8–10 个词就够了”曾经估错）。**
  出处：`onetake/references/product-demo.md` L83–84
  引用：“**Measure before promising a length.** "Cutting 8–10 words will do" was wrong once.”
  Joplo 建议：〔看板功能〕封面的“约 M 秒”应由停留规则实时算出，不要让作者手填。

- **3.10 换语言时用时间映射；时间斜率保持在约 0.5–1.4，太低像慢动作，太高显得赶。**
  出处：`onetake/references/product-demo.md` L120–122
  引用：“Keep it between ~0.5 and ~1.4. Below that a move plays in visible slow motion, above it the move rushes.”
  Joplo 建议：〔看板功能〕如果加播放倍速，可以参考这个范围。

### 主题 4：旁白与字幕

- **4.1 字幕在标点处切块：拉丁文每块 ≤42 字符，中日韩 ≤20 字；短于上限 1/3 的碎句（如“だから、”“So,”）并入下一句，合并后最多可到 1.3 倍上限。**
  出处：`onetake/scripts/vo_tools.py` L22–23、L131–132、L183（只读）
  引用：“each line split at its punctuation into chunks of at most --max characters (Latin) / --max-cjk (CJK)”（默认 `--max 42`、`--max-cjk 20`）
  Joplo 建议：〔看板功能〕42 个拉丁字符按半字算是 21，和中文 20 字几乎一样，说明 Joplo“英文算半字、上限 24”的换算是合理的；可以加“碎句并入下一句”的检查。

- **4.2 每个节拍落在某个词上，并写明是哪个词；换配音时只需重读词时间表。**
  出处：`onetake/references/product-demo.md` L81–82
  引用：“**Beats sit on words** … Every beat names the word it lands on”
  Joplo 建议：〔作者 API〕字幕里可以标出关键词，让高亮或点击在读到该词时触发。

- **4.3 换语言要“重写，不要翻译”：按目标语言的语序和长度写，秒数大致相同；提到界面标签时，用界面里显示的本地化标签。**
  出处：`onetake/references/product-demo.md` L95–97
  引用：“**Write, don't translate.** … Any line that names a UI label must use the **localised** label the replica shows.”
  Joplo 建议：〔技能文字〕字幕里提到的按钮名必须和画面上的文字完全一致（可以自动检查）。

- **4.4 配音提到的界面文字，在屏幕上至少 26 像素。**
  出处：`onetake/references/product-demo.md` L52–53
  引用：“Anything the VO names should be ≥ 26 px.”
  Joplo 建议：〔看板功能〕字幕提到的元素按“字号 × 缩放 × 镜头倍数”算出屏幕字号，不足时建议 shot 推近。

- **4.5 意义要做进画面本身，不要靠加标签解释；给光标加文字标签反而更糟。**
  出处：`onetake/SKILL.md` L25–27
  引用：“adding labelled cursors made it worse; it read only once the idea was built into the artwork”
  Joplo 建议：〔技能文字〕字幕不要描述画面已经清楚表达的东西。

- **4.6 用透明度淡入的文字节拍像 PowerPoint；文字要带位移和一点缩放“落下来”。**
  出处：`onetake/references/composition.md` L213–214
  引用：“Word beats written as `opacity` fades read as PowerPoint”
  Joplo 建议：〔组件〕字幕和过渡卡标题的进场动画可以参考。

### 主题 5：场景切换与转场

- **5.1 每个段落交界都要有一个元素留下来，并且看得见地移动或缩放进下一拍；什么都没留下就是换幻灯片，不管节奏多好。**
  出处：`onetake/SKILL.md` L84–88（§3 Carry）、L200–202（Hard rules）
  引用：“If nothing survives, it is a slide change, whatever the rhythm.”／“Mutually exclusive scenes (`display:none` swaps) are slides even with perfect rhythm.”
  Joplo 建议：〔组件〕多层级页面切换时，被点的元素放大成新页面（morph）比整页替换好；过渡卡也应保留一个延续元素（同一角色头像、同一条数据）。

- **5.2 有效的接住方式：被按的东西变成结果；舞台从主体打开；手把下一个选项拖进来；所有元素收拢成标志。手是最省事的载体。**
  出处：`onetake/references/rhythm.md` L128–131
  引用：“The hand is the cheapest carrier: keep it on screen across a boundary it caused.”
  Joplo 建议：〔组件〕跨步骤、跨页面时光标不要消失或复位，从上一步的点击位置继续移动。

- **5.3 一页接一页就是幻灯片，哪怕每页都在动。**
  出处：`onetake/references/rhythm.md` L132
  引用：“Page after page is a slideshow even when each page moves”

- **5.4 不要连续两个镜头用同一种方式结束（弹出、模糊、硬切要轮换）。**
  出处：`onetake/references/rhythm.md` L55
  引用：“Never end a shot the same way twice in a row (spring-out, blur-out, hard cut — alternate).”
  Joplo 建议：〔看板功能〕连续两个过渡卡用同一种出场方式时提示。

- **5.5 先切去看结果再切回来，等于两次剪切；要预告结果，就在原画面上叠一个放大镜或窗口。**
  出处：`onetake/references/product-demo.md` L138–140（§7 Things that bit）
  引用：“A preview that cuts away and back is two cuts. … A lens or window *over* the base shot shows the future without leaving it.”
  Joplo 建议：〔组件〕封面或钩子想先给结果时，用画中画缩略图，不要跳到最后一步再跳回来。

- **5.6 每拍都重新取景的镜头本身就成了节拍器；左右交替跳会翻转画面方向，观众得反复重新找画面。有理由的运动（跟着转向的东西走）更好。**
  出处：`onetake/references/rhythm.md` L146–148、L161–163
  引用：“A camera that reframes on every beat becomes the metronome.”
  Joplo 建议：〔组件〕shot 推近只用在需要看清的步骤，不要每步都推。

- **5.7 带配音的界面演示不要镜头抖动（30fps 加 180° 快门会变成重影）。**
  出处：`onetake/references/product-demo.md` L141–142
  引用：“Narrated UI films want no shake.”
  Joplo 建议：〔组件〕shot 不加抖动。

### 主题 6：一个演示讲几件事

- **6.1 只讲一个故事（概念的故事），不要做目录；成功的版本讲“它怎么做事”，而不是把输出一个个排出来。**
  出处：`onetake/SKILL.md` L81–82；`onetake/references/rhythm.md` L43–45
  引用：“One story — the concept's — not a catalogue.”／“it **tells what the thing does** … instead of showing outputs one after another”
  Joplo 建议：〔技能文字〕一个 scenario 只沿一条主线走完。

- **6.2 每个操作一个特写（模式 → 选择 → 上传 → 发送 各自取景），镜头跟着手在它们之间移动；只有“关系本身就是重点”时才用全景。**
  出处：`onetake/references/product-demo.md` L56–57
  引用：“**One close-up per operation** … The wide shot is for moments where the relation *is* the point.”
  Joplo 建议：〔作者 API〕shot 默认跟随当前步骤的目标元素；要看全局关系时显式写 `shot('wide')`。

- **6.3 需要阅读的窗口应占画面宽度约 70–80%；把卡片、窗口和结果塞进一个全景，界面看不清，被打回。**
  出处：`onetake/references/product-demo.md` L53–55
  引用：“A window that must be read should be ~70–80 % of the frame width.”
  Joplo 建议：〔组件〕播放器默认缩放让应用窗口占约 75% 宽。

- **6.4 不要把整页做成缩略图还指望看清它的动效：要么带手全屏，要么只把其中一个组件放进卡片里动。**
  出处：`onetake/SKILL.md` L203–204
  引用：“Never show a page as a thumbnail expecting its motion to read.”

### 主题 7：成片验收

- **7.1 自动验收项：cadence（镜头长度 CV）、rest（静止比例）、burst（爆发段）、continuity（接住分数 <0.5 不通过，<0.7 警告）、curves（无运动模糊时 >80 px/帧不通过）、framing（声明必须在画面内的元素出画就不通过）。**
  出处：`onetake/SKILL.md` L182–189（§8 Verify）；`onetake/references/rhythm.md` L94–95
  引用：“**continuity** fails beats that replace each other (carry score < 0.5)”
  Joplo 建议：〔看板功能〕可借用两项：步长 CV；“目标元素在 shot 内”（字幕提到的元素不能出画）。

- **7.2 第一版能完整播放时就跑探测；标为 bare 的交界就是会被看成幻灯片的地方。**
  出处：`onetake/references/rhythm.md` L134
  引用：“Run probe.py on the first playable storyboard. Its `bare` lines are the beats that will read as slides.”

- **7.3 探测器的盲区：交界很少的“一镜到底”即使通过，也不算证据，仍需肉眼判断。**
  出处：`onetake/references/rhythm.md` L118–120
  引用：“A PASS over fewer boundaries than the beat sheet has is not evidence.”

- **7.4 复刻的界面要逐个状态和参考截图 1:1 并排比对，直到只剩有意的差异。**
  出处：`onetake/references/product-demo.md` L47–48
  引用：“go state by state until the only differences are deliberate.”
  Joplo 建议：〔看板功能〕“截图对照”视图：左边参考截图，右边同一状态的 Joplo 渲染。

- **7.5 画面上的内容只来自产品的真实输出；为了好看编的数字，是产品从没做过的承诺。**
  出处：`onetake/references/product-demo.md` L29–31
  引用：“Numbers invented because they look good are a claim the product never made.”
  Joplo 建议：〔技能文字〕演示里的示例数据要可信，且能追溯来源。

### 主题 8：用户故事
未涉及。

### 主题 9：其他对产品演示有用的技巧

- **9.1 不录屏，用 HTML 重建界面：所有字符串放进表里，每个状态由纯函数 `set(state)` 写出，镜头推到多近都清晰；也不会意外露出账号或令牌。**
  出处：`onetake/references/product-demo.md` L9–18、L38–40、L46
  引用：“**No account, no timing, no leaks.**”
  Joplo 建议：〔不适用〕这正是 Joplo 的路线，可以作为对外介绍时的论据。

- **9.2 高亮样式：按内容大小画发光圆角矩形，先画出再收掉；不用细框，不用圆圈；菜单行只圈图标和名称，不圈整行。**
  出处：`onetake/references/product-demo.md` L61–63
  引用：“never a thin frame, never a circle. For a menu row, ring the icon and name, not the whole row.”
  Joplo 建议：〔组件〕高亮组件的默认样式。

- **9.3 光标点在元素的真实中心，每次点击有按下/抬起，间隔约 75 毫秒。**
  出处：`onetake/references/product-demo.md` L64
  引用：“A cursor clicks real element centres, with a press/release pair (~75 ms apart) on each click.”
  Joplo 建议：〔组件〕`.click` 的默认时序。

- **9.4 原因必须看得见：没有触发者的页面反应像屏保。**
  出处：`onetake/SKILL.md` L209–210
  引用：“The cause must be visible. … A page reacting to nothing reads as a screensaver.”
  Joplo 建议：〔组件〕`.system` 步骤（系统自己变化）要有可见的触发：上一步的点击、计时器或通知。

- **9.5 结果确定：同一时间点 seek 两次必须得到同一帧，不在渲染路径上用随机数。**
  出处：`onetake/SKILL.md` L223–224
  引用：“`__seek(t)` twice must give the same frame”

---

## 2. Pluviobyte/video-production-skills

这是一个中文的 AI 视频制作技能合集，共 4 个技能：`ai-motion-director`（元导演，负责反 PPT 质检）、`reference-video-replica-qc`（参考片复刻与逐帧质检）、`dark-saas-magic-video`（暗色 SaaS 产品短片风格）、`black-white-text-opener`（黑底白字逐字打出的开场），面向 HyperFrames / Remotion。

### 主题 1：从想法到分镜

- **1.1 用一句话写“运动论点”（motion thesis）：用什么视觉隐喻、从什么状态变到什么状态、证明什么主张；找不到会动的隐喻就先别排场景。**
  出处：`video-production-skills/ai-motion-director/SKILL.md` L60–75（§3 Motion Thesis）
  引用：“`This video moves by showing <visual metaphor> transforming from <start state> to <end state>, proving <core claim>.`”
  Joplo 建议：〔看板功能〕feature 的 goal 可以写成“从 X 状态到 Y 状态”，scenario 的首步和末步分别对应这两个状态。

- **1.2 节拍图（beat graph）字段：time、narrative job（hook / reveal / contrast / mechanism / consequence / proof / close）、main moving object、state change、camera/layer motion、text role、asset need、PPT risk。**
  出处：`video-production-skills/ai-motion-director/SKILL.md` L77–90（§4 Beat Graph）
  引用：“Plan a continuous timeline, not pages.”
  Joplo 建议：〔作者 API〕步骤可选 `job: 'hook'|'mechanism'|'proof'|'close'`，看板据此检查每个 scenario 有没有 hook 和 close。

- **1.3 收集需求时只问会改变制作路线的问题；没说明时默认 16:9、30–60 秒；只给了主题就直接按判断做。**
  出处：`video-production-skills/ai-motion-director/SKILL.md` L36–49（§1 Intake）
  引用：“default to 16:9 and 30-60 seconds if unspecified”／“Do not ask for a full brief unless the missing answer changes the production route.”

- **1.4 事实闸门：涉及事实的主题先核实核心说法；事实要短，视频不能变成百科全书。**
  出处：`video-production-skills/ai-motion-director/SKILL.md` L51–58（§2 Source and Truth Gate）
  引用：“Keep facts short. The video should not become an encyclopedia”

- **1.5 产品短片：把产品映射成 5–8 个能力节拍，优先因果链：文字承诺 → 提示词 → 点 CTA → 生成结果 → 集成/模型 → 导出 → 最终主张。**
  出处：`video-production-skills/dark-saas-magic-video/SKILL.md` L85–89（§1 Shape The Arc）
  引用：“Prefer a cause-and-effect chain: text promise -> prompt -> CTA click -> generated result -> integrations/models -> export -> final claim.”
  Joplo 建议：〔技能文字〕flow 的步骤之间要有因果（上一步的输出是下一步的输入）。

- **1.6 素材清单：产品名、logo、一句话承诺、3–5 个痛点词或品类词、1 个示例提示词、1 个 CTA 文案、3–6 个输出示例、4–10 个集成名、3–6 种导出格式、截图。**
  出处：`video-production-skills/dark-saas-magic-video/references/asset-contract.md` L3–14
  引用：“one-line promise”／“3-5 pain words or category words”

- **1.7 只做规划时，按固定顺序输出：运动论点 → 节拍图 → 组件与素材计划 → 反 PPT 风险 → 制作路线。**
  出处：`video-production-skills/ai-motion-director/SKILL.md` L157–165（Output Contract）
  引用：“For planning-only requests, output: 1. Motion thesis 2. Beat graph …”

### 主题 2：开场钩子与收尾

- **2.1 开场时长预设：Micro 2.4–3.2 秒（需要几乎立刻进钩子时用）；Standard 4.8–5.8 秒（默认）；Slow 6.0–7.5 秒。**
  出处：`video-production-skills/black-white-text-opener/references/timing-presets.md` L3–39
  引用：“Use for short vertical videos or when the hook must start almost immediately.”
  Joplo 建议：〔组件〕开场过渡卡的停留可以参考 Micro / Standard 两档。

- **2.2 开场流程：先纯黑停 0.2–0.5 秒 → 逐字打出 → 停住 → 1–3 次替换 → 最后一句停到能读完 → 干净转出；最后停住前最多 3 个文字状态。**
  出处：`video-production-skills/black-white-text-opener/SKILL.md` L52–57、L84–92；`video-production-skills/black-white-text-opener/references/motion-contract.md` L61
  引用：“use only 1-3 replacement states”／“Do not use more than 3 text states before the final hold.”

- **2.3 开场文案：先写 2–3 个短句选项，挑最干净的；避免长句；一行有力的话或两行短话。**
  出处：`video-production-skills/black-white-text-opener/SKILL.md` L47–48；`video-production-skills/black-white-text-opener/references/motion-contract.md` L16
  引用：“write 2-3 short phrase options and choose the cleanest one. Avoid long sentences.”
  Joplo 建议：〔技能文字〕开场卡和封面标题让 Agent 先给 2–3 个候选再定。

- **2.4 最终主张：一个大词单独出现 → 第二个词加入 → 短语变化 2–4 个状态 → 最后一句至少停 1 秒。**
  出处：`video-production-skills/dark-saas-magic-video/references/scene-blueprints.md` L93–102（8. Final Claim）
  引用：“final phrase holds for at least 1 second”
  Joplo 建议：〔组件〕收尾卡最少停留时间。

- **2.5 至少有一个 CTA 按钮，按下后触发看得见的变化；动态大字出现在开头或结尾，最好两头都有。**
  出处：`video-production-skills/dark-saas-magic-video/SKILL.md` L71–72；`video-production-skills/dark-saas-magic-video/references/qc-checklist.md` L8
  引用：“Include at least one cyan-to-magenta gradient CTA that triggers a visible transformation.”

### 主题 3：节奏与时长

- **3.1 时长预设：Sting 8–12 秒，3–4 个场景模块；Standard 30–36 秒（默认），6–8 个模块；Extended 45–60 秒，也要避免变成幻灯片。**
  出处：`video-production-skills/dark-saas-magic-video/references/timing-presets.md` L3–41
  引用：“Use 6-8 scene modules.”（Standard）
  Joplo 建议：〔看板功能〕步数与时长的参考区间：约 30 秒对应 6–8 个“段落”。

- **3.2 打字速度：默认 14 字符/秒；密集中文 12 字符/秒；英文短词或产品名 14–16；打不完就先缩短文案，不要超过 16 字符/秒；中文和中英混排保持在约 10–16 字符/秒。**
  出处：`video-production-skills/black-white-text-opener/references/timing-presets.md` L41–47；`video-production-skills/black-white-text-opener/references/motion-contract.md` L57–58
  引用：“If a phrase cannot finish inside its typing window, shorten the copy before raising cadence above `16 chars/s`.”
  Joplo 建议：〔组件〕`.type` 中文打字默认 12 字/秒，上限 16；超出就提示缩短文本。注意这是打字动画速度，不是阅读速度。

### 主题 4：旁白与字幕

- **4.1 文字是锚点，不是主要载体；需要读一大段才能懂的节拍，要改成动作、结构、符号或图像。**
  出处：`video-production-skills/ai-motion-director/SKILL.md` L31–32
  引用：“Text is an anchor, not the main carrier.”
  Joplo 建议：〔技能文字〕字幕补充画面，不替代画面：去掉字幕后，操作和结果也应该看得懂。

- **4.2 每拍标注文字负荷：none / light / heavy。**
  出处：`video-production-skills/ai-motion-director/references/anti-ppt-gate.md` L19–27
  引用：“`text load`: none / light / heavy”
  Joplo 建议：〔看板功能〕按字幕 + explain 字数显示每步的文字负荷，heavy 时提示拆步。

- **4.3 不要悄悄编造产品能力；不确定的能力用泛化说法，或问一个问题（如 “Works where you do” 代替 “Runs locally”）。**
  出处：`video-production-skills/dark-saas-magic-video/references/asset-contract.md` L32–41
  引用：“Do not invent product capabilities silently.”

- **4.4 主标题文字约占画面高度的 9–15%；所有文字要大到手机上看得清。**
  出处：`video-production-skills/black-white-text-opener/references/motion-contract.md` L12、L17
  引用：“Use large display sizing: about 9-15% of frame height for the hero phrase.”
  Joplo 建议：〔组件〕过渡卡标题字号参考。

### 主题 5：场景切换与转场

- **5.1 转场要由叙事隐喻驱动；会把视觉上下文全部清空的切换是 PPT 的典型症状。**
  出处：`video-production-skills/ai-motion-director/references/anti-ppt-gate.md` L13、L38
  引用：“scene cuts that reset all visual context”
  Joplo 建议：〔组件〕换角色或时间跳跃的过渡卡，背景最好保留上一画面的虚化，而不是纯色清屏。

- **5.2 重复规则：同一种运动在全片重复以保持连贯，但每次改变它的含义，而不是切到无关的版式。**
  出处：`video-production-skills/ai-motion-director/references/motion-grammar.md` L48–52
  引用：“Reuse a primitive across the whole video to create coherence, but change what it means.”

- **5.3 （暗色风格）大转场用速度模糊、拖影、缩放或白色擦除；不要无缘无故的全屏纯色闪。**
  出处：`video-production-skills/dark-saas-magic-video/SKILL.md` L76–80
  引用：“Never add unexplained full-screen solid color flashes.”

### 主题 6：一个演示讲几件事

- **6.1 每个视频组合 2–4 种运动原语并有变化地复用；每拍一个主导原语加一个辅助原语。**
  出处：`video-production-skills/ai-motion-director/SKILL.md` L94–96；`video-production-skills/ai-motion-director/references/motion-grammar.md` L32
  引用：“Combine 2-4 motion primitives per video and reuse them with variation. Do not stack every effect everywhere.”
  Joplo 建议：〔技能文字〕一个 scenario 只用少数几种过渡和强调手法。

- **6.2 主体在最显眼那一帧要够大；每个场景都要有一帧能看清的主画面。**
  出处：`video-production-skills/dark-saas-magic-video/SKILL.md` L74–75；`video-production-skills/dark-saas-magic-video/references/qc-checklist.md` L15
  引用：“every scene has a readable hero frame”

- **6.3 只选和产品真实能力匹配的场景模块，不要全用。**
  出处：`video-production-skills/dark-saas-magic-video/SKILL.md` L91–94
  引用：“Do not blindly use all modules; match the product's real capabilities.”

### 主题 7：成片验收

- **7.1 计划阶段的反 PPT 检查（任何一项答“否”就重写）：有没有贯穿的视觉系统；每拍有没有主运动对象；每拍有没有状态变化（不只是入场）；文字是否只是辅助；转场是否有叙事理由；不读字幕，接触表能否看出进展。**
  出处：`video-production-skills/ai-motion-director/references/anti-ppt-gate.md` L5–15
  引用：“Can a contact sheet reveal progression without reading every caption?”
  Joplo 建议：〔看板功能〕把 scenario 的每步关键帧拼成接触表，让作者检查“不看字幕能不能看懂进展”。

- **7.2 逐拍检查：运动动词只有 fade、slide、pop 的就改；至少 80% 的节拍要有超出淡入/滑入的可见状态变化。**
  出处：`video-production-skills/ai-motion-director/references/anti-ppt-gate.md` L29；`video-production-skills/ai-motion-director/SKILL.md` L90
  引用：“At least 80% of beats must have a visible state change beyond fade/slide-in.”
  Joplo 建议：〔看板功能〕统计 scenario 中“界面状态没变”的步骤占比。

- **7.3 接触表看起来像六张幻灯片缩略图，就在出成片前返工。**
  出处：`video-production-skills/ai-motion-director/references/anti-ppt-gate.md` L44–55
  引用：“If the contact sheet reads like six slide thumbnails, revise before rendering the final MP4.”

- **7.4 交付前：在有意义的节拍中点抽关键帧；检查文字是否放得下、分辨率、时长；如实说明剩余限制。**
  出处：`video-production-skills/ai-motion-director/SKILL.md` L146–155（§9 QC and Completion）
  引用：“extract keyframes at meaningful beat midpoints”／“state remaining limitations honestly”

- **7.5 复刻质检：先按 0.5 秒抽样了解全片，在快速文字、光标、列表切换、场景切换附近按 0.1 秒抽；不要让后面好看的帧掩盖前面出错的帧；要测真实的播放路径；渲染日志成功不算交付证据。**
  出处：`video-production-skills/reference-video-replica-qc/references/alignment-workflow.md` L20–23、L37；`video-production-skills/reference-video-replica-qc/references/presenton-lessons.md` L64；`video-production-skills/reference-video-replica-qc/SKILL.md` L96–97
  引用：“Do not let a later visually impressive frame hide an earlier red frame.”／“Test the production time path.”
  Joplo 建议：〔看板功能〕自动截图检查要走真实的播放器时间线，不能用测试专用的设置函数。

- **7.6 开场质检：前几帧是黑的；字是依次出现的；打字声在停住时停止；手机尺寸上可读；文字不出框；没有意外的彩色闪。**
  出处：`video-production-skills/black-white-text-opener/SKILL.md` L97–109
  引用：“white text is readable at mobile size”

### 主题 8：用户故事
未涉及。

### 主题 9：其他

- **9.1 光标点击要有反馈。**
  出处：`video-production-skills/dark-saas-magic-video/references/qc-checklist.md` L19
  引用：“cursor clicks have feedback when used”

- **9.2 静态图必须动起来（裁切、遮罩、视差、揭示、扫光等）；一张静图加文字不够。**
  出处：`video-production-skills/ai-motion-director/SKILL.md` L111–112
  引用：“A still image plus text is not enough.”

- **9.3 每个验证过的动效组件都要登记：适用内容、输入参数、时间合约、实现栈、证据、已知限制。**
  出处：`video-production-skills/README.md` L11–13；`video-production-skills/reference-video-replica-qc/SKILL.md` L113–123
  引用：“inputs and timing contract”／“known limits”
  Joplo 建议：〔组件〕和“缺的能力先做成组件”的原则一致：组件文档写清输入、时序、限制。

- **9.4 主题对应的隐喻里，教程类是：揭示透镜、装配线、步骤机、引导光标。**
  出处：`video-production-skills/ai-motion-director/references/motion-grammar.md` L26
  引用：“education/tutorial: reveal lens, assembly line, step machine, guided cursor.”

---

## 3. farhan-syah/motion-video-skill

这个 agent skill 把一句话 brief（加上可选的截图、logo、音乐、配音）变成 HTML/CSS/SVG 场景，再用无头 Chromium 和 ffmpeg 渲染成 MP4。它强调先写 `direction.md` 导演、每条事实都有来源，并用 `check`/`audit` 自动检查字号、对比度、停留时长和音画同步。

### 主题 1：从想法到分镜

- **1.1 先导演再动手；不要把一句 brief 直接写成代码。**
  出处：`motion-video-skill/SKILL.md` L8
  引用：“Direct first, then build. Never turn a plain brief straight into code.”

- **1.2 `direction.md` 结构：Facts（每条带来源）→ Brief → Concept（三个选项、选中哪个、为什么）→ Look → Sound → Beats 表；Beats 表列：Time | Scene | Idea and composition | On screen and action (cue times) | Copy | Sound。每行 1.5–4 秒。**
  出处：`motion-video-skill/templates/direction.md` L5–46
  引用：“One row per beat (1.5–4 s).”
  Joplo 建议：〔看板功能〕看板的 scenario 视图可以显示同样的列：时间 | 画面与动作 | 字幕 | explain。

- **1.3 先收集事实，每条事实写来源；屏幕上的每个主张、功能、数字都要能追溯到一条事实；缺的事实就不写。**
  出处：`motion-video-skill/references/direction.md` L23–35（§0 Gather the facts）
  引用：“Every claim, feature and number on screen traces to one.”
  Joplo 建议：〔作者 API〕feature 的 rules/cases 可以带 `source` 字段（需求文档、Issue 链接）。

- **1.4 提问：一条消息，最多 5 个问题，每个问题附默认答案；brief 已经回答或用户要求一次出结果时跳过。**
  出处：`motion-video-skill/references/direction.md` L6–21（Ask the user）
  引用：“one message, at most five questions, each with your default.”
  Joplo 建议：〔技能文字〕Agent 起草前的提问格式。

- **1.5 写三个概念（故事形状和视觉处理都不同，至少一个来自产品本身），选最强的，写明为什么赢；给用户一个 5 行摘要后继续，不等待。**
  出处：`motion-video-skill/references/concepts.md` L7–12；`motion-video-skill/SKILL.md` L17
  引用：“Give the user a 5-line summary, then continue without waiting.”

- **1.6 故事形状示例：Problem → turn → proof；Question hook；Search → overload → guide；Live walkthrough（光标端到端使用真实产品）；Stat → mechanism → result；Manifesto；Motif journey；Chaptered walkthrough（45–90 秒，多功能 App）。**
  出处：`motion-video-skill/references/concepts.md` L14–25
  引用：“Live walkthrough | A cursor uses the real product end to end: type, pick, click. The result lands where it matters”
  Joplo 建议：〔技能文字〕把这些形状列为 option 的候选；Joplo 的默认形状是 Live walkthrough。

- **1.7 “动作瞬间”（verb moment）表：用一个看得见的动作证明一个好处，如自动化 = 一条消息扇出成多张卡片；速度 = 任务自己打出来、进度环合上；审批 = 卡片浮起、按钮被按、印章落下；前后对比 = 擦除或旧界面碎成新界面。子动作间隔 2–4 拍。**
  出处：`motion-video-skill/references/direction.md` L133–148（§5 Find the verb moment）
  引用：“Prove each feature with one physical action that shows the benefit”
  Joplo 建议：〔技能文字〕每个 rule/case 都要指定一个让结果“看得见”的步骤。

### 主题 2：开场钩子与收尾

- **2.1 三个锚点：Hook（前 2 秒，强画面或强句子，让陌生人知道这视频讲什么；第 0 帧就要有动作；不要以 logo 开场）；Payoff（结果可见，或前后对比）；End card（logo、承诺句、CTA 按钮，静止至少 1.5 秒供阅读）。**
  出处：`motion-video-skill/references/direction.md` L92–100（§4 Structure the time）
  引用：“A strong image or line in the first 2 s that tells a stranger what the video is about. Motion from frame 0. No logo-first intros.”
  Joplo 建议：〔组件〕收尾卡最少停留 1.5 秒；〔看板功能〕检查每个 scenario 是否有 payoff 步骤（结果可见）。

- **2.2 先定向：前 2–3 秒在屏幕上和第一句话里点出主题；“So you open the app…” 默认观众知道背景，不合格。**
  出处：`motion-video-skill/references/direction.md` L103；`motion-video-skill/references/narration.md` L44
  引用：“"So you open the app…" assumes context the viewer lacks.”
  Joplo 建议：〔技能文字〕第 1 步字幕要点出“谁、在做什么”，不能用“然后点这里”。

- **2.3 第 0 帧就是缩略图：要有主体或标题，手机尺寸下当静图也能看懂；不能是空白、半成品、只有 logo 或只有界面边框；3 秒内陌生人应知道视频讲什么；视频结束在落版上。**
  出处：`motion-video-skill/references/craft.md` L96–105（Final pass）
  引用：“**Opening:** by 3 s, a stranger knows what the video is about.”／“**End card:** it holds long enough to read, and the video ends on it.”
  Joplo 建议：〔组件〕封面（第 0 步）要能当分享缩略图：标题足够大，最好带一张结果预览。

- **2.4 logo 放在落版上；需要露 logo 时，在钩子之后马上做一个组合标识，绝不用 logo 开场。**
  出处：`motion-video-skill/references/direction.md` L105
  引用：“Never open on it.”

- **2.5 落版内容：logo、承诺句、应用商店徽章或按钮、URL。**
  出处：`motion-video-skill/references/concepts.md` L114
  引用：“**End card:** logo, promise line, store badges or a button, and the URL.”

- **2.6 长片拆成系列时，每段开头用一句话交代背景，结尾一句话点名下一段。**
  出处：`motion-video-skill/references/delivery.md` L29–31
  引用：“each part opens with a line that gives its context. It ends with a line that names the next part.”
  Joplo 建议：〔组件〕多 scenario 连播时，收尾卡可以写“下一个：<下个 scenario 标题>”。

### 主题 3：节奏与时长

- **3.1 brief 没给时长时默认 30 秒。**
  出处：`motion-video-skill/references/direction.md` L58
  引用：“**Length:** 30 s when the brief gives none.”

- **3.2 节拍 = 屏幕上一个想法，1.5–4 秒；30 秒预告片 10–15 个节拍；节拍长度要变化，短促的一串推向关键节拍上更长的停留。**
  出处：`motion-video-skill/references/concepts.md` L27–30（Beats and pacing）
  引用：“**Beat:** one idea on screen, 1.5–4 s long. A 30 s teaser holds 10–15 beats.”／“Quick bursts build toward a longer hold on the key beat.”
  Joplo 建议：〔看板功能〕Joplo 的 3–7 秒比这里的 1.5–4 秒长，对界面理解是合理的；但关键结果步骤应该明显长于过程步骤（见 onetake 3.2）。

- **3.3 阅读时间：每行至少停“词数 ÷ 3”秒；阅读速度 3 词/秒，每段文字至少 0.8 秒（依据 BBC 字幕 160–180 词/分钟、Netflix 最短 20 帧）。**
  出处：`motion-video-skill/references/direction.md` L171；`motion-video-skill/references/craft.md` L18；`motion-video-skill/scripts/lib/check.mjs` L14（只读）
  引用：“**Reading time:** every line holds for at least words ÷ 3 seconds.”／“3 words/s, and at least 0.8s per text”
  Joplo 建议：〔看板功能〕英文字幕可以用“词数 ÷ 3”秒作为最短停留，和 Joplo 的中文 8 字/秒并存。五个仓库里都没有中文阅读速度的数字。

- **3.4 语速：约 4.1 音节/秒（3.5–4.7），属于轻松的讲解；课程更慢，发布片和广告更快。**
  出处：`motion-video-skill/references/narration.md` L45
  引用：“`speak` aims at about 4.1 syllables per second while speaking (3.5 to 4.7), a relaxed explainer.”

- **3.5 停顿：换行 0.45 秒；空行 0.8 秒（故事段落之间）；行内句末 0.3 秒；`[pause]` 0.6 秒；章节切换在常规间隔上再加 0.8–1.2 秒。**
  出处：`motion-video-skill/references/narration.md` L108–115、L124
  引用：“At a chapter or scene-group change, add 0.8 to 1.2 s to the usual gap.”
  Joplo 建议：〔组件〕过渡卡（换章节、换角色、跳时间）前后各加约 1 秒的空白。

- **3.6 配合配音的时间：场景在第一个词前 0.55 秒开始；最后一个场景在最后一个词后停 4.5 秒（默认）；文字行比它的第一个词早约 0.2 秒落位；动作瞬间正好落在它的词上。**
  出处：`motion-video-skill/references/narration.md` L139、L203
  引用：“A line lands about 0.2 s before its first word, a verb moment on its word.”
  Joplo 建议：〔组件〕字幕比对应动作早约 0.2 秒出现，动作在字幕显示期间发生。

- **3.7 动效时长：文字和道具入场 0.5–1.0 秒，出场 0.3–0.5 秒；同级元素错开 0.06–0.12 秒；入场减速，出场加速。**
  出处：`motion-video-skill/references/craft.md` L21–24
  引用：“0.5–1.0s for text and props. 0.3–0.5s for exits.”

### 主题 4：旁白与字幕

- **4.1 在三种文案系统里选一种并全片保持：caption track（每拍底部一行，关键词用强调色）；statements（居中大句，随构图变化）；chapter headlines（固定位置的两行标题，带 “03 · DIRECT” 这样的编号标签）。**
  出处：`motion-video-skill/references/direction.md` L162–167；`motion-video-skill/references/concepts.md` L69
  引用：“**Caption track:** one narration line per beat along the bottom, the key word in the accent.”
  Joplo 建议：〔组件〕Joplo 字幕就是 caption track；可以支持“关键词强调色”（作者 API 例如 `**词**`）。

- **4.2 有配音时，屏幕只显示耳朵记不住的东西：关键词、数字、名字、地点；除字幕轨外，不要再重复一遍脚本。**
  出处：`motion-video-skill/references/direction.md` L168
  引用：“The screen shows what the ear cannot hold: the key word, number, name, place”

- **4.3 标题最多 6 个词、一个想法；功能卡每个功能一张，放在顶部或底部，绝不压在动作上；界面文案用真实名称、金额、日期，不用 “Lorem ipsum” 或 “Feature 1”。**
  出处：`motion-video-skill/references/direction.md` L169–172
  引用：“**Headlines:** at most 6 words, one idea.”／“never over the action.”
  Joplo 建议：〔组件〕字幕和 explain 不能遮住当前步骤的目标元素（自动避让）。〔技能文字〕示例数据用真实感的名字和金额。

- **4.4 写给耳朵听：短语，一行一个，数字或揭示之前留一拍；第一句定向。**
  出处：`motion-video-skill/references/narration.md` L31、L44
  引用：“short phrases, one per line, with a beat before a number or a reveal.”

- **4.5 自动标记：9 个词以上没有停顿的句子、没有结尾标点的行。**
  出处：`motion-video-skill/references/narration.md` L69–75
  引用：“Sentences of 9 words or more with no breath.”

- **4.6 字幕是用户的决定：先问；默认既不烧录也不出字幕文件；画面上文字已经很多时，字幕轨只会重复，就不加。**
  出处：`motion-video-skill/references/narration.md` L215–219（Captions）
  引用：“captions are the user's decision. Never add a caption track on your own.”
  Joplo 建议：〔不适用〕Joplo 以字幕为主，不同；但“画面文字已经说清就不要在字幕里重复”这一条适用。

- **4.7 字幕文件：每条最多 2 行、每行 42 字符，每条 1–6 秒；烧录字幕每行默认最多 3 个词，在标点和停顿处断开。**
  出处：`motion-video-skill/references/narration.md` L221–223；`motion-video-skill/templates/subtitles.mjs` L4、L9（只读）
  引用：“at most two lines of 42 characters, 1 to 6 s per cue.”
  Joplo 建议：〔看板功能〕单条字幕显示时间上限 6 秒，可作为 Joplo 7 秒上限的参照。

- **4.8 字号与可读性：1080p 下最小 28 像素（按经过所有变换后的尺寸测）；正文对比度 4.5:1；不透明内容盖住可见文字最多 0.3 秒；两段文字重叠最多 0.25 秒。**
  出处：`motion-video-skill/references/craft.md` L5–19（Thresholds）
  引用：“28px at 1080p on the short side, measured through every transform.”
  Joplo 建议：〔看板功能〕shot 推近后算出目标文字的屏幕字号；字幕框盖住目标元素超过 0.3 秒时报警。

- **4.9 教学片：语气自信，用一个完整例子讲；不加 “Simulated / Illustrative” 之类的免责标签；一条主线，从请求走到结果，不要把片子写成一串问题；先说优点；首次渲染前像陌生人一样读一遍所有文案。**
  出处：`motion-video-skill/references/direction.md` L174–181（Teaching films）
  引用：“**One spine:** follow one concrete job from request to result. Never frame the film as a list of questions.”／“read every on-screen and spoken line as a stranger.”
  Joplo 建议：〔技能文字〕“陌生人通读”可以作为交付前的必做步骤。

- **4.10 发布文案：句子不超过 20 个词，一句一个想法，主语具体；不用口号、碎句和 “not X, but Y” 句式；写清谁做了什么。**
  出处：`motion-video-skill/references/delivery.md` L108
  引用：“sentences of 20 words or fewer, one idea each, with concrete subjects … Name who does what.”
  Joplo 建议：〔技能文字〕字幕和 explain 同样适用：有主语（角色名），不用“不是…而是…”。

- **4.11 不编数字：brief 没给的数字、时长、指标都不能出现；界面里的示例数据可以编，但要标明，且不能升格为标题。**
  出处：`motion-video-skill/references/direction.md` L55–57
  引用：“**No invented numbers:** never show a number, duration or metric the brief did not give.”

- **4.12 镜头移动时，屏幕层文字保持不动，只移动下面的世界。**
  出处：`motion-video-skill/SKILL.md` L37；`motion-video-skill/references/building.md` L88–93
  引用：“Screen text holds still while the camera moves the world under it.”
  Joplo 建议：〔组件〕shot 推近时字幕层固定不动。

### 主题 5：场景切换与转场

- **5.1 转场要承载意义：Match cut（上一场景结尾的物体就是下一场景开头）；Camera fly（在一个连续世界里移到下一处）；Zoom-through（推进某个界面元素，直到它变成下一场景）；Mask wipe（话题硬切换，落在重拍上）。**
  出处：`motion-video-skill/references/direction.md` L150–160（§6 Plan the camera）
  引用：“Zoom-through | Push into a UI element until it becomes the next scene”
  Joplo 建议：〔组件〕多层级页面进入时用 zoom-through（被点元素推进成新页面）；换话题时才用过渡卡（相当于 mask wipe）。

- **5.2 上一拍结束在某个物体上、下一拍从它开始时，就在这个物体上切。**
  出处：`motion-video-skill/references/direction.md` L90
  引用：“**Match cuts:** where a beat ends on an object and the next starts on it, cut on the object.”

- **5.3 连续性手法：一个词变形成下一行；卡片滑到新位置；颜色铺满画面。**
  出处：`motion-video-skill/references/concepts.md` L31–34
  引用：“**Continuity:** carry the eye from beat to beat.”

- **5.4 剪切放在短语之间的停顿里。**
  出处：`motion-video-skill/references/narration.md` L202；`motion-video-skill/references/direction.md` L107
  引用：“Place cuts in pauses between phrases.”

- **5.5 不要每个场景都用同一种主入场方式，否则像模板。**
  出处：`motion-video-skill/references/building.md` L75
  引用：“the same main entrance in every scene reads as a template.”

- **5.6 （架构说明）这个技能的每个场景是独立页面，下一场景从自己的第 0 帧开始，什么都不带过去；连续性靠 match cut 等手法来做。**
  出处：`motion-video-skill/references/building.md` L79
  引用：“Each scene is its own page. … nothing carries over.”

### 主题 6：一个演示讲几件事

- **6.1 一句承诺，所有场景都为它服务；一个节拍一个功能，只保留节拍能演示好的，其余删掉。**
  出处：`motion-video-skill/references/direction.md` L51–52
  引用：“**Promise:** one sentence that every scene serves.”／“**Features:** one idea per beat. Keep those the beats can show well, drop the rest.”
  Joplo 建议：〔作者 API〕feature 的 goal 就是这句承诺；看板检查每个 scenario 的结果步骤是否回应了 goal。

- **6.2 要故事，不要幻灯片：功能巡游（每个功能一个不相关的小片段）读起来就是幻灯片；每种形状都要有一条线：解决一个问题、回答一个问题、走完一个流程、或一个物体在变。**
  出处：`motion-video-skill/references/direction.md` L79
  引用：“a feature tour (one unrelated vignette per feature) reads as slides.”
  Joplo 建议：〔技能文字〕不要把一个 feature 的多个 rule 拼成一条“巡游” flow，要拆成多个 scenario，每个都有完整的线。

- **6.3 每帧一个焦点；两个东西抢注意力时，把其余的调暗或缩小。**
  出处：`motion-video-skill/references/craft.md` L76
  引用：“One focal point per frame. Dim or shrink the rest.”
  Joplo 建议：〔组件〕当前步骤以外的区域轻微压暗。

- **6.4 屏幕上只出现一个品牌；产品处理的对象用用户素材、产品自身素材或泛化类型（如“一家面包店的预订单”）。**
  出处：`motion-video-skill/references/direction.md` L82–89
  引用：“A viewer reads the video as being about any name shown large.”

- **6.5 每个功能用一个动作瞬间展示，绝不用项目符号列表。**
  出处：`motion-video-skill/SKILL.md` L38
  引用：“Every feature is shown by a verb moment, never a bullet list.”

### 主题 7：成片验收

- **7.1 写完或改完一个场景就跑 `check --scene N`，打开它的静帧拼图，对照 craft 规则修；一轮的所有问题一次改完再重跑；警告只能留给有意的选择。**
  出处：`motion-video-skill/SKILL.md` L25
  引用：“Fix every finding of a pass in one edit before running again. A warning stays only for a deliberate choice.”

- **7.2 视觉复查表：两个东西抢注意力；死帧；每拍同一布局；每个场景都在推镜；开场空或只有边框；该放真实产品的地方用了占位形状；超过 1/3 画面空着没用途；场景之间风格漂移。**
  出处：`motion-video-skill/references/craft.md` L70–92（Visual review）
  引用：“Every scene zooms or pushes in | Hold the camera still where the content moves.”
  Joplo 建议：〔看板功能〕把这张表做成作者交付前的自查清单。

- **7.3 和配音同步的屏幕文字标 `data-say`；对应的词正在说时这行不在屏幕上，`check` 判失败。**
  出处：`motion-video-skill/references/narration.md` L204
  引用：“`check` fails a line that is off screen while its words are spoken.”

- **7.4 每个场景开始 0.4 秒时，形状或大字至少覆盖画面 3%。**
  出处：`motion-video-skill/references/craft.md` L15
  引用：“0.4 s into each scene, shapes or display type cover at least 3% of the frame.”

- **7.5 另外截一帧入场中途的画面：它能暴露静止帧看不到的重叠。**
  出处：`motion-video-skill/references/craft.md` L94
  引用：“it shows overlaps a resting frame hides.”

### 主题 8：用户故事
未涉及（只在提问和事实部分提到 purpose、audience，见 `references/direction.md` L10–18）。

### 主题 9：其他

- **9.1 UI 故事风格：把一个组件放大 1.6–2.5 倍、其余虚化；光标沿缓动路径滑过去，然后点击波纹和按下状态；坑：全屏静态截图、1080p 下小于 28 像素的文字，要裁近。**
  出处：`motion-video-skill/references/styles.md` L21–34（UI story）
  引用：“Zoom into one component at 1.6–2.5x while the rest blurs.”
  Joplo 建议：〔组件〕shot 推近倍数默认取 1.6–2.5 倍。

- **9.2 动画分部件做，不要整块做：卡片落下，然后图标弹出，然后文字打出。**
  出处：`motion-video-skill/references/building.md` L116
  引用：“**Animate the parts**, not the composite”

- **9.3 指针：移动时用系统箭头，在按钮上用手形，只有拖拽时用握拳手。**
  出处：`motion-video-skill/references/delivery.md` L95–98
  引用：“The system arrow for moves. A pointing hand on buttons. A closed hand only while dragging.”
  Joplo 建议：〔组件〕光标形状按步骤类型自动切换。

- **9.4 运动先来自内容：内容在动时镜头不动；镜头移动要有理由；只在静止的截图上做 1–3% 的慢推。**
  出处：`motion-video-skill/references/building.md` L90–91
  引用：“when the content acts, the camera holds still. A camera move needs a reason.”

- **9.5 大多数信息流观众静音观看，静音版本也要能讲清楚；会议嵌入不依赖音频。**
  出处：`motion-video-skill/references/delivery.md` L15、L18
  引用：“Most viewers watch muted, so a silent version must still teach: on-screen text carries it.”

- **9.6 状态芯片从 “Unpaid” 翻到 “Paid”；点击标记、底部弹层、toast 表示“正在使用”；leader line 把标注卡连到设备上的行。**
  出处：`motion-video-skill/references/concepts.md` L55、L108–112
  引用：“A status chip that flips from "Unpaid" to "Paid".”
  Joplo 建议：〔组件〕状态芯片翻转、toast、带连线的标注都是很好的“结果可见”组件。

---

## 4. linyqh/speclip-skills

这是 Speclip 团队的中文视频工作流技能集（8 个）：短剧解说三件套（short-drama-commentary / drama-explainer / drama-script-writer）、口播精剪 talking-head-editor、ffmpeg-best-practice、横屏/竖屏字幕布局、skill-creator。开源的是“方法层”。

### 主题 1：从想法到分镜

- **1.1 流程分段：剧情理解 → 校验（用户确认后才写文案）→ 初稿只负责“把故事讲顺” → 节奏预算 → 编辑子任务产出唯一真相源 `storyboard.json` → 配音 → 画面匹配 → 渲染。**
  出处：`speclip-skills/short-drama-video/drama-explainer/SKILL.md` L55、L224–229、L235、L252–264
  引用：“本步骤只做一件事：**把故事讲顺**。”／“若这一步答不出来，禁止进入最终 storyboard 阶段。”
  Joplo 建议：〔技能文字〕先写通顺的故事稿，再拆成步骤；拆步前先回答节奏预算问题（总时长、第一个钩子出现在第几步、结尾策略）。

- **1.2 分镜每段最少字段：id、title、mode（voiceover / original）、source_index、source_path、start、end、text、text_raw、mute_original、status、notes；notes 必须解释为什么用这种模式。**
  出处：`speclip-skills/short-drama-video/drama-explainer/SKILL.md` L312–333
  引用：“每个 segment 的 `notes` 必须解释：为什么留原声 / 为什么此处必须 VO”
  Joplo 建议：〔作者 API〕步骤可以有不给观众看的 `note`（写给评审：为什么这步必须存在）。

- **1.3 出稿前必做 4 张表：情绪链表；必留原片表（留哪句、为什么不能改成 VO、承担什么情绪任务）；Kill List（相关但不够有戏的、只留结果的、必须压成 VO 的）；节奏预算表（目标总时长、VO 比例、原片比例、长原片数量、第一刀出现时间）。**
  出处：`speclip-skills/short-drama-video/references/excellent-short-drama-commentary-playbook.md` L156–193（§7）
  引用：“把这些明写出来”（Kill List）
  Joplo 建议：〔看板功能〕feature 下可以有 “Kill List”：哪些 case 不演示、为什么。

- **1.4 新稿规划：主线不超过 6 个大拍点；每拍判断“观众此刻最需要知道什么、这一拍最值得听见什么”。**
  出处：`speclip-skills/short-drama-video/short-drama-commentary/SKILL.md` L141–149
  引用：“先列出剧情主线，不超过 6 个大拍点”

- **1.5 动笔前锁定 5 个核心信息：主角是谁、这一段他想做什么、眼前阻碍是什么、最危险的点、最大的反转或信息增量；答不清就先整理素材。**
  出处：`speclip-skills/short-drama-video/drama-script-writer/SKILL.md` L40–50
  引用：“如果这 5 个问题都答不清，就先整理素材，不要直接开写。”
  Joplo 建议：〔技能文字〕和 role / goal / 阻碍对应，可以作为写 scenario 前的 5 问。

- **1.6 叙事拍点每个只承担一个任务：推进动作 / 补充背景 / 揭示动机 / 升级风险 / 抛出反转 / 留下悬念；严格按时序推进，背景只在当前戏需要时插入。**
  出处：`speclip-skills/short-drama-video/drama-script-writer/SKILL.md` L86–97
  引用：“每个拍点只承担一个任务”

### 主题 2：开场钩子与收尾

- **2.1 开头 0–8 秒内必须出现危险、屈辱、反常、悬念或爆炸性原声（命名为“第一刀”）；8 秒内还没进冲突就一票否决。**
  出处：`speclip-skills/short-drama-video/references/excellent-short-drama-commentary-playbook.md` L27–28、L217；`speclip-skills/short-drama-video/drama-explainer/SKILL.md` L290
  引用：“开头 0-8 秒内必须给出危险、屈辱、反常、悬念或爆炸原声”
  Joplo 建议：〔技能文字〕对应到产品演示：第 1–2 步就要出现“痛点”或“结果预览”。

- **2.2 钩子从后文最强的冲突或反转里抽出来提前放；同一素材的时间回跳必须标记 `hook_preposed=true`，否则按时序推进。**
  出处：`speclip-skills/short-drama-video/drama-explainer/SKILL.md` L289、L299
  引用：“同一 source 内若时间回跳，必须在 `notes` 标记 `hook_preposed=true`”
  Joplo 建议：〔作者 API〕允许把最后的结果当钩子放到开头（如 `hook: fromStep('result')`），但要显式声明；与 onetake 5.5 结合：用画中画预览，不要跳过去再跳回来。

- **2.3 先上剧情钩子，不要先报频道名；栏目口播放在第一波高能信息之后。**
  出处：`speclip-skills/short-drama-video/drama-script-writer/SKILL.md` L63–84
  引用：“口播应放在 **第一波高能信息之后**，不要抢掉开头的钩子。”
  Joplo 建议：〔组件〕封面不要只是产品名或 logo，要有问题或结果。

- **2.4 结尾只选一种策略：原片最后一刀，或 VO 留钩子；两种一起上会抢收尾。**
  出处：`speclip-skills/short-drama-video/references/excellent-short-drama-commentary-playbook.md` L35–36；`speclip-skills/short-drama-video/drama-explainer/SKILL.md` L297
  引用：“结尾只选一种策略：原片最后一刀，或 VO 挂钩；不要双重收尾互相抢”
  Joplo 建议：〔组件〕收尾卡二选一：要么停在“结果步骤”上，要么用收尾卡总结或预告下一个，不要两样都做。

### 主题 3：节奏与时长

- **3.1 解说/原片比例按题材：家庭狗血 55–70% / 30–45%；战神逆袭 45–60% / 40–55%；甜宠治愈 65–80% / 20–35%。**
  出处：`speclip-skills/short-drama-video/references/excellent-short-drama-commentary-playbook.md` L44–54
  引用：“解说：**55%~70%**”
  Joplo 建议：〔不适用〕对应关系弱；勉强可以类比“过渡卡/说明”与“真实操作步骤”的比例。

- **3.2 原片大多控制在 4–12 秒；超过 15 秒算长原片；普通解说里长原片 0–3 段，超过 4 段就要自查是不是舍不得砍。**
  出处：`speclip-skills/short-drama-video/references/excellent-short-drama-commentary-playbook.md` L56–71
  引用：“单条成片里，**大多数原片片段应控制在 4~12 秒**”

- **3.3 单句 VO 常见 1.5–5.5 秒；开头 VO 尽量不超过 8 秒；超过 8 秒就拆成“铺垫一句 + 递刀一句”。**
  出处：`speclip-skills/short-drama-video/references/excellent-short-drama-commentary-playbook.md` L73–79
  引用：“单句 VO 常见区间：**1.5~5.5 秒**”
  Joplo 建议：〔看板功能〕和 Joplo 3–7 秒的停留区间基本重合；超过 7 秒（字幕 + explain 太长）就提示拆成两步。

- **3.4 语料统计（42 份 SRT）：第一个关键原片通常在前 15% 左右，最后一个在最后 10% 左右；一条通常 3–4 个原片爆点簇，每簇 2–4 句。默认骨架：0–8 秒钩子 / 8–20 秒补关系和危机 / 20–35 秒第一次关键原片 / 35–65 秒压缩升级 / 65–85 秒反转 / 85–95 秒收束。**
  出处：`speclip-skills/short-drama-video/short-drama-commentary/references/corpus-insights.md` L22–28、L177–186
  引用：“**第一次关键原片通常出现在前 15% 左右的位置**”
  Joplo 建议：〔看板功能〕“第一次关键结果出现在前 15% 的步骤里”可以作为参考指标。

- **3.5 不要每 10 秒机械地塞一个原片。**
  出处：`speclip-skills/short-drama-video/short-drama-commentary/SKILL.md` L162
  引用：“不要硬把每 10 秒都塞一个原片”

- **3.6 信息递进：每 5–10 行都要有新信息。**
  出处：`speclip-skills/short-drama-video/drama-script-writer/SKILL.md` L146
  引用：“**信息递进**：每 5-10 行是否都有新信息”

- **3.7 口播精剪的预设（头/尾留白，合并间隔）：clean 120–200/150–250 ms，<350 ms 合并；creator 80–150/100–180 ms，<250 ms；viral 40–100/60–120 ms，<180 ms。**
  出处：`speclip-skills/talking-head-editor/references/edit-rules.md` L27–52
  引用：“Merge adjacent kept segments when the gap is `< 350ms`”
  Joplo 建议：〔不适用〕

### 主题 4：旁白与字幕

- **4.1 VO 只有 4 件合法职责：立题、补背景、跳场景/跳时间、给原片递刀或收口；一句 VO 一件都不承担就删。反例：“婚礼来了”“新家”“这一切才刚刚开始”——问题不是短，而是没有功能。**
  出处：`speclip-skills/short-drama-video/references/excellent-short-drama-commentary-playbook.md` L104–133（§5）
  引用：“问题不是短，而是**没有功能**。”
  Joplo 建议：〔技能文字〕字幕不能只是场景名（如“设置页”“新建项目”），要说出发生了什么或为什么。

- **4.2 VO 不能复述紧挨着的原片刚说过的内容（台词听两遍）。**
  出处：`speclip-skills/short-drama-video/drama-explainer/SKILL.md` L44、L295
  引用：“VO 不得复述紧邻 `original` 已说明的内容”
  Joplo 建议：〔看板功能〕字幕与画面上刚出现的 toast 或提示文字重复时提示。

- **4.3 写作规则：一行只表达一个意思；先写看得见的动作，再写它意味着什么；多用主动句，少用解释腔；句子短；用具体动作代替“紧张、震撼”；人物称呼前后一致。**
  出处：`speclip-skills/short-drama-video/drama-script-writer/SKILL.md` L99–113；`speclip-skills/short-drama-video/drama-script-writer/references/style-notes.md` L27–37、L68–77
  引用：“一行只表达一个意思”／“先写看得见的动作，再写它意味着什么”／“多用主动句，少用解释腔”
  Joplo 建议：〔技能文字〕字幕 = 角色名 + 动作（主动句）；explain = 意味着什么或为什么。同一个角色全片只用一个称呼（与 roles 绑定）。

- **4.4 只写素材能支撑的内容，不要编造镜头里有什么；交付前自检“每一句是否都能被素材支撑”。**
  出处：`speclip-skills/short-drama-video/drama-script-writer/SKILL.md` L34–38、L145
  引用：“**画面落地**：每一句是否都能被素材支撑”
  Joplo 建议：〔看板功能〕字幕提到的界面元素必须在该步可见。

- **4.5 字幕按说话的意群断，不只按最大字数；只高亮关键词、数字、承诺和对比。**
  出处：`speclip-skills/talking-head-editor/references/edit-rules.md` L78–83
  引用：“Split subtitles by spoken sense units, not by maximum character count alone.”／“Highlight only key words, numbers, promises, and contrasts.”
  Joplo 建议：〔组件〕关键词强调只用于数字、结果和对比。

- **4.6 横屏字幕（1920×1080）：底部居中，字号 90，MarginV 60，每行最多 18 字，最多两行；挤的时候先加边距，再缩短行长，最后才缩字号；画面信息密时宁可拆句也不缩小字号。**
  出处：`speclip-skills/landscape-subtitle-layout/SKILL.md` L19–32、L76–95
  引用：“目标：**最多两行**，优先稳读，不靠缩字号硬塞”
  Joplo 建议：〔组件〕Joplo 24 字字幕在 18 字一行的规则下会折成两行，处在“最多两行”的边界上。

- **4.7 竖屏字幕（1080×1920）：最多两行；单行宽度目标不超过画面 70%（极限 76%）；先拆句再缩字号；safe-area 模式每行 12 字、MarginV 600；会出现三行时必须拆成两个连续字幕，拆分点优先在标点处。**
  出处：`speclip-skills/portrait-subtitle-layout/SKILL.md` L66–72、L78–89、L140–145
  引用：“一条字幕如果会渲染成三行，必须拆成两个连续字幕事件”
  Joplo 建议：〔看板功能〕在手机竖屏播放时，24 字可能折成 2–3 行，需要按 12 字一行检查。

- **4.8 失败信号：VO 满是“命运、站稳、移不开眼”这类万能包装词，没有人物感。**
  出处：`speclip-skills/short-drama-video/drama-explainer/SKILL.md` L39
  引用：“VO 文案充满空泛短视频腔”
  Joplo 建议：〔技能文字〕禁用“轻松搞定、一键解决、效率翻倍”这类空词。

### 主题 5：场景切换与转场

- **5.1 VO 在原片前负责递刀，在原片后负责收口或推进后果，在两个爆点之间负责压缩过程。**
  出处：`speclip-skills/short-drama-video/drama-script-writer/SKILL.md` L115–121
  引用：“**原片前的 VO**：负责递刀”
  Joplo 建议：〔组件〕过渡卡的文案分三种用法：引出下一步（递刀）、总结上一步的后果（收口）、跳过重复过程（压缩）。

- **5.2 跳场景、跳时间是 VO 的合法职责之一。**
  出处：`speclip-skills/short-drama-video/references/excellent-short-drama-commentary-playbook.md` L110
  引用：“**跳场景 / 跳时间**”
  Joplo 建议：〔组件〕时间跳跃卡写清跳了多久、期间发生了什么（如“三天后，审批已通过”）。

- **5.3 跳切的遮挡办法，按优先级：小幅推近（103–108%）→ 换裁切位置 → 字幕强调或屏幕关键词 → B-roll / 插入镜头 / 截图。**
  出处：`speclip-skills/talking-head-editor/references/edit-rules.md` L62–76；`speclip-skills/talking-head-editor/references/workflow.md` L64–69
  引用：“punch-in 103%–108%”
  Joplo 建议：〔组件〕同一页面上跳过中间步骤时，可以做一次轻微推近来掩盖跳变。

- **5.4 画面匹配的理由要写“画面能承载什么情绪和叙事作用”，“画面和文案相关”不算理由。**
  出处：`speclip-skills/short-drama-video/drama-explainer/references/scene-matching-guide.md` L59–67
  引用：“不好的匹配理由像这样：“画面和文案相关””

### 主题 6：一个演示讲几件事

- **6.1 原片只留最有戏的一句、一簇，不平均分配；压缩重复的过程。**
  出处：`speclip-skills/short-drama-video/references/excellent-short-drama-commentary-playbook.md` L29–34
  引用：“原片只留最有戏的一句、最有戏的一簇，不平均分配”
  Joplo 建议：〔技能文字〕重复的操作（填 5 个字段）用一步加时间压缩表示，不要每个字段一步。

- **6.2 编辑优先级从高到低：戏眼是否命中 > 情绪链条 > VO 克制 > 检索覆盖 > 节奏 > 时序易看 > 信息完整。信息完整排最后。**
  出处：`speclip-skills/short-drama-video/drama-explainer/references/dramatic-editor-guide.md` L38–47
  引用：“7. 信息是否完整”

- **6.3 终检问题包括：这条最该记住的 3 句原台词是什么？观众看完会记住剧情还是场面？**
  出处：`speclip-skills/short-drama-video/references/excellent-short-drama-commentary-playbook.md` L223–235
  引用：“这条最该记住的 3 句原台词是什么？”
  Joplo 建议：〔看板功能〕评审时问：“这个 scenario 最该记住的一步是哪步？”

### 主题 7：成片验收

- **7.1 评审表：内容 / 编辑 / 结构 / 观感四个维度，各 1–5 分；总分 90–100 可交付，70–89 合格，50–69 勉强，0–49 差；命中任一一票否决项，总分不得高于 49。**
  出处：`speclip-skills/short-drama-video/drama-explainer/evals/review-rubric.md` L5–44
  引用：“出现以下任一项，整体评分不得高于 49”
  Joplo 建议：〔看板功能〕独立评审时用这种“维度打分 + 一票否决”的格式。

- **7.2 一票否决例：`original.text` 写成摘要标签，不是真实台词；漏掉最关键的高张力片段；VO 复述紧邻原片；看得懂但没有戏眼；原片长段失控。**
  出处：`speclip-skills/short-drama-video/drama-explainer/evals/review-rubric.md` L37–44；`speclip-skills/short-drama-video/drama-explainer/SKILL.md` L296
  引用：“`original.text` 是摘要标签，不是真实展示台词”
  Joplo 建议：〔技能文字〕`.type` 的内容必须是真实要输入的文字，不能写成“输入用户名”这样的说明。

- **7.3 画面匹配的强制校验：每段都有结果；时长覆盖音频；同一素材不重叠；不越界；音频比画面长时先延长画面，有冲突就回去缩短文案。**
  出处：`speclip-skills/short-drama-video/drama-explainer/references/scene-matching-guide.md` L92–106
  引用：“若会与其它片段冲突，则回退到步骤 6，缩短该段 VO 文案”
  Joplo 建议：〔看板功能〕字幕停留超过 7 秒的上限时，提示“缩短文案”，而不是放宽上限。

- **7.4 交付前质量检查清单（15 项）。**
  出处：`speclip-skills/short-drama-video/drama-explainer/SKILL.md` L398–414（质量检查清单）
  引用：“开头足够快进入第一刀”

- **7.5 评测用例按冲突 / 情绪 / 反转三类组织。**
  出处：`speclip-skills/short-drama-video/drama-explainer/evals/cases/`（conflict-case.md、emotion-case.md、reversal-case.md）
  Joplo 建议：〔不适用〕技能评测时可以按“正常 / 异常 / 规则分支”组织用例。

### 主题 8：用户故事
未涉及。最接近的是 1.5 的“5 个核心信息”（主角、想做什么、阻碍、最危险的点、反转）。

### 主题 9：其他

- **9.1 口播精剪必须保护的内容：钩子句、论点或核心承诺、笑点、情绪拍、举例或转场必需的铺垫、用来强调的有意停顿。**
  出处：`speclip-skills/talking-head-editor/references/edit-rules.md` L16–25（Protect first）
  引用：“intentional pause used for emphasis”
  Joplo 建议：〔技能文字〕压缩步骤时不能删掉钩子步骤、结果步骤和“前置条件”步骤。

---

## 5. deanpeters/Product-Manager-Skills

这是 Dean Peters 维护的产品经理技能库（约 80 个技能）。这里读了 `user-story`、`user-story-splitting`、`epic-breakdown-advisor`、`user-story-mapping`、`user-story-mapping-workshop`、`jobs-to-be-done`、`storyboard`、`problem-statement`、`epic-hypothesis`，以及 `prd-development` 里和故事、边界情况相关的段落。

### 主题 1：从想法到分镜

- **1.1 六格故事板：1 主角（人物和情境）→ 2 问题出现 → 3 “Oh Crap” 时刻（问题升级出紧迫感）→ 4 解决方案出现 → 5 “Aha” 时刻（用户用上并突破）→ 6 解决之后的生活。**
  出处：`Product-Manager-Skills/skills/storyboard/SKILL.md` L38–46
  引用：“**Frame 3: The "Oh Crap" Moment** — Escalate the problem to create urgency”
  Joplo 建议：〔组件〕开场过渡卡 ≈ 格 1–3（谁、什么问题、为什么急）；flow ≈ 格 4–5；收尾卡 ≈ 格 6。

- **1.2 故事板 7 个问题（一次问一个）：主角是谁（名字、年龄、角色、情境）；问题；Oh Crap 时刻；方案怎么被引入；Aha 时刻；之后的生活；视觉风格（默认粗马克笔草图）。**
  出处：`Product-Manager-Skills/skills/storyboard/SKILL.md` L89–99
  引用：“Ask these questions one at a time to develop the narrative”

- **1.3 故事地图：横轴是用户随时间的旅程（Backbone 活动 → Steps 步骤 → Tasks 任务），纵轴是优先级和发布批次；Narrative 写成一句 JTBD 式目标；3–5 个活动，每个活动 3–5 步，每步 5–7 个任务。**
  出处：`Product-Manager-Skills/skills/user-story-mapping/SKILL.md` L38–48、L125–135、L139–154、L158–185
  引用：“**One sentence:** If it takes more than one sentence, the scope may be too broad”
  Joplo 建议：〔看板功能〕feature 的 goal 一句话写完；scenario 内按“活动 → 步骤”分组，每组 3–5 步。

### 主题 2：开场钩子与收尾

- **2.1 开场介绍具体的人，不要写泛泛的“一个忙碌的专业人士”；结尾要具体（如“6 点下班”“按时付款从 50% 升到 80%”），不能写“生活变好了”。**
  出处：`Product-Manager-Skills/skills/storyboard/SKILL.md` L204–209、L240–245
  引用：“**Symptom:** "Meet User, a busy professional"”／“**Symptom:** "Life is better now"”
  Joplo 建议：〔技能文字〕开场卡点名角色（roles 里的具体人），收尾卡写可量化或看得见的改变。

- **2.2 叙事框架参考：皮克斯的 “Once upon a time... Every day... Until one day...”。**
  出处：`Product-Manager-Skills/skills/storyboard/SKILL.md` L259
  引用：“Pixar's story rules — "Once upon a time... Every day... Until one day..."”

### 主题 3：节奏与时长
未涉及。

### 主题 4：旁白与字幕（指故事标题、摘要的写法）

- **4.1 摘要写价值，不写功能：“Enable Google login for trial users to reduce signup friction” 对，“Add delete button” 错。**
  出处：`Product-Manager-Skills/skills/user-story/SKILL.md` L159–170
  引用：“❌ "Add delete button" (feature-centric, not value-centric)”
  Joplo 建议：〔技能文字〕scenario 标题和封面 30 字说明写“谁得到了什么”，不写“XX 功能”。

- **4.2 故事板是真实叙事，不是营销文案或炒作。**
  出处：`Product-Manager-Skills/skills/storyboard/SKILL.md` L58
  引用：“**Not marketing copy:** Authentic narrative, not hype”

### 主题 5：场景切换与转场
未涉及。

### 主题 6：一个演示讲几件事

- **6.1 故事板不是功能演示，要聚焦用户结果，而不是产品能力；Aha 时刻不能是“看到仪表盘、喜欢这些功能”，要是结果（如收到 “$5,000 received!” 通知）。**
  出处：`Product-Manager-Skills/skills/storyboard/SKILL.md` L55–58、L231–236
  引用：“**Not a feature demo:** Focus on user outcomes, not product capabilities”
  Joplo 建议：〔技能文字〕scenario 的最后一步应是用户得到的结果（通知、状态变化），不是“功能列表全展示”。

- **6.2 Narrative 一句话写不完，说明范围太大；活动太多（10 个以上）就合并，目标 3–5 个。**
  出处：`Product-Manager-Skills/skills/user-story-mapping/SKILL.md` L133–135、L247–252
  引用：“Aim for 3-5 high-level activities.”

- **6.3 只能解决一个痛点时，挑影响最大的那个。**
  出处：`Product-Manager-Skills/skills/jobs-to-be-done/SKILL.md` L358–363
  引用：“"If we only solved one pain, which would have the biggest impact?"”

### 主题 7：验收

- **7.1 故事板 6 问自检（任一答“否”就改）：主角是否让人认同？问题是否切身？Oh Crap 是否真实？方案引入是否自然？Aha 是否可信？之后的状态是否让人向往？**
  出处：`Product-Manager-Skills/skills/storyboard/SKILL.md` L177–187
  引用：“**Is the solution introduction natural?** Or does it feel forced/contrived?”
  Joplo 建议：〔看板功能〕评审 scenario 时可以用这 6 问。

- **7.2 用户故事的检查：读给团队听，所有人都懂谁、做什么、为什么；QA 能不能据此写测试用例；能不能证明 Then 发生了。**
  出处：`Product-Manager-Skills/skills/user-story/SKILL.md` L174–179
  引用：“**Test acceptance criteria:** Can QA write test cases from this?”

- **7.3 拆分后的 5 个校验问题：每份都有用户价值吗？能独立开发吗？能独立测试吗？够小吗（1–5 天）？合起来等于原故事吗？**
  出处：`Product-Manager-Skills/skills/user-story-splitting/SKILL.md` L222–231
  引用：“**Do the splits, when combined, equal the original?** (Nothing lost in translation)”
  Joplo 建议：〔看板功能〕feature 的所有 scenario 合起来要覆盖全部 cases 和 rules（覆盖矩阵）。

### 主题 8：用户故事（重点）

- **8.1 格式：Mike Cohn 的 As a [角色] / I want to [动作] / so that [结果]，加 Gherkin 验收标准 Scenario / Given / and Given / When / Then。**
  出处：`Product-Manager-Skills/skills/user-story/SKILL.md` L38–51
  引用：“**As a** [user persona/role] … **I want to** [action to achieve outcome] … **so that** [desired outcome]”
  Joplo 建议：〔作者 API〕feature 的 roles + goal 可以直接写成 As a / I want / so that；每个 scenario 带 Given（初始状态和种子数据）、When（click/type 步骤）、Then（结果步骤）。

- **8.2 用户故事是对话的开场，不是功能规格，也不是合同。**
  出处：`Product-Manager-Skills/skills/user-story/SKILL.md` L23、L64
  引用：“This is not a feature spec—it's a conversation starter”

- **8.3 三个质量检查：As a 要具体（“trial user”而不是“user”）；I want to 是用户的动作，不是你要做的功能；so that 是动机，不是复述动作。反例：“As a user, I want a login button, so that I can log in”。**
  出处：`Product-Manager-Skills/skills/user-story/SKILL.md` L119–126
  引用：“❌ "As a user, I want a login button, so that I can log in" (restating the action)”
  Joplo 建议：〔看板功能〕so that 和 I want 用词高度重合时提示；role 为泛泛的“用户”时提示。

- **8.4 不是用户故事的东西：技术任务（“As a developer, I want to refactor the database”）；功能清单（“dashboards, reports, and analytics”，太大）；空泛（“a better experience”）。**
  出处：`Product-Manager-Skills/skills/user-story/SKILL.md` L60–64、L211–216
  引用：“**Not a task:** "As a developer, I want to refactor the database"”
  Joplo 建议：〔技能文字〕没有用户可见结果的改动不做演示 scenario。

- **8.5 Gherkin 规则：Given 可以叠多个（包括“保证 When 能发生的界面前提”和“保证 Then 能实现的结果前提”）；只能一个 When、一个 Then，多了就该拆；When 对齐 I want to，Then 对齐 so that。**
  出处：`Product-Manager-Skills/skills/user-story/SKILL.md` L130–155；`Product-Manager-Skills/skills/user-story/template.md` L31
  引用：“**Only one When:** If you need multiple "When" statements, you likely have multiple stories—split them”／“Does "When" match "I want to"? Does "Then" match "so that"?”
  Joplo 建议：〔作者 API〕一个 scenario 对应一对 When/Then：When 是一串连续的用户步骤，Then 是一个可见的结果步骤。看板检查最后一步是否回应了 so that。

- **8.6 Then 必须能测、能看到：“Then it's faster”不合格，要写成“页面 2 秒内加载”或“用户看到成功确认消息”。**
  出处：`Product-Manager-Skills/skills/user-story/SKILL.md` L247–252；`Product-Manager-Skills/skills/user-story/examples/sample.md` L55–65
  引用：“Make it measurable: "Then the page loads in under 2 seconds" or "Then the user sees a success confirmation message."”
  Joplo 建议：〔组件〕每个 scenario 末尾要有可见的确认（toast、状态芯片、数字变化）。

- **8.7 需要拆分的例子：一个“管理购物车”故事里有 5 组 When/Then，应拆成加入、移除、改数量、用券、结账 5 个故事。**
  出处：`Product-Manager-Skills/skills/user-story/examples/sample.md` L69–109
  引用：“Multiple "When" statements = multiple stories”

- **8.8 INVEST = Independent、Negotiable、Valuable、Estimable、Small、Testable。拆分前先检查除 Small 以外的五项；不满足 Valuable 就停下，不要拆，和别的工作合并；Small 指 1–5 天。**
  出处：`Product-Manager-Skills/skills/epic-breakdown-advisor/SKILL.md` L42–45、L104–160、L478–485；`Product-Manager-Skills/skills/user-story/SKILL.md` L270
  引用：“If story fails "Valuable," STOP. Don't split. Instead, combine with other work to create a meaningful increment.”
  Joplo 建议：〔看板功能〕映射到 scenario：Independent = 能单独播放（有自己的 Given）；Valuable = 有可见结果；Small = 步数在上限内；Testable = 结果步骤可断言。

- **8.9 八种拆分模式（Humanizing Work）：1 工作流步骤；2 业务规则变体；3 数据变体；4 验收标准复杂度（多组 When/Then，最常见）；5 主要工作量；6 外部依赖；7 DevOps 步骤；8 小型探索（TADs）。**
  出处：`Product-Manager-Skills/skills/user-story-splitting/SKILL.md` L38–48、L130–143
  引用：“This is the most common indicator that a story needs splitting.”
  Joplo 建议：〔技能文字〕从 feature 推导 scenario：rules 的每个变体（如会员 10% / VIP 20% / 首单 5%，见 L106–114）各一个 scenario；cases 的数据变体（图片 / PDF / 视频）各一个；roles 不同各一个。

- **8.10 epic-breakdown-advisor 的九种模式：1 工作流步骤（薄的端到端切片）；2 CRUD 操作（“manage”一词说明打包了多个操作）；3 业务规则变体；4 数据变体；5 录入方式（先简单界面，花哨界面后做）；6 主要工作量（先实现一个，再加其余）；7 简单/复杂（先最简核心）；8 推迟性能；9 拆出 spike。元模式：找出核心复杂度 → 列出所有变体 → 缩成一个完整切片 → 其余变体各自成故事。**
  出处：`Product-Manager-Skills/skills/epic-breakdown-advisor/SKILL.md` L47–62、L193–215
  引用：“Reduce variations to **one complete slice**”
  Joplo 建议：〔技能文字〕每个 feature 先做一个“最简完整”的主 scenario（happy path 端到端），再为每个规则或数据变体加 scenario。

- **8.11 工作流拆分要做薄的端到端切片，不要按步骤拆：先做“作者上传、直接上线、不审核”的完整路径，再分别加编辑审核、法务审核。**
  出处：`Product-Manager-Skills/skills/epic-breakdown-advisor/SKILL.md` L168–182、L601–607
  引用：“Split into **thin end-to-end slices**, not step-by-step.”
  Joplo 建议：〔技能文字〕不要把“填写 / 审核 / 发布”拆成三个 scenario，每个 scenario 都应从头走到结果。

- **8.12 拆分质量：好的拆分能暴露可以砍掉或推迟的低价值工作，或让故事大小更均匀；两条都不满足就换一种模式。**
  出处：`Product-Manager-Skills/skills/epic-breakdown-advisor/SKILL.md` L375–389
  引用：“Does this split reveal low-value work you can deprioritize or eliminate?”

- **8.13 按不确定性调整（Cynefin）：低不确定性就找出全部故事；高不确定性只做 1–2 个“学习型故事”；混乱时先稳定，暂不拆。**
  出处：`Product-Manager-Skills/skills/epic-breakdown-advisor/SKILL.md` L403–419
  引用：“Identify 1-2 **learning stories**; avoid exhaustive enumeration”
  Joplo 建议：〔技能文字〕方向还不确定的 feature 只做 A/B 两个 option 的主 scenario，不要穷举所有 case。

- **8.14 拆分常见错误：横向按技术层拆（先 API 再 UI）；拆得过细；毫无意义的拆分（前半 / 后半）；制造硬依赖；拆出来的故事 so that 都一样（说明只是拆了任务）。**
  出处：`Product-Manager-Skills/skills/user-story-splitting/SKILL.md` L253–296
  引用：“Split stories have the same "so that" statement.”
  Joplo 建议：〔看板功能〕同一 feature 下两个 scenario 结果步骤相同，可能是重复。

- **8.15 故事地图里的活动是用户行为，不是功能（不要写“Use the dashboard”）；每一步要“可观察：你能看着某人做这一步”；“walking skeleton”是横跨所有活动的最高优先级任务组成的最小端到端功能；不要一开始就把每个边界情况和验收标准都画上。**
  出处：`Product-Manager-Skills/skills/user-story-mapping/SKILL.md` L151–154、L177–180、L238–243；`Product-Manager-Skills/skills/user-story-mapping-workshop/SKILL.md` L59、L457–462
  引用：“**Observable:** You could watch someone perform this step”
  Joplo 建议：〔技能文字〕直接可用：每个 Joplo 步骤都必须“看得见有人在做”；`.system` 步骤要有可见的触发和结果。

- **8.16 JTBD：工作分功能性、社会性、情感性三类；痛点（挑战、代价、常见错误、未解决问题）；收益（期望、节省、采用因素、生活改善）；工作要动词驱动、和方案无关、具体；“为什么”问 5 次，区分工作和方案；不要不做研究就编。**
  出处：`Product-Manager-Skills/skills/jobs-to-be-done/SKILL.md` L38–56、L115–118、L322–327、L349–354
  引用：“**Separates job from solution:** "Communicate with my team" (job) ≠ "email" (solution)”
  Joplo 建议：〔作者 API〕goal 写成和方案无关的工作（这样 option A/B 才能是两种方案）；explain 可以写情感或社会层面的收益。

- **8.17 问题陈述：I am（角色）/ Trying to（想要的结果）/ But（障碍）/ Because（根因）/ Which makes me feel（情绪影响）。**
  出处：`Product-Manager-Skills/skills/problem-statement/SKILL.md` L38–46
  引用：“**Which makes me feel:** [Emotional impact]”
  Joplo 建议：〔组件〕开场过渡卡的文案模板：“<角色>想<目标>，但<障碍>。”

- **8.18 从故事推出异常和边界情况：问“用户不按顺序完成步骤怎么办？跳过可选步骤怎么办？”；走一遍失败模式、边界条件和意外行为；边界情况要写进每个故事自己的验收标准，不能只列在文末；验收标准超过 5–6 条就考虑拆分。**
  出处：`Product-Manager-Skills/skills/prd-development/template.md` L449、L493、L499–500；`Product-Manager-Skills/skills/prd-development/SKILL.md` L459–461
  引用：“what if user completes steps out of order? What if user skips optional steps?”／“If a story has more than 5–6 acceptance criteria, consider splitting it”
  Joplo 建议：〔看板功能〕给每个 feature 生成“异常问题清单”：乱序、跳过可选步骤、空值、权限不足、网络失败；每个被采纳的异常写成独立的 scenario，带自己的 Then（错误提示步骤）。

- **8.19 Epic 假设：If we [对目标角色做的事] … then we will [可测量的结果]；反例“If we build a dashboard, then users will use it”。**
  出处：`Product-Manager-Skills/skills/epic-hypothesis/SKILL.md` L42、L113–120、L227–231
  引用：“❌ "If we build a dashboard, then users will use it" (vague, not measurable)”
  Joplo 建议：〔作者 API〕option A/B 可以各带一句假设，便于看板对比。

### 主题 9：其他

- **9.1 方案的引入要自然（论坛推荐、同事提到），不要“用户神奇地发现了我们的产品”。**
  出处：`Product-Manager-Skills/skills/storyboard/SKILL.md` L222–227
  引用：“**Symptom:** "User magically discovers our product"”
  Joplo 建议：〔技能文字〕scenario 的第一步要说明用户为什么来到这个界面（入口）。

- **9.2 不要编造人物或问题；缺上下文时先做调研。**
  出处：`Product-Manager-Skills/skills/storyboard/SKILL.md` L85
  引用：“Don't fabricate personas or problems.”

---

## 6. 跨仓库共识与分歧

### 6.1 共识（多个仓库都提到）

1. **先规划，规划稿是唯一真相源，实现照着它做。** onetake（先写节拍表，再合成：`references/reference-deconstruction.md` L57）、video-production-skills（编码前先写运动论点和节拍图，实现前过反 PPT 检查：`ai-motion-director/SKILL.md` L132–135）、motion-video-skill（“Direct first, then build”；`direction.md` 的节拍表要能直接驱动构建：`references/direction.md` L185）、speclip（`storyboard.json` 唯一真相源：`drama-explainer/SKILL.md` L55）、PM（故事地图产出故事：`user-story-mapping/SKILL.md` L89）。

2. **先给几个候选，再选一个。** onetake（三个概念，用户选：`SKILL.md` L54–71）、motion-video-skill（三个概念，Agent 选最强：`references/concepts.md` L10–11）、video-production-skills（开场先写 2–3 个短句选项：`black-white-text-opener/SKILL.md` L47）。

3. **反对“PPT 式 / 功能巡游 / 功能清单”。** onetake（“Never replace a beat”、“not a catalogue”）、video-production-skills（整套 anti-PPT gate）、motion-video-skill（“a feature tour … reads as slides”、“never a bullet list”）、PM（“Not a feature list”：`user-story/SKILL.md` L62；故事板“Not a feature demo”）、speclip（VO 像章节标题就是失败：`playbook` L203）。

4. **每个功能用一个看得见的动作和状态变化来证明，原因要可见。** onetake（“The cause must be visible”）、video-production-skills（每拍都要有 state change 和 motion verb）、motion-video-skill（verb moment）、PM（Then 必须可观察；故事地图的步骤要“可观察”）、speclip（“先写看得见的动作”）。

5. **开场快，先点明主题或冲突，不要先报 logo 或频道名。** motion-video-skill（2 秒钩子；2–3 秒定向；不以 logo 开场）、onetake（clawd 案例“a hook in second one”）、speclip（0–8 秒第一刀；口播放在第一波高能之后）、video-production-skills（Micro 开场“when the hook must start almost immediately”）。PM 的故事板从“主角”开场，节奏更慢，但同样要求具体、能引起共鸣。

6. **结尾单一、可读、停得住。** motion-video-skill（落版静止 ≥1.5 秒，视频结束在落版上）、video-production-skills（最后一句停 ≥1 秒）、speclip（结尾只选一种策略）、onetake（不接住的硬切只允许进落版）、PM（结尾状态要具体）。

7. **不编造内容和数字。** onetake（内容只来自真实输出）、motion-video-skill（不编数字；事实带来源）、video-production-skills（事实闸门；不悄悄编能力）、speclip（不要脑补镜头细节）、PM（不编人物、问题和 JTBD）。

8. **节奏要有变化，不要等长。** onetake（≥4 倍，CV ≥0.25）、motion-video-skill（节拍长度要变化，短促一串推向关键停留）、speclip（原片不平均分配；不要每 10 秒塞一个）。

9. **一拍、一行、一步只讲一件事。** motion-video-skill（一拍一个想法；标题一个想法）、speclip（一行只表达一个意思；拍点只承担一个任务）、PM（一个 When、一个 Then）、onetake（每个操作一个特写）、video-production-skills（每拍一个主导原语）。

10. **字幕最多两行，按意群和标点断，先拆句再缩字号。** speclip（横屏和竖屏布局都写了）、motion-video-skill（字幕文件 2 行 × 42 字符；烧录字幕按标点和停顿断）、onetake（按标点切块，42 拉丁 / 20 中日韩）、speclip talking-head（按意群断）。**42 个拉丁字符这个数字，onetake 和 motion-video-skill 完全一致。**

11. **句间停顿都是 0.45 秒。** onetake `references/product-demo.md` L79（“0.45 s breaths”）与 motion-video-skill `references/narration.md` L112（“Line break | 0.45 s breath”）。

12. **字号有下限，按小屏可读来算。** onetake（配音提到的文字 ≥26 像素）、motion-video-skill（1080p 下 28 像素）、video-production-skills（主标题占画面高度 9–15%，手机上可读）、speclip（1080p 横屏字号 90）。

13. **镜头移动要有理由，不要每拍都推。** onetake（每拍都重新取景就成了节拍器）、motion-video-skill（镜头只在有理由时动，内容在动时镜头不动）、video-production-skills（转场由叙事驱动）。

14. **验收 = 抽帧或接触表 + 自动检查 + 人工复核问题清单。** onetake（stills / probe / verify）、video-production-skills（接触表、节拍中点关键帧）、motion-video-skill（check 静帧拼图、audit）、speclip（评审打分表、终检问题）、PM（故事板 6 问、INVEST、拆分 5 问）。

15. **只问少数会改变方向的问题，并给默认答案。** motion-video-skill（≤5 个问题，每个带默认）、video-production-skills（只问会改变路线的）、onetake（只要一件具体的事，不要镜头表）、PM（一次问一个；已经给出的不再问）。

### 6.2 分歧和矛盾

1. **静止画面：必须有 vs 不能有。** onetake 要求 ≥25% 的帧完全静止，并说“A slow push is not a rest”（`references/rhythm.md` L50、L135）；motion-video-skill 说“No dead frame”，没东西动就加动作或待机循环，静止截图上做 1–3% 慢推（`SKILL.md` L36；`references/craft.md` L77；`references/building.md` L91）。对 Joplo 来说，停留帧就是阅读时间，onetake 的立场更贴切；motion-video-skill 的“内容自己动”适合用在 `.system` 等待类步骤（加载动画）。

2. **转场：必须接住 vs 允许硬换。** onetake：交界必须有元素留下来，不接住的硬切只能出现在打点段和落版（`SKILL.md` L84–88、L200–202）。motion-video-skill 的架构是每个场景一个独立页面，“nothing carries over”，话题硬切换时用 Mask wipe（`references/building.md` L79；`references/direction.md` L160）。speclip 的短剧解说本身就是硬切拼接。dark-saas 用速度模糊和白色擦除。

3. **装饰特效。** onetake：“No particles / confetti / speck bursts. They read as a template.”（`SKILL.md` L219–220）；dark-saas：“CTA clicks trigger sparkles, glow pulses, and scene changes.”（`references/style-language.md` L60；`references/scene-blueprints.md` L35）。两边正面冲突。

4. **画面元素大小。** onetake（宣传片）：“Small elements, big ground. The genre's frame is 70 % white.”（`SKILL.md` L207）；dark-saas：“Make hero objects large”（`SKILL.md` L74）；motion-video-skill：超过 1/3 画面空着没用途就把主体放大（`references/craft.md` L86）。onetake 自己在功能演示里也改了口：要读的窗口占画面宽 70–80%（`references/product-demo.md` L54）。结论：宣传片留白多，功能演示要大到能读。

5. **字幕的默认值。** motion-video-skill 默认不加字幕，必须问用户；画面文字多时字幕会重复，就不加（`references/narration.md` L215–219）。speclip 和 Joplo 都以字幕为核心。

6. **谁来选概念。** onetake：“Show the three and let the user pick.”（`SKILL.md` L71）；motion-video-skill：Agent 选最强的，给 5 行摘要后“continue without waiting”（`SKILL.md` L17）。

7. **开场能不能有 logo 或静止。** motion-video-skill：第 0 帧就要有动作，不以 logo 开场（`references/direction.md` L98、L105）；dark-saas 的 Standard 预设 0–5.5 秒是“kinetic promise + logo”（`references/timing-presets.md` L18）；黑底白字开场先纯黑停 0.2–0.5 秒（`references/timing-presets.md`）。Joplo 的静态封面（第 0 步）和“motion from frame 0”冲突；但封面是交互播放器的入口，不是视频第 0 帧，可以保留，只要封面本身能当缩略图（motion-video-skill `references/craft.md` L99–104）。

8. **镜头抖动和跟随。** onetake 的通用相机规则要求“chase”、手持浮动、每次落地加 `OM.shake`（`SKILL.md` L133–136），但它的功能演示参考说“Narrated UI films want no shake”（`references/product-demo.md` L141–142）；motion-video-skill：内容在动时镜头不动（`references/building.md` L90）。同一仓库里，宣传片和界面演示的规则不同。

9. **PM 仓库内部：工作流拆分的方式。** `user-story-splitting` 的 Pattern 1 示例是按步骤拆（注册 / 验证邮箱 / 完成引导：L94–102）；`epic-breakdown-advisor` 明确说按步骤拆是“Pattern 1 Done Wrong”，应该做薄的端到端切片（L168–182、L601–607）。对 Joplo，后者更合适：每个 scenario 都应从入口走到结果。

10. **钩子的时限因体裁而异。** motion-video-skill 是 2 秒（`references/direction.md` L98），clawd 案例是第 1 秒，speclip 短剧是 0–8 秒（commentary 输出模板写 10 秒：`short-drama-commentary/references/output-template.md` L40）。

11. **“功能演示”的定位。** PM 故事板说“Not a feature demo: Focus on user outcomes”（`storyboard/SKILL.md` L57）；motion-video-skill 把“Live walkthrough”列为正当的故事形状（`references/concepts.md` L21）。两者不矛盾，可以合起来用：用结果来框住整个走查（开场讲问题，结尾讲结果）。

12. **阅读速度没有中文数据。** motion-video-skill 只给了英文“3 words/s、至少 0.8 秒”（`references/craft.md` L18）；video-production-skills 的中文 10–16 字/秒是打字动画速度，不是阅读速度（`black-white-text-opener/references/motion-contract.md` L57–58）。五个仓库都没有能直接对照 Joplo“中文 8 字/秒”的阅读速度。可用的旁证是长度上限：onetake 中日韩字幕块 ≤20 字，speclip 横屏每行 18 字、竖屏每行 12 字、最多两行，这和 Joplo 字幕 ≤24 字大体一致；时长旁证是 speclip 单句 VO 1.5–5.5 秒、motion-video-skill 字幕每条 1–6 秒，和 Joplo 的 3–7 秒基本重合，只是 Joplo 的下限更高。

### 6.3 对 Joplo 的候选落点（汇总，均为建议）

- **技能文字**：写 flow 前先回答 5 问（角色、目标、阻碍、关键结果、结尾策略）；第 1 步字幕要定向（谁在做什么）；字幕 = 角色 + 动作（主动句），explain = 为什么或意味着什么；不用空泛包装词；一个 scenario 只走一条端到端的线；先做最简完整的 happy path，再为每个 rule、数据变体、角色、异常各做一个 scenario；交付前像陌生人一样通读一遍。
- **作者 API**：scenario 可带 Given、When、Then 语义（初始状态 / 用户步骤 / 结果步骤）；步骤可选 `job`（hook / mechanism / proof / close）、`hold`（关键步骤延长停留）、`note`（给评审的理由）、关键词强调；显式声明“钩子前置”。
- **组件**：高亮（按内容大小的发光圆角矩形）；点击按下/抬起约 75 毫秒；光标形状随动作切换；跨步骤时光标不消失；shot 推近 1.6–2.5 倍、不抖动、推近在停留前完成；字幕层不随镜头动，也不遮挡目标；状态芯片、toast 等“结果可见”组件；收尾卡最少停 1–1.5 秒；过渡卡保留一个延续元素。
- **看板功能**：停留时长 CV（低于 0.25 时提示）；每个 scenario 是否有钩子、结果、收尾；字幕提到的元素在该步是否可见、屏幕字号是否 ≥26–28 像素；字幕与画面文字是否重复；每步的文字负荷；接触表视图（不看字幕能否看懂）；rules × cases × roles 的覆盖矩阵；异常问题清单（乱序、跳过、空值、权限、失败）。
