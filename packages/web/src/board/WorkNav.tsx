import { useBoardI18n } from '../i18n/board/context';
/**
 * 独立作品的左栏（看板，D102 修订；方案 A「左栏章节清单」）：当前条目没有挂功能（entry.featureId === null）时，
 * 换掉功能的方案 / 情况左栏。只问能力，不按“形态”分支：
 * - 作品信息：「N 章 · 约 M」或「N 个场景 · 约 M」、草稿标记、标题、简介、「给：观众」（写了才显示）；
 * - 切片清单：sequencing = linear 时叫“章节”，每行两位自动编号；independent 时叫“场景”、不编号。标题两行内换行，
 *   第二行「时长 · 步数」；当前切片高亮；点一下跳到它的开头；不在连续播放顺序里的切片单独一组（支线）；
 * - 审片（只有 linear）：胶片条命令与复制；
 * - 空状态：还没有切片时说明第一个切片怎么写。
 * 独立作品没有方案区、情况区、覆盖缺口、其他方案小标与“确认方案”。数据只读 core 的 Entry（sliceRows / entryMetaText）。
 */
import type { Entry, Project } from '@joplo-app/core/runtime';
import { CirclePlay, Copy, LayoutList } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Btn } from '../player/controls';
import { entryMetaText, sliceRows, sliceWords, type ChapterRow } from '../player/work-view';
import { GroupHead } from './CaseNav';
import { reviewStripCommand, workFile } from './nav-model';

const EMPTY_SNIPPET = "scenarios: {\n  hook: chapter('…').system('…'),\n},";

function SliceItem({ row, onPick }: { row: ChapterRow; onPick: () => void }) {
  const { t: i18n } = useBoardI18n();
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        title={row.title}
        aria-current={row.current ? 'true' : undefined}
        data-testid={`slice-${row.id}`}
        className={cn('jb-focus flex w-full items-start gap-2.5 rounded-[8px] px-2 py-2 text-left font-jb', row.current ? 'bg-jb-selected' : 'hover:bg-jb-hover active:bg-jb-press')}
      >
        {row.no ? (
          <span className={cn('w-6 shrink-0 font-jb-mono text-[12px] font-bold leading-[18px]', row.current ? 'text-jb-fg' : 'text-jb-muted')} data-testid="slice-no">
            {row.no}
          </span>
        ) : (
          <span className="flex h-[18px] w-6 shrink-0 items-center">
            <CirclePlay className={cn('size-4', row.current ? 'text-jb-fg' : 'text-jb-muted')} aria-hidden />
          </span>
        )}
        <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <span className={cn('line-clamp-2 text-[13.5px] leading-[18px] text-jb-fg [overflow-wrap:anywhere]', row.current && 'font-semibold')}>{row.title}</span>
          <span className="truncate text-[12px] text-jb-muted">{i18n.board.sliceMeta(i18n.player.clock(row.ms), row.steps)}</span>
        </span>
      </button>
    </li>
  );
}

export function WorkNav({ project, entry, scenarioId, onScenario, onCopy }: { project: Project; entry: Entry; scenarioId: string | null; onScenario: (id: string) => void; onCopy: (text: string) => void }) {
  const { t: i18n } = useBoardI18n();
  const rows = sliceRows(entry, scenarioId, i18n);
  const words = sliceWords(entry, i18n);
  const command = reviewStripCommand(entry);
  return (
    <div className="flex min-h-full flex-1 flex-col gap-1 font-jb" data-testid="work-nav" data-sequencing={entry.sequencing}>
      <div className="flex flex-col gap-1 px-2 pb-1 pt-1" data-testid="work-brief">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
          <span className="text-jb-muted" data-testid="work-meta">{entryMetaText(entry, i18n)}</span>
          {entry.draft ? <span className="rounded-[4px] border border-jb-line px-1.5 py-px text-[11px] text-jb-muted" data-testid="work-draft">{i18n.board.draftNotPublished}</span> : null}
        </div>
        <p className="line-clamp-2 text-[14px] font-semibold leading-[19px] text-jb-fg [overflow-wrap:anywhere]" title={entry.title}>{entry.title}</p>
        <p className="line-clamp-3 text-[12px] leading-[18px] text-jb-muted" title={entry.summary}>{entry.summary}</p>
        {entry.audience ? <p className="line-clamp-2 text-[12px] leading-[18px] text-jb-fg" title={entry.audience} data-testid="work-audience">{i18n.player.forRoles([entry.audience])}</p> : null}
      </div>
      {entry.slices.length === 0 ? (
        <div className="mx-2 mt-2 flex flex-col gap-2 rounded-[8px] bg-jb-app p-3" role="status" data-testid="work-empty">
          <p className="text-[13px] font-semibold text-jb-fg">{i18n.board.workEmptyTitle}</p>
          <p className="text-[12px] leading-[18px] text-jb-muted [overflow-wrap:anywhere]">{i18n.board.workEmptyBody(workFile(project, entry.id))}</p>
          <pre className="m-0 whitespace-pre-wrap rounded-[6px] border border-jb-line bg-jb-surface p-2 font-jb-mono text-[11px] leading-[16px] text-jb-fg [overflow-wrap:anywhere]">{EMPTY_SNIPPET}</pre>
        </div>
      ) : null}
      {rows.main.length ? (
        <>
          <GroupHead title={words.list} right={i18n.board.itemCount(rows.main.length)} />
          <ul className="flex flex-col gap-1" data-testid="work-slices">
            {rows.main.map((r) => <SliceItem key={r.id} row={r} onPick={() => onScenario(r.id)} />)}
          </ul>
        </>
      ) : null}
      {rows.side.length ? (
        <>
          <div className="h-2.5 shrink-0" />
          <GroupHead title={words.side} right={i18n.board.itemCount(rows.side.length)} />
          <ul className="flex flex-col gap-1" data-testid="work-side-slices">
            {rows.side.map((r) => <SliceItem key={r.id} row={r} onPick={() => onScenario(r.id)} />)}
          </ul>
        </>
      ) : null}
      <div className="min-h-4 flex-1" />
      {command ? (
        <div className="sticky bottom-0 flex shrink-0 flex-col gap-1.5 rounded-[8px] bg-jb-app p-2.5" data-testid="review-strip">
          <span className="text-[12px] font-semibold text-jb-fg">{i18n.board.reviewStrip}</span>
          <span className="text-[12px] leading-[17px] text-jb-muted">{i18n.board.reviewStripHint}</span>
          <div className="flex items-start gap-2">
            <code className="min-w-0 flex-1 font-jb-mono text-[11px] leading-[16px] text-jb-fg [overflow-wrap:anywhere]" data-testid="review-strip-command">{command}</code>
            <Btn icon={<Copy className="size-3.5" />} label={i18n.board.copyCommand} title={i18n.board.copy(command)} iconOnly size={28} className="shrink-0" onClick={() => onCopy(command)} data-testid="review-strip-copy" />
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** 窄屏（< 1100）收成的竖条：linear 时切片只剩两位编号，其余是一个小图标（悬停写标题）；当前切片高亮。整体是“展开左栏”的按钮（PlayerPage），这里只放图形。 */
export function WorkRail({ entry, scenarioId }: { entry: Entry; scenarioId: string | null }) {
  const { t: i18n } = useBoardI18n();
  const rows = sliceRows(entry, scenarioId, i18n);
  return (
    <span className="flex flex-col items-center gap-1 font-jb" data-testid="work-rail">
      <span title={entry.title} className="flex size-6 items-center justify-center rounded-[6px] bg-jb-inverse text-jb-on-inverse">
        <LayoutList className="size-3.5" aria-label={entry.title} />
      </span>
      <span aria-hidden className="my-1 h-px w-6 bg-jb-line" />
      {[...rows.main, ...rows.side].map((r) => (
        <span key={r.id} title={r.title} className={cn('flex size-8 items-center justify-center rounded-[8px] font-jb-mono text-[12px] font-bold', r.current ? 'bg-jb-selected text-jb-fg' : 'text-jb-muted')} data-testid="rail-slice">
          {r.no ?? <CirclePlay className="size-3.5" aria-hidden />}
        </span>
      ))}
    </span>
  );
}
