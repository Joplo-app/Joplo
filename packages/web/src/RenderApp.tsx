import { EngineClockContext } from './renderer/engine-motion';
import { projectThemes } from '@joplo-app/core/runtime';
import { m } from './i18n/board/messages';
import { translate, type Text } from './i18n/messages';
import { useBoardI18n } from './i18n/board/context';
/**
 * 渲染专用路由（renderStep 与看板导出使用）：
 *   /?render=1&project=<id>&scenario=..&position=..&theme=..[&font=..][&stroke=..][&w=..&h=..][&frame=1][&record=1][&locale=en][&content=ja]
 * - content（D84）：作者内容的语言（看板当前的内容语言）；项目没有这种语言或没有 i18n 时忽略。
 * - font / stroke（D55，看板外观）：缺省 = 跟随主题；导出图片、视频与 renderStep 透传，和看板里看到的一致。
 * - 只渲染舞台，尺寸跟随页面自己的 viewport（D44：不再覆盖设备），关闭入场动画。字体、rough 绘制与镜头都稳定后
 *   设置 window.__JOPLO_READY__ = true，并暴露 window.__JOPLO_STATE__（当前 PlayState）。
 * - 镜头（D43）：用这一步的导演镜头（cameraAt），静态截图没有动画。
 * - w/h：截图尺寸。`[data-jshot]` 是 w×h 的画布，舞台（手机页面带外框）按比例放进去。
 * - frame=1：导出图片 / 视频用，`[data-jexport]` 包住画面；手机时套上与看板相同的手机外框（DeviceFrame）。
 * - record=1：导出视频用，带鼠标、点击波纹与字幕；window.__JOPLO_RECORD__.play() 开始自动播放，
 *   .progress = { step, done, error, scenarioId, position, activeStep } 供服务端读取进度。
 * - chain=1（与 record 同用）：放完一个场景接着放同一方案的下一个场景，顺序与发布站的连续播放相同（nextScenarioId）。
 * - voice=estimate（与 record 同用，`joplo render --film/--video`）：不出声，但每段旁白按 voiceMs 估算的时长“读”，
 *   画面停留与发布站开着朗读时一致；不调用任何朗读服务。
 */
import { useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { SUBTITLE_HEIGHT, THEME_NAME, displaySceneId, stateAt, type AppearanceFont, type AppearanceStroke, type PlayState, type Project } from '@joplo-app/core/runtime';
import { fetchIR } from './runtime/dev-client';
import { DemoController } from './runtime/demo';
import { Stage, VIEWPORTS, type Viewport } from './renderer/Stage';
import { viewportDecoration } from './renderer/plugins';
const phoneFrameSize = (width:number,height:number) => viewportDecoration('mobile')?.size(width,height) ?? {width,height};
function DeviceFrame(props: {width:number;height:number;seed?:string;children?:import('react').ReactNode}) { const Frame=viewportDecoration('mobile')?.react; return Frame ? <Frame {...props}/> : <>{props.children}</>; }
import { cameraFor } from './player/cameraFor';
import { RoughRegistry, ThemeContext, type StageTheme } from './renderer/rough';
import { Overlay } from './player/Overlay';
import { appearanceFromParams, resolveLook } from './renderer/appearance';
import { ThemeStyles } from './renderer/ThemeStyles';
import { cameraPosition } from './player/cameraFor';
import { Subtitle } from './player/Subtitle';
import { subtitleFor, type SubtitleContent } from './player/subtitle-content';
import { coverFor, coverShown } from './player/cover-content';
import { Curtain } from './player/Curtain';
import { waitForFonts } from './board/font-loading';
import { viewProject } from './i18n/content';
import { Narrator, type Narration } from './runtime/voice';
import { voiceMs } from '@joplo-app/core/runtime';
import { nextScenarioId } from './player/watch';
import { scenariosOf } from './runtime/views';

/** 截图用的 IR：content 参数是项目的内容语言时换成这种语言（与看板预览同一个 viewProject）。 */
export function renderProject(project: Project, content: string | null, uiLocale: string): Project {
  return content && project.i18n?.locales.includes(content) ? viewProject(project, content, uiLocale) : project;
}

type W = {
  __JOPLO_READY__?: boolean;
  __JOPLO_STATE__?: PlayState | null;
  __JOPLO_ERROR__?: string | null;
  __JOPLO_RECORD__?: { play(): void; progress: RecordProgress };
};

export type RecordProgress = { step: number; done: boolean; error: string | null; scenarioId: string | null; position: number; activeStep: number | null };

/** 估算朗读（voice=estimate）：不出声，按 voiceMs 读完；时长只经过 setTimeout，所以录制时由页面时钟（含 Playwright 假时钟）决定。 */
export function estimatedNarrator(): Narrator {
  const n = new Narrator();
  n.enabled = true;
  n.speak = (text: string, _role: string | null, speed: number): Narration | null => {
    const ms = voiceMs(text.trim(), speed);
    if (!ms) return null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let left = ms;
    let started = 0;
    let finish: () => void = () => {};
    const done = new Promise<void>((resolve) => { finish = resolve; });
    const run = () => { started = Date.now(); timer = setTimeout(() => { timer = null; finish(); }, left); };
    run();
    return {
      source: 'browser', done,
      pause: () => { if (!timer) return; clearTimeout(timer); timer = null; left = Math.max(0, left - (Date.now() - started)); },
      resume: () => { if (!timer && left > 0) run(); },
      cancel: () => { if (timer) clearTimeout(timer); timer = null; finish(); },
    };
  };
  return n;
}

const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

/** 幕布要画什么：位置与（可选的）封面。 */
type CurtainSpec = { scenarioId: string; position: number; cover: ReturnType<typeof coverFor>; animate: boolean };

export function RenderApp() {
  const { t: i18n, locale } = useBoardI18n();

  useEffect(() => { document.title = i18n.board.joploBoard; }, [i18n]);
  const params = new URLSearchParams(location.search);
  const projectId = params.get('project') ?? '';
  const scenarioId = params.get('scenario') ?? '';
  const position = Number(params.get('position') ?? '0');
  // 主题（D51）：URL 指定的主题名，没有时用项目配置的默认主题（数据载入后）
  const themeParam = params.get('theme');
  const frame = params.get('frame') === '1';
  const record = params.get('record') === '1';
  const chain = params.get('chain') === '1';
  const voiceEstimate = params.get('voice') === 'estimate';
  // 可选的截图尺寸（renderStep 的 viewport）：只决定画布大小，舞台宽度仍是页面自己的 viewport（D44）
  const w = Number(params.get('w'));
  const h = Number(params.get('h'));
  const shot = w > 0 && h > 0 ? { width: w, height: h } : null;
  const registry = useMemo(() => new RoughRegistry(), []);
  const [data, setData] = useState<{ project: Project; state: PlayState } | null>(null);
  const [error, setError] = useState<Text | null>(null);
  const theme: StageTheme = themeParam && THEME_NAME.test(themeParam) ? themeParam : (data?.project.theme ?? 'sketch');
  const { font, stroke } = appearanceFromParams(params);
  const [stage, setStage] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    (async () => {
      const r = await fetchIR(projectId);
      if ('error' in r) return fail(r.error);
      if (!r.project) return fail(r.diagnostics.map((d) => `${d.at ?? ''} ${d.message}`).join(i18n.board.diagnosticSeparator) || m.board.projectDidNotCompileSuccessfully);
      try {
        const project = renderProject(r.project, params.get('content'), locale);
        setData({ project, state: stateAt(project, scenarioId, position) });
      } catch (e) {
        fail(e instanceof Error ? e.message : String(e));
      }
    })();
    function fail(msg: Text) {
      setError(msg);
      const w = window as unknown as W;
      w.__JOPLO_ERROR__ = translate(msg, i18n);
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
      {
        // Include future scenes/subtitles for video; read actual theme/appearance font stacks.
        const text = JSON.stringify(data.project) + stage.innerText;
        const fonts = new Set([stage, ...stage.querySelectorAll<HTMLElement>('*')].map((el) => {
          const css = getComputedStyle(el);
          return `${css.fontStyle} ${css.fontWeight} 16px ${css.fontFamily}`;
        }));
        await waitForFonts(document, font, [...fonts], text);
      }
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
  }, [data, stage, registry, theme, font, stroke, record]);

  if (error) return <div style={{ padding: 24, color: '#c92a2a', fontFamily: 'system-ui' }} data-render-error="">{i18n.board.renderFailed}{translate(error, i18n)}</div>;
  if (!data) return null;
  // 有层级的方案：显示这一步导演层的画面（每层是独立画面），设备取这个画面的设置
  const shownId = data.project.scenarios[scenarioId] ? displaySceneId(data.project, scenarioId, data.state.position) : data.state.sceneId;
  const viewport: Viewport = data.project.scenes[shownId]?.viewport === 'mobile' ? 'mobile' : 'desktop';
  const vp = VIEWPORTS[viewport];
  const framed = (stageNode: ReactNode) =>
    viewport === 'mobile' ? (
      <ThemeContext.Provider value={{ theme, stroke: resolveLook({ theme, font, stroke }, projectThemes(data.project), i18n).stroke, font, registry }}>
        <DeviceFrame width={vp.width} height={vp.height} seed="stage-phone">
          {stageNode}
        </DeviceFrame>
      </ThemeContext.Provider>
    ) : (
      stageNode
    );
  // 字幕区放在舞台（手机含外框）正下方，宽度相同：截图、导出图片与视频都带上它
  const fw = viewport === 'mobile' ? phoneFrameSize(vp.width, vp.height).width : vp.width;
  const fh = (viewport === 'mobile' ? phoneFrameSize(vp.width, vp.height).height : vp.height) + SUBTITLE_HEIGHT;
  // 视频与固定尺寸的截图画布用固定高度（画面尺寸不随字幕行数变化）；单张截图与导出图片按内容自适应
  const fixedSub = record || !!shot;
  // 幕布（D61：过渡卡、场景封面）盖在舞台（手机含外框）上，与演示页一样不进外框；只画不响应，不影响截图报告。
  // 场景封面只出现在导出图片、视频与固定尺寸截图（分享预览）里；单张截图（Agent 看画面用）保留第 0 步的真实画面。
  const withCurtain = (node: ReactNode, c: CurtainSpec | null, w: number, h: number) =>
    c ? (
      <div style={{ position: 'relative', width: w, height: h }}>
        {/* Author-controlled z-index stays inside the stage, below the export curtain. */}
        <div style={{ position: 'relative', zIndex: 0, width: w, height: h }}>{node}</div>
        <div style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none' }}>
          <Curtain project={data.project} scenarioId={c.scenarioId} position={c.position} cover={c.cover} theme={theme} font={font} width={w} height={h} animate={c.animate} passive />
        </div>
      </div>
    ) : (
      node
    );
  const withSub = (node: ReactNode, sub: SubtitleContent | null, w: number) => (
    <div style={{ display: 'flex', flexDirection: 'column', width: w }}>
      {node}
      <Subtitle content={sub} theme={theme} font={font} width={w} framed fixedHeight={fixedSub ? SUBTITLE_HEIGHT : undefined} />
    </div>
  );
  const fhStage = fh - SUBTITLE_HEIGHT;
  const wrap = (stageNode: ReactNode, sub: SubtitleContent | null, c: CurtainSpec | null = null) => (
    <>
      <ThemeStyles themes={projectThemes(data.project)} />
      {wrapInner(stageNode, sub, c)}
    </>
  );
  const wrapInner = (stageNode: ReactNode, sub: SubtitleContent | null, c: CurtainSpec | null) => {
    if (frame)
      return (
        <div data-jexport="" style={{ position: 'absolute', left: 0, top: 0, display: 'inline-block', ...(viewport === 'mobile' ? { background: '#ffffff', padding: 16 } : {}) }}>
          {withSub(withCurtain(framed(stageNode), c, fw, fhStage), sub, fw)}
        </div>
      );
    if (shot) {
      // 截图画布：舞台（手机页面带外框）加字幕区按比例放进 w×h，居中
      const k = Math.min(shot.width / fw, shot.height / fh);
      return (
        <div data-jshot="" style={{ position: 'absolute', left: 0, top: 0, width: shot.width, height: shot.height, overflow: 'hidden', background: '#f8f9fa' }}>
          <div style={{ position: 'absolute', left: (shot.width - fw * k) / 2, top: (shot.height - fh * k) / 2, width: fw, height: fh, transform: `scale(${k})`, transformOrigin: '0 0' }}>{withSub(withCurtain(framed(stageNode), c, fw, fhStage), sub, fw)}</div>
        </div>
      );
    }
    return (
      <div data-jrender="" style={{ position: 'absolute', left: 0, top: 0 }}>
        {withSub(withCurtain(stageNode, c ? { ...c, cover: null } : null, vp.width, vp.height), sub, vp.width)}
      </div>
    );
  };
  if (record) return <RecordStage project={data.project} scenarioId={scenarioId} chain={chain} voiceEstimate={voiceEstimate} theme={theme} font={font} stroke={stroke} registry={registry} setStage={setStage} wrap={wrap} />;
  const sc = data.project.scenarios[scenarioId];
  const next = sc && !data.state.completed ? sc.steps[data.state.position] : undefined;
  const plan = cameraFor(data.project, sc ? scenarioId : null, data.state.position, null);
  return wrap(<Stage
      project={data.project}
      state={data.state}
      theme={theme}
      font={font}
      stroke={stroke}
      mode="render"
      animate={false}
      registry={registry}
      nextTargetId={next && 'target' in next.action ? next.action.target : null}
      stageRef={setStage}
      camera={plan.spec}
      sceneId={plan.sceneId}
    />, subtitleFor(sc, data.state.position, null, data.state.completed, i18n, data.project),
    { scenarioId, position: data.state.position, cover: coverShown(sc, data.state.position, false, null) ? coverFor(data.project, scenarioId, i18n) : null, animate: false },
  );
}

/** 录制模式：与看板同一个演示控制器（鼠标、波纹、逐字输入、系统事件、字幕），由服务端触发自动播放。 */
function RecordStage({ project, scenarioId, chain, voiceEstimate, theme, font, stroke, registry, setStage, wrap }: { project: Project; scenarioId: string; chain: boolean; voiceEstimate: boolean; theme: StageTheme; font: AppearanceFont | null; stroke: AppearanceStroke | null; registry: RoughRegistry; setStage: (el: HTMLDivElement | null) => void; wrap: (n: ReactNode, sub: SubtitleContent | null, c: CurtainSpec | null) => ReactNode }) {
  const { t: i18n } = useBoardI18n();

  const ctl = useMemo(() => {
    const c = new DemoController(null);
    c.reducedMotion = false;
    c.setProject(project, 1, null);
    c.setScenario(scenarioId, 0, { quiet: true });
    if (chain) {
      const optionId = project.scenarios[scenarioId]?.optionId ?? null;
      c.autoNext = (id) => nextScenarioId(scenariosOf(project, optionId), id);
    }
    if (voiceEstimate) c.narrator = estimatedNarrator();
    return c;
  }, [project, scenarioId, chain, voiceEstimate]);
  ctl.i18n = i18n;
  const snap = useSyncExternalStore(ctl.subscribe, ctl.getSnapshot);
  const [stageEl, setStageEl] = useState<HTMLDivElement | null>(null);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const w = window as unknown as W;
    const current = snap.scenarioId ? project.scenarios[snap.scenarioId] : undefined;
    const total = current?.steps.length ?? 0;
    w.__JOPLO_STATE__ = snap.state;
    w.__JOPLO_RECORD__ = {
      play: () => {
        setStarted(true);
        if (total === 0) return;
        void ctl.play();
      },
      progress: {
        step: snap.state?.position ?? 0,
        done: started && !snap.playing && !snap.upNext && (total === 0 || !!snap.state?.completed || (snap.state?.position ?? 0) >= total || !!snap.playbackError),
        error: snap.playbackError ? translate(snap.playbackError, i18n) : null,
        scenarioId: snap.scenarioId, position: snap.state?.position ?? 0, activeStep: snap.activeStep,
      },
    };
  }, [snap, started, ctl, project, scenarioId]);

  const next = ctl.nextStep();
  const nextTargetId = next && 'target' in next.action ? next.action.target : null;
  const sc = ctl.scenario();
  // 与演示页一致：导演跟随；下一步的操作目标不在当前层时先切到它所在的层（leadLayer）
  const shownScenario = snap.scenarioId ?? scenarioId;
  const plan = cameraFor(project, shownScenario, cameraPosition(ctl.scenario(), snap.state?.position ?? 0, snap.activeStep), snap.leadLayer);
  useLayoutEffect(() => ctl.setStageView(plan.sceneId, true), [ctl, plan.sceneId]);
  if (!snap.state) return null;
  return <EngineClockContext.Provider value={ctl.clock}>{wrap(
    <Stage
      project={project}
      state={snap.state}
      clock={ctl.clock}
      gesture={snap.gesture}
      activeStep={snap.activeStep}
      stream={snap.streamAt ? { ...snap.streamAt, paused: snap.paused } : null}
      theme={theme}
      font={font}
      stroke={stroke}
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
    subtitleFor(sc, snap.state.position, snap.activeStep, snap.state.completed, i18n, project),
    { scenarioId: shownScenario, position: snap.state.position, cover: coverShown(sc, snap.state.position, snap.playing, snap.activeStep, snap.freeMode) ? coverFor(project, shownScenario, i18n) : null, animate: true },
  )}</EngineClockContext.Provider>;
}
