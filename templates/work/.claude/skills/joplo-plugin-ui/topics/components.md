# UI component catalog

Import these markers from @joplo-app/plugin-ui; enable ui in config.plugins.

## AppShell
header={{ height }}, navbar={{ width, breakpoint, collapsed: { mobile, desktop } }}, aside={{ width, breakpoint, collapsed }}, footer={{ height }}, padding; navigation collapses below breakpoint and shows Burger

## AppShell.Header
Header; p, px

## AppShell.Navbar
Navigation sidebar; p; contains NavLink

## AppShell.Main
Main content; contains <Outlet />

## AppShell.Aside
Right sidebar; p

## AppShell.Footer
Footer; p

## Container
size: xs|sm|md|lg|xl|number (default md), fluid

## Stack
gap (default md), align, justify; vertical layout

## Group
gap (default md), justify, align (default center), wrap, grow; horizontal layout

## Flex
direction, gap, rowGap, columnGap, align, justify, wrap; all responsive

## Grid
columns (default 12), gutter, justify, align, grow; Grid.Col children

## Grid.Col
span: number|"auto"|"content"|{ base, md }, offset

## SimpleGrid
cols={{ base: 1, md: 3 }}, spacing, verticalSpacing

## Center
inline; centers content

## Box
Generic container; style props only

## Space
h, w; blank space

## Paper
p, withBorder, shadow, radius

## Card
padding (default md), withBorder, shadow, radius; Card.Section for edge-to-edge sections

## Card.Section
withBorder, inheritPadding

## Divider
label, labelPosition: left|center|right, orientation, my

## ScrollArea
h, mah

## Title
order: 1-6; text in children

## Text
size: xs|sm|md|lg|xl, c: dimmed|red|green|…, fw, ta, truncate, lineClamp, span; preserves newlines

## Code
block (multiline code block), color

## Kbd
Keyboard key

## Blockquote
cite, color

## List
type: ordered|unordered, spacing; List.Item children

## List.Item
List item

## Badge
color, variant: filled|light|outline|dot|default, size

## Avatar
name (shows first character), src, color, radius, size

## Image
src={asset("./photo.jpg")} (embeds a project image), alt, h, w, radius, fit: cover|contain (default cover), position (e.g. "center 20%"); other src values draw a placeholder with alt

```tsx
<Image src={asset('../../assets/capitol.jpg')} alt="U.S. Capitol" h={240} fit="cover" position="center 40%" radius="md" />
// import { asset } from '@joplo-app/kit'; the path is relative to this file. jpg/png/gif/webp/avif/svg, up to 2 MB each; compress first.
// The image is embedded, so the board, build and share show it offline. For a tinted or full-bleed background, use style={{ backgroundImage: `url(${asset('./bg.jpg')})` }}.
```

## ThemeIcon
color, variant, size, radius; one character as child

## Indicator
label, color, disabled (hides the badge; can be a condition), processing; wraps one element with a corner badge

## Timeline
active (completed item index), bulletSize; Timeline.Item children

## Timeline.Item
title, bullet; description in children

## Table
data={{ head: [...], body: [[...]] }} or Table.Thead/Tbody/Tr/Th/Td; striped, withTableBorder

## Table.Thead
Table head

## Table.Tbody
Table body

## Table.Tr
Row

## Table.Th
Header cell

## Table.Td
Cell

## DataTable
records (can bind $.data.x), columns: [{ accessor, title, textAlign, width, sortable, badge: true | { value: color }, avatar: true }], sortStatus: { columnAccessor, direction: asc|desc } (arrow only; set sorted records yourself), selectedRecords (ids, checkbox column), idAccessor (default id), fetching (loading overlay), noRecordsText; matches mantine-datatable

```tsx
<DataTable idAccessor="id" records={$.data.members} selectedRecords={$.ui.selected} fetching={$.ui.loading}
  sortStatus={{ columnAccessor: 'joined', direction: 'desc' }}
  columns={[{ accessor: 'name', title: 'Name', avatar: true }, { accessor: 'status', title: 'Status', badge: { Active: 'green', Pending: 'yellow', Expired: 'gray' } }, { accessor: 'joined', title: 'Joined', sortable: true }]} />
```

## Accordion
value / defaultValue (expanded item); select sets the expanded item; Accordion.Item children

## Accordion.Item
value; contains Accordion.Control and Accordion.Panel

## Accordion.Panel
Content shown when expanded

## Radio
value, label; place inside Radio.Group

## Tabs.List
Tab bar; contains Tabs.Tab

## Tabs.Panel
value; current tab content

## Breadcrumbs
separator; Anchor or text children

## Stepper
active (zero-based); Stepper.Step children

## Stepper.Step
label, description; step content in children (only current step shown)

## Alert
title, color (default blue), variant, icon (character), withCloseButton; description in children

## Loader
size, color, type; optional child text

## Progress
value 0-100, color, size, striped

## RingProgress
sections: [{ value, color }], label, size, thickness

## Skeleton
h, w, circle, radius, visible (false shows children), animate (pulse, default true)

## Notification
title, color, icon (character), loading, withCloseButton, position: top|top-left|top-right|bottom|bottom-left|bottom-right (floats over the page; show it with when); inline without position; Buttons in children (e.g. Undo)

```tsx
<Notification when={$.ui.deleted} position="bottom" title="Invite revoked" icon="↺" withCloseButton={false}>
  <Group justify="space-between">Ana can no longer join<Button id="undo" variant="subtle" size="xs">Undo</Button></Group>
</Notification>
```

## Modal
opened (gated, usually opened={$.ui.open}), title, size, centered, fullScreen

```tsx
<Modal id="confirm" opened={$.ui.confirm} title="Revoke this invite?" size="sm">
  <Text>Ana's link stops working right away. You can invite her again later.</Text>
  <Group justify="flex-end"><Button id="cancel_revoke" variant="default">Cancel</Button><Button id="do_revoke" color="red">Revoke</Button></Group>
</Modal>
```

## Drawer
opened (gated), title, position: left|right|top|bottom (default left), size

## ChatMessage
from: 'user'|'assistant', name; message content in children (preserves newlines)

## ToolCall
title, state: 'running'|'done'|'error'; call details in children

## Email
from, to, subject, time; simple email card, body in children; can contain Button

## DataCard
title, value (object or state binding), fields?: [{ key, label }]; lists all keys by default; rows changed this step show old value → new value

## StateFlow
value (current state binding), states: string[], labels?: { state: name }; earlier states are completed, current state highlighted

## Thinking
title (current thought; can bind $.ui.x), active (thinking: title pulses), duration (shows "Thought for …" when finished), opened (expands the process); thinking process in children

## Artifact
title, kind: 'doc'|'code'|'sheet'|'web'|'image', status: 'generating'|'ready'|'error', version; Agent artifact side panel, content in children

## Terminal
title; terminal window (CLI prototype), Terminal.Command / Terminal.Output / Terminal.Input children; scrolls internally when content exceeds h or mah

## Terminal.Command
prompt (default "$"); command text in children

## Terminal.Output
tone: 'plain'|'ok'|'warn'|'error' (default plain); output text in children (preserves newlines)

## Phone
scale (visual scale, default 1), h (screen height, default 844), landscape (turned sideways: content 772 × 358, notch on the left; use it for video-style or landscape mobile screens); phone frame, children laid out at mobile width 390 with breakpoints based on that width; viewport: "mobile" on a page adds it automatically; do not add Phone explicitly

## div
HTML fallback; prefer Box/Stack/Group

## span
HTML fallback; prefer Text span

## p
HTML fallback; prefer Text

## h1
HTML fallback; prefer Title order={1}

## h2
HTML fallback; prefer Title order={2}

## h3
HTML fallback; prefer Title order={3}

## h4
HTML fallback; prefer Title order={4}

## main
HTML fallback; prefer AppShell.Main

## section
HTML fallback; prefer Box

## header
HTML fallback; prefer AppShell.Header

## footer
HTML fallback; prefer AppShell.Footer

## nav
HTML fallback; prefer AppShell.Navbar

## aside
HTML fallback; prefer AppShell.Aside

## ul
HTML fallback; prefer List

## ol
HTML fallback; prefer List type="ordered"

## li
HTML fallback; prefer List.Item

## strong
HTML fallback; prefer Text fw={700} span

## em
HTML fallback; prefer Text fs="italic" span

## small
HTML fallback; prefer Text size="xs"

## code
HTML fallback; prefer Code

## Avatar.Group
spacing (overlap, default sm); Avatar children shown as an overlapping stack

```tsx
<Avatar.Group><Avatar name="Ana Lee" /><Avatar name="Bo Chen" /><Avatar name="+3" /></Avatar.Group>
```

## Radio.Card
value, label, description, leftSection (character); selectable card inside Radio.Group (select writes the group value)

```tsx
<Radio.Group id="plan" label="Plan">
  <Stack gap="xs">
    <Radio.Card value="team" label="Team" description="Up to 10 seats" leftSection="👥" />
    <Radio.Card value="pro" label="Pro" description="Unlimited seats" leftSection="★" />
  </Stack>
</Radio.Group>
// steps: .select('plan', 'pro')
```

## EmptyState
icon (character), title, description, withBorder, color; empty lists, 404 / expired / no-access pages, result pages; action Buttons in children

```tsx
<EmptyState icon="✉" title="No members yet" description="Invite teammates to start working together">
  <Button id="invite_first">Invite members</Button>
</EmptyState>
```

## ListRow
avatar (name) or icon (character), title, description, active, withBorder, color; list row with right-side content (Badge, Button, Text) in children; not clickable itself: use NavLink for a tappable row

```tsx
<Stack gap={0}>
  <ListRow avatar="Ana Lee" title="Ana Lee" description="ana@example.com"><Badge color="green" variant="light">Admin</Badge></ListRow>
  <ListRow avatar="Bo Chen" title="Bo Chen" description={$.ui.boStatus} active={$.ui.boNew}><Button id="resend" variant="subtle">Resend</Button></ListRow>
</Stack>
```

## Stat
label, value, diff (e.g. "+12%", red when it starts with -), description, icon, color, progress (0-100); KPI card

```tsx
<SimpleGrid cols={3}>
  <Stat label="Signups this week" value={$.data.signups} diff="+12%" icon="↗" />
  <Stat label="Seats used" value="8 / 10" progress={80} description="2 seats left" />
  <Stat label="Failed payments" value="3" diff="-2" color="red" />
</SimpleGrid>
```

## KeyValue
items: [{ label, value }] (values can bind $.data.x), total (bold last row), withDivider; order summary / details list

```tsx
<KeyValue withDivider total items={[{ label: 'Seats', value: '5 × $9' }, { label: 'Tax', value: '$4.50' }, { label: 'Total', value: $.data.total }]} />
```

## BarChart
data: [{ month: "Jan", signups: 40 }] (can bind $.data.x), dataKey (x axis), series: [{ name, label?, color? }], h (default 220), unit, withLegend; low-fi bars, values animate when data changes

```tsx
<BarChart h={220} dataKey="week" unit="" data={$.data.weeks} series={[{ name: 'signups', label: 'Signups' }, { name: 'churn', label: 'Churn', color: 'red' }]} />
// state: data: { weeks: [{ week: 'W1', signups: 40, churn: 4 }, { week: 'W2', signups: 52, churn: 6 }] }; set() a new array to animate
```

## LineChart
same props as BarChart; low-fi lines with points

```tsx
<LineChart h={200} dataKey="day" data={[{ day: 'Mon', p95: 320 }, { day: 'Tue', p95: 280 }]} series={[{ name: 'p95', label: 'p95 latency' }]} unit="ms" />
```

## Menu
opened (usually opened={$.ui.menu}; dropdown shows only when true), position: bottom-start|bottom-end|top-start|top-end; Menu.Target + Menu.Dropdown children

```tsx
<Menu opened={$.ui.rowMenu} position="bottom-end">
  <Menu.Target><ActionIcon id="row_more" aria-label="More actions">⋯</ActionIcon></Menu.Target>
  <Menu.Dropdown>
    <Menu.Item id="copy_link" leftSection="🔗">Copy invite link</Menu.Item>
    <Menu.Divider />
    <Menu.Item id="revoke" color="red" leftSection="✕">Revoke invite</Menu.Item>
  </Menu.Dropdown>
</Menu>
// steps: .click('row_more', set($.ui.rowMenu, true)).click('revoke', set($.ui.rowMenu, false), set($.ui.confirm, true))
```

## Menu.Target
Wraps the trigger (ActionIcon or Button with its own id)

## Menu.Dropdown
Menu items; visible only while the Menu is opened; floats above tables and cards

## Menu.Label
Section label inside Menu.Dropdown

## Menu.Divider
Divider inside Menu.Dropdown

## Placeholder
label, h; placeholder for images, charts, etc.

## Board
dots (dotted paper, default true); a whiteboard: place screens, notes and arrows on it with pos="absolute" top / left (design px). Put it inside content:Canvas to move the camera between screens

```tsx
<Canvas w={2400} h={1400}>
  <Board>
    <BrowserWindow id="login" label="1. Sign in" url="app.com/login" pos="absolute" top={200} left={120} w={520} h={400}>
      <Stack p="lg"><TextInput id="email" label="Email" /><Button id="send">Send link</Button></Stack>
    </BrowserWindow>
    <BrowserWindow id="sent" label="2. Check email" pos="absolute" top={200} left={800} w={520} h={400} when={$.ui.sent}>…</BrowserWindow>
    <Arrow id="a_send" from="send" to="sent" label="send" when={$.ui.sent} />
    <Note id="n_privacy" pos="absolute" top={660} left={140} color="pink">Unknown email? Still say "sent"</Note>
  </Board>
</Canvas>
```

## BrowserWindow
url, label (caption above the frame, e.g. "1. Sign in"), w, h; a browser window frame for one screen on a Board; children are its page

## Note
color (yellow default; pink, blue, green, gray), rotate (degrees, default -2), w; a sticky note that stays on the Board; children = text

## Arrow
from, to (ids of elements on the same Board), label, bend (-1…1, default 0.25), dashed, color; a persistent arrow between two elements; direct child of Board, reveal it with when

## Button
variant: filled|light|outline|subtle|default|white, color, size, fullWidth, loading, leftSection / rightSection (character)

## ActionIcon
Icon button: aria-label (required as name), variant, color, size; one character child such as '+'

## CloseButton
aria-label, size

## Anchor
href is display-only; clicking never navigates; use go() in the step; c, underline

## a
HTML fallback; prefer Anchor

## NavLink
label, description, href (highlighted when equal to current route), active, leftSection / rightSection (character or short text); nested NavLink allowed

## Burger
opened, aria-label; narrow-screen navigation toggle, usually with hiddenFrom="sm"

## TextInput
label, placeholder, description, error, withAsterisk, type; type action writes the value

## PasswordInput
label, placeholder, description, error; type action writes the value, shown as dots

## NumberInput
label, placeholder, min, max, suffix, prefix; type action writes the value

## Textarea
label, placeholder, description, error, minRows, autosize; type action writes the value

## Select
label, data: string[] | { value, label }[], placeholder, description; select accepts value or label

## MultiSelect
label, data, placeholder; each select toggles one option

## Checkbox
label, description, checked; toggle action writes the value

## Radio.Group
label, value; Radio value/label children; select accepts value or label

## Switch
label, description, checked; toggle action writes the value

## SegmentedControl
data: string[] | { value, label }[], fullWidth; select accepts value or label

## FileInput
label, placeholder, accept; type action writes the filename

## Tabs
value / defaultValue; Tabs.Tab inside Tabs.List, content in Tabs.Panel; select switches tabs

## Tabs.Tab
value, leftSection (character), rightSection (count or short text, e.g. 3)

## Accordion.Control
Clickable heading (requires id)

## Pagination
total, value / defaultValue; select action writes the page number

## PromptInput
placeholder, value; native multiline AI input, type action writes the value; audience edits are disposable exploration; use ActionIcon or Button to send

## Artifact.Ref
title, kind, status; card linking to an artifact in the conversation (requires id; clickable)

## Terminal.Input
prompt (default "$"), placeholder; terminal input line (requires id), type action writes the value

## Menu.Item
leftSection (character), rightSection (text), color (red for destructive); clickable menu row (requires id)

## TabBar
data: string[] | [{ value, label, icon?, badge? }], value / defaultValue, aria-label; mobile bottom tab bar, select switches tabs; place it last in a full-height Stack

```tsx
<Stack h="100%" gap={0}>
  <ScrollArea style={{ flex: 1, minHeight: 0 }}>…page…</ScrollArea>
  <TabBar id="tabs" aria-label="Bottom navigation" data={[{ value: 'home', label: 'Home', icon: '⌂' }, { value: 'trips', label: 'Trips', icon: '⛺', badge: 2 }, { value: 'me', label: 'Me', icon: '☺' }]} />
</Stack>
// steps: .select('tabs', 'trips', go('/trips'))
```
<!-- joplo-skill 0.6.0 sha256:ad699fadea2fbcef8e18e38d92b2caa00f9bf431621b10954d1cf8e26887d1b0 -->
