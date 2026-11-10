/**
 * 第一方 UI 组件目录（D35 / D87）：名称与属性对齐 Mantine（数据表对齐 mantine-datatable），另加少量 AI 交互组件、
 * HTML 兜底标签和 Joplo 专用组件。复合组件用点语法：`<AppShell.Header>` 编译出的节点 type 是 'ui:AppShell.Header'。
 *
 * 目录是唯一来源：@joplo-app/plugin-ui 的导出、同包 runtime 的实现、COMPONENT_DOCS 都必须与 COMPONENT_TYPES 一致
 * （packages/core/test/catalog.test.ts 与渲染器的类型检查保证）。目录之外的名称在编译时报错，不会被静默渲染。
 * 只换词汇，不换渲染：运行时不引入 Mantine，仍由 Joplo 渲染成低保真风格。
 */

/** HTML 兜底标签（不可操作）；`a` 在 INTERACTIVE 里。目录之外的标签（br、img、button、input…）报 UNKNOWN_COMPONENT。 */
const HTML = ['div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'main', 'section', 'header', 'footer', 'nav', 'aside', 'ul', 'ol', 'li', 'strong', 'em', 'small', 'code'] as const;
export const HTML_TAGS: readonly string[] = [...HTML, 'a'];

/** 布局、展示与容器：不可操作。 */
const STRUCTURE = [
  // 布局
  'AppShell', 'AppShell.Header', 'AppShell.Navbar', 'AppShell.Main', 'AppShell.Aside', 'AppShell.Footer',
  'Container', 'Stack', 'Group', 'Flex', 'Grid', 'Grid.Col', 'SimpleGrid', 'Center', 'Box', 'Space',
  'Paper', 'Card', 'Card.Section', 'Divider', 'ScrollArea',
  // 文字与展示
  'Title', 'Text', 'Code', 'Kbd', 'Blockquote', 'List', 'List.Item', 'Badge', 'Avatar', 'Image', 'ThemeIcon', 'Indicator',
  'Timeline', 'Timeline.Item',
  'Table', 'Table.Thead', 'Table.Tbody', 'Table.Tr', 'Table.Th', 'Table.Td', 'DataTable',
  'Accordion', 'Accordion.Item', 'Accordion.Panel',
  'Radio',
  // 导航
  'Tabs.List', 'Tabs.Panel', 'Breadcrumbs', 'Stepper', 'Stepper.Step',
  // 反馈与浮层
  'Alert', 'Loader', 'Progress', 'RingProgress', 'Skeleton', 'Notification', 'Modal', 'Drawer',
  // AI 交互（Joplo 自有）
  'ChatMessage', 'ToolCall', 'Thinking', 'Artifact', 'Email', 'DataCard', 'StateFlow',
  // 设备外框（Joplo 自有）：终端与手机
  'Terminal', 'Terminal.Command', 'Terminal.Output', 'Phone',
  // 产品界面（D68）：官网示例里反复手拼的常见界面，名字能对齐 Mantine 的就对齐（Menu、Avatar.Group、Radio.Card、BarChart、LineChart）
  'Avatar.Group', 'Radio.Card', 'EmptyState', 'ListRow', 'Stat', 'KeyValue', 'BarChart', 'LineChart',
  'Menu', 'Menu.Target', 'Menu.Dropdown', 'Menu.Label', 'Menu.Divider',
  // HTML 兜底
  ...HTML,
  // Joplo
  'Placeholder', // props: label, h —— 图片/图表等占位
  // 白板（D96）：一块白板上摆多屏画面，箭头连成流程，便签写说明
  'Board', 'BrowserWindow', 'Note', 'Arrow',
] as const;

/** 看起来可操作：必须有演示行为、明确禁用并说明原因，或标记 unmodeled。 */
const INTERACTIVE = [
  'Button', 'ActionIcon', 'CloseButton', 'Anchor', 'a', 'NavLink', 'Burger',
  'TextInput', 'PasswordInput', 'NumberInput', 'Textarea', 'Select', 'MultiSelect', 'Checkbox', 'Radio.Group', 'Switch',
  'SegmentedControl', 'FileInput', 'Tabs', 'Tabs.Tab', 'Accordion.Control', 'Pagination', 'PromptInput', 'Terminal.Input',
  'Artifact.Ref',
  // 产品界面（D68）
  'Menu.Item', 'TabBar',
] as const;

export const COMPONENT_TYPES = [...STRUCTURE, ...INTERACTIVE] as const;
export type ComponentType = (typeof COMPONENT_TYPES)[number];

export const INTERACTIVE_TYPES: ReadonlySet<string> = new Set<string>(INTERACTIVE);

/** 可接收输入值；type/select/toggle 动作写入 state.inputs[nodeId]。 */
export const VALUE_TYPES: ReadonlySet<string> = new Set<string>([
  'TextInput', 'PasswordInput', 'NumberInput', 'Textarea', 'Select', 'MultiSelect', 'Checkbox', 'Radio.Group', 'Switch',
  'SegmentedControl', 'FileInput', 'Tabs', 'Accordion', 'Pagination', 'PromptInput', 'Terminal.Input', 'TabBar',
]);

/**
 * 只有 opened（兼容旧写法 open）为真时自身和子节点才可见的浮层。
 * Menu.Dropdown（D68）：作者把 opened 写在 Menu 上（与 Mantine 一致），编译器把它抄到菜单里的 Menu.Dropdown 上。
 */
export const GATED_CONTAINERS: ReadonlySet<string> = new Set<string>(['Modal', 'Drawer', 'Menu.Dropdown']);

/**
 * 每个组件一行常用属性提示（`joplo skill components` 由此生成）。所有组件另外都接受：
 * 样式属性 m/mt/mb/ml/mr/mx/my、p/pt/pb/pl/pr/px/py、w/h/miw/maw/mih/mah、pos/top/left/right/bottom、c/bg/fz/fw/ta/ff/lh/opacity，
 * 响应式写成 { base, xs, sm, md, lg, xl }；visibleFrom / hiddenFrom；以及 Joplo 属性 id/when/disabled/disabledReason/unmodeled/note。
 */
export const COMPONENT_DOCS: Record<ComponentType, string> = {
  AppShell: 'header={{ height }}, navbar={{ width, breakpoint, collapsed: { mobile, desktop } }}, aside={{ width, breakpoint, collapsed }}, footer={{ height }}, padding; navigation collapses below breakpoint and shows Burger',
  'AppShell.Header': 'Header; p, px',
  'AppShell.Navbar': 'Navigation sidebar; p; contains NavLink',
  'AppShell.Main': 'Main content; contains <Outlet />',
  'AppShell.Aside': 'Right sidebar; p',
  'AppShell.Footer': 'Footer; p',
  Container: 'size: xs|sm|md|lg|xl|number (default md), fluid',
  Stack: 'gap (default md), align, justify; vertical layout',
  Group: 'gap (default md), justify, align (default center), wrap, grow; horizontal layout',
  Flex: 'direction, gap, rowGap, columnGap, align, justify, wrap; all responsive',
  Grid: 'columns (default 12), gutter, justify, align, grow; Grid.Col children',
  'Grid.Col': 'span: number|"auto"|"content"|{ base, md }, offset',
  SimpleGrid: 'cols={{ base: 1, md: 3 }}, spacing, verticalSpacing',
  Center: 'inline; centers content',
  Box: 'Generic container; style props only',
  Space: 'h, w; blank space',
  Paper: 'p, withBorder, shadow, radius',
  Card: 'padding (default md), withBorder, shadow, radius; Card.Section for edge-to-edge sections',
  'Card.Section': 'withBorder, inheritPadding',
  Divider: 'label, labelPosition: left|center|right, orientation, my',
  ScrollArea: 'h, mah',
  Title: 'order: 1-6; text in children',
  Text: 'size: xs|sm|md|lg|xl, c: dimmed|red|green|…, fw, ta, truncate, lineClamp, span; preserves newlines',
  Code: 'block (multiline code block), color',
  Kbd: 'Keyboard key',
  Blockquote: 'cite, color',
  List: 'type: ordered|unordered, spacing; List.Item children',
  'List.Item': 'List item',
  Badge: 'color, variant: filled|light|outline|dot|default, size',
  Avatar: 'name (shows first character), src, color, radius, size',
  Image: 'src={asset("./photo.jpg")} (embeds a project image), alt, h, w, radius, fit: cover|contain (default cover), position (e.g. "center 20%"); other src values draw a placeholder with alt',
  ThemeIcon: 'color, variant, size, radius; one character as child',
  Indicator: 'label, color, disabled (hides the badge; can be a condition), processing; wraps one element with a corner badge',
  Timeline: 'active (completed item index), bulletSize; Timeline.Item children',
  'Timeline.Item': 'title, bullet; description in children',
  Table: 'data={{ head: [...], body: [[...]] }} or Table.Thead/Tbody/Tr/Th/Td; striped, withTableBorder',
  'Table.Thead': 'Table head',
  'Table.Tbody': 'Table body',
  'Table.Tr': 'Row',
  'Table.Th': 'Header cell',
  'Table.Td': 'Cell',
  DataTable: 'records (can bind $.data.x), columns: [{ accessor, title, textAlign, width, sortable, badge: true | { value: color }, avatar: true }], sortStatus: { columnAccessor, direction: asc|desc } (arrow only; set sorted records yourself), selectedRecords (ids, checkbox column), idAccessor (default id), fetching (loading overlay), noRecordsText; matches mantine-datatable',
  Accordion: 'value / defaultValue (expanded item); select sets the expanded item; Accordion.Item children',
  'Accordion.Item': 'value; contains Accordion.Control and Accordion.Panel',
  'Accordion.Panel': 'Content shown when expanded',
  Radio: 'value, label; place inside Radio.Group',
  'Tabs.List': 'Tab bar; contains Tabs.Tab',
  'Tabs.Panel': 'value; current tab content',
  Breadcrumbs: 'separator; Anchor or text children',
  Stepper: 'active (zero-based); Stepper.Step children',
  'Stepper.Step': 'label, description; step content in children (only current step shown)',
  Alert: 'title, color (default blue), variant, icon (character), withCloseButton; description in children',
  Loader: 'size, color, type; optional child text',
  Progress: 'value 0-100, color, size, striped',
  RingProgress: 'sections: [{ value, color }], label, size, thickness',
  Skeleton: 'h, w, circle, radius, visible (false shows children), animate (pulse, default true)',
  Notification: 'title, color, icon (character), loading, withCloseButton, position: top|top-left|top-right|bottom|bottom-left|bottom-right (floats over the page; show it with when); inline without position; Buttons in children (e.g. Undo)',
  Modal: 'opened (gated, usually opened={$.ui.open}), title, size, centered, fullScreen',
  Drawer: 'opened (gated), title, position: left|right|top|bottom (default left), size',
  ChatMessage: "from: 'user'|'assistant', name; message content in children (preserves newlines)",
  ToolCall: "title, state: 'running'|'done'|'error'; call details in children",
  Email: 'from, to, subject, time; simple email card, body in children; can contain Button',
  DataCard: 'title, value (object or state binding), fields?: [{ key, label }]; lists all keys by default; rows changed this step show old value → new value',
  StateFlow: 'value (current state binding), states: string[], labels?: { state: name }; earlier states are completed, current state highlighted',
  Thinking: 'title (current thought; can bind $.ui.x), active (thinking: title pulses), duration (shows "Thought for …" when finished), opened (expands the process); thinking process in children',
  Artifact: "title, kind: 'doc'|'code'|'sheet'|'web'|'image', status: 'generating'|'ready'|'error', version; Agent artifact side panel, content in children",
  Terminal: 'title; terminal window (CLI prototype), Terminal.Command / Terminal.Output / Terminal.Input children; scrolls internally when content exceeds h or mah',
  'Terminal.Command': 'prompt (default "$"); command text in children',
  'Terminal.Output': "tone: 'plain'|'ok'|'warn'|'error' (default plain); output text in children (preserves newlines)",
  Phone: 'scale (visual scale, default 1), h (screen height, default 844), landscape (turned sideways: content 772 × 358, notch on the left; use it for video-style or landscape mobile screens); phone frame, children laid out at mobile width 390 with breakpoints based on that width; viewport: "mobile" on a page adds it automatically; do not add Phone explicitly',
  div: 'HTML fallback; supports data-*, aria-*, role and title (data-j* reserved); prefer Box/Stack/Group',
  span: 'HTML fallback; prefer Text span',
  p: 'HTML fallback; prefer Text',
  h1: 'HTML fallback; prefer Title order={1}',
  h2: 'HTML fallback; prefer Title order={2}',
  h3: 'HTML fallback; prefer Title order={3}',
  h4: 'HTML fallback; prefer Title order={4}',
  main: 'HTML fallback; prefer AppShell.Main',
  section: 'HTML fallback; prefer Box',
  header: 'HTML fallback; prefer AppShell.Header',
  footer: 'HTML fallback; prefer AppShell.Footer',
  nav: 'HTML fallback; prefer AppShell.Navbar',
  aside: 'HTML fallback; prefer AppShell.Aside',
  ul: 'HTML fallback; prefer List',
  ol: 'HTML fallback; prefer List type="ordered"',
  li: 'HTML fallback; prefer List.Item',
  strong: 'HTML fallback; prefer Text fw={700} span',
  em: 'HTML fallback; prefer Text fs="italic" span',
  small: 'HTML fallback; prefer Text size="xs"',
  code: 'HTML fallback; prefer Code',
  'Avatar.Group': 'spacing (overlap, default sm); Avatar children shown as an overlapping stack',
  'Radio.Card': 'value, label, description, leftSection (character); selectable card inside Radio.Group (select writes the group value)',
  EmptyState: 'icon (character), title, description, withBorder, color; empty lists, 404 / expired / no-access pages, result pages; action Buttons in children',
  ListRow: 'avatar (name) or icon (character), title, description, active, withBorder, color; list row with right-side content (Badge, Button, Text) in children; not clickable itself: use NavLink for a tappable row',
  Stat: 'label, value, diff (e.g. "+12%", red when it starts with -), description, icon, color, progress (0-100); KPI card',
  KeyValue: 'items: [{ label, value }] (values can bind $.data.x), total (bold last row), withDivider; order summary / details list',
  BarChart: 'data: [{ month: "Jan", signups: 40 }] (can bind $.data.x), dataKey (x axis), series: [{ name, label?, color? }], h (default 220), unit, withLegend; low-fi bars, values animate when data changes',
  LineChart: 'same props as BarChart; low-fi lines with points',
  Menu: 'opened (usually opened={$.ui.menu}; dropdown shows only when true), position: bottom-start|bottom-end|top-start|top-end; Menu.Target + Menu.Dropdown children',
  'Menu.Target': 'Wraps the trigger (ActionIcon or Button with its own id)',
  'Menu.Dropdown': 'Menu items; visible only while the Menu is opened; floats above tables and cards',
  'Menu.Label': 'Section label inside Menu.Dropdown',
  'Menu.Divider': 'Divider inside Menu.Dropdown',
  Placeholder: 'label, h; placeholder for images, charts, etc.',
  Board: 'dots (dotted paper, default true); a whiteboard: place screens, notes and arrows on it with pos="absolute" top / left (design px). Put it inside content:Canvas to move the camera between screens',
  BrowserWindow: 'url, label (caption above the frame, e.g. "1. Sign in"), w, h; a browser window frame for one screen on a Board; children are its page',
  Note: 'color (yellow default; pink, blue, green, gray), rotate (degrees, default -2), w; a sticky note that stays on the Board; children = text',
  Arrow: 'from, to (ids of elements on the same Board), label, bend (-1…1, default 0.25), dashed, color; a persistent arrow between two elements; direct child of Board, reveal it with when',
  Button: 'variant: filled|light|outline|subtle|default|white, color, size, fullWidth, loading, leftSection / rightSection (character)',
  ActionIcon: "Icon button: aria-label (required as name), variant, color, size; one character child such as '+'",
  CloseButton: 'aria-label, size',
  Anchor: 'href is display-only; clicking never navigates; use go() in the step; c, underline',
  a: 'HTML fallback; prefer Anchor',
  NavLink: 'label, description, href (highlighted when equal to current route), active, leftSection / rightSection (character or short text); nested NavLink allowed',
  Burger: 'opened, aria-label; narrow-screen navigation toggle, usually with hiddenFrom="sm"',
  TextInput: 'label, placeholder, description, error, withAsterisk, type; type action writes the value',
  PasswordInput: 'label, placeholder, description, error; type action writes the value, shown as dots',
  NumberInput: 'label, placeholder, min, max, suffix, prefix; type action writes the value',
  Textarea: 'label, placeholder, description, error, minRows, autosize; type action writes the value',
  Select: 'label, data: string[] | { value, label }[], placeholder, description; select accepts value or label',
  MultiSelect: 'label, data, placeholder; each select toggles one option',
  Checkbox: 'label, description, checked; toggle action writes the value',
  'Radio.Group': 'label, value; Radio value/label children; select accepts value or label',
  Switch: 'label, description, checked; toggle action writes the value',
  SegmentedControl: 'data: string[] | { value, label }[], fullWidth; select accepts value or label',
  FileInput: 'label, placeholder, accept; type action writes the filename',
  Tabs: 'value / defaultValue; Tabs.Tab inside Tabs.List, content in Tabs.Panel; select switches tabs',
  'Tabs.Tab': 'value, leftSection (character), rightSection (count or short text, e.g. 3)',
  'Accordion.Control': 'Clickable heading (requires id)',
  Pagination: 'total, value / defaultValue; select action writes the page number',
  PromptInput: 'placeholder, value; native multiline AI input, type action writes the value; audience edits are disposable exploration; use ActionIcon or Button to send',
  'Artifact.Ref': "title, kind, status; card linking to an artifact in the conversation (requires id; clickable)",
  'Terminal.Input': 'prompt (default "$"), placeholder; terminal input line (requires id), type action writes the value',
  'Menu.Item': 'leftSection (character), rightSection (text), color (red for destructive); clickable menu row (requires id)',
  TabBar: 'data: string[] | [{ value, label, icon?, badge? }], value / defaultValue, aria-label; mobile bottom tab bar, select switches tabs; place it last in a full-height Stack',
};

/**
 * 示例（D68，`npx joplo components <名字>` 输出）：每个都能直接放进页面或层级里用；交互状态写成 $.ui / $.data 绑定，由步骤 set()。
 * 只给最容易写错、或需要和步骤配合的组件；其余组件看 COMPONENT_DOCS 的一行提示就够。
 */
export const COMPONENT_EXAMPLES: Partial<Record<ComponentType, string>> = {
  Board: `<Canvas w={2400} h={1400}>
  <Board>
    <BrowserWindow id="login" label="1. Sign in" url="app.com/login" pos="absolute" top={200} left={120} w={520} h={400}>
      <Stack p="lg"><TextInput id="email" label="Email" /><Button id="send">Send link</Button></Stack>
    </BrowserWindow>
    <BrowserWindow id="sent" label="2. Check email" pos="absolute" top={200} left={800} w={520} h={400} when={$.ui.sent}>…</BrowserWindow>
    <Arrow id="a_send" from="send" to="sent" label="send" when={$.ui.sent} />
    <Note id="n_privacy" pos="absolute" top={660} left={140} color="pink">Unknown email? Still say "sent"</Note>
  </Board>
</Canvas>`,
  EmptyState: `<EmptyState icon="✉" title="No members yet" description="Invite teammates to start working together">
  <Button id="invite_first">Invite members</Button>
</EmptyState>`,
  ListRow: `<Stack gap={0}>
  <ListRow avatar="Ana Lee" title="Ana Lee" description="ana@example.com"><Badge color="green" variant="light">Admin</Badge></ListRow>
  <ListRow avatar="Bo Chen" title="Bo Chen" description={$.ui.boStatus} active={$.ui.boNew}><Button id="resend" variant="subtle">Resend</Button></ListRow>
</Stack>`,
  Menu: `<Menu opened={$.ui.rowMenu} position="bottom-end">
  <Menu.Target><ActionIcon id="row_more" aria-label="More actions">⋯</ActionIcon></Menu.Target>
  <Menu.Dropdown>
    <Menu.Item id="copy_link" leftSection="🔗">Copy invite link</Menu.Item>
    <Menu.Divider />
    <Menu.Item id="revoke" color="red" leftSection="✕">Revoke invite</Menu.Item>
  </Menu.Dropdown>
</Menu>
// steps: .click('row_more', set($.ui.rowMenu, true)).click('revoke', set($.ui.rowMenu, false), set($.ui.confirm, true))`,
  TabBar: `<Stack h="100%" gap={0}>
  <ScrollArea style={{ flex: 1, minHeight: 0 }}>…page…</ScrollArea>
  <TabBar id="tabs" aria-label="Bottom navigation" data={[{ value: 'home', label: 'Home', icon: '⌂' }, { value: 'trips', label: 'Trips', icon: '⛺', badge: 2 }, { value: 'me', label: 'Me', icon: '☺' }]} />
</Stack>
// steps: .select('tabs', 'trips', go('/trips'))`,
  Stat: `<SimpleGrid cols={3}>
  <Stat label="Signups this week" value={$.data.signups} diff="+12%" icon="↗" />
  <Stat label="Seats used" value="8 / 10" progress={80} description="2 seats left" />
  <Stat label="Failed payments" value="3" diff="-2" color="red" />
</SimpleGrid>`,
  KeyValue: `<KeyValue withDivider total items={[{ label: 'Seats', value: '5 × $9' }, { label: 'Tax', value: '$4.50' }, { label: 'Total', value: $.data.total }]} />`,
  Image: `<Image src={asset('../../assets/capitol.jpg')} alt="U.S. Capitol" h={240} fit="cover" position="center 40%" radius="md" />
// import { asset } from '@joplo-app/kit'; the path is relative to this file. jpg/png/gif/webp/avif/svg, up to 2 MB each; compress first.
// The image is embedded, so the board, build and share show it offline. For a tinted or full-bleed background, use style={{ backgroundImage: \`url(\${asset('./bg.jpg')})\` }}.`,
  BarChart: `<BarChart h={220} dataKey="week" unit="" data={$.data.weeks} series={[{ name: 'signups', label: 'Signups' }, { name: 'churn', label: 'Churn', color: 'red' }]} />
// state: data: { weeks: [{ week: 'W1', signups: 40, churn: 4 }, { week: 'W2', signups: 52, churn: 6 }] }; set() a new array to animate`,
  LineChart: `<LineChart h={200} dataKey="day" data={[{ day: 'Mon', p95: 320 }, { day: 'Tue', p95: 280 }]} series={[{ name: 'p95', label: 'p95 latency' }]} unit="ms" />`,
  DataTable: `<DataTable idAccessor="id" records={$.data.members} selectedRecords={$.ui.selected} fetching={$.ui.loading}
  sortStatus={{ columnAccessor: 'joined', direction: 'desc' }}
  columns={[{ accessor: 'name', title: 'Name', avatar: true }, { accessor: 'status', title: 'Status', badge: { Active: 'green', Pending: 'yellow', Expired: 'gray' } }, { accessor: 'joined', title: 'Joined', sortable: true }]} />`,
  Notification: `<Notification when={$.ui.deleted} position="bottom" title="Invite revoked" icon="↺" withCloseButton={false}>
  <Group justify="space-between">Ana can no longer join<Button id="undo" variant="subtle" size="xs">Undo</Button></Group>
</Notification>`,
  'Radio.Card': `<Radio.Group id="plan" label="Plan">
  <Stack gap="xs">
    <Radio.Card value="team" label="Team" description="Up to 10 seats" leftSection="👥" />
    <Radio.Card value="pro" label="Pro" description="Unlimited seats" leftSection="★" />
  </Stack>
</Radio.Group>
// steps: .select('plan', 'pro')`,
  'Avatar.Group': `<Avatar.Group><Avatar name="Ana Lee" /><Avatar name="Bo Chen" /><Avatar name="+3" /></Avatar.Group>`,
  Modal: `<Modal id="confirm" opened={$.ui.confirm} title="Revoke this invite?" size="sm">
  <Text>Ana's link stops working right away. You can invite her again later.</Text>
  <Group justify="flex-end"><Button id="cancel_revoke" variant="default">Cancel</Button><Button id="do_revoke" color="red">Revoke</Button></Group>
</Modal>`,
};
