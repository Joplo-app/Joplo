import type { PluginIRNode } from '@joplo-app/kit/plugin';
import { useRoot, useRootAttrs, type NodeProps } from '@joplo-app/kit/renderer';
import { DANGER, DIMMED, INFO, INK, LINE, MONO, OK, WARN, tint } from '@joplo-app/kit/renderer-style';
import { Fragment } from 'react';
import { layoutTimeLanes, readTimeLanes, type TimeSpan } from './time-lanes.ts';

const rowHeight = 32;
const tone = { ok: OK, warn: WARN, fail: DANGER };

function TimeBar({ span, row, domain: [min, max], unit, anchor }: {
  span: TimeSpan; row: number; domain: [number, number]; unit: string; anchor?: PluginIRNode;
}) {
  const label = span.label ?? span.id;
  const attrs = useRootAttrs(anchor ?? { id: span.id, type: 'Custom' });
  const start = (span.start - min) / (max - min) * 100;
  const width = (span.end - span.start) / (max - min) * 100;
  const accent = span.status ? tone[span.status] : INFO;
  const description = `${label} · ${span.lane} · ${span.start}–${span.end} ${unit}${span.status ? ' · ' + span.status : ''}`;
  return <div {...attrs} data-jframe="content" data-jlabel={label} role="img" aria-label={description} title={description} style={{
    position: 'absolute', top: row * rowHeight + 2, left: `${start}%`, width: `${width}%`, height: rowHeight - 6,
    color: INK, backgroundColor: tint(accent, 22), boxShadow: `inset 0 -3px ${accent}`,
    ...(width === 0 ? { width: 1, transform: start === 100 ? 'translateX(-1px)' : undefined, backgroundColor: accent } : {}),
    overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', lineHeight: `${rowHeight - 6}px`, textIndent: '.35em',
  }}>{label}</div>;
}

export function TimeLanesView({ node, p }: NodeProps) {
  const root = useRoot(node, p, { style: { display: 'grid', gridTemplateColumns: 'min(12ch, 30%) minmax(0, 1fr)', columnGap: 12, rowGap: 4, alignItems: 'center', width: '100%', minWidth: 0 } });
  const chart = readTimeLanes(p);
  if (!chart.data) return <div {...root} role="status">TimeLanes · {chart.error}</div>;
  const { domain, spans, unit } = chart.data;
  const anchors = new Map(node.children?.map(child => [child.id, child]));
  return <div {...root}>
    <div style={{ gridColumn: 2, display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${LINE}`, color: DIMMED, fontFamily: MONO, fontSize: '.85em' }}>
      <span>{domain[0]} {unit}</span><span>{domain[1]} {unit}</span>
    </div>
    {layoutTimeLanes(spans).map(({ lane, bars, rows }) => <Fragment key={lane}>
      <div style={{ gridColumn: 1, overflowWrap: 'anywhere' }}>{lane}</div>
      <div style={{ gridColumn: 2, position: 'relative', height: rows * rowHeight, backgroundColor: 'var(--jp-subtle)' }}>
        {bars.map(({ span, row }) => <TimeBar key={span.id} span={span} row={row} domain={domain} unit={unit} anchor={anchors.get(span.id)} />)}
      </div>
    </Fragment>)}
  </div>;
}
