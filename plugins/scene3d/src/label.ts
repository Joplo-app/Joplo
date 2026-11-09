/** Visible labels are optional; the interactive anchor keeps its accessible name. */
export function visibleLabel(props: Record<string, unknown>, interactive: boolean): string | null {
  const text = typeof props.label === 'string' ? props.label : '';
  return text && props.showLabel !== false && (interactive || props.showLabel === true) ? text : null;
}
