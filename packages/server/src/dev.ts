/**
 * `joplo dev`：本机只运行一个看板进程（D39），同时服务多个项目。
 *
 * - 界面：一个 Vite 开发服务（packages/web 源码或 @joplo-app/web 的 dist），HMR。
 * - 项目：每个项目一个不监听端口的 Vite 加载器（middlewareMode），ssrLoadModule 载入作者 TSX →
 *   core.loadAuthoring → core.compile(…, 'dev')。项目按需编译：首页选中、打开演示页或注册时才启动。
 * - 热更新：界面服务的文件监听覆盖所有已启动的项目目录；某个项目的文件变化 → 只重新编译这个项目 →
 *   HMR 自定义事件 `joplo:ir`（带 projectId）推送，看板只接收当前项目的事件。
 * - 记住项目：`<JOPLO_HOME>/projects.json`；运行中的看板：`<JOPLO_HOME>/server.json`（见 home.ts）。
 *   createDev 缺省不持久化（renderStep、测试）；startDev（CLI）持久化，并在已有存活看板时只注册、不启动第二个进程。
 *
 * 安全（沿用 M0）：只监听 127.0.0.1；每个请求校验 Host；写接口校验 Origin、Content-Type 与本地令牌。
 * 端口被占用时直接报错（strictPort），不静默换端口。
 */
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import type http from 'node:http';
import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import { createLogger, createServer, type Logger, type Plugin, type PluginOption, type ViteDevServer } from 'vite';
import { JoploError, LocalReviewWrite, type Diagnostic, type Project } from '@joplo-app/core';
import { LocalReviewHub } from './local-review.ts';
import type { DevHandle, DevOptions } from './contract.ts';
import { ExportHub, type ExportDeps } from './export.ts';
import { VoiceHub } from './voice-http.ts';
import { CLOUD_EVENT, CloudHub, type CloudBridge } from './cloud.ts';
import { Registry, clearServerInfo, joploHome, normalizeSettings, pidAlive, projectIdOf, readServerInfo, readSettings, writeServerInfo, writeSettings, type BoardSettings, type ProjectRecord } from './home.ts';
import { compileProject, invalidateProjectModules } from './project.ts';
import { SelectionBody, readSelection, resolveSelection, writeSelection } from './selection.ts';
import { IGNORED_DIRS, cssSourcePlugin, isProjectSource, joploProjectPlugin, kitAliases, locateWebAssets, realProjectDir } from './vite-shared.ts';
import type { DistWeb, WebAssets } from './web-assets.ts';

/** 文件绝对路径 → Vite 的 /@fs/ 地址。 */
const fsUrl = (abs: string) => `/@fs${abs.split(path.sep).join('/').replace(/^(?!\/)/, '/')}`;
/** 离文件最近的 package.json 所在目录（插件包根目录）；没有时用文件所在目录。 */
function packageRootOf(file: string): string {
  for (let d = path.dirname(file); ; d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, 'package.json'))) return d;
    if (path.dirname(d) === d) return path.dirname(file);
  }
}

/** 推给看板的编译结果。`project` 始终是最近一次成功的 IR；`ok=false` 时看板显示错误列表、保留画面。 */
export type DevPayload = {
  version: number;
  ok: boolean;
  project: Project | null;
  diagnostics: Diagnostic[];
  home: string | null;
  /** 插件（D86）：插件 id → 运行时地址（本服务以 /@fs/<绝对路径> 提供，Vite 负责转译与依赖解析）。 */
  plugins?: Record<string, string>;
};

/** 首页项目列表的一行。status：idle 未编译、compiling 首次编译中、ok、error（编译出错）、missing（目录不存在）。 */
export type ProjectSummary = {
  id: string;
  dir: string;
  name: string;
  lastOpened: string;
  status: 'idle' | 'compiling' | 'ok' | 'error' | 'missing';
  errors: number;
  version: number;
};

export const IR_EVENT = 'joplo:ir';
export const PROJECTS_EVENT = 'joplo:projects';
/** 朗读状态变化（D74）：{ projectId, state }。 */
export const VOICE_EVENT = 'joplo:voice';
export { CLOUD_EVENT };
const MAX_BODY = 64 * 1024;

const SECURITY_HEADERS: Record<string, string> = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'cache-control': 'no-store',
};

export function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { ...SECURITY_HEADERS, 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/** Content-Type 必须是 application/json，只允许附带 charset=utf-8 参数。 */
export function isJsonContentType(ct: string | undefined): boolean {
  if (!ct) return false;
  const [type, ...params] = ct.split(';').map((x) => x.trim().toLowerCase());
  return type === 'application/json' && params.every((p) => p === '' || /^charset="?utf-8"?$/.test(p));
}

function readBody(req: http.IncomingMessage): Promise<{ tooLarge: true } | { tooLarge: false; text: string }> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY * 16) {
        req.destroy();
        reject(new Error('Request body is too large'));
      } else if (size <= MAX_BODY) chunks.push(c);
    });
    req.on('end', () => resolve(size > MAX_BODY ? { tooLarge: true } : { tooLarge: false, text: Buffer.concat(chunks).toString('utf8') }));
    req.on('error', reject);
  });
}

function makeLogger(log: (line: string) => void): Logger {
  const base = createLogger('warn', { allowClearScreen: false });
  return {
    ...base,
    info: () => undefined,
    warn: (msg) => log(`[joplo] ${msg}`),
    warnOnce: (msg) => log(`[joplo] ${msg}`),
    error: (msg) => log(`[joplo] ${msg}`),
    clearScreen: () => undefined,
  };
}

const MIME: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
};

/** dist 形态：/assets/* 原样返回预构建文件（不经过 Vite 的模块转换）。返回 true 表示已处理。 */
function serveDistAsset(web: DistWeb, pathname: string, res: http.ServerResponse): boolean {
  if (!pathname.startsWith('/assets/')) return false;
  const assets = path.join(web.appDir, 'assets');
  let rel: string;
  try {
    rel = decodeURIComponent(pathname.slice('/assets/'.length));
  } catch {
    return false;
  }
  const file = path.resolve(assets, rel);
  if (!file.startsWith(assets + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return false;
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream', 'x-content-type-options': 'nosniff', 'cache-control': 'public, max-age=31536000, immutable' });
  fs.createReadStream(file).pipe(res);
  return true;
}

/** dist 形态：在看板入口脚本之前创建 HMR 句柄、导入作者 className 的 CSS。 */
export function injectDistBoot(html: string, web: DistWeb): string {
  const css = '/@fs/' + web.projectCss.split(path.sep).join('/').replace(/^\/+/, '');
  const boot = `<script type="module">import { createHotContext } from '/@vite/client';\nimport ${JSON.stringify(css)};\nglobalThis.__JOPLO_HOT__ = createHotContext('/@joplo-app/board');</script>`;
  const at = html.search(/<script\b/i);
  return at < 0 ? html.replace('</head>', `${boot}\n</head>`) : html.slice(0, at) + boot + '\n    ' + html.slice(at);
}

async function webPlugins(web: WebAssets): Promise<PluginOption[]> {
  if (web.mode === 'dist') return [tailwindcss()];
  // 只有在仓库里编译看板源码时才需要 React 插件（devDependency）
  const { default: react } = await import('@vitejs/plugin-react');
  return [react(), tailwindcss()];
}

/** 不持久化时的项目记录（只在内存里，进程结束即消失）。 */
class MemoryRegistry {
  private items: ProjectRecord[] = [];
  list() {
    return [...this.items].sort((a, b) => b.lastOpened.localeCompare(a.lastOpened));
  }
  touch(dir: string, name?: string) {
    const prev = this.items.find((p) => p.dir === dir);
    const rec = { dir, name: name ?? prev?.name ?? path.basename(dir), lastOpened: new Date().toISOString() };
    this.items = [rec, ...this.items.filter((p) => p.dir !== dir)];
    return rec;
  }
  rename(dir: string, name: string) {
    const rec = this.items.find((p) => p.dir === dir);
    if (rec) rec.name = name;
  }
  remove(dir: string) {
    const n = this.items.length;
    this.items = this.items.filter((p) => p.dir !== dir);
    return this.items.length !== n;
  }
}
type RegistryLike = Pick<Registry, 'list' | 'touch' | 'rename' | 'remove'>;

/** 一个已启动的项目：加载器、编译结果、串行化的重新编译。 */
export type ProjectSlot = {
  id: string;
  dir: string;
  loader: ViteDevServer | null;
  ready: Promise<void>;
  payload: DevPayload;
  compiling: boolean;
  closed: boolean;
  running: Promise<void> | null;
  dirty: boolean;
  timer: ReturnType<typeof setTimeout> | null;
};

export type HubOptions = {
  /** 缺省 4790；被占用时报错，不静默换端口。0 = 随机端口。 */
  port?: number;
  log?: (line: string) => void;
  /** false：只编译一次、不监听文件（renderStep 用它保证截图与元素索引来自同一份 IR）。 */
  watch?: boolean;
  /** 持久化目录（projects.json、server.json）；缺省 null：只在内存里记项目，不写 server.json。 */
  home?: string | null;
  /** 测试注入：导出用的 Playwright 载入、视频录制。 */
  exportDeps?: Partial<ExportDeps>;
  /** 启动这个看板的项目目录（写进 server.json，后来加入的 joplo dev 会说明）。 */
  startedIn?: string;
  /** 直接发布到云端（D76）：由 CLI 注入；没有时看板禁用「发布到 Joplo Cloud」。 */
  cloud?: CloudBridge;
};

/** 本包（与 CLI 同一版本）的版本号：看板 ping 与 server.json 都带上，加入时比较。 */
let cachedVersion: string | null = null;
export function serverVersion(): string {
  if (cachedVersion !== null) return cachedVersion;
  try {
    const v = (JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version?: unknown }).version;
    cachedVersion = typeof v === 'string' ? v : '0.0.0';
  } catch {
    cachedVersion = '0.0.0';
  }
  return cachedVersion;
}

export type Hub = {
  url: string;
  port: number;
  token: string;
  server: ViteDevServer;
  /** 登记并（可选）开始编译一个项目；返回它的 id 与看板链接。 */
  addProject(dir: string, opts?: { compile?: boolean }): { id: string; url: string; slot: ProjectSlot | null };
  /** 已启动的项目；未启动时启动它（目录不存在时抛 NOT_FOUND）。 */
  ensure(id: string): Promise<ProjectSlot>;
  projects(): ProjectSummary[];
  close(): Promise<void>;
};

const projectUrl = (base: string, id: string) => `${base}#/${encodeURIComponent(id)}`;

export async function createHub(opts: HubOptions = {}): Promise<Hub> {
  const log = opts.log ?? ((m: string) => process.stderr.write(m + '\n'));
  const watch = opts.watch !== false;
  const port = opts.port ?? 4790;
  const token = crypto.randomBytes(24).toString('hex');
  const web = locateWebAssets();
  const registry: RegistryLike = opts.home ? new Registry(opts.home) : new MemoryRegistry();
  let memSettings: BoardSettings = { version: 1 };
  const slots = new Map<string, ProjectSlot>();
  let actualPort = port;
  let closed = false;
  let server: ViteDevServer;

  const allowedHosts = () => new Set([`127.0.0.1:${actualPort}`, `localhost:${actualPort}`]);
  const allowedOrigins = () => new Set([`http://127.0.0.1:${actualPort}`, `http://localhost:${actualPort}`]);
  const baseUrl = () => `http://127.0.0.1:${actualPort}/`;
  const reviewHub = new LocalReviewHub(baseUrl);

  const activeDirs = () => [...slots.values()].filter((s) => !s.closed).map((s) => s.dir);
  const slotOfFile = (file: string) => [...slots.values()].find((s) => !s.closed && isProjectSource(s.dir, file)) ?? null;
  const recordOf = (id: string) => registry.list().find((r) => projectIdOf(r.dir) === id) ?? null;

  const summaries = (): ProjectSummary[] =>
    registry.list().map((r) => {
      const id = projectIdOf(r.dir);
      const s = slots.get(id);
      const exists = fs.existsSync(r.dir);
      const errors = s ? s.payload.diagnostics.filter((d) => d.severity === 'error').length : 0;
      const status: ProjectSummary['status'] = !exists ? 'missing' : !s ? 'idle' : s.compiling && s.payload.version === 0 ? 'compiling' : errors > 0 || !s.payload.ok ? 'error' : 'ok';
      return { id, dir: r.dir, name: r.name, lastOpened: r.lastOpened, status, errors: status === 'error' ? Math.max(errors, 1) : errors, version: s?.payload.version ?? 0 };
    });
  const broadcastProjects = () => {
    if (!closed) server?.ws.send({ type: 'custom', event: PROJECTS_EVENT, data: { projects: summaries() } });
  };

  // ---------- 项目：加载器与编译 ----------
  async function startLoader(slot: ProjectSlot) {
    slot.loader = await createServer({
      configFile: false,
      envDir: false,
      root: slot.dir,
      appType: 'custom',
      customLogger: makeLogger(log),
      resolve: { dedupe: ['react', 'react-dom'], alias: kitAliases(web, slot.dir) },
      plugins: [joploProjectPlugin(slot.dir, web)],
      // 只在服务端载入模块：不开 HMR、不开 WebSocket（多个项目同时运行时不能争用端口）、不监听
      server: { middlewareMode: true, hmr: false, ws: false, watch: null },
      optimizeDeps: { noDiscovery: true, include: [] },
      cacheDir: path.join(slot.dir, '.joplo/vite'),
    });
  }

  /**
   * 插件运行时由看板的 Vite 服务以 /@fs/ 提供（D86）。dist 形态的 fs.allow 只有 @joplo-app/web：
   * 把项目目录（npm 安装的插件与它的依赖在 node_modules 里）和插件包目录加进去。source 形态默认允许整个工作区。
   */
  function allowPluginFiles(projectDir: string, runtimes: string[]) {
    if (web.mode !== 'dist' || !server) return;
    const allow = server.config.server.fs.allow as string[];
    for (const dir of [projectDir, ...runtimes.map(packageRootOf)]) if (!allow.some((a) => dir === a || dir.startsWith(a + path.sep))) allow.push(dir);
  }

  async function recompile(slot: ProjectSlot) {
    const loader = slot.loader!;
    invalidateProjectModules(loader, slot.dir);
    const out = await compileProject(loader, slot.dir, 'dev');
    const prev = slot.payload;
    const plugins = Object.keys(out.pluginRuntimes).length ? out.pluginRuntimes : null;
    if (plugins) allowPluginFiles(slot.dir, Object.values(plugins));
    slot.payload = { version: prev.version + 1, ok: out.project !== null, project: out.project ?? prev.project, diagnostics: out.diagnostics, home: out.home ?? prev.home, ...(plugins ? { plugins: Object.fromEntries(Object.entries(plugins).map(([id, f]) => [id, fsUrl(f)])) } : prev.plugins ? { plugins: prev.plugins } : {}) };
    const errors = out.diagnostics.filter((d) => d.severity === 'error');
    if (errors.length) log(`[joplo] ${path.basename(slot.dir)} compilation failed (${errors.length}): ${errors.map((d) => `${d.at ?? ''} ${d.message}`).join('; ').slice(0, 400)}`);
    if (out.project && out.project.name) registry.rename(slot.dir, out.project.name);
    if (out.project && !errors.length) reviewHub.sync(slot.dir, slot.id, out.project);
    else reviewHub.invalidate(slot.dir, 'compile_error');
    if (!closed) server?.ws.send({ type: 'custom', event: IR_EVENT, data: { projectId: slot.id, ...slot.payload } });
    broadcastProjects();
  }

  /** 串行化：编译进行中又有变化时，结束后再编一次。 */
  function run(slot: ProjectSlot): Promise<void> {
    if (slot.closed || closed) return Promise.resolve();
    if (slot.running) {
      slot.dirty = true;
      return slot.running;
    }
    slot.compiling = true;
    slot.running = (async () => {
      do {
        slot.dirty = false;
        try {
          await recompile(slot);
        } catch (e) {
          reviewHub.invalidate(slot.dir, 'compile_error');
          log(`[joplo] Compilation exception: ${e instanceof Error ? e.message : String(e)}`);
        }
      } while (slot.dirty && !slot.closed);
    })().finally(() => {
      slot.running = null;
      slot.compiling = false;
    });
    return slot.running;
  }

  function activate(dir: string): ProjectSlot {
    const id = projectIdOf(dir);
    const existing = slots.get(id);
    if (existing && !existing.closed) return existing;
    const slot: ProjectSlot = {
      id,
      dir,
      loader: null,
      ready: Promise.resolve(),
      payload: { version: 0, ok: false, project: null, diagnostics: [], home: null },
      compiling: true,
      closed: false,
      running: null,
      dirty: false,
      timer: null,
    };
    slots.set(id, slot);
    slot.ready = (async () => {
      await startLoader(slot);
      if (watch && server) server.watcher.add(dir);
      await run(slot);
    })().catch((e) => log(`[joplo] Project startup failed: ${e instanceof Error ? e.message : String(e)}`));
    invalidateCss();
    return slot;
  }

  async function deactivate(slot: ProjectSlot) {
    slot.closed = true;
    if (slot.timer) clearTimeout(slot.timer);
    await slot.running?.catch(() => undefined);
    reviewHub.invalidate(slot.dir, 'server_stopped');
    await slot.loader?.close().catch(() => undefined);
    if (watch && server) server.watcher.unwatch(slot.dir);
    slots.delete(slot.id);
  }

  /** 新项目的目录加入 Tailwind @source：让 CSS 入口重新转换。 */
  function invalidateCss() {
    if (!server) return;
    const entry = web.mode === 'source' ? web.indexCss : web.projectCss;
    const env = server.environments.client;
    const mods = env.moduleGraph.getModulesByFile(entry);
    if (!mods) return;
    for (const m of mods) void env.reloadModule(m).catch(() => undefined);
  }

  async function ensure(id: string): Promise<ProjectSlot> {
    let slot = slots.get(id);
    if (!slot) {
      const rec = recordOf(id);
      if (!rec) throw new JoploError('NOT_FOUND', `Unknown project: ${id}`);
      if (!fs.existsSync(rec.dir)) throw new JoploError('NOT_FOUND', `Project directory not found: ${rec.dir}`);
      slot = activate(rec.dir);
    }
    await slot.ready;
    return slot;
  }

  function addProject(dirIn: string, o: { compile?: boolean } = {}) {
    const dir = realProjectDir(dirIn);
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new JoploError('NOT_FOUND', `Project directory does not exist: ${dir}`);
    const id = projectIdOf(dir);
    const prev = registry.list().find((r) => r.dir === dir);
    registry.touch(dir, prev?.name);
    const slot = o.compile === false ? (slots.get(id) ?? null) : activate(dir);
    broadcastProjects();
    return { id, url: projectUrl(baseUrl(), id), slot };
  }

  const exportsHub = new ExportHub({
    baseUrl,
    log,
    home: opts.home ?? joploHome(),
    deps: opts.exportDeps,
    onEvent: () => undefined,
  });

  // 朗读（D74）：声音供应商 profile（本机）与项目音频缓存；状态变化推 joplo:voice
  const voiceHub = new VoiceHub(opts.home ?? joploHome(), {
    // 托管朗读（D85）：CLI 注入的登录与合成；旧 CLI 没有时只用浏览器朗读与自带 Key 的供应商
    cloud: opts.cloud?.voice,
    emit: (projectId, state) => {
      if (!closed) server?.ws.send({ type: 'custom', event: VOICE_EVENT, data: { projectId, state } });
    },
    // profile 是本机共用的：改了就通知所有看板，各自重新取自己项目的声音状态
    profilesChanged: () => {
      if (!closed) server?.ws.send({ type: 'custom', event: VOICE_EVENT, data: { profilesChanged: true } });
    },
  });

  // 直接发布到云端（D76）：发布任务变化推 joplo:cloud
  const cloudHub = new CloudHub(opts.cloud, (projectId, job) => {
    if (!closed) server?.ws.send({ type: 'custom', event: CLOUD_EVENT, data: { projectId, job } });
  });

  // ---------- HTTP ----------
  const deny = (res: http.ServerResponse, status: number, message: string) => sendJson(res, status, { error: { code: 'PERMISSION_DENIED', message } });
  /** 写接口：Origin（有则必须是看板自己）、令牌、Content-Type。返回 false 表示已拒绝。 */
  const guardWrite = (req: http.IncomingMessage, res: http.ServerResponse, tokenStatus = 403, needJson = true): boolean => {
    const origin = req.headers.origin;
    if (origin !== undefined && !allowedOrigins().has(origin)) return deny(res, 403, `Origin is not allowed: ${origin}`), false;
    const t = req.headers['x-joplo-token'];
    if (typeof t !== 'string' || !safeEqual(t, token)) return deny(res, tokenStatus, 'Missing or invalid local token (x-joplo-token)'), false;
    if (needJson && !isJsonContentType(req.headers['content-type'])) return sendJson(res, 415, { error: { code: 'USAGE', message: 'Content-Type must be application/json' } }), false;
    return true;
  };
  const jsonBody = async (req: http.IncomingMessage, res: http.ServerResponse): Promise<{ ok: true; body: unknown } | { ok: false }> => {
    const raw = await readBody(req);
    if (raw.tooLarge) return sendJson(res, 413, { error: { code: 'USAGE', message: `Request body is too large (limit: ${MAX_BODY} bytes)` } }), { ok: false };
    try {
      return { ok: true, body: JSON.parse(raw.text) };
    } catch (e) {
      return sendJson(res, 400, { error: { code: 'USAGE', message: `Request body is not valid JSON: ${e instanceof Error ? e.message : String(e)}` } }), { ok: false };
    }
  };
  const fail = (res: http.ServerResponse, e: unknown) => {
    const code = e instanceof JoploError ? e.code : 'INTERNAL';
    const status = code === 'NOT_FOUND' ? 404 : code === 'USAGE' || code === 'INVALID_REFERENCE' ? 400 : code === 'REVISION_CONFLICT' || code === 'IDEMPOTENCY_MISMATCH' ? 409 : code === 'RENDER_FAILED' || code === 'EXPORT_COMPONENT_MISSING' ? 503 : 500;
    sendJson(res, status, { error: { code, message: e instanceof Error ? e.message : String(e) } });
  };

  async function handleProject(id: string, rest: string, req: http.IncomingMessage, res: http.ServerResponse) {
    const method = req.method ?? 'GET';
    if (rest === 'review' && (method === 'GET' || method === 'POST')) {
      if (!guardWrite(req, res, 403, method === 'POST')) return;
      const slot = await ensure(id);
      if (slot.compiling || slot.dirty || slot.timer || !slot.payload.ok || !slot.payload.project || slot.payload.diagnostics.some(d => d.severity === 'error'))
        throw new JoploError('REVISION_CONFLICT', 'Wait for the project to compile successfully before reviewing');
      if (method === 'GET') {
        const optionId = new URL(req.url!, baseUrl()).searchParams.get('option');
        if (!optionId) throw new JoploError('USAGE', 'option is required');
        return sendJson(res, 200, reviewHub.state(slot.dir, optionId));
      }
      const body = await jsonBody(req, res);
      if (!body.ok) return;
      const input = LocalReviewWrite.safeParse(body.body);
      if (!input.success) throw new JoploError('USAGE', 'Invalid review request: include a sessionId, requestId, type, and page context for feedback (1–10000 characters)');
      return sendJson(res, 200, reviewHub.write(slot.dir, slot.payload.project, input.data));
    }
    if (rest === 'ir' && method === 'GET') {
      const slot = await ensure(id);
      return sendJson(res, 200, { projectId: id, ...slot.payload });
    }
    if (rest === 'selection' && method === 'GET') {
      const slot = await ensure(id);
      return sendJson(res, 200, { selection: readSelection(slot.dir) });
    }
    if (rest === 'selection' && method === 'PUT') {
      if (!guardWrite(req, res, 401)) return;
      const b = await jsonBody(req, res);
      if (!b.ok) return;
      const parsed = SelectionBody.safeParse(b.body);
      if (!parsed.success) return sendJson(res, 400, { error: { code: 'USAGE', message: 'Invalid selection format', issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) } });
      const slot = await ensure(id);
      if (parsed.data.selection === null) {
        writeSelection(slot.dir, null);
        return sendJson(res, 200, { ok: true, selection: null });
      }
      const project = slot.payload.project;
      const r = project ? resolveSelection(project, parsed.data.selection) : { ok: false as const, problem: 'The project has not compiled successfully yet' };
      if (!r.ok) {
        // 不变量：被拒绝时文件写为 null（不能保留旧选中而界面显示新选中）
        writeSelection(slot.dir, null);
        return sendJson(res, 409, { error: { code: 'INVALID_REFERENCE', message: `Selection does not match the current project: ${r.problem}` }, current: null });
      }
      writeSelection(slot.dir, r.selection);
      return sendJson(res, 200, { ok: true, selection: r.selection });
    }
    if (rest === 'open' && method === 'POST') {
      if (!guardWrite(req, res)) return;
      const b = await jsonBody(req, res);
      if (!b.ok) return;
      const slot = await ensure(id);
      const at = (b.body as { at?: unknown })?.at;
      const m = typeof at === 'string' ? /^(.+?):(\d+)(?::(\d+))?$/.exec(at) : null;
      if (!m) return sendJson(res, 400, { error: { code: 'USAGE', message: 'at must be file:line[:column]' } });
      const file = path.resolve(slot.dir, m[1]!);
      if (!isProjectSource(slot.dir, file) || !fs.existsSync(file)) return sendJson(res, 400, { error: { code: 'USAGE', message: `Not a project source file: ${m[1]}` } });
      // 交给 Vite 自带的 launch-editor（按 LAUNCH_EDITOR / EDITOR 或正在运行的编辑器打开）
      (req as { __joploOpen?: boolean }).__joploOpen = true;
      req.url = `/__open-in-editor?file=${encodeURIComponent(`${file}:${m[2]}:${m[3] ?? 1}`)}`;
      req.method = 'GET';
      return 'next' as const;
    }
    if (rest === 'voice' || rest.startsWith('voice/')) {
      const slot = await ensure(id);
      const ctx = { guardWrite: (needJson = true) => guardWrite(req, res, 403, needJson), jsonBody: () => jsonBody(req, res), send: (status: number, body: unknown) => sendJson(res, status, body) };
      if (await voiceHub.handleProject(id, slot.dir, slot.payload.project, rest === 'voice' ? '' : rest.slice('voice/'.length), req, res, ctx)) return;
    }
    if (rest.startsWith('cloud/')) {
      const slot = await ensure(id);
      const ctx = { guardWrite: (needJson = true) => guardWrite(req, res, 403, needJson), jsonBody: () => jsonBody(req, res), send: (status: number, body: unknown) => sendJson(res, status, body) };
      if (await cloudHub.handleProject(id, slot.dir, rest.slice('cloud/'.length), req, ctx)) return;
    }
    if (rest.startsWith('export/')) {
      const slot = await ensure(id);
      return exportsHub.handle(rest.slice('export/'.length), req, res, { projectId: id, dir: slot.dir, project: slot.payload.project, guardWrite: (needJson = true) => guardWrite(req, res, 403, needJson), jsonBody: () => jsonBody(req, res), fail: (e) => fail(res, e) });
    }
    return sendJson(res, 404, { error: { code: 'NOT_FOUND', message: `Unknown endpoint: ${method} /__joplo/p/${id}/${rest}` } });
  }

  const boardPlugin: Plugin = {
    name: 'joplo:board',
    configureServer(srv) {
      srv.middlewares.use(async (req, res, next) => {
        try {
          const host = req.headers.host ?? '';
          if (!allowedHosts().has(host)) return deny(res, 403, `Host header is not allowed: ${host || '(empty)'}`);
          const url = new URL(req.url ?? '/', `http://127.0.0.1:${actualPort}`);
          if (web.mode === 'dist' && (req.method === 'GET' || req.method === 'HEAD') && serveDistAsset(web, url.pathname, res)) return;
          // Vite 的打开编辑器中间件只能经由 /__joplo/p/<id>/open（校验令牌与路径）进入
          if (url.pathname === '/__open-in-editor') return (req as { __joploOpen?: boolean }).__joploOpen ? next() : deny(res, 403, 'Use Open in editor in the board');
          if (!url.pathname.startsWith('/__joplo/')) return next();
          const method = req.method ?? 'GET';
          if (url.pathname === '/__joplo/ping' && method === 'GET') return sendJson(res, 200, { joplo: true, pid: process.pid, version: serverVersion() });
          if (url.pathname === '/__joplo/projects' && method === 'GET') return sendJson(res, 200, { projects: summaries() });
          // 看板设置（D51）：主题选择，存于 <JOPLO_HOME>/settings.json（没有 home 时只在内存里）
          if (url.pathname === '/__joplo/settings' && method === 'GET') return sendJson(res, 200, { settings: opts.home ? readSettings(opts.home) : memSettings });
          if (url.pathname === '/__joplo/settings' && method === 'PUT') {
            if (!guardWrite(req, res)) return;
            const b = await jsonBody(req, res);
            if (!b.ok) return;
            const next = (b.body as { settings?: unknown })?.settings;
            memSettings = opts.home ? writeSettings(opts.home, next) : normalizeSettings(next);
            return sendJson(res, 200, { settings: memSettings });
          }
          if (url.pathname === '/__joplo/projects' && method === 'POST') {
            if (!guardWrite(req, res)) return;
            const b = await jsonBody(req, res);
            if (!b.ok) return;
            const dir = (b.body as { dir?: unknown })?.dir;
            if (typeof dir !== 'string' || !path.isAbsolute(dir)) return sendJson(res, 400, { error: { code: 'USAGE', message: 'dir must be an absolute path to the project directory' } });
            const r = addProject(dir);
            return sendJson(res, 200, { id: r.id, url: r.url });
          }
          const del = /^\/__joplo\/projects\/([^/]+)$/.exec(url.pathname);
          if (del && method === 'DELETE') {
            if (!guardWrite(req, res, 403, false)) return;
            const id = decodeURIComponent(del[1]!);
            const rec = recordOf(id);
            if (!rec) return sendJson(res, 404, { error: { code: 'NOT_FOUND', message: `Unknown project: ${id}` } });
            const slot = slots.get(id);
            if (slot) await deactivate(slot);
            registry.remove(rec.dir); // 只删记录，不碰项目目录
            broadcastProjects();
            return sendJson(res, 200, { ok: true });
          }
          // 导出组件的安装（D66）：只接受本机看板带令牌的请求（handleRuntime 内校验）
          if (url.pathname.startsWith('/__joplo/voice/')) {
            const ctx = { guardWrite: (needJson = true) => guardWrite(req, res, 403, needJson), jsonBody: () => jsonBody(req, res), send: (status: number, body: unknown) => sendJson(res, status, body) };
            if (await voiceHub.handleGlobal(url.pathname.slice('/__joplo/voice/'.length), req, ctx)) return;
          }
          if (url.pathname.startsWith('/__joplo/cloud/')) {
            const ctx = { guardWrite: (needJson = true) => guardWrite(req, res, 403, needJson), jsonBody: () => jsonBody(req, res), send: (status: number, body: unknown) => sendJson(res, status, body) };
            if (await cloudHub.handleGlobal(url.pathname.slice('/__joplo/cloud/'.length), req, ctx)) return;
          }
          if (url.pathname.startsWith('/__joplo/export-runtime/')) return exportsHub.handleRuntime(url.pathname.slice('/__joplo/export-runtime/'.length), req, res, { guardWrite: (needJson = true) => guardWrite(req, res, 403, needJson), jsonBody: () => jsonBody(req, res), fail: (e) => fail(res, e) });
          const pm = /^\/__joplo\/p\/([^/]+)\/(.+)$/.exec(url.pathname);
          if (pm) {
            const r = await handleProject(decodeURIComponent(pm[1]!), pm[2]!, req, res);
            if (r === 'next') return next();
            return;
          }
          return sendJson(res, 404, { error: { code: 'NOT_FOUND', message: `Unknown endpoint: ${method} ${url.pathname}` } });
        } catch (e) {
          if (!res.headersSent) fail(res, e);
          else res.end();
        }
      });
    },
    transformIndexHtml(html) {
      const out = html.replace('__JOPLO_TOKEN__', token);
      return web.mode === 'dist' ? injectDistBoot(out, web) : out;
    },
    // 项目源文件只在项目加载器里使用：它们的变化由下面的重新编译处理，不交给 Vite 的默认 HMR。
    // client 环境里只保留非项目模块（例如以项目目录为 @source 的 index.css），新 className 照常热更新。
    hotUpdate(ctx) {
      if (!slotOfFile(ctx.file)) return;
      if (this.environment.name !== 'client') return [];
      return ctx.modules.filter((m) => !m.file || !slotOfFile(m.file));
    },
  };

  server = await createServer({
    configFile: false,
    envDir: false,
    root: web.mode === 'dist' ? web.appDir : web.webDir,
    mode: 'development',
    appType: 'spa',
    clearScreen: false,
    customLogger: makeLogger(log),
    resolve: { dedupe: ['react', 'react-dom'], alias: web.mode === 'source' ? kitAliases(web, web.webDir) : [] },
    plugins: [cssSourcePlugin(activeDirs, web), boardPlugin, ...(await webPlugins(web))],
    // dist 形态不往 node_modules 里写缓存（可能只读，或被多个项目共享）
    cacheDir: web.mode === 'dist' ? path.join(opts.home ?? path.join(process.cwd(), '.joplo'), 'vite') : path.join(web.webDir, 'node_modules/.vite-joplo'),
    optimizeDeps:
      web.mode === 'dist'
        ? { noDiscovery: true, include: [] }
        : {
            include: ['react', 'react-dom', 'react-dom/client', 'react/jsx-dev-runtime', 'react/jsx-runtime', 'motion', 'motion/react', 'roughjs', 'lucide-react', 'clsx', 'tailwind-merge', 'modern-screenshot', '@joplo-app/core > zod'],
          },
    server: {
      host: '127.0.0.1',
      port,
      strictPort: true,
      open: false,
      ...(web.mode === 'dist' ? { fs: { allow: [web.webDir] } } : {}),
      ...(watch ? { watch: { ignored: (p: string) => { const s = slotOfFile(p) ?? [...slots.values()].find((x) => p.startsWith(x.dir + path.sep)); return !!s && IGNORED_DIRS.includes(p.slice(s.dir.length + 1).split(path.sep)[0] ?? ''); } } } : { watch: null }),
    },
  });

  try {
    await server.listen();
  } catch (e) {
    await server.close().catch(() => undefined);
    const err = e as NodeJS.ErrnoException;
    if (err.code === 'EADDRINUSE' || /already in use/i.test(err.message ?? '')) throw new JoploError('USAGE', `Port ${port} is already in use; choose another port (--port), or stop the process using it`, { details: { code: 'EADDRINUSE' } });
    throw e;
  }
  const addr = server.httpServer?.address();
  actualPort = typeof addr === 'object' && addr ? addr.port : port;
  if (opts.home) writeServerInfo(opts.home, { port: actualPort, pid: process.pid, token, version: serverVersion(), dir: opts.startedIn ?? process.cwd() });

  if (watch) {
    server.watcher.on('all', (_ev, file) => {
      const slot = slotOfFile(path.resolve(file));
      if (!slot) return;
      reviewHub.invalidate(slot.dir, 'source_changed');
      if (slot.timer) clearTimeout(slot.timer);
      slot.timer = setTimeout(() => { slot.timer = null; void run(slot); }, 60);
    });
  }

  return {
    get url() {
      return baseUrl();
    },
    get port() {
      return actualPort;
    },
    token,
    server,
    addProject,
    ensure,
    projects: summaries,
    close: async () => {
      closed = true;
      voiceHub.close();
      await exportsHub.close();
      for (const s of [...slots.values()]) await deactivate(s);
      await server.close();
      if (opts.home) clearServerInfo(opts.home, process.pid);
    },
  };
}

// ---------- 单项目句柄（renderStep、测试、文档截图） ----------

export type InternalDevOptions = DevOptions & Pick<HubOptions, 'watch' | 'home' | 'exportDeps' | 'cloud'>;

export type InternalDevHandle = DevHandle & {
  token: string;
  port: number;
  /** 首个项目的 id 与看板链接（演示页）。 */
  projectId: string;
  projectUrl: string;
  payload(): DevPayload;
  server: ViteDevServer;
  hub: Hub;
};

/** 启动一个看板进程并打开一个项目（等首次编译完成）。缺省不持久化。 */
export async function createDev(opts: InternalDevOptions): Promise<InternalDevHandle> {
  const hub = await createHub({ port: opts.port, log: opts.log, watch: opts.watch, home: opts.home ?? null, exportDeps: opts.exportDeps, cloud: opts.cloud });
  try {
    const { id, url, slot } = hub.addProject(opts.projectDir);
    await slot!.ready;
    return { url: hub.url, projectUrl: url, projectId: id, token: hub.token, port: hub.port, server: hub.server, hub, payload: () => slot!.payload, close: () => hub.close() };
  } catch (e) {
    await hub.close();
    throw e;
  }
}

/**
 * 已有存活的看板：用令牌注册项目，返回项目链接；没有或不可用时返回 null。
 * 提示里写出那个看板的 Joplo 版本与启动目录；和 ownVersion（当前项目用的 Joplo）不一致时再给一行警告和处理办法（D65）。
 */
export async function attachToRunning(home: string, projectDir: string, log: (s: string) => void, ownVersion = serverVersion()): Promise<{ url: string; port: number; pid: number; version: string | null; dir: string | null } | null> {
  const info = readServerInfo(home);
  if (!info) return null;
  if (!pidAlive(info.pid)) {
    clearServerInfo(home, info.pid);
    return null;
  }
  const base = `http://127.0.0.1:${info.port}`;
  let boardVersion: string | null = null;
  try {
    const ping = await fetch(`${base}/__joplo/ping`, { signal: AbortSignal.timeout(1500) });
    const body = (await ping.json()) as { joplo?: boolean; pid?: number; version?: unknown };
    if (!ping.ok || body.joplo !== true || body.pid !== info.pid) return null;
    boardVersion = typeof body.version === 'string' ? body.version : typeof info.version === 'string' ? info.version : null;
  } catch {
    return null;
  }
  const res = await fetch(`${base}/__joplo/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-joplo-token': info.token },
    body: JSON.stringify({ dir: realProjectDir(projectDir) }),
    signal: AbortSignal.timeout(10000),
  });
  const body = (await res.json().catch(() => null)) as { url?: string; error?: { message?: string } } | null;
  if (!res.ok || !body?.url) throw new JoploError('UNSUPPORTED_ACTION', `Cannot add the project to the running board (${base}, pid ${info.pid}): ${body?.error?.message ?? `HTTP ${res.status}`}`);
  const dir = typeof info.dir === 'string' ? info.dir : null;
  log(`[joplo] Joined the running board: Joplo ${boardVersion ?? 'version unknown (0.2.6 or earlier)'}, started in ${dir ?? 'an unknown directory'} (pid ${info.pid})`);
  if (boardVersion !== ownVersion)
    log(`[joplo] ! That board runs Joplo ${boardVersion ?? '0.2.6 or earlier'}, this project uses ${ownVersion}; the board may behave differently. To use ${ownVersion}, stop it (Ctrl+C in its terminal, or kill ${info.pid}), then run joplo dev here again.`);
  return { url: body.url, port: info.port, pid: info.pid, version: boardVersion, dir };
}

function openBrowser(url: string, log: (s: string) => void) {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    spawn(cmd, args, { stdio: 'ignore', detached: true }).unref();
  } catch {
    log(`[joplo] Cannot open the browser automatically; visit ${url}`);
  }
}

/**
 * CLI 的 `joplo dev`：同一个 JOPLO_HOME 下只运行一个看板进程。
 * 已有存活的看板 → 注册项目、（--open 时）打开浏览器，返回 attached；否则启动新的看板并登记项目。
 */
export async function startDev(opts: DevOptions & { home?: string; exportDeps?: Partial<ExportDeps>; /** 测试注入：当前项目的 Joplo 版本。 */ version?: string }): Promise<DevHandle> {
  const log = opts.log ?? ((m: string) => process.stderr.write(m + '\n'));
  const home = opts.home ?? joploHome();
  const projectDir = realProjectDir(opts.projectDir);
  if (!fs.existsSync(projectDir)) throw new JoploError('NOT_FOUND', `Project directory does not exist: ${projectDir}`);
  const attach = async () => {
    const a = await attachToRunning(home, projectDir, log, opts.version);
    if (!a) return null;
    if (opts.open) openBrowser(a.url, log);
    return { url: a.url, attached: true, close: async () => undefined } satisfies DevHandle;
  };
  const existing = await attach();
  if (existing) return existing;
  let hub: Hub;
  try {
    hub = await createHub({ port: opts.port, log, home, exportDeps: opts.exportDeps, startedIn: projectDir, cloud: opts.cloud });
  } catch (e) {
    // 另一个 joplo dev 恰好同时启动：端口被它占了，改为加入它
    if (e instanceof JoploError && (e.details as { code?: string } | undefined)?.code === 'EADDRINUSE') {
      await new Promise((r) => setTimeout(r, 300));
      const again = await attach();
      if (again) return again;
    }
    throw e;
  }
  const { url } = hub.addProject(projectDir);
  const cleanup = () => clearServerInfo(home, process.pid);
  process.once('exit', cleanup);
  if (opts.open) openBrowser(url, log);
  return {
    url,
    attached: false,
    close: async () => {
      process.off('exit', cleanup);
      await hub.close();
    },
  };
}
