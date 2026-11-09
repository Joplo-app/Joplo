/**
 * 手机上像看视频一样看分享（mobile_watch，已在 examples/joplo 里确认）。只在发布站、且设备是手机时使用：
 * - 竖屏：精简顶栏；16:10 的画面（舞台按设计尺寸整体缩放，不按手机宽度重排）；完整字幕；一行控制条；章节列表；
 * - 横屏（手机横过来，或点「横屏」）：舞台、字幕与独立控制条；D88 起舞台手势归原型，不再覆盖滑动切步层；
 * - 「横屏」：浏览器支持时请求全屏并锁定横向；iPhone 的 Safari 不能让网页全屏、也不能锁方向，就把画面转 90° 铺满，
 *   手机还竖着时提示把手机横过来；手机真的横过来后不再旋转。
 * 连续播放（一章接一章）由控制器的 autoNext 负责，发布站设置。
 */
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, CirclePlay, Pause, Play, RotateCcw, RectangleHorizontal, X } from 'lucide-react';
import type { Scenario } from '@joplo-app/core/runtime';
import type { DemoController, Snapshot } from '../runtime/demo';
import { useI18n } from '../i18n/context';
import { cn } from '@/lib/utils';
import type { SpokenSubtitle } from './subtitle-content';
import { phoneLayout } from './watch';
import { ROTATED_ATTR } from '../renderer/rect';

/** no：影片（D102）章节的两位编号，支线为 null；功能演示的场景没有这个字段。steps：右侧小字（场景写步数，影片写时长）。 */
export type Chapter = { id: string; name: string; current: boolean; steps: string; no?: string | null };

/** 视口尺寸与是否是手机（粗指针、短边 < 600）；enabled = false 时总是 null。 */
export function usePhoneLayout(enabled: boolean) {
  const read = () => (typeof window === 'undefined' ? { w: 0, h: 0, coarse: false } : { w: window.innerWidth, h: window.innerHeight, coarse: window.matchMedia?.('(pointer: coarse)').matches === true });
  const [v, setV] = useState(read);
  useEffect(() => {
    if (!enabled) return;
    const on = () => setV(read());
    window.addEventListener('resize', on);
    window.addEventListener('orientationchange', on);
    return () => {
      window.removeEventListener('resize', on);
      window.removeEventListener('orientationchange', on);
    };
  }, [enabled]);
  return { layout: enabled ? phoneLayout({ width: v.w, height: v.h, coarse: v.coarse }) : null, w: v.w, h: v.h };
}

type ScreenLock = ScreenOrientation & { lock?: (o: string) => Promise<void>; unlock?: () => void };

type Props = {
  layout: 'portrait' | 'landscape';
  viewport: { w: number; h: number };
  ctl: DemoController;
  snap: Snapshot;
  scenario: Scenario | null;
  subtitle: SpokenSubtitle | null;
  /** 舞台（视频式 StageViewport）。 */
  stage: ReactNode;
  title: string;
  brand: ReactNode;
  chapters: Chapter[];
  onChapter: (id: string) => void;
  /** 最后一章播完：从第一章重新看。 */
  onRestart: () => void;
  /** 顶栏右侧（语言、复制链接）。 */
  actions?: ReactNode;
  author?: ReactNode;
  voice?: ReactNode;
  flash?: ReactNode | null;
};

const HIDE_MS = 3000;
/** 刘海 / 圆角的安全区（发布站的 viewport 写了 viewport-fit=cover，页面铺满整块屏幕，内容自己避开）。 */
const SAFE_X = { paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)' };
const SAFE_ALL = { ...SAFE_X, paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' };

/** 横屏时把整页背景也换成黑色：旋转过程中、安全区里都不露出页面原本的颜色。 */
function useBlackPage(on: boolean) {
  useEffect(() => {
    if (!on) return;
    const els = [document.documentElement, document.body];
    const prev = els.map((e) => e.style.background);
    els.forEach((e) => (e.style.background = '#000'));
    return () => els.forEach((e, i) => (e.style.background = prev[i]!));
  }, [on]);
}

export function WatchView(p: Props) {
  const { t: i18n } = useI18n();
  const { ctl, snap, scenario } = p;
  // 点了「横屏」：安卓等请求全屏并锁定横向；锁不住（iPhone）时手机还竖着，就把画面转过来
  const [forced, setForced] = useState(false);
  const immersive = p.layout === 'landscape' || forced;
  const rotated = forced && p.layout === 'portrait';
  useEffect(() => {
    const on = () => {
      if (!document.fullscreenElement && forced && p.layout === 'landscape') setForced(false);
    };
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, [forced, p.layout]);
  const enter = async () => {
    setForced(true);
    if (!snap.playing) void ctl.play();
    try {
      if (document.fullscreenEnabled && !document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      await (screen.orientation as ScreenLock | undefined)?.lock?.('landscape');
    } catch {
      /* iPhone 等：不能全屏或锁方向，退回旋转画面 */
    }
  };
  const exit = () => {
    setForced(false);
    try {
      (screen.orientation as ScreenLock | undefined)?.unlock?.();
    } catch {
      /* 没锁过 */
    }
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  };

  const pos = snap.state?.position ?? 0;
  const total = scenario?.steps.length ?? 0;
  const playing = snap.playing && !snap.paused;
  const chapterIndex = p.chapters.findIndex((c) => c.current);
  const isLast = chapterIndex === p.chapters.length - 1;
  // 影片：“第 n / N 章”只数有编号的章节，支线写“支线”；功能演示按列表位置（不变）
  const numbered = p.chapters.filter((c) => c.no);
  const film = p.chapters.some((c) => c.no !== undefined);
  const cur = p.chapters[chapterIndex];
  const finished = !!scenario && !snap.playing && total > 0 && (!!snap.state?.completed || pos >= total) && isLast;
  const progress = total ? Math.round((pos / total) * 100) : 0;
  const chapterLabel = chapterIndex < 0 ? '' : !film ? i18n.player.watchChapterOf(chapterIndex + 1, p.chapters.length) : cur?.no ? i18n.player.watchChapterOf(numbered.indexOf(cur) + 1, numbered.length) : i18n.player.sideChapter;
  // 封面、过渡卡这一步没有字幕（画面上已经是大字）：竖屏时显示“第几章 · 章节名”，不让字幕区空着
  const spoken = p.subtitle?.text ?? '';
  const caption = spoken || (scenario ? [chapterLabel, scenario.name].filter(Boolean).join(' · ') : '');

  if (immersive)
    return (
      <Immersive
        snap={snap}
        rotated={rotated}
        viewport={p.viewport}
        ctl={ctl}
        playing={playing}
        caption={spoken}
        stage={p.stage}
        title={scenario?.name ?? p.title}
        chapter={chapterLabel}
        progress={progress}
        voice={p.voice}
        canExit={forced}
        onExit={exit}
        finished={finished}
        onRestart={p.onRestart} author={p.author}
      />
    );

  return (
    <div className="flex h-full flex-col overflow-hidden bg-jb-app font-jb text-jb-fg" style={SAFE_X} data-testid="watch-portrait">
      <header className="flex shrink-0 items-center gap-2 border-b border-jb-line bg-jb-surface px-3" style={{ paddingTop: 'env(safe-area-inset-top)', height: 'calc(48px + env(safe-area-inset-top))' }}>
        {p.brand}
        <span className="min-w-0 flex-1 truncate text-[14px] font-semibold" data-testid="watch-title">{p.title}</span>
        {p.actions}
      </header>
      <div className="relative w-full shrink-0 bg-black" style={{ aspectRatio: '16 / 10' }} data-testid="watch-video">
        <div className="absolute inset-0 flex flex-col">{p.stage}</div>
        {finished ? <Finished onRestart={p.onRestart} author={p.author} /> : null}
        <UpNextCard ctl={ctl} snap={snap} variant="center" />
      </div>
      <p className="min-h-[52px] shrink-0 px-4 pt-3 text-[15px] font-semibold leading-[1.45]" data-testid="watch-caption" aria-live="polite">
        {caption}
      </p>
      <div className="flex shrink-0 items-center gap-1.5 px-3 py-2" data-testid="watch-controls">
        <RoundBtn label={i18n.player.previousStep} onClick={() => ctl.prev()} disabled={!scenario || (pos === 0 && !snap.busy)} testid="watch-prev">
          <ChevronLeft className="size-5" />
        </RoundBtn>
        <RoundBtn label={playing ? i18n.player.pause : i18n.player.play} onClick={() => ctl.togglePlay()} disabled={!scenario || total === 0} testid="watch-play" primary>
          {playing ? <Pause className="size-5" /> : <Play className="size-5" />}
        </RoundBtn>
        <RoundBtn label={i18n.player.nextStep} onClick={() => void ctl.next()} disabled={!scenario || total === 0} testid="watch-next">
          <ChevronRight className="size-5" />
        </RoundBtn>
        <div className="mx-1 h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-jb-line" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label={`${pos} / ${total}`}>
          <div className="h-full rounded-full bg-jb-ink transition-[width] duration-300" style={{ width: `${progress}%` }} />
        </div>
        {p.voice}
        <button type="button" onClick={() => void enter()} className="jb-focus inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[8px] bg-jb-inverse px-3 text-[13px] font-semibold text-jb-on-inverse" data-testid="watch-landscape">
          <RectangleHorizontal className="size-4" />
          {i18n.player.watchLandscape}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto border-t border-jb-line px-2 pb-6 pt-2" data-testid="watch-chapters">
        {/* 影片（D102）：有编号的章节一组、支线一组（标题写“支线”）；功能演示是一组（不变） */}
        {(film ? [{ key: 'main', title: i18n.player.watchChapters, list: numbered }, { key: 'side', title: i18n.player.sideChapters, list: p.chapters.filter((c) => !c.no) }] : [{ key: 'main', title: i18n.player.watchChapters, list: p.chapters }])
          .filter((g) => g.key === 'main' || g.list.length > 0)
          .map((g) => {
            const body = (
              <>
              <div className="px-2 pb-1 text-[12px] font-semibold tracking-[1px] text-jb-muted">
                {g.title} · {g.list.length}
              </div>
              <ul className="flex flex-col gap-0.5">
                {g.list.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => p.onChapter(c.id)}
                      aria-current={c.current ? 'true' : undefined}
                      className={cn('jb-focus flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-2.5 text-left text-[14px]', c.current ? 'bg-jb-selected font-semibold' : 'active:bg-jb-hover')}
                      data-testid={`watch-chapter-${c.id}`}
                    >
                      {c.no ? (
                        <span className="w-5 shrink-0 font-jb-mono text-[12px] font-bold text-jb-muted" data-testid="chapter-no">{c.no}</span>
                      ) : (
                        <CirclePlay className={cn('size-4 shrink-0', c.current ? 'text-jb-fg' : 'text-jb-muted')} aria-hidden />
                      )}
                      <span className={cn('min-w-0 flex-1', film && '[overflow-wrap:anywhere]')}>{c.name}</span>
                      <span className="shrink-0 text-[11px] font-normal text-jb-faint">{c.steps}</span>
                    </button>
                  </li>
                ))}
              </ul>
              </>
            );
            // 功能演示的 DOM 不变：主列表不额外包一层
            return g.key === 'side' ? <div key={g.key} className="pt-3" data-testid="watch-side-chapters">{body}</div> : <Fragment key={g.key}>{body}</Fragment>;
          })}
      </div>
      {p.flash ? (
        <div role="status" className="jb-tip fixed left-1/2 top-14 z-30 -translate-x-1/2 whitespace-nowrap px-3 py-2 text-[13px]">
          {p.flash}
        </div>
      ) : null}
    </div>
  );
}

function RoundBtn({ label, onClick, disabled, testid, primary, children }: { label: string; onClick: () => void; disabled?: boolean; testid: string; primary?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn('jb-focus inline-flex size-10 shrink-0 items-center justify-center rounded-full disabled:opacity-40', primary ? 'bg-jb-accent text-jb-on-accent' : 'text-jb-fg active:bg-jb-hover')}
      data-testid={testid}
    >
      {children}
    </button>
  );
}

function Finished({ onRestart, dark, author }: { onRestart: () => void; dark?: boolean; author?: ReactNode }) {
  const { t: i18n } = useI18n();
  return (
    <div className={cn('absolute inset-0 z-20 flex flex-col items-center justify-center gap-3', dark ? 'bg-black/70' : 'bg-black/65')} data-testid="watch-finished">
      <div className="text-[18px] font-bold text-white">{i18n.player.watchFinished}</div>
      {author}
      <button type="button" onClick={onRestart} className="jb-focus inline-flex h-10 items-center gap-2 rounded-full bg-white px-5 text-[14px] font-semibold text-black" data-testid="watch-again">
        <RotateCcw className="size-4" />
        {i18n.player.watchAgain}
      </button>
    </div>
  );
}

/** 横屏沉浸：铺满屏幕的黑底舞台；字幕在下方（黑边放得下就落在黑边里，否则叠在画面底部）；手势层在舞台之上，控件层在最上面。 */
function Immersive(p: {
  snap: Snapshot;
  rotated: boolean;
  viewport: { w: number; h: number };
  ctl: DemoController;
  playing: boolean;
  caption: string;
  stage: ReactNode;
  title: string;
  chapter: string;
  progress: number;
  voice?: ReactNode;
  canExit: boolean;
  onExit: () => void;
  finished: boolean;
  author?: ReactNode;
  onRestart: () => void;
}) {
  const { t: i18n } = useI18n();
  useBlackPage(true);
  const box = p.rotated
    ? { position: 'fixed' as const, left: 0, top: 0, width: p.viewport.h, height: p.viewport.w, transform: `translateX(${p.viewport.w}px) rotate(90deg)`, transformOrigin: 'top left' }
    : { position: 'fixed' as const, inset: 0 };
  return (
    <div className="z-50 flex flex-col overflow-hidden bg-black font-jb text-white" style={box} data-testid="watch-immersive" data-rotated={p.rotated ? '' : undefined} {...(p.rotated ? { [ROTATED_ATTR]: '' } : {})}>
      <header className="flex h-11 shrink-0 items-center gap-2 px-3" style={p.rotated ? undefined : SAFE_X}>
        {p.canExit ? <button type="button" aria-label={i18n.player.watchExitLandscape} onClick={p.onExit} className="jb-focus inline-flex size-9 items-center justify-center rounded-full active:bg-white/20" data-testid="watch-exit"><X className="size-5" /></button> : null}
        <div className="min-w-0 flex-1 truncate text-[13px] font-semibold">{p.title} <span className="font-normal text-white/70">{p.chapter}</span></div>
        <div className="[&_button]:text-white">{p.voice}</div>
      </header>
      <div className="relative flex min-h-0 flex-1 flex-col" style={p.rotated ? undefined : SAFE_X}>
        {p.stage}
        {p.finished ? <Finished onRestart={p.onRestart} author={p.author} dark /> : null}
        <UpNextCard ctl={p.ctl} snap={p.snap} variant="center" />
      </div>
      {/* D88: playback controls are siblings of Stage; no transparent swipe layer steals prototype gestures. */}
      <div role="toolbar" aria-label={i18n.player.playbackControls} className="flex min-h-14 shrink-0 items-center gap-3 bg-black px-3 py-2" style={p.rotated ? undefined : SAFE_X} data-testid="watch-overlay">
        <button type="button" aria-label={i18n.player.previousStep} onClick={() => p.ctl.prev()} className="jb-focus inline-flex size-9 shrink-0 items-center justify-center rounded-full active:bg-white/20" data-testid="watch-imm-prev"><ChevronLeft className="size-6" /></button>
        <button type="button" aria-label={p.playing ? i18n.player.pause : i18n.player.play} onClick={() => p.ctl.togglePlay()} className="jb-focus inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-black" data-testid="watch-imm-play">{p.playing ? <Pause className="size-5" /> : <Play className="size-5" />}</button>
        <button type="button" aria-label={i18n.player.nextStep} onClick={() => void p.ctl.next()} className="jb-focus inline-flex size-9 shrink-0 items-center justify-center rounded-full active:bg-white/20" data-testid="watch-imm-next"><ChevronRight className="size-6" /></button>
        <div className="min-w-0 flex-1"><p className="truncate text-[13px]" data-testid="watch-immersive-caption">{p.caption}</p><div className="mt-2 h-1 overflow-hidden rounded-full bg-white/30"><div className="h-full rounded-full bg-jb-accent" style={{width:`${p.progress}%`}} /></div></div>
      </div>
    </div>
  );
}

/**
 * 下一章倒计时（连续播放时两章之间，约 3 秒）：显示下一章的名字和剩余秒数，可以立即播放或取消。
 * corner：电脑上叠在舞台右下角；center：手机上盖在画面中间。
 */
export function UpNextCard({ ctl, snap, variant }: { ctl: DemoController; snap: Snapshot; variant: 'corner' | 'center' }) {
  const { t: i18n } = useI18n();
  const up = snap.upNext;
  if (!up) return null;
  const name = snap.project?.scenarios[up.scenarioId]?.name ?? '';
  const card = (
    <div className="flex w-[300px] max-w-[86%] flex-col gap-2 rounded-[12px] bg-black/85 p-4 font-jb text-white shadow-lg" role="status" aria-live="polite" data-testid="up-next">
      <div className="text-[12px] font-semibold tracking-[1px] text-white/70">
        {i18n.player.upNextTitle} · {i18n.player.upNextIn(up.left)}
      </div>
      <div className="line-clamp-2 text-[17px] font-bold leading-[1.35]">{name}</div>
      <div className="mt-1 flex gap-2">
        <button type="button" onClick={() => ctl.playNextNow()} className="jb-focus inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full bg-white px-3 text-[14px] font-semibold text-black" data-testid="up-next-now">
          <Play className="size-4" />
          {i18n.player.upNextPlayNow}
        </button>
        <button type="button" onClick={() => ctl.cancelNext()} className="jb-focus inline-flex h-9 items-center justify-center rounded-full px-4 text-[14px] font-semibold text-white/85 ring-1 ring-white/40" data-testid="up-next-cancel">
          {i18n.player.upNextCancel}
        </button>
      </div>
    </div>
  );
  return variant === 'corner' ? (
    <div className="absolute bottom-4 right-4 z-40">{card}</div>
  ) : (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/45">{card}</div>
  );
}
