---
name: explainer-director
description: >-
  Plan, script, and direct science, engineering, paper-breakdown, architecture,
  or history explainers in Joplo so viewers build a lasting mental model rather
  than receiving a dump of terms or paper sections (科普视频导演、技术原理解析、论文拆解叙事、知识可视化脚本).
  Use when turning a technical mechanism, research paper, system principle, or
  domain topic into a playable Joplo explainer work.
---

# Explainer Director (Mental-Model & Cognitive Narrative Design)

Turn dense technical material, research papers, or real-world black boxes into a **guided mental-model construction** in Joplo. A good explainer never dumps facts or mirrors an academic paper's table of contents (`Intro → Method → Results → Conclusion`); it makes the viewer **feel the need for a concept first**, then watch that concept emerge and resolve the tension on stage.

Always pair this skill with `visual-explanation` to translate beats into spatial-kinetic stage mechanics, and read `npx joplo skill authoring` + `npx joplo skill content` (and `diagram` / `alda` / `av` if enabled) for Joplo's `work() + chapter()` contracts.

## 1. Never Jump Straight from Source Material to TSX or Verbatim Script

Execute the six-layer director pipeline in order. Layers 01–04 are compact planning artifacts (`BEAT_SHEET.md` in the work/project folder or inline brief before coding) that prevent "pretty slide-deck" failure:

1. **01 · Research Brief (事实与边界清单)** — Extract verified facts, formulas, causal invariants, and exact citations; explicitly separate **empirical facts** from **illustrative numbers (`示意数据`)** and note where any metaphor breaks down.
2. **02 · Narrative Outline (ABT 主线与模型选型)** — Define target audience prior knowledge, the single sentence they can repeat afterward, the **ABT spine** (`AND` shared reality → `BUT` cognitive conflict / bottleneck / misconception → `THEREFORE` mechanism & new trade-off), and choose one narrative structure:
   - **Mechanism (机制拆解)**: `熟悉现象 → 朴素代价/矛盾 → 核心结构 → 单步运转 → 规模化权衡` (default for CS, AI, engineering, infrastructure).
   - **Discovery (探索破误)**: `直觉问题 → 常见错误猜测（Refutation） → 实验/反例推翻 → 真实因果` (best for counter-intuitive physics, probability, subtle bugs).
   - **Evolution (演进推演)**: `初代方案 → 撞上瓶颈 → 关键突破 → 引发的新问题 → 当前形态` (best for paper lineages and product/tech history).
3. **03 · Beat Sheet (叙事节拍表)** — Break chapters into **Narrative Beats** (see [beat-sheet-and-eval.md](references/beat-sheet-and-eval.md)). Every beat must declare: *viewer's prior belief → target new insight → conserved visual object (`motion` key) → active vs stationary elements → observation silence window → completion criterion (including what misconception it prevents)*.
4. **04 · Voiceover A/V Script (音画分轨稿)** — Write spoken `narrate()` lines alongside stage changes before touching JSX.
5. **05 · Kinetic Stage Topology (`visual-explanation`)** — Lay out one persistent `<Canvas>` world (or coupled layers) of ~16:10 clusters around a **single concrete running specimen**.
6. **06 · Joplo `work() + chapter()` Timeline** — Compile, storyboard (`--sheet`), film-strip (`--film --chain`), and verify in playback.

## 2. Eight Verbatim Scripting Rules for `narrate()`

1. **Open on a concrete puzzle or familiar friction**, never `"今天我们来介绍 X"` or a textbook definition.
2. **Create demand before naming jargon**: show the behavior or bottleneck in plain words first (`"每吐出一个新词，都要回头重算整段历史"`), then attach the technical term (`KV Cache`) once the viewer already sees why it must exist.
3. **Active voice, concrete subject first**: `"模型把历史 Key 和 Value 存进右侧显存槽"`, not `"历史特征将被缓存模块进行持久化处理"`.
4. **One causal intent per step**: connect adjacent beats with **`因为 / 但是 / 所以`** rather than flat **`然后……接着……另外……`**. Every solved problem should naturally expose its next constraint or trade-off.
5. **Let the stage carry spatial facts**: never narrate `"画面左边出现四个蓝色方块"`. Use pointing language to direct interpretation (`"注意看算力条压下去的同时，右侧显存槽发生了什么"`).
6. **Concrete numbers, spoken naturally**: compute illustrative numbers from one consistent TS formula, round for speech, and mark `示意` on stage.
7. **Fence every simplification**: if an explainer simplifies multi-head / GQA / quantization into single K/V blocks for clarity, state the exact scope in one source/note line rather than stating an untruth.
8. **Close the opening loop**: end by pulling back to the full world where every pinned question has flipped to its answer and answering the opening puzzle in one crisp sentence. No `"感谢观看，点赞关注"`.

## 3. Three-Tier Pacing Control (Macro · Beat · Micro)

- **Macro Pacing**: alternate *tension (question / bottleneck)* → *insight (mechanism)* → *digestion (payoff / trade-off)* rather than delivering uniform density for 3 minutes straight.
- **Beat Pacing**: **slow down** on first-time concepts, counter-intuitive flips, and quantitative trade-offs; **accelerate** once the rule is grasped (`慢放第一轮，快进后三轮`).
- **Micro Pacing ("When to Stop Talking")**: pair pointing beats with `narrate(false)` + `hold(1.8–3.0)` observation windows (`visual-explanation` §5) whenever objects fly into cache/storage or coupled meters shift, so viewers watch the mechanism work instead of parsing speech over motion. Budget ~4.5 CJK chars/sec (or ~2.5 English words/sec), keeping chapters around 35–75 seconds.

## 4. Comprehension Evaluation & Quality Gate

Before handing off an explainer:
1. Pass all `visual-explanation` gates (`npx joplo check` 0 errors, `--sheet` muted-frames test, `--film --chain` zero unwanted `CUT`/`STILL`, 30-second live browser smoke check). Standalone explainers use `work() + chapter()` in `works/<key>.tsx` — never invent fake `feature()` failure cases.
2. Score against the 7-dimension rubric and attach the **3 Comprehension Check questions** from [beat-sheet-and-eval.md](references/beat-sheet-and-eval.md) (1. one-sentence mechanism recall, 2. misconception trap check, 3. novel-case transfer prediction) so human or agent reviewers can verify whether the piece actually built the intended mental model.
