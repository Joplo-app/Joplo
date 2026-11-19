import { useBoardI18n } from '../i18n/board/context';
/**
 * 演示页左栏（看板，D55 + Juice UI 同心色阶板与 RollingNumber）：
 * - 方案：14px 无重线同心色阶板（.jb-work-card），字母块 + 名字 + “✓ 已选定 · 缺失 3 · 待决定 1”；悬停卡片写思路和取舍。
 * - 情况：10px 同心行 + 其他方案的小标（字母 + 状态图标，悬停写“B：缺失”，点一下切到 B 看同一个情况）。
 * - 底部缺口汇总：12px 同心凹槽胶囊 + RollingNumber 跳字计数，点一下复制 `npx joplo check --work <方案>`。
 */
import type { Project } from '@joplo-app/core/runtime';
import { Badge, RollingNumber, Separator, playJuiceSound } from '@tokenroll/juice/primitives';
import { alternativeOf, worksOf, scenariosOf } from '../runtime/views';
import { Popover, useHoverCard, useTip } from '../player/popover';
import { StatusIcon } from '../player/StatusIcon';
import { cn } from '@/lib/utils';
import { caseBrief, caseCard, gapCommand, gapsOf, letterOf, workLabel, workMeta, otherWorkTags, rolesOfFeature, statusOf } from './nav-model';

export { gapsOf, statusOf } from './nav-model';

/** 在已翻译短语（如“缺失 3”、“3 missing”、“2 пропуска”）中把数字替换为 RollingNumber，同时给读屏保留完整短语。 */
export function RollingCount({ text, value }: { text: string; value: number }) {
  const match = /\d[\d,.]*/.exec(text);
  if (!match) return <>{text}</>;
  const prefix = text.slice(0, match.index);
  const suffix = text.slice(match.index + match[0].length);
  return (
    <span className="inline-flex items-baseline tabular-nums" aria-label={text}>
      <span aria-hidden className="inline-flex items-baseline">
        <RollingNumber value={value} prefix={prefix} suffix={suffix} />
      </span>
      <span className="sr-only">{text}</span>
    </span>
  );
}

export function GroupHead({ title, right }: { title: string; right?: string }) {
  return (
    <div className="flex items-baseline justify-between px-2 pb-1.5 pt-2 font-jb text-[12px]">
      <span className="font-semibold tracking-[1px] text-jb-muted">{title}</span>
      {right ? <span className="text-jb-faint">{right}</span> : null}
    </div>
  );
}

function Letter({ letter, on }: { letter: string; on: boolean }) {
  return (
    <span
      className={cn(
        'flex size-6 shrink-0 items-center justify-center rounded-[8px] font-jb text-[13px] font-bold transition-[background-color,box-shadow,color] duration-150',
        on
          ? 'bg-jb-accent text-jb-on-accent shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_1px_3px_rgba(180,135,0,0.22)]'
          : 'bg-[var(--juice-w6)] text-jb-muted',
      )}
    >
      {letter}
    </span>
  );
}

function WorkRow({ project, workId, index, active, onPick }: { project: Project; workId: string; index: number; active: boolean; onPick: () => void }) {
  const { t: i18n } = useBoardI18n();

  const o = project.works[workId]!;
  const { letter, title } = workLabel(o, index);
  const meta = workMeta(project, workId, i18n);
  const hc = useHoverCard();
  return (
    <li>
      <button
        type="button"
        onClick={() => {
          if (!active) playJuiceSound('tap');
          onPick();
        }}
        {...hc.trigger}
        data-testid={`work-${workId}`}
        data-active={active ? 'true' : undefined}
        aria-current={active ? 'true' : undefined}
        className="jb-work-card jb-focus flex w-full items-start gap-2.5 whitespace-nowrap px-2.5 py-2.5 text-left font-jb"
      >
        <Letter letter={letter} on={active} />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className={cn('truncate text-[14px] leading-[19px] text-jb-fg', active && 'font-semibold')}>{title}</span>
          {meta.picked || meta.text ? (
            <span className="flex items-center gap-1.5 whitespace-nowrap text-[12px] text-jb-muted">
              {meta.picked ? <Badge className="h-[19px] rounded-[6px] bg-jb-inverse px-1.5 text-[11px] font-medium text-jb-on-inverse shadow-xs">{i18n.board.picked}</Badge> : null}
              <span className="truncate">{meta.text || i18n.board.allCovered}</span>
            </span>
          ) : null}
        </span>
      </button>
      <Popover open={!!hc.anchor} anchor={hc.anchor} onClose={hc.close} placement="right-start" width={288} label={o.title} testid={`work-card-${workId}`} onMouseEnter={hc.card.onMouseEnter} onMouseLeave={hc.card.onMouseLeave}>
        <WorkDetails project={project} workId={workId} index={index} />
      </Popover>
    </li>
  );
}

/** 方案悬停卡的正文；元信息属于作品，取舍只属于功能的备选记录。 */
export function WorkDetails({ project, workId, index }: { project: Project; workId: string; index: number }) {
  const work = project.works[workId];
  if (!work) return null;
  const { letter, title } = workLabel(work, index);
  const tradeoffs = alternativeOf(project, workId)?.tradeoffs ?? [];
  return (
    <div className="flex flex-col gap-2 p-3.5 font-jb">
      <div className="text-[13.5px] font-semibold text-jb-fg">
        {letter} · {title}
      </div>
      <p className="text-[12px] leading-[18px] text-jb-muted">{work.summary}</p>
      {tradeoffs.length ? (
        <ul className="flex flex-col gap-1 rounded-[10px] bg-[var(--juice-w4)] p-2.5 text-[12px] leading-[18px] text-jb-fg">
          {tradeoffs.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function OtherTag({ letter, status, tip, onClick, testid }: { letter: string; status: Parameters<typeof StatusIcon>[0]['status']; tip: string; onClick: () => void; testid: string }) {
  const { t: i18n } = useBoardI18n();

  const [tp, tipNode] = useTip(i18n.board.clickToSwitch(tip));
  return (
    <>
      <button
        type="button"
        onClick={() => {
          playJuiceSound('tap');
          onClick();
        }}
        aria-label={tip}
        data-testid={testid}
        {...tp}
        className="jb-focus flex h-5 shrink-0 items-center gap-0.5 whitespace-nowrap rounded-[6px] bg-[var(--juice-w6)] px-1.5 font-jb text-[11px] font-semibold text-jb-muted transition-[background-color,transform,color] duration-150 hover:bg-[var(--juice-w12)] hover:text-jb-fg active:scale-[0.95]"
      >
        {letter}
        <StatusIcon status={status} size={11} labelPrefix={i18n.board.labelPrefix(letter)} />
      </button>
      {tipNode}
    </>
  );
}

function CaseRow({ project, featureId, workId, caseId, active, onCase, onWorkCase }: { project: Project; featureId: string; workId: string | null; caseId: string; active: boolean; onCase: () => void; onWorkCase: (workId: string) => void }) {
  const { t: i18n } = useBoardI18n();

  const c = project.cases[caseId]!;
  const own = workId ? statusOf(project, workId, caseId) : 'none';
  const tags = otherWorkTags(project, featureId, workId, caseId, i18n);
  const hc = useHoverCard();
  const card = caseCard(project, featureId, caseId, i18n);
  const brief = caseBrief(project, caseId);
  return (
    <li
      className={cn(
        'flex items-center gap-1.5 rounded-[11px] pr-2 transition-[background-color,box-shadow] duration-150',
        active
          ? 'bg-jb-surface shadow-[0_1px_3px_rgba(24,22,18,0.06),0_0_0_1px_var(--juice-edge)]'
          : 'hover:bg-[color-mix(in_srgb,var(--jb-fg-default)_4.5%,transparent)]',
      )}
      data-testid={`case-${caseId}`}
      data-status={own}
      data-active={active ? '' : undefined}
      {...hc.trigger}
    >
      <button
        type="button"
        onClick={() => {
          if (!active) playJuiceSound('tap');
          onCase();
        }}
        aria-current={active ? 'true' : undefined}
        className="jb-focus flex min-w-0 flex-1 items-start gap-2.5 rounded-[11px] py-2 pl-2.5 text-left font-jb"
      >
        <span className="flex h-[18px] items-center">
          <StatusIcon status={own} size={16} labelPrefix={workId ? i18n.board.labelPrefix(letterOf(project, workId)) : ''} />
        </span>
        <span className={cn('line-clamp-2 min-w-0 flex-1 text-[13.5px] leading-[18px] text-jb-fg', active && 'font-semibold')}>{c.title}</span>
        {brief.high ? (
          <span className="mt-px flex size-4 shrink-0 items-center justify-center rounded-full bg-[var(--juice-w12)] text-[10px] font-bold leading-none text-jb-fg" title={i18n.board.highPriority} aria-label={i18n.board.highPriority} data-testid={`case-${caseId}-high`}>
            !
          </span>
        ) : null}
      </button>
      {tags.map((t) => (
        <OtherTag key={t.workId} letter={t.letter} status={t.status} tip={t.tip} onClick={() => onWorkCase(t.workId)} testid={`case-${caseId}-${t.workId}`} />
      ))}
      <Popover open={!!hc.anchor} anchor={hc.anchor} onClose={hc.close} placement="right-start" width={308} label={c.title} testid={`case-card-${caseId}`} onMouseEnter={hc.card.onMouseEnter} onMouseLeave={hc.card.onMouseLeave}>
        <div className="flex flex-col gap-1.5 p-2.5 font-jb">
          <div className="px-1.5 pb-0.5 pt-0.5 text-[12px] font-semibold text-jb-muted">{c.title}</div>
          <div className="mx-1 mb-0.5 rounded-[10px] bg-[var(--juice-w6)] px-2.5 py-2 text-[12px] leading-[17px]" data-testid={`case-card-${caseId}-expected`}>
            <span className="font-semibold text-jb-fg">{i18n.board.expected}</span>
            {brief.high ? <span className="text-jb-muted"> · {i18n.board.highPriority}</span> : null}
            <p className={cn('mt-0.5', brief.expected ? 'text-jb-fg' : 'italic text-jb-faint')}>{brief.expected ?? i18n.board.expectedNotWritten}</p>
          </div>
          {card.map((r) => (
            <button
              key={r.workId}
              type="button"
              onClick={() => {
                hc.close();
                if (r.workId !== workId) {
                  playJuiceSound('tap');
                  onWorkCase(r.workId);
                }
              }}
              className={cn('jb-focus flex items-start gap-2 rounded-[10px] px-2 py-1.5 text-left transition-colors', r.workId === workId ? 'bg-jb-selected' : 'hover:bg-[var(--juice-w6)]')}
            >
              <Letter letter={r.letter} on={r.workId === workId} />
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
  workId,
  caseId,
  scenarioId,
  onWork,
  onCase,
  onScenario,
  onWorkCase,
  onCopy,
}: {
  project: Project;
  featureId: string;
  workId: string | null;
  caseId: string | null;
  scenarioId: string | null;
  onWork: (id: string) => void;
  onCase: (id: string) => void;
  onScenario: (id: string) => void;
  /** 切到另一个方案看同一个情况（?o=&c=）。 */
  onWorkCase: (workId: string, caseId: string) => void;
  /** 复制缺口汇总的命令。 */
  onCopy: (text: string) => void;
}) {
  const { t: i18n } = useBoardI18n();

  const f = project.features[featureId]!;
  const works = worksOf(project, featureId);
  const gaps = gapsOf(project, workId);
  const letter = workId ? letterOf(project, workId) : null;
  const covered = new Set(f.caseIds.flatMap((c) => (workId ? (alternativeOf(project, workId)?.coverage[c]?.scenarioIds ?? []) : [])));
  const loose = scenariosOf(project, workId).filter((s) => !covered.has(s.id) && !s.caseIds.some((c) => f.caseIds.includes(c)));
  const who = rolesOfFeature(project, featureId);
  return (
    <div className="flex min-h-full flex-1 flex-col gap-1 font-jb" data-testid="case-nav">
      {/* 给谁、解决什么（D67）：功能名已在顶栏面包屑里，这里只写目标与角色 */}
      <div className="flex flex-col gap-1 px-2 pb-1 pt-1" data-testid="feature-brief">
        <p className="line-clamp-3 text-[12px] leading-[18px] text-jb-muted" title={f.goal}>{f.goal}</p>
        {who.length ? <p className="truncate text-[12px] leading-[18px] text-jb-fg" title={i18n.player.forRoles(who)} data-testid="feature-roles">{i18n.player.forRoles(who)}</p> : null}
      </div>
      <GroupHead title={i18n.board.options} right={i18n.board.itemCount(works.length)} />
      {works.length === 0 ? <p className="px-2 text-[13px] text-jb-muted">{i18n.board.thisFeatureHasNoOptionsYet}</p> : null}
      <ul className="flex flex-col gap-1.5" data-testid="work-switch">
        {works.map((o, i) => (
          <WorkRow key={o.id} project={project} workId={o.id} index={i} active={o.id === workId} onPick={() => onWork(o.id)} />
        ))}
      </ul>
      <div className="h-3 shrink-0" />
      <GroupHead title={i18n.board.cases} right={letter ? i18n.board.coverageFor(letter) : undefined} />
      {f.caseIds.length === 0 ? <p className="px-2 text-[13px] text-jb-muted">{i18n.board.thisFeatureHasNoCasesYet}</p> : null}
      <ul className="flex flex-col gap-1">
        {f.caseIds.map((cid) =>
          project.cases[cid] ? <CaseRow key={cid} project={project} featureId={featureId} workId={workId} caseId={cid} active={caseId === cid} onCase={() => onCase(cid)} onWorkCase={(oid) => onWorkCase(oid, cid)} /> : null,
        )}
      </ul>
      {loose.length ? (
        <>
          <div className="h-3 shrink-0" />
          <GroupHead title={i18n.board.otherScenarios} />
          <ul className="flex flex-col gap-1">
            {loose.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => {
                    playJuiceSound('tap');
                    onScenario(s.id);
                  }}
                  data-testid={`scenario-${s.id}`}
                  className={cn(
                    'jb-focus w-full truncate rounded-[10px] px-2.5 py-2 text-left text-[13.5px] text-jb-fg transition-colors',
                    !caseId && scenarioId === s.id
                      ? 'bg-jb-surface font-semibold shadow-[0_1px_3px_rgba(24,22,18,0.06),0_0_0_1px_var(--juice-edge)]'
                      : 'hover:bg-[color-mix(in_srgb,var(--jb-fg-default)_4.5%,transparent)]',
                  )}
                >
                  {s.name}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <div className="min-h-4 flex-1" />
      {workId ? (
        <button
          type="button"
          onClick={() => {
            playJuiceSound('pop');
            onCopy(gapCommand(workId));
          }}
          data-testid="gap-count"
          title={i18n.board.copy(gapCommand(workId))}
          className="jb-focus sticky bottom-0 flex max-w-full shrink-0 flex-wrap items-center gap-x-2.5 gap-y-1 whitespace-nowrap rounded-[12px] bg-[var(--juice-w6)] px-3 py-2.5 text-left text-[12px] shadow-[inset_0_0_0_1px_var(--juice-edge)] transition-[background-color,transform] duration-150 hover:bg-[var(--juice-w12)] active:scale-[0.985]"
        >
          <span className="font-semibold text-jb-fg">{i18n.board.optionLabel(letter ?? '')}</span>
          <span className={cn(gaps.missing ? 'font-semibold text-jb-danger' : 'text-jb-muted')}>
            <RollingCount text={i18n.board.missingCount(gaps.missing)} value={gaps.missing} />
          </span>
          {gaps.missingHigh ? <span className="font-semibold text-jb-fg" data-testid="gap-high">{i18n.board.missingHighCount(gaps.missingHigh)}</span> : null}
          <span className="text-jb-muted">
            <RollingCount text={i18n.board.undecidedCount(gaps.undecided)} value={gaps.undecided} />
          </span>
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
export function CaseRail({ project, featureId, workId, caseId }: { project: Project; featureId: string; workId: string | null; caseId: string | null }) {
  const { t: i18n } = useBoardI18n();

  const f = project.features[featureId];
  if (!f) return null;
  return (
    <span className="flex flex-col items-center gap-1 font-jb" data-testid="case-rail">
      {worksOf(project, featureId).map((o, i) => {
        const { letter, title } = workLabel(o, i);
        return (
          <span key={o.id} title={i18n.board.optionName(letter, title)} className="flex size-9 items-center justify-center">
            <Letter letter={letter} on={o.id === workId} />
          </span>
        );
      })}
      <Separator style={{ width: 24, margin: '4px auto' }} />
      {f.caseIds.map((cid) => {
        const c = project.cases[cid];
        if (!c) return null;
        const own = workId ? statusOf(project, workId, cid) : 'none';
        return (
          <span key={cid} title={c.title} className={cn('flex size-8 items-center justify-center rounded-[9px]', caseId === cid && 'bg-jb-selected')}>
            <StatusIcon status={own} size={16} labelPrefix={i18n.board.labelPrefix(c.title)} />
          </span>
        );
      })}
    </span>
  );
}
