/**
 * 每一层共用的图版外框（自媒体资讯风格）：章节标签、超大标题（关键词色块高亮）、正文区、底部来源行。
 */
import type { Bind, JNode } from '@joplo-app/kit';
import { C } from './palette.ts';

type Content = JNode | Bind | string | Content[];
type Props = { kicker: string; title: Content; source?: Content; children?: Content; pad?: string };

export function Frame({ kicker, title, source, children, pad }: Props) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: pad ?? '26px 44px 16px', background: `radial-gradient(120% 80% at 50% 0%, #141c2c 0%, ${C.bg} 60%)`, color: C.ink, boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: 2, color: C.bg, background: C.gold, padding: '3px 10px', borderRadius: 3 }}>{kicker}</span>
      </div>
      <div style={{ fontSize: 36, fontWeight: 900, lineHeight: 1.25, marginTop: 10, letterSpacing: 0.5, flexShrink: 0 }}>{title}</div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', marginTop: 16 }}>{children}</div>
      {source ? (
        <div style={{ flexShrink: 0, borderTop: `1px solid ${C.line}`, paddingTop: 8, marginTop: 10, fontSize: 12, color: C.muted }}>{source}</div>
      ) : null}
    </div>
  );
}

/** 关键词高亮：实色块 + 白字，自媒体字幕常用。tone：blue / red / gold。 */
export function Hl({ tone, children }: { tone: 'blue' | 'red' | 'gold'; children?: Content }) {
  const bg = tone === 'blue' ? C.dem : tone === 'red' ? C.rep : C.gold;
  return <span style={{ background: bg, color: tone === 'gold' ? C.bg : '#ffffff', padding: '0 10px', margin: '0 4px', borderRadius: 4, display: 'inline-block', lineHeight: 1.3 }}>{children}</span>;
}

/** 图例里的一个色块 + 文字。 */
export function Key({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: C.muted }}>
      <span style={{ width: 12, height: 12, borderRadius: 3, background: color, display: 'inline-block' }} />
      {label}
    </span>
  );
}
