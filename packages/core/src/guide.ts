import { COMPONENT_TYPES, GATED_CONTAINERS, INTERACTIVE_TYPES, JOPLO_PROPS, VALUE_TYPES } from './catalog.ts';
import { JoploError } from './result.ts';
import { LAYER_ICONS } from './schema.ts';

export const SKILL_TOPICS = [
  { name: 'authoring', description: 'Directory conventions; page / layout / option / flow syntax' },
  { name: 'demo', description: 'Layers, shots, traces, and captions for clear demos' },
  { name: 'components', description: 'Component catalog and props for this version' },
  { name: 'cases', description: 'Case dimensions: ask the user before starting' },
  { name: 'check', description: 'Read diagnostics and fix the indicated file and line' },
  { name: 'selection', description: 'Edit only the element selected by the user in the board' },
  { name: 'publish', description: 'pick, build, and static site deployment' },
] as const;
export type SkillTopic = (typeof SKILL_TOPICS)[number]['name'];

const related: Record<SkillTopic, readonly SkillTopic[]> = {
  authoring: ['demo', 'components', 'cases', 'check', 'selection', 'publish'],
  demo: ['authoring', 'components', 'check', 'publish'],
  components: ['authoring', 'demo', 'check'],
  cases: ['authoring', 'check'],
  check: ['authoring', 'selection'],
  selection: ['check', 'authoring'],
  publish: ['demo', 'authoring', 'check'],
};

/** CLI 传入其 package.json 版本；行数来自同一次生成的主题正文。 */
export function skillIndex(version: string, docs?: Readonly<Record<string, string>> | null): string {
  return [
    `Joplo ${version} · Agent usage (read on demand)`,
    ...SKILL_TOPICS.map(t => `  ${t.name.padEnd(11)} ${t.description}  ${skillTopic(t.name, docs).trimEnd().split('\n').length} lines`),
    'Usage: npx joplo skill <topic>    Install for agents: npx joplo skill install',
    '',
  ].join('\n');
}

export function nearestSkillTopic(input: string): SkillTopic {
  const value = input.toLowerCase();
  return [...SKILL_TOPICS].sort((a, b) => distance(value, a.name) - distance(value, b.name))[0]!.name;
}

/** docs 是组件目录提供的可选一行提示，不在这里维护另一份组件或属性清单。 */
export function skillTopic(topic: string, docs?: Readonly<Record<string, string>> | null): string {
  if (!SKILL_TOPICS.some(t => t.name === topic)) throw new JoploError('USAGE', `Unknown topic "${topic}". Did you mean ${nearestSkillTopic(String(topic))}?\nRun npx joplo skill to list all topics.`);
  const name = topic as SkillTopic;
  const body = name === 'components' ? componentTopic(docs ?? undefined) : CONTENT[name];
  return `${body.trimEnd()}\n\nRelated topics: ${related[name].join(', ')}\n`;
}

/** 兼容旧入口：与 joplo skill authoring 输出完全相同。 */
export function guide(): string { return skillTopic('authoring'); }

function componentTopic(docs: Readonly<Record<string, string>> = {}): string {
  const names = COMPONENT_TYPES.filter(name => !name.startsWith('#'));
  const listed = (set: ReadonlySet<string>) => names.filter(name => set.has(name)).join(', ');
  return [
    '# Joplo components: components',
    '',
    'Import components from @joplo-app/kit/ui. Names below come from the current compiler catalog; do not invent components.',
    'Prop hints follow names when available; otherwise only names are listed. Write HTML tags directly in JSX; do not import them from ui.',
    '',
    '## Component catalog',
    ...names.map(name => `- ${name}${Object.hasOwn(docs, name) && docs[name]?.trim() ? `: ${docs[name]!.replace(/\s+/g, ' ').trim()}` : ''}`),
    '',
    '## Behavior groups (from the catalog)',
    `- Interactive; require id and declared behavior: ${listed(INTERACTIVE_TYPES)}.`,
    `- Accept input; type/select/toggle write to inputs: ${listed(VALUE_TYPES)}.`,
    `- Containers whose expanded state controls child visibility: ${listed(GATED_CONTAINERS)}.`,
    '',
    `Joplo props: ${JOPLO_PROPS.join(', ')}; disabled is the component disable prop.`,
    'when controls visibility; disabledReason explains disabling; unmodeled marks behavior not modeled by this prototype; note is an authoring note.',
    'Interactive elements need a flow step, disabled=true with a reason, or explicit unmodeled.',
    'See authoring for bindings, conditions, and steps; check for component error fixes.',
  ].join('\n');
}

const CONTENT: Record<Exclude<SkillTopic, 'components'>, string> = {
  authoring: `# Joplo authoring: authoring

Describe designs in TS/TSX. Source files are authoritative; Git manages versions. The board and published site consume compiled IR.
Read only the topics needed, usually one or two at a time. See components for components, cases for questions before starting, and demo for organizing and presenting demos.

## Directory conventions
- joplo.config.ts: export default config({ name, layout: 'app', home: '/' }).
- layouts/app.tsx: export default layout(<AppShell header={{ height: 56 }} navbar={{ width: 240, breakpoint: 'sm' }}><AppShell.Navbar>…</AppShell.Navbar><AppShell.Main><Outlet/></AppShell.Main><Slot name="overlay"/></AppShell>).
- routes/page.tsx → /; routes/members/page.tsx → /members. Static routes only; no [id].
- features/<f>/feature.ts: feature goal, cases, shared rules, open questions, pick.
- features/<f>/options/<o>.tsx: one option, route additions, initial state, and scenarios.
- Organize reusable data or modules freely inside a feature directory; import them from the files above.
- Import data APIs from @joplo-app/kit and components from @joplo-app/kit/ui.
- tsconfig uses jsx: 'react-jsxdev', jsxImportSource: '@joplo-app/kit', allowImportingTsExtensions: true.

## Data APIs
- config({ name, description?, theme?: theme name (9 built-ins or themes/<name>.css; see demo), layout?, home? }).
- layout(tree); Outlet places the current page; <Slot name="actions"/> declares a slot for additions.
- page({ title, layout?: string|false, viewport?: 'desktop'|'mobile' }, tree). See demo for devices and stages.
- feature({ name, goal, cases, order?, roles?, constraints?, rules?, questions?, pick? }).
- Do not number feature names by hand; use finite numeric order. The compiler writes featureIds into IR (including publish): ascending order first, then natural folder-name order for ties or omitted values. All views read that list.
- option({ name, idea, on?, routes?, state?, rules?, questions?, coverage?, scenarios }).
- on: { '/members': { actions: <Button id="invite">Invite</Button> } }: add elements to a slot on an existing route.
- routes: { '/members/new': page({ title: 'New member' }, <Stack>…</Stack>) }: add a route for this option.
- state: { ui: { ready: false }, data: {}, inputs: {} }: initial option state.
- scenarios: { happy: flow('Success', { cases: ['happy'], start: '/members' }).click('invite', done('Completed')) }.
- flow options also accept state, description, expected, mock, outcome to override initial state or describe mock results.
- See cases for case and coverage declarations; publish for pick and publishing.

## flow: Put behavior in steps
- .click(id, ...args); .type(id, value, ...args); .select(id, value, ...args).
- .toggle(id, boolean, ...args); .back(...args); .system('Mock event', ...args).
- .press('⌘K', ...args) / .press('Enter'): a targetless user keyboard step. The default caption describes pressing ⌘K; effects work like ordinary steps.
- String args are optional captions; other args are effects. All methods are chainable.
- set($.ui.ready, true): replace state; push($.data.rows, row): append an array item.
- toast('Message') / toast.success/error/info('Message'): a message for the current step.
- go('/members'): change route within the current option; back returns to the previous route.
- done('Result', 'success'|'failure'|'cancelled'): end the scenario; default is success.
- uses('rule_key', ...): link rules from this option or feature.

## Bindings and conditions
- $.ui.x / $.data.x / $.inputs.x bind whole values; arbitrary expressions are not evaluated.
- when={$.ui.ready}; disabled={not($.ui.isAdmin)}.
- not(x), eq(x, value), neq(x, value), empty(x), notEmpty(x), oneOf(x, values), and(...xs), or(...xs).
- Overlays: <Modal id="dlg" opened={$.ui.open} title="…">; Drawer works the same way. Only opened controls visibility.

## Layout and responsiveness (Mantine names and props; no className)
- Use Stack / Group / SimpleGrid / Grid props: <Group justify="space-between">, <SimpleGrid cols={{ base: 1, md: 3 }}>.
- Use responsive objects { base, xs, sm, md, lg, xl }, or visibleFrom="sm" / hiddenFrom="sm". AppShell collapses navigation below navbar.breakpoint.
- Set input labels directly: <TextInput id="email" label="Email"/>. Auto captions use them.
- Stage height follows the window. Do not use fixed pixel heights for full-height layouts, which clip bottom inputs and buttons in short windows. See Full-height layout in demo.

## Rules and boundaries
- rule('Constraint', { origin?, status?, cases?: ['happy'], elements?: ['invite'] }).
- origin: user/project_material/ai_assumption/code_observed/feedback; default ai_assumption.
- status: \`pending\`/\`confirmed\`/\`conflict\`/\`out_of_scope\`; default \`pending\`.
- Never mark an AI assumption \`confirmed\`. Record origin/status truthfully after user confirmation.
- question('Open question', { severity?: 'blocker'|'major'|'minor', refs?: ['happy'] }).
- Do not write onClick or other function props. Reusable author components expand during collection; flow drives interaction.
- Author modules execute locally during loading/checking/building. Run only trusted projects.

After editing, run npx joplo check. View the board; use npx joplo selection to read the location selected by the user.
See check for diagnostic fixes and selection for editing only the selected location.`,
  demo: `# Joplo demos: demo

Tell one thing per step: separate viewpoints with independent layers, zoom into details with shots, and describe what happened with short captions.
See authoring for directories, state, and flow syntax. Import layer, shot, trace, explain from @joplo-app/kit.

## Layers are independent pages
- Declare layers in an option: layers: { client: layer('Client view', <ClientView/>), backend: layer('Backend flow', <Diagram>…</Diagram>) }.
- layer(title, <tree/>) owns a JSX tree, renders independently, and fills the stage; it is not a crop of one large page.
- Layers share ui / data / inputs. Switching layers does not change the step. Declaring layers makes the demo show these independent pages.
- No automatic overview layer. Declare overview: layer('Overview', <Overview/>) when needed.
- Put long notes in a separate explanation layer, such as why: layer('Design rationale', <Why/>), then switch to it with a shot.

## Shots and the director
- Write shot(...ids) in a step. Targets can be components, cards, buttons, or Diagram nodes, groups, and edges.
- Each id resolves in the layer containing it. The same id can affect multiple layers; the first shot determines the director layer.
- Example: .click('app_send', shot('msg_user'), shot('app', 'biz')) follows the client view first, then sets a backend shot.
- shot() restores the whole director layer. Without a shot, keep the previous one; a plain click can follow the layer containing the button.
- During playback, the director switches layers, zooms, and highlights. Switching layers manually pauses following; resume Follow director or replay only one layer.
- Viewers can zoom with wheel/pinch, drag to pan, and fit the stage to see the whole view. The next director shot takes over again.

## Diagram and traces
- Declare structure inside <Diagram> with <Diagram.Group label>, <Diagram.Node id label kind/>, <Diagram.Edge id from to label async/>.
- Diagram.Edge from/to must be node ids within the same Diagram. Layout is automatic; existing elements stay in place as segments appear.
- Use trace('a','b','c') for the a→b→c trace. Do not manually write node/edge state props or use set() to simulate calls; use trace().
- Elements visited this step are active; earlier ones become ok. trace.fail('a','b') marks failure; a later successful trace can recover.
- trace.skip('a','b') marks elements not called this time as dim. They need not be connected; it does not move the shot.
- trace accepts node or edge ids. Each segment needs a matching edge; reverse traversal is allowed. For multiple edges in the same direction, use the edge id.
- trace also supplies shot targets and can merge with shot in the same step. Focusing two or more nodes in one Diagram automatically creates a compact subgraph.
- Reveal segments with when={$.ui.show_billing}; set($.ui.show_billing, true) in a step only controls visibility, not trace call state.

## Captions and fitting one screen
- Keep captions within about 24 units and explain('Additional note') within about 48. CJK characters count as 1 each; all others count as 0.5; whitespace is ignored. check warns when exceeded.
- Captions and explain notes appear below the stage, never over it. Tell one thing per step; move long content to an explanation layer.
- Autoplay reading time: CJK 8 chars/s (125ms each), Latin 15 non-whitespace chars/s; clamp to 3–7 seconds before 0.5× / 1× / 1.5× scaling. Streams, shots and edge waits can exceed 7 seconds. Shots use 700ms ease-out without overshoot.
- Do not make viewers scroll through a long page. Fit one screen and zoom into details with shots.
- Each page has one device, desktop by default. page({ viewport: 'mobile' }, tree) uses a Phone frame at a fixed width of 390.
- For a mobile layer, use layer('Mobile', <MobileView/>, { viewport: 'mobile' }). Make a separate page or demo when mobile is needed (D44).
- Each layer tab shows an icon so viewers can tell layers apart when many tabs are squeezed: layer('Terminal', <Cli/>, { icon: 'terminal' }). Presets: ${LAYER_ICONS.join(', ')}. Default: mobile for mobile layers, otherwise window.

## Full-height layout: Follow stage height
- Layers and desktop pages fill the stage, whose size follows the board window. Fixed pixel heights (h={690}) push bottom content outside short windows.
- To fill a column vertically, set h="100%" on its container. Give growing content (chat history, lists, artifacts) style={{ flex: 1, minHeight: 0 }} and place fixed content below it:
  <Grid h="100%"><Grid.Col span={6}><Stack h="100%"><ScrollArea style={{ flex: 1, minHeight: 0 }}>Messages</ScrollArea>
  <Group><PromptInput id="prompt"/><Button id="send">Send</Button></Group></Stack></Grid.Col></Grid>
- The same applies to placeholders and artifacts: use h="100%" on Placeholder; Artifact fills its container by default.
- Use fixed pixels only for elements with a fixed height (avatars, icons, Diagram canvas height).

## Transition cards, roles, and Agent output (D56)
- .card('Title', { sub?, points?, role? }, ...effects): one large sentence filling the stage, as a step. Use for openings, endings, time jumps, and role switches.
- Open with why this matters; end with points listing what was confirmed. For time jumps, use .card('3 days later', set($.data.invite, 'expired')).
- Roles: declare roles: { ajie: role('Ajie', { desc: 'Invited friend' }) } in the feature; use layer('Ajie mobile', <AjieView/>, { role: 'ajie' }) for the layer.
- A layer with a role shows a name badge at the bottom left and an avatar in its tab. After .card('Now Ajie', { role: 'ajie' }), the director switches to Ajie's layer.
- Show one person at a time. For side-by-side views, draw two sections in the same layer.
- stream($.ui.reply, '…'): writes state like set. During playback, bound text appears character by character; jumping to the step shows the full text immediately.
- Agent UI: <Thinking title={$.ui.thought} active={$.ui.thinking} duration="6 seconds">Process</Thinking> shows thinking;
  <Artifact title="itinerary.md" kind="doc" status={$.ui.planStatus}>Content</Artifact> is a side artifact; reference it in the conversation with <Artifact.Ref id="…"/>.

## Forks, marks, email, data, and keys (D56 P1)
- fork(label, scenarioKey): switch to another scenario in the same option from the right of this step's caption, skipping the common prefix with identical actions and business effects. Autoplay stays on the main flow.
  Example: .click('can_go', fork('What if Ajie cannot go?', 'cant_go')). Empty labels are omitted; targets are still validated.
- mark(id, { kind?, note? }): circle (default) / underline / box / arrow; hand-drawn marks appear only in this step. Hidden targets, targets in other layers, and targets outside the stage are not drawn.
  Example: .system('Itinerary ready', mark('share', { kind: 'arrow', note: 'Share after generation' })).
- Email: a simple external email card. The card is not interactive; buttons in its body use ordinary steps.
  Example: <Email from="Camping assistant" to="Ajie" subject="Itinerary updated" time="Friday 20:05">Body</Email>.
- DataCard / StateFlow: place in a separate layer and switch to it with shot. Only these two components show this step's changes and before/after values. StateFlow marks earlier states completed according to states order.
  Example: layer('Itinerary data', <Stack><StateFlow value={$.data.trip.status} states={['draft','shared']} labels={{ draft: 'Draft', shared: 'Shared' }}/><DataCard title="Itinerary" value={$.data.trip} fields={[{ key: 'status', label: 'Status' }]}/></Stack>).
- Keyboard history: type reuses character-by-character preview during playback; press shows keycaps. Static views show only the latest input/keypress; other steps clear it. Empty keys are hidden.
  Example: .type('prompt', 'Plan a weekend camping trip').press('Enter', set($.ui.asked, true)). Chords such as '⌘K' split into two keycaps automatically.

## Write a theme
- A theme is a CSS file at themes/<name>.css in the project root. Set theme: '<name>' in joplo.config.ts as the default. A custom theme overrides a built-in with the same name.
- Built-ins: sketch (Hand-drawn, default), clean, blueprint, nord, dracula, solarized-light, terminal, kraft, contrast. Preview them in the board Appearance popover.
- Default handwriting uses offline Excalifont + Marker Gothic; rare Han and Korean use system fonts. Board WenKai loads online only when selected, falling back to system Kai offline. Exports wait up to 3 seconds.
- Published sites use the config theme, subset fonts against all built text, and never load WenKai. Newly typed characters absent from the build may use system fonts.
- Variables alone work and are scoped to the stage, leaving the board unaffected: --jp-font, --jp-font-mono, --jp-font-size, --jp-ink, --jp-bg, --jp-surface, --jp-subtle, --jp-muted, --jp-faint, --jp-line, --jp-line-strong, --jp-border, --jp-accent (highlight), --jp-select, --jp-info (Diagram active), --jp-ok, --jp-warn, --jp-danger, --jp-annot (annotations; defaults to danger), --jp-radius, --jp-shadow, --jp-stroke (rough hand-drawn / clean thin lines).
- Ordinary selectors (.jbox, h1, etc.) also work within the stage. In dark themes, check contrast of --jp-info / --jp-ok / --jp-danger / --jp-accent against the background.
- Example themes/brand.css:
    :root {
      --jp-font: "Inter", system-ui, sans-serif;
      --jp-ink: #14213d;
      --jp-bg: #f7f7fb;
      --jp-surface: #ffffff;
      --jp-accent: #fca311;
      --jp-info: #2563eb;
      --jp-radius: 10px;
      --jp-stroke: clean;
    }

## Full example: examples/agent-arch
See layersFor/Diagram in shared/arch.tsx and flow in features/agent/options/a-hybrid.tsx.
This excerpt shows the main plan steps, omitting business rule links. start in the same file already handles user input and sending:
\`\`\`tsx
const plan = (f: ReturnType<typeof start>) =>
  f
    .system('Billing quota precheck', 'Check quota before calling the model', trace('biz', 'billing'), shot('blk_billing'))
    .system('Fetch tool definitions', 'Fetch definitions for the client version', trace('biz', 'registry'), shot('blk_tools'), explain('Definitions and implementations are separate'))
    .system('Hand task to brain', 'Send task and tool definitions to brain', trace('biz', 'brain'), shot('blk_brain'))
    .system('Brain reasoning', 'Brain calls Bedrock to plan the next step', trace('brain', 'llm'));
\`\`\`
The example also covers insufficient quota, dangerous tool confirmation, client disconnection, and billing retries. Choose scenarios for the requirements; include more than the main flow.`,
  cases: `# Joplo case checklist: cases

Before starting, read user requirements and project material. Use these dimensions to find gaps; ask only key questions that change the design.
Record unanswered items as question or rules with status \`pending\`. Do not confirm AI assumptions on the user's behalf.

## Eight dimensions: Pick one or two relevant questions each
- \`main\` Main flow: Who needs to achieve what? What should the user see afterward?
- \`input\` Input: What happens when empty, invalid, or at a limit? Can input be preserved and corrected in place?
- \`permission\` Permission: Who can view and act? Without permission, hide the entry or disable it with a reason?
- \`lifecycle\` Lifecycle: What happens after expiry, revocation, or deletion? Is recovery allowed?
- \`async\` Async: What appears during waiting, timeout, and failure? Does retry preserve input?
- \`interrupt\` Interruption: What is preserved when closing a modal, going back, or leaving? Confirm unsaved changes?
- \`conflict\` Conflict: What happens with repeated clicks or concurrent edits? How are duplicate submissions prevented?
- \`consistency\` Consistency: When one route changes, when do others update? How are partial results kept understandable?

## Presets by product type
Pick relevant cases to ask the user before starting. Do not include every preset; these are question seeds, not \`confirmed\` product rules.

### Forms / CRUD / permission (source: examples/invite)
- no_permission · permission · How should non-admin actions be blocked and explained?
- invalid_input · input · How should empty or invalid input be explained inline?
- revoked · lifecycle · How should reopening after revocation work?
- expired · lifecycle · How should access after expiry be presented?
- already_exists · conflict · How should an existing object be reported?
- duplicate_submit · conflict · How should repeated submit clicks avoid duplicate creation?
- request_failed · async · How should input be preserved and retry allowed after failure?

### Agent / AI products (source: examples/agent-arch)
- quota · permission · How should insufficient quota be blocked before calling the model?
- dangerous_tool · permission · How should the user confirm a dangerous tool before execution?
- hand_offline · async · How should failure be reported when the tool execution client disconnects or times out?
- local_data · main · How should data on the user's machine be accessed?
- tool_version · consistency · How should upgraded definitions work with an older tool implementation?
- usage_retry · async · How should failed billing event delivery retry with idempotency?
- model_failed · async · How should model failure or timeout be explained and recovered from?

### CLI / developer tools (source: examples/joplo-dist)
- first_run · main · How should a new user succeed within three commands?
- env_old · input · How should an outdated runtime be explained and fixed?
- version_skew · consistency · How should global and project version mismatches prompt alignment?
- optional_dep · async · How should missing optional dependencies affect only related commands?
- dir_not_empty · conflict · How should existing files in the target directory be protected from overwriting?
- typo · input · How should a command or argument typo suggest the closest match?
- user_modified · conflict · How should user edits be protected from overwriting?
- offline · async · How should offline limitations and recovery be explained?

### Local tools / multiple projects (source: examples/joplo-board)
- first_open · main · How should a first visit with no data offer a starting point?
- single_instance · conflict · How should an existing instance be reused instead of starting another?
- stale_resource · lifecycle · How should records for missing directories or resources be cleaned up?
- one_broken · consistency · How should other projects keep working when one fails?
- public_view · consistency · How should the public view hide private paths, gaps, and errors?
- recent · main · How should the home page switch among previously opened projects?

## Turn answers into cases and scenarios
- feature.cases: { happy: 'Complete successfully', denied: { title: 'No permission', dimension: 'permission', priority: 'high', expected: 'Explain why' } }.
- dimension uses the keys above; priority is high/medium/low; expected describes the expected result.
- Each option uses flow(..., { cases: ['happy'] }) to reference the shared cases for comparison.
- A case with a scenario is automatically \`expressed\`; one with neither a scenario nor a declaration is \`missing\`.
- After adding a case, run check: reconsider it in every option.

## Declare coverage without a scenario
Coverage status values: \`expressed\`, \`undecided\`, \`missing\`, \`not_applicable\`, \`excluded\`.
- option.coverage: { case_key: undecided('Why this is undecided') }.
- missing('What is missing'): leave the gap explicit; do not pretend it is \`expressed\`.
- notApplicable('Why not applicable') / excluded('Why excluded'): require a nonempty reason.
- Explicit declarations override inference. Use scenarios for cases that need a demo.
- Do not invent business rules for full coverage. Keep asking about undecided behavior.

See authoring for flow and rule syntax; check for locating coverage diagnostics.
No mobile example yet; create a separate demo when mobile is needed (D44).`,
  check: `# Joplo diagnostics: check

Run npx joplo check [dir]. Use --option feature.option to narrow structure checks and replay; --format json gives machine output.
The whole project still compiles. Option filtering does not hide project compilation errors. Source files load locally.

## Read the output
\`file:line:column  severity  CODE  message\`
Example: features/invite/options/a.tsx:12:5  warning  UNBOUND_INTERACTIVE  Interactive element has no demo step.
- File and line/column identify the edit location. Read nearby source and fix only that location; do not rewrite the page.
- error exits 1; usage errors exit 2; warning/info only exits 0.
- The last line totals error, warning, info. Run check again after fixing.

## Common codes → fixes
- UNKNOWN_COMPONENT: Choose a supported name from components; do not invent components.
- MISSING_ID / DUPLICATE_ID: Give interactive elements stable ids unique within the stage; update step references.
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
- ROLE_UNKNOWN: A layer or card role is not in feature.roles. Declare roles as { key: role('Name') }; see demo.
- ICON_UNKNOWN: A layer icon is not a preset. Use one of ${LAYER_ICONS.join(', ')}; see demo.
- FORK_UNKNOWN: fork must target another scenario key in the same option; it cannot reference itself.
- MARK_UNKNOWN: The mark target is absent from this step's route stage and all layers. Check the element id; currently hidden targets are valid references.
- SHOT_UNKNOWN: The shot target is absent from this step's stage and all layers. Check its id and layer; see demo.
- LAYER_UNKNOWN: Invalid layer key or missing content. Use letters/digits/underscores/hyphens, do not start with @, and provide nonempty JSX.
- TRACE_UNKNOWN: Empty trace, unknown id, multiple Diagrams, or disconnected path. Use connected node/edge ids in one Diagram.
- TRACE_AMBIGUOUS: Multiple candidate edges between nodes. Use the specific edge id in trace.
- THEME_UNKNOWN: config({ theme }) names neither a built-in nor themes/<name>.css. Use a built-in or add that CSS file; see Write a theme in demo.
- UNKNOWN_DIAGRAM_NODE: Diagram.Edge from/to does not reference a node in this Diagram. Correct the endpoint ids.
- ELEMENT_PROP: A component prop contains JSX. Use strings for icons, such as leftSection="+", and children for content.
- ASSUMPTION_CONFIRMED: Keep AI assumptions \`pending\`. After user confirmation, record the actual origin; do not change only status.
- UNBOUND_INTERACTIVE: Add a scenario step, explicitly disable with a reason, or mark unmodeled.
- DISABLED_WITHOUT_REASON: Add disabledReason explaining why the element cannot be used.
- CASE_NOT_COVERED: Add a scenario or declare coverage truthfully. Ask about missing behavior first.
- EXPRESSED_WITHOUT_SCENARIO / COVERAGE_WITHOUT_REASON: Add a scenario or a reason for \`not_applicable\`/\`excluded\`.
- RULE_ELEMENT_NOT_FOUND: Check rule.elements against element ids in the related option stages.
- PENDING_AI_ASSUMPTION: Ask the user to confirm; keep \`pending\` until then.
- EMPTY_SCENARIO: Decide whether actions are needed. Zero steps are valid for showing initial states such as permissions.
- MISSING_TARGET / MISSING_SCENE: Check step targets, the start route, and the stage after go.
- TARGET_HIDDEN / TARGET_DISABLED: Check initial state and preceding set effects so the action is executable at that step.
- NOT_INTERACTIVE / NOT_A_FIELD: Choose the right component or action; input actions require value components.
- ALREADY_COMPLETED / NOTHING_TO_GO_BACK: Fix steps after done, or add route navigation before back.
- LOAD_FAILED / WRONG_EXPORT / INVALID_SCHEMA: Follow the message to fix imports, default exports, or field structure.

When the user points to a stage element, read selection first for its exact location.`,
  selection: `# Joplo selection: selection

When the user points to a board element or step to request an edit, run npx joplo selection [dir].
It reads .joplo/selection.json directly without recompiling, avoiding a whole-page search.

## Read the result and edit locally
- Output includes at (project-relative file:line:column), a label, and numbered source with three lines before and after.
- Open the file at that location (Open in editor in the board). Edit only what the user pointed to; use the label to confirm the target.
- If line content changed, verify the current location. If the file or line is gone, select again in the board.
- A missing file or null content prints "Nothing selected" and exits 0. Ask the user to hold ⌥ (Alt) and click the element in the board.
- Do not guess a location for an object without at. Select a specific element or step in the board.
- With --format json, data.selection preserves Selection and data.lines provides number/text.

## Full workflow
Edit → npx joplo check → npx joplo dev to view the board (a running board just adds the project) → user ⌥+clicks → npx joplo selection → edit only that location.
Run check again afterward. Preserve other options, pages, and existing user decisions.
.joplo/ is local runtime state, not the design authority. Do not commit it to Git.`,
  publish: `# Joplo publishing: publish

Compare cases and options in the board, then decide which option to publish for each feature.

## pick
- Set pick: 'a' in features/<f>/feature.ts to select options/a.tsx. It is not a qualified ID with a feature prefix.
- Publish only the picked option for each feature. Features without pick are omitted.
- Pages and layouts compose the whole product; picked options add elements to routes or add routes.

## build
- Run npx joplo check in the author project, then npx joplo build.
- Default output: dist/. Set --out-dir <dir> to change it.
- Nonempty output directories are rejected. After confirming the old output can be discarded, pass --overwrite to clear and rebuild.
- The published site contains only feature names, goals, scenario demos, step captions, and the overall layout.
- Rule origins, AI assumptions, gaps, open questions, and source locations stay on the local authoring side.
- This is a static, read-only demo with no real business data or backend.

## Demos on the published site
- The published site uses the same layout as the local board, with authoring details such as rules, gaps, and source locations removed.
- Layer switching, Follow director, replaying one layer, shot focus, and captions all work on the published site. See demo for syntax.
- Fullscreen works on the published site: F enters/toggles, Space plays/pauses, ←/→ steps back/forward, Esc exits.
- Fullscreen keeps only the stage and captions. Playback controls float below and hide automatically.
- Both local and published views can export images. Video export is local only and requires local Playwright/Chromium.

## Deploy
Use your own Wrangler environment and account in the project directory:

\`npx wrangler deploy --assets dist\`
Provide the site name and compatibility date through Wrangler project configuration. Handle access control in deployment.
Deploy only dist output, not author source files. MCP, comments, and collaboration are planned separately.

## Cloud sharing
- Run npx joplo login and verify the code in your browser before authorizing. Use --no-browser to open the URL manually over SSH or without a local browser.
- Agents publish with npx joplo share --format json. It checks, builds, and uploads only the published output.
- AUTH_REQUIRED exits 3: ask the user to run npx joplo login in their own terminal, then retry share. Agents must not authorize on their behalf.
- On AUTH_REQUIRED, ask the user to sign in. Do not run \`joplo logout\` on the user's behalf.
- AUTH_EXPIRED also exits 3: ask the user to sign in again. Read error.code / message / details for other failures.
- Free links expire after 1 hour; read data.expiresAt for the exact time. Pro permanent links have expiresAt: null.
- Successful share JSON includes data.embed: { iframe, markdown, badge, preview }. To add the demo to a README, write data.embed.markdown as is; do not build badge links yourself. For a free link, tell the user the badge shows "expired" after data.expiresAt.
- data.embed.iframe embeds a player for blogs and docs: it shows a cover first; append &scenario=<scenario id> to pick the start or &autoplay=1 to skip the cover.
- share also uploads a 1200x630 preview image of the default scenario when local Playwright is installed; without it, share still succeeds and prints one "Skipped the preview image" line.
- Pro share updates the same-server link in .joplo/cloud.json; --new creates another link and --title sets its title.
- npx joplo whoami --format json shows the account, plan, and limits; npx joplo logout signs out.
- maxUploadBytes limits only newly uploaded cloud blobs. The CLI prechecks maxTotalBytes and maxFiles. TOO_LARGE details.kind distinguishes upload / total / files.
- Credentials are stored only in JOPLO_HOME/credentials.json (default ~/.joplo). Never copy them into a project, print them, or commit them.
- Cloud commands accept --server <url>, overriding JOPLO_CLOUD_URL; the default is https://cloud.joplo.app.
- Local check / build / dev remain free and do not connect to the cloud.`,
};

function distance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    const next = [i + 1];
    for (let j = 0; j < b.length; j++) next.push(Math.min(next[j]! + 1, row[j + 1]! + 1, row[j]! + (a[i] === b[j] ? 0 : 1)));
    row = next;
  }
  return row[b.length]!;
}
