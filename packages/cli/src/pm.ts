/**
 * 包管理器识别（init 结尾的下一步命令、版本对齐命令）。
 * 优先看 npm_config_user_agent（npx / pnpm dlx / yarn dlx / bunx 都会设置），其次看项目里的锁文件，缺省 npm。
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';
type Env = Record<string, string | undefined>;

const LOCKFILES: [string, PackageManager][] = [['pnpm-lock.yaml', 'pnpm'], ['yarn.lock', 'yarn'], ['bun.lock', 'bun'], ['bun.lockb', 'bun'], ['package-lock.json', 'npm']];

export function detectPackageManager(env: Env = process.env, projectDir?: string): PackageManager {
  const m = /^(npm|pnpm|yarn|bun)\//.exec(env.npm_config_user_agent ?? '');
  if (m) return m[1] as PackageManager;
  if (projectDir) for (const [file, pm] of LOCKFILES) if (existsSync(join(projectDir, file))) return pm;
  return 'npm';
}

export type PmCommands = { install: string; run: string; addDev: string };
const COMMANDS: Record<PackageManager, PmCommands> = {
  npm: { install: 'npm install', run: 'npx joplo', addDev: 'npm i -D' },
  pnpm: { install: 'pnpm install', run: 'pnpm joplo', addDev: 'pnpm add -D' },
  yarn: { install: 'yarn', run: 'yarn joplo', addDev: 'yarn add -D' },
  bun: { install: 'bun install', run: 'bunx joplo', addDev: 'bun add -d' },
};
export const pmCommands = (pm: PackageManager): PmCommands => COMMANDS[pm];

/** 对齐 joplo 与 @tokenroll/joplo-kit 到同一版本的命令。 */
export const alignCommand = (pm: PackageManager, version: string) => `${COMMANDS[pm].addDev} joplo@${version} @tokenroll/joplo-kit@${version}`;
