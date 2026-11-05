/**
 * 演示页左栏（看板，D39 方案 B“按情况分组”）：
 * - 顶部：功能名 · 当前方案，SegmentedControl 切换方案（情况保持不变）；
 * - 情况列表：每条标出各方案的状态（✓ / 缺失 / 待决定 / 不适用）；点一条就播放当前方案里覆盖它的场景，
 *   同一个场景覆盖多个情况时会出现在多行；
 * - 没有关联情况的场景单独列出；
 * - 底部：当前方案的缺口总数。
 */
import type { Coverage, Project } from '@joplo-app/core';
import { optionsOf, scenariosOf, shortName } from '../runtime/views';
import { Segmented } from '../player/PlayerPage';
import { cn } from '@/lib/utils';

const MARK: Record<Coverage['status'] | 'none', { text: string; cls: string }> = {
  expressed: { text: '✓', cls: 'text-[#2b8a3e]' },
  missing: { text: '缺失', cls: 'text-[#c92a2a]' },
  undecided: { text: '待决定', cls: 'text-[#b35c00]' },
  not_applicable: { text: '不适用', cls: 'text-[#868e96]' },
  excluded: { text: '不适用', cls: 'text-[#868e96]' },
  none: { text: '缺失', cls: 'text-[#c92a2a]' },
};

export const statusOf = (project: Project, optionId: string, caseId: string): Coverage['status'] | 'none' => project.options[optionId]?.coverage[caseId]?.status ?? 'none';

export function gapsOf(project: Project, optionId: string | null): { missing: number; undecided: number } {
  const f = optionId ? project.features[project.options[optionId]?.featureId ?? ''] : null;
  if (!f || !optionId) return { missing: 0, undecided: 0 };
  let missing = 0;
  let undecided = 0;
  for (const c of f.caseIds) {
    const s = statusOf(project, optionId, c);
    if (s === 'missing' || s === 'none') missing++;
    else if (s === 'undecided') undecided++;
  }
  return { missing, undecided };
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
}: {
  project: Project;
  featureId: string;
  optionId: string | null;
  caseId: string | null;
  scenarioId: string | null;
  onOption: (id: string) => void;
  onCase: (id: string) => void;
  onScenario: (id: string) => void;
}) {
  const f = project.features[featureId]!;
  const options = optionsOf(project, featureId);
  const gaps = gapsOf(project, optionId);
  const covered = new Set(f.caseIds.flatMap((c) => (optionId ? (project.options[optionId]?.coverage[c]?.scenarioIds ?? []) : [])));
  const loose = scenariosOf(project, optionId).filter((s) => !covered.has(s.id) && !s.caseIds.some((c) => f.caseIds.includes(c)));
  return (
    <div className="flex flex-1 flex-col gap-1" data-testid="case-nav">
      <div className="truncate text-[12px] text-[#6b6b6b]">{f.name} · 当前方案</div>
      {options.length > 1 ? (
        <Segmented
          full
          label="当前方案"
          testid="option-switch"
          value={optionId ?? ''}
          onChange={onOption}
          items={options.map((o) => ({ value: o.id, label: <span className="truncate">{o.name}{f.pick === o.id ? ' ✓' : ''}</span>, title: o.name, testid: `option-${o.id}` }))}
        />
      ) : options[0] ? (
        <div className="truncate rounded-lg bg-[#f1f3f5] px-3 py-2 text-[14px] font-semibold" title={options[0].name}>
          {options[0].name}
        </div>
      ) : (
        <div className="text-[14px] text-[#6b6b6b]">这个功能还没有方案。</div>
      )}
      <div className="mt-3 flex items-center gap-2 text-[12px] text-[#6b6b6b]">
        情况
        <span className="h-px flex-1 bg-[#e9ecef]" />
      </div>
      {f.caseIds.length === 0 ? <p className="px-2 text-[14px] text-[#6b6b6b]">功能还没有列出情况。</p> : null}
      <ul className="flex flex-col gap-0.5">
        {f.caseIds.map((cid) => {
          const c = project.cases[cid];
          if (!c) return null;
          const active = caseId === cid;
          const own = optionId ? statusOf(project, optionId, cid) : 'none';
          return (
            <li key={cid}>
              <button
                type="button"
                onClick={() => onCase(cid)}
                data-testid={`case-${cid}`}
                data-status={own}
                data-active={active ? '' : undefined}
                className={cn('w-full rounded-md px-3 py-2 text-left hover:bg-[#f1f3f5]', active && 'bg-[#e7f0ff] hover:bg-[#e7f0ff]')}
              >
                <div className={cn('text-[14px] leading-snug', active && 'font-semibold')}>{c.title}</div>
                <div className="mt-0.5 flex flex-wrap gap-x-1.5 text-[12px] text-[#868e96]">
                  {options.map((o, i) => {
                    const m = MARK[statusOf(project, o.id, cid)];
                    return (
                      <span key={o.id} data-testid={`case-${cid}-${o.id}`}>
                        {i > 0 ? '· ' : ''}
                        {shortName(o.name)} <span className={m.cls}>{m.text}</span>
                      </span>
                    );
                  })}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
      {loose.length ? (
        <>
          <div className="mt-3 flex items-center gap-2 text-[12px] text-[#6b6b6b]">
            其他场景
            <span className="h-px flex-1 bg-[#e9ecef]" />
          </div>
          <ul className="flex flex-col gap-0.5">
            {loose.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => onScenario(s.id)} data-testid={`scenario-${s.id}`} className={cn('w-full truncate rounded-md px-3 py-2 text-left text-[14px] hover:bg-[#f1f3f5]', !caseId && scenarioId === s.id && 'bg-[#e7f0ff] font-semibold')}>
                  {s.name}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <div className="mt-auto flex gap-2 pt-4" data-testid="gap-count">
        <span className={cn('rounded-full px-2.5 py-0.5 text-[12px]', gaps.missing ? 'bg-[#fff0f0] text-[#c92a2a]' : 'bg-[#effaf1] text-[#2b8a3e]')}>缺失 {gaps.missing}</span>
        <span className={cn('rounded-full px-2.5 py-0.5 text-[12px]', gaps.undecided ? 'bg-[#fff4e0] text-[#b35c00]' : 'bg-[#f1f3f5] text-[#6b6b6b]')}>待决定 {gaps.undecided}</span>
      </div>
    </div>
  );
}
