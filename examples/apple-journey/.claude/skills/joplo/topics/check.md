# Joplo diagnostics: check

## Music checks
Referenced music is inspected by its enabled plugin on the author machine: duration, part note counts and marker times. Compare these with chapter holds; short loops over long scenes and music ending early warn. Unknown start markers are errors when the local inspector is available. Missing local tools warn without blocking unrelated checks; this is not proof that sound was rendered. Build reports each audio asset's bytes and duration. Listen to playback/export; when only measurements were possible, report LUFS/peak and explicitly say not verified by human listening. Read the enabled music plugin's skill for composition and recovery.


STEP_KEY_INVALID: use a letter followed by up to 63 letters/digits/underscores/hyphens. STEP_KEY_DUPLICATE: each step key must be unique within its scenario; keep the same key only for the same action across versions. See diff for identity guidance.

Run npx joplo check [dir]. Use --option feature.option to narrow structure checks and replay; --format json gives machine output.
The whole project still compiles. Option filtering does not hide project compilation errors. Source files load locally.

## Read the output
`file:line:column  severity  CODE  message`
Example: features/invite/options/a.tsx:12:5  warning  UNBOUND_INTERACTIVE  Interactive element has no demo step.
- File and line/column identify the edit location. Read nearby source and fix only that location; do not rewrite the page.
- The location is the author element or call that caused the problem. joplo.config.ts:1:1 means no source location was known.
- One root cause in a shared view (a layout, a component reused in routes and layers) prints once with "(affects N views)" and counts once; JSON adds affects: [view ids].
- error exits 1; usage errors exit 2; warning/info only exits 0.
- The last line totals error, warning, info. Run check again after fixing.

## Common codes → fixes
- FREE_ACTION_INVALID / FREE_TARGET_MISSING / FREE_EFFECT_INVALID: give each free reaction a valid targeted action in this option and only set, append or toast with valid leaf state paths. Move navigation, completion, media and plugin effects into flow steps; do not add event callbacks.
- ACTION_INVALID / ACTION_UNKNOWN / ACTION_DATA_INVALID / ACTION_TARGET_INVALID / ACTION_DESTINATION_MISSING / ACTION_DESTINATION_INVALID / PLUGIN_ACTION_INVALID: check the action shape, enabled plugin declaration, exact payload fields/ranges, allowed target type, and drag/scroll endpoint. Read the plugin skill; keep endpoints in the current stage, then rerun check.
- UNKNOWN_COMPONENT: Choose a supported name from components; do not invent components.
- UNKNOWN_PLUGIN / PLUGIN_PARENT / PLUGIN_INVALID / PLUGIN_DUPLICATE / PLUGIN_RUNTIME_MISSING: plugin components need their package in config({ plugins: [...] }) once, written inside the parent named in the message; a missing runtime means reinstall the package (npx joplo skill plugins).
- LOCAL_RESOURCE_FAILED / LOCAL_RESOURCE_TIMEOUT / LOCAL_RESOURCE_TOO_LARGE: an optional local resource could not compile. Playback continues without it; the board shows the source location and reason without resetting the timeline. Repair the native tool/input and retry build; for playback, switch scenarios, toggle sound off/on, or reload first. A failed media slot currently survives a simple pause/play, so that alone may not retry resource generation. Successful regeneration clears the warning. check does not execute native tools, so verify actual playback/build too (plugins).
- PLUGIN_DATA_INVALID: plugin output failed its JSON/schema contract, or the complete published IR exceeds depth 100 after shared references are expanded (root depth 0, including primitive leaves). For depth errors, flatten the cache or replace nested objects with string ids, then rebuild and verify that the published output can be compared with itself. See npx joplo skill plugins for the output contract.
- MISSING_ID / DUPLICATE_ID: Give interactive elements stable ids unique within the stage; update step references.
- EFFECT_INVALID: Use documented helpers, with arrays for composition. Arbitrary or misspelled effect objects are rejected, never interpreted as done().
- FUNCTION_PROP: Replace onClick and other callbacks with flow steps and state effects.
- UNKNOWN_CASE / UNKNOWN_RULE / INVALID_REFERENCE: Check case, rule, and reference keys and their owning option.
- UNKNOWN_SLOT / UNKNOWN_ROUTE / UNKNOWN_LAYOUT: Check routes, layouts, and Slot declarations; add elements only to existing locations.
- FEATURE_ORDER_INVALID: feature({ order }) must be a finite number; omit it for natural folder-name order. NaN, Infinity and strings are invalid.
- UNKNOWN_PICK: pick must be an option filename under this feature's options/.
- NOT_PICKED: The feature has no picked option and will not publish. Compare options, then set feature.pick to the chosen filename.
- ROUTE_EXISTS: An option route duplicates an existing route. Use on to add elements, or choose a new route.
- BAD_ROUTE: The route does not start with /. Use an absolute static product route.
- DUPLICATE_ELEMENT: Duplicate element ids within a stage. Change only conflicting ids and update references.
- CAPTION_TOO_LONG: Shorten the caption to about 24 units: CJK characters count as 1 each, all others as 0.5; whitespace is ignored. One thing per step; move long content to an explanation layer. See demo.
- EXPLAIN_TOO_LONG: Shorten the explain note to about 48 units, using the same CJK 1 / other 0.5 calculation. Put detailed rationale in a separate explanation layer. See demo.
- SAY_TOO_LONG / NARRATE_TOO_LONG (warning): a say() or narrate() line over about 80 units (about 10 seconds aloud). Autoplay waits until it is read; say less or split the step.
- SAY_EMPTY / NARRATE_EMPTY: say() needs the character's words, narrate() the narrator's. Remove it to fall back to the caption.
- VOICE_CONFIG_INVALID: config({ voice }) takes { profile?, narrator?, roles?: { roleKey: 'voice' }, locales?: { ja: { narrator?, roles? } } } with non-empty strings. API keys never go in the config.
- LOCALES_INVALID / LOCALES_UNDECLARED: config({ locales }) lists supported languages once each, source language first; every locales/<lang>.json must be listed there and must not be the source language. LOCALE_FILE_INVALID: the file must be one JSON object of "source text": "translation" strings.
- I18N_MISSING / I18N_STALE / I18N_UNUSED (warnings): texts with no translation (viewers see the source text), a source text that changed (the closest old entry is shown: rename the key and update the translation), entries nothing uses. npx joplo i18n add <lang> adds the missing keys.
- DESCRIPTION_TOO_LONG: flow({ description }) is the scenario cover sentence; keep it within 30 units, one sentence saying what this scenario shows. See story.
- CARD_TEXT_TOO_LONG (info): a transition card's sub is over 48 units, a point over 24, or more than 4 points. Keep one sentence and a few short points; move details into steps.
- SCENARIO_TOO_LONG (info): the scenario plays over 90 s at 1×. One scenario tells one thing: split it (happy path, then each recovery) or branch with fork(). npx joplo outline shows the pacing.
- HAPPY_PATH_ONLY (info): every case is a main-flow case and every scenario succeeds. Ask about input, permission, async, and lifecycle cases (see cases), then add an error-and-recovery scenario. Do not invent behavior. Explainers and other content whose chapters are all main-flow can ignore it (see content).
- ROLE_UNKNOWN: A layer or card role is not in feature.roles. Declare roles as { key: role('Name') }; see demo.
- ICON_UNKNOWN: A layer icon is not a preset. Use one of window, browser, mobile, desktop, terminal, chat, agent, server, data, email, doc, flow; see demo.
- FORK_UNKNOWN: fork must target another scenario key in the same option; it cannot reference itself.
- MARK_UNKNOWN: The mark target is absent from this step's route stage (after go() and back() in earlier steps) or, with layers, from every layer. Check the element id; currently hidden targets are valid references.
- SHOT_UNKNOWN: The shot target is absent from this step's stage and all layers. Check its id and layer; see demo.
- FOCUS_UNKNOWN / CALLOUT_EMPTY / CALLOUT_SIDE_INVALID / HOLD_INVALID: spotlight, highlight, numbered, callout need existing element ids (in a layer, or on this step's route stage); callout needs one short sentence and side top/right/bottom/left; hold takes 0.5–30 seconds. See focus.
- FOCUS_OFF_LAYER (warning): a spotlight / highlight / numbered / callout / mark target is not in the layer the director shows after this step, so nobody sees it. Add shot('<id>') to switch there, or point at an element in the shown layer. See focus.
- FOCUS_CONFLICT (warning): the step's shot frames one thing while a cue points outside it. Point both at the same thing, add the id to the shot, or split the step.
- CALLOUT_TOO_LONG (warning): callout text over about 24 units (same count as captions). Say the reason in a few words; move the rest to explain().
- FOCUS_IDLE (info): three or more system steps in a row change nothing on stage. Merge them, or show what happens (set() visible state, highlight, callout, shot).
- INVALID_REDACT / AUTOFOCUS_INVALID: redact takes true/false or a condition (redact={not($.ui.revealed)}); config({ autoFocus }) takes true or false.
- FROM_UNKNOWN / FROM_CYCLE / FROM_FAILED: from must name another scenario key in the same option, the dependency must not loop, and the preceding scenario must replay successfully. Fix that scenario first.
- FROM_WITH_START: from already determines the starting route; remove start or start a separate story.
- LAYER_UNKNOWN: Invalid layer key, missing content, or flow({ layer }) names no declared layer. Use letters/digits/underscores/hyphens, do not start with @, and provide nonempty JSX.
- Every node belongs to a domain group; 2–6 groups, ~3–15 nodes per diagram. One group around everything says nothing (check reports PLUGIN_UNGROUPED).
Read the relevant installed plugin skill for the visual component, its props and recovery rules.
- Node kind: client, service, model, database, queue, storage, external, tool, user. description says the responsibility in a few words; edge label says what flows.
Read the relevant installed plugin skill for the visual component, its props and recovery rules.
- TRACE_AMBIGUOUS: Multiple candidate edges or messages between two nodes. Use the specific edge / message id in trace.
- UNKNOWN_PLUGIN_NODE: An edge, transition, or message endpoint is not a node / group / state / participant id in the same diagram. Correct the endpoint ids.
- UNKNOWN_PLUGIN_GROUP / PLUGIN_GROUP_CONFLICT / PLUGIN_GROUP_CYCLE: group="…" names a missing group, disagrees with the group the element is nested in, or makes groups contain each other. Use nesting or group=, not both. See diagram.
- PLUGIN_EDGE_INTO_OWN_GROUP: An edge connects an element to a group that contains it. Connect to an element inside, or to another group.
Read the relevant installed plugin skill for the visual component, its props and recovery rules.
Read the relevant installed plugin skill for the visual component, its props and recovery rules.
- PLUGIN_LAYOUT_FAILED (warning): The automatic layout failed and the diagram shows a simple grid. Check its edges and groups; report it if they look right.
- THEME_UNKNOWN: config({ theme }) names neither a built-in nor themes/<name>.css. Use a built-in or add that CSS file; see Write a theme in demo.
- ELEMENT_PROP: A component prop contains JSX. Use strings for icons, such as leftSection="+", and children for content.
- ASSUMPTION_CONFIRMED: Keep AI assumptions `pending`. After user confirmation, record the actual origin; do not change only status.
- UNBOUND_INTERACTIVE: see the section below.
- INVALID_CONDITION: when got a plain boolean, number, or string (when={!x}, when={mode === 'code'}). Use a condition such as when={eq($.ui.mode, 'code')}, or render conditionally in your code: {flag && <X/>}. See authoring.
- DISABLED_WITHOUT_REASON: Add disabledReason explaining why the element cannot be used: a string, disabledReason="Only admins can invite", or a binding, disabledReason={$.ui.sendHint}.
Read the relevant installed plugin skill for the visual component, its props and recovery rules.
Read the relevant installed plugin skill for the visual component, its props and recovery rules.
- INVALID_DISABLED_REASON: disabledReason got a number, condition, or other value. Use a string or a whole-value binding; for text that changes, set() it into state and bind it.
- OUTCOME_MISMATCH: flow({ outcome }) and done(…, outcome) disagree; the badge uses flow's. Make them agree (cancelled corresponds to other).
- CASE_NOT_COVERED: Add a scenario or declare coverage truthfully. Ask about missing behavior first. The message names high priority and the case's expected result, which is what the new scenario must end on.
- EXPRESSED_WITHOUT_SCENARIO / COVERAGE_WITHOUT_REASON: Add a scenario or a reason for `not_applicable`/`excluded`.
- RULE_ELEMENT_NOT_FOUND: Check rule.elements against element ids in the related option stages.
- PENDING_AI_ASSUMPTION: Ask the user to confirm; keep `pending` until then.
- EMPTY_SCENARIO: Decide whether actions are needed. Zero steps are valid for showing initial states such as permissions.
- MISSING_TARGET / MISSING_SCENE: Check step targets, the start route, and the stage after go.
- TARGET_HIDDEN / TARGET_DISABLED: Check initial state and preceding set effects so the action is executable at that step.
- NOT_INTERACTIVE / NOT_A_FIELD: Choose the right component or action; input actions require value components.
- ALREADY_COMPLETED / NOTHING_TO_GO_BACK: Fix steps after done, or add route navigation before back.
- LOAD_FAILED / WRONG_EXPORT / INVALID_SCHEMA: Follow the message to fix imports, default exports, or field structure.

## UNBOUND_INTERACTIVE: is every interaction expressed?
Read the relevant installed plugin skill for the visual component, its props and recovery rules.
1. Show it: add a step to a scenario, .click('send') or .type('email', 'ana@example.com'). Inputs that only display a value need a .type step too.
2. It cannot be used here: disabled={true} with disabledReason="Only admins can invite". A conditional disabled does not count; it still needs a step for the enabled state.
3. Out of scope for this prototype: add unmodeled (note="…" optional). Clicking it shows "This demo does not cover …".
Do not add fake steps just to silence the warning.

When the user points to a stage element, read selection first for its exact location.

Related topics: authoring, plugins, selection, diff
<!-- joplo-skill 0.3.0 sha256:07f1f6ddcdd89e9c869f0c66d6d676ec12a9009ae73696f30d104124242a2ae0 -->
