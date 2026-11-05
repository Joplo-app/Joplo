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
import { SUBTITLE_HEIGHT, displaySceneId, stateAt, type PlayState, type Project } from '@tokenroll/joplo-core';
import { fetchIR } from './runtime/dev-client';
import { DemoController } from './runtime/demo';
import { Stage, VIEWPORTS, type Viewport } from './renderer/Stage';
import { PhoneFrame, phoneFrameSize } from './renderer/components';
import { cameraFor } from './player/cameraFor';
import { RoughRegistry, ThemeContext, type StageTheme } from './renderer/rough';
import { Overlay } from './player/Overlay';
import { cameraPosition } from './player/cameraFor';
import { Subtitle } from './player/Subtitle';
import { subtitleFor, type SubtitleContent } from './player/subtitle-content';

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
  // 字幕区放在舞台（手机含外框）正下方，宽度相同：截图、导出图片与视频都带上它
  const fw = viewport === 'mobile' ? phoneFrameSize(vp.width, vp.height).width : vp.width;
  const fh = (viewport === 'mobile' ? phoneFrameSize(vp.width, vp.height).height : vp.height) + SUBTITLE_HEIGHT;
  // 视频与固定尺寸的截图画布用固定高度（画面尺寸不随字幕行数变化）；单张截图与导出图片按内容自适应
  const fixedSub = record || !!shot;
  const withSub = (node: ReactNode, sub: SubtitleContent | null, w: number) => (
    <div style={{ display: 'flex', flexDirection: 'column', width: w }}>
      {node}
      <Subtitle content={sub} theme={theme} width={w} framed fixedHeight={fixedSub ? SUBTITLE_HEIGHT : undefined} />
    </div>
  );
  const wrap = (stageNode: ReactNode, sub: SubtitleContent | null) => {
    if (frame)
      return (
        <div data-jexport="" style={{ position: 'absolute', left: 0, top: 0, display: 'inline-block', ...(viewport === 'mobile' ? { background: '#ffffff', padding: 16 } : {}) }}>
          {withSub(framed(stageNode), sub, fw)}
        </div>
      );
    if (shot) {
      // 截图画布：舞台（手机页面带外框）加字幕区按比例放进 w×h，居中
      const k = Math.min(shot.width / fw, shot.height / fh);
      return (
        <div data-jshot="" style={{ position: 'absolute', left: 0, top: 0, width: shot.width, height: shot.height, overflow: 'hidden', background: '#f8f9fa' }}>
          <div style={{ position: 'absolute', left: (shot.width - fw * k) / 2, top: (shot.height - fh * k) / 2, width: fw, height: fh, transform: `scale(${k})`, transformOrigin: '0 0' }}>{withSub(framed(stageNode), sub, fw)}</div>
        </div>
      );
    }
    return (
      <div data-jrender="" style={{ position: 'absolute', left: 0, top: 0 }}>
        {withSub(stageNode, sub, vp.width)}
      </div>
    );
  };
  if (record) return <RecordStage project={data.project} scenarioId={scenarioId} theme={theme} registry={registry} setStage={setStage} wrap={wrap} />;
  const sc = data.project.scenarios[scenarioId];
  const next = sc && !data.state.completed ? sc.steps[data.state.position] : undefined;
  const plan = cameraFor(data.project, sc ? scenarioId : null, data.state.position, null);
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
      camera={plan.spec}
      sceneId={plan.sceneId}
    />,
    subtitleFor(sc, data.state.position, null, data.state.completed),
  );
}

/** 录制模式：与看板同一个演示控制器（鼠标、波纹、逐字输入、系统事件、字幕），由服务端触发自动播放。 */
function RecordStage({ project, scenarioId, theme, registry, setStage, wrap }: { project: Project; scenarioId: string; theme: StageTheme; registry: RoughRegistry; setStage: (el: HTMLDivElement | null) => void; wrap: (n: ReactNode, sub: SubtitleContent | null) => ReactNode }) {
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
  // 与演示页一致：导演跟随；下一步的操作目标不在当前层时先切到它所在的层（leadLayer）
  const plan = cameraFor(project, scenarioId, cameraPosition(ctl.scenario(), snap.state?.position ?? 0, snap.activeStep), snap.leadLayer);
  useLayoutEffect(() => ctl.setStageView(plan.sceneId, true), [ctl, plan.sceneId]);
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
      camera={plan.spec}
      sceneId={plan.sceneId}
      stageRef={(el) => {
        ctl.setStageEl(el);
        setStageEl(el);
        setStage(el);
      }}
      overlay={<Overlay snap={snap} stage={stageEl} nextTargetId={null} setCursorEl={ctl.setCursorEl} onBackToDemo={() => undefined} onDismiss={() => undefined} />}
    />,
    subtitleFor(sc, snap.state.position, snap.activeStep, snap.state.completed),
  );
}
