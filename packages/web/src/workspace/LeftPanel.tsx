import { COVERAGE_STATUSES, type Coverage, type Project } from '@joplo/core';
import { cn } from '@/lib/utils';
import { COVERAGE_LABEL, DIMENSION_LABEL, MOCK_CLS } from './labels';

export function LeftPanel({ project, optionId, scenarioId, onScenario }: { project: Project; optionId: string | null; scenarioId: string | null; onScenario: (id: string) => void }) {
  const option = optionId ? project.options[optionId] : null;
  const feature = option ? project.features[option.featureId] : null;
  const scenarios = Object.values(project.scenarios).filter((s) => s.optionId === optionId);
  const caseIds = feature?.caseIds ?? [];
  const coverageOf = (caseId: string): Coverage => option?.coverage[caseId] ?? { status: 'missing', scenarioIds: [], reason: '方案没有声明这个情况的覆盖状态' };
  const counts = COVERAGE_STATUSES.map((s) => [s, caseIds.filter((c) => coverageOf(c).status === s).length] as const).filter(([, n]) => n > 0);

  return (
    <aside className="flex w-[270px] shrink-0 flex-col overflow-y-auto border-r bg-white" aria-label="场景与情况">
      <section className="border-b p-3" data-testid="scenario-list">
        <h2 className="mb-2 text-[13px] font-semibold text-[#5a5a5a]">场景（{scenarios.length}）</h2>
        {scenarios.length === 0 ? <p className="text-[13px] text-[#6b6b6b]">这个方案还没有演示场景。</p> : null}
        <ul className="flex flex-col gap-1.5">
          {scenarios.map((s) => {
            const active = s.id === scenarioId;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  data-testid={`scenario-${s.id}`}
                  aria-current={active ? 'true' : undefined}
                  onClick={() => onScenario(s.id)}
                  className={cn('w-full rounded-md border px-2.5 py-2 text-left transition-colors', active ? 'border-[#1e1e1e] bg-[#f4f4f4] shadow-[2px_2px_0_#1e1e1e]' : 'border-[#e0e0e0] hover:bg-[#fafafa]')}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[14px] font-medium leading-snug">{s.name}</span>
                    <span className="shrink-0 text-[12px] text-[#8a8a8a]">{s.steps.length} 步</span>
                  </div>
                  <span className={cn('mt-1 inline-block rounded border px-1.5 py-px text-[12px]', MOCK_CLS[s.mock.outcome])}>{s.mock.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="p-3" data-testid="case-list">
        <h2 className="mb-1 text-[13px] font-semibold text-[#5a5a5a]">情况覆盖（{caseIds.length}）</h2>
        <p className="mb-2 text-[12px] text-[#6b6b6b]">
          {counts.map(([s, n]) => `${COVERAGE_LABEL[s].text} ${n}`).join(' · ') || '功能还没有列出情况'}
        </p>
        <p className="mb-2 text-[11px] leading-snug text-[#8a8a8a]">“已表达”只表示方案里有对应演示，不代表业务规则已确认正确。</p>
        <ul className="flex flex-col gap-1.5">
          {caseIds.map((cid) => {
            const c = project.cases[cid];
            const cov = coverageOf(cid);
            const lab = COVERAGE_LABEL[cov.status];
            const loud = cov.status === 'missing' || cov.status === 'undecided';
            const clickable = cov.status === 'expressed' && cov.scenarioIds.some((id) => project.scenarios[id]);
            const body = (
              <>
                <div className="flex items-start gap-2">
                  <span className={cn('mt-px shrink-0 rounded border px-1.5 py-px text-[12px]', lab.cls)} title={lab.hint} data-coverage={cov.status}>
                    {lab.text}
                  </span>
                  <span className="text-[13px] leading-snug">{c?.title ?? cid}</span>
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-2 pl-1 text-[11px] text-[#8a8a8a]">
                  {c ? <span>{DIMENSION_LABEL[c.dimension] ?? c.dimension}</span> : <span className="text-[#c92a2a]">情况不存在</span>}
                  {c?.priority === 'high' ? <span className="text-[#5a5a5a]">高优先级</span> : null}
                  {clickable ? <span className="text-[#1c5fb8]">→ {cov.scenarioIds.map((id) => project.scenarios[id]?.name ?? id).join('、')}</span> : null}
                </div>
                {cov.reason ? (
                  <div className={cn('mt-1 pl-1 text-[12px] leading-snug', loud ? 'text-[#8a4700]' : 'text-[#6b6b6b]')}>{loud ? `原因：${cov.reason}` : cov.reason}</div>
                ) : loud ? (
                  <div className="mt-1 pl-1 text-[12px] leading-snug text-[#8a4700]">原因：{cov.status === 'missing' ? '方案还没有演示这个情况，也没有说明原因' : '未说明待决定的问题'}</div>
                ) : null}
              </>
            );
            return (
              <li key={cid} data-testid={`case-${cid}`}>
                {clickable ? (
                  <button type="button" className="w-full rounded-md border border-transparent px-1.5 py-1.5 text-left hover:border-[#c8d8f0] hover:bg-[#f5f9ff]" onClick={() => onScenario(cov.scenarioIds.find((id) => project.scenarios[id])!)} title="跳到对应场景">
                    {body}
                  </button>
                ) : (
                  <div className={cn('rounded-md px-1.5 py-1.5', loud && 'border-l-[3px] bg-[#fffaf3]', cov.status === 'missing' && 'border-l-[#c92a2a] bg-[#fff6f6]', cov.status === 'undecided' && 'border-l-[#b35c00]')}>{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </aside>
  );
}
