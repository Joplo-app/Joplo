/**
 * 本地看板（`joplo dev`）。D32 方案 B“模式决定信息量”：
 * - 演示模式（默认）：顶栏 + 大舞台 + 紧凑步骤条，没有侧栏；
 * - 审阅模式：左栏路径树与情况，右栏检查器。
 * IR 首次通过 /__joplo/ir 载入，之后由 HMR 自定义事件推送；编译出错时显示错误列表并保留上一次成功的画面。
 */
import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { Diagnostic } from '@joplo/core';
import { DemoController } from '../runtime/demo';
import { fetchIR, fetchSelection, putSelection, subscribeIR, type DevPayload } from '../runtime/dev-client';
import { Stage, viewportOf } from '../renderer/Stage';
import type { StageTheme } from '../renderer/rough';
import { StepBar } from '../player/StepBar';
import { Overlay } from '../player/Overlay';
import { StageViewport } from '../player/StageViewport';
import { routeTree } from '../runtime/views';
import { cn } from '@/lib/utils';
import { TopBar } from './TopBar';
import { LeftPanel } from './LeftPanel';
import { Inspector } from './Inspector';
import { FeatureView } from './FeatureView';

const THEME_KEY = 'joplo.theme';

export function BoardApp() {
  const ctl = useMemo(() => new DemoController(putSelection), []);
  const snap = useSyncExternalStore(ctl.subscribe, ctl.getSnapshot);
  const [diagnostics, setDiagnostics] = useState<{ ok: boolean; list: Diagnostic[] }>({ ok: true, list: [] });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [casesOpen, setCasesOpen] = useState(true);
  const [casesFlash, setCasesFlash] = useState(0);
  const [theme, setThemeState] = useState<StageTheme>(() => (localStorage.getItem(THEME_KEY) === 'clean' ? 'clean' : 'sketch'));
  const [stageEl, setStageEl] = useState<HTMLDivElement | null>(null);
  const setTheme = (t: StageTheme) => {
    setThemeState(t);
    localStorage.setItem(THEME_KEY, t);
  };

  // 首次载入 + 热更新。不变量：只应用版本号更大的结果（晚到的旧结果直接丢弃）。
  useEffect(() => {
    let alive = true;
    let applied = -1;
    let restored = false;
    const apply = (p: DevPayload) => {
      if (!alive || p.version <= applied) return;
      applied = p.version;
      setLoadError(null);
      setDiagnostics({ ok: p.ok, list: p.diagnostics });
      if (p.project && p.ok) ctl.setProject(p.project, p.version, p.home);
      else if (p.project && !ctl.getSnapshot().project) ctl.setProject(p.project, p.version, p.home);
      if (!restored && p.project) {
        restored = true;
        void fetchSelection().then((sel) => {
          if (alive) void ctl.restoreSelection(sel);
        });
      }
      (window as unknown as { __JOPLO_VERSION__?: number }).__JOPLO_VERSION__ = p.version;
    };
    const off = subscribeIR(apply, setLive);
    void fetchIR().then((r) => ('error' in r ? alive && setLoadError(r.error) : apply(r)));
    return () => {
      alive = false;
      off();
    };
  }, [ctl]);

  // 键盘：← → 逐步，空格播放/暂停
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input,textarea,select,[contenteditable],[data-joplo-stage]')) return;
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

  const { project, state } = snap;
  const scenario = snap.view === 'stage' ? ctl.scenario() : null;
  const next = ctl.nextStep();
  const nextTargetId = next && 'target' in next.action ? next.action.target : null;
  const shownStep = scenario && snap.activeStep !== null ? scenario.steps[snap.activeStep] : null;
  const caption = snap.mode === 'demo' && shownStep ? shownStep.caption : null;
  const review = snap.mode === 'review';
  const errors = diagnostics.list.filter((d) => d.severity === 'error');

  return (
    <div className="flex h-full flex-col" data-mode={snap.mode} data-view={snap.view}>
      <TopBar
        snap={snap}
        theme={theme}
        live={live}
        onFeature={(id) => ctl.setFeature(id)}
        onOption={(id) => ctl.setOption(id)}
        onScenario={(id) => ctl.setScenario(id)}
        onView={(v) => ctl.setView(v)}
        onMode={(m) => ctl.setMode(m)}
        onTheme={setTheme}
        onGaps={() => {
          ctl.setMode('review');
          setCasesOpen(true);
          setCasesFlash((n) => n + 1);
        }}
      />
      {loadError ? (
        <div role="alert" className="border-b border-[#c92a2a] bg-[#fff0f0] px-4 py-2 text-[13px] text-[#a51d1d]" data-testid="load-error">
          {loadError}
        </div>
      ) : null}
      {!diagnostics.ok || errors.length ? <DiagnosticsPanel list={diagnostics.list} hasProject={!!project} /> : null}
      {snap.playbackError ? (
        <div role="alert" className="border-b border-[#b35c00] bg-[#fff8ee] px-4 py-1.5 text-[13px] text-[#8a4700]" data-testid="playback-error">
          <strong>演示回放出错：</strong>
          {snap.playbackError}
        </div>
      ) : null}

      {!project ? (
        <Center>{loadError || !diagnostics.ok ? '还没有成功编译过的画面。修好上面的错误后会自动刷新。' : '正在编译项目…'}</Center>
      ) : (
        <div className="flex min-h-0 flex-1">
          {review ? (
            <LeftPanel
              project={project}
              snap={snap}
              casesOpen={casesOpen}
              casesFlash={casesFlash}
              onToggleCases={() => setCasesOpen((o) => !o)}
              onBrowse={(r) => ctl.browse(r)}
              onOption={(id) => ctl.setOption(id, 'stage')}
              onScenario={(id) => ctl.setScenario(id)}
            />
          ) : null}
          <main className="flex min-w-0 flex-1 flex-col bg-[#f1f1ef]">
            {snap.view === 'compare' ? (
              <FeatureView project={project} featureId={snap.featureId} optionId={snap.optionId} theme={theme} onEnter={(id) => ctl.setScenario(id)} onOption={(id) => ctl.setOption(id, 'stage')} />
            ) : state && project.scenes[state.sceneId] ? (
              <>
                <StageViewport
                  viewport={viewportOf(project, state)}
                  mode={snap.mode}
                  notice={snap.notice}
                  onDismiss={() => ctl.dismissNotice()}
                  tag={
                    snap.view === 'browse' ? (
                      <span className="rounded bg-[#1c5fb8] px-2 py-0.5 font-semibold text-white" data-testid="browse-tag">
                        浏览 · {project.scenes[state.sceneId]!.optionId ? '该路径只在未选定方案中存在' : '发布视图（各功能取选定方案）'}
                      </span>
                    ) : review ? (
                      <span className="rounded bg-[#6741d9] px-2 py-0.5 font-semibold text-white" data-testid="stage-mode">
                        审阅中：点击只选中
                      </span>
                    ) : null
                  }
                >
                  <Stage
                    project={project}
                    state={state}
                    theme={theme}
                    mode={snap.mode}
                    selectedId={review && snap.selection?.sceneId === state.sceneId ? snap.selection.nodeId : null}
                    preview={snap.preview}
                    epoch={snap.epoch}
                    animate={!ctl.reducedMotion}
                    nextTargetId={nextTargetId}
                    onNodeClick={(id, pt) => void ctl.clickNode(id, pt)}
                    stageRef={(el) => {
                      ctl.setStageEl(el);
                      setStageEl(el);
                    }}
                    overlay={<Overlay snap={snap} stage={stageEl} nextTargetId={nextTargetId} caption={caption} setCursorEl={ctl.setCursorEl} onBackToDemo={() => ctl.backToDemo()} onDismiss={() => ctl.dismissNotice()} />}
                  />
                </StageViewport>
                {scenario ? (
                  <StepBar snap={snap} scenario={scenario} onReset={() => ctl.reset()} onPrev={() => ctl.prev()} onNext={() => void ctl.next()} onPlay={() => ctl.togglePlay()} onChip={(i) => ctl.clickStepChip(i)} />
                ) : (
                  <BrowseBar routes={routeTree(project).map((r) => r.path)} current={project.scenes[state.sceneId]!.route} onBrowse={(r) => ctl.browse(r)} />
                )}
              </>
            ) : (
              <Center>{Object.keys(project.routes).length === 0 ? '项目还没有任何页面：在 routes/<路径>/page.tsx 里创建第一个页面。' : '没有可显示的画面。'}</Center>
            )}
          </main>
          {review ? <Inspector project={project} optionId={snap.optionId} state={state} selection={snap.selection} sync={snap.selectionSync} onClear={() => void ctl.clearSelection()} onJump={(sc, i) => ctl.setScenario(sc, i)} /> : null}
        </div>
      )}
    </div>
  );
}

function Center({ children }: { children: ReactNode }) {
  return <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-[14px] text-[#3a3a3a]">{children}</div>;
}

function BrowseBar({ routes, current, onBrowse }: { routes: string[]; current: string; onBrowse: (r: string) => void }) {
  return (
    <div className="flex h-[52px] shrink-0 items-center gap-2 overflow-x-auto border-t bg-white px-3 text-[13px]" data-testid="browse-bar">
      <span className="shrink-0 text-[#6b6b6b]">按路径浏览：</span>
      {routes.map((r) => (
        <button key={r} type="button" onClick={() => onBrowse(r)} data-testid={`browse-route-${r}`} className={cn('shrink-0 rounded border px-2 py-0.5 font-mono', r === current ? 'border-[#1e1e1e] bg-[#1e1e1e] text-white' : 'hover:bg-black/5')}>
          {r}
        </button>
      ))}
      <span className="ml-auto shrink-0 text-[12px] text-[#8a8a8a]">静态画面，不能播放；体验交互请切到“演示场景”</span>
    </div>
  );
}

/** 编译错误列表：`文件:行:列` + 说明；仍显示上一次成功的画面。 */
function DiagnosticsPanel({ list, hasProject }: { list: Diagnostic[]; hasProject: boolean }) {
  const errors = list.filter((d) => d.severity === 'error');
  return (
    <div role="alert" className="max-h-[30%] shrink-0 overflow-y-auto border-b border-[#c92a2a] bg-[#fff0f0] px-4 py-2 text-[13px] text-[#a51d1d]" data-testid="diagnostics">
      <strong>编译出错（{errors.length}）</strong>
      {hasProject ? <span className="ml-2 text-[#6b3a3a]">仍显示上一次成功的画面；保存修复后自动恢复。</span> : null}
      <ul className="mt-1 flex flex-col gap-0.5">
        {errors.slice(0, 20).map((d, i) => (
          <li key={i} className="flex gap-2" data-testid="diag-item">
            <code className="shrink-0 font-mono text-[12px] font-semibold">{d.at ?? '（无位置）'}</code>
            <span className="whitespace-pre-wrap break-all">{d.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
