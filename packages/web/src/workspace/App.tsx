import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { fetchProject, subscribeRevisions } from '../api';
import { DemoController } from '../runtime/demo';
import { Stage, VIEWPORTS, viewportOf } from '../renderer/Stage';
import type { StageTheme } from '../renderer/rough';
import { TopBar } from './TopBar';
import { LeftPanel } from './LeftPanel';
import { StepBar } from './StepBar';
import { Inspector } from './Inspector';
import { Overlay } from './Overlay';

const THEME_KEY = 'joplo.theme';

export function WorkspaceApp() {
  const ctl = useMemo(() => new DemoController(), []);
  const snap = useSyncExternalStore(ctl.subscribe, ctl.getSnapshot);
  const [loadError, setLoadError] = useState<{ message: string; issues?: { path: string; message: string }[] } | null>(null);
  const [live, setLive] = useState(false);
  const [theme, setThemeState] = useState<StageTheme>(() => (localStorage.getItem(THEME_KEY) === 'clean' ? 'clean' : 'sketch'));
  const [stageEl, setStageEl] = useState<HTMLDivElement | null>(null);
  const setTheme = (t: StageTheme) => {
    setThemeState(t);
    localStorage.setItem(THEME_KEY, t);
  };

  // 首次载入 + SSE 实时刷新
  useEffect(() => {
    let alive = true;
    let last = '';
    const load = async () => {
      const r = await fetchProject();
      if (!alive) return;
      if (r.ok) {
        setLoadError(null);
        const sig = JSON.stringify(r.project);
        if (sig !== last) {
          last = sig;
          ctl.setProject(r.project, r.revision);
        }
      } else setLoadError({ message: r.error.message, issues: r.error.issues });
    };
    void load();
    const off = subscribeRevisions(() => void load(), setLive);
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
      } else return;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ctl]);

  const { project, state } = snap;
  const scenario = ctl.scenario();
  const next = ctl.nextStep();
  const nextTargetId = next && 'target' in next.action ? next.action.target : null;
  const shownStep = scenario ? (snap.activeStep !== null ? scenario.steps[snap.activeStep] : null) : null;
  const caption = snap.mode === 'demo' && shownStep ? shownStep.caption : null;

  return (
    <div className="flex h-full flex-col" data-mode={snap.mode}>
      <TopBar project={project} revision={snap.revision} live={live} optionId={snap.optionId} mode={snap.mode} theme={theme} onOption={(id) => ctl.setOption(id)} onMode={(m) => ctl.setMode(m)} onTheme={setTheme} />
      {loadError ? (
        <div role="alert" className="border-b border-[#c92a2a] bg-[#fff0f0] px-4 py-2 text-[13px] text-[#a51d1d]" data-testid="load-error">
          <strong>项目文件无法读取：</strong>
          {loadError.message}
          {project ? '（仍显示上一个有效修订）' : ''}
          {loadError.issues?.length ? (
            <ul className="mt-1 list-disc pl-5 font-mono text-[12px]">
              {loadError.issues.slice(0, 5).map((i, k) => (
                <li key={k}>
                  {i.path || '(根)'}：{i.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {snap.playbackError ? (
        <div role="alert" className="border-b border-[#b35c00] bg-[#fff8ee] px-4 py-2 text-[13px] text-[#8a4700]" data-testid="playback-error">
          <strong>演示回放出错：</strong>
          {snap.playbackError}
        </div>
      ) : null}

      {!project ? (
        <Center>{loadError ? '没有可显示的项目。修复项目文件后会自动刷新。' : '正在载入项目…'}</Center>
      ) : Object.keys(project.options).length === 0 ? (
        <Center>
          <div className="text-[16px] font-semibold">项目里还没有任何方案</div>
          <div className="mt-1 text-[13px] text-[#6b6b6b]">让 Agent 为功能创建方案和演示场景后，这里会自动刷新。</div>
        </Center>
      ) : (
        <div className="flex min-h-0 flex-1">
          <LeftPanel project={project} optionId={snap.optionId} scenarioId={snap.scenarioId} onScenario={(id) => ctl.setScenario(id)} />
          <main className="flex min-w-0 flex-1 flex-col bg-[#f1f1ef]">
            {scenario && state ? (
              <>
                <StageViewport project={project} viewport={viewportOf(project, state)} mode={snap.mode} notice={snap.notice} onDismiss={() => ctl.dismissNotice()}>
                  <Stage
                    project={project}
                    state={state}
                    theme={theme}
                    mode={snap.mode}
                    selectedId={snap.mode === 'review' && snap.selection?.sceneId === state.sceneId ? snap.selection.nodeId : null}
                    preview={snap.preview}
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
                <StepBar snap={snap} scenario={scenario} onReset={() => ctl.reset()} onPrev={() => ctl.prev()} onNext={() => void ctl.next()} onPlay={() => ctl.togglePlay()} onChip={(i) => ctl.clickStepChip(i)} />
              </>
            ) : (
              <Center>这个方案还没有演示场景。</Center>
            )}
          </main>
          <Inspector project={project} optionId={snap.optionId} state={state} selection={snap.selection} onClear={() => ctl.clearSelection()} onScenario={(id) => ctl.setScenario(id)} />
        </div>
      )}
    </div>
  );
}

function Center({ children }: { children: ReactNode }) {
  return <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-[14px] text-[#3a3a3a]">{children}</div>;
}

/** 把固定尺寸的画框按比例缩放到可用区域；mobile 加手机外框。 */
function StageViewport({ viewport, mode, notice, onDismiss, children }: { project: unknown; viewport: 'desktop' | 'mobile'; mode: string; notice: ReturnType<DemoController['getSnapshot']>['notice']; onDismiss: () => void; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState({ w: 800, h: 500 });
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAvail({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setAvail({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  const vp = VIEWPORTS[viewport];
  const bezel = viewport === 'mobile' ? 14 : 0;
  const pad = 18;
  const scale = Math.max(0.2, Math.min((avail.w - pad * 2 - bezel * 2) / vp.width, (avail.h - pad * 2 - bezel * 2 - 8) / vp.height, 1.25));
  const floating = notice && !('nodeId' in notice) ? notice : null;
  return (
    <div ref={box} className="relative min-h-0 flex-1 overflow-hidden">
      <div className="absolute left-3 top-2 z-10 flex items-center gap-2 text-[12px]">
        <span className="rounded px-2 py-0.5 font-semibold text-white" style={{ background: mode === 'review' ? '#6741d9' : '#e8590c' }} data-testid="stage-mode">
          {mode === 'review' ? '审阅中' : '演示中'}
        </span>
        <span className="text-[#6b6b6b]">
          {viewport === 'mobile' ? '移动端 390×844' : '桌面端 1280×800'} · {Math.round(scale * 100)}%
        </span>
      </div>
      {floating ? (
        <div
          role="status"
          data-testid="notice"
          data-notice-kind={floating.kind}
          className={`absolute left-1/2 top-2 z-10 flex max-w-[70%] -translate-x-1/2 items-center gap-2 rounded-md border px-3 py-1.5 text-[13px] shadow ${floating.kind === 'error' ? 'border-[#c92a2a] bg-[#fff0f0] text-[#a51d1d]' : floating.kind === 'selected' ? 'border-[var(--sel)] bg-[#f6f3ff] text-[#5f3dc4]' : 'border-[#d0d0d0] bg-white text-[#1e1e1e]'}`}
        >
          <span>{floating.text}</span>
          <button type="button" className="text-[#8a8a8a] hover:text-black" aria-label="关闭提示" onClick={onDismiss}>
            ×
          </button>
        </div>
      ) : null}
      <div className="absolute inset-0 flex items-center justify-center pt-4">
        <div
          className={viewport === 'mobile' ? 'rounded-[44px] bg-[#1e1e1e] shadow-xl' : 'shadow-[0_2px_0_#d6d6d2,0_10px_30px_rgba(0,0,0,0.08)]'}
          style={{ padding: bezel, outline: mode === 'review' ? '2px solid #6741d9' : '2px solid transparent', outlineOffset: 4 }}
        >
          <div className={viewport === 'mobile' ? 'overflow-hidden rounded-[32px]' : ''} style={{ width: vp.width * scale, height: vp.height * scale }}>
            <div style={{ width: vp.width, height: vp.height, transform: `scale(${scale})`, transformOrigin: '0 0' }}>{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
