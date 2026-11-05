#!/usr/bin/env -S tsx
/**
 * @joplo/cli 的命令入口。通常经由 `joplo` 包（packages/joplo）转发到这里；也可以直接运行。
 * 先检查 Node 版本再载入其余模块（发布构建会把 shebang 改为 node）。
 */
const major = Number(/^(\d+)\./.exec(process.versions.node)?.[1] ?? 0);
if (major < 22) {
  process.stderr.write(`✗ Joplo 需要 Node.js 22 或更高版本，当前是 ${process.versions.node}。\n  升级：nvm install 22，或从 https://nodejs.org 下载。\n`);
  process.exit(1);
}
const { runCli } = await import('./cli.ts');
process.exitCode = await runCli(process.argv.slice(2));
export {};
