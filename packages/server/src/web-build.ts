/** 确保 @joplo/web 的构建产物存在且不比源码旧；否则自动执行 vite build。 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

export const WEB_DIR = path.resolve(import.meta.dirname, '../../web');
export const WEB_DIST = path.join(WEB_DIR, 'dist');
const CORE_SRC = path.resolve(import.meta.dirname, '../../core/src');

function newestMtime(p: string): number {
  let st: fs.Stats;
  try {
    st = fs.statSync(p);
  } catch {
    return 0;
  }
  if (!st.isDirectory()) return st.mtimeMs;
  let max = 0;
  for (const name of fs.readdirSync(p)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    max = Math.max(max, newestMtime(path.join(p, name)));
  }
  return max;
}

export function webBuildState(): 'missing' | 'stale' | 'fresh' {
  const index = path.join(WEB_DIST, 'index.html');
  if (!fs.existsSync(index)) return 'missing';
  const built = fs.statSync(index).mtimeMs;
  const src = Math.max(
    newestMtime(path.join(WEB_DIR, 'src')),
    newestMtime(path.join(WEB_DIR, 'index.html')),
    newestMtime(path.join(WEB_DIR, 'vite.config.ts')),
    newestMtime(CORE_SRC),
  );
  return src > built ? 'stale' : 'fresh';
}

let building: Promise<void> | null = null;

/** 产物缺失或过期时构建一次（同一进程内并发调用共享同一次构建）。 */
export function ensureWebBuild(log: (m: string) => void = (m) => process.stderr.write(m + '\n')): Promise<void> {
  const st = webBuildState();
  if (st === 'fresh') return Promise.resolve();
  if (building) return building;
  log(st === 'missing' ? '[joplo] 未找到网页构建产物，正在执行 vite build…' : '[joplo] 网页源码已更新，正在重新构建…');
  building = new Promise<void>((resolve, reject) => {
    let viteBin: string;
    try {
      const req = createRequire(path.join(WEB_DIR, 'package.json'));
      viteBin = path.join(path.dirname(req.resolve('vite/package.json')), 'bin/vite.js');
    } catch {
      reject(new Error(`无法找到 vite。请先在仓库根目录执行 pnpm install，然后运行 pnpm --filter @joplo/web build（${WEB_DIR}）`));
      return;
    }
    const child = spawn(process.execPath, [viteBin, 'build', '--logLevel', 'warn'], { cwd: WEB_DIR, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('error', (e) => reject(new Error(`网页构建无法启动：${e.message}`)));
    child.on('close', (code) => {
      if (code === 0 && fs.existsSync(path.join(WEB_DIST, 'index.html'))) {
        log('[joplo] 网页构建完成');
        resolve();
      } else reject(new Error(`网页构建失败（exit ${code}）。可手动运行 pnpm --filter @joplo/web build 查看详情。\n${out.slice(-2000)}`));
    });
  }).finally(() => {
    building = null;
  });
  return building;
}
