/**
 * 缩略图（D55「首页」，看板首页与发布站首页共用）：Stage 的 render 模式渲染某个场景的初始画面，进入视口才渲染（懒加载）。
 * 电脑页面按宽度铺满、从顶部裁出上半部分；手机页面按高度放进去。不可交互（inert）。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { VIEWPORT_SIZE, stateAt, type Project } from '@joplo-app/core';
import { Stage } from '../renderer/Stage';
import type { Look } from '../renderer/appearance';

export function StageThumb({ project, scenarioId, sceneId, look, height = 200, testid }: { project: Project; scenarioId: string | null; sceneId: string | null; look: Look; height?: number; testid?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [w, setW] = useState(520);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && setVisible(true), { rootMargin: '200px' });
    io.observe(el);
    return () => {
      ro.disconnect();
      io.disconnect();
    };
  }, []);
  const state = useMemo(() => {
    if (!scenarioId) return null;
    try {
      return stateAt(project, scenarioId, 0);
    } catch {
      return null;
    }
  }, [project, scenarioId]);
  const scene = sceneId ? project.scenes[sceneId] : undefined;
  const mobile = scene?.viewport === 'mobile';
  const vp = VIEWPORT_SIZE[mobile ? 'mobile' : 'desktop'];
  const k = mobile ? Math.min(w / vp.width, height / vp.height) : w / vp.width;
  return (
    <div ref={ref} className="pointer-events-none relative w-full overflow-hidden bg-jb-subtle" style={{ height }} aria-hidden inert data-testid={testid}>
      {visible && state && sceneId && scene ? (
        <div className="absolute left-1/2 top-0" style={{ width: vp.width * k, height: vp.height * k, transform: 'translateX(-50%)' }}>
          <div style={{ width: vp.width, height: vp.height, transform: `scale(${k})`, transformOrigin: '0 0' }}>
            <Stage project={project} state={state} theme={look.theme} font={look.font} stroke={look.stroke} mode="render" animate={false} sceneId={sceneId} viewportOverride={{ width: vp.width, height: vp.height }} />
          </div>
        </div>
      ) : (
        <div className="flex h-full items-center justify-center text-[12px] text-jb-faint">{sceneId ? '' : '还没有画面'}</div>
      )}
    </div>
  );
}
