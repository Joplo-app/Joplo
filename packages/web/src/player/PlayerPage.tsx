/**
 * 演示页（D39，看板与发布站同一套布局）：
 *   顶栏：Joplo · 面包屑（项目 / 功能 / 方案 / 场景，前两段可点击返回）· 右侧电脑 / 手机切换；
 *   左栏：由调用方提供（看板：按情况分组 + 缺口；发布站：场景列表）；
 *   中间：画面；画面下方一行：⟲ 上一步 播放/暂停 下一步 …… 右侧「…」菜单；
 *   最底下：步骤条（当前步高亮，下面是本步说明与下一步说明）。
 * 创作侧信息（缺口、规则、源码位置、抽屉）只由看板通过 nav / banner / drawer / menu 传入，本文件不引用它们，
 * 因此发布站的产物里不会出现。
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Clapperboard, Ellipsis, Maximize, Minus, Pause, Play, Plus, RotateCcw } from 'lucide-react';
import { stepTouchesLayer, type Project, type Scenario } from '@tokenroll/joplo-core';
import type { DemoController, Snapshot } from '../runtime/demo';
import { Stage, type ZoomApi } from '../renderer/Stage';
import { Subtitle } from './Subtitle';
import { subtitleFor } from './subtitle-content';
import { SPEEDS, asSpeed } from '../runtime/pace';
import { cameraFor, cameraPosition } from './cameraFor';
import type { StageTheme } from '../renderer/rough';
import { cn } from '@/lib/utils';
import { MOCK_CLS, OUTCOME_LABEL } from './labels';
import { Overlay } from './Overlay';
import { StageViewport } from './StageViewport';

export type Crumb = { label: string; testid: string; onClick?: () => void };
export type MenuItem = { id: string; label: string; onClick: () => void; checked?: boolean; disabled?: boolean };

export function Brand({ onClick }: { onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className="shrink-0 text-[19px] font-bold tracking-tight text-[#1e1e1e]" data-testid="brand">
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

export function Segmented<T extends string>({ value, items, onChange, label, testid, full }: { value: T | null; items: { value: T; label: ReactNode; testid?: string; title?: string }[]; onChange: (v: T) => void; label: string; testid?: string; full?: boolean }) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('flex gap-0.5 rounded-lg bg-[#f1f3f5] p-1', full && 'w-full')} data-testid={testid}>
      {items.map((it) => (
        <button
          key={it.value}
          type="button"
          role="radio"
          aria-checked={value === it.value}
          title={it.title}
          data-testid={it.testid}
          onClick={() => onChange(it.value)}
          className={cn('flex min-w-0 flex-1 items-center justify-center gap-1.5 truncate rounded-md px-3 py-1 text-[13px]', value === it.value ? 'bg-white font-semibold text-[#1e1e1e] shadow-sm' : 'text-[#5a5a5a] hover:text-[#1e1e1e]')}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

function MoreMenu({ items }: { items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-label="更多操作" aria-expanded={open} onClick={() => setOpen((o) => !o)} data-testid="more-menu" className="flex size-9 items-center justify-center rounded-md border bg-white hover:bg-[#f8f9fa]">
        <Ellipsis className="size-4" />
      </button>
      {open ? (
        <div role="menu" className="absolute bottom-11 right-0 z-30 w-[220px] rounded-lg border bg-white p-1 shadow-lg" data-testid="menu">
          {items.map((it) => (
            <button
              key={it.id}
              type="button"
              role={it.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
              aria-checked={it.checked}
              disabled={it.disabled}
              data-testid={`menu-${it.id}`}
              onClick={() => {
                setOpen(false);
                it.onClick();
              }}
              className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-[14px] hover:bg-[#f1f3f5] disabled:opacity-40"
            >
              <span>{it.label}</span>
              {it.checked ? <span aria-hidden>✓</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Controls({ snap, scenario, ctl, menu, speed, onSpeed }: { snap: Snapshot; scenario: Scenario | null; ctl: DemoController; menu: MenuItem[]; speed: number; onSpeed?: (v: number) => void }) {
  const pos = snap.state?.position ?? 0;
  const total = scenario?.steps.length ?? 0;
  const playing = snap.playing && !snap.paused;
  const playLabel = !snap.playing ? (snap.state?.completed ? '重新播放' : '播放') : snap.paused ? '继续' : '暂停';
  const off = !scenario || snap.view !== 'stage';
  return (
    <div className="flex shrink-0 items-center gap-2" role="toolbar" aria-label="播放控制" data-testid="controls">
      <button type="button" aria-label="回到第 0 步" title="回到第 0 步" onClick={() => ctl.reset()} disabled={off} data-testid="ctl-reset" className="flex size-9 items-center justify-center rounded-md border bg-white hover:bg-[#f8f9fa] disabled:opacity-40">
        <RotateCcw className="size-4" />
      </button>
      <button type="button" onClick={() => ctl.prev()} disabled={off || (pos === 0 && !snap.busy)} data-testid="ctl-prev" className="flex h-9 items-center gap-1 rounded-md border bg-white px-3 text-[14px] hover:bg-[#f8f9fa] disabled:opacity-40">
        <ChevronLeft className="size-4" />
        上一步
      </button>
      <button type="button" onClick={() => ctl.togglePlay()} disabled={off || total === 0} aria-label={playLabel} title={`${playLabel}（空格）`} data-testid="ctl-play" className="flex h-9 min-w-[96px] items-center justify-center gap-1.5 rounded-md bg-[#1e1e1e] px-4 text-[14px] font-medium text-white hover:bg-[#333] disabled:opacity-40">
        {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
        {playLabel}
      </button>
      <button type="button" onClick={() => void ctl.next()} disabled={off || total === 0} data-testid="ctl-next" className="flex h-9 items-center gap-1 rounded-md border bg-white px-3 text-[14px] hover:bg-[#f8f9fa] disabled:opacity-40">
        下一步
        <ChevronRight className="size-4" />
      </button>
      {onSpeed ? (
        <div className="w-[150px]">
          <Segmented
            label="播放速度"
            testid="speed"
            value={String(speed)}
            onChange={(v) => onSpeed(Number(v))}
            items={SPEEDS.map((v) => ({ value: String(v), label: `${v}×`, testid: `speed-${v}`, title: `自动播放速度 ${v}×` }))}
          />
        </div>
      ) : null}
      <div className="ml-auto">
        <MoreMenu items={menu} />
      </div>
    </div>
  );
}

function StepStrip({ snap, scenario, ctl }: { snap: Snapshot; scenario: Scenario; ctl: DemoController }) {
  const st = snap.state;
  const pos = st?.position ?? 0;
  const active = snap.activeStep;
  const shownIndex = active !== null ? active + 1 : pos; // 0 = 初始状态
  const next = st && !st.completed ? scenario.steps[pos] : undefined;
  const done = st?.completed;
  const total = scenario.steps.length;
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    listRef.current?.querySelector('[data-state="current"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [shownIndex]);
  const chip = (i: number, label: string, testid: string, kind?: string) => {
    const state = i === shownIndex ? 'current' : i < shownIndex ? 'done' : 'todo';
    return (
      <li key={testid} className="flex min-w-[80px] max-w-[170px] flex-1 items-center gap-1.5">
        <button type="button" onClick={() => ctl.clickStepChip(i - 1)} data-testid={testid} data-state={state} data-step-kind={kind} title={label} aria-label={`第 ${i} 步：${label}`} className="flex min-w-0 items-center gap-1.5 text-left">
          <span
            className={cn(
              'flex size-6 shrink-0 items-center justify-center border text-[11px]',
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
  // 一行步骤 + 一行说明（D43“一屏放下”）
  return (
    <section className="shrink-0 rounded-lg border bg-white px-3 py-1.5" data-testid="step-bar">
      <ol ref={listRef} className="flex items-center gap-1.5 overflow-x-auto" aria-label="步骤">
        {chip(0, '初始', 'chip-initial')}
        {scenario.steps.map((s, i) => chip(i + 1, s.caption, `chip-${s.id}`, s.kind))}
      </ol>
      <div className="mt-1 flex items-center gap-3">
        <div className="flex min-w-0 flex-1 items-baseline gap-2 truncate" data-testid="caption">
          {done && active === null ? (
            <span data-testid="complete-banner" role="status" className={cn('shrink-0 text-[14px]', done.outcome === 'success' ? 'text-[#1f6e30]' : done.outcome === 'failure' ? 'text-[#a51d1d]' : 'text-[#3a3a3a]')}>
              <strong>场景完成 · {OUTCOME_LABEL[done.outcome]}</strong> {done.text}
            </span>
          ) : (
            // 本步说明在字幕区（画面下方），这里只显示第几步，不重复说明
            <span className="shrink-0 text-[14px] font-semibold" data-testid="step-index">
              第 {shownIndex} / {total} 步
            </span>
          )}
          <span className="min-w-0 truncate text-[12px] text-[#6b6b6b]" data-testid="next-hint">
            {total === 0 ? `这个场景没有步骤，只展示初始状态。${scenario.expected ? `预期：${scenario.expected}` : ''}` : next ? `下一步：${next.caption}` : done ? `这是${scenario.mock.label}的演示结果，不代表真实服务的返回` : '已到最后一步'}
          </span>
        </div>
        <span className={cn('shrink-0 rounded border px-1.5 py-px text-[12px]', MOCK_CLS[scenario.mock.outcome])} data-testid="mock-label" title="演示中的结果是模拟的">
          {scenario.mock.label}
        </span>
      </div>
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
  const subtitle = subtitleFor(scenario, pos, snap.activeStep);
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

  // 键盘：← → 逐步，空格播放/暂停；按住 ⌥ 时标出可检查的元素
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Alt') setInspecting(e.type === 'keydown' && !!p.onInspect);
      if (e.type !== 'keydown') return;
      const t = e.target as HTMLElement;
      if (t.closest('input,textarea,select,[contenteditable],[data-joplo-stage],[role="menu"],[role="dialog"]')) return;
      if (e.key === 'ArrowRight') void ctl.next();
      else if (e.key === 'ArrowLeft') ctl.prev();
      else if (e.key === ' ' && t.tagName !== 'BUTTON') {
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
  }, [ctl, p.onInspect]);

  return (
    <div className="flex h-full flex-col bg-[#f8f9fa]" data-view={snap.view}>
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
            <div role="alert" className="rounded-md border border-[#b35c00] bg-[#fff8ee] px-3 py-1.5 text-[13px] text-[#8a4700]" data-testid="playback-error">
              <strong>演示回放出错：</strong>
              {snap.playbackError}
            </div>
          ) : null}
          {useCam && layers.length > 1 ? (
            <div className="flex shrink-0 items-center gap-2" data-testid="layer-bar">
              <Segmented
                label="层级"
                testid="layer-switch"
                value={director ? null : viewLayer}
                onChange={(id) => p.onLayer(id)}
                items={layers.map((l) => ({ value: l.id, label: l.title, testid: `layer-${l.id}`, title: `手动查看「${l.title}」（导演暂停）` }))}
              />
              {director ? (
                <span className="text-[12px] text-[#6b6b6b]" data-testid="director-layer">
                  导演：{layers.find((l) => l.id === viewLayer)?.title ?? viewLayer}
                </span>
              ) : null}
              <button
                type="button"
                aria-pressed={director}
                onClick={() => p.onLayer(director ? viewLayer : null)}
                data-testid="director"
                title={director ? '导演跟随每一步切换层级与镜头；点一下改为手动' : '恢复导演：回到这一步的导演层'}
                className={cn('flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[13px]', director ? 'border-[#1e1e1e] bg-[#1e1e1e] text-white' : 'bg-white text-[#3a3a3a] hover:bg-[#f8f9fa]')}
              >
                <Clapperboard className="size-3.5" />
                导演{director ? '跟随' : '已暂停'}
              </button>
              <button type="button" onClick={replayLayer} data-testid="replay-layer" className="flex h-8 items-center gap-1 rounded-md border bg-white px-2.5 text-[13px] hover:bg-[#f8f9fa]" title="从第 0 步开始，只用这一层的镜头播放；这一层没有变化的步骤快速带过">
                ↻ 只重放这一层
              </button>
            </div>
          ) : null}
          <div className="relative flex min-h-0 flex-1 flex-col rounded-xl border bg-white" data-layer={useCam ? viewLayer : undefined} data-director={useCam ? (director ? 'on' : 'off') : undefined}>
            {state && shownScene ? (
              <StageViewport viewport={device} theme={p.theme} notice={snap.notice} onDismiss={() => ctl.dismissNotice()}>
                <Stage
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
              </StageViewport>
            ) : (
              <div className="flex flex-1 items-center justify-center p-8 text-center text-[14px] text-[#6b6b6b]" data-testid="no-scene">
                这个方案还没有可显示的画面。
              </div>
            )}
            {state && shownScene ? (
              <div className="absolute right-3 top-2 z-10 flex items-center gap-1" role="toolbar" aria-label="缩放" data-testid="zoom-bar" data-zoom={userZoom === null ? 'camera' : userZoom.toFixed(2)}>
                <button type="button" aria-label="缩小" title="缩小（滚轮 / 捏合也可以）" onClick={() => zoomApi.current?.zoomBy(1 / 1.25)} data-testid="zoom-out" className="flex size-7 items-center justify-center rounded-md border bg-white text-[#3a3a3a] hover:bg-[#f8f9fa]">
                  <Minus className="size-3.5" />
                </button>
                <button type="button" aria-label="放大" title="放大（滚轮 / 捏合也可以）" onClick={() => zoomApi.current?.zoomBy(1.25)} data-testid="zoom-in" className="flex size-7 items-center justify-center rounded-md border bg-white text-[#3a3a3a] hover:bg-[#f8f9fa]">
                  <Plus className="size-3.5" />
                </button>
                <button type="button" title="回到镜头的画面（取消手动缩放与平移）" onClick={() => zoomApi.current?.fit()} data-testid="zoom-fit" disabled={userZoom === null} className="flex h-7 items-center gap-1 rounded-md border bg-white px-2 text-[12px] text-[#3a3a3a] hover:bg-[#f8f9fa] disabled:opacity-40">
                  <Maximize className="size-3.5" />
                  适应画面
                </button>
              </div>
            ) : null}
            {p.stageHint ? <div className="pointer-events-none absolute bottom-2 right-3 text-[12px] text-[#9a9a9a]" data-testid="stage-hint">{p.stageHint}</div> : null}
            {p.flash ? (
              <div role="status" className="absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-md bg-[#1e1e1e] px-3 py-1.5 text-[13px] text-white shadow" data-testid="flash">
                {p.flash}
              </div>
            ) : null}
          </div>
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
