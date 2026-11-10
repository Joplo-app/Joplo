/**
 * 用 Vite 的 ssrLoadModule 载入项目源文件，交给 core 的 loadAuthoring + compile。
 * dev（看板、截图）与 build（发布站）共用这一条路径。
 */
import fs from 'node:fs';
import path from 'node:path';
import type { LocalResourceInfo, ResourceRequest } from '@joplo-app/kit/plugin';
import { inspectResources, mediaDiagnostics } from './media-check.ts';
import { LocalResources, referencedResources } from './local-resources.ts';
import { isPluginDef } from '@joplo-app/kit/plugin';
import { compile, type CompileMode, type Diagnostic, type Project } from '@joplo-app/core';
import { discoverFiles, loadAuthoring, enabledPlugins } from '@joplo-app/core/node';
import type { ViteDevServer } from 'vite';
import { isProjectSource, isSharedJoploSource } from './vite-shared.ts';

export type CompileOutcome = {
  /** 本次编译成功的 IR；失败时为 null。 */
  project: Project | null;
  diagnostics: Diagnostic[];
  /** joplo.config 的 home（看板与发布站的首页路径）。 */
  home: string | null;
  /** 启用的插件（D86）：插件 id → 运行时入口的绝对路径（看板按它载入，build 按它打包）。 */
  pluginRuntimes: Record<string, string>;
  resources?: { requests: ResourceRequest[]; host: LocalResources };
};

/** config({ plugins }) 里每个插件的运行时入口（编译器另外校验清单；这里只取存在的文件）。 */
export function pluginRuntimesOf(plugins: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of enabledPlugins(plugins)) if (isPluginDef(p) && typeof p.runtime === 'string' && path.isAbsolute(p.runtime) && fs.existsSync(p.runtime)) out[p.id] ??= fs.realpathSync(p.runtime);
  return out;
}

const LOC_IN_MESSAGE = /((?:[\w@.-]+\/)*[\w@.-]+\.(?:tsx|ts|jsx|js|mts)):(\d+):(\d+)/;

/** 运行时错误（模块求值时抛出）：从调用栈里找第一处项目文件位置（项目外按 Joplo JSX 转译的共享文件也算，路径相对项目目录）。 */
function stackLoc(projectDir: string, e: unknown): string | null {
  const stack = e instanceof Error ? (e.stack ?? '') : '';
  const jsxMissing = jsxRuntimeMissing(e);
  for (const line of stack.split('\n')) {
    const m = /\(?((?:file:\/\/)?\/[^():\s]+):(\d+):(\d+)\)?\s*$/.exec(line);
    if (!m) continue;
    const file = decodeURIComponent(m[1]!.replace(/^file:\/\//, ''));
    // JSX 运行时没生效（#61）：抛错的就是那个没有按 Joplo JSX 转译的 TSX，不管它在不在项目里
    const culprit = jsxMissing && /\.(tsx|jsx)$/.test(file) && !file.split(path.sep).includes('node_modules');
    if (culprit || isProjectSource(projectDir, file) || isSharedJoploSource(projectDir, file)) return `${path.relative(projectDir, file).split(path.sep).join('/')}:${m[2]}:${m[3]}`;
  }
  return null;
}

/**
 * JSX 没有走 Joplo 的运行时（项目外、最近的 tsconfig 不是 Joplo 的 JSX 设置）：经典转译后找不到 React，
 * 或自动转译去找 react/jsx-dev-runtime。返回能确定的那个文件（绝对路径），只知道是这类错误时返回 true。
 */
function jsxRuntimeMissing(e: unknown): string | boolean {
  const msg = e instanceof Error ? e.message : '';
  if (e instanceof ReferenceError && /\bReact is not defined\b/.test(msg)) return true;
  const m = /Cannot find (?:module|package) '(?:react\/jsx-(?:dev-)?runtime|react)' imported from '([^']+)'/.exec(msg);
  return m ? decodeURIComponent(m[1]!.replace(/^file:\/\//, '')) : false;
}

const JSX_HINT = "was compiled without Joplo's JSX runtime. TSX outside the project uses the JSX settings of its nearest tsconfig.json: give that folder a tsconfig.json with jsx: \"react-jsxdev\" and jsxImportSource: \"@joplo-app/kit\", or start the file with /** @jsxRuntime automatic */ /** @jsxImportSource @joplo-app/kit */";

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
      const jsx = jsxRuntimeMissing(e);
      if (jsx) {
        // 能从报错里确定文件时以它为准（位置只知道文件，记为第 1 行）
        const culprit = typeof jsx === 'string' ? `${path.relative(projectDir, jsx).split(path.sep).join('/')}:1:1` : at;
        if (culprit) errorAt.set(abs, culprit);
        throw new Error(`${culprit ? culprit.replace(/:\d+:\d+$/, '') : 'A TSX file'} ${JSX_HINT}`);
      }
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
  // Enabled plugins derive their own layout and drawing snapshots; the host schedules resources.
  const entries = Object.fromEntries(enabledPlugins(loaded.authoring.config.plugins).filter(isPluginDef).filter(p => p.local).map(p => [p.id, p.local!]));
  const host = resourceHost(projectDir, entries, Object.fromEntries(enabledPlugins(loaded.authoring.config.plugins).filter(isPluginDef).map(p => [p.id, p.keys ?? []])));
  // 资源元数据（时长、marker）要先编译一遍才知道有哪些资源，再异步检查，再带着元数据编译一遍。
  // 上一次检查到的元数据按请求内容记着，只当作提示：带着它编译一遍，然后照常重新检查——
  // 只有“这一遍编译成功，并且每个资源重新检查到的元数据都和提示一致”时才直接用这一遍的结果。
  // 其余情况（提示过期、提示让编译报错、多了或少了资源）一律退回不带提示的两遍流程，
  // 所以提示永远不会改变结果，也不会让过期的元数据产生一个看起来成功的错误编译（D101 评审 P1）。
  const known = knownInfo.get(projectDir);
  let requests: ResourceRequest[] = [];
  let inspected: Awaited<ReturnType<typeof inspectResources>> | null = null;
  let r: ReturnType<typeof compile> | null = null;
  if (known?.size) {
    const hinted: ResourceRequest[] = [];
    const fast = compile(loaded.authoring, mode, { onResource: request => hinted.push(request), resourceInfoFor: request => known.get(requestKey(request)) });
    if (fast.project) {
      const seen = await inspectResources(fast.project, hinted, host);
      if (hinted.every(request => JSON.stringify(known.get(requestKey(request))) === JSON.stringify(seen.resourceInfo[request.id]))) { r = fast; requests = hinted; inspected = seen; }
    }
  }
  if (!r || !inspected) {
    requests = [];
    const first = compile(loaded.authoring, mode, { onResource: request => requests.push(request) });
    inspected = await inspectResources(first.project, requests, host);
    r = Object.keys(inspected.resourceInfo).length ? compile(loaded.authoring, mode, { resourceInfo: inspected.resourceInfo }) : first;
  }
  const checked = inspected;
  knownInfo.set(projectDir, new Map(requests.flatMap(request => checked.resourceInfo[request.id] ? [[requestKey(request), checked.resourceInfo[request.id]!] as const] : [])));
  const resources = { requests, host };
  diagnostics.push(...inspected.diagnostics, ...(r.project ? mediaDiagnostics(r.project, inspected.resourceInfo) : []));
  const missing = Object.keys(r.project?.plugins ?? {}).filter((id) => !pluginRuntimes[id]);
  const extra: Diagnostic[] = missing.map((id) => ({ severity: 'error', code: 'PLUGIN_RUNTIME_MISSING', message: `Plugin ${id}: runtime file not found; reinstall the plugin package`, source: 'reference', at: `${loaded.authoring!.config.file}:1:1` }));
  for (const request of requests) if (referencedResources(r.project).has(request.id)) {
    const result = await resources.host.ensure(request);
    if (result.diagnostic) diagnostics.push(result.diagnostic);
  }
  return { project: extra.length ? null : r.project, diagnostics: [...diagnostics, ...r.diagnostics, ...extra], home, pluginRuntimes, resources };
}

const requestKey = (request: { plugin: string; compiler: string; input: string }) => JSON.stringify([request.plugin, request.compiler, request.input]);
/** 项目目录 → 上一次编译检查到的资源元数据（按请求内容）。只是让第一遍编译用得上的提示；每次编译仍会重新检查并核对。 */
const knownInfo = new Map<string, Map<string, LocalResourceInfo>>();
/**
 * 项目目录 → 本机资源宿主。打包插件的本机入口、在子进程里读取编译器描述都只做一次，热更新时复用；
 * 插件入口文件或密钥声明变了（路径、修改时间、大小）就换一个新的。
 */
const hosts = new Map<string, { signature: string; host: LocalResources }>();
function resourceHost(projectDir: string, entries: Record<string, string>, keys: ConstructorParameters<typeof LocalResources>[2]): LocalResources {
  // 入口所在目录里的源文件都算进签名（入口会 import 同目录的模块）；不进 node_modules，最多看 400 个文件
  const stamp = (entry: string) => {
    const out: string[] = [];
    const walk = (dir: string) => {
      let names: fs.Dirent[] = [];
      try { names = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const d of names.sort((a, b) => a.name.localeCompare(b.name))) {
        if (out.length >= 400 || d.name === 'node_modules' || d.name.startsWith('.')) continue;
        const file = path.join(dir, d.name);
        if (d.isDirectory()) walk(file);
        else { try { const s = fs.statSync(file); out.push(`${file}:${s.mtimeMs}:${s.size}`); } catch { /* removed meanwhile */ } }
      }
    };
    if (!fs.existsSync(entry)) return ['missing'];
    walk(path.dirname(entry));
    return out;
  };
  const signature = JSON.stringify([Object.entries(entries).sort(([a], [b]) => a.localeCompare(b)).map(([id, file]) => [id, file, stamp(file)]), keys]);
  const hit = hosts.get(projectDir);
  if (hit?.signature === signature) return hit.host;
  const host = new LocalResources(projectDir, entries, keys);
  hosts.set(projectDir, { signature, host });
  return host;
}

/** 让项目源文件在下次载入时重新转译、重新求值。 */
export function invalidateProjectModules(server: ViteDevServer, projectDir: string): void {
  for (const env of Object.values(server.environments)) {
    const graph = env.moduleGraph as unknown as { idToModuleMap: Map<string, { file: string | null }>; invalidateModule(m: unknown): void };
    for (const mod of graph.idToModuleMap.values()) if (mod.file && (isProjectSource(projectDir, mod.file) || isSharedJoploSource(projectDir, mod.file))) graph.invalidateModule(mod);
  }
}

export { discoverFiles };
