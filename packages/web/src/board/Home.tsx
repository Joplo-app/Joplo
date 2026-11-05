/**
 * 看板首页（D39，home 方案 A“记住打开过的项目”）：
 * - 左栏：最近打开的项目（~/.joplo/projects.json，按最近打开排序）；编译出错显示错误数，目录不存在显示“找不到目录”。
 * - 右侧：所选项目的功能行（名称、目标、方案数、选定方案、缺口数、「查看」）；
 *   编译出错时列出 `文件:行` 与说明（修好后自动刷新）；目录不存在时可以从列表移除（只删记录，不删文件）。
 * - 没有任何项目时：三条开始命令。
 */
import { useState, type ReactNode } from 'react';
import type { Diagnostic, Project } from '@joplo-app/core';
import { removeProject, type ProjectSummary } from '../runtime/dev-client';
import { optionsOf } from '../runtime/views';
import { Brand, TopBar } from '../player/PlayerPage';
import { cn } from '@/lib/utils';
import { gapsOf } from './nav-model';
import { useProjectIR } from './hooks';

const tilde = (dir: string) => dir.replace(/^\/(Users|home)\/[^/]+/, '~');

function describe(p: ProjectSummary): { text: string; tone: 'muted' | 'error' | 'gone' } {
  if (p.status === 'missing') return { text: `找不到目录 · ${tilde(p.dir)}`, tone: 'gone' };
  if (p.status === 'error') return { text: `${p.errors} 个错误 · ${tilde(p.dir)}`, tone: 'error' };
  return { text: tilde(p.dir), tone: 'muted' };
}

export function Home({ projects, error, selectedId, onSelect, onView, right, flash }: { projects: ProjectSummary[] | null; error: string | null; selectedId: string | null; onSelect: (id: string) => void; onView: (projectId: string, featureId: string) => void; /** 顶栏右侧（外观按钮，D55）。 */ right?: ReactNode; flash?: ReactNode | null }) {
  const selected = projects?.find((p) => p.id === selectedId) ?? null;
  return (
    <div className="flex h-full flex-col bg-[#f8f9fa]" data-testid="home">
      <TopBar right={right}>
        <Brand />
      </TopBar>
      {flash ? (
        <div role="status" className="jb-tip fixed left-1/2 top-16 z-50 -translate-x-1/2 whitespace-nowrap px-3 py-2 text-[13px]" data-testid="flash">
          {flash}
        </div>
      ) : null}
      {error ? (
        <div role="alert" className="border-b border-[#c92a2a] bg-[#fff0f0] px-4 py-2 text-[13px] text-[#a51d1d]" data-testid="load-error">
          {error}
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[280px] shrink-0 flex-col overflow-y-auto border-r bg-white p-3" data-testid="project-list">
          <div className="px-2 text-[12px] text-[#6b6b6b]">最近打开</div>
          <ul className="mt-1 flex flex-col gap-0.5">
            {(projects ?? []).map((p) => {
              const d = describe(p);
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(p.id)}
                    data-testid={`home-project-${p.id}`}
                    data-status={p.status}
                    className={cn('w-full rounded-md px-3 py-2 text-left hover:bg-[#f1f3f5]', p.id === selectedId && 'bg-[#e7f0ff] hover:bg-[#e7f0ff]')}
                  >
                    <div className={cn('truncate text-[14px]', p.id === selectedId && 'font-semibold', p.status === 'missing' && 'text-[#868e96]')}>{p.name}</div>
                    <div className={cn('truncate text-[12px]', d.tone === 'error' ? 'text-[#c92a2a]' : 'text-[#868e96]')} title={p.dir}>
                      {d.text}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mx-2 mt-3 border-t pt-3 text-[12px] leading-relaxed text-[#868e96]">在任意项目目录运行 npx joplo dev，它就会出现在这里。</div>
        </aside>
        <main className="min-w-0 flex-1 overflow-y-auto p-8">
          {projects && projects.length === 0 ? <Empty /> : selected ? <ProjectPanel key={selected.id} summary={selected} onView={onView} /> : null}
        </main>
      </div>
    </div>
  );
}

function Empty() {
  return (
    <div className="mx-auto mt-[12vh] flex max-w-[520px] flex-col items-center gap-3 text-center" data-testid="home-empty">
      <h2 className="text-[22px] font-semibold">还没有打开过项目</h2>
      <p className="text-[14px] text-[#6b6b6b]">在一个空目录里运行：</p>
      <pre className="w-full rounded-lg bg-[#f1f3f5] px-4 py-3 text-left font-mono text-[13px] leading-relaxed">{'npx joplo init my-demo\ncd my-demo && npm install\nnpx joplo dev'}</pre>
      <p className="text-[13px] text-[#868e96]">打开过的项目会记在 ~/.joplo/projects.json，下次直接出现在左栏。</p>
    </div>
  );
}

function Errors({ list, note }: { list: Diagnostic[]; note: string }) {
  const errors = list.filter((d) => d.severity === 'error');
  return (
    <div role="alert" className="rounded-lg border border-[#ffc9c9] bg-[#fff5f5] p-4" data-testid="home-errors">
      <div className="text-[15px] font-semibold text-[#c92a2a]">编译失败（{errors.length}），{note}</div>
      <ul className="mt-2 flex flex-col gap-1 text-[13px]">
        {errors.slice(0, 30).map((d, i) => (
          <li key={i} className="flex gap-3" data-testid="home-error-item">
            <code className="shrink-0 font-mono font-semibold text-[#a51d1d]">{d.at ?? '（无位置）'}</code>
            <span className="whitespace-pre-wrap break-all text-[#3a3a3a]">{d.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ProjectPanel({ summary, onView }: { summary: ProjectSummary; onView: (projectId: string, featureId: string) => void }) {
  const ir = useProjectIR(summary.status === 'missing' ? null : summary.id);
  const [removeError, setRemoveError] = useState<string | null>(null);
  if (summary.status === 'missing')
    return (
      <div className="max-w-[720px] rounded-lg border bg-white p-5" data-testid="home-missing">
        <h2 className="text-[17px] font-semibold">找不到项目目录</h2>
        <p className="mt-2 text-[14px] text-[#3a3a3a]">
          <code className="font-mono">{tilde(summary.dir)}</code> 已不存在。目录移动过的话，在新位置运行 npx joplo dev 就会重新加入。
        </p>
        <button
          type="button"
          className="mt-4 rounded-md border px-3 py-1.5 text-[13px] hover:bg-black/5"
          data-testid="remove-project"
          onClick={() => void removeProject(summary.id).then((r) => setRemoveError(r.ok ? null : r.message))}
        >
          从列表移除
        </button>
        <p className="mt-2 text-[12px] text-[#868e96]">只删除这条记录，不会删除任何文件。</p>
        {removeError ? <p className="mt-2 text-[13px] text-[#c92a2a]">{removeError}</p> : null}
      </div>
    );
  const p = ir.payload;
  const project = p?.project ?? null;
  if (!p) return <div className="text-[14px] text-[#6b6b6b]">{ir.error ?? '正在编译项目…'}</div>;
  return (
    <div className="flex max-w-[960px] flex-col gap-5" data-testid="home-project">
      <div>
        <h1 className="text-[24px] font-semibold" data-testid="project-name">
          {project?.name ?? summary.name}
        </h1>
        {project?.description ? <p className="mt-1 text-[14px] text-[#6b6b6b]">{project.description}</p> : null}
      </div>
      {!p.ok ? <Errors list={p.diagnostics} note={project ? '下面仍是上一次成功的结果；修复后自动刷新' : '修复后自动刷新'} /> : null}
      {project ? <Features project={project} onView={(f) => onView(summary.id, f)} /> : null}
    </div>
  );
}

function Features({ project, onView }: { project: Project; onView: (featureId: string) => void }) {
  const features = Object.values(project.features);
  const picked = features.filter((f) => f.pick).length;
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[17px] font-semibold">功能</h2>
        <span className="text-[13px] text-[#868e96]">
          {location.host} · 已选定 {picked} / {features.length}
        </span>
      </div>
      {features.length === 0 ? <p className="text-[14px] text-[#6b6b6b]">还没有功能。在 features/&lt;名称&gt;/feature.ts 里写第一个功能。</p> : null}
      {features.map((f) => {
        const options = optionsOf(project, f.id);
        const pick = f.pick ? project.options[f.pick] : null;
        const gaps = gapsOf(project, pick?.id ?? options[0]?.id ?? null);
        return (
          <div key={f.id} className="flex items-center justify-between gap-4 rounded-lg border bg-white p-4" data-testid={`feature-${f.id}`}>
            <div className="min-w-0">
              <div className="text-[15px] font-semibold">{f.name}</div>
              <div className="mt-0.5 text-[13px] text-[#6b6b6b]">{f.goal}</div>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[12px]">
                <span className="rounded-full bg-[#f1f3f5] px-2.5 py-0.5">{options.length} 个方案</span>
                <span className="rounded-full bg-[#e7f0ff] px-2.5 py-0.5 text-[#1c5fb8]">{pick ? `已选 ${pick.name}` : '还没有选定方案'}</span>
                <span className={cn('rounded-full px-2.5 py-0.5', gaps.missing + gaps.undecided ? 'bg-[#fff0f0] text-[#c92a2a]' : 'bg-[#effaf1] text-[#2b8a3e]')} data-testid={`feature-gaps-${f.id}`}>
                  缺失 {gaps.missing} · 待决定 {gaps.undecided}
                </span>
              </div>
            </div>
            <button type="button" onClick={() => onView(f.id)} disabled={options.length === 0} className="shrink-0 rounded-md border bg-white px-4 py-2 text-[14px] hover:bg-[#f8f9fa] disabled:opacity-40" data-testid={`view-${f.id}`}>
              查看
            </button>
          </div>
        );
      })}
    </section>
  );
}
