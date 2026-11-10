import type { JoploProps } from '@joplo-app/kit/plugin';
import { Image } from '@joplo-app/plugin-ui';
import { ratioParts } from './ratio.ts';
type Common = JoploProps & { style?: Record<string, unknown> };
/** Example-owned wrappers: forward all Joplo bindings/when/enter/exit/motion props. */
export function PhotoPanel({ src, credit, year, focus = '50% 50%', imageHeight = '76%', ...props }: Common & { src: string; credit: string; year: string; focus?: string; imageHeight?: string | number }) {
  return <div {...props} style={{ margin: 0, ...props.style }}><Image src={src} h={imageHeight} w="100%" fit="cover" position={focus} alt="虚构档案馆中的通信器物示意图，非实拍" style={{ display: 'block', width: '100%', height: imageHeight, objectFit: 'cover', objectPosition: focus, borderRadius: 20 }} /><div style={{ marginTop: 14, fontSize: 22, lineHeight: 1.35 }}>{credit}<div />{year}</div></div>;
}
export function QuoteCard({ original, translation, name, role, date, source, ...props }: Common & { original: string; translation: string; name: string; role: string; date: string; source: string }) {
  return <section {...props} style={{ margin: 0, padding: 28, background: '#edf2ed', borderRadius: 24, ...props.style }}><p style={{ margin: 0, fontSize: 30, lineHeight: 1.35 }}>“{original}”</p><p style={{ fontSize: 30, lineHeight: 1.4, margin: '20px 0' }}>译文：{translation}</p><footer style={{ fontSize: 25, lineHeight: 1.4 }}>{name} · {role}<div />{date}<div />来源：{source}</footer></section>;
}
export function StatusBadge({ label, explanation, ...props }: Common & { label: string; explanation: string }) {
  return <div {...props} style={{ fontSize: 26, ...props.style }}><strong style={{ background: '#e6d3a4', padding: '6px 12px', borderRadius: 12 }}>{label}</strong><span style={{ marginLeft: 16 }}>{explanation}</span></div>;
}
export function RatioBar({ left, right, total, threshold, leftLabel, rightLabel, ...props }: Common & { left: number; right: number; total: number; threshold?: number; leftLabel: string; rightLabel: string }) {
  const p = ratioParts(left, right, total, threshold);
  return <div {...props} style={{ fontSize: 28, ...props.style }}><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}><span>{leftLabel} {left}/{total}</span><span>{rightLabel} {right}/{total}</span></div><div style={{ display: 'flex', height: 42, position: 'relative', background: '#d7ddd7', borderRadius: 12, overflow: 'hidden' }}><div style={{ width: `${p.left}%`, background: '#366d73' }} /><div style={{ width: `${p.undecided}%` }} /><div style={{ width: `${p.right}%`, background: '#b86c48' }} />{p.threshold !== undefined && <div title={`阈值 ${threshold}`} style={{ position: 'absolute', left: `${p.threshold}%`, width: 4, height: '100%', background: '#182d32' }} />}</div><div style={{ fontSize: 25, marginTop: 10 }}>未定 {total-left-right}/{total}{threshold !== undefined ? ` · 阈值 ${threshold}/${total}` : ''}</div></div>;
}
