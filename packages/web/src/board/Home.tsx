import { projectThemes } from '@joplo-app/core/runtime';
import { LocalText } from '../i18n/LocalText';
import { m } from '../i18n/board/messages';
import { translate, type Text } from '../i18n/messages';
import { useBoardI18n } from '../i18n/board/context';
/**
 * 看板首页（D39 / D55 + @tokenroll/juice v0.2.0 同心雕塑板、CopySnippet 与 RollingNumber）：
 * - 左栏：最近打开的项目（12px 同心色阶板），底部 CopySnippet 复制 `npx joplo dev` 与 Joplo Cloud 账号卡片。
 * - 右侧：20px -> 14px -> 8px 同心浮升作品/功能卡片，柔和阴影抬升，无重黑线框。
 */
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, FolderX } from 'lucide-react';
import { Alert, Badge, CopySnippet, playJuiceSound } from '@tokenroll/juice/primitives';
import type { Diagnostic, Project } from '@joplo-app/core/runtime';
import { removeProject, type ProjectSummary } from '../runtime/dev-client';
import { Brand, TopBar } from '../player/PlayerPage';
import { JoploMark } from '../player/JoploMark';
import { Btn } from '../player/controls';
import { StatusIcon } from '../player/StatusIcon';
import { StageThumb } from '../player/StageThumb';
import { ThemeStyles } from '../renderer/ThemeStyles';
import { themeCatalog } from '../renderer/themes';
import { cn } from '@/lib/utils';
import { useProjectIR } from './hooks';
import { useBoardSettings } from './useSettings';
import { effectiveAppearance } from './appearance-model';
import { featureCards, moveSelection, projectBadge, projectMeta, shortPath, type FeatureCard } from './home-model';
import { entryMetaText } from '../player/work-view';
import { HomeCloudCard } from './CloudAccountCard';
import { RollingCount } from './CaseNav';

export function Home({
  projects,
  error,
  selectedId,
  onSelect,
  onView,
  right,
  flash,
  onFlash,
}: {
  projects: ProjectSummary[] | null;
  error: Text | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onView: (projectId: string, featureId: string, workId?: string) => void;
  /** 顶栏右侧（外观按钮，D55）。 */
  right?: ReactNode;
  flash?: ReactNode | null;
  onFlash?: (msg: ReactNode) => void;
}) {
  const { t: i18n } = useBoardI18n();

  const selected = projects?.find((p) => p.id === selectedId) ?? null;
  const listRef = useRef<HTMLUListElement>(null);
  const notifyCopied = (text: string, ok: boolean) =>
    onFlash?.(<LocalText value={ok ? m.board.copied2(text) : m.board.clipboardUnavailable} />);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const next = moveSelection(projects ?? [], selectedId, e.key === 'ArrowDown' ? 1 : -1);
    if (!next) return;
    playJuiceSound('tap');
    onSelect(next);
    requestAnimationFrame(() => listRef.current?.querySelector<HTMLElement>(`[data-testid="home-project-${CSS.escape(next)}"]`)?.focus());
  };
  return (
    <div data-juice-scope="" className="flex h-full flex-col overflow-hidden bg-jb-app font-jb text-jb-fg" data-testid="home">
      <TopBar right={right}>
        <Brand />
      </TopBar>
      {error ? (
        <div className="px-4 pt-2" data-testid="load-error">
          <Alert tone="danger">{translate(error, i18n)}</Alert>
        </div>
      ) : null}
      {flash ? (
        <div role="status" className="j-tooltip-pill jb-tip fixed left-1/2 top-16 z-50 -translate-x-1/2 whitespace-nowrap px-3.5 py-2 text-[13px]" data-testid="flash">
          {flash}
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1">
        <aside className="jb-sidebar-surface flex w-[280px] shrink-0 flex-col px-3 py-4" data-testid="project-list">
          <div className="flex items-baseline justify-between px-2 pb-1.5 pt-1 text-[12px]">
            <span className="font-semibold tracking-[1px] text-jb-muted">{i18n.board.projects}</span>
            <span className="text-jb-faint">{i18n.board.recentlyOpened}</span>
          </div>
          <ul ref={listRef} className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto" onKeyDown={onKey} aria-label={i18n.board.recentlyOpenedProjects}>
            {(projects ?? []).map((p) => {
              const badge = projectBadge(p, i18n);
              const on = p.id === selectedId;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => {
                      if (!on) playJuiceSound('tap');
                      onSelect(p.id);
                    }}
                    data-testid={`home-project-${p.id}`}
                    data-status={p.status}
                    data-active={on ? 'true' : undefined}
                    aria-current={on ? 'true' : undefined}
                    className="jb-work-card jb-focus flex w-full items-center gap-2 rounded-[12px] px-3 py-2.5 text-left"
                  >
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className={cn('truncate text-[14px]', on && 'font-semibold', p.status === 'missing' && 'text-jb-faint')}>{p.name}</span>
                      <span className="truncate font-jb-mono text-[11px] text-jb-faint" title={p.dir}>
                        {shortPath(p.dir)}
                      </span>
                    </span>
                    {badge ? <Badge tone={badge.tone === 'danger' ? 'danger' : 'neutral'} className="shrink-0">{badge.text}</Badge> : null}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex flex-col gap-2 rounded-[14px] bg-[var(--juice-w6)] p-3 shadow-[inset_0_0_0_1px_var(--juice-edge)]" data-testid="home-add">
            <span className="text-[12px] text-jb-muted">{i18n.board.addAProjectRunInItsDirectory}</span>
            <CopyLine text="npx joplo dev" onResult={notifyCopied} />
          </div>
          {/* Joplo Cloud 账号卡片（D85 方案 A）：空间与朗读用量；没登录给登录命令 */}
          <HomeCloudCard />
        </aside>
        <main className="min-w-0 flex-1 overflow-y-auto px-10 py-8">
          {projects && projects.length === 0 ? <Empty onResult={notifyCopied} /> : selected ? <ProjectPanel key={selected.id} summary={selected} onView={onView} /> : null}
        </main>
      </div>
    </div>
  );
}

function CopyLine({ text, onResult }: { text: string; onResult: (text: string, ok: boolean) => void }) {
  const { t: i18n } = useBoardI18n();

  return (
    <CopySnippet
      code={text}
      copyLabel={i18n.board.copy(text)}
      copiedLabel={i18n.board.linkCopied}
      errorLabel={i18n.board.clipboardUnavailable}
      onCopied={() => {
        playJuiceSound('pop');
        onResult(text, true);
      }}
      onCopyError={() => onResult(text, false)}
      className="rounded-[10px] bg-jb-surface shadow-[inset_0_0_0_1px_var(--juice-edge)]"
      style={{ padding: '4px 6px 4px 10px', borderRadius: 10 }}
    />
  );
}

/** 首页空状态：标志、一句话、三条可复制的命令；不放插画。 */
function Empty({ onResult }: { onResult: (text: string, ok: boolean) => void }) {
  const { t: i18n } = useBoardI18n();

  return (
    <div className="mx-auto mt-[12vh] flex max-w-[440px] flex-col items-center gap-4 text-center" data-testid="home-empty">
      <JoploMark size={56} />
      <h2 className="text-[20px] font-bold">{i18n.board.noProjectsOpenedYet}</h2>
      <div className="j-slab flex w-full flex-col gap-1.5 rounded-[18px] p-3">
        {['npx joplo init my-demo', 'cd my-demo && npm install', 'npx joplo dev'].map((c) => (
          <CopyLine key={c} text={c} onResult={onResult} />
        ))}
      </div>
      <p className="text-[12px] text-jb-faint">{i18n.board.openedProjectsAreSavedInJoploProjectsJsonAnd}</p>
    </div>
  );
}

function Errors({ list, note }: { list: Diagnostic[]; note: string }) {
  const { t: i18n } = useBoardI18n();

  const errors = list.filter((d) => d.severity === 'error');
  return (
    <div role="alert" className="rounded-[14px] bg-jb-danger-bg px-4 py-3 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--jb-status-danger)_24%,transparent)]" data-testid="home-errors">
      <div className="text-[14px] font-semibold text-jb-danger">
        {i18n.board.compilationCount(errors.length)} · {note}
      </div>
      <ul className="mt-2 flex flex-col gap-1 text-[13px]">
        {errors.slice(0, 30).map((d, i) => (
          <li key={i} className="flex gap-3" data-testid="home-error-item">
            <code className="shrink-0 font-jb-mono text-[12px] font-semibold">{d.at ?? i18n.board.noLocation}</code>
            <span className="whitespace-pre-wrap break-all text-jb-muted">{d.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ProjectPanel({ summary, onView }: { summary: ProjectSummary; onView: (projectId: string, featureId: string, workId?: string) => void }) {
  const { t: i18n } = useBoardI18n();

  const ir = useProjectIR(summary.status === 'missing' ? null : summary.id);
  const [removeError, setRemoveError] = useState<Text | null>(null);
  const { settings } = useBoardSettings();
  const p = ir.payload;
  const project = p?.project ?? null;
  const key = JSON.stringify(projectThemes(project));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const names = useMemo(() => themeCatalog(projectThemes(project), i18n).map((t) => t.name), [key, i18n]);
  if (summary.status === 'missing')
    return (
      <div className="jb-home-slab flex max-w-[640px] flex-col gap-3 p-5" data-testid="home-missing">
        <h2 className="flex items-center gap-2 text-[17px] font-bold">
          <FolderX className="size-5 text-jb-muted" aria-hidden />
          {i18n.board.projectDirectoryNotFound}</h2>
        <p className="text-[14px]">
          <code className="font-jb-mono text-[13px]">{summary.dir}</code> {i18n.board.noLongerExistsIfItMovedRunNpxJoplo}</p>
        <div>
          <Btn label={i18n.board.removeFromList} sound="tap" onClick={() => void removeProject(summary.id).then((r) => setRemoveError(r.ok ? null : r.message))} data-testid="remove-project" />
        </div>
        <p className="text-[12px] text-jb-faint">{i18n.board.onlyRemovesThisRecordNoFilesWillBeDeleted}</p>
        {removeError ? <p className="text-[13px] text-jb-danger">{translate(removeError, i18n)}</p> : null}
      </div>
    );
  if (!p) return <div className="text-[14px] text-jb-muted">{ir.error ? translate(ir.error, i18n) : i18n.board.compilingProject}</div>;
  // 缩略图用这个项目自己的外观（D55：本项目 > 所有项目 > 项目 config）
  const look = project ? effectiveAppearance(settings, summary.id, project.theme ?? 'sketch', names) : null;
  const status = !p.ok ? { dot: 'bg-jb-danger', text: i18n.board.compilationErrorCount(p.diagnostics.filter((d) => d.severity === 'error').length) } : ir.live ? { dot: 'bg-jb-ok', text: i18n.board.compiledLiveReloadOn } : { dot: 'bg-jb-ok', text: i18n.board.compiled };
  return (
    <div className="flex max-w-[1140px] flex-col gap-6" data-testid="home-project">
      {project ? <ThemeStyles themes={projectThemes(project)} /> : null}
      <header className="flex items-start gap-6">
        <div className="min-w-0 flex-1">
          <h1 className="text-[26px] font-bold leading-8 tracking-[-0.02em]" data-testid="project-name">
            {project?.name ?? summary.name}
          </h1>
          {project?.description ? <p className="mt-1.5 max-w-[860px] text-[14px] leading-[22px] text-jb-muted">{project.description}</p> : null}
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
            <code className="rounded-[6px] bg-[var(--juice-w6)] px-2 py-0.5 font-jb-mono text-jb-muted">{summary.dir.replace(/^\/(Users|home)\/[^/]+/, '~')}</code>
            {project ? <span className="text-jb-muted tabular-nums">{projectMeta(project, i18n)}</span> : null}
          </div>
        </div>
        <span className="mt-1 flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--juice-w6)] px-3 py-1 text-[12px] font-medium text-jb-muted" data-testid="project-status">
          <span aria-hidden className={cn('size-2 rounded-full', status.dot)} />
          {status.text}
        </span>
      </header>
      {!p.ok ? <Errors list={p.diagnostics} note={project ? i18n.board.showingTheLastSuccessfulResultUpdatesAfterYouFix : i18n.board.updatesAfterYouFixTheErrors} /> : null}
      {project && look ? <Features project={project} look={look} onView={(f, o) => onView(summary.id, f, o)} /> : null}
    </div>
  );
}

function Features({ project, look, onView }: { project: Project; look: ReturnType<typeof effectiveAppearance>; onView: (featureId: string, workId?: string) => void }) {
  const { t: i18n } = useBoardI18n();

  const cards = featureCards(project);
  if (!cards.length) return <p className="text-[14px] text-jb-muted">{i18n.board.noFeaturesYetWriteYourFirstFeatureInFeatures}</p>;
  return (
    <section className="grid grid-cols-1 gap-5 min-[1100px]:grid-cols-2" data-testid="home-features">
      {cards.map((c) => (
        <FeatureCardView
          key={c.id}
          project={project}
          card={c}
          look={look}
          onOpen={() => {
            if (!c.open) return;
            playJuiceSound('tap');
            onView(c.open.featureId, c.open.workId);
          }}
        />
      ))}
    </section>
  );
}

/** 功能卡片（20px -> 14px -> 8px 同心雕塑板，整张可点）：缩略图 + 名字 + 目标 + 选定方案、方案数、覆盖小结。 */
function FeatureCardView({ project, card, look, onOpen }: { project: Project; card: FeatureCard; look: ReturnType<typeof effectiveAppearance>; onOpen: () => void }) {
  const { t: i18n } = useBoardI18n();

  const disabled = !card.open;
  return (
    // 整张可点：一个盖住整张卡片的按钮（缩略图里的舞台也有按钮，不能把卡片本身做成 button）
    <div
      data-testid={`feature-${card.id}`}
      data-interactive={!disabled ? 'true' : undefined}
      className={cn(
        'jb-home-slab group relative flex flex-col overflow-hidden text-left has-[[data-card-open]:focus-visible]:shadow-[0_0_0_2px_var(--jb-accent-press)]',
        disabled && 'border border-dashed border-jb-line bg-transparent shadow-none',
      )}
    >
      {!disabled ? <button type="button" data-card-open="" onClick={onOpen} aria-label={card.work ? i18n.site.watchFor(card.name) : i18n.board.openDemoFor(card.name)} data-testid={`open-${card.id}`} className="jb-focus absolute inset-0 z-[2] rounded-[20px]" /> : null}
      <div className="overflow-hidden rounded-[14px] bg-jb-subtle shadow-[inset_0_0_0_1px_var(--juice-edge)]">
        <StageThumb project={project} scenarioId={card.thumb?.scenarioId ?? null} sceneId={card.thumb?.sceneId ?? null} look={look} testid={`thumb-${card.id}`} />
      </div>
      <div className="flex flex-col gap-1.5 px-3 pb-2.5 pt-3">
        <div className="flex items-center gap-3">
          <span className="min-w-0 flex-1 truncate text-[16.5px] font-bold tracking-[-0.01em]">{card.name}</span>
          {!disabled ? (
            <span className="flex shrink-0 items-center gap-1 rounded-[8px] bg-[var(--juice-w6)] px-2 py-0.5 text-[12.5px] font-semibold opacity-0 transition-opacity group-hover:opacity-100 group-has-[[data-card-open]:focus-visible]:opacity-100" data-testid={`view-${card.id}`}>
              {card.work ? i18n.site.watch : i18n.board.openDemo}<ArrowRight className="size-3.5" aria-hidden />
            </span>
          ) : null}
        </div>
        <p className="line-clamp-2 text-[13px] leading-5 text-jb-muted">{card.goal}</p>
        {card.work ? (
          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px]" data-testid={`work-meta-${card.id}`}>
            <span className="text-jb-muted">{entryMetaText(card.work, i18n)}</span>
            {card.work.draft ? <Badge className="h-[20px] rounded-[7px] px-2 text-[11px]" data-testid={`work-draft-${card.id}`}>{i18n.board.draftNotPublished}</Badge> : null}
          </div>
        ) : (
          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px]" data-testid={`feature-gaps-${card.id}`}>
            {card.pick ? (
              <Badge className="h-[21px] rounded-[7px] bg-jb-inverse px-2 text-[11px] font-medium text-jb-on-inverse">
                ✓ {card.pick.letter} · {card.pick.title}
              </Badge>
            ) : (
              <Badge className="h-[21px] rounded-[7px] px-2 text-[11px]">{i18n.board.noPickedOptionYet}</Badge>
            )}
            <span className="text-jb-muted">
              <RollingCount text={i18n.board.optionCount(card.workCount)} value={card.workCount} />
            </span>
            {card.coverage.allExpressed ? (
              <span className="inline-flex items-center gap-1 font-medium text-jb-ok">
                <StatusIcon status="expressed" size={13} />
                {i18n.board.allCasesCovered}
              </span>
            ) : null}
            {card.coverage.missing ? (
              <span className="inline-flex items-center gap-1 font-medium text-jb-danger">
                <StatusIcon status="missing" size={13} />
                <RollingCount text={i18n.board.missingCount(card.coverage.missing)} value={card.coverage.missing} />
              </span>
            ) : null}
            {card.coverage.undecided ? (
              <span className="inline-flex items-center gap-1 text-jb-muted">
                <StatusIcon status="undecided" size={13} />
                <RollingCount text={i18n.board.undecidedCount(card.coverage.undecided)} value={card.coverage.undecided} />
              </span>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
