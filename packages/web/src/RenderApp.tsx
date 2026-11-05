/**
 * 渲染专用路由（renderStep 与看板导出使用）：
 *   /?render=1&project=<id>&scenario=..&position=..&theme=..[&w=..&h=..][&frame=1][&record=1]
 * - 只渲染舞台，尺寸跟随页面自己的 viewport（D44：不再覆盖设备），关闭入场动画。字体、rough 绘制与镜头都稳定后
 *   设置 window.__JOPLO_READY__ = true，并暴露 window.__JOPLO_STATE__（当前 PlayState）。
 * - 镜头（D43）：用这一步的导演镜头（cameraAt），静态截图没有动画。
 * - w/h：截图尺寸。`[data-jshot]` 是 w×h 的画布，舞台（手机页面带外框）按比例放进去。
 * - frame=1：导出图片 / 视频用，`[data-jexport]` 包住画面；手机时套上与看板相同的手机外框（PhoneFrame）。
 * - record=1：导出视频用，带鼠标、点击波纹与字幕；window.__JOPLO_RECORD__.play() 开始自动播放，
 *   .progress = { step, done, error } 供服务端读取进度。
 */
import { useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { displaySceneId, stateAt, type PlayState, type Project } from '@tokenroll/joplo-core';
import { fetchIR } from './runtime/dev-client';
import { DemoController } from './runtime/demo';
import { Stage, VIEWPORTS, type Viewport } from './renderer/Stage';
import { PhoneFrame, phoneFrameSize } from './renderer/components';
import { cameraFor } from './player/cameraFor';
import { RoughRegistry, ThemeContext, type StageTheme } from './renderer/rough';
import { Overlay } from './player/Overlay';
import { ExplainCard, cardWidth } from './player/ExplainCard';
import { cardReserve } from './player/callout';
import type { CameraPlan } from './player/cameraFor';
import type { Scenario } from '@tokenroll/joplo-core';

/** 用镜头的方案（导演跟随）：解说卡与镜头给它留的位置，与演示页一致（T-director2）。 */
function withCard(plan: CameraPlan, W: number) {
  return plan.spec && plan.enabled ? { ...plan.spec, reserve: cardReserve(W, cardWidth(W)) } : plan.spec;
}
const cardStepOf = (plan: CameraPlan, sc: Scenario | undefined | null, index: number | null) => (plan.enabled && sc && index !== null && index >= 0 ? (sc.steps[index] ?? null) : null);

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
  const frame = params.get('frame') === '1';
  const record = params.get('record') === '1';
  // 可选的截图尺寸（renderStep 的 viewport）：只决定画布大小，舞台宽度仍是页面自己的 viewport（D44）
  const w = Number(params.get('w'));
  const h = Number(params.get('h'));
  const shot = w > 0 && h > 0 ? { width: w, height: h } : null;
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
      // 镜头稳定（测量了若干帧）后再截图
      for (let i = 0; i < 100 && !cancelled; i++) {
        const cam = stage.querySelector<HTMLElement>('[data-jcamera]');
        if (!cam || cam.dataset.cameraSettled === '1') break;
        await raf();
      }
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
  // 有层级的方案：显示这一步导演层的画面（每层是独立画面），设备取这个画面的设置
  const shownId = data.project.scenarios[scenarioId] ? displaySceneId(data.project, scenarioId, data.state.position) : data.state.sceneId;
  const viewport: Viewport = data.project.scenes[shownId]?.viewport === 'mobile' ? 'mobile' : 'desktop';
  const vp = VIEWPORTS[viewport];
  const framed = (stageNode: ReactNode) =>
    viewport === 'mobile' ? (
      <ThemeContext.Provider value={{ theme, registry }}>
        <PhoneFrame width={vp.width} height={vp.height} seed="stage-phone">
          {stageNode}
        </PhoneFrame>
      </ThemeContext.Provider>
    ) : (
      stageNode
    );
  const wrap = (stageNode: ReactNode) => {
    if (frame)
      return (
        <div data-jexport="" style={{ position: 'absolute', left: 0, top: 0, display: 'inline-block', ...(viewport === 'mobile' ? { background: '#ffffff', padding: 16 } : {}) }}>
          {framed(stageNode)}
        </div>
      );
    if (shot) {
      // 截图画布：舞台（手机页面带外框）按比例放进 w×h，居中
      const fw = viewport === 'mobile' ? phoneFrameSize(vp.width, vp.height).width : vp.width;
      const fh = viewport === 'mobile' ? phoneFrameSize(vp.width, vp.height).height : vp.height;
      const k = Math.min(shot.width / fw, shot.height / fh);
      return (
        <div data-jshot="" style={{ position: 'absolute', left: 0, top: 0, width: shot.width, height: shot.height, overflow: 'hidden', background: '#f8f9fa' }}>
          <div style={{ position: 'absolute', left: (shot.width - fw * k) / 2, top: (shot.height - fh * k) / 2, width: fw, height: fh, transform: `scale(${k})`, transformOrigin: '0 0' }}>{framed(stageNode)}</div>
        </div>
      );
    }
    return <div style={{ position: 'absolute', left: 0, top: 0 }}>{stageNode}</div>;
  };
  if (record) return <RecordStage project={data.project} scenarioId={scenarioId} theme={theme} registry={registry} setStage={setStage} wrap={wrap} />;
  const sc = data.project.scenarios[scenarioId];
  const next = sc && !data.state.completed ? sc.steps[data.state.position] : undefined;
  const plan = cameraFor(data.project, sc ? scenarioId : null, data.state.position, null);
  const card = cardStepOf(plan, sc, data.state.position - 1);
  return wrap(
    <Stage
      project={data.project}
      state={data.state}
      theme={theme}
      mode="render"
      animate={false}
      registry={registry}
      nextTargetId={next && 'target' in next.action ? next.action.target : null}
      stageRef={setStage}
      camera={withCard(plan, vp.width)}
      sceneId={plan.sceneId}
      overlay={card ? <ExplainCard stage={stage} stepKey={card.id} caption={card.caption} explain={card.explain ?? null} animate={false} /> : null}
    />,
  );
}

/** 录制模式：与看板同一个演示控制器（鼠标、波纹、逐字输入、系统事件、字幕），由服务端触发自动播放。 */
function RecordStage({ project, scenarioId, theme, registry, setStage, wrap }: { project: Project; scenarioId: string; theme: StageTheme; registry: RoughRegistry; setStage: (el: HTMLDivElement | null) => void; wrap: (n: ReactNode) => ReactNode }) {
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
  // 与演示页一致：导演跟随；下一步的操作目标不在当前层时先切到它所在的层（leadLayer）
  const plan = cameraFor(project, scenarioId, snap.state?.position ?? 0, snap.leadLayer);
  useLayoutEffect(() => ctl.setStageView(plan.sceneId, true), [ctl, plan.sceneId]);
  const W = VIEWPORTS[project.scenes[plan.sceneId ?? snap.state?.sceneId ?? '']?.viewport === 'mobile' ? 'mobile' : 'desktop'].width;
  const pos = snap.state?.position ?? 0;
  const card = cardStepOf(plan, sc, snap.activeStep ?? pos - 1);
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
      camera={withCard(plan, W)}
      sceneId={plan.sceneId}
      stageRef={(el) => {
        ctl.setStageEl(el);
        setStageEl(el);
        setStage(el);
      }}
      overlay={
        <>
          <Overlay snap={snap} stage={stageEl} nextTargetId={null} caption={card ? null : (shown?.caption ?? (snap.playing && pos > 0 ? (sc?.steps[pos - 1]?.caption ?? null) : null))} setCursorEl={ctl.setCursorEl} onBackToDemo={() => undefined} onDismiss={() => undefined} />
          {card ? <ExplainCard stage={stageEl} stepKey={card.id} caption={card.caption} explain={card.explain ?? null} animate /> : null}
        </>
      }
    />,
  );
}
