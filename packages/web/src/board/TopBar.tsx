/**
 * 顶栏（演示与审阅模式共用）：项目名、当前路径、功能/方案/场景切换、视图（比较方案 / 浏览）、
 * 缺口胶囊（点击切到审阅模式并展开情况列表）、模式切换、主题、“概念原型”标识。
 */
import { Columns3, Eye, Hand, Map as MapIcon, Monitor, PenTool, Play, Smartphone, Square } from 'lucide-react';
import type { Project } from '@tokenroll/joplo-core';
import type { Mode, Snapshot } from '../runtime/demo';
import { gapCounts, optionsOf, scenariosOf } from '../runtime/views';
import type { StageTheme } from '../renderer/rough';
import type { Viewport } from '../renderer/Stage';
import { cn } from '@/lib/utils';

export function TopBar({
  snap,
  theme,
  live,
  onFeature,
  onOption,
  onScenario,
  onView,
  onMode,
  onTheme,
  onGaps,
  width,
  pageWidth,
  onWidth,
}: {
  snap: Snapshot;
  theme: StageTheme;
  live: boolean;
  onFeature: (id: string) => void;
  onOption: (id: string) => void;
  onScenario: (id: string) => void;
  onView: (v: Snapshot['view']) => void;
  onMode: (m: Mode) => void;
  onTheme: (t: StageTheme) => void;
  onGaps: () => void;
  /** 预览宽度：null 表示按页面自身的 viewport。 */
  width: Viewport | null;
  pageWidth: Viewport;
  onWidth: (w: Viewport | null) => void;
}) {
  const project: Project | null = snap.project;
  const features = project ? Object.values(project.features) : [];
  const options = project ? optionsOf(project, snap.featureId) : [];
  const scenarios = project ? scenariosOf(project, snap.optionId) : [];
  const option = project && snap.optionId ? project.options[snap.optionId] : null;
  const gaps = gapCounts(option);
  const route = project && snap.state && snap.view !== 'compare' ? project.scenes[snap.state.sceneId]?.route : null;
  const mode = snap.mode;

  return (
    <header className="flex h-[52px] shrink-0 items-center gap-3 border-b bg-white px-3" data-testid="topbar">
      <div className="flex min-w-0 shrink items-center gap-2">
        <span className="rounded bg-[#1e1e1e] px-1.5 py-0.5 text-[13px] font-bold tracking-wide text-white">Joplo</span>
        <span className="max-w-[160px] truncate text-[15px] font-semibold" title={project?.name} data-testid="project-name">
          {project?.name ?? '载入中…'}
        </span>
        {route ? (
          <span className="flex items-center gap-1 rounded border bg-[#fafafa] px-1.5 py-0.5 font-mono text-[12px] text-[#3a3a3a]" title="当前画面所在的路径" data-testid="current-route">
            <span className={cn('size-1.5 rounded-full', live ? 'bg-[#2b8a3e]' : 'bg-[#9a9a9a]')} title={live ? '热更新已连接' : '热更新未连接'} />
            {route}
          </span>
        ) : null}
      </div>

      <div className="flex min-w-0 items-center gap-1.5">
        <Picker label="功能" testid="feature-select" value={snap.featureId ?? ''} onChange={onFeature} items={features.map((f) => ({ value: f.id, label: f.name }))} empty="（没有功能）" width="max-w-[140px]" />
        <Picker
          label="方案"
          testid="option-select"
          value={snap.optionId ?? ''}
          onChange={onOption}
          items={options.map((o) => ({ value: o.id, label: `${o.name}${project?.features[o.featureId]?.pick === o.id ? ' ✓' : ''}` }))}
          empty="（没有方案）"
          width="max-w-[190px]"
        />
        {snap.view === 'stage' ? (
          <Picker label="场景" testid="scenario-select" value={snap.scenarioId ?? ''} onChange={onScenario} items={scenarios.map((s) => ({ value: s.id, label: `${s.name} · ${s.mock.label}` }))} empty="（没有场景）" width="max-w-[210px]" />
        ) : null}
        <div className="ml-1 flex rounded-md border p-0.5 text-[13px]" role="tablist" aria-label="视图">
          <ViewButton active={snap.view === 'stage'} onClick={() => onView('stage')} testid="view-stage" icon={<Play className="size-3.5" />} label="演示场景" />
          <ViewButton active={snap.view === 'compare'} onClick={() => onView('compare')} testid="view-compare" icon={<Columns3 className="size-3.5" />} label="比较方案" />
          <ViewButton active={snap.view === 'browse'} onClick={() => onView('browse')} testid="view-browse" icon={<MapIcon className="size-3.5" />} label="浏览产品" />
        </div>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        {option ? (
          <button
            type="button"
            onClick={onGaps}
            data-testid="gap-capsule"
            title="当前方案的情况覆盖缺口；点击查看情况列表"
            className={cn('rounded-full border px-2.5 py-1 text-[12px] font-medium', gaps.missing + gaps.undecided > 0 ? 'border-[#c92a2a] bg-[#fff0f0] text-[#a51d1d] hover:bg-[#ffe3e3]' : 'border-[#2b8a3e] bg-[#effaf1] text-[#1f6e30]')}
          >
            缺失 {gaps.missing} · 待决定 {gaps.undecided}
          </button>
        ) : null}
        <div role="radiogroup" aria-label="看板模式" className="flex rounded-lg border-2 border-[#1e1e1e] p-0.5" data-testid="mode-switch">
          <ModeButton active={mode === 'demo'} onClick={() => onMode('demo')} icon={<Hand className="size-4" />} label="演示" color="#e8590c" testid="mode-demo" />
          <ModeButton active={mode === 'review'} onClick={() => onMode('review')} icon={<Eye className="size-4" />} label="审阅" color="#6741d9" testid="mode-review" />
        </div>
        <div role="radiogroup" aria-label="预览宽度" className="flex rounded-md border p-0.5 text-[12px]" data-testid="width-switch" title="按桌面或手机宽度预览：响应式属性、visibleFrom/hiddenFrom、AppShell 导航收起随之变化">
          <ThemeButton active={(width ?? pageWidth) === 'desktop'} onClick={() => onWidth(pageWidth === 'desktop' ? null : 'desktop')} icon={<Monitor className="size-3.5" />} label="桌面宽度" testid="width-desktop" iconOnly />
          <ThemeButton active={(width ?? pageWidth) === 'mobile'} onClick={() => onWidth(pageWidth === 'mobile' ? null : 'mobile')} icon={<Smartphone className="size-3.5" />} label="手机宽度" testid="width-mobile" iconOnly />
        </div>
        <div role="radiogroup" aria-label="原型主题" className="flex rounded-md border p-0.5 text-[12px]">
          <ThemeButton active={theme === 'sketch'} onClick={() => onTheme('sketch')} icon={<PenTool className="size-3.5" />} label="手绘" />
          <ThemeButton active={theme === 'clean'} onClick={() => onTheme('clean')} icon={<Square className="size-3.5" />} label="线框" />
        </div>
        <span className="rounded border border-dashed border-[#b35c00] bg-[#fff8ee] px-2 py-1 text-[12px] font-medium text-[#8a4700]" data-testid="concept-badge" title="原型只用于讨论设计，不是正式实现">
          概念原型
        </span>
      </div>
    </header>
  );
}

function Picker({ label, testid, value, onChange, items, empty, width }: { label: string; testid: string; value: string; onChange: (v: string) => void; items: { value: string; label: string }[]; empty: string; width: string }) {
  return (
    <label className="flex items-center gap-1 whitespace-nowrap text-[12px] text-[#6b6b6b]">
      <span className="shrink-0 max-[1700px]:sr-only">{label}</span>
      <select data-testid={testid} className={cn('h-8 truncate rounded-md border bg-white px-1.5 text-[13px] text-[#1e1e1e]', width)} value={value} onChange={(e) => onChange(e.target.value)} disabled={items.length === 0}>
        {items.length === 0 ? <option value="">{empty}</option> : null}
        {items.map((i) => (
          <option key={i.value} value={i.value}>
            {i.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ViewButton({ active, onClick, icon, label, testid }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; testid: string }) {
  return (
    <button type="button" role="tab" aria-selected={active} data-testid={testid} onClick={onClick} title={label} className={cn('flex items-center gap-1 whitespace-nowrap rounded px-2 py-1', active ? 'bg-[#1e1e1e] text-white' : 'text-[#3a3a3a] hover:bg-black/5')}>
      {icon}
      <span className="max-[1700px]:hidden">{label}</span>
    </button>
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
      className={cn('flex items-center gap-1 rounded-md px-3 py-0.5 text-[14px] font-semibold transition-colors', active ? 'text-white' : 'text-[#3a3a3a] hover:bg-black/5')}
      style={active ? { background: color } : undefined}
    >
      {icon}
      {label}
    </button>
  );
}

function ThemeButton({ active, onClick, icon, label, testid, iconOnly = false }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; testid?: string; iconOnly?: boolean }) {
  return (
    <button type="button" role="radio" aria-checked={active} aria-label={label} title={label} onClick={onClick} data-testid={testid} className={cn('flex items-center gap-1 rounded px-1.5 py-0.5', active ? 'bg-[#1e1e1e] text-white' : 'text-[#3a3a3a] hover:bg-black/5')}>
      {icon}
      {iconOnly ? null : label}
    </button>
  );
}
