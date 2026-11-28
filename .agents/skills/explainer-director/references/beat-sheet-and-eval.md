# Beat Sheet Contract & Comprehension Eval Rubric

## 1. Lightweight Narrative Beat Sheet Template (`BEAT_SHEET.md`)

Write this compact contract before authoring TSX. A beat is one unit of cognitive progress (usually 1–2 Joplo steps; a silent observation window is an explicit sub-beat).

```markdown
# <Work Title> · Beat Sheet

- **One-Sentence Takeaway**: <观众看完能自己复述的一句话结论>
- **Audience & Prior**: <目标受众是谁，默认他们知道什么、不知道什么>
- **Misconception to Prevent**: <最容易误解成什么（例如：误以为 KV Cache 缓存的是最终回答文本）>
- **ABT Spine**:
  - **AND**: <共同背景与已知前提>
  - **BUT**: <核心矛盾、代价或反常现象>
  - **THEREFORE**: <引入的核心机制及它带来的新权衡>
- **Running Concrete Specimen**: <贯穿全片的唯一具象例子，及它的 motion keys>
- **Facts vs Illustrative Boundary**: <哪些是真实定律/引用，哪些是示意比例>

## Beats

| Beat | Chapter | Purpose | Prior → New Insight | Stage Action & Conserved Keys | Silence / Pacing |
|---|---|---|---|---|---|
| B01 | hook | Hook / Conflict | 知道逐词生成 → 意识到“回头看全文”有重复计算疑问 | `tok_0..3` 逐个上轨，框选历史序列 | 6s · 提问开场 |
| B02 | waste | Problem | 模糊觉得费算力 → 亲眼看到无缓存时历史词被一遍遍重算 | 无缓存模式：每生 1 词，红色脉冲重扫全部 `tok_0..t`；算力条阶梯暴涨 | 9s · 慢放两轮对比 |
| B03 | extract | Mechanism 1 | 以为只能重算 → 看到因果注意力中历史 K、V 固定不变可抽离保存 | `tok_0..3` 抽出 `kv_0..3` 飞入右侧显存槽锁定 | 8s + **2.2s `narrate(false)` 观察留白** |
| B04 | reuse | Mechanism 2 | 知道存下来了 → 看懂下一轮只算新词 K/V 并直接读取静止的历史缓存 | 新词 `tok_4` 单独进计算台产出 `kv_4` 入槽；`Q_4` 读取静止的 `kv_0..3` | 10s + **2.4s `narrate(false)` 观察留白** |
| B05 | tradeoff | Implication | 以为免费加速 → 看到上下文拉长时算力省下但显存线性膨胀 | 算力条压低（绿）与显存槽暴涨（琥珀/红）同屏联动 | 12s · 慢放量纲反转 |
| B06 | closure | Payoff | 零散印象 → 收束“用显存空间换少算重复历史”并可暂停亲手试长度 | 拉远全景，问题签翻为 ✓ 答案，开放 `512 / 8K / 64K` 长度切换 | 8s · 回收开头 |
```

## 2. Comprehension Eval & 7-Dimension Self-Audit

Evaluate every explainer on two levels:

### A. Three Audience Comprehension Checks (Must Be Answerable from the Piece Alone)
1. **Mechanism Recall**: Can a viewer state in one sentence *what* is stored/transformed and *why* it works?
2. **Misconception Trap**: Can a viewer explain why the most common wrong mental model is false based on what they saw on screen?
3. **Transfer Question**: Given a new boundary condition (for example, *"如果把上下文从 2K 扩到 128K，先爆的是单步重复算力还是显存？"*), does the visual model make the answer obvious?

### B. 7-Dimension Director Rubric (100 pts)
- **Factual & Boundary Accuracy (20%)** — Zero fabricated claims; illustrative numbers labeled; simplifications explicitly scoped.
- **Causal Coherence / ABT Flow (20%)** — Beats link via `因为 / 但是 / 所以`; zero unmotivated jumps or orphan concepts.
- **Cognitive Load Efficiency (20%)** — Progressive scaffolding, one running specimen, direct labels, zero stage-subtitle text duplication.
- **Spatial-Kinetic Effectiveness (15%)** — Muted `--sheet` frames still communicate mechanism through conserved `motion` objects and stillness contrast.
- **Focal Hierarchy (10%)** — Single visual center per beat; camera framing (`~16:10` clusters) keeps text legible and clear of host overlays.
- **Rhythm & Silence Choreography (10%)** — Deliberate `narrate(false)` observation windows on key animations; zero red `CUT` or dead `STILL` defects in `--film --chain`.
- **Takeaway Closure (5%)** — Opening question answered on stage; optional pause-and-explore control works cleanly.
