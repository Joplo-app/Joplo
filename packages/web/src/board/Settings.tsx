/**
 * 看板「设置」（D51）：主题。以缩略图网格预览所有主题（内置 + 当前项目的作者主题），缩略图用同一个小样例渲染
 * （按钮、卡片、一段 Diagram、一行字幕）。点一下立即应用到演示页；选择记在 <JOPLO_HOME>/settings.json：
 * “用于当前项目”写进 projects[id]（按项目覆盖），“用于所有项目”写进全局；“恢复为项目默认”让这个项目用自己 config 里的主题。
 */
import { useMemo, useState } from 'react';
import { ArrowLeft, Check } from 'lucide-react';
import { SCHEMA_VERSION, type PlayState, type Project, type Scene, type SceneNode } from '@joplo-app/core';
import { Stage } from '../renderer/Stage';
import { ThemeStyles } from '../renderer/ThemeStyles';
import { effectiveTheme, themeCatalog, type ThemeInfo } from '../renderer/themes';
import { Brand, Segmented, TopBar } from '../player/PlayerPage';
import { Subtitle } from '../player/Subtitle';
import { Btn } from '../player/controls';
import { cn } from '@/lib/utils';
import type { BoardSettings, ProjectSummary } from '../runtime/dev-client';
import { useProjectIR } from './hooks';
import { useBoardSettings } from './useSettings';

// ---------- 缩略图样例（同一个小画面，换主题渲染） ----------
const t = (id: string, text: string): SceneNode => ({ id, type: '#text', props: { text } });
const n = (id: string, type: string, props: Record<string, unknown> = {}, children: SceneNode[] = []): SceneNode => ({ id, type: type as SceneNode['type'], props, children });
const SAMPLE_W = 560;
const SAMPLE_H = 330;
const sampleScene: Scene = {
  id: 'theme-preview',
  optionId: null,
  route: '/',
  name: '主题预览',
  viewport: 'desktop',
  root: n('root', 'Stack', { gap: 'sm', p: 'md' }, [
    n('row', 'Group', { gap: 'sm' }, [n('b1', 'Button', {}, [t('b1t', '主要操作')]), n('b2', 'Button', { variant: 'outline' }, [t('b2t', '次要')]), n('bd', 'Badge', { color: 'green' }, [t('bdt', '已上线')])]),
    n('card', 'Card', { withBorder: true, padding: 'sm' }, [n('ct', 'Text', { fw: 600 }, [t('ctt', '卡片标题')]), n('cd', 'Text', { c: 'dimmed', size: 'sm' }, [t('cdt', '一段次要的说明文字')])]),
    n('arch', 'Diagram', { h: 120 }, [
      n('app', 'Diagram.Node', { label: '客户端', kind: 'client', state: 'ok' }),
      n('biz', 'Diagram.Node', { label: 'Biz', kind: 'service', state: 'active' }),
      n('db', 'Diagram.Node', { label: '数据库', kind: 'database', state: 'error' }),
      n('log', 'Diagram.Node', { label: '日志', kind: 'queue', state: 'dim' }),
      n('e1', 'Diagram.Edge', { from: 'app', to: 'biz', label: '请求', state: 'ok' }),
      n('e2', 'Diagram.Edge', { from: 'biz', to: 'db', state: 'error' }),
      n('e3', 'Diagram.Edge', { from: 'biz', to: 'log', state: 'active' }),
    ]),
  ]),
};
const sampleState: PlayState = { scenarioId: '', position: 0, sceneId: sampleScene.id, ui: {}, data: {}, inputs: {}, toasts: [], completed: null, sceneStack: [] };
const sampleProject = (themes: Record<string, string>): Project =>
  ({ schemaVersion: SCHEMA_VERSION, name: '预览', description: '', theme: 'sketch', themes, mode: 'dev', routes: {}, features: {}, cases: {}, options: {}, rules: {}, scenes: { [sampleScene.id]: sampleScene }, scenarios: {}, issues: {} }) as unknown as Project;

function ThemeThumb({ info, project, on, onPick }: { info: ThemeInfo; project: Project; on: boolean; onPick: () => void }) {
  const k = 0.5;
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={on}
      data-testid={`theme-${info.name}`}
      className={cn('group flex flex-col overflow-hidden rounded-xl border bg-white text-left transition-shadow hover:shadow-md', on ? 'border-[#1e1e1e] ring-2 ring-[#1e1e1e]' : 'border-[#dee2e6]')}
    >
      <div className="pointer-events-none overflow-hidden" style={{ width: SAMPLE_W * k, height: (SAMPLE_H + 44) * k }}>
        <div style={{ width: SAMPLE_W, transform: `scale(${k})`, transformOrigin: '0 0' }}>
          <Stage project={project} state={sampleState} theme={info.name} mode="render" animate={false} viewportOverride={{ width: SAMPLE_W, height: SAMPLE_H }} />
          <Subtitle content={{ index: 1, kind: 'user', caption: '点击「主要操作」', explain: null, captionLines: 1, explainLines: 0, title: '', badge: { kind: 'progress', text: '第 1 / 3 步' } }} theme={info.name} framed width={SAMPLE_W} fixedHeight={44} />
        </div>
      </div>
      <div className="flex h-10 items-center gap-2 border-t px-3">
        <span className="truncate whitespace-nowrap text-[14px] font-medium">{info.title}</span>
        <span className="whitespace-nowrap text-[12px] text-[#868e96]">{info.name}</span>
        {!info.builtin ? <span className="whitespace-nowrap rounded-full bg-[#f1f3f5] px-2 py-0.5 text-[12px] text-[#495057]">作者主题</span> : null}
        {on ? <Check className="ml-auto size-4 shrink-0" aria-label="正在使用" /> : null}
      </div>
    </button>
  );
}

export function SettingsPage({ projectId, projects, onBack }: { projectId: string | null; projects: ProjectSummary[] | null; onBack: () => void }) {
  const { settings, save } = useBoardSettings();
  const ir = useProjectIR(projectId);
  const project = projectId ? ir.payload?.project ?? null : null;
  const authorThemes = project?.themes ?? {};
  const configTheme = project?.theme ?? 'sketch';
  const catalog = useMemo(() => themeCatalog(authorThemes), [JSON.stringify(authorThemes)]); // eslint-disable-line react-hooks/exhaustive-deps
  const preview = useMemo(() => sampleProject(authorThemes), [JSON.stringify(authorThemes)]); // eslint-disable-line react-hooks/exhaustive-deps
  const [scope, setScope] = useState<'project' | 'all'>(projectId ? 'project' : 'all');
  const [msg, setMsg] = useState<string | null>(null);
  const current = effectiveTheme(settings, projectId, configTheme);
  const projectName = projects?.find((p) => p.id === projectId)?.name ?? project?.name ?? projectId;
  const override = projectId ? settings?.projects?.[projectId] : undefined;

  const write = async (next: BoardSettings, ok: string) => {
    const r = await save(next);
    setMsg(r.ok ? ok : `保存失败：${r.message}`);
  };
  const pick = (name: string) => {
    const s: BoardSettings = { version: 1, ...(settings ?? {}) };
    if (scope === 'project' && projectId) void write({ ...s, projects: { ...(s.projects ?? {}), [projectId]: { theme: name } } }, `「${projectName}」改用 ${name}`);
    else void write({ ...s, theme: name }, `所有项目改用 ${name}（按项目设置的除外）`);
  };
  const resetProject = () => {
    if (!projectId) return;
    const s: BoardSettings = { version: 1, ...(settings ?? {}) };
    void write({ ...s, projects: { ...(s.projects ?? {}), [projectId]: { theme: null } } }, `「${projectName}」恢复为项目默认（${configTheme}）`);
  };
  const clearAll = () => {
    const s: BoardSettings = { version: 1, ...(settings ?? {}) };
    const { theme: _t, ...rest } = s;
    void write({ ...rest, version: 1 }, '已清除所有项目的主题选择');
  };

  return (
    <div className="flex h-full flex-col bg-[#f8f9fa]" data-testid="settings">
      <ThemeStyles themes={authorThemes} />
      <TopBar>
        <Brand onClick={onBack} />
        <span className="whitespace-nowrap text-[14px] font-semibold">设置 · 主题</span>
      </TopBar>
      <main className="min-h-0 flex-1 overflow-y-auto p-8">
        <div className="mx-auto flex max-w-[1180px] flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Btn icon={<ArrowLeft className="size-4" />} label="返回" size={32} onClick={onBack} data-testid="settings-back" />
            {projectId ? (
              <Segmented
                label="应用范围"
                testid="theme-scope"
                value={scope}
                onChange={(v) => setScope(v)}
                items={[
                  { value: 'project', label: `用于当前项目「${projectName}」`, testid: 'scope-project' },
                  { value: 'all', label: '用于所有项目', testid: 'scope-all' },
                ]}
              />
            ) : null}
            {projectId ? <Btn label={`恢复为项目默认（${configTheme}）`} size={32} onClick={resetProject} disabled={override?.theme === null} data-testid="theme-reset" /> : null}
            {settings?.theme ? <Btn label="清除所有项目的选择" size={32} variant="ghost" onClick={clearAll} data-testid="theme-clear-all" /> : null}
            <span className="whitespace-nowrap text-[14px] text-[#495057]" data-testid="theme-current">
              {projectId ? `「${projectName}」正在使用：${current}` : `所有项目：${settings?.theme ?? '各自的项目默认'}`}
            </span>
          </div>
          {msg ? (
            <div role="status" className="text-[14px] text-[#495057]" data-testid="theme-msg">
              {msg}
            </div>
          ) : null}
          <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${SAMPLE_W * 0.5 + 2}px, 1fr))` }}>
            {catalog.map((info) => (
              <ThemeThumb key={info.name} info={info} project={preview} on={info.name === (scope === 'all' && projectId ? (settings?.theme ?? '') : current)} onPick={() => pick(info.name)} />
            ))}
          </div>
          <p className="text-[12px] leading-relaxed text-[#868e96]">
            自定义主题：在项目根目录写 themes/&lt;名字&gt;.css，只写 --jp-* 变量（也可以加普通选择器细调），再在 joplo.config.ts 里写 theme: '&lt;名字&gt;' 作为项目默认主题。保存后这里和演示页会自动更新。
          </p>
        </div>
      </main>
    </div>
  );
}
