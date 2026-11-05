/**
 * 演示页（D39，看板与发布站同一套布局）：
 *   顶栏：Joplo · 面包屑（项目 / 功能 / 方案 / 场景，前两段可点击返回）；
 *   左栏：由调用方提供（看板：按情况分组 + 缺口；发布站：场景列表）；
 *   中间：层级栏（层级切换、导演标签、只重放这一层）、画面（铺满，右上角缩放与全屏）、字幕区、
 *   播放控制一行（⟲ 上一步 播放/暂停 下一步 速度 …… 「…」）、步骤条。
 *   全屏：只有画面、字幕区与底部居中的深色胶囊控制条（鼠标静止后淡出，空间保留，画面不跳动）。
 * 控件样式与尺寸规范见 controls.tsx / controls-fit.ts：文字一律不换行，宽度不够时按优先级收起。
 * 创作侧信息（缺口、规则、源码位置、抽屉）只由看板通过 nav / banner / drawer / menu 传入，本文件不引用它们，
 * 因此发布站的产物里不会出现。
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Expand, Gauge, Maximize, Minus, Pause, Play, Plus, RotateCcw, RotateCw, Shrink } from 'lucide-react';
import { stepTouchesLayer, type Project, type Scenario } from '@joplo-app/core';
import type { DemoController, Snapshot } from '../runtime/demo';
import { Stage, type ZoomApi } from '../renderer/Stage';
import { Subtitle } from './Subtitle';
import { isFullscreenKey, useFullscreen, useIdleVisible } from './fullscreen';
import { subtitleFor } from './subtitle-content';
import { SPEEDS, asSpeed } from '../runtime/pace';
import { cameraFor, cameraPosition } from './cameraFor';
import type { StageTheme } from '../renderer/rough';
import { cn } from '@/lib/utils';
import { JoploMark } from './JoploMark';
import { Overlay } from './Overlay';
import { StageViewport } from './StageViewport';
import { strokeOfTheme } from '../renderer/themes';
import { Btn, DirectorTag, MenuButton, Segmented, useWidth, type MenuItem, type Tone } from './controls';
import { controlsRowCollapse, fullscreenBarCollapse, layerBarCollapse } from './controls-fit';

export { Segmented } from './controls';
export type { MenuItem } from './controls';

export type Crumb = { label: string; testid: string; onClick?: () => void };

export function Brand({ onClick }: { onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex shrink-0 items-center gap-2 text-[20px] font-bold tracking-tight text-[#1e1e1e]" data-testid="brand">
      <JoploMark size={26} />
      Joplo
    </button>
  );
}

export function TopBar({ children, right }: { children?: ReactNode; right?: ReactNode }) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-5 border-b bg-white px-4" data-testid="topbar">
      {children}
      {right ? <div className="ml-auto flex shrink-0 items-center gap-2">{right}</div> : null}
    </header>
  );
}

function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav aria-label="面包屑" className="flex min-w-0 items-center gap-2 text-[14px]" data-testid="crumbs">
      {crumbs.map((c, i) => (
        <span key={c.testid} className="flex min-w-0 items-center gap-2">
          {i > 0 ? <span className="text-[#adb5bd]">/</span> : null}
          {c.onClick ? (
            <button type="button" onClick={c.onClick} data-testid={c.testid} className="truncate text-[#1c5fb8] underline-offset-4 hover:underline">
              {c.label}
            </button>
          ) : (
            <span data-testid={c.testid} className={cn('truncate', i === crumbs.length - 1 ? 'font-semibold text-[#1e1e1e]' : 'text-[#3a3a3a]')}>
              {c.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}

const playLabelOf = (snap: Snapshot) => (!snap.playing ? (snap.state?.completed ? '重新播放' : '播放') : snap.paused ? '继续' : '暂停');
const speedItems = (speed: number, onSpeed: (v: number) => void): MenuItem[] => SPEEDS.map((v) => ({ id: `speed-${v}`, label: `速度 ${v}×`, checked: speed === v, onClick: () => onSpeed(v) }));

/** 上一步 / 播放 / 下一步：宽度不够时只剩图标（tooltip 写明快捷键）。 */
function NavButtons({ snap, scenario, ctl, iconOnly, size, tone, ids }: { snap: Snapshot; scenario: Scenario | null; ctl: DemoController; iconOnly: boolean; size: 32 | 36; tone: Tone; ids: { prev: string; play: string; next: string } }) {
  const pos = snap.state?.position ?? 0;
  const total = scenario?.steps.length ?? 0;
  const off = !scenario || snap.view !== 'stage';
  const playing = snap.playing && !snap.paused;
  const playLabel = playLabelOf(snap);
  return (
    <>
      <Btn icon={<ChevronLeft className="size-4" />} label="上一步" title="上一步（←）" iconOnly={iconOnly} size={size} tone={tone} onClick={() => ctl.prev()} disabled={off || (pos === 0 && !snap.busy)} data-testid={ids.prev} />
      <Btn icon={playing ? <Pause className="size-4" /> : <Play className="size-4" />} label={playLabel} title={`${playLabel}（空格）`} aria-label={playLabel} iconOnly={iconOnly} size={size} tone={tone} variant="primary" className={iconOnly ? undefined : 'min-w-[96px]'} onClick={() => ctl.togglePlay()} disabled={off || total === 0} data-testid={ids.play} />
      <Btn icon={<ChevronRight className="size-4" />} iconAfter label="下一步" title="下一步（→）" iconOnly={iconOnly} size={size} tone={tone} onClick={() => void ctl.next()} disabled={off || total === 0} data-testid={ids.next} />
    </>
  );
}

function SpeedSegmented({ speed, onSpeed, tone, testid }: { speed: number; onSpeed: (v: number) => void; tone: Tone; testid: string }) {
  return <Segmented label="播放速度" testid={testid} tone={tone} value={String(speed)} onChange={(v) => onSpeed(Number(v))} items={SPEEDS.map((v) => ({ value: String(v), label: `${v}×`, testid: `${testid}-${v}`, title: `自动播放速度 ${v}×` }))} />;
}

type LayerDef = { id: string; title: string };
/** 层级切换：分段控件；收起时变成“层级：当前层 ▾”的下拉菜单。导演跟随时不高亮任何一项。 */
function LayerSwitch({ layers, viewLayer, director, onLayer, collapsed, tone }: { layers: LayerDef[]; viewLayer: string; director: boolean; onLayer: (id: string) => void; collapsed: boolean; tone: Tone }) {
  const current = layers.find((l) => l.id === viewLayer)?.title ?? viewLayer;
  if (collapsed)
    return (
      <MenuButton
        trigger={{ icon: undefined, label: director ? '层级' : `层级：${current}` }}
        label="切换层级"
        testid="layer-switch"
        tone={tone}
        size={32}
        align="left"
        placement={tone === 'dark' ? 'up' : 'down'}
        items={layers.map((l) => ({ id: `layer-${l.id}`, label: l.title, checked: !director && l.id === viewLayer, onClick: () => onLayer(l.id) }))}
      />
    );
  return <Segmented label="层级" testid="layer-switch" tone={tone} value={director ? null : viewLayer} onChange={onLayer} items={layers.map((l) => ({ value: l.id, label: l.title, testid: `layer-${l.id}`, title: `手动查看「${l.title}」（导演暂停）` }))} />;
}

/** 非全屏的播放控制行：⟲ 上一步 播放 下一步 速度 …… 「…」。宽度不够：先收三件套为图标，再把速度收进「…」。 */
function Controls({ snap, scenario, ctl, menu, speed, onSpeed }: { snap: Snapshot; scenario: Scenario | null; ctl: DemoController; menu: MenuItem[]; speed: number; onSpeed?: (v: number) => void }) {
  const [ref, width] = useWidth();
  const c = controlsRowCollapse(width, playLabelOf(snap), onSpeed ? SPEEDS : []);
  const off = !scenario || snap.view !== 'stage';
  const speedInMenu = !!onSpeed && c.has('speed');
  const items = speedInMenu ? [...speedItems(speed, onSpeed!), { id: 'speed-divider', divider: true as const }, ...menu] : menu;
  return (
    <div ref={ref} className="flex h-9 shrink-0 items-center gap-2 overflow-hidden" role="toolbar" aria-label="播放控制" data-testid="controls" data-collapsed={[...c].join(' ') || undefined}>
      <Btn icon={<RotateCcw className="size-4" />} label="回到第 0 步" iconOnly onClick={() => ctl.reset()} disabled={off} data-testid="ctl-reset" />
      <NavButtons snap={snap} scenario={scenario} ctl={ctl} iconOnly={c.has('nav')} size={36} tone="light" ids={{ prev: 'ctl-prev', play: 'ctl-play', next: 'ctl-next' }} />
      {onSpeed && !speedInMenu ? <SpeedSegmented speed={speed} onSpeed={onSpeed} tone="light" testid="speed" /> : null}
      <div className="ml-auto shrink-0">
        <MenuButton trigger={{}} label="更多操作" testid="more-menu" items={items} />
      </div>
    </div>
  );
}

/** 全屏控制条：居中的半透明深色胶囊，高 48，内边距 8；宽度不够时依次收起三件套、速度、层级切换。 */
function FullscreenBar({ snap, scenario, ctl, speed, onSpeed, layers, viewLayer, director, onLayer, onDirector, onExit, avail }: { snap: Snapshot; scenario: Scenario; ctl: DemoController; speed: number; onSpeed?: (v: number) => void; layers: LayerDef[]; viewLayer: string; director: boolean; onLayer: (id: string) => void; onDirector: () => void; onExit: () => void; avail: number }) {
  const current = layers.find((l) => l.id === viewLayer)?.title ?? viewLayer;
  const c = fullscreenBarCollapse(avail, playLabelOf(snap), onSpeed ? SPEEDS : [], layers.map((l) => l.title), director, current);
  const sep = <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-white/20" />;
  return (
    <div className="flex h-12 max-w-full shrink-0 items-center gap-2 overflow-hidden rounded-full bg-[rgba(24,24,24,0.86)] px-2 shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur" role="toolbar" aria-label="全屏播放控制" data-testid="fullscreen-controls" data-collapsed={[...c].join(' ') || undefined}>
      <NavButtons snap={snap} scenario={scenario} ctl={ctl} iconOnly={c.has('nav')} size={32} tone="dark" ids={{ prev: 'fs-prev', play: 'fs-play', next: 'fs-next' }} />
      {onSpeed ? (c.has('speed') ? <MenuButton trigger={{ icon: <Gauge className="size-4" /> }} label={`播放速度（${speed}×）`} testid="fs-speed" tone="dark" size={32} width={160} items={speedItems(speed, onSpeed)} /> : <SpeedSegmented speed={speed} onSpeed={onSpeed} tone="dark" testid="fs-speed" />) : null}
      {layers.length > 1 ? (
        <>
          {sep}
          <LayerSwitch layers={layers} viewLayer={viewLayer} director={director} onLayer={onLayer} collapsed={c.has('layers')} tone="dark" />
          <DirectorTag on={director} layerTitle={current} onToggle={onDirector} tone="dark" />
        </>
      ) : null}
      {sep}
      <Btn icon={<Shrink className="size-4" />} label="退出全屏（Esc）" iconOnly size={32} tone="dark" onClick={onExit} data-testid="fs-exit" />
    </div>
  );
}

function StepStrip({ snap, scenario, ctl }: { snap: Snapshot; scenario: Scenario; ctl: DemoController }) {
  const st = snap.state;
  const pos = st?.position ?? 0;
  const active = snap.activeStep;
  const shownIndex = active !== null ? active + 1 : pos; // 0 = 初始状态
  // 一行步骤芯片；说明、步数与结果都在字幕区（不重复）
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    listRef.current?.querySelector('[data-state="current"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [shownIndex]);
  const chip = (i: number, label: string, testid: string, kind?: string) => {
    const state = i === shownIndex ? 'current' : i < shownIndex ? 'done' : 'todo';
    return (
      <li key={testid} className="flex min-w-[80px] max-w-[168px] flex-1 items-center">
        <button type="button" onClick={() => ctl.clickStepChip(i - 1)} data-testid={testid} data-state={state} data-step-kind={kind} title={label} aria-label={`第 ${i} 步：${label}`} className="flex h-8 min-w-0 items-center gap-2 whitespace-nowrap text-left">
          <span
            className={cn(
              'flex size-6 shrink-0 items-center justify-center border text-[12px] leading-none',
              kind === 'system' ? 'rounded-[6px] border-dashed' : 'rounded-full',
              state === 'current' ? 'border-[#1e1e1e] bg-[#1e1e1e] text-white' : state === 'done' ? 'border-[#1e1e1e] bg-white text-[#1e1e1e]' : 'border-[#ced4da] text-[#868e96]',
              active === i - 1 && 'ring-2 ring-[var(--focus)] ring-offset-1',
            )}
          >
            {i}
          </span>
          <span className={cn('truncate text-[12px]', state === 'current' ? 'font-semibold' : 'text-[#5a5a5a]')}>{label}</span>
        </button>
      </li>
    );
  };
  return (
    <section className="shrink-0 rounded-lg border bg-white px-3 py-1" data-testid="step-bar">
      <ol ref={listRef} className="flex items-center gap-2 overflow-x-auto" aria-label="步骤">
        {chip(0, '初始', 'chip-initial')}
        {scenario.steps.map((s, i) => chip(i + 1, s.caption, `chip-${s.id}`, s.kind))}
      </ol>
    </section>
  );
}

export type PlayerPageProps = {
  ctl: DemoController;
  snap: Snapshot;
  project: Project;
  crumbs: Crumb[];
  onBrand: () => void;
  theme: StageTheme;
  /** 手动选的层级（D43）；null = 导演跟随每一步的导演层。 */
  layer: string | null;
  /** 切换层级：传层级 id 表示手动看这一层（导演关闭）；传 null 表示打开导演。 */
  onLayer: (layer: string | null) => void;
  /** 自动播放速度（0.5 / 1 / 1.5，记在 URL 里）。 */
  speed?: number;
  onSpeed?: (speed: number) => void;
  /** 左栏内容。 */
  nav: ReactNode;
  /** 画面上方（缺口说明、编译错误等）。 */
  banner?: ReactNode;
  menu: MenuItem[];
  /** 右侧抽屉等覆盖层（看板）。 */
  drawer?: ReactNode;
  /** 允许 ⌥+单击检查元素（看板）；发布站为 false，⌥+单击按普通单击处理。 */
  onInspect?: (nodeId: string) => void;
  /** 画面右下角的低调提示。 */
  stageHint?: ReactNode;
  selectedId?: string | null;
  /** 页面级的轻提示（复制链接、导出完成等）。 */
  flash?: string | null;
};

export function PlayerPage(p: PlayerPageProps) {
  const { ctl, snap, project } = p;
  const [stageEl, setStageEl] = useState<HTMLDivElement | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const state = snap.state;
  const scenario = snap.view === 'stage' ? ctl.scenario() : null;
  const next = ctl.nextStep();
  const nextTargetId = next && 'target' in next.action ? next.action.target : null;
  // 字幕区（画面下方）显示的步骤：正在播放的一步，否则是刚执行完的一步；第 0 步显示初始状态
  const pos = state?.position ?? 0;
  const subtitle = subtitleFor(scenario, pos, snap.activeStep, state?.completed ?? null);
  const speed = asSpeed(p.speed ?? 1);
  useEffect(() => {
    ctl.speed = speed;
  }, [ctl, speed]);
  const zoomApi = useRef<ZoomApi | null>(null);
  const [userZoom, setUserZoom] = useState<number | null>(null);
  const onZoomApi = useCallback((api: ZoomApi | null) => {
    zoomApi.current = api;
  }, []);

  // 视角层级与导演镜头（D43 / T-layers）：每层是独立画面，镜头只由步骤推导（cameraAt），切层级不改变步骤和产品状态。
  // 导演跟随时，下一步的操作目标不在当前层里，控制器会先请求切到它所在的层（leadLayer），再移动鼠标。
  const lead = p.layer === null ? snap.leadLayer : null;
  // 系统步骤一开始就用这一步的镜头（与字幕区一致）；用户操作在提交之后才切
  const camPos = cameraPosition(scenario, state?.position ?? 0, snap.activeStep);
  const plan = cameraFor(project, scenario?.id ?? null, camPos, p.layer ?? lead);
  const director = p.layer === null || plan.director;
  const { layers, viewLayer } = plan;
  const useCam = plan.enabled;
  const camera = plan.spec;
  const shownScene = state ? project.scenes[plan.sceneId ?? state.sceneId] : undefined;
  const device = shownScene?.viewport === 'mobile' ? 'mobile' : 'desktop';
  // 自由缩放：导演跟随时每一步由镜头重新接管；手动时保持，直到换层或点「适应画面」
  const zoomReset = director ? `d|${camPos}|${viewLayer}|${plan.sceneId ?? state?.sceneId ?? ''}` : `m|${viewLayer}|${plan.sceneId ?? state?.sceneId ?? ''}`;
  useLayoutEffect(() => ctl.setStageView(plan.sceneId, director), [ctl, plan.sceneId, director]);
  const replayLayer = () => {
    if (!scenario) return;
    p.onLayer(viewLayer);
    void ctl.play({ fromStart: true, fast: (i) => !stepTouchesLayer(project, scenario.id, i, viewLayer) });
  };

  // 全屏（T-stage）：只保留舞台与字幕；播放控制浮在画面下方，鼠标静止约 2.5 秒后淡出
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { full, toggle: toggleFull } = useFullscreen(rootRef);
  const idle = useIdleVisible(full);

  // 键盘：← → 逐步，空格播放/暂停，F 全屏（Esc 由浏览器退出）；按住 ⌥ 时标出可检查的元素
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Alt') setInspecting(e.type === 'keydown' && !!p.onInspect);
      if (e.type !== 'keydown') return;
      const t = e.target as HTMLElement;
      if (t.closest('input,textarea,select,[contenteditable],[data-joplo-stage],[role="menu"],[role="dialog"]')) return;
      if (isFullscreenKey(e, t)) {
        e.preventDefault();
        toggleFull();
      } else if (e.key === 'ArrowRight') void ctl.next();
      else if (e.key === 'ArrowLeft') ctl.prev();
      // 全屏时空格总是播放 / 暂停（不触发刚点过、仍有焦点的按钮）
      else if (e.key === ' ' && (t.tagName !== 'BUTTON' || full)) {
        e.preventDefault();
        ctl.togglePlay();
      }
    };
    const blur = () => setInspecting(false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      window.removeEventListener('blur', blur);
    };
  }, [ctl, p.onInspect, toggleFull, full]);

  const currentLayer = layers.find((l) => l.id === viewLayer)?.title ?? viewLayer;
  const toggleDirector = () => p.onLayer(director ? viewLayer : null);
  const hasLayerBar = useCam && layers.length > 1;
  // 层级栏（非全屏）：宽度不够时先把“只重放这一层”收成图标，再把层级切换收成下拉菜单
  const [layerBarRef, layerBarW] = useWidth();
  const lc = layerBarCollapse(layerBarW, layers.map((l) => l.title), director, currentLayer);
  // 全屏控制条所在的一行（宽度决定收起哪些控件）
  const [barRowRef, barRowW] = useWidth(1200);

  const stageBlock = (
    <div className={cn('relative flex min-h-0 flex-1 flex-col overflow-hidden bg-white', !full && 'rounded-xl border')} data-layer={useCam ? viewLayer : undefined} data-director={useCam ? (director ? 'on' : 'off') : undefined}>
      {state && shownScene ? (
        <StageViewport viewport={device} theme={p.theme} stroke={strokeOfTheme(p.theme, project.themes ?? {})} notice={snap.notice} onDismiss={() => ctl.dismissNotice()}>
          {(size) => (
            <Stage
              viewportOverride={device === 'mobile' ? null : size}
              project={project}
              state={state}
              theme={p.theme}
              camera={camera}
              sceneId={plan.sceneId}
              zoom={{ resetKey: zoomReset, onApi: onZoomApi, onChange: (v) => setUserZoom(v ? v.k : null) }}
              mode="demo"
              selectedId={p.selectedId ?? null}
              preview={snap.preview}
              epoch={snap.epoch}
              animate={!ctl.reducedMotion}
              nextTargetId={nextTargetId}
              onNodeClick={(id, pt, o) => (o.inspect && p.onInspect ? p.onInspect(id) : void ctl.clickNode(id, pt))}
              stageRef={(el) => {
                ctl.setStageEl(el);
                setStageEl(el);
              }}
              overlay={<Overlay snap={snap} stage={stageEl} nextTargetId={nextTargetId} setCursorEl={ctl.setCursorEl} onBackToDemo={() => ctl.backToDemo()} onDismiss={() => ctl.dismissNotice()} />}
            />
          )}
        </StageViewport>
      ) : (
        <div className="flex flex-1 items-center justify-center p-8 text-center text-[14px] text-[#6b6b6b]" data-testid="no-scene">
          这个方案还没有可显示的画面。
        </div>
      )}
      {state && shownScene ? (
        <div className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-lg bg-white/90 p-1 shadow-sm ring-1 ring-black/5" role="toolbar" aria-label="缩放" data-testid="zoom-bar" data-zoom={userZoom === null ? 'camera' : userZoom.toFixed(2)}>
          <Btn icon={<Minus className="size-4" />} label="缩小（滚轮 / 捏合也可以）" iconOnly size={32} variant="ghost" onClick={() => zoomApi.current?.zoomBy(1 / 1.25)} data-testid="zoom-out" />
          <Btn icon={<Plus className="size-4" />} label="放大（滚轮 / 捏合也可以）" iconOnly size={32} variant="ghost" onClick={() => zoomApi.current?.zoomBy(1.25)} data-testid="zoom-in" />
          <Btn icon={<Maximize className="size-4" />} label="适应画面" title="回到镜头的画面（取消手动缩放与平移）" size={32} variant="ghost" onClick={() => zoomApi.current?.fit()} disabled={userZoom === null} data-testid="zoom-fit" />
          <Btn
            icon={full ? <Shrink className="size-4" /> : <Expand className="size-4" />}
            label={full ? '退出全屏（Esc）' : '全屏（F）'}
            iconOnly
            size={32}
            variant="ghost"
            onClick={(e) => {
              e.currentTarget.blur();
              toggleFull();
            }}
            data-testid="fullscreen"
          />
        </div>
      ) : null}
      {p.stageHint && !full ? <div className="pointer-events-none absolute bottom-3 right-3 whitespace-nowrap text-[12px] text-[#868e96]" data-testid="stage-hint">{p.stageHint}</div> : null}
      {p.flash ? (
        <div role="status" className="absolute left-1/2 top-3 z-20 -translate-x-1/2 whitespace-nowrap rounded-md bg-[#1e1e1e] px-3 py-2 text-[14px] text-white shadow" data-testid="flash">
          {p.flash}
        </div>
      ) : null}
    </div>
  );

  if (full)
    return (
      // 全屏：画面 / 字幕 / 控制条三段，上下排列。控制条那一行（64px）始终保留：淡出时只是变透明，画面与镜头尺寸不变、不跳动
      <div ref={rootRef} className="flex h-screen w-screen flex-col bg-[#111]" data-view={snap.view} data-fullscreen="" onMouseMove={idle.poke} style={idle.visible ? undefined : { cursor: 'none' }}>
        <main className="flex min-h-0 flex-1 flex-col" data-inspecting={inspecting ? '' : undefined}>
          {stageBlock}
        </main>
        {scenario ? <Subtitle content={subtitle} theme={p.theme} framed dark /> : null}
        <div ref={barRowRef} className="flex h-16 shrink-0 items-center justify-center px-6">
          {scenario ? (
            <div className={cn('flex max-w-full justify-center transition-opacity duration-300', idle.visible ? 'opacity-100' : 'pointer-events-none opacity-0')} data-visible={idle.visible ? '' : undefined} onMouseMove={idle.poke}>
              <FullscreenBar snap={snap} scenario={scenario} ctl={ctl} speed={speed} onSpeed={p.onSpeed} layers={useCam ? layers : []} viewLayer={viewLayer} director={director} onLayer={(id) => p.onLayer(id)} onDirector={toggleDirector} onExit={toggleFull} avail={barRowW - 48} />
            </div>
          ) : null}
        </div>
        {p.drawer}
      </div>
    );

  return (
    <div ref={rootRef} className="flex h-full flex-col bg-[#f8f9fa]" data-view={snap.view}>
      <TopBar>
        <Brand onClick={p.onBrand} />
        <Breadcrumbs crumbs={p.crumbs} />
      </TopBar>
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[280px] shrink-0 flex-col overflow-y-auto border-r bg-white p-3" data-testid="left-nav">
          {p.nav}
        </aside>
        <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden p-3" data-inspecting={inspecting ? '' : undefined}>
          {p.banner}
          {snap.playbackError ? (
            <div role="alert" className="rounded-md border border-[#b35c00] bg-[#fff8ee] px-3 py-2 text-[14px] text-[#8a4700]" data-testid="playback-error">
              <strong>演示回放出错：</strong>
              {snap.playbackError}
            </div>
          ) : null}
          {hasLayerBar ? (
            <div ref={layerBarRef} className="flex h-8 shrink-0 items-center gap-2 overflow-hidden" data-testid="layer-bar" data-collapsed={[...lc].join(' ') || undefined}>
              <LayerSwitch layers={layers} viewLayer={viewLayer} director={director} onLayer={(id) => p.onLayer(id)} collapsed={lc.has('layers')} tone="light" />
              <DirectorTag on={director} layerTitle={currentLayer} onToggle={toggleDirector} />
              <Btn icon={<RotateCw className="size-4" />} label="只重放这一层" title="从第 0 步开始，只用这一层的镜头播放；这一层没有变化的步骤快速带过" iconOnly={lc.has('replay')} size={32} onClick={replayLayer} data-testid="replay-layer" />
            </div>
          ) : null}
          {stageBlock}
          {/* 字幕区：画面下方、播放控制上方，不叠在画面上 */}
          {scenario ? <Subtitle content={subtitle} theme={p.theme} /> : null}
          <Controls snap={snap} scenario={scenario} ctl={ctl} menu={p.menu} speed={speed} onSpeed={p.onSpeed} />
          {scenario ? <StepStrip snap={snap} scenario={scenario} ctl={ctl} /> : null}
        </main>
      </div>
      {p.drawer}
    </div>
  );
}
