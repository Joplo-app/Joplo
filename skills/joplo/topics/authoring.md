# Joplo authoring: authoring

Joplo compiles trusted TS/TSX into deterministic scenes and schedules their playback. It does not supply a component library or execute real backend requests. Use components from the project's explicitly installed plugins; read their skills before writing view trees.

## Start from the project
1. Run npx joplo init <dir>, install its dependencies, then npx joplo skill install. The starter supplies its own plugin choices; a custom project may choose different ones.
2. Read the installed engine skill and .claude/skills/joplo-plugins/SKILL.md. Read each relevant plugin's entry and component/recipe topics. npx joplo skill lists what this config enables.
3. Create one feature, one option and a runnable scenario. Run check, inspect the rendered frames, then test the real inputs.
4. Required before handing a development round to the user: read npx joplo skill review and start npx joplo feedback watch [dir] --local --follow --json. A running board alone does not receive feedback for the agent.

## Model and files
- joplo.config.ts exports config({ name, plugins, layout?, home?, theme?, autoFocus?, voice?, locales? }). plugins is explicit; installation alone does not enable a plugin.
- layouts/<id>.tsx exports layout(tree). Outlet places the current page; Slot declares a named insertion point. Those are engine composition primitives.
- routes/**/page.tsx exports page({ title, layout?, viewport? }, tree). The directory determines its route. Set layout: false to opt out of the shared layout.
- features/<id>/feature.ts exports feature({ name, goal, cases, order?, roles?, constraints?, rules?, questions?, pick? }). Finite numeric order sorts first; ties and omitted order use natural folder order. Do not number names by hand.
- features/<id>/options/<key>.tsx exports option({ name, idea, focus?, tradeoffs?, on?, routes?, layers?, state?, free?, rules?, questions?, coverage?, scenarios }). Keep stable feature/option ids when revising a design.
- on adds a tree to a route's slot; routes adds an option-specific page; layers defines independently framed views. Obtain each tree from components documented by installed plugins.
- state has ui, data and inputs namespaces. All effects and bindings use these paths. Source files are authoritative; do not hand-edit compiled IR.
- Custom author functions may return reusable trees; author modules execute locally. Load only trusted projects. Event handlers/function props are not prototype business logic.

## Engine-only example
Here buildScreen is project code using the installed plugins' components. It must return enabled elements with ids email, send and result; read those plugin skills for the actual view code.
```ts
import { $, option, flow, page, set, done } from '@joplo-app/kit';
import { buildScreen } from './screen';
export default option({
  name: 'A · Recover access', idea: 'A retry keeps the entered address',
  routes: { '/reset': page({ title: 'Reset password' }, buildScreen()) },
  state: { ui: { sending: false, error: '', sent: false } },
  scenarios: {
    retry: flow('Correct an address and retry', { cases: ['unknown_email'], start: '/reset' })
      .type('email', 'ana@example.invalid').click('send', set($.ui.sending, true))
      .system('No account', set($.ui.sending, false), set($.ui.error, 'Check the address'))
      .type('email', 'ana@example.com', set($.ui.error, ''))
      .click('send', set($.ui.sending, true))
      .system('Accepted', set($.ui.sending, false), set($.ui.sent, true), done('Link sent')),
  },
});
```
Declare both success and recovery cases in the feature. View code belongs to the chosen plugin; the engine example defines state and behavior only.

## Steps and effects
- flow(name, { cases?, start?, state?, from?, layer?, description?, expected?, mock?, outcome? }). state overrides option state. description is the cover sentence; expected describes what the viewer should observe.
- from: 'previousKey' continues that scenario's final route, ui/data/inputs and director layer. Validate steps and automatic captions against that ending page; dependency order does not change chapter order. Do not combine from with start. layer overrides the initial director layer.
- .click(id), .type(id, value), .select(id, value), .toggle(id, boolean), .press(keys), .back(), .drag(id, destination), .hover(id, ms), .scroll(id, destination), .act(pluginAction, id, data). Read demo and the action-owning plugin skill for recognition requirements.
- .system('event', ...effects) models a response, not a real request. .card() creates a transition. Strings are captions; other arguments are effects. Step arguments and card accept effect arrays.
- set(path, value) replaces; push(path, value) appends; patch(path, object) expands to sets (nested objects replace, not deep-merge). go(route) navigates in this option; back returns to the prior route.
- toast(text), toast.success/error/info(text) show an engine message. done(result, outcome?) ends a scenario; outcomes success/failure/cancelled must agree with flow's badge. uses(ruleKey, ...) links rules; it is an effect, not a flow method.
- free.click/type/select/toggle/drag/hover/scroll/act in option.free declare local reactions. Only set, push and toast are local effects; navigation, completion and media remain scripted. Play/jump/scenario/reset discard the local layer.

## Bindings, rules and reuse
- $.ui.x / $.data.x / $.inputs.id are whole-value bindings. Expressions are not reevaluated. Props supported by a plugin may bind to these values; read that plugin's value and visibility rules.
- when takes a binding or not/eq/neq/empty/notEmpty/oneOf/and/or. A JS boolean/expression is evaluated once and produces INVALID_CONDITION. For author-time conditions, return one tree or another in ordinary TS; for playback-time changes, use state and effects.
- disabled takes a boolean or condition; disabledReason is text or a whole-value binding. Use meaningful reasons. Plugin visibility, inheritance and native behavior are declarative traits.
- rule(text, { origin, status, cases?, elements? }): origins user/project_material/ai_assumption/code_observed/feedback; statuses pending/confirmed/conflict/out_of_scope. Never mark an AI assumption confirmed without evidence.
- question(text, { severity?, refs? }) records unresolved decisions. option focus/tradeoffs explain a real choice, stay out of publish/review builds, and do not manufacture approval.
- For self-design use the existing project, stable feature ids, real alternatives and visible scenarios. Reconstruct history only with sources and clear labels; do not publish private review manifests to expose the process.

After editing, run check and actual playback. Use selection for the user's chosen element. Install skills again after changing config.plugins so agents discover the same vocabulary the compiler uses.

Related topics: story, plugins, cases, demo, check
<!-- joplo-skill 0.2.18 sha256:ea1b9e147658320db652e1dbf343dcc8950996078dfce1ecc9c8ce7480e733f7 -->
