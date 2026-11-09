import { useBoardI18n } from '../i18n/board/context';
/**
 * 影片的左栏（看板，D102 方案 A「左栏章节清单」）：当前作品是影片（entry.featureId === null）时换掉功能演示的方案 / 情况左栏。
 * - 影片信息：形态徽标 +「N 章 · 约 M」、草稿标记、标题、简介、「给：观众」（写了才显示）；
 * - 章节：两位自动编号在左，标题两行内换行，第二行「时长 · 步数」；当前章高亮；点一下跳到这一章的开头；
 * - 支线（不在连续播放顺序里的章节）单独一组，不编号；
 * - 审片：胶片条命令与复制；
 * - 空状态：还没有章节时说明第一章怎么写。
 * 影片没有方案区、情况区、覆盖缺口、其他方案小标与“确认方案”。数据只读 core 的 Entry（chapterRows / filmMetaText）。
 */
import type { Project, Entry } from '@joplo-app/core/runtime';
import { Clapperboard, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Btn } from '../player/controls';
import { chapterRows, filmMetaText, type ChapterRow } from '../player/work-view';
import { GroupHead } from './CaseNav';
import { filmFile, filmReviewCommand } from './nav-model';

const EMPTY_SNIPPET = "chapters: {\n  hook: chapter('…').system('…'),\n},";

function ChapterItem({ row, onPick }: { row: ChapterRow; onPick: () => void }) {
  const { t: i18n } = useBoardI18n();
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        title={row.title}
        aria-current={row.current ? 'true' : undefined}
        data-testid={`chapter-${row.id}`}
        className={cn('jb-focus flex w-full items-start gap-2.5 rounded-[8px] px-2 py-2 text-left font-jb', row.current ? 'bg-jb-selected' : 'hover:bg-jb-hover active:bg-jb-press')}
      >
        <span className={cn('w-6 shrink-0 font-jb-mono text-[12px] font-bold leading-[18px]', row.current ? 'text-jb-fg' : 'text-jb-muted')} data-testid="chapter-no">
          {row.no ?? '·'}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <span className={cn('line-clamp-2 text-[13.5px] leading-[18px] text-jb-fg [overflow-wrap:anywhere]', row.current && 'font-semibold')}>{row.title}</span>
          <span className="truncate text-[12px] text-jb-muted">{i18n.board.chapterMeta(i18n.player.clock(row.ms), row.steps)}</span>
        </span>
      </button>
    </li>
  );
}

export function FilmNav({ project, work, scenarioId, onScenario, onCopy }: { project: Project; work: Entry; scenarioId: string | null; onScenario: (id: string) => void; onCopy: (text: string) => void }) {
  const { t: i18n } = useBoardI18n();
  const rows = chapterRows(work, scenarioId, i18n);
  const command = filmReviewCommand(work);
  return (
    <div className="flex min-h-full flex-1 flex-col gap-1 font-jb" data-testid="film-nav">
      <div className="flex flex-col gap-1 px-2 pb-1 pt-1" data-testid="film-brief">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
          <span className="rounded-[4px] bg-jb-inverse px-1.5 py-px text-[11px] font-medium text-jb-on-inverse" data-testid="work-badge">{i18n.player.film}</span>
          <span className="text-jb-muted" data-testid="film-meta">{filmMetaText(work, i18n)}</span>
          {work.draft ? <span className="rounded-[4px] border border-jb-line px-1.5 py-px text-[11px] text-jb-muted" data-testid="film-draft">{i18n.board.draftNotPublished}</span> : null}
        </div>
        <p className="line-clamp-2 text-[14px] font-semibold leading-[19px] text-jb-fg [overflow-wrap:anywhere]" title={work.title}>{work.title}</p>
        <p className="line-clamp-3 text-[12px] leading-[18px] text-jb-muted" title={work.summary}>{work.summary}</p>
        {work.audience ? <p className="line-clamp-2 text-[12px] leading-[18px] text-jb-fg" title={work.audience} data-testid="film-audience">{i18n.player.forRoles([work.audience])}</p> : null}
      </div>
      {work.slices.length === 0 ? (
        <div className="mx-2 mt-2 flex flex-col gap-2 rounded-[8px] bg-jb-app p-3" role="status" data-testid="film-empty">
          <p className="text-[13px] font-semibold text-jb-fg">{i18n.board.filmEmptyTitle}</p>
          <p className="text-[12px] leading-[18px] text-jb-muted [overflow-wrap:anywhere]">{i18n.board.filmEmptyBody(filmFile(project, work.id))}</p>
          <pre className="m-0 whitespace-pre-wrap rounded-[6px] border border-jb-line bg-jb-surface p-2 font-jb-mono text-[11px] leading-[16px] text-jb-fg [overflow-wrap:anywhere]">{EMPTY_SNIPPET}</pre>
        </div>
      ) : null}
      {rows.chapters.length ? (
        <>
          <GroupHead title={i18n.player.watchChapters} right={i18n.board.itemCount(rows.chapters.length)} />
          <ul className="flex flex-col gap-1" data-testid="film-chapters">
            {rows.chapters.map((r) => <ChapterItem key={r.id} row={r} onPick={() => onScenario(r.id)} />)}
          </ul>
        </>
      ) : null}
      {rows.side.length ? (
        <>
          <div className="h-2.5 shrink-0" />
          <GroupHead title={i18n.player.sideChapters} right={i18n.board.itemCount(rows.side.length)} />
          <ul className="flex flex-col gap-1" data-testid="film-side-chapters">
            {rows.side.map((r) => <ChapterItem key={r.id} row={r} onPick={() => onScenario(r.id)} />)}
          </ul>
        </>
      ) : null}
      <div className="min-h-4 flex-1" />
      {command ? (
        <div className="sticky bottom-0 flex shrink-0 flex-col gap-1.5 rounded-[8px] bg-jb-app p-2.5" data-testid="film-review">
          <span className="text-[12px] font-semibold text-jb-fg">{i18n.board.filmReview}</span>
          <span className="text-[12px] leading-[17px] text-jb-muted">{i18n.board.filmReviewHint}</span>
          <div className="flex items-start gap-2">
            <code className="min-w-0 flex-1 font-jb-mono text-[11px] leading-[16px] text-jb-fg [overflow-wrap:anywhere]" data-testid="film-review-command">{command}</code>
            <Btn icon={<Copy className="size-3.5" />} label={i18n.board.filmCopyCommand} title={i18n.board.copy(command)} iconOnly size={28} className="shrink-0" onClick={() => onCopy(command)} data-testid="film-review-copy" />
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** 窄屏（< 1100）收成的竖条：章节只剩两位编号（悬停写标题），当前章高亮；支线是一个点。整体是“展开左栏”的按钮（PlayerPage），这里只放图形。 */
export function FilmRail({ work, scenarioId }: { work: Entry; scenarioId: string | null }) {
  const { t: i18n } = useBoardI18n();
  const rows = chapterRows(work, scenarioId, i18n);
  return (
    <span className="flex flex-col items-center gap-1 font-jb" data-testid="film-rail">
      <span title={`${i18n.player.film} · ${work.title}`} className="flex size-6 items-center justify-center rounded-[6px] bg-jb-inverse text-jb-on-inverse">
        <Clapperboard className="size-3.5" aria-label={i18n.player.film} />
      </span>
      <span aria-hidden className="my-1 h-px w-6 bg-jb-line" />
      {[...rows.chapters, ...rows.side].map((r) => (
        <span key={r.id} title={r.title} className={cn('flex size-8 items-center justify-center rounded-[8px] font-jb-mono text-[12px] font-bold', r.current ? 'bg-jb-selected text-jb-fg' : 'text-jb-muted')}>
          {r.no ?? '·'}
        </span>
      ))}
    </span>
  );
}
