/**
 * 组件目录 v2：名称与属性对齐 shadcn/ui（含 AI Elements），另加少量 HTML 标签和 Joplo 专用组件。
 * Agent 按熟悉的 shadcn 写法创作；渲染器（@joplo/web）为每个类型提供低保真实现。
 * 目录之外的名称在编译时报错，不会被静默渲染。
 */

/** 结构与内容：渲染为容器或文本，不可操作。 */
const STRUCTURE = [
  // shadcn
  'Card', 'CardHeader', 'CardTitle', 'CardDescription', 'CardContent', 'CardFooter',
  'Dialog', 'DialogContent', 'DialogHeader', 'DialogTitle', 'DialogDescription', 'DialogFooter',
  'Sheet', 'SheetContent', 'SheetHeader', 'SheetTitle', 'SheetDescription', 'SheetFooter',
  'AlertDialog', 'AlertDialogContent', 'AlertDialogHeader', 'AlertDialogTitle', 'AlertDialogDescription', 'AlertDialogFooter',
  'TabsList', 'TabsContent',
  'Table', 'TableHeader', 'TableBody', 'TableRow', 'TableHead', 'TableCell', 'DataTable',
  'Alert', 'AlertTitle', 'AlertDescription',
  'Badge', 'Avatar', 'Separator', 'Skeleton', 'Progress', 'Label', 'ScrollArea',
  'SelectTrigger', 'SelectValue', 'SelectContent', 'SelectItem', 'RadioGroupItem',
  'Sidebar', 'SidebarHeader', 'SidebarContent', 'SidebarFooter', 'SidebarGroup', 'SidebarGroupLabel', 'SidebarMenu', 'SidebarMenuItem',
  // AI Elements
  'Conversation', 'Message', 'MessageContent', 'Response', 'Reasoning', 'Tool', 'ToolHeader', 'ToolContent', 'Loader', 'PromptInput',
  // HTML
  'div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'main', 'section', 'header', 'footer', 'nav', 'aside', 'ul', 'ol', 'li', 'strong', 'em', 'small', 'code',
  // Joplo
  'Placeholder', // props: label, height —— 图片/图表等占位
  'Custom', // props: kind —— 逃生口：目录没有的组件，渲染为带说明的占位框
  '#text', // 编译器生成的文本节点：props.text 为字面量或 `$ui.x` 绑定
] as const;

/** 看起来可操作：必须有演示行为、明确禁用并说明原因，或标记 unmodeled。 */
const INTERACTIVE = [
  'Button', 'Input', 'Textarea', 'Select', 'Checkbox', 'RadioGroup', 'Switch', 'Tabs', 'TabsTrigger',
  'SidebarMenuButton', 'Link', 'a', 'PromptInputTextarea', 'PromptInputSubmit',
] as const;

export const COMPONENT_TYPES = [...STRUCTURE, ...INTERACTIVE] as const;
export type ComponentType = (typeof COMPONENT_TYPES)[number];

export const INTERACTIVE_TYPES: ReadonlySet<string> = new Set<string>(INTERACTIVE);

/** 可接收输入值；type/select/toggle 动作写入 state.inputs[nodeId]。 */
export const VALUE_TYPES: ReadonlySet<string> = new Set<string>([
  'Input', 'Textarea', 'Select', 'Checkbox', 'RadioGroup', 'Switch', 'Tabs', 'PromptInputTextarea',
]);

/** 只有 open 为真时子节点才可见的容器。 */
export const GATED_CONTAINERS: ReadonlySet<string> = new Set<string>(['Dialog', 'Sheet', 'AlertDialog']);

/** Joplo 在 shadcn 属性之外追加的属性，编译器会从 props 中取出，放到节点字段上。 */
export const JOPLO_PROPS = ['id', 'when', 'disabledReason', 'unmodeled', 'note'] as const;

type LabelNode = { type: string; props?: Record<string, unknown>; children?: LabelNode[] };

/** 元素的人类可读标签：优先 label/title/placeholder 等属性，其次子文本。 */
export function nodeLabel(node: LabelNode): string {
  const p = node.props ?? {};
  for (const k of ['label', 'title', 'aria-label', 'placeholder', 'name', 'kind', 'alt']) {
    const v = p[k];
    if (typeof v === 'string' && v) return v;
  }
  const text = collectText(node).trim();
  return text || node.type;
}

function collectText(node: LabelNode): string {
  if (node.type === '#text') {
    const t = node.props?.text;
    return typeof t === 'string' && !t.startsWith('$') ? t : '';
  }
  return (node.children ?? []).map(collectText).join('');
}
