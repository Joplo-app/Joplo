import type { Bind, CondExpr, JChild } from './node.ts';
type Responsive<T> = T | { base?: T; xs?: T; sm?: T; md?: T; lg?: T; xl?: T };
type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export type JoploProps = {
  id?: string;
  when?: Bind | CondExpr;
  disabled?: boolean | Bind | CondExpr;
  /** 字面量，或绑定状态（disabledReason={$.ui.sendHint}），和 disabled 一样跟着状态变。 */
  disabledReason?: string | Bind;
  unmodeled?: boolean;
  note?: string;
  /** 敏感信息（D70）：内容模糊显示、布局不变；可以写条件（redact={not($.ui.revealed)}），点“显示”后再看清。 */
  redact?: boolean | Bind | CondExpr;
  visibleFrom?: Size;
  hiddenFrom?: Size;
  /** 逃生口：Tailwind 类名。优先使用布局组件与样式属性。 */
  className?: string;
  children?: JChild;
  [prop: string]: unknown;
};
export type { Responsive };
