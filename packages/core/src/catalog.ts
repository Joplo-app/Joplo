/**
 * 组件目录：Agent 只能从这里选组件类型。渲染器（@joplo/web）为每个类型提供实现，
 * 校验器据此判断哪些元素“看起来可操作”。
 *
 * 名称与属性尽量沿用 shadcn/ui 的习惯，降低 Agent 的学习成本。
 */

export const COMPONENT_TYPES = [
  // 结构
  'Page', // props: title
  'Header', // props: title
  'Sidebar', // props: title；children 通常是 Link
  'Stack', // props: direction('row'|'col'), gap(number), align, justify, wrap(boolean)
  'Card', // props: title
  'Section', // props: title
  'Tabs', // props: items(string[]), active(string)
  'Divider',
  // 内容
  'Heading', // props: text, level(1|2|3)
  'Text', // props: text, tone('default'|'muted'|'danger'|'success'), size('sm'|'md'|'lg')
  'Image', // props: label, height(number)
  'List', // props: items(string[] | $绑定)
  'Table', // props: columns({key,label}[]), rows(object[] | $绑定), empty(string)
  'Badge', // props: text, tone
  'Avatar', // props: name
  // 输入
  'Button', // props: label, variant('primary'|'secondary'|'ghost'|'danger')
  'Link', // props: label
  'Input', // props: label, placeholder, inputType('text'|'email'|'password')
  'Textarea', // props: label, placeholder
  'Select', // props: label, options(string[]), placeholder
  'Checkbox', // props: label
  'Radio', // props: label, options(string[])
  'Switch', // props: label
  // 反馈
  'Dialog', // props: title, open(boolean | $绑定)
  'Alert', // props: text, tone('info'|'error'|'success'|'warning') —— 行内错误/提示
  'Spinner', // props: label
  'EmptyState', // props: title, text
  'Progress', // props: value(0-100), label
  // AI / Agent 交互（渲染层基于 AI Elements 风格）
  'ChatMessage', // props: role('user'|'assistant'), text
  'ToolCall', // props: name, status('running'|'done'|'error'), detail
  'PromptInput', // props: placeholder
  // 逃生口：目录中没有的组件，必须声明 kind；M0 渲染为带说明的占位框
  'Custom', // props: kind(string), 其他任意 props
] as const;

export type ComponentType = (typeof COMPONENT_TYPES)[number];

/** 看起来可操作的组件：必须有交互、明确禁用并说明原因，或标记 unmodeled。 */
export const INTERACTIVE_TYPES: ReadonlySet<ComponentType> = new Set<ComponentType>([
  'Button',
  'Link',
  'Input',
  'Textarea',
  'Select',
  'Checkbox',
  'Radio',
  'Switch',
  'Tabs',
  'PromptInput',
]);

/** 可接收输入值的组件；对它们的 type/select/toggle 动作会写入 state.inputs[nodeId]。 */
export const VALUE_TYPES: ReadonlySet<ComponentType> = new Set<ComponentType>([
  'Input',
  'Textarea',
  'Select',
  'Checkbox',
  'Radio',
  'Switch',
  'PromptInput',
  'Tabs',
]);

/** 子节点只在 open 为真时可见的容器。 */
export const GATED_CONTAINERS: ReadonlySet<ComponentType> = new Set<ComponentType>(['Dialog']);

/** 元素的人类可读标签，用于字幕、索引和诊断信息。 */
export function nodeLabel(node: { type: string; props?: Record<string, unknown> }): string {
  const p = node.props ?? {};
  const v = p.label ?? p.text ?? p.title ?? p.name ?? p.placeholder ?? p.kind;
  return typeof v === 'string' ? v : node.type;
}
