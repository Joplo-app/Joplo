import { createNode, Fragment, type JNode } from './node.ts';

export { Fragment };
export const jsx = (type: unknown, props: Record<string, unknown> | null): JNode => createNode(type, props);
export const jsxs = jsx;

export namespace JSX {
  export type Element = JNode;
  export interface ElementChildrenAttribute {
    children: {};
  }
  export interface IntrinsicElements {
    [tag: string]: Record<string, unknown>;
  }
}
