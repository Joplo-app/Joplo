/**
 * joplo preview（D98）：在本机用静态服务器打开构建产物。构建产物的素材是独立文件（assets/），
 * 只保证通过 HTTP 打开，不再支持 file:// 双击。只读、只监听 127.0.0.1、不跟随目录外的路径。
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { JoploError } from '@joplo-app/core';

/** 构建产物里会出现的文件类型；与 Cloud 分享接受的类型一致（D98 增加视频与 GLB）。 */
export const SITE_CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.avif': 'image/avif',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.flac': 'audio/flac', '.m4a': 'audio/mp4', '.aac': 'audio/aac',
  '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.glb': 'model/gltf-binary',
};

export type PreviewHandle = { url: string; close: () => Promise<void> };

export async function startPreview(opts: { dir: string; port?: number; host?: string }): Promise<PreviewHandle> {
  const root = path.resolve(opts.dir);
  if (!fs.existsSync(path.join(root, 'index.html'))) throw new JoploError('USAGE', `${root} has no index.html. Run npx joplo build first, then npx joplo preview <output dir> (default: <project>/dist)`);
  const real = fs.realpathSync(root);
  const server = http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { allow: 'GET, HEAD' }).end(); return; }
    let rel: string;
    try { rel = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname); } catch { res.writeHead(400).end(); return; }
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.resolve(real, '.' + rel);
    const type = SITE_CONTENT_TYPES[path.extname(file).toLowerCase()];
    let resolved: string;
    try { resolved = fs.realpathSync(file); } catch { res.writeHead(404).end(); return; }
    if (!(resolved === real || resolved.startsWith(real + path.sep)) || !type || !fs.statSync(resolved).isFile()) { res.writeHead(404).end(); return; }
    const size = fs.statSync(resolved).size;
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
    // 视频 / 音频拖动需要 Range
    if (range && (range[1] || range[2])) {
      const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(size - 1, Number(range[2])) : size - 1;
      if (start > end || start >= size) { res.writeHead(416, { 'content-range': `bytes */${size}` }).end(); return; }
      res.writeHead(206, { 'content-type': type, 'content-length': end - start + 1, 'content-range': `bytes ${start}-${end}/${size}`, 'accept-ranges': 'bytes', 'cache-control': 'no-cache' });
      if (req.method === 'HEAD') { res.end(); return; }
      fs.createReadStream(resolved, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, { 'content-type': type, 'content-length': size, 'accept-ranges': 'bytes', 'cache-control': 'no-cache' });
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(resolved).pipe(res);
  });
  const host = opts.host ?? '127.0.0.1';
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(opts.port ?? 0, host, () => resolve()); });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : opts.port ?? 0;
  return { url: `http://${host}:${port}/`, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}
