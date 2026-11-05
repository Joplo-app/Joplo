import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { z } from 'zod';
import { Id, Project } from '@joplo/core';
import type { ServeHandle, ServeOptions } from './types.ts';
import { WEB_DIST, ensureWebBuild } from './web-build.ts';

export const PROJECT_FILE = 'project.joplo.json';
const MAX_BODY = 64 * 1024;

/** 浏览器写入的“当前选中”（D15）。不进入修订历史。 */
export const SelectionSchema = z.strictObject({
  optionId: Id,
  scenarioId: Id,
  position: z.number().int().nonnegative(),
  stepId: Id.nullable(),
  sceneId: Id,
  nodeId: Id.nullable(),
  at: z.string().min(1).max(64),
});
export type Selection = z.infer<typeof SelectionSchema>;

type LoadResult = { ok: true; revision: number; project: Project } | { ok: false; status: number; error: { code: string; message: string; issues?: { path: string; message: string }[] } };

export function loadProjectFile(projectDir: string): LoadResult {
  const file = path.join(projectDir, PROJECT_FILE);
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (e) {
    return { ok: false, status: 404, error: { code: 'NOT_FOUND', message: `找不到项目文件 ${file}` } };
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    return { ok: false, status: 422, error: { code: 'INVALID_SCHEMA', message: `project.joplo.json 不是合法 JSON：${e instanceof Error ? e.message : String(e)}` } };
  }
  const parsed = Project.safeParse(json);
  if (!parsed.success)
    return {
      ok: false,
      status: 422,
      error: {
        code: 'INVALID_SCHEMA',
        message: `project.joplo.json 不符合 schema（${parsed.error.issues.length} 处问题）`,
        issues: parsed.error.issues.slice(0, 20).map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    };
  return { ok: true, revision: parsed.data.revision, project: parsed.data };
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon',
};

const SECURITY_HEADERS: Record<string, string> = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
};

function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { ...SECURITY_HEADERS, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}
const deny = (res: http.ServerResponse, status: number, message: string) => sendJson(res, status, { error: { code: 'PERMISSION_DENIED', message } });

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/** 临时文件 + rename 的原子写入。 */
export function writeFileAtomic(file: string, data: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('请求体过大'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export async function startServer(opts: ServeOptions): Promise<ServeHandle> {
  const log = opts.log ?? ((m: string) => process.stderr.write(m + '\n'));
  const projectDir = path.resolve(opts.projectDir);
  const projectFile = path.join(projectDir, PROJECT_FILE);
  if (!fs.existsSync(projectFile)) throw new Error(`找不到项目文件：${projectFile}`);
  if (opts.host && opts.host !== '127.0.0.1') throw new Error('本地服务只允许绑定 127.0.0.1');
  if (!opts.skipBuild) await ensureWebBuild(log);
  const indexFile = path.join(WEB_DIST, 'index.html');
  if (!fs.existsSync(indexFile)) throw new Error(`网页构建产物不存在：${indexFile}。请运行 pnpm --filter @joplo/web build`);

  const token = crypto.randomBytes(24).toString('hex');
  const selectionFile = path.join(projectDir, '.joplo', 'selection.json');
  const sseClients = new Set<http.ServerResponse>();
  let port = 0;

  const allowedHosts = () => new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  const allowedOrigins = () => new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`]);

  const indexHtml = () => fs.readFileSync(indexFile, 'utf8').replace('__JOPLO_TOKEN__', token);

  const serveStatic = (urlPath: string, res: http.ServerResponse) => {
    let rel: string;
    try {
      rel = decodeURIComponent(urlPath);
    } catch {
      return sendJson(res, 400, { error: { code: 'USAGE', message: '路径编码无效' } });
    }
    const file = path.resolve(WEB_DIST, '.' + rel);
    const inside = file === WEB_DIST || file.startsWith(WEB_DIST + path.sep);
    if (inside && rel !== '/' && !rel.endsWith('/index.html')) {
      let st: fs.Stats | null = null;
      try {
        st = fs.statSync(file);
      } catch {
        st = null;
      }
      if (st?.isFile()) {
        const real = fs.realpathSync(file);
        if (!real.startsWith(fs.realpathSync(WEB_DIST) + path.sep)) return sendJson(res, 404, { error: { code: 'NOT_FOUND', message: '文件不存在' } });
        res.writeHead(200, { ...SECURITY_HEADERS, 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream', 'cache-control': rel.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache' });
        fs.createReadStream(file).pipe(res);
        return;
      }
      if (path.extname(rel)) return sendJson(res, 404, { error: { code: 'NOT_FOUND', message: '文件不存在' } });
    }
    res.writeHead(200, { ...SECURITY_HEADERS, 'content-type': MIME['.html']!, 'cache-control': 'no-store' });
    res.end(indexHtml());
  };

  const server = http.createServer(async (req, res) => {
    try {
      const host = req.headers.host ?? '';
      if (!allowedHosts().has(host)) return deny(res, 403, `Host 头不被允许：${host || '(空)'}`);
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
      const method = req.method ?? 'GET';
      const origin = req.headers.origin;
      if (origin !== undefined && !allowedOrigins().has(origin) && method !== 'GET' && method !== 'HEAD') return deny(res, 403, `Origin 不被允许：${origin}`);

      if (url.pathname.startsWith('/api/')) {
        if (url.pathname === '/api/project' && method === 'GET') {
          const r = loadProjectFile(projectDir);
          return r.ok ? sendJson(res, 200, { revision: r.revision, project: r.project }) : sendJson(res, r.status, { error: r.error });
        }
        if (url.pathname === '/api/events' && method === 'GET') {
          res.writeHead(200, { ...SECURITY_HEADERS, 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive' });
          res.write(`retry: 1500\n\n`);
          const r = loadProjectFile(projectDir);
          res.write(`event: revision\ndata: ${JSON.stringify({ revision: r.ok ? r.revision : null })}\n\n`);
          sseClients.add(res);
          req.on('close', () => sseClients.delete(res));
          return;
        }
        if (url.pathname === '/api/selection' && method === 'GET') {
          let selection: unknown = null;
          try {
            selection = JSON.parse(fs.readFileSync(selectionFile, 'utf8'));
          } catch {
            selection = null;
          }
          return sendJson(res, 200, { selection });
        }
        if (url.pathname === '/api/selection' && method === 'PUT') {
          if (origin !== undefined && !allowedOrigins().has(origin)) return deny(res, 403, `Origin 不被允许：${origin}`);
          const t = req.headers['x-joplo-token'];
          if (typeof t !== 'string' || !safeEqual(t, token)) return deny(res, 401, '缺少或错误的本地令牌（x-joplo-token）');
          if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) return sendJson(res, 415, { error: { code: 'USAGE', message: 'Content-Type 必须是 application/json' } });
          let body: unknown;
          try {
            body = JSON.parse(await readBody(req));
          } catch (e) {
            return sendJson(res, 400, { error: { code: 'USAGE', message: `请求体不是合法 JSON：${e instanceof Error ? e.message : String(e)}` } });
          }
          const parsed = SelectionSchema.safeParse(body);
          if (!parsed.success) return sendJson(res, 400, { error: { code: 'USAGE', message: '选中内容格式不正确', issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) } });
          writeFileAtomic(selectionFile, JSON.stringify(parsed.data, null, 2) + '\n');
          return sendJson(res, 200, { ok: true, selection: parsed.data });
        }
        return sendJson(res, url.pathname === '/api/selection' || url.pathname === '/api/project' ? 405 : 404, { error: { code: 'NOT_FOUND', message: `没有这个接口：${method} ${url.pathname}` } });
      }
      if (method !== 'GET' && method !== 'HEAD') return sendJson(res, 405, { error: { code: 'USAGE', message: '只读资源' } });
      return serveStatic(url.pathname, res);
    } catch (e) {
      if (!res.headersSent) sendJson(res, 500, { error: { code: 'INTERNAL', message: e instanceof Error ? e.message : String(e) } });
      else res.end();
    }
  });

  // 监听 project.joplo.json（监听目录以兼容“临时文件 + rename”的原子写入），防抖后推送修订号。
  let timer: ReturnType<typeof setTimeout> | null = null;
  const broadcast = () => {
    const r = loadProjectFile(projectDir);
    const msg = `event: revision\ndata: ${JSON.stringify({ revision: r.ok ? r.revision : null, ...(r.ok ? {} : { error: r.error.message }) })}\n\n`;
    for (const c of sseClients) c.write(msg);
  };
  const watcher = fs.watch(projectDir, (_ev, filename) => {
    if (filename && filename.toString() !== PROJECT_FILE) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(broadcast, 120);
  });
  const heartbeat = setInterval(() => {
    for (const c of sseClients) c.write(': ping\n\n');
  }, 15000);

  await new Promise<void>((resolve, reject) => {
    server.once('error', (e: NodeJS.ErrnoException) => reject(e.code === 'EADDRINUSE' ? new Error(`端口 ${opts.port} 已被占用，请换一个端口（--port）`) : e));
    server.listen(opts.port ?? 4790, '127.0.0.1', () => resolve());
  });
  port = (server.address() as { port: number }).port;
  const url = `http://127.0.0.1:${port}/`;

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
    close: async () => {
      watcher.close();
      clearInterval(heartbeat);
      if (timer) clearTimeout(timer);
      for (const c of sseClients) c.end();
      sseClients.clear();
      await new Promise<void>((r) => {
        server.close(() => r());
        server.closeAllConnections();
      });
    },
  };
}
