import { useI18n } from '../i18n/context';
/**
 * 字幕区（画面下方、播放控制上方）：高度按内容自适应（subtitleHeight），宽度占满；字体跟随舞台主题
 * （sketch：Excalifont + 小赖；clean：系统字体）。右侧小标记是步数或“场景完成 · 模拟成功”。
 * 演示页、发布站、全屏、renderStep 截图、导出图片与视频共用；视频用固定高度（fixedHeight），画面尺寸不变。
 */
import { cn } from '@/lib/utils';
import type { Fork } from '@joplo-app/core';
import type { StageTheme } from '../renderer/rough';
import { fontStyle, type AppearanceFont } from '../renderer/appearance';
import { MOCK_CLS } from './labels';
import { SUBTITLE_CAPTION_PX, SUBTITLE_EXPLAIN_PX, SUBTITLE_PAD_Y, subtitleHeight, type SubtitleContent } from './subtitle-content';

const clamp = (lines: number) => ({ display: '-webkit-box', WebkitLineClamp: lines, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' });

export function Subtitle({ content, theme, width, framed = false, fixedHeight, dark = false, divider = false, font = null, onFork }: { content: SubtitleContent | null; onFork?: (fork: Fork) => void; theme: StageTheme; /** 字体（D55）：null = 跟随主题。 */ font?: AppearanceFont | null; width?: number | string; framed?: boolean; fixedHeight?: number; dark?: boolean; /** 上沿一条细线（看板的舞台框里，画面和字幕之间）。 */ divider?: boolean }) {
  const { t: i18n } = useI18n();
  const badge = content?.badge;
  return (
    <div
      className={cn('jsubtitle jtheme flex shrink-0 items-center gap-4 overflow-hidden px-4 text-[var(--jp-ink)]', dark ? 'bg-[var(--jp-bg)]' : 'bg-[var(--jp-surface)]', !framed && !dark && 'rounded-lg border border-[var(--jp-line)]', divider && 'border-t border-[var(--jp-line)]')}
      style={{ ...fontStyle(font), height: fixedHeight ?? subtitleHeight(content), width: width ?? '100%', paddingTop: SUBTITLE_PAD_Y, paddingBottom: SUBTITLE_PAD_Y }}
      data-theme={theme}
      data-font={font ?? undefined}
      data-testid="subtitle"
      data-jsubtitle=""
      title={content?.title}
      aria-live="polite"
    >
      {content ? (
        <>
          <div className="flex min-w-0 flex-1 flex-col justify-center">
            <div className="text-[var(--jp-ink)]" style={{ fontSize: SUBTITLE_CAPTION_PX, lineHeight: 1.35, ...clamp(content.captionLines) }} data-jsubtitle-caption="">
              {content.kind === 'system' ? <span className="mr-2 inline-block whitespace-nowrap rounded bg-[var(--jp-info)] px-1.5 align-[2px] text-[12px] leading-[20px] text-white">{i18n.player.system}</span> : null}
              {content.kind === 'card' ? <span className="mr-2 inline-block whitespace-nowrap rounded border border-[var(--jp-line-strong)] px-1.5 align-[2px] text-[12px] leading-[18px] text-[var(--jp-muted)]">{i18n.player.transition}</span> : null}
              {content.caption}
            </div>
            {content.explain ? (
              <div className="text-[var(--jp-muted)]" style={{ marginTop: 2, fontSize: SUBTITLE_EXPLAIN_PX, lineHeight: 1.5, ...clamp(content.explainLines) }} data-jsubtitle-explain="">
                {content.explain}
              </div>
            ) : null}
          </div>
          {content.forks?.length ? <div className="flex max-w-[36%] shrink-0 items-center gap-1.5 overflow-x-auto" aria-label={i18n.player.otherStoryRoutes}>
            {content.forks.map((fork, i) => onFork ? <button type="button" key={i} onClick={() => onFork(fork)} title={i18n.player.switchScenario(fork.label)} className="shrink-0 rounded-full border border-[var(--jp-line-strong)] px-2 py-1 text-[12px] hover:bg-[var(--jp-subtle)] focus-visible:outline-2 focus-visible:outline-[var(--jp-accent)]">↳ {fork.label}</button> : <span key={i} className="shrink-0 rounded-full border border-[var(--jp-line-strong)] px-2 py-1 text-[12px]">↳ {fork.label}</span>)}
          </div> : null}
          {badge ? (
            badge.kind === 'done' ? (
              <span role="status" title={badge.title} data-testid="complete-badge" className={cn('shrink-0 whitespace-nowrap rounded-full border px-2 py-1 text-[12px] leading-none', MOCK_CLS[badge.outcome])}>
                {badge.text}
              </span>
            ) : (
              <span data-testid="step-index" className={cn('shrink-0 whitespace-nowrap text-[12px]', 'text-[var(--jp-muted)]')}>
                {badge.text}
              </span>
            )
          ) : null}
        </>
      ) : null}
    </div>
  );
}
