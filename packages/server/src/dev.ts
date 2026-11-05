/**
 * `joplo dev`：一个进程、一个 Vite 开发服务，同时承担
 *   1. 看板界面（packages/web，React + Tailwind，HMR）；
 *   2. 项目编译（ssrLoadModule 载入作者的 TSX → core.loadAuthoring → core.compile(…, 'dev')）；
 *   3. 热更新（项目目录任何文件变化 → 使模块失效 → 重新编译 → HMR 自定义事件 `joplo:ir` 推送新 IR，不整页刷新）。
 *
 * 安全（沿用 M0）：只监听 127.0.0.1；每个 HTTP 请求校验 Host；写接口校验 Origin、Content-Type 与本地令牌。
 * 端口被占用时直接报错（strictPort），不静默换端口。
 *
 * 看板界面有两种来源（web-assets.ts）：仓库里直接编译 packages/web/src（界面本身也热更新）；从 npm 安装时用
 * @tokenroll/joplo-web 预构建的 dist/app。后者的 `import.meta.hot` 在构建时改成了 `globalThis.__JOPLO_HOT__`，这里在页面里
 * 先用 Vite 客户端的 createHotContext 创建它，并以 JS 导入 project.css（作者 className，随项目文件热更新）。
 */
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import type http from 'node:http';
import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import { createLogger, createServer, type Logger, type Plugin, type PluginOption, type ViteDevServer } from 'vite';
import { JoploError, type Diagnostic, type Project } from '@tokenroll/joplo-core';
import type { DevHandle, DevOptions } from './contract.ts';
import { compileProject, invalidateProjectModules } from './project.ts';
import { SelectionBody, readSelection, resolveSelection, writeSelection } from './selection.ts';
import { IGNORED_DIRS, isProjectSource, joploProjectPlugin, kitAliases, locateWebAssets, realProjectDir } from './vite-shared.ts';
import type { DistWeb, WebAssets } from './web-assets.ts';

/** 推给看板的编译结果。`project` 始终是最近一次成功的 IR；`ok=false` 时看板显示错误列表、保留画面。 */
export type DevPayload = {
  version: number;
  ok: boolean;
  project: Project | null;
  diagnostics: Diagnostic[];
  home: string | null;
};

export const IR_EVENT = 'joplo:ir';
const MAX_BODY = 64 * 1024;

const SECURITY_HEADERS: Record<string, string> = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'cache-control': 'no-store',
};

function sendJson(res: http.ServerResponse, status: number, body: unknown) {
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
        reject(new Error('请求体过大'));
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
  const boot = `<script type="module">import { createHotContext } from '/@vite/client';\nimport ${JSON.stringify(css)};\nglobalThis.__JOPLO_HOT__ = createHotContext('/@tokenroll/joplo-board');</script>`;
  const at = html.search(/<script\b/i);
  return at < 0 ? html.replace('</head>', `${boot}\n</head>`) : html.slice(0, at) + boot + '\n    ' + html.slice(at);
}

async function webPlugins(web: WebAssets): Promise<PluginOption[]> {
  if (web.mode === 'dist') return [tailwindcss()];
  // 只有在仓库里编译看板源码时才需要 React 插件（devDependency）
  const { default: react } = await import('@vitejs/plugin-react');
  return [react(), tailwindcss()];
}

export type InternalDevOptions = DevOptions & {
  /** false：只编译一次、不监听文件（renderStep 用它保证截图与元素索引来自同一份 IR）。 */
  watch?: boolean;
};

export type InternalDevHandle = DevHandle & { token: string; port: number; payload(): DevPayload; server: ViteDevServer };

export async function createDev(opts: InternalDevOptions): Promise<InternalDevHandle> {
  const log = opts.log ?? ((m: string) => process.stderr.write(m + '\n'));
  const projectDir = realProjectDir(opts.projectDir);
  const watch = opts.watch !== false;
  const port = opts.port ?? 4790;
  const token = crypto.randomBytes(24).toString('hex');
  const web = locateWebAssets();
  let actualPort = port;
  let payload: DevPayload = { version: 0, ok: false, project: null, diagnostics: [], home: null };

  const allowedHosts = () => new Set([`127.0.0.1:${actualPort}`, `localhost:${actualPort}`]);
  const allowedOrigins = () => new Set([`http://127.0.0.1:${actualPort}`, `http://localhost:${actualPort}`]);

  const boardPlugin: Plugin = {
    name: 'joplo:board',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        try {
          const host = req.headers.host ?? '';
          if (!allowedHosts().has(host)) return sendJson(res, 403, { error: { code: 'PERMISSION_DENIED', message: `Host 头不被允许：${host || '(空)'}` } });
          const url = new URL(req.url ?? '/', `http://127.0.0.1:${actualPort}`);
          if (web.mode === 'dist' && (req.method === 'GET' || req.method === 'HEAD') && serveDistAsset(web, url.pathname, res)) return;
          if (!url.pathname.startsWith('/__joplo/')) return next();
          const method = req.method ?? 'GET';
          if (url.pathname === '/__joplo/ir' && method === 'GET') return sendJson(res, 200, payload);
          if (url.pathname === '/__joplo/selection' && method === 'GET') return sendJson(res, 200, { selection: readSelection(projectDir) });
          if (url.pathname === '/__joplo/selection' && method === 'PUT') {
            const origin = req.headers.origin;
            if (origin !== undefined && !allowedOrigins().has(origin)) return sendJson(res, 403, { error: { code: 'PERMISSION_DENIED', message: `Origin 不被允许：${origin}` } });
            const t = req.headers['x-joplo-token'];
            if (typeof t !== 'string' || !safeEqual(t, token)) return sendJson(res, 401, { error: { code: 'PERMISSION_DENIED', message: '缺少或错误的本地令牌（x-joplo-token）' } });
            if (!isJsonContentType(req.headers['content-type'])) return sendJson(res, 415, { error: { code: 'USAGE', message: 'Content-Type 必须是 application/json' } });
            const raw = await readBody(req);
            if (raw.tooLarge) return sendJson(res, 413, { error: { code: 'USAGE', message: `请求体过大（上限 ${MAX_BODY} 字节）` } });
            let body: unknown;
            try {
              body = JSON.parse(raw.text);
            } catch (e) {
              return sendJson(res, 400, { error: { code: 'USAGE', message: `请求体不是合法 JSON：${e instanceof Error ? e.message : String(e)}` } });
            }
            const parsed = SelectionBody.safeParse(body);
            if (!parsed.success) return sendJson(res, 400, { error: { code: 'USAGE', message: '选中内容格式不正确', issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) } });
            if (parsed.data.selection === null) {
              writeSelection(projectDir, null);
              return sendJson(res, 200, { ok: true, selection: null });
            }
            const project = payload.project;
            const r = project ? resolveSelection(project, parsed.data.selection) : { ok: false as const, problem: '项目还没有成功编译过' };
            if (!r.ok) {
              // 不变量：被拒绝时文件写为 null（不能保留旧选中而界面显示新选中）
              writeSelection(projectDir, null);
              return sendJson(res, 409, { error: { code: 'INVALID_REFERENCE', message: `选中与当前项目不符：${r.problem}` }, current: null });
            }
            writeSelection(projectDir, r.selection);
            return sendJson(res, 200, { ok: true, selection: r.selection });
          }
          return sendJson(res, 404, { error: { code: 'NOT_FOUND', message: `没有这个接口：${method} ${url.pathname}` } });
        } catch (e) {
          if (!res.headersSent) sendJson(res, 500, { error: { code: 'INTERNAL', message: e instanceof Error ? e.message : String(e) } });
          else res.end();
        }
      });
    },
    transformIndexHtml(html) {
      const out = html.replace('__JOPLO_TOKEN__', token);
      return web.mode === 'dist' ? injectDistBoot(out, web) : out;
    },
    // 项目源文件只在服务端（ssr 环境）使用：它们的变化由下面的重新编译处理，不交给 Vite 的默认 HMR。
    // client 环境里只保留非项目模块（例如以项目目录为 @source 的 index.css），新 className 照常热更新。
    hotUpdate(ctx) {
      if (!isProjectSource(projectDir, ctx.file)) return;
      if (this.environment.name !== 'client') return [];
      return ctx.modules.filter((m) => !m.file || !isProjectSource(projectDir, m.file));
    },
  };

  const server = await createServer({
    configFile: false,
    envDir: false,
    root: web.mode === 'dist' ? web.appDir : web.webDir,
    mode: 'development',
    appType: 'spa',
    clearScreen: false,
    customLogger: makeLogger(log),
    resolve: { alias: kitAliases(web, projectDir) },
    plugins: [joploProjectPlugin(projectDir, web), boardPlugin, ...(await webPlugins(web))],
    // dist 形态不往 node_modules 里写缓存（可能只读，或被多个项目共享）
    cacheDir: web.mode === 'dist' ? path.join(projectDir, '.joplo/vite') : path.join(web.webDir, 'node_modules/.vite-joplo'),
    optimizeDeps:
      web.mode === 'dist'
        ? { noDiscovery: true, include: [] }
        : {
            include: ['react', 'react-dom', 'react-dom/client', 'react/jsx-dev-runtime', 'react/jsx-runtime', 'motion', 'motion/react', 'roughjs', 'lucide-react', 'radix-ui', 'clsx', 'tailwind-merge', 'class-variance-authority', '@tokenroll/joplo-core > zod'],
          },
    server: {
      host: '127.0.0.1',
      port,
      strictPort: true,
      open: false,
      ...(web.mode === 'dist' ? { fs: { allow: [web.webDir, projectDir] } } : {}),
      ...(watch ? { watch: { ignored: IGNORED_DIRS.map((d) => path.join(projectDir, d) + '/**') } } : { watch: null }),
    },
  });

  const recompile = async () => {
    invalidateProjectModules(server, projectDir);
    const out = await compileProject(server, projectDir, 'dev');
    payload = {
      version: payload.version + 1,
      ok: out.project !== null,
      project: out.project ?? payload.project,
      diagnostics: out.diagnostics,
      home: out.home ?? payload.home,
    };
    const errors = out.diagnostics.filter((d) => d.severity === 'error');
    if (errors.length) log(`[joplo] 编译出错（${errors.length}）：${errors.map((d) => `${d.at ?? ''} ${d.message}`).join('；').slice(0, 400)}`);
    server.ws.send({ type: 'custom', event: IR_EVENT, data: payload });
  };

  // 串行化：编译进行中又有变化时，结束后再编一次。
  let running: Promise<void> | null = null;
  let dirty = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;
  const run = async () => {
    if (closed) return;
    if (running) {
      dirty = true;
      return running;
    }
    running = (async () => {
      do {
        dirty = false;
        try {
          await recompile();
        } catch (e) {
          log(`[joplo] 编译异常：${e instanceof Error ? e.message : String(e)}`);
        }
      } while (dirty);
    })().finally(() => {
      running = null;
    });
    return running;
  };

  try {
    await run();
    await server.listen();
  } catch (e) {
    await server.close().catch(() => undefined);
    const err = e as NodeJS.ErrnoException;
    if (err.code === 'EADDRINUSE' || /already in use/i.test(err.message ?? '')) throw new JoploError('USAGE', `端口 ${port} 已被占用，请换一个端口（--port），或先关闭占用它的进程`);
    throw e;
  }
  const addr = server.httpServer?.address();
  actualPort = typeof addr === 'object' && addr ? addr.port : port;

  if (watch) {
    server.watcher.add(projectDir);
    server.watcher.on('all', (_ev, file) => {
      if (!isProjectSource(projectDir, path.resolve(file))) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void run(), 60);
    });
  }

  const url = `http://127.0.0.1:${actualPort}/`;
  if (opts.open) {
    const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
    const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
    try {
      spawn(cmd, args, { stdio: 'ignore', detached: true }).unref();
    } catch {
      log(`[joplo] 无法自动打开浏览器，请手动访问 ${url}`);
    }
  }

  return {
    url,
    token,
    port: actualPort,
    server,
    payload: () => payload,
    close: async () => {
      closed = true;
      if (timer) clearTimeout(timer);
      await running?.catch(() => undefined);
      await server.close();
    },
  };
}

export async function startDev(opts: DevOptions): Promise<DevHandle> {
  const h = await createDev(opts);
  return { url: h.url, close: h.close };
}
