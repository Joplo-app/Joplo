import { MENTAL_MODEL, START_ORDER } from './agent-skill.ts';
import { COMPONENT_DOCS, COMPONENT_EXAMPLES, COMPONENT_TYPES, GATED_CONTAINERS, HTML_TAGS, INTERACTIVE_TYPES, JOPLO_PROPS, VALUE_TYPES, type ComponentType } from './catalog.ts';
import { JoploError } from './result.ts';
import { LAYER_ICONS } from './schema.ts';

export const SKILL_TOPICS = [
  { name: 'authoring', description: 'Mental model, first steps, page / option / flow syntax, when conditions, a form example' },
  { name: 'story', description: 'Plan a demo before coding; PM lens from a need to roles, goal, cases, and scenarios; openings, endings, captions' },
  { name: 'demo', description: 'Layers, shots, captions, full-height layout, deep links, and screenshots' },
  { name: 'components', description: 'Component catalog, supported HTML tags, line breaks, and props' },
  { name: 'cases', description: 'Case dimensions: ask the user before starting' },
  { name: 'check', description: 'Read diagnostics, UNBOUND_INTERACTIVE, and fix the indicated file and line' },
  { name: 'selection', description: 'Edit only the element selected by the user in the board' },
  { name: 'publish', description: 'pick, build, share, review version, feedback write-back, deployment' },
] as const;
export type SkillTopic = (typeof SKILL_TOPICS)[number]['name'];

const related: Record<SkillTopic, readonly SkillTopic[]> = {
  authoring: ['story', 'demo', 'components', 'cases', 'check', 'selection', 'publish'],
  story: ['authoring', 'cases', 'demo', 'check'],
  demo: ['story', 'authoring', 'components', 'check', 'publish'],
  components: ['authoring', 'demo', 'check'],
  cases: ['story', 'authoring', 'check'],
  check: ['authoring', 'selection'],
  selection: ['check', 'authoring'],
  publish: ['demo', 'authoring', 'check'],
};

/** CLI 传入其 package.json 版本；行数来自同一次生成的主题正文。 */
export function skillIndex(version: string, docs?: Readonly<Record<string, string>> | null): string {
  return [
    `Joplo ${version} · Agent usage (read on demand)`,
    '',
    ...MENTAL_MODEL,
    '',
    'Start here:',
    ...START_ORDER.map((s, i) => `  ${i + 1}. ${s}`),
    '',
    'Topics (suggested order: authoring, story, cases, components, demo, check; selection and publish when needed):',
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

/** HTML 兜底标签不单独列在目录里（它们在 “HTML tags” 一行里，且一律建议改用组件）。 */
const HTML_SET: ReadonlySet<string> = new Set(HTML_TAGS);

/**
 * `npx joplo components <名字…>`（D68）：所列组件（含它的子组件，例如 Menu → Menu.Item）的属性提示、行为分组和示例。
 * 名字不区分大小写；不认识的名字报 USAGE 并给出最接近的名字。
 */
export function componentDetails(names: readonly string[]): string {
  const all = COMPONENT_TYPES.filter((n) => !n.startsWith('#')) as ComponentType[];
  const out: string[] = [];
  for (const raw of names) {
    const hit = all.find((n) => n.toLowerCase() === String(raw).toLowerCase());
    if (!hit) {
      const near = [...all].sort((a, b) => distance(String(raw).toLowerCase(), a.toLowerCase()) - distance(String(raw).toLowerCase(), b.toLowerCase()))[0];
      throw new JoploError('USAGE', `Unknown component "${raw}". Did you mean ${near}?\nRun npx joplo components to list all components.`);
    }
    const family = [hit, ...all.filter((n) => n.startsWith(`${hit}.`))];
    out.push(`# ${hit}`);
    for (const n of family) {
      const groups = [INTERACTIVE_TYPES.has(n) ? 'interactive: requires id and a step, disabled + disabledReason, or unmodeled' : '', VALUE_TYPES.has(n) ? 'value: type / select / toggle write to it' : '', GATED_CONTAINERS.has(n) ? 'shown only while opened' : ''].filter(Boolean);
      out.push(`- ${n}: ${COMPONENT_DOCS[n].replace(/\s+/g, ' ').trim()}${groups.length ? ` [${groups.join('; ')}]` : ''}`);
    }
    const ex = COMPONENT_EXAMPLES[hit];
    if (ex) out.push('', '```tsx', ex, '```');
    out.push('');
  }
  out.push('Import components from @joplo-app/kit/ui; bindings and conditions: npx joplo skill authoring.');
  return `${out.join('\n')}\n`;
}

function componentTopic(docs: Readonly<Record<string, string>> = {}): string {
  const names = COMPONENT_TYPES.filter(name => !name.startsWith('#') && !HTML_SET.has(name));
  const listed = (set: ReadonlySet<string>) => names.filter(name => set.has(name)).join(', ');
  return [
    '# Joplo components: components',
    '',
    'Import components from @joplo-app/kit/ui. Names below come from the current compiler catalog; do not invent components.',
    'Prop hints follow names when available; otherwise only names are listed. Write HTML tags directly in JSX; do not import them from ui.',
    '',
    '## HTML tags and line breaks',
    `- Supported HTML tags: ${HTML_TAGS.join(', ')} (a is interactive). Any other tag (br, img, button, input, table, form, label, hr, h5) is UNKNOWN_COMPONENT; use the component instead (Divider, Image, Button, TextInput, Table).`,
    "- Line breaks: JSX collapses newlines in text, and there is no <br/>. Text, Blockquote, List.Item, Timeline.Item, and Accordion.Panel keep \\n, so write <Text>{'Line 1\\nLine 2'}</Text>.",
    "- Elsewhere add style={{ whiteSpace: 'pre-line' }}, or stack several <Text> in a <Stack gap={4}>. Text with truncate stays on one line.",
    '- Every component accepts style={{ … }} and the Mantine style props (m, p, w, h, c, bg, fz, fw, ta…); className is not needed.',
    '',
    '## Component catalog',
    'Props and an example for any component: npx joplo components <Name> (for example npx joplo components Menu DataTable).',
    ...names.map(name => `- ${name}${Object.hasOwn(docs, name) && docs[name]?.trim() ? `: ${docs[name]!.replace(/\s+/g, ' ').trim()}` : ''}`),
    '',
    '## Common product screens (D68)',
    '- Empty list, 404, expired link, no access, or a result page: EmptyState with action Buttons in children. Confirm a destructive action: Modal with opened={$.ui.confirm} and two Buttons.',
    '- Rows with avatar, text, and actions: ListRow (tappable rows: NavLink). Row actions: Menu with opened={$.ui.menu} on an ActionIcon target. Status cells, sorting, selection, loading: DataTable columns badge / avatar, sortStatus, selectedRecords, fetching.',
    '- Dashboards: Stat, KeyValue, BarChart / LineChart (data can bind $.data.x; set a new array to animate). Mobile: TabBar at the bottom of a full-height Stack. Undo bar or banner: Notification position="bottom" with when.',
    '',
    '## Behavior groups (from the catalog)',
    `- Interactive; require id and declared behavior: ${listed(INTERACTIVE_TYPES)}.`,
    `- Accept input; type/select/toggle write to inputs: ${listed(VALUE_TYPES)}.`,
    `- Containers whose expanded state controls child visibility: ${listed(GATED_CONTAINERS)}.`,
    '',
    `Joplo props: ${JOPLO_PROPS.join(', ')}; disabled is the component disable prop.`,
    'when controls visibility; disabledReason explains disabling; unmodeled marks behavior not modeled by this prototype; note is an authoring note.',
    'Interactive elements need a flow step, disabled={true} with a disabledReason, or explicit unmodeled (see check: UNBOUND_INTERACTIVE).',
    'Value components are read-only on stage: they show inputs[id] written by .type/.select/.toggle steps, or a bound value prop. Viewers cannot type their own text.',
    'See authoring for bindings, conditions, and steps; check for component error fixes.',
  ].join('\n');
}

const CONTENT: Record<Exclude<SkillTopic, 'components'>, string> = {
  story: `# Joplo storytelling and planning: story

A demo is a short story a viewer follows without you: who wants what, what gets in the way, what the product does, and the visible result.
It is not a feature tour. Plan it in a few lines before writing TSX, show the plan to the user, then build. Sources: docs/research/storytelling-and-demos.md.

## 1. Plan the demo first (write it in your reply; ask only questions that change it, each with a default)
- Audience: who watches (product review, design review, a customer, engineers) and what they must decide afterward.
- One to three points: what viewers must believe after watching. Each point becomes a scenario or an A/B comparison, never a single step.
- Scene list, one line per scenario: Given (who, where, starting state) → When (the user's actions) → Then (the visible result), plus how it opens and how it ends.
- Length: a scenario is usually 5–12 steps, about 20–60 s at 1×. check flags one over 90 s; npx joplo outline prints every estimate.
- Unsure how to frame it? Offer two or three one-line framings and let the user pick.

## 2. PM lens: from a need to roles, goal, cases, and scenarios
Joplo already has the parts of a user story; fill them in that spirit.
- roles: who it is for, specific ('Space admin', 'Invited teammate'), not 'User'. Use role('Name', { desc }) keys when layers or cards belong to a person; plain names are fine otherwise.
- goal (the I want + so that): one sentence, who can do what and why, independent of the solution so options A/B are two answers to it.
  Good: 'Space admins invite teammates by email so the team can start working the same day'. Bad: 'Invite button', 'A better invite experience'.
- cases are the acceptance criteria: the title is the Given (the situation), expected is the Then (what the viewer must see), priority is how much it matters.
  Write expected for every high-priority case; it is the line reviewers check the demo against. npx joplo outline lists cases without one.
- rules are the business constraints a Then depends on ('Only admins can invite'); link them to cases and elements, and to steps with uses().
- One scenario = one When and one Then. The steps are the When; the last steps show the Then (a visible state plus done('…')). Several Whens: split the scenario.
- Splitting, in this order: one thin end-to-end happy path (entry → result) first; then one scenario per business-rule variant, data variant, role, and failure.
  Do not split by step (fill in / review / publish): every scenario goes from its entry to a result. More than 5–6 high-priority cases, or two roles with different goals: split the feature.
- Edge cases: walk the eight dimensions (npx joplo skill cases), and ask what if the user does steps out of order, skips an optional step, or comes back later. Each adopted answer is a case with its own expected and a scenario.
- INVEST check per scenario: Independent (its own start state), Valuable (ends on a visible result), Small (fits the length above), Testable (expected says exactly what appears).
- Direction still open? Build only the main scenario of options A and B first; add every case after the user picks.

## 3. Openings, middles, endings
- Opening: the first step or an opening .card('…', { sub }) says who is trying to do what and why, in one sentence. No logo, no 'So you open the app'.
- Middle: each step proves one thing with a visible action and a visible change; the cause must be visible (a click, an incoming message, a time-jump card).
  A screen that changes with no trigger reads as a screensaver. Mock results come from steps: set(), toast(), go().
- Ending: pick one strategy, either stop on the result (done('…') with the result on screen) or a closing .card with points: at most 3–4 short points.
- Transitions: keep something on screen across a change (the same list, the same person); cards only for time jumps, role switches, opening, and ending.
- Where the viewer looks each moment is the demo topic's attention guidance (shots, marks, and the focus helpers): npx joplo skill demo.

## 4. Captions and explain
- One idea per caption, about 24 units (CJK 1, other characters 0.5). Subject + verb, active voice, the visible action first: 'Ana sends the invite', 'The link expires after 7 days'.
- explain (about 48 units) says why it matters or what it means; never repeat the caption.
- System steps are narration of what happened ('The server rejects the address'), not labels ('System event').
- Same name for the same person or thing throughout; button and field names exactly as on screen; no internal ids or API names unless the audience is engineers.
- No filler ('Now let us…', 'a whole new experience'): every sentence does a job. Do not invent numbers or facts; record guesses as ai_assumption rules.
- Cover text: flow({ description }) is the cover sentence, 30 units at most (DESCRIPTION_TOO_LONG). The cover falls back to the feature goal.
- Rhythm: every short step waits 3 s, so a run of trivial steps feels like a metronome. Merge trivial steps (type, then click) and give key results an explain.

## 5. Before handing over
- npx joplo outline: per feature, who it is for, the goal, each case with its expected result and coverage per option, and each scenario's steps, duration, opening and ending.
- npx joplo check: CAPTION_TOO_LONG, EXPLAIN_TOO_LONG, DESCRIPTION_TOO_LONG, CARD_TEXT_TOO_LONG, SCENARIO_TOO_LONG, HAPPY_PATH_ONLY, CASE_NOT_COVERED (names the expected result).
- Read only the captions from start to end: do they tell the story? Then look only at key frames (npx joplo render --step-id …): does the screen show it without captions?
- Tell the user which cases have no expected result yet and which options do not cover a high-priority case.`,
  authoring: `# Joplo authoring: authoring

## Mental model (read first)
${MENTAL_MODEL.map(s => `- ${s}`).join('\n')}
- So write what the viewer should see as steps: typing is .type(id, 'sample'), a click is .click(id), a server answer is .system('caption', set(...)).

## Start small
${START_ORDER.map((s, i) => `${i + 1}. ${s}`).join('\n')}

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
- option({ name, idea, focus?, tradeoffs?, on?, routes?, layers?, state?, rules?, questions?, coverage?, scenarios }).
- focus: one sentence naming the design decision this option changes; tradeoffs: ['Faster to scan', 'Needs a second click'], shown in the option's hover card in the board. Both stay out of published and review builds.
- on: { '/members': { actions: <Button id="invite">Invite</Button> } }: add elements to a slot on an existing route.
- routes: { '/members/new': page({ title: 'New member' }, <Stack>…</Stack>) }: add a route for this option.
- state: { ui: { ready: false }, data: {}, inputs: {} }: initial option state.
- scenarios: { happy: flow('Success', { cases: ['happy'], start: '/members' }).click('invite', done('Completed')) }.
- flow(name, { cases?, start?, state?, description?, expected?, mock?, outcome? }): state overrides the option's initial state; description and expected describe the scenario.
- outcome: 'success' | 'failure' | 'denied' | 'other' is the board's result badge ("Mock failure"). Without it, the badge follows done's second argument, else success. mock: 'Mock: link expired' replaces the badge text.
- See cases for case and coverage declarations; publish for pick and publishing.

## flow: Put behavior in steps
- .click(id, ...args); .type(id, value, ...args); .select(id, value, ...args).
- .toggle(id, boolean, ...args); .back(...args); .system('Mock event', ...args).
- .press('⌘K', ...args) / .press('Enter'): a targetless user keyboard step. The default caption describes pressing ⌘K; effects work like ordinary steps.
- String args are optional captions; other args are effects. All methods are chainable.
- set($.ui.ready, true): replace state; push($.data.rows, row): append an array item.
- toast('Message') / toast.success/error/info('Message'): a message for the current step.
- go('/members'): change route within the current option; back returns to the previous route.
- done('Result', 'success'|'failure'|'cancelled'): end the scenario; default is success. It also sets the result badge (cancelled shows as other) unless flow({ outcome }) is written; if both are written they must agree, otherwise check warns OUTCOME_MISMATCH.
- uses('rule_key', ...): an effect that links rules from this option or feature, passed like set(): .click('send', uses('admin_only'), done('Sent')). It is not a flow method; .uses(...) is not a function.

## Bindings and conditions
- $.ui.x / $.data.x / $.inputs.x bind whole values; arbitrary expressions are not evaluated. $.inputs.<id> is the value typed into element <id>.
- Props can bind: <TextInput id="email" error={$.ui.emailError}/>, <Text>{$.data.name}</Text>.
- not(x), eq(x, value), neq(x, value), empty(x), notEmpty(x), oneOf(x, values), and(...xs), or(...xs).
- Overlays: <Modal id="dlg" opened={$.ui.open} title="…">; Drawer works the same way. Only opened controls visibility.

## when takes a condition, never a plain value
- Right: when={$.ui.sent}, when={not($.ui.sent)}, when={eq($.ui.mode, 'code')}, when={and(notEmpty($.inputs.email), not($.ui.sending))}.
- Wrong: when={!link}, when={mode === 'code'}, when={true}. JavaScript evaluates these once while the project loads, so when gets a plain boolean: check reports INVALID_CONDITION at that line.
- Value known while writing (a prop of your own component, a loop variable, an option-specific flag): render conditionally in your code instead, {mode === 'code' && <CodeForm/>}. false, null, and undefined children are dropped.
- Value that changes during the demo: keep it in option state and change it with set() in a step.
- disabled accepts true/false or a condition: disabled={$.ui.sending} disabledReason="Sending…".
- disabledReason is a string or a whole-value binding like disabled: disabledReason={$.ui.sendHint} shows the current state value. Anything else (a number, a condition, an expression) is INVALID_DISABLED_REASON.

## Layout and responsiveness (Mantine names and props; no className)
- Use Stack / Group / SimpleGrid / Grid props: <Group justify="space-between">, <SimpleGrid cols={{ base: 1, md: 3 }}>.
- Use responsive objects { base, xs, sm, md, lg, xl }, or visibleFrom="sm" / hiddenFrom="sm". AppShell collapses navigation below navbar.breakpoint.
- Set input labels directly: <TextInput id="email" label="Email"/>. Auto captions use them.
- Stage height follows the window. Do not use fixed pixel heights for full-height layouts, which clip bottom inputs and buttons in short windows. See Full-height layout in demo.

## Example: form with an error and a retry
Inputs show what the steps type; the error comes from set(), not from validation code.
\`\`\`tsx
import { $, done, flow, option, page, set } from '@joplo-app/kit';
import { Alert, Button, Loader, Stack, TextInput } from '@joplo-app/kit/ui';
const send = (name: string, cases: string[]) => flow(name, { start: '/reset', cases })
  .type('email', 'ana@exmple.com').click('send', 'Send the reset link', set($.ui.sending, true));
export default option({
  name: 'A · Email link', idea: 'Send a reset link by email',
  state: { ui: { sending: false, sent: false, emailError: '' } },
  routes: { '/reset': page({ title: 'Reset password' }, <Stack>
    <TextInput id="email" label="Email" error={$.ui.emailError} />
    <Button id="send" disabled={$.ui.sending} disabledReason="Sending…">Send link</Button>
    <Loader when={$.ui.sending} />
    <Alert id="sent" color="green" when={$.ui.sent}>Check your inbox</Alert>
  </Stack>) },
  scenarios: {
    unknown_email: send('Typo, then retry', ['unknown_email'])
      .system('No account for this email', set($.ui.sending, false), set($.ui.emailError, 'No account with this email'))
      .type('email', 'ana@example.com', set($.ui.emailError, ''))
      .click('send', 'Retry', set($.ui.sending, true))
      .system('Server accepts', set($.ui.sending, false), set($.ui.sent, true), done('Link sent after retry')),
  },
});
\`\`\`
Add the happy path the same way; declare both cases in feature.ts. Add layers (see demo) once this works in the board.

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
- routes / on and layers work together, but once an option declares layers the stage shows only its layers: route pages are not drawn during the demo. Routes still give flow start, go(), and back() their state, and step targets are found in the layers first (then the route page).
- To show a route page as well, render the same component in a layer: layers: { app: layer('App', <MembersPage/>), backend: layer('Backend', <Arch/>) }.
- No automatic overview layer. Declare overview: layer('Overview', <Overview/>) when needed.
- Put long notes in a separate explanation layer, such as why: layer('Design rationale', <Why/>), then switch to it with a shot.

## Shots and the director
- Write shot(...ids) in a step. Targets can be components, cards, buttons, or Diagram nodes, groups, and edges.
- Each id resolves in the layer containing it. The same id can affect multiple layers; the first shot determines the director layer.
- Example: .click('app_send', shot('msg_user'), shot('app', 'biz')) follows the client view first, then sets a backend shot.
- shot() restores the whole director layer. Without a shot, keep the previous one; a plain click can follow the layer containing the button.
- During playback, the director switches layers, zooms, and highlights. Clicking a layer tab, or opening a deep link with l=, pins that layer: Follow director turns off and later steps stay on the pinned layer, even when their shot or action is on another layer (the shot still happens there, you just do not see it). Turn Follow director back on (the switch next to the layer tabs) or drop l= from the URL to follow again; you can also replay only one layer.
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
- Captions and explain notes appear below the stage, never over it. Tell one thing per step; move long content to an explanation layer. How to write them, and how to plan openings and endings: story.
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
- What gets squeezed: in an h="100%" column, a Table, DataTable, or ScrollArea shrinks to the space left and scrolls inside. Rows stay in the DOM and check passes, but viewers see fewer rows.
- Budget the height: render uses a 1280×800 desktop stage (the board follows the window, so leave margin); a table row is about 38px, a labeled input about 64px plus the gap.
- Fixes: show fewer rows (5–8), split a long form across steps or layers, or move the table to its own layer and shot it. style={{ flexShrink: 0 }} keeps every row but pushes what follows off the stage.
- Verify with npx joplo render: it warns when the next step's target is not visible.

## Deep links and screenshots
- Board: http://127.0.0.1:<port>/#/<project>/f/<feature>?o=<option>&c=<case>&s=<scenario>&step=<n>&l=<layer>&speed=<0.5|1.5>. Copy the project part from the board URL.
- Published site: <site>/#/f/<feature>?s=<scenario>&step=<n>&l=<layer>. Embeds use ?embed=1&scenario=<scenario>&autoplay=1 (see publish).
- Ids are qualified: option invite.a-modal, case invite.no_permission, scenario invite.a-modal.happy. step=n is the state after n steps (0 = initial). l is the layer key from layers: { … }; it pins that layer and turns Follow director off, so later steps do not switch layers. Omit l to follow the director.
- Other parameters (layer=, option=, scenario= in the hash) are ignored; the board logs a console warning naming them.
- Screenshot one step: npx joplo render --scenario-id invite.a-modal.happy --step-id 'invite.a-modal.happy#2' --out shot.png. It waits for fonts, layout, and the camera.
- render needs the Joplo export component (Playwright + Chromium, about 100 MB, installed once under ~/.joplo, never into the project). Without it render exits 4 with EXPORT_COMPONENT_MISSING and downloads nothing. It is a large download, so confirm with the user, then run npx joplo setup export (npx joplo setup export --status checks without installing). Writing demos, dev, check, build, and share do not need it.
- In a browser, open the deep link, wait for [data-jcamera][data-camera-settled="1"] plus two animation frames, then capture. During autoplay or typing animations the DOM can be ahead of the pixels; pause first.

## Transition cards, roles, and Agent output (D56)
- .card('Title', { sub?, points?, role? }, ...effects): one large sentence filling the stage, as a step. Use for openings, endings, time jumps, and role switches.
- Open with why this matters; end with points listing what was confirmed. For time jumps, use .card('3 days later', set($.data.invite, 'expired')).
- While a card covers the stage, the stage behind it is inert: nothing on it is clickable. Viewers continue with Next (or the → key), or by autoplay; a card step has no target to click.
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
- Filled buttons default to --jp-ink, so changing --jp-ink also recolors body text. There is no primary-color variable yet: set the brand color on the button itself, <Button color="#e8590c">, instead of overriding inline styles.
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
- dimension uses the keys above; priority is high/medium/low; expected is the visible result the scenario must end on (the Then of an acceptance criterion; the title is the Given). Write it for every high-priority case; see story for the PM method.
- Each option uses flow(..., { cases: ['happy'] }) to reference the shared cases for comparison.
- A case with a scenario is automatically \`expressed\`; one with neither a scenario nor a declaration is \`missing\`.
- After adding a case, run check: reconsider it in every option.
- Start with two scenarios per option, the happy path and one error-and-recovery case; add the rest after the user has seen them in the board.
- A rule the user stated in this conversation is origin: 'user', status: 'confirmed'; a rule you inferred stays ai_assumption, pending.

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
- The location is the author element or call that caused the problem. joplo.config.ts:1:1 means no source location was known.
- One root cause in a shared view (a layout, a component reused in routes and layers) prints once with "(affects N views)" and counts once; JSON adds affects: [view ids].
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
- DESCRIPTION_TOO_LONG: flow({ description }) is the scenario cover sentence; keep it within 30 units, one sentence saying what this scenario shows. See story.
- CARD_TEXT_TOO_LONG (info): a transition card's sub is over 48 units, a point over 24, or more than 4 points. Keep one sentence and a few short points; move details into steps.
- SCENARIO_TOO_LONG (info): the scenario plays over 90 s at 1×. One scenario tells one thing: split it (happy path, then each recovery) or branch with fork(). npx joplo outline shows the pacing.
- HAPPY_PATH_ONLY (info): every case is a main-flow case and every scenario succeeds. Ask about input, permission, async, and lifecycle cases (see cases), then add an error-and-recovery scenario. Do not invent behavior.
- ROLE_UNKNOWN: A layer or card role is not in feature.roles. Declare roles as { key: role('Name') }; see demo.
- ICON_UNKNOWN: A layer icon is not a preset. Use one of ${LAYER_ICONS.join(', ')}; see demo.
- FORK_UNKNOWN: fork must target another scenario key in the same option; it cannot reference itself.
- MARK_UNKNOWN: The mark target is absent from this step's route stage (after go() and back() in earlier steps) or, with layers, from every layer. Check the element id; currently hidden targets are valid references.
- SHOT_UNKNOWN: The shot target is absent from this step's stage and all layers. Check its id and layer; see demo.
- LAYER_UNKNOWN: Invalid layer key or missing content. Use letters/digits/underscores/hyphens, do not start with @, and provide nonempty JSX.
- TRACE_UNKNOWN: Empty trace, unknown id, multiple Diagrams, or disconnected path. Use connected node/edge ids in one Diagram.
- TRACE_AMBIGUOUS: Multiple candidate edges between nodes. Use the specific edge id in trace.
- THEME_UNKNOWN: config({ theme }) names neither a built-in nor themes/<name>.css. Use a built-in or add that CSS file; see Write a theme in demo.
- UNKNOWN_DIAGRAM_NODE: Diagram.Edge from/to does not reference a node in this Diagram. Correct the endpoint ids.
- ELEMENT_PROP: A component prop contains JSX. Use strings for icons, such as leftSection="+", and children for content.
- ASSUMPTION_CONFIRMED: Keep AI assumptions \`pending\`. After user confirmation, record the actual origin; do not change only status.
- UNBOUND_INTERACTIVE: see the section below.
- INVALID_CONDITION: when got a plain boolean, number, or string (when={!x}, when={mode === 'code'}). Use a condition such as when={eq($.ui.mode, 'code')}, or render conditionally in your code: {flag && <X/>}. See authoring.
- DISABLED_WITHOUT_REASON: Add disabledReason explaining why the element cannot be used: a string, disabledReason="Only admins can invite", or a binding, disabledReason={$.ui.sendHint}.
- INVALID_DISABLED_REASON: disabledReason got a number, condition, or other value. Use a string or a whole-value binding; for text that changes, set() it into state and bind it.
- OUTCOME_MISMATCH: flow({ outcome }) and done(…, outcome) disagree; the badge uses flow's. Make them agree (cancelled corresponds to other).
- CASE_NOT_COVERED: Add a scenario or declare coverage truthfully. Ask about missing behavior first. The message names high priority and the case's expected result, which is what the new scenario must end on.
- EXPRESSED_WITHOUT_SCENARIO / COVERAGE_WITHOUT_REASON: Add a scenario or a reason for \`not_applicable\`/\`excluded\`.
- RULE_ELEMENT_NOT_FOUND: Check rule.elements against element ids in the related option stages.
- PENDING_AI_ASSUMPTION: Ask the user to confirm; keep \`pending\` until then.
- EMPTY_SCENARIO: Decide whether actions are needed. Zero steps are valid for showing initial states such as permissions.
- MISSING_TARGET / MISSING_SCENE: Check step targets, the start route, and the stage after go.
- TARGET_HIDDEN / TARGET_DISABLED: Check initial state and preceding set effects so the action is executable at that step.
- NOT_INTERACTIVE / NOT_A_FIELD: Choose the right component or action; input actions require value components.
- ALREADY_COMPLETED / NOTHING_TO_GO_BACK: Fix steps after done, or add route navigation before back.
- LOAD_FAILED / WRONG_EXPORT / INVALID_SCHEMA: Follow the message to fix imports, default exports, or field structure.

## UNBOUND_INTERACTIVE: is every interaction expressed?
An element that looks usable (Button, TextInput, Select, NavLink, a, …; see components) has an id but no step in any scenario of this option. Viewers will try it; decide what happens:
1. Show it: add a step to a scenario, .click('send') or .type('email', 'ana@example.com'). Inputs that only display a value need a .type step too.
2. It cannot be used here: disabled={true} with disabledReason="Only admins can invite". A conditional disabled does not count; it still needs a step for the enabled state.
3. Out of scope for this prototype: add unmodeled (note="…" optional). Clicking it shows "This demo does not cover …".
Do not add fake steps just to silence the warning.

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
- Both local and published views can export images. Video export is local only.
- Local image and video export use the Joplo export component (Playwright + Chromium, kept under ~/.joplo, not in the project). If it is missing, the board's Export menu offers Install export component (about 100 MB) and continues the export after installing; in a terminal, run npx joplo setup export.

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
- share also uploads a 1200x630 preview image of the default scenario when the export component is installed (npx joplo setup export, or Playwright already in the project); without it, share still succeeds, prints one "Skipped the preview image" line, and never downloads anything.
- Pro share updates the same-server link in .joplo/cloud.json; --new creates another link and --title sets its title.
- The review version is a separate share (review: { shareId, url } in .joplo/cloud.json); it never replaces the main link. If the cloud rejects the review manifest, plain share retries once without it and still publishes.
- npx joplo whoami --format json shows the account, plan, and limits; npx joplo logout signs out.
- CLIENT_OUTDATED: the cloud needs a newer CLI. In a project, npx joplo@latest still runs the project's version; upgrade both packages to the same version (npm i -D joplo@latest @joplo-app/kit@latest), then share again.
- maxUploadBytes limits only newly uploaded cloud blobs. The CLI prechecks maxTotalBytes and maxFiles. TOO_LARGE details.kind distinguishes upload / total / files.
- Credentials are stored only in JOPLO_HOME/credentials.json (default ~/.joplo). Never copy them into a project, print them, or commit them.
- Cloud commands accept --server <url>, overriding JOPLO_CLOUD_URL; the default is https://cloud.joplo.app.
- Local check / build / dev remain free and do not connect to the cloud.
- CI: set JOPLO_API_KEY (jpk_..., created in Settings → API keys) instead of logging in. Every cloud command then uses it; credentials.json and browser login are never touched. An invalid or revoked key returns AUTH_EXPIRED: ask the user for a new key.
- PR previews: in GitHub Actions run npx joplo share --new --pr <number> --format json; repo, commit, and run URL come from the Actions environment. Outside Actions pass --repo owner/name. data.pr.comment "skipped" means the Joplo GitHub App is not installed; tell the user, the share itself succeeded.

## Review and feedback (the joplo-feedback skill has the same steps)
- npx joplo share --review publishes the review version: every option of every feature, so reviewers can compare A/B. Rules, questions, cases, and AI assumptions still never appear in uploaded files; they go only to the review page through the request body. Plain share publishes only picked options.
- After reviewers comment and the owner decides on the review page, run npx joplo feedback --format json (uses the review share in .joplo/cloud.json, else the main share, or --share <id>). data.decisions are decisions not yet applied; data.comments are unresolved viewer comments with scenario, step, stepId, and element.
- Apply each decision to the source, then run npx joplo check:
  - pick: set feature.pick in features/<f>/feature.ts to the option file name (the part after "<feature>.").
  - confirm_rule: set that rule to origin: 'user', status: 'confirmed'.
  - reject_rule: rewrite the rule as the note (reason) says. If the reason does not say what to do instead, mark it status: 'conflict' and ask the user; do not guess.
  - answer: delete the question and add a rule with origin: 'user' (status: 'confirmed') stating the answer.
  - Comments are input for discussion only; do not change the source from a comment unless the user asks.
- When check passes, mark what you applied: npx joplo feedback --applied <decision ids, comma-separated> [--ref <commit or source version>]. Mark only decisions you actually wrote back.
- Full loop: npx joplo share --review --format json (data.mode is "review"; give the user data.url) → reviewers comment, the owner decides → npx joplo feedback --format json → edit source → npx joplo check → commit → npx joplo share --review --format json to refresh the review link → npx joplo feedback --applied d1,d2 --ref "$(git rev-parse HEAD)".
- data.decisions items: { id, kind: pick|confirm_rule|reject_rule|answer, featureId, targetId, note, decidedAt, version }. targetId is the option id (pick), rule id (confirm_rule, reject_rule), or question id (answer); for answer, note is the answer.
- --ref works only together with --applied. --applied is idempotent; text output without --format json ends with a Next: line listing the ids.`,
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
