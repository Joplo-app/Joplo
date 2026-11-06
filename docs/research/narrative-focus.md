# 叙事焦点：每一段时间看哪里、用什么形式呈现（调研，2026-11-06）

> 来源：用户 2026-11-06（“演示是一种叙事，叙事一定有某一段时间关注的重点，以及这个重点呈现的形式”）。
> 方法：只读官方文档、GitHub 源码和论文，不运行任何第三方代码。标【文档】的是原文或源码里明确写着的，标【推断】的是归纳。
> 源码链接指向 main / master 分支（2026-11），行号以后可能变。结论落地见 DECISIONS.md D67、`npx joplo skill focus`、docs/web.md「焦点与呈现形式」。

## 1. 录屏与演示视频工具的自动焦点

| 结论 | 出处 |
| --- | --- |
| Screen Studio 的缩放段分 Auto / Manual；Auto 只对准录制时的点击位置，没有点击的段不放大。时长靠拖时间线上缩放段的两端调整，默认时长与倍数没有公开【文档】 | https://screen.studio/guide/auto-zoom ，https://screen.studio/guide/adding-editing-zooms |
| Screen Studio 的动画有 Focused（很快稳住，便于阅读）与 Smooth 两档，另有 Instant（不做动画直接切）【文档】 | https://screen.studio/guide/animations ，https://screen.studio/guide/instant-zoom |
| Screen Studio 的 Mask（遮挡敏感信息）不跟随页面滚动；Highlight 可调透明度【文档】 | https://screen.studio/guide/adding-a-mask-and-highlight |
| Cap 由点击生成缩放段：每次点击 [t−300ms, t+2500ms]，两段间隔 ≤2500ms 合并，默认 2 倍【文档：源码 `generate_zoom_segments_from_clicks`】 | https://github.com/CapSoftware/Cap/blob/main/apps/desktop-gpui/src/editor_edits.rs |
| Cap 镜头用弹簧-质量-阻尼（stiffness 200 / damping 40 / mass 2.25），段间速度连续；相邻焦点直接平移，不回全景【文档】 | https://github.com/CapSoftware/Cap/blob/main/crates/rendering/src/zoom_spring.rs |
| OpenScreen：缓动 cubic-bezier(0.16,1,0.3,1)（源码函数名 `easeOutScreenStudio`）；相邻两段 ≤1500ms 时直接平移、不先缩回全景【文档】 | https://github.com/siddharthvaddem/openscreen/tree/main/src/components/video-editor |
| 几家共同点：点击前留提前量、点击后停留较长；约 2.5 秒内的点击合并；相邻焦点直接平移；镜头速度连续【推断】 | 同上三项 |

## 2. 交互式产品演示与页面引导库

| 结论 | 出处 |
| --- | --- |
| Navattic：表现最好的 demo 每个 flow 5–13 步；对话框 25–30 个英文词，开场 10–20 词；第一步、最后一步、进入新页面用 Modal，指向具体位置用 Tooltip，每个 tooltip 1–3 行；功能页只聚焦一个 aha 时刻【文档】 | https://docs.navattic.com/help/best-practices.md ，https://knowledgebase.navattic.com/docs/best-practices |
| Arcade：步数是影响完成率最大的因素，前 1% 的 demo 比中位数少 16% 的步数；加引导章节后播放率 +72%【文档，厂商数据，口径未公开】 | https://www.arcade.software/post/interactive-demo-statistics |
| Arcade 编辑器：热点要“讲故事而不只是标出点击”；不需要点击的说明用 callout；聚光区域（Spotlight Area）的外部遮罩颜色与透明度可调；Pan & Zoom 在相邻步骤用同尺寸取景框、只改位置得到平移；放太大会糊【文档】 | https://docs.arcade.software/kb/build/interactive-demo/edit/hotspots-callouts-and-spotlights ，https://docs.arcade.software/kb/interactive-demo/build/interactive-demo/edit/pan-and-zoom.md |
| Storylane：每步只能有一个引导元素，缩放锚定在它上面；blur 可一键应用到所有步骤【文档】 | https://docs.storylane.io/editing-demos/adding-and-editing-guided-steps ，https://docs.storylane.io/editing-demos/editing-screenshot-screens |
| Supademo：热点“引导而不说教”；一步多个热点就是噪声；脉冲动画少用；热点不能遮住它要解释的界面；Smart Blur 录制时自动识别敏感信息【文档】 | https://supademo.com/academy/edit-and-refine/hotspots ，https://supademo.com/features/blur |
| Driver.js：遮罩是全屏 SVG path，用 evenodd 挖洞；保证可点靠 `pointer-events` 只给高亮元素和气泡恢复；切换步骤时洞口 400ms 形变，气泡在过渡过半后出现；气泡首选侧放不下就换侧【文档：源码】 | https://github.com/kamranahmedse/driver.js/tree/master/packages/driver/src （overlay.ts、highlight.ts、position.ts） |
| Shepherd.js：带圆角洞口的 SVG path；遮罩容器 `pointer-events:none`；洞口按可滚动父容器裁剪成可见部分并用 rAF 持续跟踪；定位用 Floating UI 的 flip + shift【文档：源码】 | https://github.com/shipshapecode/shepherd/tree/main/shepherd.js/src （utils/overlay-path.ts、components/shepherd-modal.ts、utils/floating-ui.ts） |
| Intro.js：用 `box-shadow: 0 0 0 5000px` 压暗外部；需要禁止交互时在目标上盖一层挡住点击【文档：源码】 | https://github.com/usablica/intro.js/blob/master/src/packages/tour/components/HelperLayer.ts |

## 3. 讲解动画框架与 Agent skill

| 结论 | 出处 |
| --- | --- |
| Remotion 官方 skill：“Decide what the viewer should notice first in each scene. Build the frame around that one thing.”“Do not add redundant elements.”【文档】 | https://github.com/remotion-dev/skills/blob/main/skills/remotion-best-practices/remotion-create/video-layout.md |
| Remotion skill：动画只能由帧驱动（`useCurrentFrame()` + `interpolate()`），推荐 `Easing.bezier(0.16,1,0.3,1)`；系统提示要求代码确定、禁止 `Math.random()`【文档】 | https://github.com/remotion-dev/skills/blob/main/skills/remotion-best-practices/remotion-markup/timing.md ，https://www.remotion.dev/docs/ai/system-prompt |
| Remotion 手绘标注用 `@remotion/rough-notation`（Circle / Underline / Box / Highlight）【文档】 | 同仓库 `remotion-markup/text-highlights.md` |
| Motion Canvas：`camera().centerOn(node)`、`zoom()`、`reset()`；节奏用可拖动的时间事件 `waitUntil('event')` 代替写死的秒数【文档】 | https://motioncanvas.io/docs/camera ，https://motioncanvas.io/docs/time-events |
| Manim：`MovingCameraScene` 的 `camera.frame.animate.move_to/scale`，`save_state()` + `Restore()` 回到全景，`auto_zoom(group)` 框住一组对象【文档】 | https://docs.manim.community/en/stable/reference/manim.scene.moving_camera_scene.html |
| 3Blue1Brown：“Every movement on the screen should be deliberate, with an identifiable purpose.”【文档】；“用颜色引导注意力”“一次只动一个”的原话未找到公开资料 | https://www.3blue1brown.com/faq/ |
| Slithy（Zongker & Salesin）：“partition animations such that only one action happens at a time”【文档，经 Heer & Robertson 2007 第 2 节转引】 | 见第 5 节 |

## 4. 发布会节奏与“一屏一个重点”

| 结论 | 出处 |
| --- | --- |
| Duarte Glance Test：观众应在 3 秒内看懂一张幻灯片的要点，每张聚焦一个点【文档】 | https://www.duarte.com/resources/guides-tools/the-glance-test/ |
| Garr Reynolds 信噪比：密集文字、冗余要点、分散注意的动画都是噪声【文档】 | https://presentationzen.com/blog/the-signal-to-noise-ratio-activity |
| Kawasaki 10/20/30【文档，原页拒绝抓取，按二手转载核对】；“Apple keynote 一屏一个想法”没有找到 Apple 官方表述 | https://guykawasaki.com/the_102030_rule/ |
| Mayer & Moreno 2003：分段、信号、剔除无关内容、去冗余、画面与讲解同步等九种降低认知负荷的方法【文档】 | https://doi.org/10.1207/S15326985EP3801_6 |
| 信号原则（signaling）：Mautone & Mayer 2001 的原始实验；元分析 Richter 等 2016、Schneider 等 2018、Alpizar 等 2020（d≈.38）总体为正【文档】 | https://doi.org/10.1037/0022-0663.93.2.377 ，https://doi.org/10.1016/j.edurev.2015.12.003 ，https://doi.org/10.1016/j.edurev.2017.11.001 ，https://doi.org/10.1007/s11423-020-09748-7 |
| de Koning 等 2007：只给动画里的一个过程加视觉提示，被提示与未被提示内容的理解都提高【文档，摘要】 | https://doi.org/10.1002/acp.1346 |

## 5. 可视化研究里的 focus + context

| 结论 | 出处 |
| --- | --- |
| Shneiderman 1996：“Overview first, zoom and filter, then details-on-demand”【文档】 | https://drum.lib.umd.edu/items/cd983adb-568a-47d3-b43a-1d8d8b8c72f4/full |
| Furnas 1986 鱼眼视图：人对“邻域”记得细，远处只记地标【文档，摘要】 | https://doi.org/10.1145/22339.22342 |
| Cockburn、Karlson、Bederson 综述：四类界面（overview+detail、zooming、focus+context、cue-based 高亮或抑制）；动画缩放帮助理解前后关系，但没有证据缩短任务时间；缩放动画建议 0.3–1.0 秒；放大太多会出现缺少地标的 “Desert Fog”【文档】 | https://www.microsoft.com/en-us/research/wp-content/uploads/2008/01/cockburn-ComputingSurveys09.pdf |
| Heer & Robertson 2007：可预测（slow-in/slow-out）、简单过渡（同时多处变化增加负荷）、复杂过渡分阶段、“as long as needed, but no longer”【文档】 | https://homes.cs.washington.edu/~jheer/files/2007-AnimatedTrans-InfoVis.pdf |
| Woods 1984 视觉动量：整页替换会让人像拼没有参考图的拼图；提高手段有全景（long shot）、地标、画面重叠【文档，二手笔记】 | https://doi.org/10.1016/S0020-7373(84)80043-7 ，https://ferd.ca/notes/paper-visual-momentum.html |

## 6. 对 Joplo 意味着什么

Joplo 现状（0.2.7）：镜头 `shot` 同时负责“推近 + 焦点外调暗 + 高光框”，`trace` 自动当镜头，`mark` 是手绘标注；没有写 shot 的步骤沿用上一步的镜头；用户操作有鼠标与点击波纹。缺的是：比推近更轻的强调形式、一句话的说明、对“这一屏有几部分”的引导、停留、敏感信息，以及没写 shot 时“结果出现在哪里”的提示。4 个官网示例几乎每一步都手写 shot，说明作者在用唯一的工具做所有事情。

### 做成默认行为（可以用 `config({ autoFocus: false })` 整体关掉）

1. **每一步都有一个焦点对象，由纯函数推导**（`focusAt`）：封面、过渡卡、作者写的、默认推导、只有字幕。依据：Storylane 每步一个引导元素、Remotion “one thing”、Slithy one action at a time、Remotion / Cap 的确定性。
2. **用户操作的焦点就是被操作的元素，呈现就是鼠标与点击波纹**，不额外放大。依据：Screen Studio / Cap 以点击为焦点；但每次点击都放大会抖，Arcade 只在“值得聚焦”时缩放，Cockburn 的 Desert Fog。
3. **结果揭晓**：没写焦点的步骤里，新出现或变化的元素轻轻亮一下再淡出，不移动镜头。依据：信号原则（只提示一处也有效，de Koning 2007）；Supademo “脉冲少用”与 Reynolds 信噪比 → 加了克制规则：弹窗 / 抽屉、DataCard / StateFlow、一次超过 3 处、换页换层、同一处连续变化或同一容器连续追加、作者写了焦点时都不提示。在 `examples/` 实测：agent-arch 71 步 0 次（全部是作者写的焦点）、camping 31 步 5 次、invite 17 步 6 次、joplo-board 100 步 42 次、joplo-dist 55 步 23 次（加连续性规则之前是 40 次，终端里一行行追加只在第一次提示）。
4. **换层时先全景再推近**：导演换到另一层且要推近时，新画面淡入时停在整层，0.4 秒后推近。依据：Shneiderman overview first、Woods long shot、Manim save_state / Restore。原来换层时镜头从上一层的视图直接过渡，方向随意；现在每次换层都是同一个方向（由远到近），符合 Heer “可预测”。只在“换层 + 有推近目标”时发生，所以不增加日常的抖动。调研建议“establish 由作者显式声明、播放器不自动插入”，我们只在换层这一个时刻自动做，其余时刻作者用 `shot()` 一步整层、再 `shot('x')` 一步推近来表达。
5. **镜头参数不变**：700ms、cubic-bezier(0.16,1,0.3,1)（与 OpenScreen 的 `easeOutScreenStudio` 同一条曲线），落在 Cockburn 建议的 0.3–1.0 秒内。

### 做成作者可选的原语（只作用于一步，跟随主题，不拦截点击）

| 原语 | 对应 | 取舍 |
| --- | --- | --- |
| `spotlight(...ids)` | Arcade Spotlight Area、Driver.js / Shepherd 的 evenodd 挖洞 | 不推近；用背景色冲淡其余区域（与镜头调暗同一种“变淡”，主题里深色浅色都成立），不用黑色遮罩；整层 `pointer-events:none`，洞口同时让出下一步要点的元素 |
| `highlight(...ids)` | 热点脉冲 | 一圈强调框，出现时脉冲一次（固定向外扩 10px，宽元素不会扩太远） |
| `callout(id, text, { side })` | Arcade callout、Navattic tooltip、D61 计划中的“便签式说明” | 浅强调色便签 + 引线；按 右→左→下→上 选放得下且不压住目标和其他提示的一侧（Floating UI flip 的简化版）；长度与字幕同一口径（24） |
| `numbered(...ids)` | 引导章节、checklist | 一屏由几部分组成 / 先后顺序；最多建议 5 个 |
| `hold(seconds)` | Heer “as long as needed”、Motion Canvas 时间事件 | 只延长自动播放停留（0.5–30 秒，按速度缩放），不改阅读节奏的计算 |
| `redact`（元素属性，可写条件） | Storylane 全步骤 blur、Screen Studio Mask 不跟随滚动的缺陷 | 写在元素上，所有步骤生效、跟着元素走，布局不变；被镜头调暗时两个滤镜叠加，不会因调暗露出原文 |

提示目标不在当前镜头里时，编译器给这一步补一个整层镜头（写进 IR），之后沿用整层——提示永远不会落在画面外。没有 shot 的步骤，提示所在的层决定导演切到哪层。

### 写进技能（`npx joplo skill focus`）

一步一个主体（字幕里出现“和”就拆）；先上下文后细节；同一主体连续几步保持同一个取景；只有细节太小才推近；一步最多一个主要形式加一个便签或一组编号；便签讲为什么、不重复字幕；连续三步画面不变就合并。反例与对应的 check 提示：每次点击都 shot、shot 与 spotlight 指向不同的地方（FOCUS_CONFLICT）、提示在别的层（FOCUS_OFF_LAYER）、只有字幕的连续系统步骤（FOCUS_IDLE）、便签写成一段话（CALLOUT_TOO_LONG）。依据：Navattic 的步数与 tooltip 长度、Mayer 的去冗余与分段、Duarte Glance Test、Supademo “一步多个热点就是噪声”。

### 不采纳（理由）

- **每次点击自动放大**（Screen Studio / Cap 的 auto zoom）：Joplo 的演示几乎每一步都有点击，默认放大会让每一步都在缩放；鼠标与点击波纹已经指出位置。放大留给作者的 `shot`。
- **弹簧物理镜头**（Cap）：时长随距离变化，难以和阅读节奏、视频导出、静态截图对齐；保留固定 700ms 的确定曲线。
- **聚光洞口在步骤之间形变**（Driver.js）：需要跨步骤的动画状态，跳到任意一步时没有“上一步”可形变；按 Heer 的分阶段原则，改为“先镜头、再提示”依次出现。
- **自动识别并模糊敏感信息**（Supademo Smart Blur）：原型数据本来就是作者写的假数据，没有要自动发现的秘密；提供显式的 `redact`。
- **并排前后对比**：D56 用户已否定并排（“并排看起来有问题”）；数据的旧值→新值由 DataCard / StateFlow 表达，路线差异用 fork，方案差异在看板里切换比较。“前后对比用同一个取景框”写进技能（同一主体保持同一个取景）。
- **要求观众点热点才能继续**（Arcade hotspot gating）：Joplo 已有“点下一步的目标才推进”的交互，不再加一套。
- **章节**：Joplo 已有场景、情况和过渡卡。
- **motion blur、光标装饰**：Reynolds 归为噪声，3Blue1Brown “每个动作都要有目的”。
- **镜头随停留自动“呼吸”或缓慢平移**：没有目的的运动。

## 7. 和另外两个 worker 的分工

- `joplo-diagram-v2`：镜头取景规则（推近时保留父分组 / 容器上下文、多节点取景）在 camera.tsx 的 `measure()` 与 camera-math 里实现。焦点模型最终仍产出 shot 目标（`Step.shots` / `cameraAt` 语义不变），所以它的取景规则自动作用于默认焦点与提示补的整层镜头；“先全景再推近”只改了 `useCamera` 效果里应用视图的时机，不改 `measure()`。
- `joplo-story-ux`：字幕与讲解的写法、长度检查、规划演示（大纲）。`skill story` 里“引导注意力”指向 `skill focus`；便签长度复用字幕的 `captionLength` / `CAPTION_MAX`。
