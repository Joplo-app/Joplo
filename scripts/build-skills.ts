/**
 * 生成仓库根目录的官方 Agent 技能 skills/<名字>/SKILL.md（D64；`npx skills add Joplo-app/Joplo` 读取这里）。
 * 内容与 `joplo skill install` 写进项目的技能逐字相同（同一个 skillFiles），版本取 packages/cli/package.json。
 *
 *   pnpm skills:build              重新生成
 *   pnpm skills:build --check      只比较，不一致时退出 1（scripts/test/skills.test.ts 做同样的检查）
 *   pnpm skills:build --root <dir> 对另一个仓库目录生成（release:version 用）
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readCliVersion, skillFiles } from '../packages/cli/src/skill.ts';

const args = process.argv.slice(2);
const at = args.indexOf('--root');
const root = resolve(at >= 0 && args[at + 1] ? args[at + 1]! : join(import.meta.dirname, '..'));
const check = args.includes('--check');
const version = await readCliVersion(pathToFileURL(join(root, 'packages/cli/package.json')));
let stale = 0;
for (const file of skillFiles(version)) {
  const path = join(root, 'skills', file.path);
  const current = await readFile(path).catch(() => null);
  if (current?.equals(file.content)) continue;
  stale++;
  if (check) { console.error(`skills/${file.path} is out of date; run pnpm skills:build`); continue; }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, file.content);
  console.log(`Wrote skills/${file.path} (${version})`);
}
if (check && stale) process.exit(1);
if (!stale) console.log(`skills/ is up to date (${version})`);
