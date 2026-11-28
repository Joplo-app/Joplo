# Spatial Topologies & Kinetic Recipes for Joplo

 Concrete mapping patterns from abstract mechanisms to Joplo plugin primitives (`@joplo-app/plugin-content`, `@joplo-app/plugin-diagram`, `@joplo-app/plugin-ui`). Read the project's installed plugin skills (`npx joplo skill content`, `npx joplo skill diagram`, `npx joplo skill ui`) for exact prop contracts.

## 1. Void-Stage Geometry for `<Canvas>` Worlds

- **Generous world & isolated shot islands**: use `<Canvas w={3200} h={2000} view={[1600, 1000]} safe={[72, 48, 96, 48]}>` and leave `350–450` design px of empty dark/neutral void between zones. When `camera('zone_stack', { pad: 80 })` frames one zone (`~1200×740`), neighboring zones sit completely outside the viewport — giving `70%+` clean negative space and zero dashboard clutter.
- **No outer container boxes**: let geometric primitives (layer bars, CSS border-radius return arcs or `<img>` data-URI SVGs, token pills, dot tallies, proportional towers) sit directly on the canvas void. Note that `@joplo-app/plugin-ui` declares HTML layout tags (`div`, `span`, `p`, `img`), not inline `<svg>` or `<br>` — build arcs/connectors with bordered `div` geometry or `<img>` assets, and stack lines with flex `<span>`s.
- **Color economy (`2` semantic hues max + neutral slate)**: keep non-active structure in quiet slate (`#343c4e`), reserve one warm hue (coral/amber) for the **core mechanism** (such as looped layers or active trace) and one secondary hue (emerald/blue or danger red) for **outcome/gate/ceiling**.
- **Prevent dead `STILL` spans in `--film --chain`**: keep spoken `narrate()` lines crisp (`20–45` CJK chars, `~4–8s` per beat) so camera `drift` never expires mid-speech leaving frozen frames; add subtle engine-clock CSS `@keyframes` pulse on active loops/beams when holding a frame.

## 2. Five High-Leverage Kinetic Patterns

### A. Split → Extract → Slot Reuse (Conservation of Identity)
*Best for: tokenization, caching (KV Cache, CDN, memoization), packet parsing, map-reduce, compiler passes.*
- Render the input specimen as discrete items with stable keys (`motion="tok_0"`, `motion="tok_1"`…).
- When deriving artifacts (for example, `K_0, V_0` from `tok_0`), spawn the derived chip adjacent to `tok_0` in beat N (`enter="zoom"`), then in beat N+1 render the **same `motion="kv_0"`** inside the target storage rack (`when={...}`). Joplo's FLIP engine flies `kv_0` into its permanent slot.
- On subsequent cycles, keep `kv_0..kv_{t-1}` mounted in the same slots (completely stationary, dimmed border or locked badge) while only `kv_t` flies in from the compute unit. Highlight read access with a subtle connector beam or border glow rather than moving the cached blocks.

### B. Slow-Motion First Cycle, Compressed Fast-Forward
*Best for: autoregressive loops, retry backoff, pagination, batch settlement, epoch training.*
- **Cycle 1 (3–4 beats)**: show every internal sub-step explicitly (input enters → compute fires → artifact lands in slot → output emits), including a silent observation beat (`narrate(false)` + `hold(2)`).
- **Cycles 2..K (1 beat)**: advance counter `step` from `1` to `4` in one `patch($.ui, ...)` with `enterStagger={180}` on the growing rack/rail so the viewer sees the pattern scale without sitting through repetitive narration.

### C. Coupled Proportional Trade-Off Meters
*Best for: space-vs-time (KV Cache, indexes), consistency-vs-latency, accuracy-vs-cost, quota consumption.*
- Compute both quantities in TypeScript from a single shared parameter (for example `seqLen` or `mode: 'recompute' | 'cached'`).
- Place two zero-anchored horizontal bars or slot grids side by side:
  - Bar 1: **Per-step redundant compute** (shrinks from `100%` crimson to `12%` calm blue when caching turns on).
  - Bar 2: **VRAM / storage footprint** (grows proportionally as `seqLen` scales from `4` → `4K` → `32K`).
- Label illustrative ratios honestly on stage (`示意比例`) and keep real architectural constants (linear growth with layers × heads × tokens) accurate.

### D. Misconception Stamp → Visual Refutation
*Best for: counter-intuitive behavior ("does KV Cache cache the text reply?", "does async mean parallel?", "why 2% confidence still speaks confidently").*
- Show the naive mental model concretely on stage first (for example, a tentative box `"缓存整句回答？"`).
- Trigger one concrete counter-case (a slightly different follow-up token or second run) that visibly breaks the naive model, cross it out or morph it away, and reveal the true mechanism in the same spatial slot.

### E. Coupled UI Layer + TALA Architecture Layer
*Best for: end-to-end product architecture walkthroughs where user experience and backend topology both matter.*
- Layer 1 (`ui`): the real user-facing surface (`@joplo-app/plugin-ui`).
- Layer 2 (`arch`): `<Diagram>` (using default `layout="tala"` 2D domain groups) or `<Sequence>`.
- Switch layers only at causal boundaries: user acts on `ui` → switch to `arch` and `trace('gateway', 'worker', 'db')` (with a silent observation beat if the trace crosses multiple domains) → return to `ui` to land the user-visible consequence.

### F. Operator Fusion & Parallel Rail Decoupling
*Best for: algebraic folding (matrix absorption, kernel fusion, constant folding), compiler passes, and decoupling a blocking constraint (such as splitting dynamic RoPE off a static content path).*
- Place adjacent pipeline stages horizontally on a clean track and give movable transforms conserved keys (`motion="mat_a"`, `motion="mat_b"`).
- First show why naive execution fails in place (e.g., an intermediate explosion box `enter="zoom"` `exit="shrink"`), or show a blocking dynamic constraint (`motion="blocker"`) wedged between two stages that cannot merge.
- In a `narrate(false)` + `hold(2.2)` observation step, switch `when` branches so `motion="blocker"` flies down onto a dedicated narrow parallel rail while `motion="mat_a"` immediately slides across to dock flush against its target stage.
- **Authoring notes**: pass declarative kit effects directly to interactive switches (`onClick={patch($.ui, { mode: 'x' })}`, never `() => patch(...)` which triggers `FUNCTION_PROP`), and use `camera('zone_1', 'zone_2', ..., { pad: 60 })` with `<Canvas safe={[116, 64, 116, 64]}>` on the final `done()` overview step so top-row titles never collide with the top-left completion badge (bare `camera()` renders full-bleed ignoring `safe`).
