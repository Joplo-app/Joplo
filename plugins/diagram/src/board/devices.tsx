import type { ComponentCtx } from '@joplo-app/kit/plugin';
import { useRoot } from '@joplo-app/kit/renderer';
import { BT, TABULAR, num, str } from './tokens.ts';
import { BBadge, BDot, Glyph } from './ui.tsx';

export function DeviceFrame({ ctx }: { ctx: ComponentCtx }) {
  const p = ctx.node.props;
  const kind = str(p.kind, 'browser');
  const title = str(p.title, kind === 'browser' ? 'https://app.example.com' : kind === 'terminal' ? 'zsh — ~/workspace' : kind.toUpperCase());
  const badge = str(p.badge);
  const w = num(p.w, kind === 'phone' ? 210 : kind === 'server' ? 240 : 320);
  const { kind: _k, title: _t, badge: _b, w: _w, ...rest } = p;

  if (kind === 'terminal') {
    const root = useRoot(ctx.model, rest, {
      style: {
        display: 'flex',
        flexDirection: 'column',
        width: w,
        borderRadius: 'var(--bd-r-outer, 16px)',
        background: '#111216',
        color: '#f4f4f6',
        border: 'var(--bd-slab-border, 1px solid rgba(255,255,255,0.12))',
        boxShadow: 'var(--bd-slab-shadow)',
        overflow: 'hidden',
      },
    });
    return (
      <div {...root} data-bd-root="">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', background: 'rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#ff5f56' }} />
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#ffbd2e' }} />
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#27c93f' }} />
          </div>
          <span style={{ ...TABULAR, display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'rgba(244,244,246,0.72)' }}>
            <Glyph name="terminal" size={12} /> {title}
          </span>
          <span style={{ width: 32 }} />
        </div>
        <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6, ...TABULAR, fontSize: 12 }}>
          {ctx.renderChildren()}
        </div>
      </div>
    );
  }

  if (kind === 'phone') {
    const root = useRoot(ctx.model, rest, {
      style: { display: 'flex', flexDirection: 'column', width: w, borderRadius: 28, padding: 8, background: BT.on, boxShadow: 'var(--bd-slab-shadow)' },
    });
    return (
      <div {...root} data-bd-root="">
        <div style={{ borderRadius: 21, background: BT.slab, color: BT.on, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 220 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px 6px' }}>
            <span style={{ ...TABULAR, fontSize: 10, fontWeight: 700, color: BT.mute }}>9:41</span>
            <span style={{ width: 48, height: 12, borderRadius: 999, background: BT.on }} />
            <Glyph name="smartphone" size={11} color={BT.mute} />
          </div>
          {title ? <div style={{ padding: '2px 12px 6px', fontSize: 11.5, fontWeight: 700, color: BT.soft, borderBottom: `1px solid ${BT.w12}` }}>{title}</div> : null}
          <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>{ctx.renderChildren()}</div>
          <div style={{ display: 'flex', justifyContent: 'center', padding: '6px 0 8px' }}><span style={{ width: 64, height: 4, borderRadius: 999, background: BT.w20 }} /></div>
        </div>
      </div>
    );
  }

  if (kind === 'server') {
    const root = useRoot(ctx.model, rest, {
      style: { display: 'flex', flexDirection: 'column', width: w, gap: 8, padding: '12px 14px' },
    });
    return (
      <div {...root} data-bd-root="" data-bd-slab="" data-bd-fill="solid">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700 }}>
            <Glyph name="server" size={14} /> {title}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <BDot tone="ok" pulse size={6} />
            <BDot tone="info" size={6} />
            {badge ? <BBadge tone="ok" size="xs">{badge}</BBadge> : null}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 3 }}>
          {Array.from({ length: 16 }, (_, i) => <span key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: BT.w20 }} />)}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{ctx.renderChildren()}</div>
      </div>
    );
  }

  const glyph = kind === 'laptop' ? 'laptop' : kind === 'tablet' ? 'tablet' : 'globe';
  const root = useRoot(ctx.model, rest, { style: { display: 'flex', flexDirection: 'column', width: w, overflow: 'hidden' } });
  return (
    <div {...root} data-bd-root="" data-bd-slab="">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: BT.w4, borderBottom: `1px solid ${BT.w12}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 8.5, height: 8.5, borderRadius: '50%', background: '#ff5f56' }} />
          <span style={{ width: 8.5, height: 8.5, borderRadius: '50%', background: '#ffbd2e' }} />
          <span style={{ width: 8.5, height: 8.5, borderRadius: '50%', background: '#27c93f' }} />
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, padding: '3px 9px', borderRadius: 999, background: BT.w6, fontSize: 11, color: BT.soft, ...TABULAR, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
          <Glyph name={glyph} size={11} />
          <span>{title}</span>
        </div>
        {badge ? <BBadge tone="accent" size="xs">{badge}</BBadge> : null}
      </div>
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>{ctx.renderChildren()}</div>
    </div>
  );
}
