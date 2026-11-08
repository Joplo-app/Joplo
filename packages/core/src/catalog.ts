/**
 * 组件目录 v3（D35）：名称与属性对齐 Mantine（数据表对齐 mantine-datatable），另加少量 AI 交互组件、
 * HTML 兜底标签和 Joplo 专用组件。复合组件用点语法：`<AppShell.Header>` 编译出的节点 type 就是 'AppShell.Header'。
 *
 * 目录是唯一来源：@joplo-app/kit/ui 的导出、渲染器（@joplo-app/web）的实现、COMPONENT_DOCS 都必须与 COMPONENT_TYPES 一致
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
  // 关系类图表（Joplo 自有，D41 / D69）：布局在编译期算好；节点与连线的状态由 flow 步骤的 trace() 推算
  'Diagram', 'Diagram.Group', 'Diagram.Node', 'Diagram.Edge',
  'StateMachine', 'StateMachine.Group', 'StateMachine.State', 'StateMachine.Transition',
  'Sequence', 'Sequence.Group', 'Sequence.Actor', 'Sequence.Message', 'Sequence.Block',
  // 产品界面（D68）：官网示例里反复手拼的常见界面，名字能对齐 Mantine 的就对齐（Menu、Avatar.Group、Radio.Card、BarChart、LineChart）
  'Avatar.Group', 'Radio.Card', 'EmptyState', 'ListRow', 'Stat', 'KeyValue', 'BarChart', 'LineChart',
  'Menu', 'Menu.Target', 'Menu.Dropdown', 'Menu.Label', 'Menu.Divider',
  // HTML 兜底
  ...HTML,
  // Joplo
  'Placeholder', // props: label, h —— 图片/图表等占位
  'Custom', // props: kind —— 逃生口：目录没有的组件，渲染为带说明的占位框
  '#text', // 编译器生成的文本节点：props.text 为字面量或 `$ui.x` 绑定
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

/** Joplo 在 Mantine 属性之外追加的属性，编译器会从 props 中取出，放到节点字段上。 */
export const JOPLO_PROPS = ['id', 'when', 'disabledReason', 'unmodeled', 'note', 'redact'] as const;

/**
 * 每个组件一行常用属性提示（`joplo skill components` 由此生成）。所有组件另外都接受：
 * 样式属性 m/mt/mb/ml/mr/mx/my、p/pt/pb/pl/pr/px/py、w/h/miw/maw/mih/mah、c/bg/fz/fw/ta/ff/lh/opacity，
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
  Diagram: "h (height, default 420; h=\"100%\" fills a layer), direction: 'right'|'down' (omit it: chosen to fit the stage), aspect (target width/height); architecture / relationship diagram. Layout is computed at compile time (ELK layered with groups, orthogonal edges), deterministic, and identical in every step: state, when and trace never move nodes. Group nodes by business domain with Diagram.Group. Details: npx joplo skill diagram",
  'Diagram.Group': "id (required when referenced), label, icon (preset: client|service|model|database|queue|storage|external|tool|user|cloud|gateway|lock|network|device|box|brain), tone: gray|blue|green|orange|red|purple|teal, group (parent group id, instead of nesting), pin: 'start'|'end'; nestable; edges may connect to a group; a trace through its nodes highlights it",
  'Diagram.Node': "id (required for edges and trace), label, description (small second line), kind: 'client'|'service'|'model'|'database'|'queue'|'storage'|'external'|'tool'|'user', group (group id, instead of nesting), pin: 'start'|'end' (first / last layer within its group); optional state: 'idle'|'active'|'ok'|'error'|'dim' (omit it: trace() derives state)",
  'Diagram.Edge': "from, to (Node or Group ids in the same Diagram), label, async (dashed), optional state; id defaults to \"from->to\". Use trace('app', 'biz') in steps (active, then ok), trace.fail(...) (error), trace.skip(...) (dim); for multiple edges in the same direction use trace('edge_id')",
  StateMachine: "direction: 'right'|'down' (omit it: chosen to fit the stage), h, aspect, value (current state id, usually value={$.data.order.status}); lifecycle diagram with StateMachine.State / StateMachine.Transition / StateMachine.Group; the current state is highlighted and the transition taken this step lights up. Details: npx joplo skill diagram",
  'StateMachine.Group': 'id, label, icon, tone, group; composite state box (substates inside)',
  'StateMachine.State': 'id (required), label, description, initial (start dot points to it), final (double border), group, pin',
  'StateMachine.Transition': "from, to (state ids), label (event [guard] / action); id defaults to \"from->to\" (\"from->to~2\" for repeats); trace('paid', 'shipped') or trace('transition_id')",
  Sequence: 'h, numbered (default true: messages numbered in source order); sequence diagram: lifelines in source order, one row per message; trace message ids to light rows. Details: npx joplo skill diagram',
  'Sequence.Group': 'id, label, icon; box around participant columns (business domain)',
  'Sequence.Actor': "id (required), label, description, kind (same kinds as Diagram.Node); a participant column",
  'Sequence.Message': "id (recommended for trace), from, to (actor ids; from === to is a self call), label, reply (dashed return), async (open arrow); rows follow source order",
  'Sequence.Block': "label, kind: 'alt'|'opt'|'loop'|'par'|'break'|'critical' (default opt); fragment box around the messages inside it; nestable",
  'Terminal.Command': 'prompt (default "$"); command text in children',
  'Terminal.Output': "tone: 'plain'|'ok'|'warn'|'error' (default plain); output text in children (preserves newlines)",
  Phone: 'scale (visual scale, default 1), h (screen height, default 844), landscape (turned sideways: content 772 × 358, notch on the left; use it for video-style or landscape mobile screens); phone frame, children laid out at mobile width 390 with breakpoints based on that width; viewport: "mobile" on a page adds it automatically; do not add Phone explicitly',
  div: 'HTML fallback; prefer Box/Stack/Group',
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
  Custom: 'kind; component absent from the catalog, rendered as a labeled placeholder box',
  '#text': 'Compiler-generated text node (do not use directly)',
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
  PromptInput: 'placeholder; AI input, type action writes the value; use ActionIcon or Button to send',
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
  // 关系类图表（D69）：npx joplo components Diagram / Sequence / StateMachine 也给一个能直接用的例子；分组、布局、取景的细节在 npx joplo skill diagram
  Diagram: `<Diagram id="arch" direction="right" h={420}>
  <Diagram.Group id="g_gw" label="Gateway" icon="gateway" tone="blue">
    <Diagram.Node id="api" label="API" description="auth · rate limit" />
  </Diagram.Group>
  <Diagram.Group id="g_run" label="Runtime" icon="service" tone="purple">
    <Diagram.Node id="kernel" label="Kernel" description="model + tool loop" />
  </Diagram.Group>
  <Diagram.Group id="g_data" label="Storage" icon="database">
    <Diagram.Node id="pg" label="PostgreSQL" kind="database" />
  </Diagram.Group>
  <Diagram.Edge from="api" to="kernel" label="run" />
  <Diagram.Edge from="kernel" to="pg" label="commit" async />
</Diagram>
// steps: .system('Run starts', trace('api', 'kernel', 'pg'), shot('kernel')); groups, layout, framing: npx joplo skill diagram`,
  Sequence: `<Sequence id="login">
  <Sequence.Actor id="web" label="Web" kind="client" />
  <Sequence.Actor id="api" label="API" />
  <Sequence.Actor id="db" label="DB" kind="database" />
  <Sequence.Message id="m_req" from="web" to="api" label="POST /login" />
  <Sequence.Message id="m_q" from="api" to="db" label="find user" />
  <Sequence.Message id="m_ok" from="api" to="web" label="200 + session" reply />
</Sequence>
// steps: .system('Sign in', trace('m_req')).system('Look up the user', trace('m_q'))`,
  StateMachine: `<StateMachine id="order_sm" value={$.data.order.status}>
  <StateMachine.State id="created" label="Created" initial />
  <StateMachine.State id="paid" label="Paid" />
  <StateMachine.State id="closed" label="Closed" final />
  <StateMachine.Transition from="created" to="paid" label="pay" />
  <StateMachine.Transition from="created" to="closed" label="timeout 30 min" />
</StateMachine>
// steps: .system('Payment received', set($.data.order.status, 'paid')) lights created → paid`,
  Modal: `<Modal id="confirm" opened={$.ui.confirm} title="Revoke this invite?" size="sm">
  <Text>Ana's link stops working right away. You can invite her again later.</Text>
  <Group justify="flex-end"><Button id="cancel_revoke" variant="default">Cancel</Button><Button id="do_revoke" color="red">Revoke</Button></Group>
</Modal>`,
};

// ---------- 响应式（Mantine 默认断点，按舞台宽度取值） ----------

/** Mantine 默认断点：36/48/62/75/88em，按 16px 换算。 */
export const BREAKPOINTS = { xs: 576, sm: 768, md: 992, lg: 1200, xl: 1408 } as const;
export type Breakpoint = keyof typeof BREAKPOINTS;
const BP_KEYS = ['base', 'xs', 'sm', 'md', 'lg', 'xl'] as const;

/** 页面 viewport 对应的舞台尺寸。 */
export const VIEWPORT_SIZE = { desktop: { width: 1280, height: 800 }, mobile: { width: 390, height: 844 } } as const;
/**
 * 字幕区：画面下方、播放控制上方的一块固定高度区域，最多两行：一行本步说明（大字），一行 explain（小一号）。
 * 演示页、发布站、renderStep 截图、导出图片与视频都把它放在舞台正下方，宽度与舞台（手机含外框）相同。
 */
export const SUBTITLE_HEIGHT = 84;

/**
 * 内置主题（D51）：每个主题是一个只写 CSS 变量（--jp-*）的样式表，CSS 在 web 包里（renderer/themes.ts）。
 * 作者可以在项目根目录 themes/<name>.css 写自己的主题；与内置同名时用作者的。
 */
export const BUILTIN_THEMES = ['sketch', 'clean', 'blueprint', 'nord', 'dracula', 'solarized-light', 'terminal', 'kraft', 'contrast'] as const;
/** 主题名：字母开头，字母、数字、连字符、下划线（也是 themes/ 下的文件名）。 */
export const THEME_NAME = /^[A-Za-z][\w-]*$/;

/**
 * 看板外观（D55）：配色仍是主题名；字体与线条可以单独选，null = 跟随主题。
 * 只在本机看板与导出的图片 / 视频里生效，发布站（joplo.config.ts）暂不支持。只用本机字体（手写体是已打包的 Excalifont + 小赖）。
 */
export const APPEARANCE_FONTS = ['hand', 'sans', 'serif', 'kai', 'mono'] as const;
export type AppearanceFont = (typeof APPEARANCE_FONTS)[number];
export const APPEARANCE_STROKES = ['rough', 'clean'] as const;
export type AppearanceStroke = (typeof APPEARANCE_STROKES)[number];
export const isAppearanceFont = (v: unknown): v is AppearanceFont => typeof v === 'string' && (APPEARANCE_FONTS as readonly string[]).includes(v);
export const isAppearanceStroke = (v: unknown): v is AppearanceStroke => typeof v === 'string' && (APPEARANCE_STROKES as readonly string[]).includes(v);

/** 字幕的“字数”：中文（及其他全角字符）一个算 1，英文、数字、标点按 0.5 算；空白不算。check 用它提示说明与 explain 过长。 */
export function captionLength(s: string): number {
  let n = 0;
  for (const ch of s) {
    if (/\s/.test(ch)) continue;
    n += (ch.codePointAt(0) ?? 0) > 0x2e80 ? 1 : 0.5;
  }
  return n;
}
/** 说明 / explain 的建议上限（超过时 check 报 CAPTION_TOO_LONG / EXPLAIN_TOO_LONG）。 */
export const CAPTION_MAX = 24;
export const EXPLAIN_MAX = 48;
/** 旁白 say() 的建议上限（D74，超过时 check 报 SAY_TOO_LONG）：读出来约 10 秒。 */
export const SAY_MAX = 80;
/**
 * 叙事提示（D67，见 docs/research/storytelling-and-demos.md）：
 * - 封面说明（flow 的 description）：D61 定为 30 字以内，超过时 DESCRIPTION_TOO_LONG；
 * - 过渡卡：副标题与 explain 同上限、每条要点与说明同上限、最多 4 条要点，超过时 CARD_TEXT_TOO_LONG（info）；
 * - 单个场景按 1× 估算超过 90 秒时 SCENARIO_TOO_LONG（info）：一个场景讲一件事，长流程拆成几个场景或用 fork。
 */
export const DESCRIPTION_MAX = 30;
export const CARD_POINTS_MAX = 4;
export const SCENARIO_MS_MAX = 90_000;

/** 没有声明 layers 的方案：镜头作用在路径页面上，记为这个伪层级（不出现在层级栏）。作者的层级键不能以 @ 开头。 */
export const PAGE_LAYER = '@page';
/** shot()（不带 id）在有层级的方案里：作用于“当时导演所在的层”，让它回到整体。 */
export const DIRECTOR_LAYER = '@director';

/** Diagram 节点与连线的 state（D41）；节点 kind 等见 diagram/model.ts。 */
export const DIAGRAM_STATES = ['idle', 'active', 'ok', 'error', 'dim'] as const;

/** 横放的 Phone（landscape）内容区尺寸：844 × 390 的屏幕扣掉安全区（左侧刘海、底部横条）。 */
export const PHONE_LANDSCAPE = { width: 772, height: 358 } as const;

/** 子节点排版用的宽度：Phone 内部按手机宽度（横放按横屏宽度；响应式取值、visibleFrom / hiddenFrom、AppShell 收起都按它算），其余节点沿用外部宽度。 */
export function childWidth(type: string, width: number, props?: { landscape?: unknown }): number {
  if (type !== 'Phone') return width;
  return props?.landscape === true ? PHONE_LANDSCAPE.width : VIEWPORT_SIZE.mobile.width;
}

/** 是否为响应式对象 `{ base, sm, md }`：普通对象，至少一个键，且全部键都是断点名。 */
export function isResponsive(v: unknown): v is Partial<Record<(typeof BP_KEYS)[number], unknown>> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const keys = Object.keys(v);
  return keys.length > 0 && keys.every((k) => (BP_KEYS as readonly string[]).includes(k));
}

/** 按舞台宽度取响应式属性的值：取不超过宽度的最大断点；都不满足时取 base；非响应式值原样返回。 */
export function atWidth(v: unknown, width: number): unknown {
  if (!isResponsive(v)) return v;
  let out: unknown = undefined;
  for (const k of BP_KEYS) {
    if (!(k in v)) continue;
    const min = k === 'base' ? 0 : BREAKPOINTS[k];
    if (width >= min) out = v[k];
  }
  return out;
}

/** 断点名、数字（px）或 `40em` / `600px` 字符串 → 像素；无法识别返回 null。 */
export function breakpointPx(bp: unknown): number | null {
  if (typeof bp === 'number' && Number.isFinite(bp)) return bp;
  if (typeof bp !== 'string') return null;
  if (bp in BREAKPOINTS) return BREAKPOINTS[bp as Breakpoint];
  const m = /^(\d+(?:\.\d+)?)(px|em|rem)?$/.exec(bp.trim());
  if (!m) return null;
  return m[2] === 'em' || m[2] === 'rem' ? Number(m[1]) * 16 : Number(m[1]);
}

/** visibleFrom / hiddenFrom：在给定舞台宽度下是否被隐藏。 */
export function hiddenAtWidth(props: Record<string, unknown> | undefined, width: number): boolean {
  if (!props) return false;
  const from = breakpointPx(props.visibleFrom);
  if (from !== null && width < from) return true;
  const until = breakpointPx(props.hiddenFrom);
  if (until !== null && width >= until) return true;
  return false;
}

// ---------- 选项（Select / SegmentedControl / MultiSelect 的 data） ----------

export type Choice = { value: string; label: string };

/** Mantine 的 data：string[]、{ value, label }[]，或分组 { group, items }[]。 */
export function choicesFromData(data: unknown): Choice[] {
  if (!Array.isArray(data)) return [];
  const out: Choice[] = [];
  for (const d of data) {
    if (typeof d === 'string' || typeof d === 'number') out.push({ value: String(d), label: String(d) });
    else if (d && typeof d === 'object') {
      const o = d as Record<string, unknown>;
      if (Array.isArray(o.items)) out.push(...choicesFromData(o.items));
      else if (o.value !== undefined && o.value !== null) out.push({ value: String(o.value), label: typeof o.label === 'string' ? o.label : String(o.value) });
    }
  }
  return out;
}

/** 按 value 或 label 匹配一个选项。 */
export function matchChoice(choices: Choice[], v: string): Choice | null {
  return choices.find((c) => c.value === v) ?? choices.find((c) => c.label === v) ?? null;
}

// ---------- 标签 ----------

const IS_BINDING = /^\$(?:ui|data|inputs)(?:\.|$)/;

type LabelNode = { type: string; props?: Record<string, unknown>; children?: LabelNode[] };

/** 元素的人类可读标签：优先 label/title/aria-label/placeholder 等属性（Mantine 输入组件直接带 label），其次子文本。 */
export function nodeLabel(node: LabelNode): string {
  const p = node.props ?? {};
  for (const k of ['label', 'title', 'aria-label', 'placeholder', 'name', 'kind', 'alt']) {
    const v = p[k];
    if (typeof v === 'string' && v && !IS_BINDING.test(v)) return v;
  }
  // 没有 label 的连线 / 转换 / 消息：「from → to」
  if ((node.type === 'Diagram.Edge' || node.type === 'StateMachine.Transition' || node.type === 'Sequence.Message') && typeof p.from === 'string' && typeof p.to === 'string') return `${p.from} → ${p.to}`;
  const text = collectText(node).trim();
  return text || node.type;
}

function collectText(node: LabelNode): string {
  if (node.type === '#text') {
    const t = node.props?.text;
    return typeof t === 'string' && !IS_BINDING.test(t) ? t : '';
  }
  return (node.children ?? []).map(collectText).join('');
}
