/**
 * 本地看板（`joplo dev`，D39）：一个进程、多个项目。
 * - 首页 `#/`、`#/<项目>`：最近打开的项目与所选项目的功能（Home.tsx）；顶栏的「外观」改所有项目的默认外观。
 * - 旧的设置页 `#/settings[/<项目>]`（D51）：跳转到首页并打开外观浮层（所有项目范围，D55）。
 * - 外观（D55）：配色 / 字体 / 线条，记在 <JOPLO_HOME>/settings.json；读取见 appearance-model.ts 的 effectiveAppearance。
 * - 演示页 `#/<项目>/f/<功能>?o=&c=&s=&step=&d=`：同发布站的布局（PlayerPage），另有按情况分组的左栏与缺口、
 *   ⌥+单击检查抽屉、导出图片 / 视频、在编辑器中打开。所有状态都在 hash 里。
 * IR 首次通过 /__joplo/p/<id>/ir 载入，之后由 HMR 推送；编译出错时显示错误并保留上一次成功的画面。
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { Diagnostic } from '@joplo-app/core';
import { DemoController } from '../runtime/demo';
import { exportImage, openInEditor, selectionWriter } from '../runtime/dev-client';
import { boardHash, parseBoardHash, type BoardRoute, type PlayRoute } from '../runtime/route';
import { Code, Film, ImageDown, LayoutGrid, Link, ScanSearch } from 'lucide-react';
import { PlayerPage, useBoardLayout, type MenuEntry } from '../player/PlayerPage';
import { Btn, Kbd } from '../player/controls';
import type { ProjectSummary } from '../runtime/dev-client';
import { featureMenu } from './nav-model';
import { usePlaySync } from '../player/playRoute';
import { copyText, downloadBlob, useFlash, useHash } from '../player/util';
import { CaseNav } from './CaseNav';
import { Home } from './Home';
import { InspectDrawer } from './InspectDrawer';
import { VideoDialog } from './VideoDialog';
import { COVERAGE_LABEL } from './labels';
import { useProjectIR, useProjects } from './hooks';
import { useBoardSettings } from './useSettings';
import { themeCatalog } from '../renderer/themes';
import { ThemeStyles } from '../renderer/ThemeStyles';
import type { Look } from '../renderer/appearance';
import { AppearanceButton, AppearancePopover } from './Appearance';
import { effectiveAppearance } from './appearance-model';

/**
 * 外观状态（D55）：已保存的外观（读取点）+ 悬停预览（不保存）。消费者拿到的是 look（预览优先）；
 * 导出用 saved（预览只是临时看一眼）。
 */
function useAppearance(projectId: string | null, configTheme: string, authorThemes: Record<string, string>) {
  const { settings, save } = useBoardSettings();
  const key = JSON.stringify(authorThemes);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const catalog = useMemo(() => themeCatalog(authorThemes), [key]);
  const saved = effectiveAppearance(settings, projectId, configTheme, catalog.map((t) => t.name));
  const [preview, setPreview] = useState<Look | null>(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  return { settings, save, catalog, saved, look: preview ?? saved, setPreview, open, setOpen, anchor, setAnchor };
}

export function BoardApp() {
  const [hash, go] = useHash();
  const route = parseBoardHash(hash);
  const { list, error } = useProjects();
  const navigate = (r: BoardRoute, replace = false) => go(boardHash(r), replace);

  // 旧的设置页：跳到首页并打开外观浮层（所有项目范围）
  const [openAppearance, setOpenAppearance] = useState(false);
  useEffect(() => {
    if (route.kind !== 'settings') return;
    setOpenAppearance(true);
    navigate({ kind: 'home', ...(route.projectId ? { projectId: route.projectId } : {}) }, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.kind]);

  if (route.kind === 'play') return <BoardPlayer key={route.projectId} projectId={route.projectId} play={route.play} navigate={navigate} projects={list} />;
  const homeProject = route.kind === 'home' ? route.projectId : route.projectId;
  const selected = homeProject && list?.some((p) => p.id === homeProject) ? homeProject : (list?.[0]?.id ?? null);
  return (
    <BoardHome
      projects={list}
      error={error}
      selected={selected}
      openAppearance={openAppearance}
      onAppearanceOpened={() => setOpenAppearance(false)}
      onSelect={(id) => navigate({ kind: 'home', projectId: id })}
      onView={(projectId, featureId) => navigate({ kind: 'play', projectId, play: { featureId } })}
    />
  );
}

/** 首页 + 外观（所有项目范围）。 */
function BoardHome({ projects, error, selected, openAppearance, onAppearanceOpened, onSelect, onView }: { projects: ProjectSummary[] | null; error: string | null; selected: string | null; openAppearance: boolean; onAppearanceOpened: () => void; onSelect: (id: string) => void; onView: (projectId: string, featureId: string) => void }) {
  const a = useAppearance(null, 'sketch', {});
  const L = useBoardLayout();
  const [flash, setFlash] = useFlash();
  useEffect(() => {
    if (openAppearance && a.anchor) {
      a.setOpen(true);
      onAppearanceOpened();
    }
  }, [openAppearance, a.anchor]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <Home
        projects={projects}
        error={error}
        selectedId={selected}
        onSelect={onSelect}
        onView={onView}
        flash={flash}
        right={<AppearanceButton look={a.saved} catalog={a.catalog} wide={L.topLabels} open={a.open} onToggle={() => a.setOpen(!a.open)} btnRef={a.setAnchor} />}
      />
      <AppearancePopover open={a.open} anchor={a.anchor} onClose={() => a.setOpen(false)} scope="all" projectId={null} configTheme="sketch" catalog={a.catalog} settings={a.settings} look={a.saved} save={a.save} onPreview={() => undefined} onFlash={setFlash} copy={copyText} />
    </>
  );
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

function BoardPlayer({ projectId, play, navigate, projects }: { projectId: string; play: PlayRoute; navigate: (r: BoardRoute, replace?: boolean) => void; projects: ProjectSummary[] | null }) {
  const projectName = projects?.find((p) => p.id === projectId)?.name ?? null;
  const L = useBoardLayout();
  // 检查模式（D55 顶栏「检查」开关）：只在本页，不写进网址（不变量 2）
  const [inspectMode, setInspectMode] = useState(false);
  const ir = useProjectIR(projectId);
  const ctl = useMemo(() => new DemoController(selectionWriter(projectId)), [projectId]);
  const snap = useSyncExternalStore(ctl.subscribe, ctl.getSnapshot);
  // 外观（D51 / D55）：本项目 > 所有项目 > 项目 config；在外观浮层里改，立即生效；悬停时临时预览
  const a = useAppearance(projectId, ir.payload?.project?.theme ?? 'sketch', ir.payload?.project?.themes ?? {});
  const theme = a.look.theme;
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
  // 播放速度在切换方案 / 情况 / 场景时保留
  const toPlay = (next: PlayRoute, replace = false) => navigate({ kind: 'play', projectId, play: { ...(play.speed ? { speed: play.speed } : {}), ...next } }, replace);
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
  const home = () => navigate({ kind: 'home', projectId });
  const gap = resolved.gap;
  const caseTitle = resolved.caseId ? (project.cases[resolved.caseId]?.title ?? resolved.caseId) : null;

  const nextStep = ctl.nextStep();
  const lastStep = scenario && state && state.position > 0 ? scenario.steps[state.position - 1] : null;
  const editorAt = nextStep?.source ?? lastStep?.source ?? scenario?.steps[0]?.source ?? option?.source ?? null;

  const menu: MenuEntry[] = [
    {
      id: 'image',
      icon: <ImageDown />,
      label: '导出当前步骤图片',
      disabled: !scenario,
      onClick: () => {
        if (!scenario || !state) return;
        setFlash('正在生成图片…');
        void exportImage(projectId, { scenarioId: scenario.id, position: state.position, ...a.saved }).then((r) => {
          if (r.ok) {
            downloadBlob(r.blob, r.name);
            setFlash(`已下载 ${r.name}`);
          } else setFlash(`导出图片失败：${r.message}`);
        });
      },
    },
    { id: 'video', icon: <Film />, label: '导出整个场景视频', disabled: !scenario, onClick: () => setVideo(true) },
    { id: 'link', icon: <Link />, label: '复制当前步骤链接', onClick: () => void copyText(location.href).then((ok) => setFlash(ok ? '已复制链接' : '无法访问剪贴板，请从地址栏复制')) },
    {
      id: 'editor',
      icon: <Code />,
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
      <ThemeStyles themes={project.themes} />
      <PlayerPage
        ctl={ctl}
        snap={snap}
        project={project}
        onBrand={() => navigate({ kind: 'home' })}
        crumbs={[
          {
            label: projectName ?? project.name,
            testid: 'crumb-project',
            menuLabel: '切换项目',
            // 项目 ▾：最近的项目；选一个 → 打开它的首页（功能列表）
            items: [
              ...(projects ?? []).map((x) => ({ id: `project-${x.id}`, label: x.name, description: x.status === 'missing' ? '找不到目录' : x.status === 'error' ? `${x.errors} 个错误` : undefined, checked: x.id === projectId, onClick: () => navigate({ kind: 'home', projectId: x.id }) })),
              { id: 'project-divider', divider: true as const },
              { id: 'project-home', icon: <LayoutGrid />, label: '查看项目首页', onClick: home },
            ],
          },
          {
            label: feature.name,
            testid: 'crumb-feature',
            menuLabel: '切换功能',
            // 功能 ▾：本项目的功能和缺口数；选一个 → 打开它的演示，停在第 0 步
            items: [
              ...featureMenu(project, feature.id).map((f) => ({ id: `feature-${f.id}`, label: f.name, description: f.hint, checked: f.current, onClick: () => navigate({ kind: 'play', projectId, play: { featureId: f.id, ...(play.speed ? { speed: play.speed } : {}) } }) })),
              { id: 'feature-divider', divider: true as const },
              { id: 'feature-home', icon: <LayoutGrid />, label: '查看项目首页', onClick: home },
            ],
          },
        ]}
        actions={
          <>
            <Btn
              icon={<ScanSearch className="size-4" />}
              label="检查"
              iconOnly={!L.topLabels}
              selected={inspectMode}
              title={inspectMode ? '关闭检查模式' : '检查模式：单击画面元素 = 选中它（不执行步骤）；也可以按住 ⌥ 临时检查'}
              kbd={L.topLabels ? undefined : '按住 ⌥'}
              onClick={() => setInspectMode((v) => !v)}
              data-testid="inspect-toggle"
            >
              {L.topLabels ? <Kbd>⌥</Kbd> : null}
            </Btn>
            <AppearanceButton look={a.saved} catalog={a.catalog} wide={L.topLabels} open={a.open} onToggle={() => a.setOpen(!a.open)} btnRef={a.setAnchor} />
          </>
        }
        inspectMode={inspectMode}
        layer={play.layer ?? null}
        speed={play.speed ?? 1}
        onSpeed={(v) => {
          const { speed: _s, ...rest } = play;
          navigate({ kind: 'play', projectId, play: v === 1 ? rest : { ...rest, speed: v } }, true);
        }}
        onLayer={(l) => {
          const { layer: _l, ...rest } = play;
          toPlay(l ? { ...rest, layer: l } : rest, true);
        }}
        theme={theme}
        font={a.look.font}
        stroke={a.look.stroke}
        nav={
          <CaseNav
            project={project}
            featureId={feature.id}
            optionId={resolved.optionId}
            caseId={resolved.caseId}
            scenarioId={snap.scenarioId}
            onOption={(id) => toPlay({ featureId: feature.id, optionId: id, ...(resolved.caseId ? { caseId: resolved.caseId } : {}) })}
            onCase={(cid) => toPlay({ featureId: feature.id, ...(resolved.optionId ? { optionId: resolved.optionId } : {}), caseId: cid })}
            onScenario={(sid) => toPlay({ featureId: feature.id, ...(resolved.optionId ? { optionId: resolved.optionId } : {}), scenarioId: sid })}
            onOptionCase={(oid, cid) => toPlay({ featureId: feature.id, optionId: oid, caseId: cid })}
            onCopy={(text) => void copyText(text).then((ok) => setFlash(ok ? `已复制：${text}` : '无法访问剪贴板'))}
          />
        }
        banner={banner}
        menu={menu}
        onInspect={(id) => {
          void ctl.clickNode(id, { x: 0, y: 0 }, { inspect: true });
          setDrawer(true);
        }}
        stageHint={<span>按住 ⌥ 单击：检查元素</span>}
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
            {video && scenario ? <VideoDialog projectId={projectId} scenarioId={scenario.id} scenarioName={scenario.name} look={a.saved} onClose={() => setVideo(false)} /> : null}
            <AppearancePopover open={a.open} anchor={a.anchor} onClose={() => a.setOpen(false)} scope="project" projectId={projectId} configTheme={project.theme ?? 'sketch'} catalog={a.catalog} settings={a.settings} look={a.saved} save={a.save} onPreview={a.setPreview} onFlash={setFlash} copy={copyText} />
          </>
        }
      />
    </>
  );
}

