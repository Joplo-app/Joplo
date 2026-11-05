/**
 * 选择并运行 @tokenroll/joplo-cli（只在 Node ≥ 22 上载入）：
 *   1. 当前目录（向上）所在项目的 node_modules 里有 @tokenroll/joplo-cli → 用项目内的版本（项目内版本优先）。
 *      pnpm 布局下项目只直接依赖 joplo，就从 node_modules/joplo 的真实位置再找它的 @tokenroll/joplo-cli。
 *   2. 否则用本包自己依赖的 @tokenroll/joplo-cli。
 * 例外：init 总是用本包的版本——用户用 `npx joplo@<版本> init` 明确指定了要生成哪个版本的项目。
 *
 * 转发方式：读取所选 @tokenroll/joplo-cli 的 package.json 的 bin['joplo-cli']，用 import() 运行它（参数沿用 process.argv）。
 * @tokenroll/joplo-cli 的命令名故意不叫 joplo：否则 npm 安装时它会占掉 node_modules/.bin/joplo，绕过本入口。
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};

/** 从 dir 起向上找 node_modules/<name>/package.json。 */
function findUp(dir, name) {
  let cur = path.resolve(dir);
  for (;;) {
    const f = path.join(cur, 'node_modules', name, 'package.json');
    if (fs.existsSync(f)) return f;
    const parent = path.dirname(cur);
    if (parent === cur) return null;
    cur = parent;
  }
}

/** 读取一份 @tokenroll/joplo-cli；package.json 坏掉或没有 bin['joplo-cli'] 时返回 null。 */
function describeCli(pkgFile) {
  if (!pkgFile) return null;
  const pkg = readJson(pkgFile);
  if (!pkg || typeof pkg.version !== 'string') return null;
  const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin && typeof pkg.bin['joplo-cli'] === 'string' ? pkg.bin['joplo-cli'] : null;
  if (!bin) return null;
  const dir = fs.realpathSync(path.dirname(pkgFile));
  const file = path.resolve(dir, bin);
  if (!fs.existsSync(file)) return null;
  return { dir, version: pkg.version, bin: file };
}

/** 项目内的 @tokenroll/joplo-cli：先找直接安装的，再经由项目里的 joplo 包找。 */
function localCli(cwd) {
  const direct = describeCli(findUp(cwd, '@tokenroll/joplo-cli'));
  if (direct) return direct;
  const joplo = findUp(cwd, 'joplo');
  if (!joplo) return null;
  return describeCli(findUp(fs.realpathSync(path.dirname(joplo)), '@tokenroll/joplo-cli'));
}

function packageManager(env) {
  const name = /^(npm|pnpm|yarn|bun)\//.exec(String(env.npm_config_user_agent || ''));
  return name ? name[1] : 'npm';
}
const ADD_DEV = { npm: 'npm i -D', pnpm: 'pnpm add -D', yarn: 'yarn add -D', bun: 'bun add -d' };

/**
 * 决定用哪份 CLI。selfDir 是本包（joplo）的目录。
 * 返回 { dir, version, bin, local, notes }；哪里都找不到时返回 null。notes 写到 stderr。
 */
function pickCli({ cwd, selfDir, argv, env }) {
  const own = describeCli(findUp(selfDir, '@tokenroll/joplo-cli'));
  const command = argv[0];
  const local = command === 'init' ? null : localCli(cwd);
  const notes = [];
  if (local) {
    const same = own && own.dir === local.dir;
    if (!same && own && own.version !== local.version)
      notes.push(
        `! 已改用项目内的 joplo ${local.version} 执行（npx 拉到的是 ${own.version}）。` +
          `要升级：${ADD_DEV[packageManager(env)]} joplo@${own.version} @tokenroll/joplo-kit@${own.version}`,
      );
    if (command === 'dev') {
      const kit = readJson(findUp(cwd, '@tokenroll/joplo-kit') || '');
      notes.push(`[joplo] 使用项目内的 joplo ${local.version}（@tokenroll/joplo-kit ${kit && kit.version ? kit.version : '未安装'}）`);
    }
    return { ...local, local: true, notes };
  }
  if (!own) return null;
  return { ...own, local: false, notes };
}

async function main() {
  const choice = pickCli({ cwd: process.cwd(), selfDir: path.resolve(__dirname, '..'), argv: process.argv.slice(2), env: process.env });
  if (!choice) {
    process.stderr.write('✗ 找不到 @tokenroll/joplo-cli。请重新安装：npm i -D joplo，或运行 npx joplo@latest\n');
    process.exitCode = 1;
    return;
  }
  for (const n of choice.notes) process.stderr.write(n + '\n');
  await import(pathToFileURL(choice.bin).href);
}

module.exports = { main, pickCli, findUp };
