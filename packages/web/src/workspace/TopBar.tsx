import { Eye, Hand, PenTool, Square } from 'lucide-react';
import { revisionLabel, type Project } from '@joplo/core';
import type { Mode } from '../runtime/demo';
import type { StageTheme } from '../renderer/rough';
import { cn } from '@/lib/utils';

export function TopBar({
  project,
  revision,
  live,
  optionId,
  mode,
  theme,
  onOption,
  onMode,
  onTheme,
}: {
  project: Project | null;
  revision: number | null;
  live: boolean;
  optionId: string | null;
  mode: Mode;
  theme: StageTheme;
  onOption: (id: string) => void;
  onMode: (m: Mode) => void;
  onTheme: (t: StageTheme) => void;
}) {
  const option = project && optionId ? project.options[optionId] : null;
  const feature = project && option ? project.features[option.featureId] : null;
  const options = project ? Object.values(project.options).filter((o) => !o.archived) : [];
  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b bg-white px-4">
      <div className="flex min-w-0 items-center gap-2">
        <span className="rounded bg-[#1e1e1e] px-1.5 py-0.5 text-[13px] font-bold tracking-wide text-white">Joplo</span>
        <span className="truncate text-[15px] font-semibold" title={project?.name}>
          {project?.name ?? '加载中…'}
        </span>
        {feature ? (
          <>
            <span className="text-[#9a9a9a]">/</span>
            <span className="truncate text-[14px]" title={feature.name}>
              {feature.name}
            </span>
          </>
        ) : null}
        <span className="text-[#9a9a9a]">/</span>
        <label className="sr-only" htmlFor="opt-select">
          方案
        </label>
        <select
          id="opt-select"
          data-testid="option-select"
          className="h-8 max-w-[260px] truncate rounded-md border bg-white px-2 text-[14px]"
          value={optionId ?? ''}
          onChange={(e) => onOption(e.target.value)}
          disabled={options.length === 0}
        >
          {options.length === 0 ? <option value="">（还没有方案）</option> : null}
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        {revision !== null ? (
          <span className="flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[12px] text-[#3a3a3a]" title={live ? '已连接，修订更新会自动刷新' : '实时刷新未连接'} data-testid="revision">
            <span className={cn('size-1.5 rounded-full', live ? 'bg-[#2b8a3e]' : 'bg-[#9a9a9a]')} />
            {revisionLabel(revision)}
          </span>
        ) : null}
      </div>

      <div className="mx-auto flex items-center gap-3">
        <div role="radiogroup" aria-label="工作区模式" className="flex rounded-lg border-2 border-[#1e1e1e] p-0.5" data-testid="mode-switch">
          <ModeButton active={mode === 'review'} onClick={() => onMode('review')} icon={<Eye className="size-4" />} label="审阅" color="#6741d9" testid="mode-review" />
          <ModeButton active={mode === 'demo'} onClick={() => onMode('demo')} icon={<Hand className="size-4" />} label="演示" color="#e8590c" testid="mode-demo" />
        </div>
        <span className="text-[13px]" style={{ color: mode === 'review' ? '#5f3dc4' : '#c2410c' }} data-testid="mode-hint">
          {mode === 'review' ? '审阅模式：点击元素只选中，不触发演示' : '演示模式：点击会执行原型交互'}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <div role="radiogroup" aria-label="原型主题" className="flex rounded-md border p-0.5 text-[13px]">
          <ThemeButton active={theme === 'sketch'} onClick={() => onTheme('sketch')} icon={<PenTool className="size-3.5" />} label="手绘" />
          <ThemeButton active={theme === 'clean'} onClick={() => onTheme('clean')} icon={<Square className="size-3.5" />} label="线框" />
        </div>
        <span className="rounded border border-dashed border-[#b35c00] bg-[#fff8ee] px-2 py-1 text-[12px] font-medium text-[#8a4700]" data-testid="concept-badge">
          概念原型 · 非正式实现
        </span>
      </div>
    </header>
  );
}

function ModeButton({ active, onClick, icon, label, color, testid }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; color: string; testid: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      data-testid={testid}
      onClick={onClick}
      className={cn('flex items-center gap-1.5 rounded-md px-4 py-1 text-[14px] font-semibold transition-colors', active ? 'text-white' : 'text-[#3a3a3a] hover:bg-black/5')}
      style={active ? { background: color } : undefined}
    >
      {icon}
      {label}
    </button>
  );
}

function ThemeButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button type="button" role="radio" aria-checked={active} onClick={onClick} className={cn('flex items-center gap-1 rounded px-2 py-0.5', active ? 'bg-[#1e1e1e] text-white' : 'text-[#3a3a3a] hover:bg-black/5')}>
      {icon}
      {label}
    </button>
  );
}
