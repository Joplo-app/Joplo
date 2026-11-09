/** 本步标注画在镜头内：内容与字号变化后重新测量，绝不为缺失目标生成原点占位。 */
import { useContext, useLayoutEffect, useState, type RefObject } from 'react';
import type { Mark } from '@joplo-app/core/runtime';
import { finalRect } from './camera';
import type { Box } from './camera-math';
import { markBox, markGeometry } from './marks-math';
import { RoughPath, ThemeContext } from './rough';
import { rectOf } from './rect';

type Measured = { mark: Mark; box: Box };
export function Marks({ marks, wrapRef, contentRef, width, height, animate, pulseKey }: { marks: readonly Mark[]; wrapRef: RefObject<HTMLDivElement | null>; contentRef: RefObject<HTMLDivElement | null>; width: number; height: number; animate: boolean; pulseKey: string }) {
  const [measured, setMeasured] = useState<Measured[]>([]);
  // 首次挂载（深链、截图、视频第一帧）时 Marks 和外层镜头容器在同一次提交里挂上：子组件的 layout effect
  // 先于父元素的 ref 赋值执行，wrapRef 还是 null。等下一帧再量，否则这一步的标注永远不画。
  const [attempt, setAttempt] = useState(0);
  const look = useContext(ThemeContext);
  useLayoutEffect(() => {
    const wrap = wrapRef.current, content = contentRef.current, host = wrap?.parentElement;
    if (marks.length && (!wrap || !host) && attempt < 30) {
      const retry = requestAnimationFrame(() => setAttempt(a => a + 1));
      return () => cancelAnimationFrame(retry);
    }
    if (!wrap || !host || !marks.length) { setMeasured([]); return; }
    let last = '', pending = 0, raf = 0, n = 0;
    const boxOf = (r: { left: number; top: number; width: number; height: number }): Box => ({ x: r.left, y: r.top, w: r.width, h: r.height });
    const measure = () => {
      const wr = rectOf(wrap), scale = wr.width / (wrap.offsetWidth || 1);
      const next: Measured[] = [];
      for (const mark of marks) {
        const el: HTMLElement | null = wrap.querySelector<HTMLElement>(`[data-jid="${CSS.escape(mark.target)}"]`);
        if (!el) continue;
        const clips = [boxOf(rectOf(host))];
        let hidden = false;
        for (let p: HTMLElement | null = el; p && p !== wrap; p = p.parentElement) {
          const cs = getComputedStyle(p);
          if (cs.display === 'none' || cs.visibility === 'hidden') { hidden = true; break; }
          if (p !== el && (cs.overflowX !== 'visible' || cs.overflowY !== 'visible')) clips.push(boxOf(rectOf(p)));
        }
        if (hidden) continue;
        const box = markBox(boxOf(finalRect(el)), { x: wr.left, y: wr.top }, scale, clips);
        if (box) next.push({ mark, box });
      }
      const sig = JSON.stringify(next.map(v => [v.mark, Object.values(v.box).map(x => Math.round(x * 2) / 2)]));
      if (sig !== last) { last = sig; setMeasured(next); }
    };
    const tick = () => { measure(); if (++n < (animate ? 70 : 15)) raf = requestAnimationFrame(tick); };
    const schedule = () => { if (!pending) pending = requestAnimationFrame(() => { pending = 0; measure(); }); };
    tick();
    const mo = new MutationObserver(schedule);
    // style 也要看：插件自己的镜头移动的是内容里的元素（改 transform），不是外层镜头容器（D97）
    if (content) mo.observe(content, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['style'] });
    // 镜头/自由平移只改变容器 transform，内容不变时也必须重新判断画面内可见性。
    const viewObserver = new MutationObserver(schedule);
    viewObserver.observe(wrap, { attributes: true, attributeFilter: ['style'] });
    const ro = new ResizeObserver(schedule);
    if (content) ro.observe(content);
    for (const mark of marks) { const el = wrap.querySelector(`[data-jid="${CSS.escape(mark.target)}"]`); if (el) ro.observe(el); }
    wrap.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    return () => { mo.disconnect(); viewObserver.disconnect(); ro.disconnect(); cancelAnimationFrame(raf); cancelAnimationFrame(pending); wrap.removeEventListener('scroll', schedule, true); window.removeEventListener('resize', schedule); };
  }, [marks, wrapRef, contentRef, width, height, animate, pulseKey, attempt]);
  return <ThemeContext.Provider value={{ ...look, stroke: 'rough' }}>
    <div className="pointer-events-none absolute inset-0 z-30" data-jlayer="marks" style={{ color: 'var(--jp-annot, var(--jp-danger))' }}>
      <svg width={width} height={height} style={{ position: 'absolute', overflow: 'visible' }} aria-hidden>
        {measured.map(({ mark, box }, i) => { const g = markGeometry(mark.kind, box, width, height); return g ? <RoughPath key={`${pulseKey}:${i}`} seedKey={`mark:${pulseKey}:${i}`} d={g.d} stroke="var(--jp-annot, var(--jp-danger))" strokeWidth={2.4} draw={animate} /> : null; })}
      </svg>
      {measured.map(({ mark, box }, i) => { const g = markGeometry(mark.kind, box, width, height); return g && mark.note ? <div key={i} style={{ position: 'absolute', left: g.note.x, top: g.note.y, maxWidth: g.note.width, padding: '2px 4px', background: 'var(--jp-surface)', fontSize: 14, lineHeight: 1.4, overflowWrap: 'anywhere' }}>{mark.note}</div> : null; })}
    </div>
  </ThemeContext.Provider>;
}
