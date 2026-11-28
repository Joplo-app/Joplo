import type { ComponentCtx, PluginIRNode } from '@joplo-app/kit/plugin';
import { useRootAttrs } from '@joplo-app/kit/renderer';
import type { ReactNode } from 'react';
import type { VizChartSnapshot, VizFrame } from '../schema.ts';
import { DIMMED, INK, LINE, SURFACE, VIZ_FONT_SANS } from './tokens.ts';

export function useVizChart(ctx: ComponentCtx) {
  const node = ctx.model;
  const p = ctx.node.props;
  const animate = ctx.frame.animate;
  const frame = ctx.ext.viz as VizFrame | undefined;
  const snap: VizChartSnapshot = frame?.charts?.[node.id] ?? {};
  const anchors = new Map<string, PluginIRNode>();
  for (const child of node.children ?? []) anchors.set(child.id, child);
  const focusSet = snap.focus && snap.focus.length > 0 ? new Set(snap.focus) : null;
  const isDimmed = (...keys: (string | undefined)[]) => {
    if (!focusSet) return false;
    return !keys.some((k) => k !== undefined && focusSet.has(k));
  };
  return { node, p, animate, snap, anchors, focusSet, isDimmed };
}

export function useAnchorAttrs(anchors: Map<string, PluginIRNode>, id: string | undefined, label?: string) {
  const anchor = id ? anchors.get(id) : undefined;
  const attrs = useRootAttrs(anchor ?? { id: id ?? '', type: 'Custom' });
  if (!id) return {};
  return {
    ...attrs,
    'data-jframe': 'content',
    ...(label ? { 'data-jlabel': label } : {}),
  };
}

export function ChartHeader({ title, subtitle, right }: { title?: string; subtitle?: string; right?: ReactNode }) {
  if (!title && !subtitle && !right) return null;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: 16,
        marginBottom: 14,
        fontFamily: VIZ_FONT_SANS,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
        {title && <span style={{ fontSize: 16, fontWeight: 850, color: INK, letterSpacing: -0.2 }}>{title}</span>}
        {subtitle && <span style={{ fontSize: 12.5, color: DIMMED }}>{subtitle}</span>}
      </div>
      {right}
    </div>
  );
}

export const chartCardStyle = {
  width: '100%',
  minWidth: 0,
  fontFamily: VIZ_FONT_SANS,
  color: INK,
  background: SURFACE,
  border: `1px solid ${LINE}`,
  borderRadius: 14,
  padding: '18px 22px',
  boxSizing: 'border-box' as const,
};
