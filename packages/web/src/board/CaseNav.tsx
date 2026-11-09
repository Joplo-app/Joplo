import { useBoardI18n } from '../i18n/board/context';
/**
 * 演示页左栏（看板，D55「演示页 · 默认」）：
 * - 方案：字母块 + 名字 + “✓ 已选定 · 缺失 3 · 待决定 1”；点一下切换方案（情况保持）。悬停卡片写思路和取舍。
 * - 情况：当前方案的状态图标 + 标题（最多两行）+ 其他方案的小标（字母 + 状态图标，悬停写“B：缺失”，点一下切到 B 看同一个情况）。
 *   悬停卡片列出每个方案的状态和原因，点方案名直接切过去。
 * - 没有关联情况的场景单独列出；底部是当前方案的缺口汇总，点一下复制 `npx joplo check --option <方案>`。
 * - D67（PM 视角，只读现有字段）：顶部写功能目标与“面向：角色”；高优先级情况带「!」；悬停卡写期望结果（case.expected）；
 *   缺口汇总加上缺失里的高优先级数。
 * 视图计算在 nav-model.ts（纯函数）。创作侧信息，只由看板传给 PlayerPage 的 nav，不进发布站。
 */
import type { Project } from '@joplo-app/core/runtime';
import { optionsOf, scenariosOf } from '../runtime/views';
import { Popover, useHoverCard, useTip } from '../player/popover';
import { StatusIcon } from '../player/StatusIcon';
import { cn } from '@/lib/utils';
import { caseBrief, caseCard, gapCommand, gapsOf, letterOf, optionLabel, optionMeta, otherOptionTags, rolesOfFeature, statusOf } from './nav-model';

export { gapsOf, statusOf } from './nav-model';

function GroupHead({ title, right }: { title: string; right?: string }) {
  return (
    <div className="flex items-baseline justify-between px-2 pb-1.5 pt-2 font-jb text-[12px]">
      <span className="font-semibold tracking-[1px] text-jb-muted">{title}</span>
      {right ? <span className="text-jb-faint">{right}</span> : null}
    </div>
  );
}

function Letter({ letter, on }: { letter: string; on: boolean }) {
  return <span className={cn('flex size-6 shrink-0 items-center justify-center rounded-[6px] border-[1.5px] font-jb text-[13px] font-bold text-jb-fg', on ? 'border-jb-ink bg-jb-accent' : 'border-jb-line bg-jb-surface')}>{letter}</span>;
}

function OptionRow({ project, optionId, index, active, onPick }: { project: Project; optionId: string; index: number; active: boolean; onPick: () => void }) {
  const { t: i18n } = useBoardI18n();

  const o = project.options[optionId]!;
  const { letter, title } = optionLabel(o, index);
  const meta = optionMeta(project, optionId, i18n);
  const hc = useHoverCard();
  return (
    <li>
      <button type="button" onClick={onPick} {...hc.trigger} data-testid={`option-${optionId}`} aria-current={active ? 'true' : undefined} className={cn('jb-focus flex w-full items-start gap-2.5 rounded-[8px] px-2 py-2.5 text-left font-jb', active ? 'bg-jb-selected' : 'hover:bg-jb-hover active:bg-jb-press')}>
        <Letter letter={letter} on={active} />
        <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <span className={cn('truncate text-[14px] leading-[19px] text-jb-fg', active && 'font-semibold')}>{title}</span>
          {meta.picked || meta.text ? (
            <span className="flex items-center gap-1.5 whitespace-nowrap text-[12px] text-jb-muted">
              {meta.picked ? <span className="rounded-[4px] bg-jb-inverse px-1.5 py-px text-[11px] font-medium text-jb-on-inverse">{i18n.board.picked}</span> : null}
              <span className="truncate">{meta.text || i18n.board.allCovered}</span>
            </span>
          ) : null}
        </span>
      </button>
      <Popover open={!!hc.anchor} anchor={hc.anchor} onClose={hc.close} placement="right-start" width={280} label={o.name} testid={`option-card-${optionId}`} onMouseEnter={hc.card.onMouseEnter} onMouseLeave={hc.card.onMouseLeave}>
        <div className="flex flex-col gap-2 p-3 font-jb">
          <div className="text-[13px] font-semibold text-jb-fg">
            {letter} · {title}
          </div>
          <p className="text-[12px] leading-[18px] text-jb-muted">{o.idea}</p>
          {o.tradeoffs.length ? (
            <ul className="flex flex-col gap-1 text-[12px] leading-[18px] text-jb-fg">
              {o.tradeoffs.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </Popover>
    </li>
  );
}

function OtherTag({ letter, status, tip, onClick, testid }: { letter: string; status: Parameters<typeof StatusIcon>[0]['status']; tip: string; onClick: () => void; testid: string }) {
  const { t: i18n } = useBoardI18n();

  const [tp, tipNode] = useTip(i18n.board.clickToSwitch(tip));
  return (
    <>
      <button type="button" onClick={onClick} aria-label={tip} data-testid={testid} {...tp} className="jb-focus flex h-[18px] shrink-0 items-center gap-0.5 rounded-[4px] border border-jb-line bg-jb-surface px-[5px] font-jb text-[11px] font-semibold text-jb-muted hover:bg-jb-hover">
        {letter}
        <StatusIcon status={status} size={11} labelPrefix={i18n.board.labelPrefix(letter)} />
      </button>
      {tipNode}
    </>
  );
}

function CaseRow({ project, featureId, optionId, caseId, active, onCase, onOptionCase }: { project: Project; featureId: string; optionId: string | null; caseId: string; active: boolean; onCase: () => void; onOptionCase: (optionId: string) => void }) {
  const { t: i18n } = useBoardI18n();

  const c = project.cases[caseId]!;
  const own = optionId ? statusOf(project, optionId, caseId) : 'none';
  const tags = otherOptionTags(project, featureId, optionId, caseId, i18n);
  const hc = useHoverCard();
  const card = caseCard(project, featureId, caseId, i18n);
  const brief = caseBrief(project, caseId);
  return (
    <li className={cn('flex items-center gap-1.5 rounded-[8px] pr-2', active ? 'bg-jb-selected' : 'hover:bg-jb-hover')} data-testid={`case-${caseId}`} data-status={own} data-active={active ? '' : undefined} {...hc.trigger}>
      <button type="button" onClick={onCase} aria-current={active ? 'true' : undefined} className="jb-focus flex min-w-0 flex-1 items-start gap-2.5 rounded-[8px] py-2 pl-2 text-left font-jb">
        <span className="flex h-[18px] items-center">
          <StatusIcon status={own} size={16} labelPrefix={optionId ? i18n.board.labelPrefix(letterOf(project, optionId)) : ''} />
        </span>
        <span className={cn('line-clamp-2 min-w-0 flex-1 text-[13.5px] leading-[18px] text-jb-fg', active && 'font-semibold')}>{c.title}</span>
        {brief.high ? (
          <span className="mt-px flex size-4 shrink-0 items-center justify-center rounded-full border border-jb-line-strong text-[10px] font-bold leading-none text-jb-fg" title={i18n.board.highPriority} aria-label={i18n.board.highPriority} data-testid={`case-${caseId}-high`}>
            !
          </span>
        ) : null}
      </button>
      {tags.map((t) => (
        <OtherTag key={t.optionId} letter={t.letter} status={t.status} tip={t.tip} onClick={() => onOptionCase(t.optionId)} testid={`case-${caseId}-${t.optionId}`} />
      ))}
      <Popover open={!!hc.anchor} anchor={hc.anchor} onClose={hc.close} placement="right-start" width={300} label={c.title} testid={`case-card-${caseId}`} onMouseEnter={hc.card.onMouseEnter} onMouseLeave={hc.card.onMouseLeave}>
        <div className="flex flex-col gap-1 p-2 font-jb">
          <div className="px-1.5 pb-1 pt-0.5 text-[12px] font-semibold text-jb-muted">{c.title}</div>
          <div className="mx-1.5 mb-1 rounded-[6px] bg-jb-app px-2 py-1.5 text-[12px] leading-[17px]" data-testid={`case-card-${caseId}-expected`}>
            <span className="font-semibold text-jb-fg">{i18n.board.expected}</span>
            {brief.high ? <span className="text-jb-muted"> · {i18n.board.highPriority}</span> : null}
            <p className={cn('mt-0.5', brief.expected ? 'text-jb-fg' : 'italic text-jb-faint')}>{brief.expected ?? i18n.board.expectedNotWritten}</p>
          </div>
          {card.map((r) => (
            <button
              key={r.optionId}
              type="button"
              onClick={() => {
                hc.close();
                if (r.optionId !== optionId) onOptionCase(r.optionId);
              }}
              className={cn('jb-focus flex items-start gap-2 rounded-[6px] px-1.5 py-1.5 text-left', r.optionId === optionId ? 'bg-jb-selected' : 'hover:bg-jb-hover')}
            >
              <Letter letter={r.letter} on={r.optionId === optionId} />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <StatusIcon status={r.status} size={13} withLabel className="text-[12px]" />
                <span className="line-clamp-2 text-[12px] leading-[17px] text-jb-muted">{r.detail}</span>
              </span>
            </button>
          ))}
        </div>
      </Popover>
    </li>
  );
}

export function CaseNav({
  project,
  featureId,
  optionId,
  caseId,
  scenarioId,
  onOption,
  onCase,
  onScenario,
  onOptionCase,
  onCopy,
}: {
  project: Project;
  featureId: string;
  optionId: string | null;
  caseId: string | null;
  scenarioId: string | null;
  onOption: (id: string) => void;
  onCase: (id: string) => void;
  onScenario: (id: string) => void;
  /** 切到另一个方案看同一个情况（?o=&c=）。 */
  onOptionCase: (optionId: string, caseId: string) => void;
  /** 复制缺口汇总的命令。 */
  onCopy: (text: string) => void;
}) {
  const { t: i18n } = useBoardI18n();

  const f = project.features[featureId]!;
  const options = optionsOf(project, featureId);
  const gaps = gapsOf(project, optionId);
  const letter = optionId ? letterOf(project, optionId) : null;
  const covered = new Set(f.caseIds.flatMap((c) => (optionId ? (project.options[optionId]?.coverage[c]?.scenarioIds ?? []) : [])));
  const loose = scenariosOf(project, optionId).filter((s) => !covered.has(s.id) && !s.caseIds.some((c) => f.caseIds.includes(c)));
  const who = rolesOfFeature(project, featureId);
  return (
    <div className="flex min-h-full flex-1 flex-col gap-1 font-jb" data-testid="case-nav">
      {/* 给谁、解决什么（D67）：功能名已在顶栏面包屑里，这里只写目标与角色 */}
      <div className="flex flex-col gap-1 px-2 pb-1 pt-1" data-testid="feature-brief">
        <p className="line-clamp-3 text-[12px] leading-[18px] text-jb-muted" title={f.goal}>{f.goal}</p>
        {who.length ? <p className="truncate text-[12px] leading-[18px] text-jb-fg" title={i18n.player.forRoles(who)} data-testid="feature-roles">{i18n.player.forRoles(who)}</p> : null}
      </div>
      <GroupHead title={i18n.board.options} right={i18n.board.itemCount(options.length)} />
      {options.length === 0 ? <p className="px-2 text-[13px] text-jb-muted">{i18n.board.thisFeatureHasNoOptionsYet}</p> : null}
      <ul className="flex flex-col gap-1" data-testid="option-switch">
        {options.map((o, i) => (
          <OptionRow key={o.id} project={project} optionId={o.id} index={i} active={o.id === optionId} onPick={() => onOption(o.id)} />
        ))}
      </ul>
      <div className="h-2.5 shrink-0" />
      <GroupHead title={i18n.board.cases} right={letter ? i18n.board.coverageFor(letter) : undefined} />
      {f.caseIds.length === 0 ? <p className="px-2 text-[13px] text-jb-muted">{i18n.board.thisFeatureHasNoCasesYet}</p> : null}
      <ul className="flex flex-col gap-1">
        {f.caseIds.map((cid) =>
          project.cases[cid] ? <CaseRow key={cid} project={project} featureId={featureId} optionId={optionId} caseId={cid} active={caseId === cid} onCase={() => onCase(cid)} onOptionCase={(oid) => onOptionCase(oid, cid)} /> : null,
        )}
      </ul>
      {loose.length ? (
        <>
          <div className="h-2.5 shrink-0" />
          <GroupHead title={i18n.board.otherScenarios} />
          <ul className="flex flex-col gap-1">
            {loose.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => onScenario(s.id)} data-testid={`scenario-${s.id}`} className={cn('jb-focus w-full truncate rounded-[8px] px-2 py-2 text-left text-[13.5px] text-jb-fg', !caseId && scenarioId === s.id ? 'bg-jb-selected font-semibold' : 'hover:bg-jb-hover')}>
                  {s.name}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <div className="min-h-4 flex-1" />
      {optionId ? (
        <button type="button" onClick={() => onCopy(gapCommand(optionId))} data-testid="gap-count" title={i18n.board.copy(gapCommand(optionId))} className="jb-focus sticky bottom-0 flex max-w-full shrink-0 flex-wrap items-center gap-x-2 gap-y-1 whitespace-nowrap rounded-[8px] bg-jb-app p-2.5 text-left text-[12px] hover:bg-jb-press">
          <span className="font-semibold text-jb-fg">{i18n.board.optionLabel(letter ?? '')}</span>
          <span className={cn(gaps.missing ? 'font-semibold text-jb-danger' : 'text-jb-muted')}>{i18n.board.missingCount(gaps.missing)}</span>
          {gaps.missingHigh ? <span className="font-semibold text-jb-fg" data-testid="gap-high">{i18n.board.missingHighCount(gaps.missingHigh)}</span> : null}
          <span className="text-jb-muted">{i18n.board.undecidedCount(gaps.undecided)}</span>
          <span className="flex-1" />
          <span className="hidden font-jb-mono text-[11px] text-jb-faint min-[1440px]:inline">joplo check</span>
        </button>
      ) : null}
    </div>
  );
}

/**
 * 窄屏（< 1100）左栏收成的竖条：方案只剩字母，情况只剩当前方案的状态图标（悬停写全称）。
 * 竖条整体是一个“展开左栏”的按钮（PlayerPage），这里只放图形，不放按钮。
 */
export function CaseRail({ project, featureId, optionId, caseId }: { project: Project; featureId: string; optionId: string | null; caseId: string | null }) {
  const { t: i18n } = useBoardI18n();

  const f = project.features[featureId];
  if (!f) return null;
  return (
    <span className="flex flex-col items-center gap-1 font-jb" data-testid="case-rail">
      {optionsOf(project, featureId).map((o, i) => {
        const { letter, title } = optionLabel(o, i);
        return (
          <span key={o.id} title={i18n.board.optionName(letter, title)} className="flex size-9 items-center justify-center">
            <Letter letter={letter} on={o.id === optionId} />
          </span>
        );
      })}
      <span aria-hidden className="my-1 h-px w-6 bg-jb-line" />
      {f.caseIds.map((cid) => {
        const c = project.cases[cid];
        if (!c) return null;
        const own = optionId ? statusOf(project, optionId, cid) : 'none';
        return (
          <span key={cid} title={c.title} className={cn('flex size-8 items-center justify-center rounded-[8px]', caseId === cid && 'bg-jb-selected')}>
            <StatusIcon status={own} size={16} labelPrefix={i18n.board.labelPrefix(c.title)} />
          </span>
        );
      })}
    </span>
  );
}
