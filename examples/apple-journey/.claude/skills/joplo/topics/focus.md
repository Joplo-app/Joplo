# Joplo focus: focus

A demo is a story told over time. In every step the viewer should know where to look and why.
Decide each step's focus before writing it: one subject, one form. The caption says what happened, the focus shows where, a callout (optional) says why.
Import spotlight, highlight, numbered, callout, hold from @joplo-app/kit; shot and mark are in demo; plugin-specific progression effects are documented by their owners.

## Defaults: what you get without writing anything
- Step 0 is the scenario cover; a .card() step is its own focus.
- User actions: the cursor moves to the element and clicks; the camera brings it into frame if needed. Do not add shot() just to show what is clicked.
- the installed plugin’s progression effect frames the call path in a diagram component.
- Result reveal: after a step, an element that newly appears or changes (an alert, a badge, a new message, a menu) pulses once and fades. It never moves the camera.
- A target moving with a CSS transition (a style bound to state; see demo) is followed: spotlight, highlight and callout track it until the transition ends.
Read the relevant installed plugin skill for the visual component, its props and recovery rules.
- When the director enters another layer that has a shot, the stage starts on the whole layer, then pushes in (context first, then detail).
- config({ autoFocus: false }) turns off the reveal pulse and the layer-entry push-in. Your shots and cues still play.

## Choose the form by intent
- Look closer at a small or dense area: shot('id', …). The camera zooms; the rest fades. What the frame keeps (a node's group title, a card's container): diagram.
- One block on a busy screen, keep the layout visible: spotlight('id'). No zoom; everything else is washed out.
- "Notice this changed / this matters": highlight('id'). No zoom; a ring that pulses once.
- One short reason next to an element: callout('id', 'Share after generation', { side? }). A note with a leader line; side is top / right / bottom / left, or omitted to pick the free side.
- What a screen is made of, or an order of parts: numbered('input', 'preview', 'send'). Badges 1, 2, 3 (keep it to 5 or fewer).
- Give viewers time to look (a chart, a comparison, a long result): hold(5). Autoplay stays at least 5 seconds (0.5–30, scaled by speed).
Read the relevant installed plugin skill for the visual component, its props and recovery rules.
- Hand-drawn circle / underline / box / arrow: mark('id', { kind }) (see demo).

All cues apply to this step only, render in the stage theme, and never block clicks; spotlight keeps the next click target lit.
Cues do not zoom. If a cue's target is outside the current shot, the camera first returns to the whole layer.
In diagrams the frame always keeps the target's group (title at least) and a message's two participants: a cue on them stays in the shot; spotlight keeps the group title lit. Plugin components can declare that they show their own changes (fade-in, traces), so the reveal pulse skips them.
With layers, a cue switches the director to its target's layer when the step has no shot.

## Pacing rules
1. One subject per step. If the caption needs "and", split the step.
2. Context first: when a new screen appears, show the whole of it (or number its parts) before zooming into a corner.
3. Same subject, same frame: when several steps talk about the same block, keep one shot; do not re-aim the camera every step.
4. Zoom only when the detail is too small to read. Otherwise spotlight or highlight.
5. One primary form per step (shot or spotlight), plus at most one callout or one numbered set.
6. A callout explains why, in a few words. Never repeat the caption in it.
7. If three steps in a row change nothing on stage, merge them or show something.

## Anti-patterns → fixes
- shot() on every click → remove it; the cursor and the result reveal already guide the eye.
- shot('a') with spotlight('b') elsewhere → FOCUS_CONFLICT; aim both at the same thing or split the step.
- A callout / mark / highlight on another layer → FOCUS_OFF_LAYER; add shot('<id>') to switch there.
- Several system steps with only captions → FOCUS_IDLE; set() visible state, or merge.
- A paragraph in a callout → CALLOUT_TOO_LONG; keep it to about 24 units like captions, put the rest in explain().
- shot() on a layer whose next step clicks outside the framed area → the click target is off screen (render warns "Outside frame"). When the whole layer fits one screen, use highlight / spotlight instead of shot.
- numbered() on items that already print their own numbers → two sets of badges; spotlight the group instead.
- Rings everywhere: if everything is highlighted, nothing is.
- For traveling inside an explainer world, read the installed explainer plugin skill; its camera differs from the host focus hints.

## Example
```tsx
flow('Plan a weekend trip', { start: '/' })
  .card('Weekend camping', { sub: 'Xiaoyu asks the assistant to plan it' })
  .system('Meet the assistant', 'Chat on the left, plan on the right', numbered('chat_col', 'plan_col'), hold(4))
  .type('prompt', 'Camping this Saturday for two', 'Xiaoyu describes the trip')
  .system('Reply', 'Conclusion first: Baihe campsite', stream($.ui.reply, '…'), spotlight('msg_reply'), callout('msg_reply', 'Answer first, details in the plan'))
  .system('Plan ready', 'Budget done, the plan is ready', set($.ui.planStatus, 'ready'), shot('plan', 'share'), callout('share', 'Share after generation'))
```
Full example: examples/camping.

Related topics: demo, plugins, check
<!-- joplo-skill 0.7.0 sha256:d82858420af727dff8a10004736809e54034ceb49acec7d238a4d37f0331a1d2 -->
