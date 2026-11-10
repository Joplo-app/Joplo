# Joplo authoring: authoring

Joplo turns trusted TS/TSX into playable, interactive shows; use them to compare feature options, explain how something runs, or show what happened. Compilation produces deterministic scenes and schedules their playback. It does not supply a component library or execute real backend requests. Use components from the project's explicitly installed plugins; read their skills before writing view trees.

## Works → slices → steps
A project is a portfolio of works. A work combines its stage, initial state and slices; each slice is a sequence of steps. Every work has a cover and appears on the home page. Capabilities compose:
- Feature review groups alternative works (options), shared cases, coverage, rules, questions and a pick. Feature is a review layer over works: an alternative work is called an option in the UI. Use feature() + work() when comparing solutions or making design decisions; work() is the only work entry point.
- Sequencing is independent for flow() slices, linear for chapter() slices. Use work() + chapter() for a standalone explainer, tutorial, news show or product history. Standalone and feature-attached works can coexist in one project; chapter() works in either location.
- draft: true on a standalone work keeps it available locally and excludes it from build/share. For a remake create another work and mark the old work as draft.
- Publish one entry with npx joplo build --work <key> or npx joplo share --work <key> plus the explicitly authorized publication flags. A standalone work needs no pick; a feature key selects its picked option (all options in the review version).

### Choose a starting template
Use npx joplo init <dir> (or --template starter) to compare feature options. Use npx joplo init <dir> --template work for one show people can play, pause and try: it contains works/explainer.tsx with two continuing chapters, no feature or placeholder routes, and only the UI plugin. Edit a visible text literal and save to change the picture; pause and edit the bound input to explore locally, then Play or Reset to restore the script. No credentials or generated assets are required. You can also add works/<key>.tsx manually to an existing project.

Bare --template values without / or a backslash, not starting with . or github:, must match ^[a-z0-9][a-z0-9-]*$ and select same-named directories from github:Joplo-app/joplo-templates/<name> (default name starter). Ref is omitted to use HEAD, the repository default branch, without a version tag. New template names need no CLI release; a same-named local directory never overrides them (use --template ./work). Missing directories report that the template is absent and link to https://github.com/Joplo-app/joplo-templates; invalid names fail before downloading. Explicit local paths and github:owner/repo[/subdir][#ref] retain their meaning. Source and published CLIs use the same remote source. Templates are maintained manually, independently of releases, for the latest published CLI; older CLIs are not guaranteed. Init replaces version placeholders with its own exact version, installs engine skills and preserves any bundled plugin guides; missing guides are allowed. After installing dependencies, run npx joplo skill install and npx joplo check before npx joplo dev. Download/validation errors leave no partial project; check the repository/ref or use an explicit local template path offline. Downloads fail after 30 seconds without data, not after a fixed total duration; size and unsafe-path limits still apply.

### Minimal standalone work
buildStage() is your local view tree made from explicitly enabled plugin elements; it displays the work state at $.ui.status. Read the installed plugin skill for its components. Keep package.json type: module and the starter's JSX tsconfig (jsx: react-jsxdev, jsxImportSource: @joplo-app/kit). stage/layers needs no routes/ directory. To reuse product pages, explicitly supply on or routes.
```tsx
// works/explainer.tsx
import { $, work, chapter, narrate, set } from '@joplo-app/kit';
import { buildStage } from '../shared/stage';
export default work({
  title: 'How the queue works', summary: 'Follow one request through a busy queue',
  state: { ui: { status: 'Ready' } },
  stage: buildStage(),
  scenarios: {
    arrival: chapter('A request arrives', { expected: 'Understand why requests wait' })
      .system('Arrive', set($.ui.status, 'Queued'), narrate('A request joins the queue.')),
    finish: chapter('The worker responds').system('Respond', set($.ui.status, 'Complete'), narrate('The worker handles the request.')),
  },
});
```
chapter() continues the previous chapter by declaration order; the first starts from the initial state. Only exceptions use from: null (restart) or from: 'sliceKey' (another predecessor). Do not mix flow() and chapter() in one work, write cases/uses() in standalone works, or number titles manually: the UI and outline number chapters automatically. Empty scenarios: {} is a valid local work in progress; it is skipped in publish/review, and explicit build --work selection fails until a slice is added.

### Migrating an existing piece
- A compiler migration does not update code blocks or paths inside strings: search displayed file trees, terminal examples and source snippets too. Keep each example on the current work API, identify historical reconstructions explicitly, and update locale keys with changed source text. Compare check diagnostic counts before and after; a text-only update should not add missing/stale translations.
- Before changing files, freeze the old dev IR. Compare every step, compiled plugin snapshot and every stateAt position with the migrated work. Renaming flow() to chapter() alone does not prove continuous state or audiovisual equivalence; review motion and sound as well.
- Preserve independent starts: if an old chapter began from the initial state, give the new chapter from: null. Otherwise chapter two onward inherits ui/data/inputs and music from its predecessor. Keep default continuation only where the story really continues.
- Move feature.roles audience descriptions into work.audience; preserve actual role() speakers. Keep say() role keys and config.voice.roles aligned so dialogue still uses the intended voices.
- Rename project helper functions already called chapter before importing the kit's chapter builder; a name collision is not a compiler-model problem.
- Remove manual numbering only from chapter titles. The same source string may still appear in a card or caption: use i18n checks to decide which translation keys remain in use, and check for stale/missing entries after edits.
- Read a route before deleting it. A page containing only Slot or an empty container can go when the work uses stage/layers; preserve real screen content with explicit on reuse or the work's routes.
- Verify draft exclusion in the built files: search the complete artifact text for a full sentence unique to the old draft, chosen so it is not a substring of current copy. Absence of a card in the UI alone does not prove the old content stayed out of publication.

### Minimal feature review
Use the same cases to compare alternative designs; each alternative is a work in a separate file. buildStage() is the same project helper described above. This minimal feature has one work; add another only for a real alternative. An omitted pick or explicit pick: null compiles to null: local review still works, ordinary publication omits that feature.
```ts
// features/queue/feature.ts
import { feature } from '@joplo-app/kit';
export default feature({ name: 'Queue', goal: 'Keep waiting understandable',
  cases: { waiting: { title: 'A request waits', expected: 'See that it is queued' } }, pick: 'a' });
```
```tsx
// features/queue/works/a.tsx
import { $, work, flow, narrate, set } from '@joplo-app/kit';
import { buildStage } from '../../../shared/stage';
export default work({ title: 'A · Visible queue', summary: 'Explain the wait',
  focus: 'Make the queue state visible', tradeoffs: ['No position estimate'],
  state: { ui: { status: 'Ready' } },
  stage: buildStage(),
  scenarios: { waiting: flow('Request waits', { cases: ['waiting'] })
    .system('Queued', set($.ui.status, 'Queued'), narrate('The request is waiting.')) },
});
```
Success: check reports 0 errors; outline --work explainer shows the intended slices and estimated duration, with automatic chapter numbers. Inspect each chapter with render --scenario-id <id-from-outline> --sheet --out board.png; review motion using --film --chain --out film.png and actual playback before claiming it looks right. Standalone slice ids have two segments (explainer.arrival); feature-attached slice ids have three (queue.a.waiting). Copy ids from outline --format json for rendering, deep links and feedback context. Outline JSON groups works under entries[].works; feedback events identify them with workId. Human-facing feature alternatives are still called options. For the standalone example: render --scenario-id explainer.arrival; the short scenario link is #/s/explainer.arrival; feedback list --local --work explainer --json filters by the work key, and feedback context.scenarioId uses explainer.arrival.

## Start from the project
1. Run npx joplo init <dir> for feature comparisons or npx joplo init <dir> --template work for a standalone show, then install dependencies. Both download from the independent template repository default branch and install the same engine skills and AGENTS.md block. Any bundled plugin guides are preserved before dependencies exist; missing guides are allowed. After installation, npx joplo skill install generates/verifies them against config.plugins. Use --template ./local-source for offline input. Inside the monorepo use workspace protocol for local dependencies; outside it, link local dependencies for development or keep pinned published versions. A custom project may choose different plugins.
2. Read the installed engine skill and .claude/skills/joplo-plugins/SKILL.md. Read each relevant plugin's entry and component/recipe topics. npx joplo skill lists what this config enables.
3. Create one standalone work and chapter, or one feature, option and runnable scenario for design review. Run check, inspect the rendered frames, then test the real inputs. For a short film or explainer that should feel like a video, also run the motion review in npx joplo skill demo ("Make it play like a film") — static frames cannot show hard cuts or frozen pictures.
4. Required before handing a development round to the user: read npx joplo skill review and start npx joplo feedback watch [dir] --local --follow --json. A running board alone does not receive feedback for the agent.

## Binary assets
- asset('./file.glb') embeds a self-contained GLB; MP3/WAV/OGG/M4A/FLAC are supported too. Paths are relative to the calling source file. Images retain a 2 MB limit; binary files have a 50 MB limit. Dev serves binary bytes by content hash; npx joplo build writes every asset as its own file (assets/<hash>.<ext>), so the built site must be opened over HTTP: npx joplo preview, a share, or any static server. Double-clicking index.html (file://) is not supported.
- Before reviewing a material folder, run npx joplo assets . --usage --scan photos --format json (repeat --scan for explicit project-relative folders; optional --work <exact work id> or --scenario <id> includes continuing predecessors). This is read-only: it loads author modules, observes actual asset() evaluations and declared plugin resources, and hashes explicitly scanned files; it does not build, render, generate resources, spend, upload or delete. As with check/build, trusted author modules execute while loading.
- Read asset reports as evidence, not cleanup advice. scope.authorReferences is whole-loaded-project, including drafts; contextual references have workId/scenarioId/layer/elementId/source and inSelectedScope. A scene-level reference is not proof of a particular step. Declared binaries are matched across dev/publish compiles by plugin/compiler/input identity, never by coincidental sequential IDs or ordinary prose strings; a draft-only selection has no packaged assets. publication=included-in-selected-ir means the selected publish IR contains its bytes/resource id, not that a completed build has packed it. Draft-only or excluded content can still have author references. sampledVisibility is always unknown: no frames are sampled and conditions/camera/plugin internals are not resolved.
- not-found-in-loaded-model only means no observed reference in that evaluation; never rename it unused. Dynamic paths, imported helpers, unexecuted branches, cached modules or unevaluated plugin compilers remain unknown. Identical-byte files share content matches, so contentMatch marks ambiguous provenance rather than choosing one file. No author/source/year/license metadata is inferred, and a report is not a copyright decision. Symlinks are skipped and scans cannot escape the project; only scan folders the user intended. If loading/compilation fails, fix check errors and rerun; never generate missing paid resources merely to fill a report.

- Prefer existing CC0 assets and public-domain reference images, then use a generation plugin to fill gaps in an original style. Read the enabled plugin's skill before generation. Commit persistent artifacts and metadata; never put API keys in project source.
- npx joplo resources --dry-run lists missing persistent resources and estimated credits. Interactive resources confirms each item; unattended generation requires --allow-spend. check/build/render remain offline for these artifacts. Missing or corrupt output gives diagnostics, not an implicit paid retry. Keep large GLB files below 5 MB where possible and inspect MODEL_SIZE warnings before sharing.

## Structure and files
- joplo.config.ts exports config({ name, plugins, layout?, home?, theme?, autoFocus?, voice?, locales?, watch? }). plugins is explicit; installation alone does not enable a plugin.
- Dev watch exclusions: config({ watch: { ignore: ['exports/frames', '.coord'] } }) excludes project-relative output files/directories and their descendants from recompilation and review invalidation. Paths are literal, not globs; do not exclude real source or referenced assets. Existing .joplo/dist/node_modules/.git exclusions remain. Restart the dev board after changing this configuration; each project has its own exclusions. Ordinary image assets still trigger updates.
- layouts/<id>.tsx exports layout(tree). Outlet places the current page; Slot declares a named insertion point. Those are engine composition primitives.
- routes/**/page.tsx exports page({ title, layout?, viewport? }, tree). The directory determines its route. Set layout: false to opt out of the shared layout.
- works/<key>.tsx (or .ts) exports work({ title, summary, scenarios, stage? | layers?, viewport?, on?, routes?, audience?, roles?, state?, free?, draft?, order? }). The filename is the entry key and must not collide with a feature folder.
- features/<id>/feature.ts exports feature({ name, goal, cases, order?, roles?, constraints?, rules?, questions?, pick? }). Finite numeric order sorts first; ties and omitted order use natural folder order. Do not number names by hand.
- features/<id>/works/<key>.tsx exports work({ title, summary, focus?, tradeoffs?, coverage?, rules?, questions?, stage? | layers?, viewport?, on?, routes?, state?, free?, scenarios }). Keep stable feature/work ids when revising a design.
- Field placement checks explicit presence, including roles: {}, draft: false and order: 0. focus/tradeoffs/coverage/rules/questions, slice cases and step uses() are feature-only (WORK_FEATURE_ONLY in standalone works). audience/roles/draft/order are standalone-only (WORK_STANDALONE_ONLY under a feature); declare shared roles on feature(). title/summary/stage/layers/viewport/on/routes/state/free/scenarios work in both locations (WORK_INVALID for invalid values). viewport applies only to stage.
- on adds a tree to a route's slot; routes adds an option-specific page; layers defines independently framed views. Obtain each tree from components documented by installed plugins.
- state has ui, data and inputs namespaces. All effects and bindings use these paths. Source files are authoritative; do not hand-edit compiled IR.
- Custom author functions may return reusable trees; author modules execute locally. Load only trusted projects. Event handlers/function props are not prototype business logic.

For tools reading IR from @joplo-app/core, use entriesOf/entryOf for entries, featuresOf for real features in entryIds order, rolesOf(project, workId) for shared or standalone roles, sliceKey(scenario) for its author key, and visibleRoutes(project) for paths without the internal blank page. Follow scenario.workId and the projection; never split ids to infer ownership.

## Engine-only example
In features/<f>/works/<key>.tsx, buildScreen is project code using the installed plugins' components. It must return enabled elements with ids email, send and result; read those plugin skills for the actual view code.
```ts
import { $, work, flow, page, set, done } from '@joplo-app/kit';
import { buildScreen } from './screen';
export default work({
  title: 'A · Recover access', summary: 'A retry keeps the entered address',
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
- chapter(name, options) uses the same slice options as flow(); its default predecessor is the previous chapter, with from: null to restart. Use all chapter() or all flow() in one work.
- flow(name, { cases?, start?, state?, from?, autoplay?, layer?, description?, expected?, mock?, outcome?, actionEntry? }). state overrides work state. description is the cover sentence; expected describes what the viewer should observe.
- autoplay: false keeps an optional scenario selectable through a fork, chapter list or deep link, but skips it in sequential published-site playback. Playing that scenario manually stops at its end. Default/true preserves declaration order.
- from: 'previousKey' continues that scenario's final route, ui/data/inputs and director layer. Validate steps and automatic captions against that ending page; dependency order does not change chapter order. Do not combine from with start. layer overrides the initial director layer.
- .click(id), .type(id, value), .select(id, value), .toggle(id, boolean), .press(keys), .back(), .drag(id, destination), .hover(id, ms), .scroll(id, destination), .act(pluginAction, id, data). Read demo and the action-owning plugin skill for recognition requirements.
- .system('event', ...effects) models a response, not a real request. .card() creates a transition. Strings are captions; other arguments are effects. Step arguments and card accept effect arrays.
- set(path, value) replaces; push(path, value) appends; patch(path, object) expands to sets (nested objects replace, not deep-merge). go(route) navigates in this work; back returns to the prior route.
- stream(path, text, { pace? }) writes like set, but during playback the bound text appears character by character (a model answering, speech being transcribed); jumps, screenshots and deep links show the full text. When the new value starts with the old one, only the added characters stream, so write each step's full value (previous text + the new words) rather than juggling separate fragments. pace: 'voice' spreads the new characters over this step's narrate()/say() line, so the words land as they are spoken; the default pace is model-output speed. Only a plain text child bound to the path streams ({$.ui.reply}); stream values are translated like other on-screen text, so keep every language's successive values prefix-consistent.
- toast(text), toast.success/error/info(text) show an engine message. done(result, outcome?) ends a scenario; outcomes success/failure/cancelled must agree with flow's badge. uses(ruleKey, ...) links rules; it is an effect, not a flow method.
- free.click/type/select/toggle/drag/hover/scroll/act in work.free declare local reactions. free is a named object, not an array: free: { open: free.click('open', set($.ui.open, true)) }. Only set, push and toast are local effects; navigation, completion and media remain scripted. Play/jump/scenario/reset discard the local layer.

## Reusable effect factories
Step arguments and card effects accept nested arrays, flattened in order. Compose helpers that return patch() plus other effects instead of copying transition state. Only done() completes a scenario; unknown effect objects report EFFECT_INVALID.
```ts
const arrive = () => [patch($.ui, { screen: 'inbox', sent: false }), [hold(4)]];
flow('Inbox').system('Arrive', arrive(), 'The inbox opens');
```
For a long story use chapter() to inherit the previous ending by default; from is an explicit exception. An action-driven navigation entry can also declare actionEntry: 'after'; read demo for its confirmation and replay boundary.

## Bindings, rules and reuse
- Keep scripted shared state explicit: .type('field', 'value', set($.ui.message, 'value')) records the input and updates the ui value used elsewhere on stage. Native local binding synchronization during audience exploration does not replace scripted effects. Verify both the input and the text beside it at that scripted step, then try a non-script value while paused.
- $.ui.x / $.data.x / $.inputs.id are whole-value bindings. Expressions are not reevaluated. Props supported by a plugin may bind to these values; read that plugin's value and visibility rules.
- when takes a binding or not/eq/neq/empty/notEmpty/oneOf/and/or. A JS boolean/expression is evaluated once and produces INVALID_CONDITION. For author-time conditions, return one tree or another in ordinary TS; for playback-time changes, use state and effects.
- disabled takes a boolean or condition; disabledReason is text or a whole-value binding. Use meaningful reasons. Plugin visibility, inheritance and native behavior are declarative traits.
- rule(text, { origin, status, cases?, elements? }): origins user/project_material/ai_assumption/code_observed/feedback; statuses pending/confirmed/conflict/out_of_scope. Never mark an AI assumption confirmed without evidence.
- question(text, { severity?, refs? }) records unresolved decisions. Feature-attached work focus/tradeoffs explain a real choice, stay out of publish/review builds, and do not manufacture approval.
- For self-design use the existing project, stable feature ids, real alternatives and visible scenarios. Reconstruct history only with sources and clear labels; do not publish private review manifests to expose the process.

After editing, run check and actual playback. Use selection for the user's chosen element. Install skills again after changing config.plugins so agents discover the same vocabulary the compiler uses.

Related topics: story, plugins, cases, demo, check
<!-- joplo-skill 0.7.0 sha256:7eea75a0a6e91e4a45c95610462e47d79aac37ac3589cdbc9e9236d763d00bb5 -->
