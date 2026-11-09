import { useI18n } from '../i18n/context';
/**
 * 幕布（D61）：盖在整个舞台区域上的一层，不进设备外框（手机层也铺满舞台）。只有两种内容：
 * - 过渡卡（D56）：最近执行的一步是 card；整屏一句大字，用于开场、收尾、时间跳跃和换人；
 * - 场景封面：第 0 步、没在播放时（coverShown）；背景是这个场景第 0 步画面的模糊淡影加中心纸色渐变。
 * 内容都由「IR + 当前位置」推导（cardAt / coverFor），动画只用于展示。
 * 尺寸按设计稿（舞台宽 1132）：头像 64、身份 16、标题 40、副标题 20；封面标题 44、说明 19。
 * 舞台逻辑宽度小于 1132 时（导出的手机图片）按比例缩小，最小 0.7。
 * 不在 renderer/ 里：它画在舞台外（StageViewport / RenderApp 那一层）。文字与底色只读 --jp-*（跟随舞台主题）；
 * 所属与「约 N 步」这类小字、开始按钮是播放器的界面，用看板字体与主操作色（与嵌入封面的播放按钮一致）。
 */
// 幕布在舞台外（播放器外壳）：用浏览器时间的 Motion。封面是在“未播放”时渲染的，若绑引擎时钟，退场会沿用暂停时的
// skipAnimations，开播那一刻一帧消失（D92：胶片条与视频都量到了这处硬切）。
import { AnimatePresence, motion } from 'motion/react';
const noop = () => {};
import { Clapperboard, ListOrdered, Play, Timer, Users } from 'lucide-react';
import { cardAt, roleOf, type CardAction, type Project, type RoleInfo } from '@joplo-app/core/runtime';
import type { CoverContent, FilmCover } from './cover-content';
import { fontStyle, type AppearanceFont } from '../renderer/appearance';
import type { StageTheme } from '../renderer/rough';
import { JP_SECONDARY, RoleAvatar } from './RoleAvatar';

const DESIGN_WIDTH = 1132;
const clampLines = (lines: number) => ({ display: '-webkit-box', WebkitLineClamp: lines, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden', overflowWrap: 'anywhere' as const, textWrap: 'balance' as const });

/** 幕布此刻是否挡住舞台（过渡卡或封面）：挡住时舞台不可操作（inert）。 */
export function curtainUp(project: Project, scenarioId: string | null | undefined, position: number, cover: CoverContent | null): boolean {
  return !!cover || !!cardAt(project, scenarioId, position);
}

export type CurtainProps = {
  project: Project;
  scenarioId: string | null | undefined;
  position: number;
  /** 要显示的封面（调用方按 coverShown 判断后传 coverFor 的结果）；null = 不显示封面。 */
  cover: CoverContent | null;
  /** 封面上的「开始」：从头播放。不传时按钮只是画出来（导出图片）。 */
  onStart?: () => void;
  theme: StageTheme;
  font?: AppearanceFont | null;
  /** 幕布的逻辑尺寸（与舞台同一套坐标，调用方负责缩放）。 */
  width: number;
  height: number;
  animate?: boolean;
  /** 只画不响应（导出图片、视频、截图）：不拦截点击，截图报告的遮挡检查也看不到它。 */
  passive?: boolean;
};

export function Curtain({ project, scenarioId, position, cover, onStart, theme, font = null, width, animate = true, passive = false }: CurtainProps) {
  const sc = scenarioId ? project.scenarios[scenarioId] : undefined;
  const card = cardAt(project, scenarioId, position);
  const cardRole = card?.role ? roleOf(project, sc?.optionId, card.role) : null;
  const k = Math.max(0.7, Math.min(1, width / DESIGN_WIDTH));
  const key = card ? `card:${scenarioId}#${position}` : cover ? `cover:${cover.scenarioId}` : null;
  return (
    <AnimatePresence>
      {key ? (
        <motion.div
          key={key}
          className={`jtheme absolute inset-0 text-[var(--jp-ink)] ${passive ? 'pointer-events-none' : 'pointer-events-auto'}`}
          style={{ ...fontStyle(font), fontFamily: 'var(--jp-font)' }}
          data-theme={theme}
          data-font={font ?? undefined}
          data-jlayer="curtain"
          initial={animate ? { opacity: 0 } : false}
          animate={{ opacity: 1 }}
          exit={animate ? { opacity: 0 } : undefined}
          transition={{ duration: card ? 0.45 : 0.3 }}
          // JS 帧循环（不走原生 WAAPI）：录制与胶片条的假时钟能逐帧取样这段淡入淡出
          onUpdate={noop}
        >
          {card ? <TransitionCard card={card} role={cardRole} k={k} /> : cover?.film ? <FilmCoverView cover={cover} film={cover.film} k={k} onStart={onStart} /> : cover ? <SceneCover cover={cover} k={k} onStart={onStart} /> : null}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/** 过渡卡：换人时上方是这个人的头像、名字和身份；标题、副标题过长时换行，最多两行；收尾的要点逐条列在下方。 */
function TransitionCard({ card, role, k }: { card: CardAction; role: RoleInfo | null; k: number }) {
  const { t: i18n } = useI18n();
  const px = (n: number) => Math.round(n * k);
  return (
    <div className="flex h-full w-full flex-col items-center justify-center overflow-hidden bg-[var(--jp-bg)] px-[8%] text-center" style={{ gap: px(14) }} data-testid="transition-card" data-role={role?.id}>
      {role ? (
        <div className="flex max-w-full flex-col items-center" style={{ gap: px(14) }}>
          <RoleAvatar role={role} size={px(64)} />
          <span className="max-w-full truncate text-[var(--jp-muted)]" style={{ fontSize: px(16), lineHeight: 1.2 }}>
            {role.desc ? `${role.name} · ${role.desc}` : role.name}
          </span>
        </div>
      ) : null}
      <div className="max-w-full" style={{ fontSize: px(40), lineHeight: 1.25, ...clampLines(2) }} title={card.title} data-testid="card-title">
        {card.title}
      </div>
      {card.sub ? (
        <div className="max-w-full" style={{ maxWidth: px(760), fontSize: px(20), lineHeight: 1.5, color: JP_SECONDARY, ...clampLines(2) }} title={card.sub} data-testid="card-sub">
          {card.sub}
        </div>
      ) : null}
      {card.points?.length ? (
        <ul className="flex max-w-full flex-col text-left" style={{ maxWidth: px(720), marginTop: px(8), gap: px(10), fontSize: px(20) }}>
          {card.points.map((pt, i) => (
            <li key={i} className="flex items-start" style={{ gap: px(12) }}>
              <span aria-hidden className="mt-[0.15em] inline-flex size-[1.3em] shrink-0 items-center justify-center rounded-full border-[1.5px] border-[var(--jp-ink)] text-[0.75em] font-bold">
                {i18n.player.number(i + 1)}
              </span>
              <span className="min-w-0" style={{ lineHeight: 1.5, ...clampLines(2) }}>{pt}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** 场景封面：所属（小字）、标题、说明、「约 N 步 · 约 M 秒 · 角色」、开始按钮。 */
function SceneCover({ cover, k, onStart }: { cover: CoverContent; k: number; onStart?: () => void }) {
  const { t: i18n } = useI18n();
  const px = (n: number) => Math.round(n * k);
  const owner = [cover.feature, cover.option].filter(Boolean).join(' · ');
  const icon = { width: px(14), height: px(14) };
  const meta: { key: string; icon: typeof Timer; text: string }[] = [
    { key: 'steps', icon: ListOrdered, text: i18n.player.coverSteps(cover.steps) },
    { key: 'time', icon: Timer, text: i18n.player.coverDuration(cover.duration) },
    ...(cover.roles.length ? [{ key: 'roles', icon: Users, text: i18n.player.list(cover.roles.map((r) => r.name)) }] : []),
  ];
  const btnCls = 'flex items-center rounded-[8px] border-[1.5px] border-jb-ink bg-jb-accent font-jb font-semibold leading-none text-jb-on-accent shadow-jb-e1';
  const btnStyle = { gap: px(8), padding: `${px(12)}px ${px(26)}px`, fontSize: px(17) };
  const btnFace = (
    <>
      <Play aria-hidden style={{ width: px(18), height: px(18) }} />
      {i18n.player.coverStart}
    </>
  );
  return (
    <div
      className="flex h-full w-full items-center justify-center overflow-hidden px-[8%] text-center"
      style={{
        // 第 0 步画面的淡影：舞台就在下面，这里用纸色盖住大部分并模糊；中心更接近纸色，文字更清楚
        background: 'radial-gradient(ellipse 60% 60% at 50% 50%, color-mix(in srgb, var(--jp-bg) 97%, transparent) 0%, color-mix(in srgb, var(--jp-bg) 90%, transparent) 45%, color-mix(in srgb, var(--jp-bg) 84%, transparent) 100%)',
        backdropFilter: 'blur(5px)',
        WebkitBackdropFilter: 'blur(5px)',
      }}
      role="group"
      aria-label={cover.title}
      data-testid="scene-cover"
    >
      <div className="flex max-w-full flex-col items-center" style={{ gap: px(18), maxWidth: px(820) }}>
        {owner ? (
          <div className="max-w-full truncate font-jb text-[var(--jp-muted)]" style={{ fontSize: px(14), lineHeight: 1.4 }} data-testid="cover-owner">
            {owner}
          </div>
        ) : null}
        <h2 className="m-0 max-w-full font-normal" style={{ fontSize: px(44), lineHeight: 1.2, ...clampLines(2) }} title={cover.title} data-testid="cover-title">
          {cover.title}
        </h2>
        {cover.description ? (
          <p className="m-0 max-w-full" style={{ maxWidth: px(680), fontSize: px(19), lineHeight: 1.5, color: JP_SECONDARY, ...clampLines(2) }} title={cover.description} data-testid="cover-description" data-from={cover.descriptionFrom ?? undefined}>
            {cover.description}
          </p>
        ) : null}
        <ul className="m-0 flex max-w-full list-none flex-wrap items-center justify-center p-0 font-jb text-[var(--jp-muted)]" style={{ columnGap: px(14), rowGap: px(4), fontSize: px(14), lineHeight: 1.4 }} data-testid="cover-meta">
          {meta.map((m) => (
            <li key={m.key} className="flex min-w-0 items-center" style={{ gap: px(6) }}>
              <m.icon aria-hidden className="shrink-0" style={icon} />
              <span className="truncate">{m.text}</span>
            </li>
          ))}
        </ul>
        {onStart ? (
          <button type="button" onClick={onStart} title={`${i18n.player.coverStartTitle} · ${i18n.player.space}`} className={`${btnCls} jb-focus mt-1 cursor-pointer transition-colors hover:bg-jb-accent-hover active:translate-x-[1px] active:translate-y-[1px] active:bg-jb-accent-press`} style={btnStyle} data-testid="cover-start">
            {btnFace}
          </button>
        ) : (
          <span aria-hidden className={`${btnCls} mt-1`} style={btnStyle} data-testid="cover-start">
            {btnFace}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * 影片封面（D102）：与场景封面同一套尺寸与底色。
 * - 影片封面（第一章）：「影片」、标题、简介、给：观众、「N 章 · 约 M」、开始；
 * - 章节封面（从中间某一章打开）：「第 n 章 · 影片标题」（支线写「支线」）、章节标题、description、这一章的时长、开始。
 */
function FilmCoverView({ cover, film, k, onStart }: { cover: CoverContent; film: FilmCover; k: number; onStart?: () => void }) {
  const { t: i18n } = useI18n();
  const px = (n: number) => Math.round(n * k);
  const atFilm = film.at === 'film';
  const kicker = atFilm ? i18n.player.film : `${film.chapter === null ? i18n.player.sideChapter : i18n.player.chapterKicker(film.chapter)} · ${film.title}`;
  const title = atFilm ? film.title : cover.title;
  const description = atFilm ? film.summary : cover.description;
  const icon = { width: px(14), height: px(14) };
  const meta: { key: string; icon: typeof Timer; text: string }[] = atFilm
    ? [{ key: 'chapters', icon: Clapperboard, text: film.meta }]
    : [{ key: 'time', icon: Timer, text: i18n.player.coverDuration(cover.duration) }];
  const btnCls = 'flex items-center rounded-[8px] border-[1.5px] border-jb-ink bg-jb-accent font-jb font-semibold leading-none text-jb-on-accent shadow-jb-e1';
  const btnStyle = { gap: px(8), padding: `${px(12)}px ${px(26)}px`, fontSize: px(17) };
  const btnFace = (
    <>
      <Play aria-hidden style={{ width: px(18), height: px(18) }} />
      {i18n.player.coverStart}
    </>
  );
  return (
    <div
      className="flex h-full w-full items-center justify-center overflow-hidden px-[8%] text-center"
      style={{
        background: 'radial-gradient(ellipse 60% 60% at 50% 50%, color-mix(in srgb, var(--jp-bg) 97%, transparent) 0%, color-mix(in srgb, var(--jp-bg) 90%, transparent) 45%, color-mix(in srgb, var(--jp-bg) 84%, transparent) 100%)',
        backdropFilter: 'blur(5px)',
        WebkitBackdropFilter: 'blur(5px)',
      }}
      role="group"
      aria-label={title}
      data-testid="film-cover"
      data-at={film.at}
    >
      <div className="flex max-w-full flex-col items-center" style={{ gap: px(18), maxWidth: px(820) }}>
        <div className="max-w-full truncate font-jb text-[var(--jp-muted)]" style={{ fontSize: px(14), lineHeight: 1.4 }} data-testid="cover-owner">
          {kicker}
        </div>
        <h2 className="m-0 max-w-full font-normal" style={{ fontSize: px(44), lineHeight: 1.2, ...clampLines(2) }} title={title} data-testid="cover-title">
          {title}
        </h2>
        {description ? (
          <p className="m-0 max-w-full" style={{ maxWidth: px(680), fontSize: px(19), lineHeight: 1.5, color: JP_SECONDARY, ...clampLines(2) }} title={description} data-testid="cover-description">
            {description}
          </p>
        ) : null}
        {atFilm && film.audience ? (
          <div className="max-w-full font-jb text-[var(--jp-muted)]" style={{ fontSize: px(15), lineHeight: 1.4, ...clampLines(2) }} title={film.audience} data-testid="cover-audience">
            {i18n.player.forRoles([film.audience])}
          </div>
        ) : null}
        <ul className="m-0 flex max-w-full list-none flex-wrap items-center justify-center p-0 font-jb text-[var(--jp-muted)]" style={{ columnGap: px(14), rowGap: px(4), fontSize: px(14), lineHeight: 1.4 }} data-testid="cover-meta">
          {meta.map((m) => (
            <li key={m.key} className="flex min-w-0 items-center" style={{ gap: px(6) }}>
              <m.icon aria-hidden className="shrink-0" style={icon} />
              <span className="truncate">{m.text}</span>
            </li>
          ))}
        </ul>
        {onStart ? (
          <button type="button" onClick={onStart} title={`${i18n.player.coverStartTitle} · ${i18n.player.space}`} className={`${btnCls} jb-focus mt-1 cursor-pointer transition-colors hover:bg-jb-accent-hover active:translate-x-[1px] active:translate-y-[1px] active:bg-jb-accent-press`} style={btnStyle} data-testid="cover-start">
            {btnFace}
          </button>
        ) : (
          <span aria-hidden className={`${btnCls} mt-1`} style={btnStyle} data-testid="cover-start">
            {btnFace}
          </span>
        )}
      </div>
    </div>
  );
}
