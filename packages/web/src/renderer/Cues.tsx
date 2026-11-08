/**
 * 焦点提示的呈现层（D70）：聚光、强调框、编号、标注气泡、默认的结果揭晓。内容只来自 core 的 focusAt（IR + 当前位置）。
 *
 * - 画在镜头容器里（内容坐标），跟着镜头一起平移缩放；屏幕上固定大小的东西（气泡、角标、线宽）按镜头缩放 k 换算。
 * - 整层 pointer-events: none：不改变可点击区域，也不拦截当前步骤的点击（不变量 3）；聚光的洞同时让出下一步要点的元素。
 * - 目标隐藏、在别的层、或测不到时不画（与 mark 一样，绝不在原点画假提示）。
 * - 颜色只读主题变量：强调 --jp-accent，压暗用 --jp-bg 冲淡（与镜头调暗同一种“变淡”），气泡用 --jp-surface / --jp-ink；
 *   线条跟随主题（手绘主题是 rough 描边）。
 * - animate=false（静态截图、减少动态效果）：直接画到位，没有脉冲；结果揭晓只是一次脉冲，静态时不画。
 */
import { useContext, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { motion } from 'motion/react';
import type { FocusState } from '@joplo-app/core';
import type { Box } from './camera-math';
import { ownershipEls } from './camera';
import { markBox } from './marks-math';
import { badgeCenter, placeCallout, spotlightHoles, spotlightPath, visibleRegion, SPOT_PAD, TransitionTracker, type CalloutPlacement, type Side } from './cue-math';
import { Rough, RoughPath, ThemeContext, useStroke } from './rough';
import { rectOf } from './rect';

const ACCENT = 'var(--jp-accent)';
const BADGE = 24;
const CALLOUT_MAX_W = 260;
const round = (n: number) => Math.round(n * 2) / 2;

export type CuesProps = {
  focus: FocusState;
  wrapRef: RefObject<HTMLDivElement | null>;
  contentRef: RefObject<HTMLDivElement | null>;
  width: number;
  height: number;
  /** 镜头算出的视图（目标值）；没有镜头时 null（= 不缩放）。 */
  view: { k: number; tx: number; ty: number } | null;
  /** 下一步要点的元素：聚光时一起照亮。 */
  nextTargetId: string | null;
  /** 镜头已经套了高光框的元素：这里不再重复画框。 */
  cameraTargets: readonly string[];
  animate: boolean;
  /** 场景 + 位置 + 画面：变化时脉冲重新播放。 */
  pulseKey: string;
};

/** 需要测量的元素 id（去重）。 */
function idsOf(f: FocusState, next: string | null): string[] {
  const out = new Set<string>([...f.spotlight, ...f.highlight, ...f.numbered, ...f.callouts.map((c) => c.target), ...f.reveal]);
  if (next && f.spotlight.length) out.add(next);
  return [...out];
}

/** 测量这些元素在镜头容器里的矩形（内容坐标），只取实际可见的部分；内容、镜头变化后重新测量。 */
/** 归属元素（ownershipEls）测出的矩形记在这个前缀下：`^own:<目标 id>:<序号>`。 */
const OWN = '^own:';

function useBoxes(ids: string[], wrapRef: RefObject<HTMLDivElement | null>, contentRef: RefObject<HTMLDivElement | null>, deps: unknown[], animate: boolean, withOwnership: readonly string[] = []): Map<string, Box> {
  const [boxes, setBoxes] = useState<Map<string, Box>>(new Map());
  const { registry } = useContext(ThemeContext);
  const key = `${ids.join('|')}#${withOwnership.join('|')}`;
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const host = wrap?.parentElement;
    if (!wrap || !host || !ids.length) {
      setBoxes((b) => (b.size ? new Map() : b));
      return;
    }
    const token = {};
    registry?.add(token);
    let last = '';
    let raf = 0;
    let pending = 0;
    let n = 0;
    const toBox = (r: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>): Box => ({ x: r.left, y: r.top, w: r.width, h: r.height });
    const measure = () => {
      const wr = rectOf(wrap);
      const scale = wr.width / (wrap.offsetWidth || 1);
      const next = new Map<string, Box>();
      const boxOf = (el: Element): Box | null => {
        const clips = [toBox(rectOf(host))];
        for (let p: Element | null = el; p && p !== wrap; p = p.parentElement) {
          const cs = getComputedStyle(p);
          if (cs.display === 'none' || cs.visibility === 'hidden') return null;
          if (p !== el && (cs.overflowX !== 'visible' || cs.overflowY !== 'visible')) clips.push(toBox(rectOf(p)));
        }
        return markBox(toBox(rectOf(el)), { x: wr.left, y: wr.top }, scale, clips);
      };
      for (const id of ids) {
        const el: HTMLElement | null = wrap.querySelector<HTMLElement>(`[data-jid="${CSS.escape(id)}"]`);
        if (!el) continue;
        const box = boxOf(el);
        if (!box) continue;
        next.set(id, box);
        if (withOwnership.includes(id))
          ownershipEls(el).forEach((o, i) => { const b = boxOf(o); if (b) next.set(`${OWN}${id}:${i}`, b); });
      }
      const sig = JSON.stringify([...next].map(([id, b]) => [id, round(b.x), round(b.y), round(b.w), round(b.h)]));
      if (sig !== last) {
        last = sig;
        setBoxes(next);
      }
    };
    const tick = () => {
      measure();
      if (++n < (animate ? 50 : 15)) raf = requestAnimationFrame(tick);
      else registry?.done(token);
    };
    tick();
    const schedule = () => { if (!pending) pending = requestAnimationFrame(() => { pending = 0; measure(); }); };
    const content = contentRef.current;
    const mo = new MutationObserver(schedule);
    if (content) mo.observe(content, { childList: true, characterData: true, subtree: true });
    const ro = new ResizeObserver(schedule);
    if (content) ro.observe(content);
    wrap.addEventListener('scroll', schedule, true);
    // 作者用 CSS 过渡移动的元素（style 绑定状态 + transition）：开头那几十帧测量结束后它可能还在动。
    // 舞台里有过渡在跑时逐帧重测，全部结束后再测最后一次，提示框跟着目标走到终点。
    // 同一元素可能有几个属性各自过渡（left 1.4s、opacity 0.4s），按“元素 + 属性”计数，最长的那个结束才停。
    const running = new TransitionTracker<EventTarget>();
    const startedAt = performance.now();
    let follow = 0;
    const followTick = () => {
      // 过渡中途被移除的元素不会再发 transitionend；另设 30 秒上限，避免任何情况下空转
      running.prune((t) => (t as Node).isConnected);
      measure();
      follow = running.active && performance.now() - startedAt < 30_000 ? requestAnimationFrame(followTick) : 0;
    };
    const onRun = (e: Event) => {
      const { target, propertyName } = e as TransitionEvent;
      if (!target) return;
      running.run(target, propertyName);
      if (!follow) follow = requestAnimationFrame(followTick);
    };
    const onEnd = (e: Event) => {
      const { target, propertyName } = e as TransitionEvent;
      if (target) running.end(target, propertyName);
      schedule();
    };
    wrap.addEventListener('transitionrun', onRun, true);
    wrap.addEventListener('transitionend', onEnd, true);
    wrap.addEventListener('transitioncancel', onEnd, true);
    return () => {
      registry?.remove(token);
      mo.disconnect();
      ro.disconnect();
      cancelAnimationFrame(raf);
      cancelAnimationFrame(pending);
      cancelAnimationFrame(follow);
      wrap.removeEventListener('scroll', schedule, true);
      wrap.removeEventListener('transitionrun', onRun, true);
      wrap.removeEventListener('transitionend', onEnd, true);
      wrap.removeEventListener('transitioncancel', onEnd, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, animate, ...deps]);
  return boxes;
}

export function Cues({ focus, wrapRef, contentRef, width, height, view, nextTargetId, cameraTargets, animate, pulseKey }: CuesProps) {
  const ids = useMemo(() => idsOf(focus, nextTargetId), [focus, nextTargetId]);
  const k = view && view.k > 0 ? view.k : 1;
  const boxes = useBoxes(ids, wrapRef, contentRef, [pulseKey, view?.k, view?.tx, view?.ty, width, height], animate, focus.spotlight);
  const region = visibleRegion(width, height, view);
  const has = (id: string) => boxes.has(id);
  const spot = focus.spotlight.filter(has);
  // 聚光图表元素时，洞口同时留出它的归属信息（父分组标题 / 时序图两端参与者的头部），与 D69 取景同一条规则
  const owned = spot.flatMap((id) => [...boxes].filter(([k]) => k.startsWith(`${OWN}${id}:`)).map(([, b]) => b));
  const holes = spot.length ? spotlightHoles([...[...spot, ...(nextTargetId && has(nextTargetId) ? [nextTargetId] : [])].map((id) => boxes.get(id)!), ...owned], SPOT_PAD / k) : [];
  const spotPath = spotlightPath(holes, 10 / k);
  const rings = [...new Set([...focus.spotlight, ...focus.highlight])].filter((id) => has(id) && !cameraTargets.includes(id));
  const numbered = focus.numbered.filter(has);
  const callouts = focus.callouts.filter((c) => has(c.target));
  // 结果揭晓：相邻的几处（终端里的命令和输出）合并成一个框
  const reveal = animate ? spotlightHoles(focus.reveal.filter((id) => has(id) && !rings.includes(id)).map((id) => boxes.get(id)!), 4 / k) : [];
  if (!spotPath && !rings.length && !numbered.length && !callouts.length && !reveal.length) return <div className="pointer-events-none absolute inset-0" data-jlayer="cues" />;
  return (
    <>
      {spotPath ? (
        <motion.svg key={`spot:${pulseKey}`} className="pointer-events-none absolute left-0 top-0" style={{ zIndex: 22, overflow: 'visible' }} width={width} height={height} aria-hidden data-jlayer="spotlight" data-jspot={spot.join(',')}
          initial={animate ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ duration: animate ? 0.35 : 0 }}>
          <path d={spotPath} fillRule="evenodd" style={{ fill: 'color-mix(in srgb, var(--jp-bg) 74%, transparent)' }} />
        </motion.svg>
      ) : null}
      <div className="pointer-events-none absolute inset-0" style={{ zIndex: 28 }} data-jlayer="cues">
        {rings.map((id) => <Ring key={`${pulseKey}:${id}`} id={id} box={boxes.get(id)!} k={k} animate={animate} />)}
        {reveal.map((box, i) => <Reveal key={`${pulseKey}:r:${i}`} box={box} k={k} />)}
        {numbered.map((id, i) => <Badge key={`${pulseKey}:n:${id}`} id={id} n={i + 1} box={boxes.get(id)!} k={k} region={region} animate={animate} delay={i * 0.12} />)}
        <Callouts items={callouts.map((c) => ({ ...c, box: boxes.get(c.target)! }))} k={k} region={region} avoid={[...rings, ...numbered].map((id) => boxes.get(id)!)} animate={animate} pulseKey={pulseKey} />
      </div>
    </>
  );
}

/** 强调框：贴着目标外沿，出现时脉冲一次（与镜头高光同一种画法）。 */
function Ring({ id, box, k, animate }: { id: string; box: Box; k: number; animate: boolean }) {
  const mode = useStroke();
  const r = 8 / k;
  const style = { position: 'absolute' as const, left: box.x, top: box.y, width: box.w, height: box.h, borderRadius: r };
  return (
    <div data-jcue="ring" data-jcue-target={id}>
      <motion.div style={{ ...style, ...(mode === 'clean' ? { boxShadow: `0 0 0 ${2.5 / k}px ${ACCENT}` } : {}) }} initial={animate ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ duration: animate ? 0.3 : 0, delay: animate ? 0.15 : 0 }}>
        {mode === 'rough' ? (
          <div style={{ position: 'absolute', left: -3 / k, top: -3 / k, right: -3 / k, bottom: -3 / k }}>
            <Rough seedKey={`cue:${id}`} shape="roundrect" radius={r + 3 / k} stroke={ACCENT} strokeWidth={2.4 / k} inset={1.5 / k} />
          </div>
        ) : null}
      </motion.div>
      {/* 脉冲一次：向外扩固定 10 屏幕像素再淡出（按比例放大时，宽元素会扩得太远） */}
      {animate ? <motion.div style={{ ...style, border: `${2 / k}px solid ${ACCENT}` }} initial={{ opacity: 0.8, scaleX: 1, scaleY: 1 }} animate={{ opacity: 0, scaleX: 1 + 20 / k / Math.max(1, box.w), scaleY: 1 + 20 / k / Math.max(1, box.h) }} transition={{ duration: 0.9, delay: 0.3 }} /> : null}
    </div>
  );
}

/** 结果揭晓（默认）：本步新出现或变化的元素外沿亮一下再淡出，不留痕迹。box 已含外扩。 */
function Reveal({ box, k }: { box: Box; k: number }) {
  return (
    <motion.div data-jcue="reveal"
      style={{ position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h, borderRadius: 10 / k, boxShadow: `0 0 0 ${2 / k}px color-mix(in srgb, ${ACCENT} 85%, transparent), 0 0 0 ${7 / k}px color-mix(in srgb, ${ACCENT} 18%, transparent)` }}
      initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 1, 0] }} transition={{ duration: 1.6, times: [0, 0.2, 0.6, 1], delay: 0.2, ease: 'easeOut' }} />
  );
}

/** 编号角标：目标左上角一个强调色圆点写序号，目标外沿一圈细框；依次出现。 */
function Badge({ id, n, box, k, region, animate, delay }: { id: string; n: number; box: Box; k: number; region: Box; animate: boolean; delay: number }) {
  const size = BADGE / k;
  const c = badgeCenter(box, size, region);
  return (
    <div data-jcue="number" data-jcue-target={id} data-n={n}>
      <div style={{ position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h, borderRadius: 6 / k, boxShadow: `0 0 0 ${1.5 / k}px color-mix(in srgb, ${ACCENT} 70%, transparent)` }} />
      <motion.div
        style={{ position: 'absolute', left: c.x - size / 2, top: c.y - size / 2, width: size, height: size, borderRadius: '50%', background: ACCENT, color: 'var(--jp-surface)', fontSize: 14 / k, fontWeight: 700, lineHeight: `${size}px`, textAlign: 'center', fontFamily: 'var(--jp-font)', boxShadow: `0 0 0 ${2 / k}px var(--jp-surface)` }}
        initial={animate ? { opacity: 0, scale: 0.6 } : false} animate={{ opacity: 1, scale: 1 }} transition={{ duration: animate ? 0.25 : 0, delay: animate ? 0.2 + delay : 0 }}
      >{n}</motion.div>
    </div>
  );
}

type CalloutItem = { target: string; text: string; side?: Side; box: Box };

/**
 * 标注气泡（便签式说明）：先按最大宽度排一次量出大小，再选边（cue-math.placeCallout，避开目标、其他气泡和已画的框），
 * 引线从气泡边连到目标边，目标端一个小圆点。
 */
function Callouts({ items, k, region, avoid, animate, pulseKey }: { items: CalloutItem[]; k: number; region: Box; avoid: Box[]; animate: boolean; pulseKey: string }) {
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const [sizes, setSizes] = useState<{ w: number; h: number }[]>([]);
  const sig = items.map((c) => `${c.target}:${c.text}`).join('|');
  useLayoutEffect(() => {
    const next = items.map((_, i) => {
      const el = refs.current[i];
      return el ? { w: el.offsetWidth / k, h: el.offsetHeight / k } : { w: 0, h: 0 };
    });
    if (JSON.stringify(next) !== JSON.stringify(sizes)) setSizes(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, k]);
  const placed: Box[] = [...avoid, ...items.map((c) => c.box)];
  const layout: (CalloutPlacement | null)[] = items.map((c, i) => {
    const s = sizes[i];
    if (!s || s.w <= 0) return null;
    const p = placeCallout(c.box, s, region, { side: c.side, placed, gap: 16 / k, margin: 8 / k });
    placed.push(p.box);
    return p;
  });
  return (
    <>
      {items.map((c, i) => {
        const p = layout[i];
        return (
          <div key={`${pulseKey}:c:${c.target}:${i}`} data-jcue="callout" data-jcue-target={c.target} data-side={p?.side}>
            {p ? (
              <svg style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }} width={1} height={1} aria-hidden>
                <RoughPath seedKey={`callout:${pulseKey}:${i}`} d={`M${p.from.x},${p.from.y} L${p.to.x},${p.to.y}`} stroke="var(--jp-ink)" strokeWidth={1.4 / k} draw={animate} />
                <circle cx={p.to.x} cy={p.to.y} r={3 / k} style={{ fill: 'var(--jp-ink)' }} />
              </svg>
            ) : null}
            <motion.div
              ref={(el) => { refs.current[i] = el; }}
              className="jbox"
              style={{
                position: 'absolute', left: p ? p.box.x : 0, top: p ? p.box.y : 0, visibility: p ? 'visible' : 'hidden',
                width: 'max-content', maxWidth: CALLOUT_MAX_W, padding: '7px 12px',
                // 屏幕上固定大小：用 Motion 的 scale（写成 transform 字符串会被 y 动画覆盖）
                scale: 1 / k, transformOrigin: '0 0',
                background: `color-mix(in srgb, ${ACCENT} 16%, var(--jp-surface))`, color: 'var(--jp-ink)', border: '1.5px solid var(--jp-ink)', borderRadius: 'var(--jp-radius, 6px)',
                boxShadow: '3px 3px 0 color-mix(in srgb, var(--jp-ink) 18%, transparent)', fontFamily: 'var(--jp-font)', fontSize: 15, lineHeight: 1.45, overflowWrap: 'anywhere', textWrap: 'balance' as never,
              }}
              initial={animate ? { opacity: 0, y: 4 / k } : false} animate={{ opacity: 1, y: 0 }} transition={{ duration: animate ? 0.3 : 0, delay: animate ? 0.35 : 0 }}
            >
              <Rough seedKey={`callout-box:${c.target}`} stroke="var(--jp-ink)" strokeWidth={1.4} />
              <span style={{ position: 'relative' }}>{c.text}</span>
            </motion.div>
          </div>
        );
      })}
    </>
  );
}
