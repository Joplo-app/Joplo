import { isBind, isNode, type JChild, type JNode } from '@joplo-app/kit/node';
import type { PluginReport } from '@joplo-app/kit/plugin';

/** Mirror JSX fragment/array flattening, but stop at each Side so nested comparisons own their choices. */
export function compileCompare(node: Readonly<JNode>, report: PluginReport): JNode {
  const choices: { value: string; label: unknown }[] = [];
  const values = new Set<string>();
  const visit = (child: JChild): void => {
    if (Array.isArray(child)) return child.forEach(visit);
    if (child == null || typeof child === 'boolean') return;
    if (isNode(child) && child.type === '#fragment') return child.children.forEach(visit);
    if (!isNode(child) || child.type !== 'ui:Compare.Side') {
      report('COMPARE_CHILD', '<Compare> accepts only direct <Compare.Side> children', node.source);
      return;
    }
    const { value, label } = child.props;
    if (typeof value !== 'string' || !value.trim()) {
      report('COMPARE_VALUE', '<Compare.Side> needs a nonempty string value', child.source ?? node.source);
      return;
    }
    if (values.has(value)) report('COMPARE_DUPLICATE_VALUE', `<Compare.Side value="${value}"> repeats a value in this Compare`, child.source ?? node.source);
    values.add(value);
    choices.push({ value, label: label ?? value });
  };
  node.children.forEach(visit);
  if (choices.length !== 2) report('COMPARE_SIDES', '<Compare> needs two sides with distinct values', node.source);
  const { mode, value, defaultValue } = node.props;
  if (mode !== undefined && !['auto', 'side-by-side', 'toggle'].includes(String(mode))) {
    report('COMPARE_MODE', '<Compare> mode must be auto, side-by-side or toggle', node.source);
  }
  for (const selected of [value, defaultValue]) {
    if (selected !== undefined && !isBind(selected) && (typeof selected !== 'string' || !values.has(selected))) {
      report('COMPARE_SELECTION', '<Compare> value and defaultValue must identify one of its sides', node.source);
    }
  }
  // The compiler already owns the converted children. Only return the normalized props.
  return { ...node, children: [], props: { ...node.props, compareOptions: choices } };
}
