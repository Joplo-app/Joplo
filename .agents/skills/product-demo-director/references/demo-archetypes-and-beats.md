# Product Demo Archetypes, Pacing & Beat Templates

## 1. Pacing Curve for a 120s Feature Walkthrough

Do not distribute time evenly across UI clicks:

| Window | Stage | Narrative job | Pacing rule |
|---|---|---|---|
| `0–10s` | **1. Concrete Context** | Name the specific person and high-stakes task in one opening beat | Fast, zero logo/splash |
| `10–25s` | **2. Current Friction** | Show the blocking moment in the old or naive flow | Visibly stall on the pain point |
| `25–40s` | **3. Target Outcome Preview** | Show the desired end experience before dissecting rules | Clear payoff anchor |
| `40–80s` | **4. End-to-End Main Flow** | Walk `Action → Reaction → Meaning` through the core workflow; couple UI + architecture layer if backend coordination matters | Merge trivial inputs; linger on state flips |
| `80–110s` | **5. Critical Edge & Failure Slices** | Separate `flow()` slices for rejection, timeout, duplicate action, or permission denial using shared `mock()` outcomes | One `When → Then` per slice |
| `110–120s` | **6. Open Decision Prompt** | Land on the exact unresolved policy choice (`question()`) | Crisp options + default recommendation |

## 2. Design Comparison (Option A vs Option B) Discipline

A comparison fails if Option A and Option B use different personas, different sample data, or different scenario goals — viewers end up judging polish rather than behavior.

- **Lock invariants in `feature.ts`**: shared `goal`, shared `roles`, and shared `cases` (`expected` written independent of UI shape, e.g. `"Admin sees which addresses failed and can retry without retyping valid ones"`).
- **Identical inputs across `works/a.tsx` and `works/b.tsx`**: feed the exact same sample payload and failure sequence (`flow({ api })`) into both works.
- **Honest `focus` & `tradeoffs`**: state what Option A optimizes for and what it sacrifices (and vice versa for Option B). Never rig Option B as a strawman unless documenting a rejected historical baseline.

## 3. Anti-Patterns to Catch Early

- **Feature-tour narration**: *"这里我们加了一个状态栏、一个暂停按钮和一个日志抽屉。"* → Rewrite around user state: *"提交长任务后用户可以直接合上电脑；只有遇到高危变更时，系统才会挂起并推手机确认。"*
- **Dead-end takeover**: Viewer pauses playback and clicks Cancel, Tabs, or Retry, and nothing happens. Attach `onClick` + `mock()` on the controls on stage so live takeover works out of the box.
- **Silent AI assumptions**: Inventing a 24-hour timeout or auto-refund policy and presenting it as settled spec. Record every unconfirmed rule as `rule(..., { origin: 'ai_assumption', status: 'pending' })` and surface consequential ones as `question()`.
