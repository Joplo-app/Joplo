/**
 * 字幕区（画面下方、播放控制上方）：固定高度 SUBTITLE_HEIGHT，宽度占满；字体跟随舞台主题
 * （sketch：Excalifont + 小赖；clean：系统字体）。演示页、发布站、renderStep 截图、导出图片与视频共用。
 */
import { SUBTITLE_HEIGHT } from '@tokenroll/joplo-core';
import type { StageTheme } from '../renderer/rough';
import { SUBTITLE_CAPTION_PX, SUBTITLE_EXPLAIN_PX, type SubtitleContent } from './subtitle-content';

const clamp = (lines: number) => ({ display: '-webkit-box', WebkitLineClamp: lines, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' });

export function Subtitle({ content, theme, width, framed = false }: { content: SubtitleContent | null; theme: StageTheme; width?: number | string; framed?: boolean }) {
  return (
    <div
      className={`jsubtitle flex shrink-0 flex-col justify-center overflow-hidden bg-white px-5 ${framed ? '' : 'rounded-lg border'}`}
      style={{ height: SUBTITLE_HEIGHT, width: width ?? '100%' }}
      data-theme={theme}
      data-testid="subtitle"
      data-jsubtitle=""
      title={content?.title}
      aria-live="polite"
    >
      {content ? (
        <>
          <div className="text-[#1e1e1e]" style={{ fontSize: SUBTITLE_CAPTION_PX, lineHeight: 1.35, ...clamp(content.captionLines) }} data-jsubtitle-caption="">
            {content.kind === 'system' ? (
              <span className="mr-2 inline-block rounded bg-[#1c5fb8] px-1.5 align-middle text-[12px] leading-[20px] text-white" style={{ fontFamily: 'inherit' }}>
                系统
              </span>
            ) : null}
            {content.caption}
          </div>
          {content.explain ? (
            <div className="mt-1 text-[#495057]" style={{ fontSize: SUBTITLE_EXPLAIN_PX, lineHeight: 1.5, ...clamp(content.explainLines) }} data-jsubtitle-explain="">
              {content.explain}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
