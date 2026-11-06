/**
 * 组件目录 v3（D35）：名称与属性对齐 Mantine（数据表对齐 mantine-datatable），另加少量 AI 交互组件、
 * HTML 兜底标签和 Joplo 专用组件。复合组件用点语法：`<AppShell.Header>` 编译出的节点 type 就是 'AppShell.Header'。
 *
 * 目录是唯一来源：@joplo-app/kit/ui 的导出、渲染器（@joplo-app/web）的实现、COMPONENT_DOCS 都必须与 COMPONENT_TYPES 一致
 * （packages/core/test/catalog.test.ts 与渲染器的类型检查保证）。目录之外的名称在编译时报错，不会被静默渲染。
 * 只换词汇，不换渲染：运行时不引入 Mantine，仍由 Joplo 渲染成低保真风格。
 */

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
  // 架构图（Joplo 自有，D41）：节点与连线的 state 绑定 $.ui，由 flow 步骤驱动
  'Diagram', 'Diagram.Group', 'Diagram.Node', 'Diagram.Edge',
  // HTML 兜底
  'div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'main', 'section', 'header', 'footer', 'nav', 'aside', 'ul', 'ol', 'li', 'strong', 'em', 'small', 'code',
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
] as const;

export const COMPONENT_TYPES = [...STRUCTURE, ...INTERACTIVE] as const;
export type ComponentType = (typeof COMPONENT_TYPES)[number];

export const INTERACTIVE_TYPES: ReadonlySet<string> = new Set<string>(INTERACTIVE);

/** 可接收输入值；type/select/toggle 动作写入 state.inputs[nodeId]。 */
export const VALUE_TYPES: ReadonlySet<string> = new Set<string>([
  'TextInput', 'PasswordInput', 'NumberInput', 'Textarea', 'Select', 'MultiSelect', 'Checkbox', 'Radio.Group', 'Switch',
  'SegmentedControl', 'FileInput', 'Tabs', 'Accordion', 'Pagination', 'PromptInput', 'Terminal.Input',
]);

/** 只有 opened（兼容旧写法 open）为真时自身和子节点才可见的浮层。 */
export const GATED_CONTAINERS: ReadonlySet<string> = new Set<string>(['Modal', 'Drawer']);

/** Joplo 在 Mantine 属性之外追加的属性，编译器会从 props 中取出，放到节点字段上。 */
export const JOPLO_PROPS = ['id', 'when', 'disabledReason', 'unmodeled', 'note'] as const;

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
  Image: 'src, alt, h, w, radius; renders a placeholder with alt',
  ThemeIcon: 'color, variant, size, radius; one character as child',
  Indicator: 'label, color, disabled; wraps one element with a corner badge',
  Timeline: 'active (completed item index), bulletSize; Timeline.Item children',
  'Timeline.Item': 'title, bullet; description in children',
  Table: 'data={{ head: [...], body: [[...]] }} or Table.Thead/Tbody/Tr/Th/Td; striped, withTableBorder',
  'Table.Thead': 'Table head',
  'Table.Tbody': 'Table body',
  'Table.Tr': 'Row',
  'Table.Th': 'Header cell',
  'Table.Td': 'Cell',
  DataTable: 'records (can bind $.data.x), columns: [{ accessor, title }], noRecordsText; matches mantine-datatable',
  Accordion: 'value / defaultValue (expanded item); select sets the expanded item; Accordion.Item children',
  'Accordion.Item': 'value; contains Accordion.Control and Accordion.Panel',
  'Accordion.Panel': 'Content shown when expanded',
  Radio: 'value, label; place inside Radio.Group',
  'Tabs.List': 'Tab bar; contains Tabs.Tab',
  'Tabs.Panel': 'value; current tab content',
  Breadcrumbs: 'separator; Anchor or text children',
  Stepper: 'active (zero-based); Stepper.Step children',
  'Stepper.Step': 'label, description; step content in children (only current step shown)',
  Alert: 'title, color (default blue), variant; description in children',
  Loader: 'size, color, type; optional child text',
  Progress: 'value 0-100, color, size, striped',
  RingProgress: 'sections: [{ value, color }], label, size, thickness',
  Skeleton: 'h, w, circle, radius, visible',
  Notification: 'title, color, loading, withCloseButton; inline notification (use step toast for temporary messages)',
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
  Diagram: "direction: 'right'|'down' (default right), h (height, default 420); architecture diagram with Diagram.Group / Diagram.Node / Diagram.Edge children; automatic deterministic layout (state changes do not move nodes); scales the whole diagram to fit without scrolling; inspect details with shared demo zoom/pan (wheel / pinch / drag) or shots; orthogonal edges with port and parallel segment spacing ≥ 10px; a shot of 2+ nodes (or one edge) in the same diagram centers them in a compact focused subgraph; use direction='down' for many nodes in limited width. Progressive reveal: set when={$.ui.x} on Group / Node / Edge and set true in flow (layout precomputed from all elements, existing elements stay fixed); describe calls with step trace(), which derives node/edge state",
  'Diagram.Group': 'label; titled group box with Diagram.Node or nested Diagram.Group children',
  'Diagram.Node': "id (required for edges and trace), label, description (small second line), kind: 'client'|'service'|'model'|'database'|'queue'|'storage'|'external'|'tool'|'user', optional state: 'idle'|'active'|'ok'|'error'|'dim'; omitted state is derived from step trace(); explicit state overrides it",
  'Diagram.Edge': "from, to (Node ids in the same Diagram), label, async (dashed), optional state: 'idle'|'active'|'ok'|'error'|'dim'; id defaults to \"from->to\". Use trace('app', 'biz') in steps (this edge becomes active, then ok), trace.fail(...) (error), trace.skip(...) (dim), without manual state; for multiple edges in the same direction use trace('edge_id')",
  'Terminal.Command': 'prompt (default "$"); command text in children',
  'Terminal.Output': "tone: 'plain'|'ok'|'warn'|'error' (default plain); output text in children (preserves newlines)",
  Phone: 'scale (visual scale, default 1), h (screen height, default 844); phone frame, children laid out at mobile width 390 with breakpoints based on that width; viewport: "mobile" on a page adds it automatically; do not add Phone explicitly',
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
  Placeholder: 'label, h; placeholder for images, charts, etc.',
  Custom: 'kind; component absent from the catalog, rendered as a labeled placeholder box',
  '#text': 'Compiler-generated text node (do not use directly)',
  Button: 'variant: filled|light|outline|subtle|default|white, color, size, fullWidth, loading, leftSection (character)',
  ActionIcon: "Icon button: aria-label (required as name), variant, color, size; one character child such as '+'",
  CloseButton: 'aria-label, size',
  Anchor: 'href is display-only; clicking never navigates; use go() in the step; c, underline',
  a: 'HTML fallback; prefer Anchor',
  NavLink: 'label, description, href (highlighted when equal to current route), active, leftSection (character); nested NavLink allowed',
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
  'Tabs.Tab': 'value, leftSection (character)',
  'Accordion.Control': 'Clickable heading (requires id)',
  Pagination: 'total, value / defaultValue; select action writes the page number',
  PromptInput: 'placeholder; AI input, type action writes the value; use ActionIcon or Button to send',
  'Artifact.Ref': "title, kind, status; card linking to an artifact in the conversation (requires id; clickable)",
  'Terminal.Input': 'prompt (default "$"), placeholder; terminal input line (requires id), type action writes the value',
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

/** 没有声明 layers 的方案：镜头作用在路径页面上，记为这个伪层级（不出现在层级栏）。作者的层级键不能以 @ 开头。 */
export const PAGE_LAYER = '@page';
/** shot()（不带 id）在有层级的方案里：作用于“当时导演所在的层”，让它回到整体。 */
export const DIRECTOR_LAYER = '@director';

/** Diagram.Node 的 kind 与 Node / Edge 的 state（D41）。 */
export const DIAGRAM_NODE_KINDS = ['client', 'service', 'model', 'database', 'queue', 'storage', 'external', 'tool', 'user'] as const;
export const DIAGRAM_STATES = ['idle', 'active', 'ok', 'error', 'dim'] as const;

/** 子节点排版用的宽度：Phone 内部按手机宽度（响应式取值、visibleFrom / hiddenFrom、AppShell 收起都按它算），其余节点沿用外部宽度。 */
export function childWidth(type: string, width: number): number {
  return type === 'Phone' ? VIEWPORT_SIZE.mobile.width : width;
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
  // 没有 label 的连线：「from → to」
  if (node.type === 'Diagram.Edge' && typeof p.from === 'string' && typeof p.to === 'string') return `${p.from} → ${p.to}`;
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
