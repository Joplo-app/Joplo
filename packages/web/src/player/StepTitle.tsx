import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CircleCheck, CircleX } from 'lucide-react';
import { useI18n } from '../i18n/context';
/**
 * 步骤标题条（D97）：左上角。标题变化时从小圆点展开成“步骤号 + 标题（+ 说明）”，停留一会儿后收回成小圆点；
 * 点小圆点再展开，再点一下或移开后收回。
 * - 停留按引擎时间计（暂停冻住、倍速跟随、视频录制一致）：展开 = 引擎时间距弹出不到 titleDwellMs；
 * - 手动展开、悬停是观众的界面操作，与时间线无关；
 * - 静态画面（截图、深链、分镜、导出图片）始终展开；
 * - 动画：外框用弹性尺寸过渡（layout），文字晚一点淡入；animate=false（reduced motion、静态画面）直接切换。
 */
import type { ClockSource } from '../runtime/clock';
import type { Fork } from '@joplo-app/core/runtime';
import { HUD_BG, HUD_FONT } from './Subtitle';
import { TITLE_CAPTION_PX, TITLE_EXPLAIN_PX, titleDwellMs, type StepTitle as StepTitleContent } from './subtitle-content';

const ACCENT = '#FFD43B';
const SPRING = { type: 'spring', stiffness: 520, damping: 40, mass: 0.8 } as const;
const NEVER = () => () => {};

/** 引擎时间距 key 出现时是否还不到 dwell 毫秒；没有时钟时返回 true（静态画面始终展开）。 */
function useAutoOpen(clock: ClockSource | undefined, key: string | null, dwell: number): boolean {
  // key 变化的那一刻记下引擎时间（渲染期读快照：同一 key 只记一次）
  const openedAt = useMemo(() => (clock && key ? clock.getSnapshot().timeMs : 0), [clock, key]);
  const subscribe = clock?.subscribe ?? NEVER;
  return useSyncExternalStore(subscribe, () => !clock || !key || clock.getSnapshot().timeMs - openedAt < dwell, () => true);
}

export function StepTitle({ title, clock, animate = true, staticMode = false, onFork }: { title: StepTitleContent | null; clock?: ClockSource; animate?: boolean; staticMode?: boolean; onFork?: (fork: Fork) => void }) {
  const { t: i18n } = useI18n();
  const key = title?.key ?? null;
  const auto = useAutoOpen(staticMode ? undefined : clock, key, titleDwellMs(title));
  // 观众的手动选择：open = 点开了，closed = 点收了；null = 跟着自动弹出。换一步时清掉。
  const [override, setOverride] = useState<'open' | 'closed' | null>(null);
  const leave = useRef<number | undefined>(undefined);
  useEffect(() => { setOverride(null); }, [key]);
  useEffect(() => () => window.clearTimeout(leave.current), []);
  const open = staticMode || override === 'open' || (override === null && auto);
  const toggle = useCallback(() => setOverride(open ? 'closed' : 'open'), [open]);
  // 手动点开的：鼠标移开一会儿后收回
  const onLeave = () => {
    if (override !== 'open') return;
    window.clearTimeout(leave.current);
    leave.current = window.setTimeout(() => setOverride('closed'), 900);
  };
  const onEnter = () => window.clearTimeout(leave.current);
  const layout = animate ? true : false;

  return (
    <div className="pointer-events-none absolute left-3 top-3 z-[19]" data-testid="step-title" data-open={title && open ? '1' : '0'}>
      <AnimatePresence initial={false}>
        {title ? (
          <motion.div
            key="step-title"
            layout={layout}
            onClick={toggle}
            onMouseEnter={onEnter}
            onMouseLeave={onLeave}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }}
            aria-expanded={open}
            aria-label={open ? i18n.player.hideStepTitle : i18n.player.showStepTitle}
            title={open ? undefined : title.caption}
            className="jb-focus pointer-events-auto cursor-pointer overflow-hidden text-white"
            style={{ background: HUD_BG, fontFamily: HUD_FONT, borderRadius: 12, WebkitFontSmoothing: 'antialiased' }}
            initial={animate ? { opacity: 0, scale: 0.6 } : false}
            animate={{ opacity: 1, scale: 1 }}
            exit={animate ? { opacity: 0, scale: 0.6 } : { opacity: 0, transition: { duration: 0 } }}
            transition={animate ? { layout: SPRING, default: { duration: 0.2 } } : { duration: 0 }}
            data-step-title-key={title.key}
          >
            {open ? (
              <motion.div layout={layout ? 'position' : false} className="flex max-w-[min(440px,calc(100vw-48px))] flex-col gap-[3px] px-3.5 py-2" data-testid="step-title-body">
                <motion.div className="flex min-w-0 items-center gap-2" initial={animate ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ duration: 0.18, delay: animate ? 0.08 : 0 }}>
                  {title.done ? (
                    title.done.outcome === 'success' ? <CircleCheck className="size-[18px] shrink-0" style={{ color: ACCENT }} aria-hidden /> : <CircleX className="size-[18px] shrink-0 text-[#FF8A80]" aria-hidden />
                  ) : title.index > 0 ? (
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-[#1D1D1F]" style={{ background: ACCENT }} aria-hidden>{title.index}</span>
                  ) : null}
                  <span className="min-w-0 truncate font-semibold" style={{ fontSize: TITLE_CAPTION_PX, lineHeight: 1.35 }} title={title.done?.title ?? title.caption} data-testid="step-title-caption">{title.caption}</span>
                </motion.div>
                {title.explain ? (
                  <motion.div className="line-clamp-2 text-white/70" style={{ fontSize: TITLE_EXPLAIN_PX, lineHeight: 1.45 }} initial={animate ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ duration: 0.18, delay: animate ? 0.12 : 0 }} data-testid="step-title-explain">
                    {title.explain}
                  </motion.div>
                ) : null}
                {title.forks?.length ? (
                  <motion.div className="mt-1 flex flex-wrap gap-1.5" initial={animate ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ duration: 0.18, delay: animate ? 0.14 : 0 }} aria-label={i18n.player.otherStoryRoutes}>
                    {title.forks.map((fork, i) =>
                      onFork ? (
                        <button key={i} type="button" onClick={(e) => { e.stopPropagation(); onFork(fork); }} title={i18n.player.switchScenario(fork.label)} className="jb-focus max-w-[200px] truncate rounded-full border border-white/30 px-2 py-0.5 text-[12px] text-white/90 hover:bg-white/15">
                          ↳ {fork.label}
                        </button>
                      ) : (
                        <span key={i} className="max-w-[200px] truncate rounded-full border border-white/30 px-2 py-0.5 text-[12px] text-white/90">↳ {fork.label}</span>
                      ),
                    )}
                  </motion.div>
                ) : null}
              </motion.div>
            ) : (
              <motion.span layout={layout ? 'position' : false} className="flex size-6 items-center justify-center" data-testid="step-title-dot">
                <span className="size-2.5 rounded-full" style={{ background: ACCENT, boxShadow: '0 0 0 3px rgba(255, 212, 59, 0.25)' }} />
              </motion.span>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
