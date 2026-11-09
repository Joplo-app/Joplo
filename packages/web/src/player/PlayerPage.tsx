import { AuthorLink, type Author } from '../site/author';
import { useTopbarMeasurements } from './topbar-fit';
import { LanguageMenu } from './LanguageMenu';
import { localeNames } from '../i18n/locale';
import { translate } from '../i18n/messages';
import { useI18n } from '../i18n/context';
import { en, type Dictionary } from '../i18n/en';
/**
 * 演示页（D39 / D55，看板与发布站同一套布局）：
 *   顶栏：品牌 │ 项目 ▾ / 功能 ▾（crumbs，带下拉）…… 调用方的操作（看板：检查、外观）· 导出 ▾（menu）· 全屏；
 *   左栏：由调用方提供（看板：方案与情况；发布站：场景列表）；
 *   中间：舞台框（层级标签贴在上沿 +「跟随导演」，画面和字幕合成一体）、播放坞
 *        （回到开头 · 上一步 · 播放 · 下一步 │ 时间线 │ 速度 ▾ · 缩放 − 适应 +）。
 *   全屏：只有画面、字幕区与底部居中的深色胶囊控制条（鼠标静止后淡出，空间保留，画面不跳动）。
 * 一屏放下（不变量 1）：根节点 h-full + overflow-hidden；时间线放不下时在自己一行里横向滚动。断点见 layout.ts。
 * 看板界面只用看板 Token（--jb-*）；舞台、字幕、手机外框只读 --jp-*（不变量 6）。
 * 创作侧信息（缺口、规则、源码位置、抽屉、检查、外观）只由看板通过 nav / banner / drawer / menu / actions 传入，
 * 本文件不引用它们，因此发布站的产物里不会出现（不变量 5）。
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { AppWindow, Bot, ChevronLeft, ChevronRight, ChevronsUpDown, Clapperboard, Database, FileText, Globe, Mail, MessageSquare, Monitor, Server, Smartphone, SquareTerminal, Workflow, GitFork, Cog, Ellipsis, Expand, Film, Gauge, Maximize, Minus, Pause, Play, Plus, RotateCcw, RotateCw, Share, Shrink } from 'lucide-react';
import { roleOfScene, stepTouchesLayer, type LayerIcon, type Project, type RoleInfo, type Scenario } from '@joplo-app/core';
import type { DemoController, Snapshot } from '../runtime/demo';
import { Stage, type ZoomApi } from '../renderer/Stage';
import { Subtitle } from './Subtitle';
import { isFullscreenKey, useFullscreen, useIdleVisible } from './fullscreen';
import { UpNextCard, usePhoneLayout, WatchView, type Chapter } from './WatchView';
import { subtitleFor } from './subtitle-content';
import { coverFor, coverShown } from './cover-content';
import { Curtain, curtainUp } from './Curtain';
import { SPEEDS, asSpeed } from '../runtime/pace';
import { cameraFor, cameraPosition, withLeadFrame } from './cameraFor';
import type { StageTheme } from '../renderer/rough';
import { cn } from '@/lib/utils';
import { JoploLogo } from './JoploMark';
import { Overlay } from './Overlay';
import { StageViewport, type StageWatermark } from './StageViewport';
import { resolveLook, type AppearanceFont, type AppearanceStroke } from '../renderer/appearance';
import { AudioLines, PanelLeftOpen } from 'lucide-react';
import { Btn, DirectorTag, Kbd, MenuButton, Segmented, Switch, useWidth, type MenuEntry } from './controls';
import { SHORTCUTS } from './states';
import { fullscreenBarCollapse } from './controls-fit';
import { CenterPanel, useTip } from './popover';
import { boardLayout, bookmarkTabs, layerTabs, timelineChips, type BoardLayout, type LayerTab, type TimelineChip } from './layout';

export { Segmented } from './controls';
export type { MenuItem, MenuEntry } from './controls';

/** 面包屑的一段：有 items 时是下拉（项目 ▾ / 功能 ▾），有 onClick 时是链接，否则是文字。 */
export type Crumb = { label: string; testid: string; onClick?: () => void; items?: MenuEntry[]; menuLabel?: string };

/** 视口宽度（断点用）。 */
export function useViewportWidth(): number {
  const [w, setW] = useState(() => (typeof window === 'undefined' ? 1440 : window.innerWidth));
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return w;
}
export const useBoardLayout = (): BoardLayout => { const { t, locale } = useI18n(); return boardLayout(useViewportWidth(), t, localeNames[locale], useTopbarMeasurements()); };

/** Joplo 官网：发布站 / 分享页（观众看到的）顶栏标志指向这里。 */
export const JOPLO_SITE_URL = 'https://joplo.app/';

/** 顶栏标志：看板里是回首页的按钮；传 href（发布站）时是在新标签页打开的外链，观众不会丢掉正在看的演示。 */
export function Brand({ onClick, href }: { onClick?: () => void; href?: string }) {
  const { t: i18n } = useI18n();
  const className = 'jb-focus flex shrink-0 items-center rounded-[6px]';

  if (href)
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" aria-label={i18n.player.joploWebsite} title={i18n.player.joploWebsite} className={className} data-testid="brand">
        <JoploLogo height={28} />
      </a>
    );
  return (
    <button type="button" onClick={onClick} aria-label={i18n.player.joploGoToHome} className={className} data-testid="brand">
      <JoploLogo height={28} />
    </button>
  );
}

export function TopBar({ children, right }: { children?: ReactNode; right?: ReactNode }) {
  return (
    <header className="flex h-[52px] shrink-0 items-center gap-3 border-b border-jb-line bg-jb-surface px-4 font-jb text-jb-fg" data-testid="topbar">
      {children}
      {right ? <div data-topbar-actions="" className="ml-auto flex shrink-0 items-center gap-3">{right}</div> : null}
    </header>
  );
}

function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  const { t: i18n } = useI18n();

  return (
    <nav aria-label={i18n.player.breadcrumbs} className="flex min-w-0 items-center gap-1 text-[14px]" data-testid="crumbs">
      {crumbs.map((c, i) => (
        <span key={c.testid} className="flex min-w-0 items-center gap-1">
          {i > 0 ? <span className="px-1.5 text-jb-faint">/</span> : null}
          {c.items ? (
            <MenuButton
              trigger={{ label: c.label, iconOnly: false }}
              label={c.menuLabel ?? c.label}
              testid={c.testid}
              items={c.items}
              placement="bottom-start"
              variant="ghost"
              width={300}
              className="h-8 min-w-0 max-w-[260px] px-2 text-[14px] [&>span:first-child]:truncate"
              chevron={<ChevronsUpDown className="size-3.5 text-jb-faint" aria-hidden />}
            />
          ) : c.onClick ? (
            <button type="button" onClick={c.onClick} data-testid={c.testid} className="jb-focus truncate rounded-[6px] px-2 py-1.5 font-medium hover:bg-jb-hover">
              {c.label}
            </button>
          ) : (
            <span data-testid={c.testid} className="truncate px-2 font-medium">
              {c.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}

const playLabelOf = (snap: Snapshot, i18n: Dictionary = en) => (!snap.playing ? (snap.state?.completed ? i18n.player.replay : i18n.player.play) : snap.paused ? i18n.player.resume : i18n.player.pause);
const speedItems = (speed: number, onSpeed: (v: number) => void, i18n: Dictionary = en): MenuEntry[] => SPEEDS.map((v) => ({ id: `speed-${v}`, label: i18n.player.speedValue(v), checked: speed === v, onClick: () => onSpeed(v) }));

/** 上一步 / 播放 / 下一步（悬停提示写快捷键）。 */
function NavButtons({ snap, scenario, ctl, iconOnly, size, ids }: { snap: Snapshot; scenario: Scenario | null; ctl: DemoController; iconOnly: boolean; size: 32 | 34; ids: { prev: string; play: string; next: string } }) {
  const { t: i18n } = useI18n();

  const pos = snap.state?.position ?? 0;
  const total = scenario?.steps.length ?? 0;
  const off = !scenario || snap.view !== 'stage';
  const playing = snap.playing && !snap.paused;
  const playLabel = playLabelOf(snap, i18n);
  const side = size === 34 ? 'rounded-[8px]' : undefined;
  return (
    <>
      <Btn icon={<ChevronLeft className="size-4" />} label={i18n.player.previousStep} kbd="←" iconOnly variant="ghost" size={size} className={side} onClick={() => ctl.prev()} disabled={off || (pos === 0 && !snap.busy)} data-testid={ids.prev} />
      <Btn icon={playing ? <Pause className="size-4" /> : <Play className="size-4" />} label={playLabel} kbd={i18n.player.space} title={playLabel} aria-label={playLabel} iconOnly={iconOnly} size={size} variant="play" className={cn(side, !iconOnly && 'px-4 text-[14px]')} onClick={() => ctl.togglePlay()} disabled={off || total === 0} data-testid={ids.play} />
      <Btn icon={<ChevronRight className="size-4" />} label={i18n.player.nextStep} kbd="→" iconOnly variant="ghost" size={size} className={side} onClick={() => void ctl.next()} disabled={off || total === 0} data-testid={ids.next} />
    </>
  );
}

const Divider = () => <span aria-hidden className="h-5 w-px shrink-0 bg-jb-line" />;

/** 时间线的一格：当前步是宽块并写说明；其余只有序号，悬停写“序号 · 说明”。 */
function Chip({ chip, width, onClick, testid, kind }: { chip: TimelineChip; width: number; onClick: () => void; testid: string; kind?: string }) {
  const { t: i18n } = useI18n();
  const [tip, tipNode] = useTip(chip.state === 'current' && !chip.fork ? null : chip.tip, { placement: 'top-center', delay: 200 });
  const cur = chip.state === 'current';
  return (
    <li className="flex shrink-0">
      <button
        type="button"
        onClick={onClick}
        data-testid={testid}
        data-state={chip.state}
        data-step-kind={kind}
        data-playing={chip.playing ? '' : undefined}
        aria-label={i18n.player.stepWithCaption(chip.index, chip.label)}
        aria-current={cur ? 'step' : undefined}
        {...tip}
        style={cur ? { width } : undefined}
        className={cn(
          'jb-focus relative flex h-7 items-center gap-1.5 overflow-hidden whitespace-nowrap rounded-[6px] font-jb-mono text-[11px] font-bold',
          cur ? 'justify-start border-[1.5px] border-jb-ink bg-jb-accent px-2.5 text-jb-on-accent' : 'min-w-[34px] justify-center px-1.5',
          chip.state === 'done' && 'border border-jb-ink bg-jb-inverse text-jb-accent hover:bg-jb-inverse-hover',
          chip.state === 'todo' && 'border border-jb-line bg-jb-surface text-jb-faint hover:bg-jb-hover hover:text-jb-fg',
        )}
      >
        {/* 播放中的停留进度：从左往右填深黄，暂停时停住（D55） */}
        {chip.dwell ? (
          <span
            key={`${chip.index}|${chip.dwell.ms}|${chip.dwell.elapsed}`}
            aria-hidden
            className="jb-dwell absolute inset-0 bg-jb-accent-press"
            data-testid="dwell"
            style={{ animationDuration: `${chip.dwell.ms}ms`, animationDelay: `${-chip.dwell.elapsed}ms`, animationPlayState: chip.dwell.paused ? 'paused' : 'running' }}
          />
        ) : null}
        <span className="relative">{i18n.player.number(chip.index)}</span>
        {chip.fork ? <GitFork className="relative size-3 shrink-0" aria-label={i18n.player.fork} /> : null}
        {chip.system && !cur ? <Cog className="relative size-3" aria-label={i18n.player.system} /> : null}
        {chip.card && !cur ? <Film className="relative size-3" aria-label={i18n.player.transition} /> : null}
        {cur ? (
          <span className="relative min-w-0 truncate font-jb text-[12px] font-semibold">
            {chip.system ? i18n.player.systemPrefix : chip.card ? i18n.player.transitionPrefix : ''}
            {chip.label}
          </span>
        ) : null}
      </button>
      {tipNode}
    </li>
  );
}

function Timeline({ snap, scenario, ctl, currentW }: { snap: Snapshot; scenario: Scenario; ctl: DemoController; currentW: number }) {
  const { t: i18n } = useI18n();

  const chips = timelineChips(scenario.steps, snap.state?.position ?? 0, snap.activeStep, snap.dwell, snap.paused, i18n);
  const cur = chips.findIndex((c) => c.state === 'current');
  const ref = useRef<HTMLOListElement>(null);
  // 当前步滚到可见（只滚时间线自己，不用 scrollIntoView，避免带动外层）
  useEffect(() => {
    const ol = ref.current;
    const li = ol?.children[cur] as HTMLElement | undefined;
    if (!ol || !li) return;
    const l = li.offsetLeft - ol.offsetLeft;
    if (l < ol.scrollLeft) ol.scrollLeft = l - 6;
    else if (l + li.offsetWidth > ol.scrollLeft + ol.clientWidth) ol.scrollLeft = l + li.offsetWidth - ol.clientWidth + 6;
  }, [cur]);
  return (
    <ol ref={ref} className="jb-noscrollbar flex h-[34px] min-w-0 flex-1 items-center gap-1 overflow-x-auto px-1.5" aria-label={i18n.player.steps} data-testid="step-bar">
      {chips.map((c) => (
        <Chip key={c.index} chip={c} width={currentW} onClick={() => ctl.clickStepChip(c.stepIndex)} testid={c.index === 0 ? 'chip-initial' : `chip-${scenario.steps[c.index - 1]!.id}`} kind={c.index === 0 ? undefined : scenario.steps[c.index - 1]!.kind} />
      ))}
    </ol>
  );
}

/** 窄屏（< 900）的时间线：只剩“当前步 / 总数”，点一下弹出全部步骤。 */
function CompactTimeline({ snap, scenario, ctl }: { snap: Snapshot; scenario: Scenario; ctl: DemoController }) {
  const { t: i18n } = useI18n();

  const chips = timelineChips(scenario.steps, snap.state?.position ?? 0, snap.activeStep, snap.dwell, snap.paused, i18n);
  const cur = chips.find((c) => c.state === 'current') ?? chips[0]!;
  return (
    <div className="flex min-w-0 flex-1 items-center px-1.5" data-testid="step-bar" data-compact="">
      <MenuButton
        trigger={{ label: `${i18n.player.number(cur.index)} / ${i18n.player.number(scenario.steps.length)}`, iconOnly: false }}
        label={i18n.player.stepMenuLabel(cur.index, cur.label)}
        testid="step-compact"
        placement="top-start"
        variant="ghost"
        size={34}
        width={300}
        className="rounded-[8px] font-jb-mono text-[13px] font-semibold"
        items={chips.map((c) => ({ id: `step-${c.index}`, label: c.tip, checked: c.state === 'current', onClick: () => ctl.clickStepChip(c.stepIndex) }))}
      />
    </div>
  );
}

/** 播放坞：⟲ ‹ 播放 › │ 时间线 │ 速度 ▾ · 缩放 − 适应 +。 */
function Dock({ snap, scenario, ctl, speed, onSpeed, L, zoom, voice }: { snap: Snapshot; scenario: Scenario | null; ctl: DemoController; speed: number; onSpeed?: (v: number) => void; L: BoardLayout; zoom: ReactNode; voice?: ReactNode }) {
  const { t: i18n } = useI18n();

  const off = !scenario || snap.view !== 'stage';
  return (
    <div className="flex h-[56px] shrink-0 items-center gap-1.5 rounded-[10px] border border-jb-line bg-jb-surface px-3 font-jb" role="toolbar" aria-label={i18n.player.playbackControls} data-testid="controls">
      <Btn icon={<RotateCcw className="size-4" />} label={i18n.player.goToStart} kbd="Home" iconOnly variant="ghost" size={34} className="rounded-[8px]" onClick={() => ctl.reset()} disabled={off} data-testid="ctl-reset" />
      <NavButtons snap={snap} scenario={scenario} ctl={ctl} iconOnly={false} size={34} ids={{ prev: 'ctl-prev', play: 'ctl-play', next: 'ctl-next' }} />
      <Divider />
      {scenario ? L.compactTimeline ? <CompactTimeline snap={snap} scenario={scenario} ctl={ctl} /> : <Timeline snap={snap} scenario={scenario} ctl={ctl} currentW={L.currentStepW} /> : <div className="flex-1" />}
      <Divider />
      {voice}
      {onSpeed ? <MenuButton trigger={{ label: i18n.player.speedValue(speed), iconOnly: false }} label={i18n.player.autoplaySpeed(speed)} testid="speed" items={speedItems(speed, onSpeed, i18n)} placement="top-end" variant="ghost" size={34} width={120} className="rounded-[8px] px-2.5 font-jb-mono text-[13px] font-semibold" /> : null}
      {zoom}
    </div>
  );
}

/** 全屏控制条：居中的深色胶囊，高 48，内边距 8；宽度不够时依次收起三件套、速度、层级切换。 */
function FullscreenBar({ snap, scenario, ctl, speed, onSpeed, layers, viewLayer, director, onLayer, onDirector, onExit, avail, actions }: { snap: Snapshot; scenario: Scenario; ctl: DemoController; speed: number; onSpeed?: (v: number) => void; layers: { id: string; title: string }[]; viewLayer: string; director: boolean; onLayer: (id: string) => void; onDirector: () => void; onExit: () => void; avail: number; actions?: ReactNode }) {
  const { t: i18n } = useI18n();

  const current = layers.find((l) => l.id === viewLayer)?.title ?? viewLayer;
  const c = fullscreenBarCollapse(avail, playLabelOf(snap, i18n), onSpeed ? SPEEDS : [], layers.map((l) => l.title), director, current, i18n);
  const sep = <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-jb-line" />;
  return (
    <div className="jb-dark flex h-12 max-w-full shrink-0 items-center gap-1.5 overflow-hidden rounded-full border border-jb-line bg-jb-surface px-2 [&_[data-testid=fs-play]]:rounded-full" role="toolbar" aria-label={i18n.player.fullscreenPlaybackControls} data-testid="fullscreen-controls" data-collapsed={[...c].join(' ') || undefined}>
      <NavButtons snap={snap} scenario={scenario} ctl={ctl} iconOnly={c.has('nav')} size={32} ids={{ prev: 'fs-prev', play: 'fs-play', next: 'fs-next' }} />
      {onSpeed ? (
        <>
          {sep}
          {c.has('speed') ? (
            <MenuButton trigger={{ icon: <Gauge className="size-4" /> }} label={i18n.player.playbackSpeed(speed)} testid="fs-speed" variant="ghost" size={32} width={120} items={speedItems(speed, onSpeed, i18n)} placement="top-center" />
          ) : (
            <MenuButton trigger={{ label: i18n.player.speedValue(speed), iconOnly: false }} label={i18n.player.autoplaySpeed(speed)} testid="fs-speed" variant="ghost" size={32} width={120} items={speedItems(speed, onSpeed, i18n)} placement="top-center" className="px-2 font-jb-mono text-[13px] font-semibold" />
          )}
        </>
      ) : null}
      {layers.length > 1 ? (
        <>
          {sep}
          {c.has('layers') ? (
            <MenuButton trigger={{ label: i18n.player.layer(current) }} label={i18n.player.switchLayer} testid="layer-switch" size={32} variant="ghost" placement="top-start" items={layers.map((l) => ({ id: `layer-${l.id}`, label: l.title, checked: l.id === viewLayer, onClick: () => onLayer(l.id) }))} />
          ) : (
            <Segmented label={i18n.player.layers} testid="layer-switch" value={viewLayer} onChange={onLayer} items={layers.map((l) => ({ value: l.id, label: l.title, testid: `layer-${l.id}`, title: i18n.player.viewManuallyDirectorPaused(l.title) }))} />
          )}
          <DirectorTag on={director} layerTitle={current} onToggle={onDirector} />
        </>
      ) : null}
      {actions ? (
        <>
          {sep}
          {actions}
        </>
      ) : null}
      {sep}
      <Btn icon={<Shrink className="size-4" />} label={i18n.player.exitFullscreen} kbd="Esc" iconOnly variant="ghost" size={32} onClick={onExit} data-testid="fs-exit" />
    </div>
  );
}

/** 标签的样式与内容（真实标签和看不见的测量标签共用，保证量出来的宽度就是显示的宽度）。 */
const TAB_BASE = 'flex items-center gap-1.5 whitespace-nowrap rounded-t-[8px] px-3 font-jb text-[13px]';
const tabLook = (active: boolean) =>
  active ? 'h-9 border-[1.5px] border-b-0 border-jb-ink bg-jb-surface font-semibold text-jb-fg' : 'h-8 border border-b-0 border-jb-line bg-jb-sunken text-jb-muted';
/** 层级的预设图标（core 的 LAYER_ICONS）：标签压窄时靠它认出是哪一层。 */
const LAYER_ICON: Record<LayerIcon, typeof AppWindow> = {
  window: AppWindow, browser: Globe, mobile: Smartphone, desktop: Monitor, terminal: SquareTerminal, chat: MessageSquare,
  agent: Bot, server: Server, data: Database, email: Mail, doc: FileText, flow: Workflow,
};
function TabFace({ t }: { t: LayerTab }) {
  const Icon = LAYER_ICON[t.icon ?? 'window'] ?? AppWindow;
  return (
    <>
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {t.role ? (
        <span aria-label={t.role.name} className="inline-flex size-[18px] shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: t.role.color }}>
          {[...t.role.name][0]}
        </span>
      ) : null}
      <span className="min-w-0 truncate">{t.title}</span>
    </>
  );
}
const TAB_GAP = 4;

/**
 * 层级标签（D55）：贴在舞台框上沿，正在看的那层与舞台连成一片；每个标签带预设图标，导演停在哪层，哪层右上角有摄像机角标。
 * 右侧「只重放这一层」与「跟随导演」。
 * 放不下时像书签（bookmarkTabs）：正在看的那层保持完整，其余压窄或叠起来，只露出图标和开头几个字；
 * 鼠标划过或键盘聚焦的标签浮到最上面、展开成全名，盖住邻居，别的标签不动。悬停提示里始终有全名。
 */
function LayerTabs({ layers, viewLayer, director, onLayer, onDirector, onReplay }: { layers: { id: string; title: string; role?: RoleInfo | null; icon?: LayerIcon }[]; viewLayer: string; director: boolean; onLayer: (id: string) => void; onDirector: (on: boolean) => void; onReplay: () => void }) {
  const { t: i18n } = useI18n();
  const tabs = layerTabs(layers, viewLayer, director);
  const [barRef, barWidth] = useWidth(0);
  const measure = useRef<HTMLDivElement | null>(null);
  const [widths, setWidths] = useState<number[]>([]);
  const key = tabs.map((t) => `${t.id}|${t.title}|${t.active}|${t.icon ?? ''}|${t.role?.name ?? ''}`).join('\n');
  useLayoutEffect(() => {
    const el = measure.current;
    if (!el) return;
    const read = () => {
      const next = [...el.children].map((c) => Math.ceil(c.getBoundingClientRect().width));
      setWidths((prev) => (prev.length === next.length && prev.every((w, i) => w === next[i]) ? prev : next));
    };
    read();
    // 字体晚到时测量行会变宽，跟着重算
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [key]);
  const geometry = widths.length === tabs.length ? bookmarkTabs(widths, tabs.findIndex((t) => t.active), barWidth, TAB_GAP) : [];
  return (
    <div className="relative z-[1] -mb-[1.5px] flex h-9 shrink-0 items-end gap-2 pl-3" data-testid="layer-bar">
      <div ref={measure} aria-hidden inert className="pointer-events-none invisible absolute left-0 top-0 flex w-max items-end">
        {tabs.map((t) => (
          <span key={t.id} className={cn(TAB_BASE, tabLook(t.active))}>
            <TabFace t={t} />
          </span>
        ))}
      </div>
      <div ref={barRef} role="tablist" aria-label={i18n.player.layers} className="relative h-9 min-w-0 flex-1" data-testid="layer-switch">
        {tabs.map((t, i) => {
          const g = geometry[i];
          if (!g) return null;
          const opens = g.openWidth > g.width;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={t.active}
              data-testid={`layer-${t.id}`}
              data-camera={t.camera ? '' : undefined}
              title={t.active ? (t.camera ? i18n.player.directorIsUsing(t.title) : i18n.player.stayingOn(t.title)) : i18n.player.switchToDirectorPaused(t.title)}
              onClick={() => onLayer(t.id)}
              style={{ '--l': `${g.left}px`, '--w': `${g.width}px`, '--ol': `${g.openLeft}px`, '--ow': `${g.openWidth}px`, '--z': g.z } as React.CSSProperties}
              className={cn(
                'jb-focus absolute bottom-0 left-(--l) z-(--z) w-(--w)',
                TAB_BASE,
                tabLook(t.active),
                !t.active && 'hover:text-jb-fg',
                opens && 'transition-[left,width,z-index] duration-200 ease-out hover:transition-[left,width] focus-visible:transition-[left,width] hover:left-(--ol) hover:z-[60] hover:w-(--ow) focus-visible:left-(--ol) focus-visible:z-[60] focus-visible:w-(--ow)',
              )}
            >
              <span className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
                <TabFace t={t} />
              </span>
              {/* 导演停在这一层：右上角的小摄像机角标 */}
              {t.camera ? (
                <span data-testid="director-badge" aria-label={i18n.player.directorShot} className="pointer-events-none absolute -right-1.5 -top-1.5 inline-flex size-[18px] items-center justify-center rounded-full border-[1.5px] border-jb-ink bg-jb-accent text-jb-ink">
                  <Clapperboard className="size-2.5" aria-hidden />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-1 pb-1">
        <Btn icon={<RotateCw className="size-4" />} label={i18n.player.replayThisLayer} title={i18n.player.playFromStep0UsingThisLayerSShots} iconOnly variant="ghost" size={28} onClick={onReplay} data-testid="replay-layer" />
        <Switch on={director} onChange={onDirector} label={i18n.player.followDirector} testid="director" title={director ? i18n.player.directorSwitchesLayersAndShotsWithEachStepTurn : i18n.player.turnOnToReturnToThisStepSDirector} />
      </div>
    </div>
  );
}

export type PlayerPageProps = {
  ctl: DemoController;
  snap: Snapshot;
  project: Project;
  crumbs: Crumb[];
  /** 看板：点标志回首页。 */
  onBrand?: () => void;
  /** 发布站：标志改为在新标签页打开的链接（JOPLO_SITE_URL），优先于 onBrand。 */
  brandHref?: string;
  /** 发布站水印（D83）：舞台右上角的小 Joplo 图标；看板不传，Pro 分享不传。 */
  watermark?: StageWatermark;
  author?: Author | null;
  theme: StageTheme;
  /** 字体（D55，看板外观）：null / 缺省 = 跟随主题。发布站不传。 */
  font?: AppearanceFont | null;
  /** 线条（D55，看板外观）：null / 缺省 = 跟随主题。发布站不传。 */
  stroke?: AppearanceStroke | null;
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
  /** 顶栏「导出 ▾」的菜单项。 */
  menu: MenuEntry[];
  /** 顶栏菜单按钮的文字（默认“导出”）。 */
  menuLabel?: string;
  /** 顶栏右侧、导出之前的操作（看板：检查、外观）。 */
  actions?: ReactNode;
  /** 右侧抽屉等覆盖层（看板）。 */
  drawer?: ReactNode;
  /** 本地评审等舞台浮层；传入实际显示的层级，不参与舞台尺寸计算。 */
  stageOverlay?: (sceneId: string | null) => ReactNode;
  /** 允许 ⌥+单击检查元素（看板）；发布站为 false，⌥+单击按普通单击处理。 */
  onInspect?: (nodeId: string) => void;
  /** 检查模式（看板「检查」开关）：单击 = 检查元素，不执行步骤。 */
  inspectMode?: boolean;
  selectedId?: string | null;
  /** 页面级的轻提示（复制链接、导出完成等）。 */
  flash?: ReactNode | null;
  /** 场景完成后，字幕区右侧「重新播放」旁边的操作（看板：“下一个情况 →”）。 */
  completeAction?: ReactNode;
  /** 窄屏（< 1100）左栏收成竖条时显示的内容；不传时竖条只有一个展开按钮。 */
  navRail?: ReactNode;
  /** 「导出」按钮上的小标记（看板：视频导出的进度环）。 */
  exportBadge?: ReactNode;
  /** 全屏控制胶囊里、退出按钮之前的操作（看板：外观）。 */
  fullscreenActions?: ReactNode;
  /** 朗读（D74）：播放坞里速度之前的声音按钮（看板：开关 + 浮层；发布站：开关）。 */
  voice?: ReactNode;
  /** 全屏控制胶囊里的声音按钮（只是开关）。 */
  fullscreenVoice?: ReactNode;
  /** 手机页面时画面左上角的标注（看板传入“手机页面 · 390 宽 · 外框由画面自动加上”，给作者看，只在检查时显示；发布站不传）。 */
  deviceTag?: ReactNode;
  /**
   * 发布站：在手机上像看视频一样看（mobile_watch）。传入时，设备是手机就换成 WatchView（竖屏播放页 / 横屏沉浸）；
   * 电脑和平板不受影响。chapters 是选定方案的场景（按顺序）。
   */
  watch?: { title: string; chapters: Chapter[]; onChapter: (id: string) => void; onRestart: () => void };
};

export function PlayerPage(p: PlayerPageProps) {
  const { t: i18n } = useI18n();

  const { ctl, snap, project } = p;
  ctl.i18n = i18n;
  const L = useBoardLayout();
  const [stageEl, setStageEl] = useState<HTMLDivElement | null>(null);
  const [altDown, setAltDown] = useState(false);
  // 快捷键面板（?）、窄屏浮出的完整左栏（[）：只在本页，不写进网址
  const [keysOpen, setKeysOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  useEffect(() => {
    if (!L.rail) setRailOpen(false);
  }, [L.rail]);
  // 浮出的左栏：点外面或 Esc 收回
  useEffect(() => {
    if (!railOpen) return;
    const down = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest?.('[data-testid="left-nav-float"],[data-rail],[data-jb-pop]')) setRailOpen(false);
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setRailOpen(false);
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('keydown', key);
    };
  }, [railOpen]);
  // 检查模式：悬停的元素画墨色虚线框 + 左上角“类型 · 名字”
  const [hoverBox, setHoverBox] = useState<{ x: number; y: number; w: number; h: number; type: string | null; name: string } | null>(null);
  const inspecting = altDown || !!p.inspectMode;
  const state = snap.state;
  const scenario = snap.view === 'stage' ? ctl.scenario() : null;
  const next = ctl.nextStep();
  const nextTargetId = next && 'target' in next.action ? next.action.target : null;
  // 字幕区（画面下方）显示的步骤：正在播放的一步，否则是刚执行完的一步；第 0 步显示初始状态
  const pos = state?.position ?? 0;
  const subtitle = subtitleFor(scenario, pos, snap.activeStep, state?.completed ?? null, i18n, project);
  // 幕布（D61）：第 0 步的场景封面、过渡卡；铺满舞台区域，不进手机外框
  const cover = coverShown(scenario, pos, snap.playing, snap.activeStep) ? coverFor(project, scenario?.id, i18n) : null;
  const curtainOn = !!scenario && curtainUp(project, scenario.id, pos, cover);
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
  // 用户操作的目标不在画面里时，控制器请求把它和当前焦点一起框进来（leadFrame），观众才看得到点击和输入
  const camera = withLeadFrame(plan.spec, snap.leadFrame);
  const shownScene = state ? project.scenes[plan.sceneId ?? state.sceneId] : undefined;
  const device = shownScene?.viewport === 'mobile' ? 'mobile' : 'desktop';
  // 自由缩放：导演跟随时每一步由镜头重新接管；手动时保持，直到换层或点「适应」
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
  // 手机上看分享（mobile_watch）：只有发布站传了 watch 才检测
  const phone = usePhoneLayout(!!p.watch);
  const idle = useIdleVisible(full);

  // 键盘：← → 逐步，Home 回到开头，空格播放/暂停，F 全屏（Esc 由浏览器退出）；按住 ⌥ 时标出可检查的元素
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Alt') setAltDown(e.type === 'keydown' && !!p.onInspect);
      if (e.type !== 'keydown') return;
      const t = e.target as HTMLElement;
      if (t.closest('input,textarea,select,[contenteditable],[data-joplo-stage],[role="menu"],[role="dialog"],[role="tablist"],[role="radiogroup"]')) return;
      if (e.metaKey || e.ctrlKey) return;
      if (e.key === '?') {
        e.preventDefault();
        setKeysOpen((v) => !v);
      } else if (e.key === '[' && L.rail && !full) {
        e.preventDefault();
        setRailOpen((v) => !v);
      } else if (isFullscreenKey(e, t)) {
        e.preventDefault();
        toggleFull();
      } else if (e.key === 'ArrowRight') void ctl.next();
      else if (e.key === 'ArrowLeft') ctl.prev();
      else if (e.key === 'Home') {
        e.preventDefault();
        ctl.reset();
      }
      // 全屏时空格总是播放 / 暂停（不触发刚点过、仍有焦点的按钮）
      else if (e.key === ' ' && (t.tagName !== 'BUTTON' || full)) {
        e.preventDefault();
        ctl.togglePlay();
      }
    };
    const blur = () => setAltDown(false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      window.removeEventListener('blur', blur);
    };
  }, [ctl, p.onInspect, toggleFull, full, L.rail]);
  useEffect(() => {
    if (!inspecting) setHoverBox(null);
  }, [inspecting]);
  const onInspectHover = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!inspecting || !stageEl) return;
    const t = e.target as HTMLElement;
    const el = stageEl.contains(t) ? t.closest<HTMLElement>('[data-jid]:not([data-jtype="#text"])') : null;
    if (!el) return setHoverBox(null);
    const box = e.currentTarget.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const name = (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 18);
    setHoverBox({ x: r.left - box.left, y: r.top - box.top, w: r.width, h: r.height, type: el.dataset.jtype ?? null, name });
  };

  const currentLayer = layers.find((l) => l.id === viewLayer)?.title ?? viewLayer;
  const toggleDirector = () => p.onLayer(director ? viewLayer : null);
  const hasLayerBar = useCam && layers.length > 1;
  // 全屏控制条所在的一行（宽度决定收起哪些控件）
  const [barRowRef, barRowW] = useWidth(1200);
  const hasStage = !!(state && shownScene);
  // 外观（D55）：舞台、字幕、手机外框用同一套（线条落到 rough / clean，字体覆盖 --jp-font）
  const look = resolveLook({ theme: p.theme, font: p.font ?? null, stroke: p.stroke ?? null }, project.themes ?? {}, i18n);

  const zoomIn = () => zoomApi.current?.zoomBy(1.25);
  const zoomOut = () => zoomApi.current?.zoomBy(1 / 1.25);
  const fit = () => zoomApi.current?.fit();
  // 缩放（D55：从画面右上角移到播放坞）。< 1440 只剩 − +；手动缩放后才出现「适应」
  const dockZoom = hasStage ? (
    <div className="flex h-[34px] shrink-0 items-center gap-0.5 rounded-[8px] bg-jb-app px-1" role="group" aria-label={i18n.player.zoom} data-testid="zoom-bar" data-zoom={userZoom === null ? 'camera' : userZoom.toFixed(2)}>
      <Btn icon={<Minus className="size-4" />} label={i18n.player.zoomOut} title={i18n.player.zoomOutYouCanAlsoScrollOrPinch} iconOnly variant="ghost" size={28} onClick={zoomOut} data-testid="zoom-out" />
      {L.zoomLabel ? (
        <Btn label={i18n.player.fit} title={i18n.player.returnToTheShotResetManualZoomAndPan} variant="ghost" size={28} className="px-1.5 text-[12px] font-normal text-jb-muted" onClick={fit} disabled={userZoom === null} data-testid="zoom-fit" />
      ) : userZoom !== null ? (
        <Btn icon={<Maximize className="size-3.5" />} label={i18n.player.fit} title={i18n.player.returnToTheShot} iconOnly variant="ghost" size={28} onClick={fit} data-testid="zoom-fit" />
      ) : null}
      <Btn icon={<Plus className="size-4" />} label={i18n.player.zoomIn} title={i18n.player.zoomInYouCanAlsoScrollOrPinch} iconOnly variant="ghost" size={28} onClick={zoomIn} data-testid="zoom-in" />
    </div>
  ) : null;

  const completed = !!(scenario && state?.completed && !snap.playing);
  // video：手机上看分享（WatchView）时舞台按设计尺寸整体缩放、留黑边；完成操作由 WatchView 自己画
  const renderStage = (video: boolean) => (
    <div className="relative flex min-h-0 flex-1 flex-col" onMouseMove={inspecting ? onInspectHover : undefined} onMouseLeave={() => setHoverBox(null)}>
      {hasStage ? (
        <StageViewport
          video={video}
          watermark={p.watermark}
          viewport={device}
          theme={p.theme}
          stroke={look.stroke}
          font={look.font}
          notice={snap.notice}
          onDismiss={() => ctl.dismissNotice()}
          onBack={() => ctl.backToDemo()}
          tag={p.deviceTag && device === 'mobile' && !full && inspecting ? p.deviceTag : undefined}
          curtainUp={curtainOn}
          curtain={(size) => <Curtain project={project} scenarioId={scenario?.id} position={pos} cover={cover} onStart={() => void ctl.play({ fromStart: true })} theme={p.theme} font={look.font} width={size.width} height={size.height} animate={!ctl.reducedMotion} />}
        >
          {(size) => (
            <Stage
              viewportOverride={device === 'mobile' ? null : size}
              project={project}
              state={state!}
              theme={p.theme}
              font={p.font ?? null}
              stroke={p.stroke ?? null}
              camera={camera}
              sceneId={plan.sceneId}
              zoom={{ resetKey: zoomReset, onApi: onZoomApi, onChange: (v) => setUserZoom(v ? v.k : null) }}
              mode="demo"
              inspect={!!p.inspectMode && !!p.onInspect}
              selectedId={p.selectedId ?? null}
              preview={snap.preview}
              activeStep={snap.activeStep}
              stream={snap.streamAt ? { ...snap.streamAt, paused: snap.paused } : null}
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
        <div className="flex flex-1 items-center justify-center p-8 text-center font-jb text-[14px] text-jb-muted" data-testid="no-scene">
          {i18n.player.thisOptionHasNoStageToDisplayYet}</div>
      )}
      {hoverBox ? (
        <div className="pointer-events-none absolute z-10 border-[1.5px] border-dashed border-jb-ink" style={{ left: hoverBox.x - 3, top: hoverBox.y - 3, width: hoverBox.w + 6, height: hoverBox.h + 6 }} data-testid="inspect-hover">
          <span className="absolute -top-[22px] left-[-1.5px] whitespace-nowrap rounded-[4px] bg-jb-inverse px-1.5 py-0.5 font-jb text-[11px] font-medium text-jb-on-inverse">
            {hoverBox.type ?? i18n.player.element}{hoverBox.name ? ` · ${hoverBox.name}` : ''}
            <span className="ml-1.5 opacity-60">{i18n.player.clickToSelect}</span>
          </span>
        </div>
      ) : null}
      {completed && !full && !video ? (
        <div className="absolute bottom-3 right-3 z-30 flex items-center gap-2" data-testid="complete-actions">
          <Btn icon={<RotateCcw className="size-4" />} label={i18n.player.replay} onClick={() => ctl.togglePlay()} data-testid="replay" />
          {p.completeAction}
          <AuthorLink author={p.author} />
        </div>
      ) : null}
      {p.flash ? (
        <div role="status" className="jb-tip absolute left-1/2 top-3 z-20 -translate-x-1/2 whitespace-nowrap px-3 py-2 text-[13px]" data-testid="flash">
          {p.flash}
        </div>
      ) : null}
      {p.stageOverlay?.(shownScene?.id ?? null)}
      {/* 下一章倒计时（连续播放）；手机视图由 WatchView 自己放 */}
      {!video ? <UpNextCard ctl={ctl} snap={snap} variant="corner" /> : null}
    </div>
  );
  const stageArea = renderStage(false);

  if (p.watch && phone.layout)
    return (
      <WatchView
        layout={phone.layout}
        viewport={{ w: phone.w, h: phone.h }}
        ctl={ctl}
        snap={snap}
        scenario={scenario}
        subtitle={subtitle}
        stage={renderStage(true)}
        title={p.watch.title}
        brand={<Brand onClick={p.onBrand} href={p.brandHref} />}
        chapters={p.watch.chapters}
        onChapter={p.watch.onChapter}
        onRestart={p.watch.onRestart}
        author={<AuthorLink author={p.author} />}
        actions={<><AuthorLink author={p.author} /><LanguageMenu iconOnly />{p.actions}</>}
        voice={p.voice}
        flash={p.flash}
      />
    );

  if (full)
    return (
      // 全屏：画面 / 字幕 / 控制条三段，上下排列。控制条那一行（64px）始终保留：淡出时只是变透明，画面与镜头尺寸不变、不跳动
      <div ref={rootRef} className="jb-dark flex h-screen w-screen flex-col bg-jb-app" data-view={snap.view} data-fullscreen="" onMouseMove={idle.poke} style={idle.visible ? undefined : { cursor: 'none' }}>
        <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden px-[6%] pb-6 pt-8" data-inspecting={inspecting ? '' : undefined} data-layer={useCam ? viewLayer : undefined} data-director={useCam ? (director ? 'on' : 'off') : undefined}>
          {stageArea}
          {completed ? <div className="flex justify-end"><AuthorLink author={p.author} /></div> : null}
          {hasStage ? (
            <div className={cn('absolute right-3 top-3 z-10 transition-opacity duration-300', idle.visible ? 'opacity-100' : 'pointer-events-none opacity-0')}>
              <div className="flex items-center gap-0.5 rounded-[8px] border border-jb-line bg-jb-surface p-0.5" role="group" aria-label={i18n.player.zoom} data-testid="zoom-bar">
                <Btn icon={<Minus className="size-4" />} label={i18n.player.zoomOut} iconOnly variant="ghost" size={28} onClick={zoomOut} data-testid="zoom-out" />
                <Btn icon={<Maximize className="size-3.5" />} label={i18n.player.fit} iconOnly variant="ghost" size={28} onClick={fit} disabled={userZoom === null} data-testid="zoom-fit" />
                <Btn icon={<Plus className="size-4" />} label={i18n.player.zoomIn} iconOnly variant="ghost" size={28} onClick={zoomIn} data-testid="zoom-in" />
              </div>
            </div>
          ) : null}
        </main>
        {scenario ? <Subtitle content={subtitle} theme={p.theme} font={look.font} onFork={(f) => ctl.setScenario(f.scenarioId, f.at)} framed dark /> : null}
        <div ref={barRowRef} className="relative flex h-16 shrink-0 items-center justify-center px-6">
          {scenario ? (
            <div className={cn('flex max-w-full justify-center transition-opacity duration-300', idle.visible ? 'opacity-100' : 'pointer-events-none opacity-0')} data-visible={idle.visible ? '' : undefined} onMouseMove={idle.poke}>
              <FullscreenBar snap={snap} scenario={scenario} ctl={ctl} speed={speed} onSpeed={p.onSpeed} layers={useCam ? layers : []} viewLayer={viewLayer} director={director} onLayer={(id) => p.onLayer(id)} onDirector={toggleDirector} onExit={toggleFull} avail={barRowW - 48 - (barRowW >= 1280 ? 2 * 300 : 0)} actions={p.fullscreenVoice || p.fullscreenActions ? <>{p.fullscreenVoice}{p.fullscreenActions}</> : undefined} />
            </div>
          ) : null}
          {/* 快捷键提示（宽屏时在右侧，随控制条一起淡出） */}
          {barRowW >= 1280 ? (
            <div className={cn('absolute right-6 top-1/2 flex -translate-y-1/2 items-center gap-3 font-jb text-[11px] text-jb-faint transition-opacity duration-300', idle.visible ? 'opacity-100' : 'opacity-0')} aria-hidden data-testid="fs-hints">
              {[
                [i18n.player.space, i18n.player.play],
                ['← →', i18n.player.step2],
                ...(p.fullscreenActions ? [['T', i18n.player.appearance]] : []),
                ['Esc', i18n.player.exit],
              ].map(([k, t]) => (
                <span key={k} className="inline-flex items-center gap-1">
                  <Kbd className="h-4 min-w-4 px-1 text-[10px]">{k}</Kbd>
                  {t}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        {p.drawer}
      </div>
    );

  return (
    <div ref={rootRef} className="relative flex h-full flex-col overflow-hidden bg-jb-app font-jb text-jb-fg" data-view={snap.view} data-layout={L.wide ? 'wide' : L.rail ? 'rail' : 'narrow'}>
      <TopBar
        right={
          <>
            {!p.onInspect ? <LanguageMenu iconOnly={L.languageIconOnly} /> : null}
            <AuthorLink author={p.author} />
            {p.actions}
            {p.onInspect ? <LanguageMenu iconOnly={L.languageIconOnly} /> : null}
            {p.menu.length ? <MenuButton trigger={{ icon: p.exportBadge && !L.topLabels ? p.exportBadge : p.menuLabel ? <Ellipsis className="size-4" /> : <Share className="size-4" />, label: p.menuLabel ?? i18n.player.export, iconOnly: !L.topLabels, extra: L.topLabels ? p.exportBadge : null }} label={p.menuLabel ?? i18n.player.export} testid="more-menu" items={p.menu} placement="bottom-end" width={240} /> : null}
            <Btn
              icon={<Expand className="size-4" />}
              label={i18n.player.fullscreen}
              kbd="F"
              iconOnly
              onClick={(e) => {
                e.currentTarget.blur();
                toggleFull();
              }}
              data-testid="fullscreen"
            />
          </>
        }
      >
        <Brand onClick={p.onBrand} href={p.brandHref} />
        <span aria-hidden className="h-5 w-px shrink-0 bg-jb-line" />
        <Breadcrumbs crumbs={p.crumbs} />
      </TopBar>
      <div className="flex min-h-0 flex-1">
        {L.rail ? (
          // 窄屏（< 1100）：左栏收成 56px 竖条；点竖条或按 [ 浮出完整左栏，选完自动收回
          <aside className="flex w-14 shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-jb-line bg-jb-surface py-3" data-testid="left-nav" data-rail="">
            <Btn icon={<PanelLeftOpen className="size-4" />} label={i18n.player.expandSidebar} kbd="[" iconOnly variant="ghost" size={32} selected={railOpen} onClick={() => setRailOpen((v) => !v)} data-testid="rail-open" tipPlacement="bottom-start" />
            <button type="button" className="flex w-full flex-1 flex-col items-center gap-1 pt-1" onClick={() => setRailOpen(true)} aria-label={i18n.player.expandSidebar}>
              {p.navRail}
            </button>
          </aside>
        ) : (
          <aside className="flex shrink-0 flex-col overflow-y-auto border-r border-jb-line bg-jb-surface px-3 py-4" style={{ width: L.navWidth }} data-testid="left-nav">
            {p.nav}
          </aside>
        )}
        {L.rail && railOpen ? (
          <aside
            className="jb-pop absolute bottom-3 left-[64px] top-[60px] z-30 flex w-[276px] flex-col overflow-y-auto px-3 py-4"
            data-testid="left-nav-float"
            onClickCapture={(e) => {
              // 选完自动收回（点到了按钮）
              if ((e.target as HTMLElement).closest('button')) setTimeout(() => setRailOpen(false), 0);
            }}
          >
            {p.nav}
          </aside>
        ) : null}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-2.5 overflow-hidden px-4 py-3" data-inspecting={inspecting ? '' : undefined}>
          {p.banner}
          {snap.playbackError ? (
            <div role="alert" className="shrink-0 rounded-[8px] border border-jb-danger bg-jb-danger-bg px-3 py-2 text-[13px] text-jb-danger" data-testid="playback-error">
              <strong>{i18n.player.demoReplayFailed}</strong>
              {translate(snap.playbackError, i18n)}
            </div>
          ) : null}
          <div className="flex min-h-0 flex-1 flex-col">
            {hasLayerBar ? <LayerTabs layers={layers.map((l) => ({ ...l, role: roleOfScene(project, l.sceneId) }))} viewLayer={viewLayer} director={director} onLayer={(id) => p.onLayer(id)} onDirector={(on) => p.onLayer(on ? null : viewLayer)} onReplay={replayLayer} /> : null}
            {/* 舞台框：画面和字幕合成一体（1.5px 墨线，圆角 10）；字幕区跟随舞台主题 */}
            <div className={cn('relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[10px] border-[1.5px] border-jb-ink bg-jb-surface', hasLayerBar && 'rounded-tl-none')} data-testid="stage-frame" data-layer={useCam ? viewLayer : undefined} data-director={useCam ? (director ? 'on' : 'off') : undefined}>
              {stageArea}
          {completed ? <div className="flex justify-end"><AuthorLink author={p.author} /></div> : null}
              {scenario ? <SubtitleSlot content={subtitle} theme={p.theme} font={look.font} onFork={(f) => ctl.setScenario(f.scenarioId, f.at)} explainInTip={L.explainInTip} narration={snap.narration} /> : null}
            </div>
          </div>
          <Dock snap={snap} scenario={scenario} ctl={ctl} speed={speed} onSpeed={p.onSpeed} L={L} zoom={dockZoom} voice={p.voice} />
        </main>
      </div>
      {p.drawer}
      <ShortcutsPanel open={keysOpen} onClose={() => setKeysOpen(false)} board={!!p.onInspect} />
    </div>
  );
}

/** 字幕区：< 900 时 explain 收进悬停（字幕区仍只读 --jp-*）。 */
function SubtitleSlot({ content, theme, font, explainInTip, onFork, narration }: { content: ReturnType<typeof subtitleFor>; theme: StageTheme; font: AppearanceFont | null; explainInTip: boolean; onFork: (fork: import('@joplo-app/core').Fork) => void; narration?: Snapshot['narration'] }) {
  const { t: i18n } = useI18n();
  const hidden = explainInTip && content?.explain ? content.explain : null;
  const [tip, tipNode] = useTip(hidden, { placement: 'top-start' });
  // 朗读（D74）：正在读这一步时右上角一个小喇叭；画面停够了还在等声音时写明
  const reading = narration && content && narration.position === content.index ? narration : null;
  return (
    <div {...tip} className="relative shrink-0" data-testid="subtitle-slot">
      <Subtitle content={hidden && content ? { ...content, explain: null, explainLines: 0 } : content} theme={theme} font={font} onFork={onFork} framed divider />
      {reading ? (
        <span className="pointer-events-none absolute left-3 top-1/2 inline-flex h-7 -translate-y-1/2 items-center gap-1.5 rounded-full border-[1.5px] border-jb-ink bg-jb-selected px-2.5 font-jb text-[13px] font-semibold text-jb-fg shadow-sm" data-testid="narrating" data-waiting={reading.waiting ? '1' : undefined} aria-live="polite">
          <AudioLines className="size-4 animate-pulse" aria-hidden />
          <span>{reading.waiting ? i18n.player.waitingForNarration : i18n.player.readingAloud}</span>
          {reading.fallback ? <span className="rounded-full bg-jb-sunken px-1.5 text-[11.5px] font-medium text-jb-muted" data-testid="narrating-browser">{i18n.player.browserVoiceFallback}</span> : null}
        </span>
      ) : null}
      {tipNode}
    </div>
  );
}

/** 快捷键面板（按 ?）：所有快捷键在一处。发布站没有检查、外观、竖条，不列出。 */
function ShortcutsPanel({ open, onClose, board }: { open: boolean; onClose: () => void; board: boolean }) {
  const { t: i18n } = useI18n();

  const groups = SHORTCUTS(i18n).map((g) => ({ ...g, items: g.items.filter((i) => board || ![i18n.player.holdOptionKey, 'T', '[', 'Enter'].includes(i.keys)) })).filter((g) => g.items.length);
  return (
    <CenterPanel open={open} onClose={onClose} label={i18n.player.keyboardShortcuts} testid="shortcuts" width={340}>
      <div className="flex items-center justify-between px-4 pb-1 pt-3.5 font-jb">
        <h2 className="text-[15px] font-bold">{i18n.player.keyboardShortcuts}</h2>
        <Kbd>?</Kbd>
      </div>
      <div className="flex flex-col gap-3 px-4 pb-4 pt-1 font-jb">
        {groups.map((g) => (
          <section key={g.group}>
            <div className="pb-1 text-[12px] font-semibold tracking-[1px] text-jb-muted">{g.group}</div>
            <ul className="flex flex-col">
              {g.items.map((i) => (
                <li key={i.label} className="flex h-7 items-center justify-between gap-3 text-[13px]">
                  <span>{i.label}</span>
                  <Kbd>{i.keys}</Kbd>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </CenterPanel>
  );
}
