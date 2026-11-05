import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { z } from 'zod';
import { Id, Project, findNode, stateAt } from '@joplo/core';
import type { ServeHandle, ServeOptions } from './types.ts';
import { WEB_DIST, ensureWebBuild } from './web-build.ts';

export const PROJECT_FILE = 'project.joplo.json';
const MAX_BODY = 64 * 1024;
/** 超过这个大小不再排空请求体，直接断开。 */
const MAX_DRAIN = 8 * 1024 * 1024;

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
/** 写接口的请求体：一个选中，或 null 表示取消选中。 */
export const SelectionBody = SelectionSchema.nullable();

/** 对照当前项目校验选中；返回问题描述，没有问题返回 null。 */
export function checkSelection(project: Project, sel: Selection): string | null {
  if (!project.options[sel.optionId]) return `方案 ${sel.optionId} 不存在`;
  const sc = project.scenarios[sel.scenarioId];
  if (!sc || sc.optionId !== sel.optionId) return `场景 ${sel.scenarioId} 不存在或不属于方案 ${sel.optionId}`;
  if (sel.position > sc.steps.length) return `位置 ${sel.position} 超出场景 ${sc.id} 的范围 0..${sc.steps.length}`;
  const expectStep = sc.steps[sel.position - 1]?.id ?? null;
  if (sel.stepId !== expectStep) return `stepId ${sel.stepId ?? 'null'} 与位置 ${sel.position} 不符（应为 ${expectStep ?? 'null'}）`;
  let sceneId: string;
  try {
    sceneId = stateAt(project, sc.id, sel.position).sceneId;
  } catch (e) {
    return `场景 ${sc.id} 无法回放到位置 ${sel.position}：${e instanceof Error ? e.message : String(e)}`;
  }
  if (sel.sceneId !== sceneId) return `位置 ${sel.position} 的画面是 ${sceneId}，不是 ${sel.sceneId}`;
  if (sel.nodeId && !findNode(project.scenes[sceneId]!, sel.nodeId)) return `元素 ${sel.nodeId} 不在画面 ${sceneId} 中`;
  return null;
}

/** Content-Type 必须是 application/json，只允许附带 charset=utf-8 参数。 */
export function isJsonContentType(ct: string | undefined): boolean {
  if (!ct) return false;
  const [type, ...params] = ct.split(';').map((x) => x.trim().toLowerCase());
  return type === 'application/json' && params.every((p) => p === '' || /^charset="?utf-8"?$/.test(p));
}

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

/** 读取请求体；超过 MAX_BODY 时继续排空（不重置连接），返回 tooLarge 以便回 413。 */
function readBody(req: http.IncomingMessage): Promise<{ tooLarge: true } | { tooLarge: false; text: string }> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_DRAIN) {
        req.destroy();
        reject(new Error('请求体过大'));
      } else if (size <= MAX_BODY) chunks.push(c);
    });
    req.on('end', () => resolve(size > MAX_BODY ? { tooLarge: true } : { tooLarge: false, text: Buffer.concat(chunks).toString('utf8') }));
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
  const snapshot = opts.projectSnapshot === undefined ? null : Project.parse(opts.projectSnapshot);
  const loadProject = (): ReturnType<typeof loadProjectFile> => (snapshot ? { ok: true, revision: snapshot.revision, project: snapshot } : loadProjectFile(projectDir));

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
    // 解码后跳出构建目录（如 ..%2fpackage.json）：明确拒绝，不回退到 index.html
    if (!inside) return sendJson(res, 404, { error: { code: 'NOT_FOUND', message: '文件不存在' } });
    if (rel !== '/' && !rel.endsWith('/index.html')) {
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
          const r = loadProject();
          return r.ok ? sendJson(res, 200, { revision: r.revision, project: r.project }) : sendJson(res, r.status, { error: r.error });
        }
        if (url.pathname === '/api/events' && method === 'GET') {
          res.writeHead(200, { ...SECURITY_HEADERS, 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive' });
          res.write(`retry: 1500\n\n`);
          const r = loadProject();
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
          if (!isJsonContentType(req.headers['content-type'])) return sendJson(res, 415, { error: { code: 'USAGE', message: 'Content-Type 必须是 application/json（只允许 charset=utf-8 参数）' } });
          if (Number(req.headers['content-length'] ?? 0) > MAX_DRAIN) {
            res.setHeader('connection', 'close');
            return sendJson(res, 413, { error: { code: 'USAGE', message: `请求体过大（上限 ${MAX_BODY} 字节）` } });
          }
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
          if (parsed.data) {
            const cur = loadProject();
            if (!cur.ok) return sendJson(res, 409, { error: { code: 'REVISION_CONFLICT', message: `当前项目文件无法读取，不能校验选中：${cur.error.message}` } });
            const problem = checkSelection(cur.project, parsed.data);
            if (problem) return sendJson(res, 409, { error: { code: 'INVALID_REFERENCE', message: `选中与当前项目（rev_${cur.revision}）不符：${problem}` } });
          }
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

  // 先监听端口；失败时尚未创建任何其他句柄（文件监听、定时器），不会让进程挂住。
  await new Promise<void>((resolve, reject) => {
    server.once('error', (e: NodeJS.ErrnoException) => reject(e.code === 'EADDRINUSE' ? new Error(`端口 ${opts.port} 已被占用，请换一个端口（--port）`) : e));
    server.listen(opts.port ?? 4790, '127.0.0.1', () => resolve());
  });
  port = (server.address() as { port: number }).port;

  // 监听 project.joplo.json（监听目录以兼容“临时文件 + rename”的原子写入），防抖后推送修订号。
  let timer: ReturnType<typeof setTimeout> | null = null;
  const broadcast = () => {
    const r = loadProject();
    const msg = `event: revision\ndata: ${JSON.stringify({ revision: r.ok ? r.revision : null, ...(r.ok ? {} : { error: r.error.message }) })}\n\n`;
    for (const c of sseClients) c.write(msg);
  };
  let watcher: fs.FSWatcher | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  try {
    if (!snapshot)
      watcher = fs.watch(projectDir, (_ev, filename) => {
        if (filename && filename.toString() !== PROJECT_FILE) return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(broadcast, 120);
      });
    heartbeat = setInterval(() => {
      for (const c of sseClients) c.write(': ping\n\n');
    }, 15000);
  } catch (e) {
    watcher?.close();
    if (heartbeat) clearInterval(heartbeat);
    await new Promise<void>((r) => server.close(() => r()));
    throw e;
  }
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
      watcher?.close();
      if (heartbeat) clearInterval(heartbeat);
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
