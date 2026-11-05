/**
 * 不经过 CLI 直接启动本地预览服务。
 * 用法：pnpm web:serve [项目目录，缺省 examples/invite] [--port 4790] [--open]
 */
import path from 'node:path';
import { startServer } from '../src/index.ts';

const args = process.argv.slice(2);
const portIdx = args.indexOf('--port');
const port = portIdx >= 0 ? Number(args[portIdx + 1]) : 4790;
const dir = args.find((a, i) => !a.startsWith('--') && i !== portIdx + 1) ?? path.resolve(import.meta.dirname, '../../../examples/invite');
const s = await startServer({ projectDir: dir, port, open: args.includes('--open') });
process.stderr.write(`[joplo] 方案工作区：${s.url}\n[joplo] 项目目录：${path.resolve(dir)}\n[joplo] 按 Ctrl+C 退出\n`);
const stop = async () => {
  await s.close();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
