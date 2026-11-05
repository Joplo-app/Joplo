/**
 * 发布站（`joplo build` 的产物）：只读，观众用。D22 / D23 / D33：
 * - 按路径浏览整体布局；功能列表和目标；每个场景都能手动、逐步、自动播放；常驻“概念原型”标识；
 * - 只消费 publish 模式的 IR（只含选定方案，已去掉创作侧信息）；没有选中、审阅、写接口。
 * - hash 路由（#/p/<路径>、#/f/<功能>、#/s/<场景>），file:// 直接打开也能工作。
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { Project } from '@tokenroll/joplo-core';
import { DemoController } from '../runtime/demo';
import { routeTree, scenariosOf } from '../runtime/views';
import { Stage, viewportOf } from '../renderer/Stage';
import type { StageTheme } from '../renderer/rough';
import { StepBar } from '../player/StepBar';
import { Overlay } from '../player/Overlay';
import { StageViewport } from '../player/StageViewport';
import { MOCK_CLS } from '../player/labels';
import { cn } from '@/lib/utils';

export type SiteData = { project: Project; home: string | null };

export function readInlineIR(): SiteData | null {
  const el = document.getElementById('joplo-ir');
  if (!el?.textContent) return null;
  try {
    return JSON.parse(el.textContent) as SiteData;
  } catch {
    return null;
  }
}

type Route = { kind: 'page'; path: string } | { kind: 'feature'; id: string } | { kind: 'scenario'; id: string };

function parseHash(hash: string): Route | null {
  const h = decodeURIComponent(hash.replace(/^#/, ''));
  if (h.startsWith('/s/')) return { kind: 'scenario', id: h.slice(3) };
  if (h.startsWith('/f/')) return { kind: 'feature', id: h.slice(3) };
  if (h.startsWith('/p/')) return { kind: 'page', path: h.slice(2) || '/' };
  return null;
}
export const hrefOf = (r: Route) => (r.kind === 'page' ? `#/p${r.path}` : r.kind === 'feature' ? `#/f/${encodeURIComponent(r.id)}` : `#/s/${encodeURIComponent(r.id)}`);

export function SiteApp({ data }: { data: SiteData | null }) {
  if (!data) return <div className="p-8 text-[#c92a2a]">页面缺少原型数据。请重新运行 joplo build。</div>;
  return <Site project={data.project} home={data.home} />;
}

function Site({ project, home }: { project: Project; home: string | null }) {
  const ctl = useMemo(() => new DemoController(null), []);
  const snap = useSyncExternalStore(ctl.subscribe, ctl.getSnapshot);
  const [route, setRoute] = useState<Route | null>(() => parseHash(location.hash));
  const [theme, setTheme] = useState<StageTheme>(project.theme);
  const [stageEl, setStageEl] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    ctl.setProject(project, 1, home);
  }, [ctl, project, home]);
  useEffect(() => {
    const on = () => setRoute(parseHash(location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  // hash → 控制器
  useEffect(() => {
    if (!snap.project) return;
    if (route?.kind === 'scenario' && project.scenarios[route.id]) {
      if (snap.scenarioId !== route.id || snap.view !== 'stage') ctl.setScenario(route.id);
    } else if (route?.kind === 'page') ctl.browse(route.path);
    else if (route?.kind === 'feature' && project.features[route.id]) ctl.setFeature(route.id);
    else if (!route && snap.home) ctl.browse(snap.home);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, snap.project]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input,textarea,select,[data-joplo-stage]')) return;
      if (e.key === 'ArrowRight') void ctl.next();
      else if (e.key === 'ArrowLeft') ctl.prev();
      else if (e.key === ' ' && t.tagName !== 'BUTTON') {
        e.preventDefault();
        ctl.togglePlay();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ctl]);

  const features = Object.values(project.features);
  const pages = routeTree(project);
  const state = snap.state;
  const scenario = snap.view === 'stage' ? ctl.scenario() : null;
  const next = ctl.nextStep();
  const nextTargetId = next && 'target' in next.action ? next.action.target : null;
  const shownStep = scenario && snap.activeStep !== null ? scenario.steps[snap.activeStep] : null;
  const currentPath = state ? project.scenes[state.sceneId]?.route : null;
  const featurePage = route?.kind === 'feature' ? project.features[route.id] : null;

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-[52px] shrink-0 items-center gap-3 border-b bg-white px-4">
        <span className="text-[16px] font-semibold" data-testid="site-name">
          {project.name}
        </span>
        {project.description ? <span className="hidden truncate text-[13px] text-[#6b6b6b] lg:block">{project.description}</span> : null}
        <div className="ml-auto flex items-center gap-2">
          <div role="radiogroup" aria-label="原型主题" className="flex rounded-md border p-0.5 text-[12px]">
            {(['sketch', 'clean'] as const).map((t) => (
              <button key={t} type="button" role="radio" aria-checked={theme === t} onClick={() => setTheme(t)} className={cn('rounded px-1.5 py-0.5', theme === t ? 'bg-[#1e1e1e] text-white' : 'hover:bg-black/5')}>
                {t === 'sketch' ? '手绘' : '线框'}
              </button>
            ))}
          </div>
          <span className="rounded border border-dashed border-[#b35c00] bg-[#fff8ee] px-2 py-1 text-[12px] font-medium text-[#8a4700]" data-testid="concept-badge">
            概念原型 · 非正式实现
          </span>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <nav className="flex w-[260px] shrink-0 flex-col gap-4 overflow-y-auto border-r bg-white p-3 text-[14px]" aria-label="目录">
          <section>
            <h3 className="mb-1 text-[12px] font-semibold text-[#6b6b6b]">整体布局</h3>
            <ul className="flex flex-col gap-0.5">
              {pages.map((p) => (
                <li key={p.path} style={{ paddingLeft: p.depth * 12 }}>
                  <a href={hrefOf({ kind: 'page', path: p.path })} data-testid={`site-page-${p.path}`} className={cn('flex gap-2 rounded px-2 py-1 hover:bg-black/5', snap.view === 'browse' && currentPath === p.path && 'bg-[#ececec] font-semibold')}>
                    <span className="font-mono text-[13px]">{p.path}</span>
                    <span className="truncate text-[#6b6b6b]">{p.title}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="mb-1 text-[12px] font-semibold text-[#6b6b6b]">功能</h3>
            {features.length === 0 ? <p className="text-[13px] text-[#6b6b6b]">还没有发布任何功能。</p> : null}
            <ul className="flex flex-col gap-2">
              {features.map((f) => (
                <li key={f.id}>
                  <a href={hrefOf({ kind: 'feature', id: f.id })} className="block rounded px-2 py-1 font-semibold hover:bg-black/5" data-testid={`site-feature-${f.id}`}>
                    {f.name}
                  </a>
                  <ul className="ml-2 flex flex-col border-l pl-2">
                    {scenariosOf(project, f.pick).map((s) => (
                      <li key={s.id}>
                        <a href={hrefOf({ kind: 'scenario', id: s.id })} data-testid={`site-scenario-${s.id}`} className={cn('block truncate rounded px-1.5 py-0.5 text-[13px] hover:bg-black/5', snap.view === 'stage' && snap.scenarioId === s.id && 'bg-[#ececec] font-semibold')}>
                          {s.name}
                        </a>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </section>
        </nav>
        <main className="flex min-w-0 flex-1 flex-col bg-[#f1f1ef]">
          {featurePage ? (
            <FeaturePage project={project} featureId={featurePage.id} />
          ) : state && project.scenes[state.sceneId] ? (
            <>
              <StageViewport
                viewport={viewportOf(project, state)}
                mode="demo"
                notice={snap.notice}
                onDismiss={() => ctl.dismissNotice()}
                tag={snap.view === 'browse' ? <span className="rounded bg-[#1c5fb8] px-2 py-0.5 font-semibold text-white">整体布局 · {currentPath}</span> : null}
              >
                <Stage
                  project={project}
                  state={state}
                  theme={theme}
                  mode="demo"
                  preview={snap.preview}
                  epoch={snap.epoch}
                  animate={!ctl.reducedMotion}
                  nextTargetId={nextTargetId}
                  onNodeClick={(id, pt) => void ctl.clickNode(id, pt)}
                  stageRef={(el) => {
                    ctl.setStageEl(el);
                    setStageEl(el);
                  }}
                  overlay={<Overlay snap={snap} stage={stageEl} nextTargetId={nextTargetId} caption={shownStep?.caption ?? null} setCursorEl={ctl.setCursorEl} onBackToDemo={() => ctl.backToDemo()} onDismiss={() => ctl.dismissNotice()} />}
                />
              </StageViewport>
              {scenario ? <StepBar snap={snap} scenario={scenario} onReset={() => ctl.reset()} onPrev={() => ctl.prev()} onNext={() => void ctl.next()} onPlay={() => ctl.togglePlay()} onChip={(i) => ctl.goto(i + 1)} /> : null}
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-[14px] text-[#6b6b6b]">没有可显示的页面。</div>
          )}
        </main>
      </div>
    </div>
  );
}

function FeaturePage({ project, featureId }: { project: Project; featureId: string }) {
  const f = project.features[featureId]!;
  const option = f.pick ? project.options[f.pick] : null;
  const scs = scenariosOf(project, f.pick);
  return (
    <div className="mx-auto w-full max-w-[760px] overflow-y-auto p-8" data-testid="site-feature-page">
      <h1 className="text-[24px] font-bold">{f.name}</h1>
      <p className="mt-1 text-[15px] text-[#3a3a3a]">{f.goal}</p>
      {option ? (
        <div className="mt-4 rounded-lg border bg-white p-4">
          <div className="text-[15px] font-semibold">{option.name}</div>
          <p className="mt-1 text-[14px] text-[#3a3a3a]">{option.idea}</p>
        </div>
      ) : null}
      <h2 className="mt-6 mb-2 text-[15px] font-semibold">演示场景</h2>
      <ul className="flex flex-col gap-2">
        {scs.map((s) => (
          <li key={s.id}>
            <a href={hrefOf({ kind: 'scenario', id: s.id })} className="flex items-center gap-2 rounded-md border bg-white px-3 py-2 hover:bg-[#fafafa]">
              <span className={cn('rounded border px-1.5 text-[12px]', MOCK_CLS[s.mock.outcome])}>{s.mock.label}</span>
              <span className="font-medium">{s.name}</span>
              <span className="ml-auto text-[12px] text-[#8a8a8a]">{s.steps.length} 步 · 播放 ›</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
