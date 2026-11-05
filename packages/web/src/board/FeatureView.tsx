/**
 * 比较方案（D24 / D12）：功能页列出各方案卡片（舞台缩略图 + 场景列表 = 分支）。
 * “按情况比较”：选一个情况，看每个方案的覆盖状态，一键进入对应场景。
 */
import { useMemo, useState } from 'react';
import { stateAt, type PlayState, type Project } from '@tokenroll/joplo-core';
import { Stage, VIEWPORTS } from '../renderer/Stage';
import type { StageTheme } from '../renderer/rough';
import { browseSceneId, browseState, optionsOf, scenariosOf, shortName } from '../runtime/views';
import { MOCK_CLS } from '../player/labels';
import { cn } from '@/lib/utils';
import { COVERAGE_LABEL } from './labels';
import { CoverageChips } from './LeftPanel';

const THUMB_W = 420;

export function FeatureView({ project, featureId, optionId, theme, onEnter, onOption }: { project: Project; featureId: string | null; optionId: string | null; theme: StageTheme; onEnter: (scenarioId: string) => void; onOption: (optionId: string) => void }) {
  const feature = featureId ? project.features[featureId] : null;
  const [caseId, setCaseId] = useState<string | null>(null);
  if (!feature) return <div className="flex flex-1 items-center justify-center text-[14px] text-[#6b6b6b]">项目还没有功能。让 Agent 在 features/ 下创建功能后，这里会自动刷新。</div>;
  const options = optionsOf(project, feature.id);
  const activeCase = caseId && project.cases[caseId] ? caseId : null;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-5" data-testid="feature-view">
      <div className="mb-3">
        <h2 className="text-[20px] font-bold">{feature.name}</h2>
        <p className="text-[14px] text-[#3a3a3a]">{feature.goal}</p>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-1.5" data-testid="compare-cases">
        <span className="mr-1 text-[13px] font-semibold">按情况比较：</span>
        {feature.caseIds.length === 0 ? <span className="text-[13px] text-[#6b6b6b]">功能还没有列出情况</span> : null}
        {feature.caseIds.map((cid) => (
          <button
            key={cid}
            type="button"
            data-testid={`compare-case-${cid}`}
            onClick={() => setCaseId(activeCase === cid ? null : cid)}
            className={cn('rounded-full border px-2.5 py-0.5 text-[13px]', activeCase === cid ? 'border-[#1e1e1e] bg-[#1e1e1e] text-white' : 'border-[#d0d0d0] hover:bg-black/5')}
          >
            {project.cases[cid]?.title ?? cid}
          </button>
        ))}
      </div>
      {options.length === 0 ? <p className="text-[14px] text-[#6b6b6b]">这个功能还没有方案（features/{feature.id}/options/ 为空）。</p> : null}
      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${THUMB_W + 2}px, 1fr))` }}>
        {options.map((o) => {
          const scs = scenariosOf(project, o.id);
          const cov = activeCase ? o.coverage[activeCase] : undefined;
          const picked = feature.pick === o.id;
          return (
            <article key={o.id} className={cn('flex flex-col overflow-hidden rounded-lg border bg-white', optionId === o.id && 'border-[#6741d9] ring-1 ring-[#6741d9]')} data-testid={`option-card-${o.id}`}>
              <header className="flex items-start gap-2 border-b px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <h3 className="truncate text-[15px] font-semibold">{o.name}</h3>
                    {picked ? <span className="shrink-0 rounded bg-[#1e1e1e] px-1.5 text-[11px] text-white">已选定</span> : null}
                  </div>
                  <p className="line-clamp-2 text-[12px] text-[#6b6b6b]">{o.idea}</p>
                </div>
                <button type="button" onClick={() => onOption(o.id)} className="shrink-0 rounded border px-2 py-1 text-[12px] hover:bg-black/5" data-testid={`card-open-${o.id}`}>
                  演示
                </button>
              </header>
              <Thumb project={project} optionId={o.id} theme={theme} />
              {activeCase ? (
                <div className={cn('border-t px-3 py-2', cov?.status === 'missing' || cov?.status === 'undecided' ? 'bg-[#fffaf2]' : 'bg-[#fafafa]')} data-testid={`compare-result-${o.id}`} data-status={cov?.status ?? 'none'}>
                  <div className="flex items-center gap-2">
                    {cov ? <span className={cn('rounded border px-1.5 text-[12px]', COVERAGE_LABEL[cov.status].cls)}>{COVERAGE_LABEL[cov.status].text}</span> : <span className="text-[12px] text-[#6b6b6b]">无覆盖信息</span>}
                    <span className="min-w-0 flex-1 truncate text-[12px] text-[#3a3a3a]">{cov?.reason ?? (cov?.scenarioIds.length ? cov.scenarioIds.map((s) => project.scenarios[s]?.name ?? s).join('、') : '')}</span>
                    <button
                      type="button"
                      disabled={!cov?.scenarioIds.length}
                      onClick={() => cov?.scenarioIds[0] && onEnter(cov.scenarioIds[0])}
                      className="shrink-0 rounded bg-[#1e1e1e] px-2 py-0.5 text-[12px] text-white disabled:opacity-30"
                      data-testid={`compare-enter-${o.id}`}
                    >
                      进入场景
                    </button>
                  </div>
                </div>
              ) : null}
              <div className="flex flex-col gap-1 border-t px-3 py-2">
                <div className="flex items-center justify-between text-[12px] text-[#6b6b6b]">
                  <span>场景（{scs.length}）</span>
                  <CoverageChips coverage={o.coverage} />
                </div>
                {scs.length === 0 ? <p className="text-[12px] text-[#8a8a8a]">还没有演示场景</p> : null}
                {scs.map((s) => (
                  <button key={s.id} type="button" onClick={() => onEnter(s.id)} className="flex items-center gap-2 rounded px-1 py-0.5 text-left text-[13px] hover:bg-black/5" data-testid={`card-scenario-${s.id}`}>
                    <span className={cn('shrink-0 rounded border px-1 text-[11px]', MOCK_CLS[s.mock.outcome])}>{s.mock.label}</span>
                    <span className="truncate">{s.name}</span>
                    <span className="ml-auto shrink-0 text-[11px] text-[#8a8a8a]">{s.steps.length} 步</span>
                  </button>
                ))}
                {o.routes.length ? <p className="text-[11px] text-[#8a8a8a]">涉及路径：{o.routes.join('、')}</p> : null}
              </div>
            </article>
          );
        })}
      </div>
      <p className="mt-3 text-[12px] text-[#8a8a8a]">缩略图是各方案第一个场景的初始画面；{options.length > 1 ? `当前选定：${options.find((o) => o.id === feature.pick)?.name ?? '（未选定）'}` : ''}</p>
    </div>
  );
}

/** 方案缩略图：第一个场景的初始画面；没有场景时用该方案涉及的第一个路径的画面。 */
function Thumb({ project, optionId, theme }: { project: Project; optionId: string; theme: StageTheme }) {
  const state = useMemo<PlayState | null>(() => {
    const sc = scenariosOf(project, optionId)[0];
    if (sc) {
      try {
        return stateAt(project, sc.id, 0);
      } catch {
        return null;
      }
    }
    const route = project.options[optionId]?.routes[0];
    const id = route ? (project.scenes[`${optionId}@${route}`] ? `${optionId}@${route}` : browseSceneId(project, route)) : null;
    return id ? browseState(project, id) : null;
  }, [project, optionId]);
  if (!state) return <div className="flex h-[160px] items-center justify-center bg-[#f4f4f2] text-[12px] text-[#8a8a8a]">没有可显示的画面</div>;
  const vp = VIEWPORTS[project.scenes[state.sceneId]?.viewport === 'mobile' ? 'mobile' : 'desktop'];
  const scale = vp.width > 600 ? THUMB_W / vp.width : 240 / vp.height;
  return (
    <div className="flex justify-center bg-[#f1f1ef] p-2" aria-label={`${shortName(project.options[optionId]?.name ?? '')} 缩略图`}>
      <div style={{ width: vp.width * scale, height: vp.height * scale }} className="pointer-events-none overflow-hidden shadow">
        <div style={{ width: vp.width, height: vp.height, transform: `scale(${scale})`, transformOrigin: '0 0' }}>
          <Stage project={project} state={state} theme={theme} mode="render" animate={false} />
        </div>
      </div>
    </div>
  );
}
