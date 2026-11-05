/**
 * 渲染专用路由（renderStep 与看板导出使用）：
 *   /?render=1&project=<id>&scenario=..&position=..&theme=..[&w=..&h=..][&device=mobile|desktop][&frame=1][&record=1]
 * - 只渲染舞台，固定尺寸，关闭入场动画。字体与 rough 绘制都完成后设置 window.__JOPLO_READY__ = true，
 *   并暴露 window.__JOPLO_STATE__（当前 PlayState）。
 * - frame=1：导出图片 / 视频用，`[data-jexport]` 包住画面；手机时套上与看板相同的手机外框（PhoneFrame）。
 * - record=1：导出视频用，带鼠标、点击波纹与字幕；window.__JOPLO_RECORD__.play() 开始自动播放，
 *   .progress = { step, done, error } 供服务端读取进度。
 */
import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { stateAt, type PlayState, type Project } from '@tokenroll/joplo-core';
import { fetchIR } from './runtime/dev-client';
import { DemoController } from './runtime/demo';
import { Stage, VIEWPORTS, viewportOf, type Viewport } from './renderer/Stage';
import { PhoneFrame } from './renderer/components';
import { RoughRegistry, ThemeContext, type StageTheme } from './renderer/rough';
import { Overlay } from './player/Overlay';

type W = {
  __JOPLO_READY__?: boolean;
  __JOPLO_STATE__?: PlayState | null;
  __JOPLO_ERROR__?: string | null;
  __JOPLO_RECORD__?: { play(): void; progress: { step: number; done: boolean; error: string | null } };
};

const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

export function RenderApp() {
  const params = new URLSearchParams(location.search);
  const projectId = params.get('project') ?? '';
  const scenarioId = params.get('scenario') ?? '';
  const position = Number(params.get('position') ?? '0');
  const theme: StageTheme = params.get('theme') === 'clean' ? 'clean' : 'sketch';
  const deviceParam = params.get('device');
  const frame = params.get('frame') === '1';
  const record = params.get('record') === '1';
  // 可选的舞台尺寸（renderStep 的 viewport）：覆盖页面自身的 viewport，响应式属性按它取值
  const w = Number(params.get('w'));
  const h = Number(params.get('h'));
  const override = w > 0 && h > 0 ? { width: w, height: h } : deviceParam === 'mobile' || deviceParam === 'desktop' ? (deviceParam as Viewport) : null;
  const registry = useMemo(() => new RoughRegistry(), []);
  const [data, setData] = useState<{ project: Project; state: PlayState } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    (async () => {
      const r = await fetchIR(projectId);
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
  }, [projectId, scenarioId, position]);

  useEffect(() => {
    if (!data || !stage) return;
    let cancelled = false;
    (async () => {
      const w = window as unknown as W;
      if (!record) w.__JOPLO_STATE__ = data.state;
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
  }, [data, stage, registry, theme, record]);

  if (error) return <div style={{ padding: 24, color: '#c92a2a', fontFamily: 'system-ui' }} data-render-error="">渲染失败：{error}</div>;
  if (!data) return null;
  const viewport: Viewport = override && typeof override === 'string' ? override : override ? (override.width < 600 ? 'mobile' : 'desktop') : viewportOf(data.project, data.state);
  const wrap = (stageNode: ReactNode) => {
    if (!frame) return <div style={{ position: 'absolute', left: 0, top: 0 }}>{stageNode}</div>;
    const vp = typeof override === 'object' && override ? override : VIEWPORTS[viewport];
    return (
      <div data-jexport="" style={{ position: 'absolute', left: 0, top: 0, display: 'inline-block', ...(viewport === 'mobile' ? { background: '#ffffff', padding: 16 } : {}) }}>
        {viewport === 'mobile' ? (
          <ThemeContext.Provider value={{ theme, registry }}>
            <PhoneFrame width={vp.width} height={vp.height} seed="stage-phone">
              {stageNode}
            </PhoneFrame>
          </ThemeContext.Provider>
        ) : (
          stageNode
        )}
      </div>
    );
  };
  if (record) return <RecordStage project={data.project} scenarioId={scenarioId} theme={theme} override={override} registry={registry} setStage={setStage} wrap={wrap} />;
  const sc = data.project.scenarios[scenarioId];
  const next = sc && !data.state.completed ? sc.steps[data.state.position] : undefined;
  return wrap(
    <Stage project={data.project} state={data.state} theme={theme} mode="render" animate={false} registry={registry} nextTargetId={next && 'target' in next.action ? next.action.target : null} stageRef={setStage} viewportOverride={override} />,
  );
}

/** 录制模式：与看板同一个演示控制器（鼠标、波纹、逐字输入、系统事件、字幕），由服务端触发自动播放。 */
function RecordStage({ project, scenarioId, theme, override, registry, setStage, wrap }: { project: Project; scenarioId: string; theme: StageTheme; override: Viewport | { width: number; height: number } | null; registry: RoughRegistry; setStage: (el: HTMLDivElement | null) => void; wrap: (n: ReactNode) => ReactNode }) {
  const ctl = useMemo(() => {
    const c = new DemoController(null);
    c.reducedMotion = false;
    c.setProject(project, 1, null);
    c.setScenario(scenarioId, 0, { quiet: true });
    return c;
  }, [project, scenarioId]);
  const snap = useSyncExternalStore(ctl.subscribe, ctl.getSnapshot);
  const [stageEl, setStageEl] = useState<HTMLDivElement | null>(null);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const w = window as unknown as W;
    const total = project.scenarios[scenarioId]?.steps.length ?? 0;
    w.__JOPLO_STATE__ = snap.state;
    w.__JOPLO_RECORD__ = {
      play: () => {
        setStarted(true);
        if (total === 0) return;
        void ctl.play();
      },
      progress: {
        step: snap.state?.position ?? 0,
        done: started && !snap.playing && (total === 0 || !!snap.state?.completed || (snap.state?.position ?? 0) >= total || !!snap.playbackError),
        error: snap.playbackError,
      },
    };
  }, [snap, started, ctl, project, scenarioId]);

  const next = ctl.nextStep();
  const nextTargetId = next && 'target' in next.action ? next.action.target : null;
  const sc = ctl.scenario();
  const shown = sc && snap.activeStep !== null ? sc.steps[snap.activeStep] : null;
  if (!snap.state) return null;
  return wrap(
    <Stage
      project={project}
      state={snap.state}
      theme={theme}
      mode="demo"
      registry={registry}
      preview={snap.preview}
      epoch={snap.epoch}
      animate
      nextTargetId={nextTargetId}
      viewportOverride={override}
      stageRef={(el) => {
        ctl.setStageEl(el);
        setStageEl(el);
        setStage(el);
      }}
      overlay={<Overlay snap={snap} stage={stageEl} nextTargetId={null} caption={shown?.caption ?? null} setCursorEl={ctl.setCursorEl} onBackToDemo={() => undefined} onDismiss={() => undefined} />}
    />,
  );
}
