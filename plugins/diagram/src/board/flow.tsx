import type { ComponentCtx } from '@joplo-app/kit/plugin';
import { useRoot } from '@joplo-app/kit/renderer';
import { BT, TABULAR, bool, str, tonalWash, toneColor } from './tokens.ts';
import { BBadge, BHeader, Glyph, ROW_STYLE, SLAB_STYLE } from './ui.tsx';

export function FlowNode({ ctx }: { ctx: ComponentCtx }) {
  const p = ctx.node.props;
  const shape = str(p.shape, 'process');
  const label = str(p.label, 'Step');
  const sub = str(p.sub);
  const tone = str(p.tone, shape === 'start' ? 'ok' : shape === 'decision' ? 'warn' : shape === 'end' ? 'danger' : 'accent');
  const fill = str(p.fill);
  const col = toneColor(tone);
  const { shape: _sh, label: _l, sub: _sb, tone: _t, fill: _fl, ...rest } = p;

  if (shape === 'decision') {
    const root = useRoot(ctx.model, rest, {
      style: { position: 'relative', width: 146, height: 86, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
    });
    return (
      <div {...root} data-bd-root="" data-bd-node="" data-bd-shape="decision">
        <svg width="146" height="86" viewBox="0 0 146 86" style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
          <polygon points="73,3 143,43 73,83 3,43" fill={tonalWash(col, 16)} stroke={col} strokeWidth="2" strokeLinejoin="round" />
        </svg>
        <div style={{ position: 'relative', textAlign: 'center', padding: '0 18px' }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: BT.on, lineHeight: 1.2 }}>{label}</div>
          {sub ? <div style={{ fontSize: 10.5, color: BT.mute }}>{sub}</div> : null}
        </div>
      </div>
    );
  }

  if (shape === 'io') {
    const root = useRoot(ctx.model, rest, {
      style: { position: 'relative', minWidth: 148, padding: '11px 24px', display: 'inline-flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' },
    });
    return (
      <div {...root} data-bd-root="" data-bd-node="">
        <div style={{ position: 'absolute', inset: 0, transform: 'skewX(-14deg)', borderRadius: 10, background: tonalWash(col, 14), border: `1.8px solid ${col}` }} />
        <span style={{ position: 'relative', fontSize: 12.5, fontWeight: 700, color: BT.on }}>{label}</span>
        {sub ? <span style={{ position: 'relative', fontSize: 10.5, color: BT.mute }}>{sub}</span> : null}
      </div>
    );
  }

  const isPill = shape === 'start' || shape === 'end';
  const root = useRoot(ctx.model, rest, {
    style: {
      display: 'inline-flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
      minWidth: isPill ? 116 : 148,
      padding: isPill ? '10px 20px' : '11px 16px',
      borderRadius: isPill ? 999 : 'var(--bd-r-inner, 13px)',
    },
  });
  return (
    <div {...root} data-bd-root="" data-bd-node="" data-bd-slab="" data-bd-fill={fill === 'solid' || isPill ? 'solid' : undefined}>
      <span style={{ fontSize: 13, fontWeight: 700, color: BT.on }}>{label}</span>
      {sub ? <span style={{ fontSize: 11, color: BT.mute }}>{sub}</span> : null}
    </div>
  );
}

export function ERTable({ ctx }: { ctx: ComponentCtx }) {
  const p = ctx.node.props;
  const name = str(p.name, 'users');
  const engine = str(p.engine);
  const fill = str(p.fill);
  const { name: _n, engine: _e, fill: _f, ...rest } = p;
  const root = useRoot(ctx.model, rest, { style: { ...SLAB_STYLE, width: 236, gap: 6 } });
  return (
    <div {...root} data-bd-root="" data-bd-slab="" data-bd-fill={fill === 'solid' ? 'solid' : undefined}>
      <BHeader icon={<Glyph name="table" size={14} />} title={name} right={engine ? <BBadge tone="info" size="xs">{engine}</BBadge> : null} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>{ctx.renderChildren()}</div>
    </div>
  );
}

export function ERField({ ctx }: { ctx: ComponentCtx }) {
  const p = ctx.node.props;
  const name = str(p.name, 'id');
  const type = str(p.type, 'uuid');
  const pk = bool(p.pk, false);
  const fk = bool(p.fk, false);
  const nullable = bool(p.nullable, false);
  const { name: _n, type: _t, pk: _pk, fk: _fk, nullable: _nl, ...rest } = p;
  const root = useRoot(ctx.model, rest, {
    style: { ...ROW_STYLE, padding: '5px 9px', background: pk ? tonalWash(BT.warn, 14) : fk ? tonalWash(BT.info, 12) : BT.w6, ...TABULAR },
  });
  return (
    <div {...root} data-bd-root="">
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: pk ? 750 : 600 }}>
        {pk ? <Glyph name="key" size={11} color={BT.warn} /> : fk ? <Glyph name="link" size={11} color={BT.info} /> : null}
        <span>{name}{nullable ? '?' : ''}</span>
      </span>
      <span style={{ fontSize: 11, color: BT.mute }}>{type}</span>
    </div>
  );
}

export function SwimLane({ ctx }: { ctx: ComponentCtx }) {
  const p = ctx.node.props;
  const label = str(p.label, 'Lane');
  const tone = str(p.tone, 'neutral');
  const col = tone === 'neutral' ? BT.mute : toneColor(tone);
  const { label: _l, tone: _t, ...rest } = p;
  const root = useRoot(ctx.model, rest, {
    style: { display: 'flex', alignItems: 'stretch', borderRadius: 'var(--bd-r-outer, 16px)', background: BT.w4, border: `1.5px dashed color-mix(in srgb, ${col} 42%, transparent)`, overflow: 'hidden' },
  });
  return (
    <div {...root} data-bd-root="">
      <div style={{ width: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', background: tonalWash(col, 14), color: col, fontSize: 11.5, fontWeight: 750, letterSpacing: '0.06em', textTransform: 'uppercase', writingMode: 'vertical-rl', transform: 'rotate(180deg)', flexShrink: 0 }}>
        {label}
      </div>
      <div style={{ flex: 1, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap' }}>
        {ctx.renderChildren()}
      </div>
    </div>
  );
}
