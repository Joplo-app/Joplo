import { createNode, Fragment, type JNode } from './node.ts';

export { Fragment };
export type { JSX } from './jsx-runtime.ts';

/** 开发模式：esbuild/Vite 会传入源位置，用于“选中元素 → 文件:行号”。 */
export function jsxDEV(
  type: unknown,
  props: Record<string, unknown> | null,
  _key?: unknown,
  _isStatic?: boolean,
  source?: { fileName?: string; lineNumber?: number; columnNumber?: number },
): JNode {
  return createNode(type, props, source);
}
