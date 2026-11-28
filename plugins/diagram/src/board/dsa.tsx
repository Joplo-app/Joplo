import type { ComponentCtx } from '@joplo-app/kit/plugin';
import { useRoot } from '@joplo-app/kit/renderer';
import { BT, TABULAR, num, str, tonalWash } from './tokens.ts';
import { BBadge, BHeader, BKbd, Glyph, ROW_STYLE, SLAB_STYLE, SURFACE_STYLE } from './ui.tsx';

export function ArrayStrip({ ctx }: { ctx: ComponentCtx }) {
  const p = ctx.node.props;
  const label = str(p.label, 'Array');
  const meta = str(p.meta);
  const fill = str(p.fill);
  const { label: _l, meta: _m, fill: _f, ...rest } = p;
  const root = useRoot(ctx.model, rest, { style: { ...SLAB_STYLE } });
  return (
    <div {...root} data-bd-root="" data-bd-slab="" data-bd-fill={fill === 'solid' ? 'solid' : undefined}>
      <BHeader icon={<Glyph name="list" size={14} />} title={label} right={meta ? <BKbd>{meta}</BKbd> : null} />
      <div style={{ ...SURFACE_STYLE, flexDirection: 'row', alignItems: 'flex-end', gap: 6, padding: '12px 10px 10px' }}>
        {ctx.renderChildren()}
      </div>
    </div>
  );
}

export function ArrayCell({ ctx }: { ctx: ComponentCtx }) {
  const p = ctx.node.props;
  const value = p.value !== undefined ? String(p.value) : '0';
  const index = p.index !== undefined ? String(p.index) : undefined;
  const pointer = str(p.pointer);
  const state = str(p.state, 'idle');
  const { value: _v, index: _i, pointer: _pt, state: _s, ...rest } = p;

  const bg =
    state === 'active' ? BT.on :
    state === 'pivot' ? BT.warn :
    state === 'sorted' ? tonalWash(BT.ok, 18) :
    state === 'compare' ? tonalWash(BT.signal, 18) :
    state === 'swap' ? tonalWash(BT.danger, 18) :
    BT.slab;
  const fg =
    state === 'active' ? BT.slab :
    state === 'pivot' ? '#17181a' :
    state === 'sorted' ? BT.ok :
    state === 'compare' ? BT.signal :
    state === 'swap' ? BT.danger :
    BT.on;

  const root = useRoot(ctx.model, rest, {
    style: { display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 4 },
  });
  return (
    <div {...root} data-bd-root="" data-bd-state={state}>
      {pointer ? <BBadge tone={state === 'pivot' ? 'warn' : state === 'swap' ? 'danger' : 'accent'} size="xs">{pointer} ↓</BBadge> : <span style={{ height: 18 }} />}
      <div
        style={{
          minWidth: 44,
          height: 42,
          padding: '0 10px',
          borderRadius: 10,
          background: bg,
          color: fg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 14,
          fontWeight: 750,
          boxShadow: state === 'active' ? '0 6px 14px -4px rgba(0,0,0,0.28)' : `0 1px 2px rgba(0,0,0,0.06), inset 0 -2px 0 ${BT.w12}`,
          transform: state === 'active' || state === 'swap' ? 'translateY(-3px)' : undefined,
          ...TABULAR,
        }}
      >
        {value}
      </div>
      {index !== undefined ? <span style={{ ...TABULAR, fontSize: 10, color: BT.mute }}>[{index}]</span> : null}
    </div>
  );
}

export function LinkedList({ ctx }: { ctx: ComponentCtx }) {
  const p = ctx.node.props;
  const label = str(p.label, 'Linked List');
  const { label: _l, ...rest } = p;
  const root = useRoot(ctx.model, rest, { style: { ...SLAB_STYLE } });
  return (
    <div {...root} data-bd-root="" data-bd-slab="">
      <BHeader icon={<Glyph name="arrowRight" size={14} />} title={label} />
      <div style={{ ...SURFACE_STYLE, flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {ctx.renderChildren()}
        <BKbd>NULL</BKbd>
      </div>
    </div>
  );
}

export function ListNode({ ctx }: { ctx: ComponentCtx }) {
  const p = ctx.node.props;
  const value = p.value !== undefined ? String(p.value) : 'A';
  const tag = str(p.tag);
  const active = str(p.state, 'idle') === 'active';
  const { value: _v, tag: _t, state: _s, ...rest } = p;
  const root = useRoot(ctx.model, rest, { style: { display: 'inline-flex', alignItems: 'center', gap: 5 } });
  return (
    <div {...root} data-bd-root="">
      <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
        {tag ? <BBadge tone="accent" size="xs">{tag}</BBadge> : null}
        <div style={{ display: 'inline-flex', borderRadius: 10, overflow: 'hidden', background: active ? BT.on : BT.slab, color: active ? BT.slab : BT.on, boxShadow: `0 0 0 1.5px ${active ? BT.on : BT.w20}`, ...TABULAR }}>
          <span style={{ padding: '7px 11px', fontSize: 13, fontWeight: 700 }}>{value}</span>
          <span style={{ padding: '7px 7px', background: active ? 'rgba(255,255,255,0.14)' : BT.w6, display: 'inline-flex', alignItems: 'center' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: active ? BT.slab : BT.signal }} />
          </span>
        </div>
      </div>
      <Glyph name="arrowRight" size={14} color={BT.mute} />
    </div>
  );
}

export function StackQueue({ ctx }: { ctx: ComponentCtx }) {
  const p = ctx.node.props;
  const kind = str(p.kind, 'stack');
  const label = str(p.label, kind === 'stack' ? 'Call Stack (LIFO)' : 'Task Queue (FIFO)');
  const items = Array.isArray(p.items) ? (p.items as string[]) : [];
  const { kind: _k, label: _l, items: _it, ...rest } = p;
  const isStack = kind === 'stack';
  const root = useRoot(ctx.model, rest, { style: { ...SLAB_STYLE, width: isStack ? 210 : 320 } });
  return (
    <div {...root} data-bd-root="" data-bd-slab="">
      <BHeader icon={<Glyph name="layers" size={14} />} title={label} right={<BBadge tone={isStack ? 'violet' : 'info'} size="xs">{isStack ? 'LIFO' : 'FIFO'}</BBadge>} />
      <div style={{ ...SURFACE_STYLE, flexDirection: isStack ? 'column' : 'row', gap: 5, borderLeft: isStack ? `2px solid ${BT.w20}` : undefined, borderRight: isStack ? `2px solid ${BT.w20}` : undefined, borderBottom: isStack ? `2px solid ${BT.w20}` : undefined }}>
        {items.map((it, idx) => (
          <div key={idx} style={{ ...ROW_STYLE, justifyContent: 'center', background: idx === 0 ? BT.on : BT.slab, color: idx === 0 ? BT.slab : BT.on, fontWeight: idx === 0 ? 700 : 600, ...TABULAR }}>
            <span>{it}</span>
            {idx === 0 ? <span style={{ fontSize: 9.5, opacity: 0.72 }}>{isStack ? 'TOP' : 'HEAD'}</span> : null}
          </div>
        ))}
        {ctx.renderChildren()}
      </div>
    </div>
  );
}

export function HashTable({ ctx }: { ctx: ComponentCtx }) {
  const p = ctx.node.props;
  const label = str(p.label, 'Hash Map');
  const buckets = Array.isArray(p.buckets) ? (p.buckets as { slot: string; entries: string[] }[]) : [];
  const { label: _l, buckets: _b, ...rest } = p;
  const root = useRoot(ctx.model, rest, { style: { ...SLAB_STYLE, width: 310 } });
  return (
    <div {...root} data-bd-root="" data-bd-slab="">
      <BHeader icon={<Glyph name="hash" size={14} />} title={label} right={<BKbd>O(1) avg</BKbd>} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {buckets.map((b, i) => (
          <div key={i} style={{ ...ROW_STYLE, justifyContent: 'flex-start', gap: 8 }}>
            <BKbd>{b.slot}</BKbd>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
              {b.entries.length === 0 ? <span style={{ fontSize: 11, color: BT.faint }}>∅ empty</span> : b.entries.map((e, j) => (
                <span key={j} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  {j > 0 ? <Glyph name="arrowRight" size={11} color={BT.mute} /> : null}
                  <BBadge tone={b.entries.length > 1 ? 'warn' : 'accent'} size="xs">{e}</BBadge>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MatrixGrid({ ctx }: { ctx: ComponentCtx }) {
  const p = ctx.node.props;
  const label = str(p.label, 'DP Table');
  const rows = Array.isArray(p.rows) ? (p.rows as (string | number)[][]) : [];
  const highlight = Array.isArray(p.highlight) ? (p.highlight as [number, number][]) : [];
  const cellSize = num(p.cellSize, 34);
  const hlSet = new Set(highlight.map(([r, c]) => `${r}:${c}`));
  const { label: _l, rows: _r, highlight: _h, cellSize: _cs, ...rest } = p;
  const root = useRoot(ctx.model, rest, { style: { ...SLAB_STYLE } });
  return (
    <div {...root} data-bd-root="" data-bd-slab="">
      <BHeader icon={<Glyph name="grid" size={14} />} title={label} />
      <div style={{ ...SURFACE_STYLE, gap: 4 }}>
        {rows.map((row, r) => (
          <div key={r} style={{ display: 'flex', gap: 4 }}>
            {row.map((val, c) => {
              const hot = hlSet.has(`${r}:${c}`);
              return (
                <div key={c} style={{ width: cellSize, height: cellSize, borderRadius: 8, background: hot ? BT.signal : BT.slab, color: hot ? BT.onSignal : BT.on, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: hot ? 750 : 600, ...TABULAR }}>
                  {String(val)}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
