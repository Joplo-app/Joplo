import { LanguageMenu } from '../player/LanguageMenu';
import { LocalText } from '../i18n/LocalText';
import { m } from '../i18n/board/messages';
import { translate, type Text } from '../i18n/messages';
import { useBoardI18n } from '../i18n/board/context';
/**
 * 本地看板（`joplo dev`，D39）：一个进程、多个项目。
 * - 首页 `#/`、`#/<项目>`：最近打开的项目与所选项目的功能（Home.tsx）；顶栏的「外观」改所有项目的默认外观。
 * - 旧的设置页 `#/settings[/<项目>]`（D51）：跳转到首页并打开外观浮层（所有项目范围，D55）。
 * - 外观（D55）：配色 / 字体 / 线条，记在 <JOPLO_HOME>/settings.json；读取见 appearance-model.ts 的 effectiveAppearance。
 * - 演示页 `#/<项目>/f/<功能>?o=&c=&s=&step=&d=`：同发布站的布局（PlayerPage），另有按情况分组的左栏与缺口、
 *   ⌥+单击检查抽屉、导出图片 / 视频、在编辑器中打开。所有状态都在 hash 里。
 * IR 首次通过 /__joplo/p/<id>/ir 载入，之后由 HMR 推送；编译出错时显示错误并保留上一次成功的画面。
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

/** 换 favicon（D55 标签页状态点）。 */
function setFavicon(href: string) {
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  if (link.href !== href) link.href = href;
}
import { VIEWPORT_SIZE, type Diagnostic } from '@joplo-app/core';
import { DemoController } from '../runtime/demo';
import { exportImage, openInEditor, selectionWriter } from '../runtime/dev-client';
import { boardHash, parseBoardHash, warnUnknownPlayParams, type BoardRoute, type PlayRoute } from '../runtime/route';
import { ArrowRight, BookOpen, CircleCheck, Cloud, Loader2, Smartphone, CircleX, Code, Copy, Film, ImageDown, LayoutGrid, Link, ScanSearch, Volume2, VolumeX } from 'lucide-react';
import { PlayerPage, useBoardLayout, type MenuEntry } from '../player/PlayerPage';
import { Btn, Kbd } from '../player/controls';
import type { ProjectSummary } from '../runtime/dev-client';
import { featureMenu } from './nav-model';
import { usePlaySync } from '../player/playRoute';
import { copyText, downloadBlob, useFlash, useHash } from '../player/util';
import { CaseNav, CaseRail } from './CaseNav';
import { Home } from './Home';
import { InspectDrawer } from './InspectDrawer';
import { ProgressRing, VideoProgressCard, useVideoExport } from './VideoExport';
import { CloudPublishPopover, useCloudPublish } from './CloudPublish';
import { ExportSetupCard, SetupNeededFlash, showSetupCard, useExportRuntime } from './ExportSetup';
import { diagnosticsSummary, gapBanner, nextCase } from './states-model';
import { faviconHref, tabTitle } from '../player/states';
import { StatusIcon } from '../player/StatusIcon';
import { cn } from '@/lib/utils';
import { COVERAGE_LABEL } from './labels';
import { useProjectIR, useProjects } from './hooks';
import { useBoardSettings } from './useSettings';
import { themeCatalog } from '../renderer/themes';
import { ThemeStyles } from '../renderer/ThemeStyles';
import type { Look } from '../renderer/appearance';
import { AppearanceButton, AppearancePopover } from './Appearance';
import { VoiceButton, VoicePopover, VoiceProfilesDialog, useVoice } from './Voice';
import { effectiveAppearance } from './appearance-model';
import { loadWenKai } from './font-loading';

/**
 * 外观状态（D55）：已保存的外观（读取点）+ 悬停预览（不保存）。消费者拿到的是 look（预览优先）；
 * 导出用 saved（预览只是临时看一眼）。
 */
function useAppearance(projectId: string | null, configTheme: string, authorThemes: Record<string, string>) {
  const { t: i18n, locale } = useBoardI18n();

  const { settings, save } = useBoardSettings();
  const key = JSON.stringify(authorThemes);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const catalog = useMemo(() => themeCatalog(authorThemes, i18n), [key, i18n]);
  const saved = effectiveAppearance(settings, projectId, configTheme, catalog.map((t) => t.name));
  useEffect(() => { void loadWenKai(saved.font); }, [saved.font]);
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
  // 看板是开发模式：深链接里不认识的参数（例如 layer=，应为 l=）在控制台提示一次，照常播放
  useEffect(() => { if (route.kind === 'play') warnUnknownPlayParams(hash); }, [hash, route.kind]);

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
      onView={(projectId, featureId, optionId) => navigate({ kind: 'play', projectId, play: { featureId, ...(optionId ? { optionId } : {}) } })}
    />
  );
}

/** 首页 + 外观（所有项目范围）。 */
function BoardHome({ projects, error, selected, openAppearance, onAppearanceOpened, onSelect, onView }: { projects: ProjectSummary[] | null; error: Text | null; selected: string | null; openAppearance: boolean; onAppearanceOpened: () => void; onSelect: (id: string) => void; onView: (projectId: string, featureId: string, optionId?: string) => void }) {
  const { t: i18n, locale } = useBoardI18n();

  useEffect(() => { document.title = i18n.board.joploBoard; }, [i18n]);
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
        onFlash={setFlash}
        right={
          <>
            <AppearanceButton look={a.saved} catalog={a.catalog} wide={L.topLabels} open={a.open} onToggle={() => a.setOpen(!a.open)} btnRef={a.setAnchor} scopeLabel={i18n.board.allProjects} />
            <LanguageMenu iconOnly={L.languageIconOnly} />
            <a href="https://github.com/Joplo-app/Joplo/tree/main/docs" target="_blank" rel="noreferrer" className="jb-focus inline-flex h-8 items-center gap-1.5 rounded-[6px] px-2.5 text-[13px] font-medium text-jb-muted hover:bg-jb-hover hover:text-jb-fg" data-testid="home-docs">
              <BookOpen className="size-4" aria-hidden />
              {i18n.board.docs}</a>
          </>
        }
      />
      <AppearancePopover open={a.open} anchor={a.anchor} onClose={() => a.setOpen(false)} scope="all" projectId={null} configTheme="sketch" catalog={a.catalog} settings={a.settings} look={a.saved} save={a.save} onPreview={() => undefined} onFlash={setFlash} copy={copyText} />
    </>
  );
}

/** 编译出错横幅（D55）：舞台上沿的红边横幅，写错误数和第一条 文件:行；可展开全部；修好保存后自动消失。 */
function DiagnosticsBanner({ list }: { list: Diagnostic[] }) {
  const { t: i18n, locale } = useBoardI18n();

  const [open, setOpen] = useState(false);
  const sum = diagnosticsSummary(list);
  if (!sum) return null;
  const errors = list.filter((d) => d.severity === 'error');
  return (
    <div role="alert" className="max-h-[40%] w-full shrink-0 overflow-y-auto rounded-[8px] border-l-4 border-jb-danger bg-jb-danger-bg px-3 py-2 text-left font-jb text-[13px]" data-testid="diagnostics">
      <div className="flex items-center gap-2">
        <CircleX className="size-4 shrink-0 text-jb-danger" aria-hidden />
        <strong className="text-jb-danger">{i18n.board.compilationCount(sum.count)}</strong>
        <span className="text-jb-danger">{i18n.board.showingTheLastSuccessfulStage}</span>
        <span className="flex-1" />
        <button type="button" className="jb-focus shrink-0 rounded-[4px] px-1.5 text-[12px] font-medium text-jb-fg hover:underline" onClick={() => setOpen((v) => !v)} aria-expanded={open} data-testid="diag-toggle">
          {open ? i18n.board.collapse : i18n.board.expand}
        </button>
      </div>
      <ul className="mt-1 flex flex-col gap-0.5 pl-6">
        {(open ? errors.slice(0, 50) : errors.slice(0, 1)).map((d, i) => (
          <li key={i} className="flex gap-2" data-testid="diag-item">
            <code className="shrink-0 font-jb-mono text-[12px] font-semibold text-jb-fg">{d.at ?? i18n.board.noLocation}</code>
            <span className={cn('text-jb-muted', open ? 'whitespace-pre-wrap break-all' : 'truncate')}>{d.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BoardPlayer({ projectId, play, navigate, projects }: { projectId: string; play: PlayRoute; navigate: (r: BoardRoute, replace?: boolean) => void; projects: ProjectSummary[] | null }) {
  const { t: i18n, locale } = useBoardI18n();

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
  const [flash, setFlash] = useFlash();
  // 导出视频（D55）：进度在「导出」按钮的进度环和菜单顶部；完成 / 失败是带操作的轻提示
  const videoName = useRef('');
  const retry = useRef<() => void>(() => undefined);
  const vid = useVideoExport(projectId, (job) => {
    if (job.status === 'done')
      setFlash(
        <span className="inline-flex items-center gap-2" data-testid="video-done">
          <CircleCheck className="size-4 text-jb-accent" aria-hidden />
          <LocalText value={m.board.exportedFile(job.file ?? '')} />
          <button type="button" className="font-semibold text-jb-accent underline-offset-2 hover:underline" onClick={() => retry.current()}>
            {<LocalText value={m.board.exportAgain} />}</button>
        </span>,
        8000,
      );
    else if (job.status === 'error') {
      void rt.refresh(); // 可能是导出组件被卸载了：刷新安装卡
      setFlash(
        <span className="inline-flex max-w-[640px] items-center gap-2 whitespace-normal" data-testid="video-error">
          <LocalText value={m.board.videoExportFailed(job.error ?? '')} />
          <button type="button" className="shrink-0 font-semibold text-jb-accent underline-offset-2 hover:underline" onClick={() => retry.current()}>
            {<LocalText value={m.board.retry} />}</button>
        </span>,
        10000,
      );
    } else if (job.status === 'cancelled') setFlash(<LocalText value={m.board.exportCancelled} />);
  });

  // 导出组件（D66）：没装时菜单顶部有安装卡；点导出时提示「安装并导出」；装好后继续刚才的导出
  // 直接发布到云端（D76）：任务与账号状态；浮层挂在「导出 ▾」按钮下
  const cloud = useCloudPublish(projectId);
  const rt = useExportRuntime(projectId, {
    onReady: () => setFlash(<LocalText value={m.board.exportSetupReady} />),
    onError: (message) =>
      setFlash(
        <span className="inline-flex max-w-[640px] items-center gap-2 whitespace-normal" data-testid="export-setup-failed">
          <LocalText value={m.board.exportSetupFailed(message)} />
          <button type="button" className="shrink-0 font-semibold text-jb-accent underline-offset-2 hover:underline" onClick={() => void rt.install()}>
            {<LocalText value={m.board.retry} />}</button>
        </span>,
        12000,
      ),
  });
  /** 导出前确认导出组件可用；不可用时提示安装（用户确认后才下载），装好后执行 run。 */
  const needsSetup = (run: () => void): boolean => {
    if (rt.ready && !rt.installing) return false;
    if (rt.installing) rt.install(run); // 接上正在进行的安装，装好后继续
    else setFlash(<SetupNeededFlash rt={rt} then={run} />, 12000);
    return true;
  };

  // 只应用成功的 IR；出错时保留上一次成功的画面（第一次就失败时也先显示它带的旧 IR）
  useEffect(() => {
    const p = ir.payload;
    if (!p?.project) return;
    if (p.ok || !ctl.getSnapshot().project) ctl.setProject(p.project, p.version, p.home);
  }, [ir.payload, ctl]);

  const project = snap.project;
  // 标签页标题与 favicon 状态点（D55）：“功能 · 项目”；编译出错加 ✕ 和红点；导出中写进度、黄点
  const compileError = !!(ir.payload && !ir.payload.ok);
  const featureName = project?.features[play.featureId]?.name ?? null;
  const exporting = vid.running && vid.job ? `${i18n.player.number(vid.job.step)}/${i18n.player.number(vid.job.total)}` : null;
  useEffect(() => {
    document.title = tabTitle({ feature: featureName, project: projectName ?? project?.name ?? null, error: compileError, exporting }, i18n, i18n.board.joploBoard);
    setFavicon(faviconHref(compileError ? 'error' : exporting ? 'busy' : null));
  }, [featureName, projectName, project?.name, compileError, exporting, i18n]);
  useEffect(
    () => () => {
      document.title = i18n.board.joploBoard;
      setFavicon(faviconHref(null));
    },
    [],
  );
  // 场景完成后 Enter = 下一个情况
  const nextRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || !nextRef.current) return;
      const t = e.target as HTMLElement;
      if (t.closest?.('input,textarea,select,button,[contenteditable],[role="menu"],[role="dialog"]')) return;
      e.preventDefault();
      nextRef.current();
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);
  // 播放速度在切换方案 / 情况 / 场景时保留
  const toPlay = (next: PlayRoute, replace = false) => navigate({ kind: 'play', projectId, play: { ...(play.speed ? { speed: play.speed } : {}), ...next } }, replace);
  const resolved = usePlaySync(ctl, snap, project, play, (next) => toPlay(next, true));
  // 朗读（D74）：播放坞的「声音」按钮 → 浮层 →「管理供应商」对话框
  const voice = useVoice(projectId, project, snap.optionId, ctl, locale, { scenarioId: snap.scenarioId, position: snap.state?.position ?? 0 });
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [voiceAnchor, setVoiceAnchor] = useState<HTMLButtonElement | null>(null);
  const [providersOpen, setProvidersOpen] = useState(false);

  if (!project) {
    const msg = ir.status === 404 ? translate(ir.error ?? '', i18n) : (ir.error ?? (ir.payload && !ir.payload.ok ? null : i18n.board.compilingProject));
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-[14px] text-[#3a3a3a]" data-testid="player-loading">
        {ir.payload && !ir.payload.ok ? <DiagnosticsBanner list={ir.payload.diagnostics} /> : <span>{msg ? translate(msg, i18n) : null}</span>}
        <button type="button" className="text-[#1c5fb8] underline" onClick={() => navigate({ kind: 'home', projectId })}>
          {i18n.board.goToHome}</button>
      </div>
    );
  }
  const feature = project.features[play.featureId];
  if (!feature || !resolved?.ok)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-[14px]" data-testid="feature-missing">
        <span>{i18n.board.featureNotFound(play.featureId)}</span>
        <button type="button" className="text-[#1c5fb8] underline" onClick={() => navigate({ kind: 'home', projectId })}>
          {i18n.board.goToHome}</button>
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
    ...(showSetupCard(rt.status, rt.job) ? [{ id: 'export-setup', custom: <ExportSetupCard rt={rt} /> }, { id: 'export-setup-divider', divider: true as const }] : []),
    // 发布到 Joplo Cloud（D76）：蓝底单独一项，和下面的本地导出分开
    {
      id: 'cloud',
      tone: 'cloud' as const,
      icon: cloud.running ? <Loader2 className="animate-spin" /> : <Cloud />,
      label: i18n.board.cloudPublish,
      description: cloud.running ? i18n.board.cloudPublishing : !cloud.acct.available ? i18n.board.cloudUnavailableHint : i18n.board.cloudPublishHint,
      onClick: () => {
        cloud.setAnchor(document.querySelector<HTMLElement>('[data-testid="more-menu"]'));
        cloud.setOpen(true);
      },
    },
    { id: 'cloud-divider', divider: true as const },
    {
      id: 'image',
      icon: <ImageDown />,
      label: i18n.board.exportCurrentStepAsImage,
      disabled: !scenario,
      onClick: () => {
        if (!scenario || !state) return;
        const body = { scenarioId: scenario.id, position: state.position, ...a.saved, locale };
        const run = () => {
          setFlash(<LocalText value={m.board.generatingImage} />);
          void exportImage(projectId, body).then((r) => {
            if (r.ok) {
              downloadBlob(r.blob, r.name);
              setFlash(<LocalText value={m.board.downloaded(r.name)} />);
            } else if (r.code === 'EXPORT_COMPONENT_MISSING') {
              rt.markMissing();
              setFlash(<SetupNeededFlash rt={rt} then={run} />, 12000);
            } else setFlash(<LocalText value={m.board.imageExportFailed(r.message)} />);
          });
        };
        if (!needsSetup(run)) run();
      },
    },
    ...(vid.running && vid.job ? [{ id: 'video-progress', custom: <VideoProgressCard job={vid.job} scenarioName={videoName.current} onCancel={() => void vid.cancel()} /> }, { id: 'video-divider', divider: true as const }] : []),
    { id: 'video', icon: <Film />, label: vid.running ? i18n.board.exportingVideo : i18n.board.exportEntireScenarioAsVideo, disabled: !scenario || vid.running, onClick: () => retry.current() },
    { id: 'link', icon: <Link />, label: i18n.board.copyLinkToCurrentStep, onClick: () => void copyText(location.href).then((ok) => setFlash(<LocalText value={ok ? m.board.linkCopied : m.board.clipboardUnavailableCopyFromTheAddressBar} />)) },
    {
      id: 'editor',
      icon: <Code />,
      label: i18n.board.openInEditor,
      disabled: !editorAt,
      onClick: () => editorAt && void openInEditor(projectId, editorAt).then((r) => setFlash(<LocalText value={r.ok ? m.board.openedInEditor(editorAt) : m.board.couldNotOpenEditor(r.message)} />)),
    },
  ];

  // 视频：从菜单开始；完成提示里的“再导出一次”、失败提示里的“重试”也走这里
  retry.current = () => {
    if (!scenario) return;
    const run = () => {
      videoName.current = scenario.name;
      void vid.start(scenario.id, a.saved, locale).then((ok) => !ok && setFlash(<LocalText value={m.board.videoExportFailed(vid.error ?? m.board.couldNotStart)} />));
    };
    if (!needsSetup(run)) run();
  };
  // 缺口横幅（D55）：说清楚，再给下一步：复制给 Agent 的话；看已表达这个情况的方案怎么处理
  const gb = gap && option ? gapBanner(project, feature.id, option.id, resolved.caseId, i18n) : null;
  const banner = (
    <>
      {ir.payload && !ir.payload.ok ? <DiagnosticsBanner list={ir.payload.diagnostics} /> : null}
      {gap && option && gb ? (
        <div role="status" className="flex shrink-0 flex-col gap-2 rounded-[10px] border-[1.5px] border-jb-ink bg-jb-surface px-4 py-3 font-jb" data-testid="gap-notice" data-status={gap.status}>
          <div className="flex items-center gap-2 text-[14px] font-semibold">
            <StatusIcon status={gap.status} size={16} />
            {i18n.board.gapTitle(gb.letter, caseTitle ?? '', gap.status !== 'none' && gap.status !== 'missing' ? COVERAGE_LABEL(i18n)[gap.status].text : '')}
          </div>
          <div className="text-[13px] text-jb-muted">{i18n.board.gapBody(gb.letter, gap.basis === 'derived' ? i18n.board.thisCaseIsNotCoveredYet : gap.reason ?? '')}</div>
          <div className="flex flex-wrap items-center gap-2">
            <Btn icon={<Copy className="size-3.5" />} label={i18n.board.copyRequestForAgent} size={28} onClick={() => void copyText(gb.agentText).then((ok) => setFlash(<LocalText value={ok ? m.board.requestForAgentCopied : m.board.clipboardUnavailable} />))} data-testid="gap-copy" />
            {gb.alt ? <Btn icon={<ArrowRight className="size-3.5" />} label={i18n.board.seeHowOptionHandlesThis(gb.alt.letter)} variant="primary" size={28} onClick={() => toPlay({ featureId: feature.id, optionId: gb.alt!.optionId, ...(resolved.caseId ? { caseId: resolved.caseId } : {}) })} data-testid="gap-alt" /> : null}
          </div>
          <div className="truncate text-[12px] text-jb-faint" data-testid="gap-command" title={gb.agentText}>
            {i18n.board.copiedText}{gb.agentText}
          </div>
        </div>
      ) : null}
    </>
  );
  // 场景完成后的“下一个情况”（左栏顺序里当前方案已表达的下一个；没有就不显示）
  // 没有选情况（直接打开了某个场景）时，从这个场景覆盖的最后一个情况往后找
  const curCase = resolved.caseId ?? (scenario ? ([...feature.caseIds].reverse().find((c) => scenario.caseIds.includes(c)) ?? null) : null);
  const nc = state?.completed && !snap.playing ? nextCase(project, feature.id, resolved.optionId, curCase) : null;
  nextRef.current = nc ? () => toPlay({ featureId: feature.id, ...(resolved.optionId ? { optionId: resolved.optionId } : {}), caseId: nc.caseId }) : null;

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
            menuLabel: i18n.board.switchProject,
            // 项目 ▾：最近的项目；选一个 → 打开它的首页（功能列表）
            items: [
              ...(projects ?? []).map((x) => ({ id: `project-${x.id}`, label: x.name, description: x.status === 'missing' ? i18n.board.directoryNotFound : x.status === 'error' ? i18n.board.projectErrorCount(x.errors) : undefined, checked: x.id === projectId, onClick: () => navigate({ kind: 'home', projectId: x.id }) })),
              { id: 'project-divider', divider: true as const },
              { id: 'project-home', icon: <LayoutGrid />, label: i18n.board.viewProjectHome, onClick: home },
            ],
          },
          {
            label: feature.name,
            testid: 'crumb-feature',
            menuLabel: i18n.board.switchFeature,
            // 功能 ▾：本项目的功能和缺口数；选一个 → 打开它的演示，停在第 0 步
            items: [
              ...featureMenu(project, feature.id, i18n).map((f) => ({ id: `feature-${f.id}`, label: f.name, description: f.hint, checked: f.current, onClick: () => navigate({ kind: 'play', projectId, play: { featureId: f.id, ...(play.speed ? { speed: play.speed } : {}) } }) })),
              { id: 'feature-divider', divider: true as const },
              { id: 'feature-home', icon: <LayoutGrid />, label: i18n.board.viewProjectHome, onClick: home },
            ],
          },
        ]}
        actions={
          <>
            <Btn
              icon={<ScanSearch className="size-4" />}
              label={i18n.board.inspect}
              iconOnly={!L.topLabels}
              selected={inspectMode}
              title={inspectMode ? i18n.board.exitInspectMode : i18n.board.inspectModeClickAStageElementToSelectIt}
              kbd={L.topLabels ? undefined : i18n.board.hold}
              onClick={() => setInspectMode((v) => !v)}
              data-testid="inspect-toggle"
            >
              <Kbd className={L.topLabels ? undefined : 'hidden'}>⌥</Kbd>
            </Btn>
            <AppearanceButton look={a.saved} catalog={a.catalog} wide={L.topLabels} open={a.open} onToggle={() => a.setOpen(!a.open)} btnRef={a.setAnchor} />
          </>
        }
        inspectMode={inspectMode}
        completeAction={nc ? <Btn icon={<ArrowRight className="size-4" />} iconAfter label={i18n.board.nextCase(nc.title)} kbd="Enter" variant="primary" className="max-w-[360px] [&>span]:truncate" onClick={() => nextRef.current?.()} data-testid="next-case" /> : null}
        navRail={<CaseRail project={project} featureId={feature.id} optionId={resolved.optionId} caseId={resolved.caseId} />}
        exportBadge={vid.running && vid.job ? <ProgressRing percent={vid.job.percent} /> : rt.installing && rt.job ? <ProgressRing percent={rt.job.percent} /> : null}
        deviceTag={
          <span className="inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-[6px] border border-jb-line bg-jb-surface px-2.5 font-jb text-[12px] text-jb-muted" data-testid="device-tag">
            <Smartphone className="size-3.5" aria-hidden />
            {i18n.board.mobilePageDetails(VIEWPORT_SIZE.mobile.width)}</span>
        }
        voice={<VoiceButton api={voice} open={voiceOpen} onToggle={() => setVoiceOpen((v) => !v)} btnRef={setVoiceAnchor} />}
        fullscreenVoice={<Btn icon={voice.on ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />} label={voice.on ? i18n.player.turnNarrationOff : i18n.player.turnNarrationOn} iconOnly variant="ghost" size={32} selected={voice.on} onClick={() => voice.setOn(!voice.on)} data-testid="fs-voice" />}
        fullscreenActions={<AppearanceButton look={a.saved} catalog={a.catalog} wide={false} open={a.open} onToggle={() => a.setOpen(!a.open)} btnRef={a.setAnchor} variant="ghost" />}
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
            onCopy={(text) => void copyText(text).then((ok) => setFlash(<LocalText value={ok ? m.board.copied(text) : m.board.clipboardUnavailable} />))}
          />
        }
        banner={banner}
        menu={menu}
        onInspect={(id) => {
          void ctl.clickNode(id, { x: 0, y: 0 }, { inspect: true });
          setDrawer(true);
        }}
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
                onOpenEditor={(at) => void openInEditor(projectId, at).then((r) => setFlash(<LocalText value={r.ok ? m.board.openedInEditor(at) : m.board.couldNotOpenEditor(r.message)} />))}
              />
            ) : null}
            <VoicePopover api={voice} open={voiceOpen} anchor={voiceAnchor} onClose={() => setVoiceOpen(false)} onManage={() => (setVoiceOpen(false), setProvidersOpen(true))} />
            <VoiceProfilesDialog api={voice} open={providersOpen} onClose={() => setProvidersOpen(false)} canSelect={voice.state?.source !== 'config'} />
            <CloudPublishPopover model={cloud} ctx={{ featureId: play.featureId, scenarioId: scenario?.id ?? null }} names={{ feature: feature.name, scenario: scenario?.name ?? null }} onFlash={setFlash} />
            <AppearancePopover open={a.open} anchor={a.anchor} onClose={() => a.setOpen(false)} scope="project" projectId={projectId} configTheme={project.theme ?? 'sketch'} catalog={a.catalog} settings={a.settings} look={a.saved} save={a.save} onPreview={a.setPreview} onFlash={setFlash} copy={copyText} />
          </>
        }
      />
    </>
  );
}
