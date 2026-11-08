/**
 * 用 Vite 的 ssrLoadModule 载入项目源文件，交给 core 的 loadAuthoring + compile。
 * dev（看板、截图）与 build（发布站）共用这一条路径。
 */
import fs from 'node:fs';
import path from 'node:path';
import { isPluginDef } from '@joplo-app/kit/plugin';
import { compile, type CompileMode, type Diagnostic, type Project } from '@joplo-app/core';
import { discoverFiles, elkLayout, loadAuthoring } from '@joplo-app/core/node';
import type { ViteDevServer } from 'vite';
import { isProjectSource } from './vite-shared.ts';

export type CompileOutcome = {
  /** 本次编译成功的 IR；失败时为 null。 */
  project: Project | null;
  diagnostics: Diagnostic[];
  /** joplo.config 的 home（看板与发布站的首页路径）。 */
  home: string | null;
  /** 启用的插件（D86）：插件 id → 运行时入口的绝对路径（看板按它载入，build 按它打包）。 */
  pluginRuntimes: Record<string, string>;
};

/** config({ plugins }) 里每个插件的运行时入口（编译器另外校验清单；这里只取存在的文件）。 */
export function pluginRuntimesOf(plugins: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!Array.isArray(plugins)) return out;
  for (const p of plugins) if (isPluginDef(p) && typeof p.runtime === 'string' && path.isAbsolute(p.runtime) && fs.existsSync(p.runtime)) out[p.id] ??= fs.realpathSync(p.runtime);
  return out;
}

const LOC_IN_MESSAGE = /((?:[\w@.-]+\/)*[\w@.-]+\.(?:tsx|ts|jsx|js|mts)):(\d+):(\d+)/;

/** 运行时错误（模块求值时抛出）：从调用栈里找第一处项目文件位置。 */
function stackLoc(projectDir: string, e: unknown): string | null {
  const stack = e instanceof Error ? (e.stack ?? '') : '';
  for (const line of stack.split('\n')) {
    const m = /\(?((?:file:\/\/)?\/[^():\s]+):(\d+):(\d+)\)?\s*$/.exec(line);
    if (!m) continue;
    const file = decodeURIComponent(m[1]!.replace(/^file:\/\//, ''));
    if (isProjectSource(projectDir, file)) return `${path.relative(projectDir, file).split(path.sep).join('/')}:${m[2]}:${m[3]}`;
  }
  return null;
}

export async function compileProject(server: ViteDevServer, projectDir: string, mode: CompileMode): Promise<CompileOutcome> {
  const errorAt = new Map<string, string>(); // 载入失败的文件（绝对路径）→ 精确位置
  const importer = async (abs: string) => {
    try {
      return (await server.ssrLoadModule(abs)) as Record<string, unknown>;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const m = LOC_IN_MESSAGE.exec(msg);
      const at = m ? `${m[1]}:${m[2]}:${m[3]}` : stackLoc(projectDir, e);
      if (at) errorAt.set(abs, at);
      throw e instanceof Error ? e : new Error(msg);
    }
  };
  const loaded = await loadAuthoring(projectDir, importer);
  const rel = (abs: string) => path.relative(projectDir, abs).split(path.sep).join('/');
  const byRel = new Map([...errorAt].map(([abs, at]) => [rel(abs), at]));
  const seen = new Set<string>();
  const diagnostics: Diagnostic[] = [];
  for (const d of loaded.diagnostics) {
    let out = d;
    if (d.code === 'LOAD_FAILED' && d.at) {
      const file = d.at.replace(/:\d+:\d+$/, '');
      const precise = byRel.get(file);
      if (precise)
        out = {
          ...d,
          at: precise,
          // 位置已在 at 里，说明只保留第一行的原因
          message: d.message.replace(/\x1b\[[0-9;]*m/g, '').split('\n')[0]!.replace(`Load failed: ${precise} `, 'Load failed: '),
        };
    }
    const key = `${out.code}|${out.at}|${out.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    diagnostics.push(out);
  }
  if (!loaded.authoring) return { project: null, diagnostics, home: null, pluginRuntimes: {} };
  const home = loaded.authoring.config.home ?? null;
  const pluginRuntimes = pluginRuntimesOf(loaded.authoring.config.plugins);
  if (diagnostics.some((d) => d.severity === 'error')) return { project: null, diagnostics, home, pluginRuntimes };
  // 图表布局在编译期由 ELK 算好写进 IR（D69）：看板与发布站只渲染
  const r = compile(loaded.authoring, mode, { layout: elkLayout });
  const missing = Object.keys(r.project?.plugins ?? {}).filter((id) => !pluginRuntimes[id]);
  const extra: Diagnostic[] = missing.map((id) => ({ severity: 'error', code: 'PLUGIN_RUNTIME_MISSING', message: `Plugin ${id}: runtime file not found; reinstall the plugin package`, source: 'reference', at: `${loaded.authoring!.config.file}:1:1` }));
  return { project: extra.length ? null : r.project, diagnostics: [...diagnostics, ...r.diagnostics, ...extra], home, pluginRuntimes };
}

/** 让项目源文件在下次载入时重新转译、重新求值。 */
export function invalidateProjectModules(server: ViteDevServer, projectDir: string): void {
  for (const env of Object.values(server.environments)) {
    const graph = env.moduleGraph as unknown as { idToModuleMap: Map<string, { file: string | null }>; invalidateModule(m: unknown): void };
    for (const mod of graph.idToModuleMap.values()) if (mod.file && isProjectSource(projectDir, mod.file)) graph.invalidateModule(mod);
  }
}

export { discoverFiles };
