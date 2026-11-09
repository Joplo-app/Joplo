import type { CSSProperties, ReactNode } from 'react';
import { defineRuntime, type ComponentCtx } from '@joplo-app/kit/plugin';
import { useRoot } from '@joplo-app/kit/renderer';
import type { DiffRow, EditorFrame, Line } from './model.ts';

/**
 * 代码编辑器的画法（只读编译好的快照，D96 原型）。动画全部按引擎时间：这一步提交后的 elapsedMs。
 * - 时钟在走或暂停：按时间画（暂停冻住、倍速跟随、视频录制一致）；
 * - 时钟停了（手动单步收尾之后、跳转）、截图与静态画面：直接画终态。
 */
const LH = 22;
const FS = 14;
const TAB_H = 36;
const MONO = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';
const BG = '#FFFFFF';
const GUTTER = '#8C959F';
const ADD = '230, 255, 237';
const DEL = '255, 235, 233';
const HL = 'rgba(255, 212, 59, 0.28)';
const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : 1 - Math.pow(1 - x, 3));
const phase = (t: number, start: number, ms: number) => ease((t - start) / ms);

function Tokens({ line, palette, limit }: { line: Line; palette: string[]; limit?: number }) {
  let left = limit ?? Infinity;
  const out: ReactNode[] = [];
  for (let i = 0; i < line.length && left > 0; i++) {
    const [text, c] = line[i]!;
    const shown = left >= text.length ? text : text.slice(0, left);
    left -= shown.length;
    out.push(<span key={i} style={{ color: palette[c] }}>{shown}</span>);
  }
  return <>{out}</>;
}

type Row = { key: string; num: string; line: Line; style?: CSSProperties; limit?: number; caret?: boolean; mark?: string };

function rowsOf(snap: EditorFrame, t: number): { rows: Row[]; focus: number } {
  const { lines, anim } = snap;
  if (anim?.kind === 'type') {
    const lengths = lines.slice(anim.from, anim.to).map((l) => l.reduce((n, [s]) => n + s.length, 0));
    let budget = Math.floor((t / 1000) * anim.cps);
    const done = budget >= lengths.reduce((a, b) => a + b + 1, 0);
    const rows: Row[] = [];
    let focus = anim.to - 1;
    lines.forEach((line, i) => {
      if (i < anim.from || i >= anim.to) { rows.push({ key: `l${i}`, num: String(i + 1), line }); return; }
      const len = lengths[i - anim.from]!;
      if (budget < 0) return;
      const limit = Math.min(len, budget);
      const caret = !done && budget <= len;
      if (caret) focus = i;
      // 打完之后新行的底色在 1.2s 内褪去
      const settled = done ? Math.max(0, 1 - (t - ((lengths.reduce((a, b) => a + b + 1, 0)) / anim.cps) * 1000) / 1200) : 1;
      rows.push({ key: `l${i}`, num: String(i + 1), line, limit, caret, style: { background: `rgba(${ADD}, ${settled})` }, mark: settled > 0.05 ? '+' : undefined });
      budget -= len + 1;
    });
    return { rows, focus };
  }
  if (anim?.kind === 'diff') {
    const rows: Row[] = [];
    let focus = -1;
    anim.rows.forEach((r: DiffRow, k) => {
      if (r.k === 's') { rows.push({ key: `s${r.i}`, num: String(r.i + 1), line: lines[r.i]! }); return; }
      if (r.k === 'd') {
        const out = phase(t, 0, 600);
        if (out >= 1) return;
        if (focus < 0) focus = rows.length;
        rows.push({ key: `d${k}`, num: '−', line: r.line, mark: '−', style: { background: `rgba(${DEL}, 1)`, height: LH * (1 - out), opacity: 1 - out * 0.6, overflow: 'hidden', textDecoration: 'line-through', textDecorationColor: 'rgba(207, 34, 46, 0.45)' } });
        return;
      }
      const grow = phase(t, 450, 600);
      const fade = t === Infinity ? 0 : Math.max(0, 1 - Math.max(0, t - 1100) / 1500);
      if (focus < 0) focus = rows.length;
      rows.push({ key: `a${r.i}`, num: String(r.i + 1), line: lines[r.i]!, mark: fade > 0.05 ? '+' : undefined, style: { background: `rgba(${ADD}, ${fade})`, height: LH * grow, opacity: grow, overflow: 'hidden' } });
    });
    return { rows, focus: Math.max(0, focus) };
  }
  return { rows: lines.map((line, i) => ({ key: `l${i}`, num: String(i + 1), line })), focus: snap.hl ? snap.hl[0] - 1 : 0 };
}

function Editor({ ctx }: { ctx: ComponentCtx }) {
  const node = ctx.model;
  const p = ctx.node.props;
  const f = ctx.frame;
  const snap = (ctx.ext.code as { editors?: Record<string, EditorFrame> } | undefined)?.editors?.[node.id];
  const clock = f.clock;
  const live = f.animate && !!clock && (clock.running || !!clock.paused);
  const t = live ? clock!.elapsedMs : Infinity;
  const h = typeof p.h === 'number' ? p.h : 360;
  const { file: _f, lang: _l, code: _c, h: _h, w, ...rest } = p;
  const root = useRoot(node, rest, {
    style: { width: typeof w === 'number' ? w : '100%', height: h, display: 'flex', flexDirection: 'column', background: BG, border: '1px solid #D0D7DE', borderRadius: 10, overflow: 'hidden', boxShadow: '0 8px 24px rgba(140, 149, 159, 0.2)', fontFamily: MONO, textAlign: 'left' },
  });
  if (!snap) return <div {...root} />;
  const { rows, focus } = rowsOf(snap, t);
  const bodyH = h - TAB_H;
  const totalH = rows.reduce((n, r) => n + (typeof r.style?.height === 'number' ? r.style.height : LH), 0) + 16;
  const scroll = Math.max(0, Math.min(totalH - bodyH, focus * LH - bodyH / 2 + LH));
  const caretOn = !live || Math.floor(t / 530) % 2 === 0;
  const hl = snap.hl;
  return (
    <div {...root}>
      <div style={{ height: TAB_H, flexShrink: 0, display: 'flex', alignItems: 'flex-end', background: '#F6F8FA', borderBottom: '1px solid #D0D7DE', paddingLeft: 8 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: TAB_H - 6, padding: '0 14px', background: BG, border: '1px solid #D0D7DE', borderBottom: 'none', borderRadius: '6px 6px 0 0', fontSize: 13, color: '#24292F', marginBottom: -1 }} data-jtext="">
          <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, background: '#FFD43B' }} />
          {typeof p.file === 'string' ? p.file : snap.lang}
        </span>
      </div>
      <div style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 0, padding: '8px 0', transform: `translateY(${-scroll}px)`, fontSize: FS, lineHeight: `${LH}px` }} data-code-lines="">
          {rows.map((r) => {
            const n = Number(r.num);
            const lit = hl && Number.isFinite(n) && n >= hl[0] && n <= hl[1];
            return (
              <div key={r.key} style={{ display: 'flex', height: LH, whiteSpace: 'pre', ...(lit ? { background: HL, boxShadow: 'inset 3px 0 0 #E0A800' } : {}), ...r.style }} data-code-row={r.mark === '−' ? 'del' : r.mark === '+' ? 'add' : undefined}>
                <span style={{ width: 44, flexShrink: 0, textAlign: 'right', paddingRight: 8, color: GUTTER, userSelect: 'none' }}>{r.num}</span>
                <span style={{ width: 14, flexShrink: 0, color: r.mark === '−' ? '#CF222E' : '#1A7F37', userSelect: 'none' }}>{r.mark ?? ''}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <Tokens line={r.line} palette={snap.palette} limit={r.limit} />
                  {r.caret && caretOn ? <span aria-hidden style={{ display: 'inline-block', width: 2, height: 17, marginLeft: 1, verticalAlign: '-3px', background: '#0969DA' }} /> : null}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default defineRuntime({ id: 'code', components: { Editor: { react: Editor } } });
