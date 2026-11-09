# UI recipes and pitfalls

## A prompt the audience can actually edit
PromptInput renders a native textarea. Arbitrary text is disposable exploration and follows the same first-input pause, bound value synchronization and reset/resume rules as other text fields. Captures and disabled prompts remain read-only. Keep submission in a declared click/press step or free reaction; editing alone does not call a model or send anything. Test a non-script phrase with a real keyboard, because replayed .type() does not prove that audience input works.

## Readable period interfaces
Make the working interface the subject: enlarge input text, action targets and visible results together, rather than using a large year beside a tiny window. A compact chapter label and one source line can carry context; keep the full attribution/license inventory with the assets.

For a collected CSS device frame, retain only licensed generic shell parts and record the adaptations; a later frame library is not evidence of a historical model. When CSS or fonts are embedded into an offline export, retain the applicable full license notices in that exported asset as well as in the repository. Scope and match the original selector specificity when resizing a speaker or button, otherwise an apparently correct override can lose to a library descendant rule. Use the rendered control dimensions to verify the override.

HTML text nodes may be wrapped in spans by this renderer. Avoid blanket descendant-span hiding to remove one note: it can also hide the main text. Remove the unwanted note from the authored tree or give that specific element a class. Device children with z-index can also overpaint a later sibling: give a transition scrim and its focal object explicit stacking levels and inspect the real pixels.

## Styling a collected interface library
Vendor only the required, redistributable CSS primitives; scope them under an authored root class. Exclude unverified bundled fonts, icon files and logos rather than treating the stylesheet's license as permission for all assets. Record the exact extraction and selector changes alongside retained licenses.

Choose --jp-stroke: clean in a project theme when CSS supplies historical borders and button bevels. UI components supply inline defaults for size, padding and color; a class alone may not win. Prefer documented props or explicit style overrides for ordinary cases. When a reusable vendor theme must own these values, narrowly scoped !important declarations can override just those defaults. Check computed styles, the actual rendered button and text contrast; do not globally change --jp-ink merely to tint a button.

Native inputs are the editable surface; their displayed text is not a real backend. A local send reaction can set ui.sent while the result bubble reads inputs.<fieldId>, so the audience sees their own text without copying it into script data. Use a named option.free object, give each reaction a stable key, and retain the deterministic send effects in a scenario. Verify the same reaction in the actual built site as well as the board; a valid script does not prove that publication retained local reaction data. Test a non-script phrase: an exact next action can commit the script instead, and an exact action belonging to another scenario can prompt to switch.


These examples use this explicitly enabled plugin. Engine flow/state/review rules remain in the engine skill.

## Controls over a visual story
- Use Image with asset() for the actual downloaded artwork; keep source/creator/license/modification details beside the files. CSS crop/opacity changes still belong in that record. Do not use a remote URL as an offline-image substitute.
- On a dark art background, Button's default filled variant may draw a Rough fill over your custom CSS. Use variant="subtle" when authoring the whole surface, set text size/color explicitly, and choose --jp-stroke: clean in the project theme when appropriate. A class does not automatically override component inline font/color values. Verify contrast, focus and hitbox after the final composition.
- Hover and dragging need a visible click alternative. A discrete timeline can use one draggable handle plus labeled endpoint buttons; keep the effects identical in both paths. Use a large enough drop zone and test it after the Canvas scales, not only at design resolution.

### authoring: worked example
```tsx
import { $, done, flow, option, page, set } from '@joplo-app/kit';
import { Alert, Button, Loader, Stack, TextInput } from '@joplo-app/plugin-ui';
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
```

From authoring:
Native UI controls need no free declaration: Tabs, Accordion, text inputs, Switch, Checkbox, Radio, Select and SegmentedControl change local values. A bound checked/value prop updates locally too, keeping two views of the same state synchronized. Keep the scripted result in step effects; do not store audience input or credentials in the source.

From authoring:
- layouts/app.tsx: export default layout(<AppShell header={{ height: 56 }} navbar={{ width: 240, breakpoint: 'sm' }}><AppShell.Navbar>…</AppShell.Navbar><AppShell.Main><Outlet/></AppShell.Main><Slot name="overlay"/></AppShell>).

From authoring:
- asset('./photo.jpg'): reads an image next to the calling file and returns a data URI for <Image src> or a CSS backgroundImage (see components).

From authoring:
- on: { '/members': { actions: <Button id="invite">Invite</Button> } }: add elements to a slot on an existing route.

From authoring:
- routes: { '/members/new': page({ title: 'New member' }, <Stack>…</Stack>) }: add a route for this option.

From authoring:
- Props can bind: <TextInput id="email" error={$.ui.emailError}/>, <Text>{$.data.name}</Text>.

From authoring:
- Overlays: <Modal id="dlg" opened={$.ui.open} title="…">; Drawer works the same way. Only opened controls visibility.

From authoring:
- Use Stack / Group / SimpleGrid / Grid props: <Group justify="space-between">, <SimpleGrid cols={{ base: 1, md: 3 }}>.

From authoring:
- Use responsive objects { base, xs, sm, md, lg, xl }, or visibleFrom="sm" / hiddenFrom="sm". AppShell collapses navigation below navbar.breakpoint.

From authoring:
- Set input labels directly: <TextInput id="email" label="Email"/>. Auto captions use them.

From demo:
- Drag begins on a declared drag target before stage pan/plugin orbit; Enter or Space on that target provides the scripted drag alternative. Pointerdown pauses immediately and lets the same drag finish. Hover never pauses playback, but matches normally while paused; touch activates hover by tapping and follows the pause-and-apply rule. Editable input keeps its first key, Space and arrow keys. The first wheel event pauses and scrolls; keep its inertia in the scroll area before stage zoom.

From demo:
- Each page has one device, desktop by default. page({ viewport: 'mobile' }, tree) uses a Phone frame at a fixed width of 390.

From demo:
- To show a phone turned sideways (a landscape app, a video player), write <Phone landscape> in a layer: the screen is 772 × 358 with the notch on the left.

From demo:
- Each layer tab shows an icon so viewers can tell layers apart when many tabs are squeezed: layer('Terminal', <Cli/>, { icon: 'terminal' }). Presets: window, browser, mobile, desktop, terminal, chat, agent, server, data, email, doc, flow. Default: mobile for mobile layers, otherwise window.

From demo:
  <Grid h="100%"><Grid.Col span={6}><Stack h="100%"><ScrollArea style={{ flex: 1, minHeight: 0 }}>Messages</ScrollArea>

From demo:
  <Group><PromptInput id="prompt"/><Button id="send">Send</Button></Group></Stack></Grid.Col></Grid>

From demo:
- The same applies to placeholders and artifacts: use h="100%" on Placeholder; Artifact fills its container by default.

From demo:
- What gets squeezed: in an h="100%" column, a Table, DataTable, or ScrollArea shrinks to the space left and scrolls inside. Rows stay in the DOM and check passes, but viewers see fewer rows.

From demo:
- .card('Title', { sub?, points?, role? }, ...effects): one large sentence filling the stage, as a step. Use for openings, endings, time jumps, and role switches.

From demo:
- Agent UI: <Thinking title={$.ui.thought} active={$.ui.thinking} duration="6 seconds">Process</Thinking> shows thinking;

From demo:
  <Artifact title="itinerary.md" kind="doc" status={$.ui.planStatus}>Content</Artifact> is a side artifact; reference it in the conversation with <Artifact.Ref id="…"/>.

From demo:
- Email: a simple external email card. The card is not interactive; buttons in its body use ordinary steps.

From demo:
  Example: <Email from="Camping assistant" to="Ajie" subject="Itinerary updated" time="Friday 20:05">Body</Email>.

From demo:
- DataCard / StateFlow: place in a separate layer and switch to it with shot. Only these two components show this step's changes and before/after values. StateFlow marks earlier states completed according to states order.

From demo:
  Example: layer('Itinerary data', <Stack><StateFlow value={$.data.trip.status} states={['draft','shared']} labels={{ draft: 'Draft', shared: 'Shared' }}/><DataCard title="Itinerary" value={$.data.trip} fields={[{ key: 'status', label: 'Status' }]}/></Stack>).

From demo:
- Filled buttons default to --jp-ink, so changing --jp-ink also recolors body text. There is no primary-color variable yet: set the brand color on the button itself, <Button color="#e8590c">, instead of overriding inline styles.

From focus:
  Skipped on purpose: modals and drawers (their backdrop already says it), DataCard / StateFlow (they show their own change), more than 3 changes at once, a new page or layer, the same element changing again or another line appended to the same log, and any step where you wrote a focus yourself.

From focus:
- Secrets and private data: <Code redact>sk-live-…</Code>, or redact={not($.ui.revealed)} to unblur after a step. Blurred, layout unchanged, on every step.

From check:
- Group props: label, icon (client, service, model, database, queue, storage, external, tool, user, cloud, gateway, lock, network, device, box, brain), tone (gray, blue, green, orange, red, purple, teal), group (parent id). Groups nest.

From check:
- IMAGE_PLACEHOLDER: <Image src> is a URL or plain path, which is never loaded. Put the file in the project and write src={asset('./photo.jpg')}.

From check:
- INVALID_IMAGE_FIT: <Image fit> accepts cover or contain.

From check:
An element that looks usable (Button, TextInput, Select, NavLink, a, …; see components) has an id but no step in any scenario of this option. Viewers will try it; decide what happens:

From focus:
  Skipped on purpose: modals and drawers (their backdrop already says it), DataCard / StateFlow (they show their own change), more than 3 changes at once, a new page or layer, the same element changing again or another line appended to the same log, and any step where you wrote a focus yourself.

From focus:
- Secrets and private data: <Code redact>sk-live-…</Code>, or redact={not($.ui.revealed)} to unblur after a step. Blurred, layout unchanged, on every step.

Common pitfall: Only catalog components and the listed HTML tags exist; <br/> is UNKNOWN_COMPONENT, so write 'Line 1\nLine 2' inside <Text>

Common pitfall: UI and HTML belong to this plugin: import author markers directly from @joplo-app/plugin-ui, explicitly enable ui in config.plugins, and read ui/components. The engine has no bare-name or old-IR compatibility layer.
<!-- joplo-skill 0.3.0 sha256:ca0dbf9b4ed602447fdb675f954c3d5ff8137fdcf6beb75c413383a1efb773ab -->
