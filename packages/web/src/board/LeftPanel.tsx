/**
 * 审阅模式左栏：
 * - 路径树（产品地图）：每个路径上堆叠了哪些功能，各自的方案（选定 / 查看中）；方案新增的路径标明来源。
 *   点路径 → 浏览发布视图；点方案 → 在舞台中演示该方案。
 * - 当前方案的情况列表与覆盖芯片（缺口胶囊会展开并滚动到这里）。
 */
import { useEffect, useRef } from 'react';
import type { Project } from '@tokenroll/joplo-core';
import type { Snapshot } from '../runtime/demo';
import { routeTree, shortName } from '../runtime/views';
import { cn } from '@/lib/utils';
import { COVERAGE_LABEL, DIMENSION_LABEL } from './labels';

export function LeftPanel({
  project,
  snap,
  casesOpen,
  casesFlash,
  onToggleCases,
  onBrowse,
  onOption,
  onScenario,
}: {
  project: Project;
  snap: Snapshot;
  casesOpen: boolean;
  casesFlash: number;
  onToggleCases: () => void;
  onBrowse: (route: string) => void;
  onOption: (optionId: string) => void;
  onScenario: (scenarioId: string) => void;
}) {
  const tree = routeTree(project);
  const currentRoute = snap.state ? project.scenes[snap.state.sceneId]?.route : null;
  const option = snap.optionId ? project.options[snap.optionId] : null;
  const feature = option ? project.features[option.featureId] : null;
  const casesRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (casesFlash > 0) casesRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [casesFlash]);

  return (
    <aside className="flex w-[300px] shrink-0 flex-col overflow-y-auto border-r bg-white" aria-label="产品地图与情况" data-testid="left-panel">
      <section className="border-b p-3" data-testid="route-tree">
        <h3 className="mb-2 text-[12px] font-semibold text-[#6b6b6b]">产品地图 · 路径树</h3>
        {tree.length === 0 ? <p className="text-[13px] text-[#6b6b6b]">项目还没有任何路径（routes/ 为空）。</p> : null}
        <ul className="flex flex-col gap-1">
          {tree.map((r) => {
            const here = r.path === currentRoute;
            return (
              <li key={r.path} data-testid={`route-${r.path}`} data-route={r.path} style={{ paddingLeft: r.depth * 14 }}>
                <button
                  type="button"
                  onClick={() => onBrowse(r.path)}
                  title={`浏览 ${r.path} 现在的样子（各功能取选定方案）`}
                  className={cn('flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left hover:bg-black/5', here && 'bg-[#f3f0ff]')}
                >
                  <span className="font-mono text-[13px] font-semibold">{r.path}</span>
                  <span className="truncate text-[12px] text-[#6b6b6b]">{r.title}</span>
                  {r.addedBy ? (
                    <span className="ml-auto shrink-0 rounded border border-dashed border-[#6741d9] px-1 text-[11px] text-[#5f3dc4]" data-testid="route-added-by" title={`由方案「${r.addedBy.name}」新增`}>
                      由 {shortName(r.addedBy.name)} 新增
                    </span>
                  ) : null}
                </button>
                {r.features.map((f) => (
                  <div key={f.featureId} className="ml-2 mt-0.5 flex flex-wrap items-center gap-1 border-l-2 border-[#e4e4e4] pl-2 text-[12px]" data-testid="route-feature" data-feature={f.featureId}>
                    <span className="text-[#3a3a3a]">{f.name}</span>
                    {f.options.map((o) => {
                      const picked = project.features[f.featureId]?.pick === o.id;
                      const viewing = snap.optionId === o.id;
                      return (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => onOption(o.id)}
                          title={`${o.name}${picked ? '（选定）' : ''}${viewing ? '（查看中）' : ''}`}
                          data-testid="route-option"
                          data-option={o.id}
                          className={cn('rounded border px-1.5 py-px', viewing ? 'border-[#6741d9] bg-[#6741d9] text-white' : picked ? 'border-[#1e1e1e]' : 'border-dashed border-[#b0b0b0] text-[#5a5a5a]')}
                        >
                          {shortName(o.name)}
                          {picked ? ' ✓' : ''}
                          {viewing ? ' · 查看中' : ''}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-[11px] leading-snug text-[#8a8a8a]">✓ = 选定方案（build 只发布它）。点路径浏览整体现状，点方案进入演示。</p>
      </section>

      <section ref={casesRef} className={cn('p-3 transition-colors', casesFlash > 0 && casesOpen && 'bg-[#fffaf2]')} data-testid="cases-panel" data-open={casesOpen ? '' : undefined}>
        <button type="button" onClick={onToggleCases} className="mb-2 flex w-full items-center justify-between text-[12px] font-semibold text-[#6b6b6b]" aria-expanded={casesOpen} data-testid="cases-toggle">
          <span>情况 · {option ? shortName(option.name) : '—'}</span>
          <span>{casesOpen ? '收起' : '展开'}</span>
        </button>
        {!option || !feature ? (
          <p className="text-[13px] text-[#6b6b6b]">没有选中方案。</p>
        ) : (
          <>
            <CoverageChips coverage={option.coverage} />
            {casesOpen ? (
              <ul className="mt-2 flex flex-col gap-1.5" data-testid="case-list">
                {feature.caseIds.length === 0 ? <li className="text-[13px] text-[#6b6b6b]">功能还没有列出情况。</li> : null}
                {feature.caseIds.map((cid) => {
                  const c = project.cases[cid];
                  if (!c) return null;
                  const cov = option.coverage[cid];
                  const lab = cov ? COVERAGE_LABEL[cov.status] : null;
                  const gap = cov?.status === 'missing' || cov?.status === 'undecided';
                  return (
                    <li key={cid} className={cn('rounded-md border px-2 py-1.5', gap ? 'border-[#f0c4a0] bg-[#fffaf2]' : 'border-[#ececec]')} data-testid={`case-${cid}`} data-status={cov?.status ?? 'none'}>
                      <div className="flex items-start gap-1.5">
                        {lab ? (
                          <span className={cn('shrink-0 rounded border px-1 text-[11px] leading-[16px]', lab.cls)} title={lab.hint}>
                            {lab.text}
                          </span>
                        ) : null}
                        <span className="text-[13px] leading-snug">{c.title}</span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-[#8a8a8a]">
                        <span>{DIMENSION_LABEL[c.dimension] ?? c.dimension}</span>
                        {c.priority === 'high' ? <span className="text-[#c92a2a]">· 高优先级</span> : null}
                        {cov?.basis === 'derived' && cov.status === 'missing' ? <span>· 自动标出</span> : null}
                        {(cov?.scenarioIds ?? []).map((sid) => (
                          <button key={sid} type="button" className="text-[#1c5fb8] underline" onClick={() => onScenario(sid)} data-testid={`case-scenario-${sid}`}>
                            {project.scenarios[sid]?.name ?? sid}
                          </button>
                        ))}
                      </div>
                      {cov?.reason ? <div className="mt-0.5 text-[12px] text-[#6b4a1a]">{cov.reason}</div> : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}
            <p className="mt-2 text-[11px] leading-snug text-[#8a8a8a]">“已表达”只说明有场景演示了它，不代表业务已确认正确。</p>
          </>
        )}
      </section>
    </aside>
  );
}

export function CoverageChips({ coverage }: { coverage: Record<string, { status: keyof typeof COVERAGE_LABEL }> }) {
  const counts = new Map<string, number>();
  for (const c of Object.values(coverage)) counts.set(c.status, (counts.get(c.status) ?? 0) + 1);
  const order = ['missing', 'undecided', 'expressed', 'not_applicable', 'excluded'] as const;
  return (
    <div className="flex flex-wrap gap-1" data-testid="coverage-chips">
      {order
        .filter((s) => counts.get(s))
        .map((s) => (
          <span key={s} className={cn('rounded border px-1.5 text-[11px] leading-[18px]', COVERAGE_LABEL[s].cls)} title={COVERAGE_LABEL[s].hint} data-testid={`coverage-${s}`}>
            {COVERAGE_LABEL[s].text} {counts.get(s)}
          </span>
        ))}
    </div>
  );
}
