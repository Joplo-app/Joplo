import { AnimatePresence, motion } from 'motion/react';
import { AudioLines } from 'lucide-react';
import { useI18n } from '../i18n/context';
/**
 * 字幕（D97，修订 D61）：浮在画面底部正中，只放“正在说的话”（旁白、角色台词，或兜底的标题）。
 * 半透明黑底白字、系统字体、17px，一到两行，宽度跟着字数走。不可点击，不挡画面里的操作。
 * 换一句时淡出旧的、从下方轻轻浮起新的；reduced motion 与静态画面（截图、导出图片）直接切换。
 * 看板、发布站、全屏、嵌入、截图、导出图片与视频共用。
 */
import { RoleAvatar } from './RoleAvatar';
import { SUBTITLE_AVATAR_PX, SUBTITLE_PX, SUBTITLE_SPEAKER_PX, type SpokenSubtitle } from './subtitle-content';

export const HUD_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Segoe UI", Roboto, sans-serif';
export const HUD_BG = 'rgba(0, 0, 0, 0.55)';

export type Narrating = { waiting: boolean; fallback: boolean } | null;

export function Subtitle({ content, animate = true, narrating = null, bottom = 24 }: { content: SpokenSubtitle | null; animate?: boolean; /** 正在朗读这一句（D74）：左侧小喇叭（不写“等旁白读完”之类的文字）。 */ narrating?: Narrating; bottom?: number }) {
  const { t: i18n } = useI18n();
  const key = content ? `${content.index}:${content.text}` : 'none';
  return (
    <div className="pointer-events-none absolute inset-x-0 z-[18] flex justify-center px-6" style={{ bottom }} data-testid="subtitle" data-jsubtitle="" aria-live="polite">
      <AnimatePresence mode="popLayout" initial={false}>
        {content ? (
          <motion.div
            key={key}
            className="flex max-w-[min(860px,100%)] items-center gap-2.5 rounded-[10px] px-6 py-[10px] text-white"
            style={{ background: HUD_BG, fontFamily: HUD_FONT, WebkitFontSmoothing: 'antialiased' }}
            initial={animate ? { opacity: 0, y: 6 } : false}
            animate={{ opacity: 1, y: 0 }}
            exit={animate ? { opacity: 0, transition: { duration: 0.12 } } : { opacity: 0, transition: { duration: 0 } }}
            transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
            data-source={content.source}
            data-index={content.index}
          >
            {narrating ? (
              <span className="flex shrink-0 items-center gap-1.5 text-white/75" data-testid="narrating" data-waiting={narrating.waiting ? '1' : undefined} title={narrating.fallback ? i18n.player.browserVoiceFallback : i18n.player.readingAloud}>
                <AudioLines className="size-4 animate-pulse" aria-label={i18n.player.readingAloud} />
              </span>
            ) : null}
            {content.speaker ? (
              <span className="flex shrink-0 items-center gap-1.5" data-testid="subtitle-speaker" data-role={content.speaker.id}>
                <RoleAvatar role={content.speaker} size={SUBTITLE_AVATAR_PX} />
                <span className="text-white/70" style={{ fontSize: SUBTITLE_SPEAKER_PX }}>{content.speaker.name}</span>
              </span>
            ) : null}
            <span className="min-w-0 text-center [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden" style={{ fontSize: SUBTITLE_PX, lineHeight: 1.45 }} title={content.text} data-jsubtitle-text="">
              {content.text}
            </span>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
