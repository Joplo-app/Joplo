import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { expect, test } from 'vitest';
import { readCliVersion, skillFiles } from '../../packages/cli/src/skill.ts';

const root = resolve(import.meta.dirname, '../..');

/** 只解析 skills CLI 需要的 frontmatter：首行 ---，键: 值（单行纯量），再一行 ---。 */
function frontmatter(text: string): Record<string, string> {
  const lines = text.split('\n');
  expect(lines[0]).toBe('---');
  const end = lines.indexOf('---', 1);
  expect(end).toBeGreaterThan(1);
  const out: Record<string, string> = {};
  for (const line of lines.slice(1, end)) {
    const m = /^([a-z][a-z-]*): (.+)$/.exec(line);
    expect(m, line).not.toBeNull();
    out[m![1]!] = m![2]!;
  }
  return out;
}

test('skills/ 与生成结果逐字一致，且没有多余的技能目录（不一致时运行 pnpm skills:build）', async () => {
  const files = skillFiles(await readCliVersion(new URL('../../packages/cli/package.json', import.meta.url)));
  expect(files.map(f => f.name)).toEqual(['joplo', 'joplo-feedback']);
  for (const file of files) {
    const current = await readFile(join(root, 'skills', file.path)).catch(() => null);
    expect(current?.toString('utf8'), `skills/${file.path} is out of date; run pnpm skills:build`).toBe(file.content.toString('utf8'));
  }
  const dirs = (await readdir(join(root, 'skills'), { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name).sort();
  expect(dirs).toEqual(files.map(f => f.name).sort());
});

test.each(skillFiles('9.9.9').map(f => [f.name, f] as const))('%s 的 frontmatter 合法：name 小写加连字符且与目录同名，description 非空、单行、不超过 1024 字符', (name, file) => {
  const text = file.content.toString('utf8');
  const fm = frontmatter(text);
  expect(Object.keys(fm).sort()).toEqual(['description', 'name']);
  expect(fm.name).toBe(name);
  expect(fm.name).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  expect(fm.name!.length).toBeLessThanOrEqual(64);
  expect(file.path).toBe(`${fm.name}/SKILL.md`);
  expect(fm.description!.trim().length).toBeGreaterThan(0);
  expect(fm.description!.length).toBeLessThanOrEqual(1024);
  // YAML 纯量：不能含“: ”或“ #”，不能以引号或 YAML 指示符开头，否则需要引号
  expect(fm.description).not.toMatch(/: | #|^[-?:,[\]{}#&*!|>'"%@`]/);
  expect(text).toMatch(/\n<!-- joplo-skill 9\.9\.9 sha256:[a-f0-9]{64} -->\n$/);
});

test('joplo 的 description 覆盖中英文触发词，可在没有 joplo.config.ts 的仓库触发；正文先讲心智模型', () => {
  const [joplo, feedback] = skillFiles('1.0.0').map(f => f.content.toString('utf8'));
  const fm = frontmatter(joplo!);
  for (const word of ['prototype', 'interactive', 'clickable demo', 'A/B', 'product, design, or review', '功能原型', '可交互演示', '方案对比', '评审', 'without joplo.config.ts']) expect(fm.description, word).toContain(word);
  expect(fm.description!.split(/[.;]\s/).length, 'one sentence').toBe(1);
  const body = joplo!.slice(joplo!.indexOf('---', 3) + 4);
  expect(body.split('\n')[2]).toContain('player for pre-declared scenarios, not a free-form app prototype');
  for (const step of ['npx joplo@latest init', 'npm install', 'npx joplo skill authoring', 'happy path and one error-and-recovery', 'npx joplo check', 'npx joplo dev', 'npx joplo share']) expect(body, step).toContain(step);
  // Step order inside the Workflow section (Quick start above it shows the same commands in brief).
  const workflow = body.slice(body.indexOf('## Workflow'));
  const order = ['npx joplo@latest init', 'npx joplo skill authoring', 'error-and-recovery', 'npx joplo check', 'Extend to every option', 'board URL', 'npx joplo share'].map(s => workflow.indexOf(s));
  expect(order.every(i => i >= 0)).toBe(true);
  expect(order).toEqual([...order].sort((a, b) => a - b));
  const pitfalls = body.split('\n').filter(l => l.startsWith('- ') && l.includes('See npx joplo skill '));
  // 常见坑不设上限（用户要求：不为省 token 合并或删减坑）
  expect(pitfalls.length).toBeGreaterThanOrEqual(5);
  expect(body).toContain('npx joplo skill <topic>');
  const ffm = frontmatter(feedback!);
  for (const word of ['review', '评审']) expect(ffm.description).toContain(word);
  for (const s of ['npx joplo feedback --format json', 'pick', 'confirm_rule', "origin: 'user', status: 'confirmed'", 'reject_rule', "status: 'conflict' and ask the user", 'answer', 'delete the question', 'npx joplo check', 'npx joplo share --review', 'npx joplo feedback --applied', '--ref']) expect(feedback, s).toContain(s);
});
