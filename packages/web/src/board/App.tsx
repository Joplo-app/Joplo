/**
 * 本地看板（`joplo dev`，D39）：一个进程、多个项目。
 * - 首页 `#/`、`#/<项目>`：最近打开的项目与所选项目的功能（Home.tsx）。
 * - 演示页 `#/<项目>/f/<功能>?o=&c=&s=&step=&d=`：同发布站的布局（PlayerPage），另有按情况分组的左栏与缺口、
 *   ⌥+单击检查抽屉、导出图片 / 视频、在编辑器中打开。所有状态都在 hash 里。
 * IR 首次通过 /__joplo/p/<id>/ir 载入，之后由 HMR 推送；编译出错时显示错误并保留上一次成功的画面。
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { Diagnostic } from '@tokenroll/joplo-core';
import { DemoController } from '../runtime/demo';
import { exportImage, openInEditor, selectionWriter } from '../runtime/dev-client';
import { boardHash, parseBoardHash, type BoardRoute, type Device, type PlayRoute } from '../runtime/route';
import type { StageTheme } from '../renderer/rough';
import { viewportOf } from '../renderer/Stage';
import { PlayerPage, type MenuItem } from '../player/PlayerPage';
import { usePlaySync } from '../player/playRoute';
import { copyText, downloadBlob, useFlash, useHash } from '../player/util';
import { CaseNav } from './CaseNav';
import { Home } from './Home';
import { InspectDrawer } from './InspectDrawer';
import { VideoDialog } from './VideoDialog';
import { COVERAGE_LABEL } from './labels';
import { useProjectIR, useProjects } from './hooks';

const THEME_KEY = 'joplo.theme';

export function BoardApp() {
  const [hash, go] = useHash();
  const route = parseBoardHash(hash);
  const { list, error } = useProjects();
  const navigate = (r: BoardRoute, replace = false) => go(boardHash(r), replace);

  if (route.kind === 'play') return <BoardPlayer key={route.projectId} projectId={route.projectId} play={route.play} navigate={navigate} projectName={list?.find((p) => p.id === route.projectId)?.name ?? null} />;
  const selected = route.projectId && list?.some((p) => p.id === route.projectId) ? route.projectId : (list?.[0]?.id ?? null);
  return <Home projects={list} error={error} selectedId={selected} onSelect={(id) => navigate({ kind: 'home', projectId: id })} onView={(projectId, featureId) => navigate({ kind: 'play', projectId, play: { featureId } })} />;
}

function DiagnosticsBanner({ list }: { list: Diagnostic[] }) {
  const errors = list.filter((d) => d.severity === 'error');
  return (
    <div role="alert" className="max-h-[30%] shrink-0 overflow-y-auto rounded-lg border border-[#ffc9c9] bg-[#fff5f5] px-4 py-2 text-[13px] text-[#a51d1d]" data-testid="diagnostics">
      <strong>编译出错（{errors.length}）</strong>
      <span className="ml-2 text-[#6b3a3a]">仍显示上一次成功的画面；保存修复后自动恢复。</span>
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

function BoardPlayer({ projectId, play, navigate, projectName }: { projectId: string; play: PlayRoute; navigate: (r: BoardRoute, replace?: boolean) => void; projectName: string | null }) {
  const ir = useProjectIR(projectId);
  const ctl = useMemo(() => new DemoController(selectionWriter(projectId)), [projectId]);
  const snap = useSyncExternalStore(ctl.subscribe, ctl.getSnapshot);
  const [theme, setThemeState] = useState<StageTheme>(() => (localStorage.getItem(THEME_KEY) === 'clean' ? 'clean' : 'sketch'));
  const [drawer, setDrawer] = useState(false);
  const [video, setVideo] = useState(false);
  const [flash, setFlash] = useFlash();

  // 只应用成功的 IR；出错时保留上一次成功的画面（第一次就失败时也先显示它带的旧 IR）
  useEffect(() => {
    const p = ir.payload;
    if (!p?.project) return;
    if (p.ok || !ctl.getSnapshot().project) ctl.setProject(p.project, p.version, p.home);
  }, [ir.payload, ctl]);

  const project = snap.project;
  const toPlay = (next: PlayRoute, replace = false) => navigate({ kind: 'play', projectId, play: next }, replace);
  const resolved = usePlaySync(ctl, snap, project, play, (next) => toPlay(next, true));

  if (!project) {
    const msg = ir.status === 404 ? `${ir.error}。` : (ir.error ?? (ir.payload && !ir.payload.ok ? null : '正在编译项目…'));
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-[14px] text-[#3a3a3a]" data-testid="player-loading">
        {ir.payload && !ir.payload.ok ? <DiagnosticsBanner list={ir.payload.diagnostics} /> : <span>{msg}</span>}
        <button type="button" className="text-[#1c5fb8] underline" onClick={() => navigate({ kind: 'home', projectId })}>
          回到首页
        </button>
      </div>
    );
  }
  const feature = project.features[play.featureId];
  if (!feature || !resolved?.ok)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-[14px]" data-testid="feature-missing">
        <span>功能「{play.featureId}」不存在（可能已改名或删除）。</span>
        <button type="button" className="text-[#1c5fb8] underline" onClick={() => navigate({ kind: 'home', projectId })}>
          回到首页
        </button>
      </div>
    );

  const option = resolved.optionId ? project.options[resolved.optionId] : null;
  const scenario = snap.view === 'stage' ? ctl.scenario() : null;
  const state = snap.state;
  const device: Device = play.device ?? (state ? viewportOf(project, state) : 'desktop');
  const setTheme = (t: StageTheme) => {
    setThemeState(t);
    localStorage.setItem(THEME_KEY, t);
  };
  const home = () => navigate({ kind: 'home', projectId });
  const gap = resolved.gap;
  const caseTitle = resolved.caseId ? (project.cases[resolved.caseId]?.title ?? resolved.caseId) : null;

  const nextStep = ctl.nextStep();
  const lastStep = scenario && state && state.position > 0 ? scenario.steps[state.position - 1] : null;
  const editorAt = nextStep?.source ?? lastStep?.source ?? scenario?.steps[0]?.source ?? option?.source ?? null;

  const menu: MenuItem[] = [
    {
      id: 'image',
      label: '导出图片（当前步骤）',
      disabled: !scenario,
      onClick: () => {
        if (!scenario || !state) return;
        setFlash('正在生成图片…');
        void exportImage(projectId, { scenarioId: scenario.id, position: state.position, device, theme }).then((r) => {
          if (r.ok) {
            downloadBlob(r.blob, r.name);
            setFlash(`已下载 ${r.name}`);
          } else setFlash(`导出图片失败：${r.message}`);
        });
      },
    },
    { id: 'video', label: '导出视频（整个场景）', disabled: !scenario, onClick: () => setVideo(true) },
    { id: 'theme', label: '线框风格', checked: theme === 'clean', onClick: () => setTheme(theme === 'clean' ? 'sketch' : 'clean') },
    { id: 'link', label: '复制当前步骤的链接', onClick: () => void copyText(location.href).then((ok) => setFlash(ok ? '已复制链接' : '无法访问剪贴板，请从地址栏复制')) },
    {
      id: 'editor',
      label: '在编辑器中打开',
      disabled: !editorAt,
      onClick: () => editorAt && void openInEditor(projectId, editorAt).then((r) => setFlash(r.ok ? `已在编辑器中打开 ${editorAt}` : `无法打开编辑器：${r.message}`)),
    },
  ];

  const banner = (
    <>
      {ir.payload && !ir.payload.ok ? <DiagnosticsBanner list={ir.payload.diagnostics} /> : null}
      {gap && option ? (
        <div role="status" className="shrink-0 rounded-lg border border-[#ffd8a8] bg-[#fff9db] px-4 py-3" data-testid="gap-notice" data-status={gap.status}>
          <div className="text-[15px] font-semibold text-[#8a4700]">
            方案 {option.name} 还没有表达「{caseTitle}」{gap.status !== 'none' && gap.status !== 'missing' ? `（${COVERAGE_LABEL[gap.status].text}）` : ''}
          </div>
          <div className="mt-1 text-[13px] text-[#5c3d00]">
            这是缺口，不是演示{gap.reason ? `：${gap.reason}` : ''}。可以在 Agent 会话里说“给这个方案补上这个情况的场景”，或先查看：
          </div>
          <code className="mt-1.5 inline-block rounded bg-white/70 px-2 py-0.5 font-mono text-[13px]" data-testid="gap-command">
            npx joplo check --option {option.id}
          </code>
        </div>
      ) : null}
    </>
  );

  const selection = snap.selection;
  return (
    <>
      <PlayerPage
        ctl={ctl}
        snap={snap}
        project={project}
        onBrand={() => navigate({ kind: 'home' })}
        crumbs={[
          { label: projectName ?? project.name, testid: 'crumb-project', onClick: home },
          { label: feature.name, testid: 'crumb-feature', onClick: home },
          { label: option?.name ?? '（没有方案）', testid: 'crumb-option' },
          { label: gap ? '（缺口）' : (scenario?.name ?? '静态画面'), testid: 'crumb-scenario' },
        ]}
        device={device}
        onDevice={(d) => toPlay({ ...play, device: d }, true)}
        theme={theme}
        nav={
          <CaseNav
            project={project}
            featureId={feature.id}
            optionId={resolved.optionId}
            caseId={resolved.caseId}
            scenarioId={snap.scenarioId}
            onOption={(id) => toPlay({ featureId: feature.id, optionId: id, ...(resolved.caseId ? { caseId: resolved.caseId } : {}), ...(play.device ? { device: play.device } : {}) })}
            onCase={(cid) => toPlay({ featureId: feature.id, ...(resolved.optionId ? { optionId: resolved.optionId } : {}), caseId: cid, ...(play.device ? { device: play.device } : {}) })}
            onScenario={(sid) => toPlay({ featureId: feature.id, ...(resolved.optionId ? { optionId: resolved.optionId } : {}), scenarioId: sid, ...(play.device ? { device: play.device } : {}) })}
          />
        }
        banner={banner}
        menu={menu}
        onInspect={(id) => {
          void ctl.clickNode(id, { x: 0, y: 0 }, { inspect: true });
          setDrawer(true);
        }}
        stageHint={<span>⌥ + 单击：检查元素</span>}
        selectedId={drawer && selection && state && selection.sceneId === state.sceneId ? selection.nodeId : null}
        flash={flash}
        drawer={
          <>
            {drawer && selection ? (
              <InspectDrawer
                project={project}
                state={state}
                selection={selection}
                sync={snap.selectionSync}
                onClose={() => setDrawer(false)}
                onClear={() => {
                  void ctl.clearSelection();
                  setDrawer(false);
                }}
                onOpenEditor={(at) => void openInEditor(projectId, at).then((r) => setFlash(r.ok ? `已在编辑器中打开 ${at}` : `无法打开编辑器：${r.message}`))}
              />
            ) : null}
            {video && scenario ? <VideoDialog projectId={projectId} scenarioId={scenario.id} scenarioName={scenario.name} device={device} theme={theme} onClose={() => setVideo(false)} /> : null}
          </>
        }
      />
    </>
  );
}

