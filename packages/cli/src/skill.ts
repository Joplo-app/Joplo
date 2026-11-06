import { createHash } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { agentsBlock, agentSkills, JoploError, skillMarkdown } from '@joplo-app/core';

const SKILL_DIR = '.claude/skills';
const START = '<!-- joplo:start -->';
const END = '<!-- joplo:end -->';
export type InstallSkillOptions = { force?: boolean; diff?: boolean; agentsMd?: boolean };

/** 每次运行从当前 CLI 的包元数据读取，不另存一份版本常量。 */
export async function readCliVersion(file = new URL('../package.json', import.meta.url)): Promise<string> {
  const metadata: unknown = JSON.parse(await readFile(file, 'utf8'));
  if (!metadata || typeof metadata !== 'object' || !('version' in metadata) || typeof metadata.version !== 'string' || !metadata.version.trim()) throw new JoploError('INVALID_SCHEMA', 'Cannot read the version from @joplo-app/cli package.json');
  return metadata.version;
}

/**
 * 官方技能（仓库 skills/）与 `skill install` 写进项目的技能共用这一份输出（D64）：
 * 正文来自 core 的 agent-skill.ts，末尾加 `<!-- joplo-skill <版本> sha256:<正文哈希> -->`。
 * 哈希让安装器分辨“没改过的旧生成内容”（可自动更新）与“用户改过”（需 --force）。
 */
export function skillFiles(version: string): { name: string; path: string; content: Buffer }[] {
  return agentSkills().map(skill => {
    const body = Buffer.from(skillMarkdown(skill));
    return { name: skill.name, path: `${skill.name}/SKILL.md`, content: Buffer.concat([body, Buffer.from(`<!-- joplo-skill ${version} sha256:${hash(body)} -->\n`)]) };
  });
}
const hash = (body: Buffer) => createHash('sha256').update(body).digest('hex');
const MARKER = /<!-- joplo-skill ([^\s]+) sha256:([a-f0-9]{64}) -->\n$/;
function untouched(content: Buffer): boolean {
  const text = content.toString('utf8');
  const marker = MARKER.exec(text);
  if (!marker || marker.index === 0 || text[marker.index - 1] !== '\n') return false;
  const offset = content.length - Buffer.byteLength(text.slice(marker.index));
  return hash(content.subarray(0, offset)) === marker[2];
}
/** 文件末尾版本标记里的版本（没有标记时为 null）。 */
const markerVersion = (content: Buffer | null) => (content ? MARKER.exec(content.toString('utf8'))?.[1] ?? null : null);
async function optionalFile(path: string): Promise<Buffer | null> {
  try { return await readFile(path); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null; throw e; }
}

function agentsContent(current: Buffer | null): Buffer {
  const block = Buffer.from(`${START}\n${agentsBlock()}\n${END}`);
  if (current === null) return Buffer.concat([block, Buffer.from('\n')]);
  const start = current.indexOf(START), end = current.indexOf(END);
  if (start === -1 && end === -1) return Buffer.concat([current, Buffer.from(current.length ? current.at(-1) === 10 ? '\n' : '\n\n' : ''), block, Buffer.from('\n')]);
  if (start < 0 || end < start || current.indexOf(START, start + START.length) !== -1 || current.indexOf(END, end + END.length) !== -1) throw new JoploError('UNSUPPORTED_ACTION', 'AGENTS.md has unpaired or duplicate joplo:start/end markers; fix them first. No files were written');
  // Buffer 切片保留托管段之外的原始字节，包括 BOM、CRLF、非 UTF-8 内容。
  return Buffer.concat([current.subarray(0, start), block, current.subarray(end + Buffer.byteLength(END))]);
}

export async function installSkill(dir: string, version: string, options: InstallSkillOptions = {}): Promise<{ code: number; output: string }> {
  const root = resolve(dir);
  const lines: string[] = [];
  try { await access(join(root, 'joplo.config.ts')); }
  catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    lines.push('Warning: No joplo.config.ts in this directory; installing the Joplo skills anyway.');
  }
  const skills = await Promise.all(skillFiles(version).map(async file => {
    const name = `${SKILL_DIR}/${file.path}`, path = join(root, name);
    return { name, path, current: await optionalFile(path), next: file.content, skill: true };
  }));
  // 用户修改保护先于所有写入：任何一个技能被改过都不写任何文件（AGENTS.md 也不会被部分更新）。
  const modified = skills.filter(file => file.current !== null && !untouched(file.current));
  if (!options.diff && !options.force && modified.length) return {
    code: 1,
    output: [
      ...lines,
      ...modified.map(file => `${file.name} exists and has been modified${markerVersion(file.current) ? ` since Joplo ${markerVersion(file.current)} wrote it` : ''}; it was not overwritten.`),
      `View the diff first: npx joplo skill install ${displayDir(dir)}--diff`,
      `Then overwrite: npx joplo skill install ${displayDir(dir)}--force`,
      '',
    ].join('\n'),
  };
  const agentsPath = join(root, 'AGENTS.md');
  const agents = await optionalFile(agentsPath);
  const planned = [...skills];
  if (agents !== null || options.agentsMd) planned.push({ name: 'AGENTS.md', path: agentsPath, current: agents, next: agentsContent(agents), skill: false });
  const changed = planned.filter(file => file.current === null || !file.current.equals(file.next));
  if (options.diff) {
    for (const file of changed) lines.push(unifiedDiff(file.name, file.current, file.next));
    if (!changed.length) lines.push('Already up to date');
  } else {
    // 再读一次以避免覆盖计划阶段之后发生的编辑；diff 路径完全不创建目录。
    for (const file of changed) {
      const latest = await optionalFile(file.path);
      if (file.current === null ? latest !== null : latest === null || !file.current.equals(latest)) throw new JoploError('UNSUPPORTED_ACTION', `${file.name} changed during installation; it was not overwritten. Run again to view the diff`);
    }
    for (const file of changed) {
      await mkdir(dirname(file.path), { recursive: true });
      await writeFile(file.path, file.next, { flag: file.current === null ? 'wx' : 'w' });
      const from = file.skill ? markerVersion(file.current) : null;
      const what = file.skill ? 'Joplo skill; details come from npx joplo skill <topic>' : 'Joplo managed block only';
      lines.push(`Wrote ${file.name} (${what})${from && from !== version ? `, updated from ${from} to ${version}` : ''}`);
    }
    if (!changed.length) lines.push('Already up to date');
    else lines.push(`Tip: Commit ${SKILL_DIR}/joplo*/SKILL.md to Git so agents can discover them.`);
  }
  return { code: 0, output: lines.join('\n') + '\n' };
}
function displayDir(dir: string): string {
  return dir === '.' ? '' : "'" + dir.replace(/'/g, "'\\''") + "' ";
}

/** 单个连续 hunk，保留前后 3 行上下文；不依赖 Git/diff，不输出颜色。 */
function unifiedDiff(name: string, before: Buffer | null, after: Buffer): string {
  const split = (buffer: Buffer | null) => {
    const text = buffer?.toString('utf8') ?? '';
    const lines = text ? text.split('\n') : [];
    const newline = text.endsWith('\n');
    if (newline) lines.pop();
    return { lines, newline };
  };
  const a = split(before), b = split(after);
  const equal = (i: number, j: number) => a.lines[i] === b.lines[j] && (i !== a.lines.length - 1 && j !== b.lines.length - 1 || a.newline === b.newline);
  let prefix = 0;
  while (prefix < Math.min(a.lines.length, b.lines.length) && equal(prefix, prefix)) prefix++;
  let suffix = 0;
  while (suffix < Math.min(a.lines.length, b.lines.length) - prefix && equal(a.lines.length - suffix - 1, b.lines.length - suffix - 1)) suffix++;
  const start = Math.max(0, prefix - 3);
  const aEnd = a.lines.length - Math.max(0, suffix - 3), bEnd = b.lines.length - Math.max(0, suffix - 3);
  const range = (length: number) => `${length ? start + 1 : start},${length}`;
  const output = [`--- ${before === null ? '/dev/null' : `a/${name}`}`, `+++ b/${name}`, `@@ -${range(aEnd - start)} +${range(bEnd - start)} @@`];
  const append = (sign: string, lines: string[], i: number, newline: boolean) => {
    output.push(sign + lines[i]);
    if (i === lines.length - 1 && !newline) output.push('\\ No newline at end of file');
  };
  for (let i = start; i < prefix; i++) append(' ', a.lines, i, a.newline);
  for (let i = prefix; i < a.lines.length - suffix; i++) append('-', a.lines, i, a.newline);
  for (let i = prefix; i < b.lines.length - suffix; i++) append('+', b.lines, i, b.newline);
  for (let i = a.lines.length - suffix; i < aEnd; i++) append(' ', a.lines, i, a.newline);
  return output.join('\n') + '\n';
}
