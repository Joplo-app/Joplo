/**
 * 启动时的版本一致性检查（D36）：CLI 发现项目里的 @joplo/kit 与自己版本不同、或项目声明了依赖却没安装时，
 * 在 stderr 打印一行提示和对齐命令。只对读取项目源文件的命令（check / dev / build / render）检查；任何读取错误都不阻止命令运行。
 *
 * 版本来源：CLI 自己的 package.json（与 skill.ts 的 readCliVersion 同一位置：src/ 与 dist/ 都在包根下一层）。
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { alignCommand, detectPackageManager, pmCommands } from './pm.ts';

const PROJECT_COMMANDS = new Set(['check', 'dev', 'build', 'render']);

const readJson = (file: string): Record<string, unknown> | null => {
  try {
    const v: unknown = JSON.parse(readFileSync(file, 'utf8'));
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

export function cliVersion(): string {
  const v = readJson(fileURLToPath(new URL('../package.json', import.meta.url)))?.version;
  return typeof v === 'string' ? v : '0.0.0';
}

/** 从 dir 起向上找 node_modules/<name>/package.json（Node 的包解析顺序）。 */
function findUp(dir: string, name: string): string | null {
  let cur = resolve(dir);
  for (;;) {
    const f = join(cur, 'node_modules', name, 'package.json');
    if (existsSync(f)) return f;
    const parent = dirname(cur);
    if (parent === cur) return null;
    cur = parent;
  }
}
function findPackageRoot(dir: string): string | null {
  let cur = resolve(dir);
  for (;;) {
    if (existsSync(join(cur, 'package.json'))) return cur;
    const parent = dirname(cur);
    if (parent === cur) return null;
    cur = parent;
  }
}

export function projectNotes(dir: string, command: string | undefined, opts: { cli?: string; env?: Record<string, string | undefined> } = {}): string[] {
  if (!command || !PROJECT_COMMANDS.has(command)) return [];
  const cli = opts.cli ?? cliVersion();
  const env = opts.env ?? process.env;
  const root = findPackageRoot(dir);
  const pm = detectPackageManager(env, root ?? undefined);
  const kitFile = findUp(dir, '@joplo/kit');
  if (kitFile) {
    const kit = readJson(kitFile)?.version;
    if (typeof kit !== 'string' || kit === cli) return [];
    return [`! 项目里的 @joplo/kit 是 ${kit}，当前 CLI 是 ${cli}，两者需要同一版本。要对齐：${alignCommand(pm, cli)}`];
  }
  const pkg = root ? readJson(join(root, 'package.json')) : null;
  const deps = { ...(pkg?.dependencies as object | undefined), ...(pkg?.devDependencies as object | undefined) };
  if (pkg && ('@joplo/kit' in deps || 'joplo' in deps)) return [`! 项目声明了 @joplo/kit，但还没有安装依赖，先运行：${pmCommands(pm).install}`];
  return [];
}
