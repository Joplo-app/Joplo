/**
 * 看板首页（D39 home 方案 A“记住打开过的项目”，D55「首页」）：
 * - 左栏：最近打开的项目（~/.joplo/projects.json，按最近打开排序），名字 + 缩写的路径；编译出错写错误数，目录不存在写“找不到”；
 *   ↑↓ 移动选中；底部“添加项目：在项目目录里运行 npx joplo dev”（可复制）。
 * - 右侧：项目名、说明、路径与“N 个功能 · 已选定 a / n”、右上角编译状态；功能卡片整张可点（Enter 也可以），带缩略图
 *   （Stage 的 render 模式渲染选定方案第一个场景的初始画面，进入视口才渲染）、选定方案、方案数和覆盖小结。
 *   编译出错时列出 `文件:行` 与说明（修好后自动刷新）；目录不存在时可以从列表移除（只删记录，不删文件）。
 * - 没有任何项目时：标志、一句话、三条可复制的开始命令。
 * 视图计算在 home-model.ts。
 */
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, Copy, FolderX } from 'lucide-react';
import type { Diagnostic, Project } from '@joplo-app/core';
import { removeProject, type ProjectSummary } from '../runtime/dev-client';
import { Brand, TopBar } from '../player/PlayerPage';
import { JoploMark } from '../player/JoploMark';
import { Btn } from '../player/controls';
import { StatusIcon } from '../player/StatusIcon';
import { copyText } from '../player/util';
import { StageThumb } from '../player/StageThumb';
import { ThemeStyles } from '../renderer/ThemeStyles';
import { themeCatalog } from '../renderer/themes';
import { cn } from '@/lib/utils';
import { useProjectIR } from './hooks';
import { useBoardSettings } from './useSettings';
import { effectiveAppearance } from './appearance-model';
import { featureCard, moveSelection, projectBadge, projectMeta, shortPath, type FeatureCard } from './home-model';

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
  error: string | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onView: (projectId: string, featureId: string, optionId?: string) => void;
  /** 顶栏右侧（外观按钮，D55）。 */
  right?: ReactNode;
  flash?: ReactNode | null;
  onFlash?: (msg: string) => void;
}) {
  const selected = projects?.find((p) => p.id === selectedId) ?? null;
  const listRef = useRef<HTMLUListElement>(null);
  const copy = (text: string) => void copyText(text).then((ok) => onFlash?.(ok ? `已复制 ${text}` : '无法访问剪贴板'));
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const next = moveSelection(projects ?? [], selectedId, e.key === 'ArrowDown' ? 1 : -1);
    if (!next) return;
    onSelect(next);
    requestAnimationFrame(() => listRef.current?.querySelector<HTMLElement>(`[data-testid="home-project-${CSS.escape(next)}"]`)?.focus());
  };
  return (
    <div className="flex h-full flex-col overflow-hidden bg-jb-app font-jb text-jb-fg" data-testid="home">
      <TopBar right={right}>
        <Brand />
      </TopBar>
      {error ? (
        <div role="alert" className="border-b border-jb-danger bg-jb-danger-bg px-4 py-2 text-[13px] text-jb-danger" data-testid="load-error">
          {error}
        </div>
      ) : null}
      {flash ? (
        <div role="status" className="jb-tip fixed left-1/2 top-16 z-50 -translate-x-1/2 whitespace-nowrap px-3 py-2 text-[13px]" data-testid="flash">
          {flash}
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[276px] shrink-0 flex-col border-r border-jb-line bg-jb-surface px-3 py-4" data-testid="project-list">
          <div className="flex items-baseline justify-between px-2 pb-1.5 pt-2 text-[12px]">
            <span className="font-semibold tracking-[1px] text-jb-muted">项目</span>
            <span className="text-jb-faint">最近打开</span>
          </div>
          <ul ref={listRef} className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto" onKeyDown={onKey} aria-label="最近打开的项目">
            {(projects ?? []).map((p) => {
              const badge = projectBadge(p);
              const on = p.id === selectedId;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(p.id)}
                    data-testid={`home-project-${p.id}`}
                    data-status={p.status}
                    aria-current={on ? 'true' : undefined}
                    className={cn('jb-focus flex w-full items-center gap-2 rounded-[8px] px-2.5 py-2 text-left', on ? 'bg-jb-selected' : 'hover:bg-jb-hover active:bg-jb-press')}
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className={cn('truncate text-[14px]', on && 'font-semibold', p.status === 'missing' && 'text-jb-faint')}>{p.name}</span>
                      <span className="truncate font-jb-mono text-[11px] text-jb-faint" title={p.dir}>
                        {shortPath(p.dir)}
                      </span>
                    </span>
                    {badge ? <span className={cn('shrink-0 rounded-[4px] px-1.5 py-px text-[11px] font-medium', badge.tone === 'danger' ? 'bg-jb-danger-bg text-jb-danger' : 'bg-jb-sunken text-jb-faint')}>{badge.text}</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex flex-col gap-2 rounded-[10px] bg-jb-app p-3" data-testid="home-add">
            <span className="text-[12px] text-jb-muted">添加项目：在项目目录里运行</span>
            <CopyLine text="npx joplo dev" onCopy={copy} />
          </div>
        </aside>
        <main className="min-w-0 flex-1 overflow-y-auto px-10 py-8">
          {projects && projects.length === 0 ? <Empty onCopy={copy} /> : selected ? <ProjectPanel key={selected.id} summary={selected} onView={onView} /> : null}
        </main>
      </div>
    </div>
  );
}

function CopyLine({ text, onCopy }: { text: string; onCopy: (text: string) => void }) {
  return (
    <div className="flex h-8 items-center gap-2 rounded-[6px] border border-jb-line bg-jb-surface pl-2.5 pr-1">
      <code className="min-w-0 flex-1 truncate font-jb-mono text-[12px]">{text}</code>
      <button type="button" className="jb-focus flex size-6 shrink-0 items-center justify-center rounded-[4px] text-jb-muted hover:bg-jb-hover hover:text-jb-fg" aria-label={`复制 ${text}`} onClick={() => onCopy(text)}>
        <Copy className="size-3.5" />
      </button>
    </div>
  );
}

/** 首页空状态：标志、一句话、三条可复制的命令；不放插画。 */
function Empty({ onCopy }: { onCopy: (text: string) => void }) {
  return (
    <div className="mx-auto mt-[12vh] flex max-w-[440px] flex-col items-center gap-4 text-center" data-testid="home-empty">
      <JoploMark size={56} />
      <h2 className="text-[20px] font-bold">还没有打开过项目</h2>
      <div className="flex w-full flex-col gap-1.5 rounded-[10px] border border-jb-line bg-jb-surface p-3">
        {['npx joplo init my-demo', 'cd my-demo && npm install', 'npx joplo dev'].map((c) => (
          <CopyLine key={c} text={c} onCopy={onCopy} />
        ))}
      </div>
      <p className="text-[12px] text-jb-faint">打开过的项目会记在 ~/.joplo/projects.json，下次直接出现在左栏。</p>
    </div>
  );
}

function Errors({ list, note }: { list: Diagnostic[]; note: string }) {
  const errors = list.filter((d) => d.severity === 'error');
  return (
    <div role="alert" className="rounded-[8px] border-l-4 border-jb-danger bg-jb-danger-bg px-4 py-3" data-testid="home-errors">
      <div className="text-[14px] font-semibold text-jb-danger">
        编译出错 {errors.length} 处 · {note}
      </div>
      <ul className="mt-2 flex flex-col gap-1 text-[13px]">
        {errors.slice(0, 30).map((d, i) => (
          <li key={i} className="flex gap-3" data-testid="home-error-item">
            <code className="shrink-0 font-jb-mono text-[12px] font-semibold">{d.at ?? '（无位置）'}</code>
            <span className="whitespace-pre-wrap break-all text-jb-muted">{d.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ProjectPanel({ summary, onView }: { summary: ProjectSummary; onView: (projectId: string, featureId: string, optionId?: string) => void }) {
  const ir = useProjectIR(summary.status === 'missing' ? null : summary.id);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const { settings } = useBoardSettings();
  const p = ir.payload;
  const project = p?.project ?? null;
  const key = JSON.stringify(project?.themes ?? {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const names = useMemo(() => themeCatalog(project?.themes ?? {}).map((t) => t.name), [key]);
  if (summary.status === 'missing')
    return (
      <div className="flex max-w-[640px] flex-col gap-3 rounded-[10px] border border-jb-line bg-jb-surface p-5" data-testid="home-missing">
        <h2 className="flex items-center gap-2 text-[17px] font-bold">
          <FolderX className="size-5 text-jb-muted" aria-hidden />
          找不到这个项目的目录
        </h2>
        <p className="text-[14px]">
          <code className="font-jb-mono text-[13px]">{summary.dir}</code> 已不存在。目录移动过的话，在新位置运行 npx joplo dev 就会重新加入。
        </p>
        <div>
          <Btn label="从列表移除" onClick={() => void removeProject(summary.id).then((r) => setRemoveError(r.ok ? null : r.message))} data-testid="remove-project" />
        </div>
        <p className="text-[12px] text-jb-faint">只删除这条记录，不会删除任何文件。</p>
        {removeError ? <p className="text-[13px] text-jb-danger">{removeError}</p> : null}
      </div>
    );
  if (!p) return <div className="text-[14px] text-jb-muted">{ir.error ?? '正在编译项目…'}</div>;
  // 缩略图用这个项目自己的外观（D55：本项目 > 所有项目 > 项目 config）
  const look = project ? effectiveAppearance(settings, summary.id, project.theme ?? 'sketch', names) : null;
  const status = !p.ok ? { dot: 'bg-jb-danger', text: `编译出错 ${p.diagnostics.filter((d) => d.severity === 'error').length} 处` } : ir.live ? { dot: 'bg-jb-ok', text: '已编译 · 热更新中' } : { dot: 'bg-jb-ok', text: '已编译' };
  return (
    <div className="flex max-w-[1120px] flex-col gap-5" data-testid="home-project">
      {project ? <ThemeStyles themes={project.themes} /> : null}
      <header className="flex items-start gap-6">
        <div className="min-w-0 flex-1">
          <h1 className="text-[24px] font-bold leading-8" data-testid="project-name">
            {project?.name ?? summary.name}
          </h1>
          {project?.description ? <p className="mt-1.5 max-w-[860px] text-[14px] leading-[22px] text-jb-muted">{project.description}</p> : null}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
            <code className="font-jb-mono text-jb-faint">{summary.dir.replace(/^\/(Users|home)\/[^/]+/, '~')}</code>
            {project ? <span className="text-jb-muted">{projectMeta(project)}</span> : null}
          </div>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 pt-2 text-[12px] text-jb-muted" data-testid="project-status">
          <span aria-hidden className={cn('size-2 rounded-full', status.dot)} />
          {status.text}
        </span>
      </header>
      {!p.ok ? <Errors list={p.diagnostics} note={project ? '下面仍是上一次成功的结果；修复后自动刷新' : '修复后自动刷新'} /> : null}
      {project && look ? <Features project={project} look={look} onView={(f, o) => onView(summary.id, f, o)} /> : null}
    </div>
  );
}

function Features({ project, look, onView }: { project: Project; look: ReturnType<typeof effectiveAppearance>; onView: (featureId: string, optionId?: string) => void }) {
  const cards = Object.keys(project.features)
    .map((id) => featureCard(project, id))
    .filter((c): c is FeatureCard => !!c);
  if (!cards.length) return <p className="text-[14px] text-jb-muted">还没有功能。在 features/&lt;名称&gt;/feature.ts 里写第一个功能。</p>;
  return (
    <section className="grid grid-cols-1 gap-5 min-[1100px]:grid-cols-2" data-testid="home-features">
      {cards.map((c) => (
        <FeatureCardView key={c.id} project={project} card={c} look={look} onOpen={() => c.open && onView(c.open.featureId, c.open.optionId)} />
      ))}
    </section>
  );
}

/** 功能卡片（整张可点）：缩略图 + 名字 + 目标 + 选定方案、方案数、覆盖小结。 */
function FeatureCardView({ project, card, look, onOpen }: { project: Project; card: FeatureCard; look: ReturnType<typeof effectiveAppearance>; onOpen: () => void }) {
  const disabled = !card.open;
  return (
    // 整张可点：一个盖住整张卡片的按钮（缩略图里的舞台也有按钮，不能把卡片本身做成 button）
    <div data-testid={`feature-${card.id}`} className={cn('group relative flex flex-col overflow-hidden rounded-[10px] border bg-jb-surface text-left has-[[data-card-open]:focus-visible]:border-jb-ink', disabled ? 'border-dashed border-jb-line' : 'border-jb-line hover:border-jb-ink hover:shadow-[var(--jb-e1)]')}>
      {!disabled ? <button type="button" data-card-open="" onClick={onOpen} aria-label={`打开「${card.name}」的演示`} data-testid={`open-${card.id}`} className="jb-focus absolute inset-0 z-[2] rounded-[10px]" /> : null}
      <StageThumb project={project} scenarioId={card.thumb?.scenarioId ?? null} sceneId={card.thumb?.sceneId ?? null} look={look} testid={`thumb-${card.id}`} />
      <div className="flex flex-col gap-1.5 border-t border-jb-line px-4 pb-4 pt-3">
        <div className="flex items-center gap-3">
          <span className="min-w-0 flex-1 truncate text-[17px] font-bold">{card.name}</span>
          {!disabled ? (
            <span className="flex shrink-0 items-center gap-1 text-[13px] font-semibold opacity-0 transition-opacity group-hover:opacity-100 group-has-[[data-card-open]:focus-visible]:opacity-100" data-testid={`view-${card.id}`}>
              打开演示
              <ArrowRight className="size-4" aria-hidden />
            </span>
          ) : null}
        </div>
        <p className="line-clamp-2 text-[13px] leading-5 text-jb-muted">{card.goal}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px]" data-testid={`feature-gaps-${card.id}`}>
          {card.pick ? (
            <span className="rounded-[4px] bg-jb-inverse px-1.5 py-px text-[11px] font-medium text-jb-on-inverse">
              ✓ {card.pick.letter} · {card.pick.title}
            </span>
          ) : (
            <span className="rounded-[4px] border border-jb-line px-1.5 py-px text-[11px] text-jb-muted">还没选定方案</span>
          )}
          <span className="text-jb-muted">{card.optionCount} 个方案</span>
          {card.coverage.allExpressed ? (
            <span className="inline-flex items-center gap-1 text-jb-ok">
              <StatusIcon status="expressed" size={13} />
              情况都已表达
            </span>
          ) : null}
          {card.coverage.missing ? (
            <span className="inline-flex items-center gap-1 text-jb-danger">
              <StatusIcon status="missing" size={13} />
              缺失 {card.coverage.missing}
            </span>
          ) : null}
          {card.coverage.undecided ? (
            <span className="inline-flex items-center gap-1 text-jb-muted">
              <StatusIcon status="undecided" size={13} />
              待决定 {card.coverage.undecided}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
