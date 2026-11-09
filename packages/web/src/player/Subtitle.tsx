import { useI18n } from '../i18n/context';
/**
 * 字幕区（D61，画面下方、播放控制上方）：高度按内容自适应（subtitleHeight），宽度占满；字体与颜色跟随舞台主题（只读 --jp-*）。
 * 三栏：左空 │ 中间居中的字幕 │ 右侧标记。右栏至少是自己内容的宽度，左右平分剩下的空间，所以字幕在正中；
 * 右侧内容多（分叉标签、完成标记）或说明很长时，中间一栏先让出位置并截断（悬停看全文），任何时候都不重叠。
 * - 第一行：用户操作 = [说话人头像 + 名字（小一号、次级色）] 说明（正文色）；系统事件 = 小圆点（舞台高亮色、墨线描边）+ 说明（次级色）。
 * - 第二行：explain，居中、小一号、次级色。
 * - 右栏：分叉「↳ …」、场景完成的结果标记（取代进度），平时是右下角最弱字色的「n / m」。
 * 演示页、发布站、全屏、嵌入、renderStep 截图、导出图片与视频共用；视频用固定高度（fixedHeight），画面尺寸不变。
 */
import { cn } from '@/lib/utils';
import type { Fork } from '@joplo-app/core/runtime';
import type { StageTheme } from '../renderer/rough';
import { fontStyle, type AppearanceFont } from '../renderer/appearance';
import { JP_SECONDARY, RoleAvatar } from './RoleAvatar';
import { MOCK_CLS } from './labels';
import { SUBTITLE_AVATAR_PX, SUBTITLE_CAPTION_PX, SUBTITLE_EXPLAIN_PX, SUBTITLE_PAD_Y, SUBTITLE_PROGRESS_PX, SUBTITLE_SPEAKER_PX, subtitleHeight, type SubtitleContent } from './subtitle-content';

const CAPTION_LH = 1.35;

export function Subtitle({ content, theme, width, framed = false, fixedHeight, dark = false, divider = false, font = null, onFork }: { content: SubtitleContent | null; onFork?: (fork: Fork) => void; theme: StageTheme; /** 字体（D55）：null = 跟随主题。 */ font?: AppearanceFont | null; width?: number | string; framed?: boolean; fixedHeight?: number; dark?: boolean; /** 上沿一条细线（看板的舞台框里，画面和字幕之间）。 */ divider?: boolean }) {
  const { t: i18n } = useI18n();
  const badge = content?.badge;
  const system = content?.kind === 'system';
  return (
    <div
      className={cn('jsubtitle jtheme grid shrink-0 grid-cols-[minmax(0,1fr)_minmax(0,max-content)_minmax(max-content,1fr)] items-stretch gap-x-4 overflow-hidden px-6 text-[var(--jp-ink)]', dark ? 'bg-[var(--jp-bg)]' : 'bg-[var(--jp-surface)]', !framed && !dark && 'rounded-lg border border-[var(--jp-line)]', divider && 'border-t border-[var(--jp-line)]')}
      style={{ ...fontStyle(font), height: fixedHeight ?? subtitleHeight(content), width: width ?? '100%', paddingTop: SUBTITLE_PAD_Y, paddingBottom: SUBTITLE_PAD_Y }}
      data-theme={theme}
      data-font={font ?? undefined}
      data-testid="subtitle"
      data-jsubtitle=""
      data-kind={content?.kind}
      title={content?.title || undefined}
      aria-live="polite"
    >
      <span aria-hidden />
      <div className="flex min-w-0 flex-col items-center justify-center text-center">
        {content?.caption ? (
          <div className="flex min-w-0 max-w-full items-center" style={{ gap: system ? 10 : 12, height: Math.ceil(SUBTITLE_CAPTION_PX * CAPTION_LH) }} data-jsubtitle-caption="">
            {content.speaker ? (
              <span className="flex min-w-0 max-w-[9em] shrink-0 items-center gap-1.5" data-testid="subtitle-speaker" data-role={content.speaker.id}>
                <RoleAvatar role={content.speaker} size={SUBTITLE_AVATAR_PX} />
                <span className="truncate text-[var(--jp-muted)]" style={{ fontSize: SUBTITLE_SPEAKER_PX, lineHeight: 1.2 }}>
                  {content.speaker.name}
                </span>
              </span>
            ) : null}
            {system ? (
              <>
                <span aria-hidden className="size-2 shrink-0 rounded-full border border-[var(--jp-ink)] bg-[var(--jp-accent)]" data-testid="subtitle-dot" />
                <span className="sr-only">{i18n.player.system}</span>
              </>
            ) : null}
            <span className="min-w-0 truncate" style={{ fontSize: SUBTITLE_CAPTION_PX, lineHeight: CAPTION_LH, color: system ? JP_SECONDARY : 'var(--jp-ink)' }}>
              {content.caption}
            </span>
          </div>
        ) : null}
        {content?.explain ? (
          <div
            className="max-w-full truncate text-[var(--jp-muted)]"
            style={{ marginTop: content.caption ? 4 : 0, fontSize: SUBTITLE_EXPLAIN_PX, lineHeight: content.caption ? 1.5 : `${Math.ceil(SUBTITLE_CAPTION_PX * CAPTION_LH)}px` }}
            data-jsubtitle-explain=""
          >
            {content.explain}
          </div>
        ) : null}
      </div>
      <div className="flex min-w-0 items-center justify-end gap-2">
        {content?.forks?.length ? (
          <div className="flex max-w-[min(300px,28vw)] items-center gap-1.5 overflow-x-auto [scrollbar-width:none]" aria-label={i18n.player.otherStoryRoutes}>
            {content.forks.map((fork, i) => {
              const cls = 'max-w-[200px] shrink-0 truncate whitespace-nowrap rounded-full border border-[var(--jp-line-strong)] px-2 py-1 text-[12px] leading-none';
              return onFork ? (
                <button type="button" key={i} onClick={() => onFork(fork)} title={i18n.player.switchScenario(fork.label)} className={cn(cls, 'hover:bg-[var(--jp-subtle)] focus-visible:outline-2 focus-visible:outline-[var(--jp-accent)]')}>
                  ↳ {fork.label}
                </button>
              ) : (
                <span key={i} className={cls} title={fork.label}>
                  ↳ {fork.label}
                </span>
              );
            })}
          </div>
        ) : null}
        {badge ? (
          badge.kind === 'done' ? (
            <span role="status" title={badge.title} data-testid="complete-badge" className={cn('shrink-0 whitespace-nowrap rounded-full border px-2 py-1 text-[12px] leading-none', MOCK_CLS[badge.outcome])}>
              {badge.text}
            </span>
          ) : (
            <span data-testid="step-index" aria-label={badge.label} title={badge.label} className="shrink-0 self-end whitespace-nowrap font-[var(--jp-font-mono)] text-[var(--jp-faint)]" style={{ fontSize: SUBTITLE_PROGRESS_PX, lineHeight: 1 }}>
              {badge.text}
            </span>
          )
        ) : null}
      </div>
    </div>
  );
}
