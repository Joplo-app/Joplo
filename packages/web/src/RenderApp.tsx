/**
 * 渲染专用路由（renderStep 使用）：/?render=1&scenario=..&position=..&theme=..[&w=..&h=..]
 * 只渲染舞台，固定尺寸，关闭动画。字体与 rough 绘制都完成后设置 window.__JOPLO_READY__ = true，
 * 并暴露 window.__JOPLO_STATE__（当前 PlayState）。
 */
import { useEffect, useMemo, useState } from 'react';
import { stateAt, type PlayState, type Project } from '@tokenroll/joplo-core';
import { fetchIR } from './runtime/dev-client';
import { Stage } from './renderer/Stage';
import { RoughRegistry, type StageTheme } from './renderer/rough';

type W = { __JOPLO_READY__?: boolean; __JOPLO_STATE__?: PlayState | null; __JOPLO_ERROR__?: string | null };

const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

export function RenderApp() {
  const params = new URLSearchParams(location.search);
  const scenarioId = params.get('scenario') ?? '';
  const position = Number(params.get('position') ?? '0');
  const theme: StageTheme = params.get('theme') === 'clean' ? 'clean' : 'sketch';
  // 可选的舞台尺寸（renderStep 的 viewport）：覆盖页面自身的 viewport，响应式属性按它取值
  const w = Number(params.get('w'));
  const h = Number(params.get('h'));
  const override = w > 0 && h > 0 ? { width: w, height: h } : null;
  const registry = useMemo(() => new RoughRegistry(), []);
  const [data, setData] = useState<{ project: Project; state: PlayState } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    (async () => {
      const r = await fetchIR();
      if ('error' in r) return fail(r.error);
      if (!r.project) return fail(r.diagnostics.map((d) => `${d.at ?? ''} ${d.message}`).join('；') || '项目没有成功编译');
      try {
        setData({ project: r.project, state: stateAt(r.project, scenarioId, position) });
      } catch (e) {
        fail(e instanceof Error ? e.message : String(e));
      }
    })();
    function fail(msg: string) {
      setError(msg);
      const w = window as unknown as W;
      w.__JOPLO_ERROR__ = msg;
      w.__JOPLO_STATE__ = null;
      w.__JOPLO_READY__ = true;
    }
  }, [scenarioId, position]);

  useEffect(() => {
    if (!data || !stage) return;
    let cancelled = false;
    (async () => {
      const w = window as unknown as W;
      w.__JOPLO_STATE__ = data.state;
      await raf();
      if (theme === 'sketch') {
        const text = stage.innerText || '中文';
        await Promise.all([document.fonts.load('16px "Joplo Excalifont"', text), document.fonts.load('16px "Joplo Xiaolai"', text)]).catch(() => undefined);
      }
      await document.fonts.ready;
      while (registry.size > 0 && !cancelled) await new Promise<void>((r) => setTimeout(r, 20));
      await raf();
      await raf();
      if (!cancelled) w.__JOPLO_READY__ = true;
    })();
    return () => {
      cancelled = true;
    };
  }, [data, stage, registry, theme]);

  if (error) return <div style={{ padding: 24, color: '#c92a2a', fontFamily: 'system-ui' }} data-render-error="">渲染失败：{error}</div>;
  if (!data) return null;
  const sc = data.project.scenarios[scenarioId];
  const next = sc && !data.state.completed ? sc.steps[data.state.position] : undefined;
  return (
    <div style={{ position: 'absolute', left: 0, top: 0 }}>
      <Stage project={data.project} state={data.state} theme={theme} mode="render" animate={false} registry={registry} nextTargetId={next && 'target' in next.action ? next.action.target : null} stageRef={setStage} viewportOverride={override} />
    </div>
  );
}
