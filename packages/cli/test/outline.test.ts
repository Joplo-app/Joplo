/**
 * D67 `joplo outline` 与 D68 `joplo components`：
 * - outline 只读现有 IR（goal、roles、cases 的维度 / 优先级 / expected、覆盖、场景步数与估算时长），文字与 JSON 两种输出；
 * - 编译失败时退出码 1、给出错误数；--option 只看一个方案，写错报 USAGE（退出码 2）；
 * - components 不带名字时与 skill components 相同，带名字时输出属性、行为分组与示例。
 */
import { afterEach, expect, test } from 'vitest';
import { cp, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { COMPONENT_DOCS, skillTopic } from '@joplo-app/core';
import { runCli } from '../src/cli.ts';
import { approx } from '../src/outline.ts';

const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map(d => rm(d, { recursive: true, force: true }))); });
async function project(example = 'invite') {
  const base = await mkdtemp(join(tmpdir(), 'joplo-outline-')); dirs.push(base);
  await symlink(resolve('node_modules'), join(base, 'node_modules'));
  await writeFile(join(base, 'package.json'), JSON.stringify({ type: 'module' }));
  const d = join(base, 'project');
  await cp(`examples/${example}`, d, { recursive: true });
  return d;
}
async function run(args: string[]) {
  let out = '', err = '';
  const code = await runCli(args, { stdout: s => { out += s; }, stderr: s => { err += s; }, cliVersion: '0.2.7' });
  return { code, out, err };
}

test('文字大纲：给谁、解决什么、情况（expected 与各方案覆盖）、方案与场景的步数和估算时长、check 汇总', async () => {
  const d = await project();
  const r = await run(['outline', d]);
  expect(r.code).toBe(0);
  const lines = r.out.split('\n');
  expect(lines[0]).toMatch(/· 1 feature\(s\), 2 option\(s\), 6 scenario\(s\), ≈ \d+ (s|min)/);
  expect(r.out).toContain('## invite · 团队成员邀请   picked: a-modal');
  expect(r.out).toContain('Goal: 空间管理员邀请同事加入空间并指定权限，让新成员当天就能开始协作');
  expect(r.out).toContain('Roles: 空间管理员, 普通成员, 受邀者');
  expect(r.out).toMatch(/Cases \(A B: ✓ shown ✗ missing/);
  expect(r.out).toMatch(/ {2}no_permission +permission +high +✓ ✓ {2}非管理员尝试邀请 → 不能发起邀请，并看到原因/);
  expect(r.out).toMatch(/ {2}revoked +lifecycle +high +✓ ✗ {2}邀请被撤销后再次打开链接 → 说明邀请已失效/);
  expect(r.out).toMatch(/ {2}already_member +conflict +medium +\? ✗ {2}.* → \(expected result not written\)/);
  expect(r.out).toMatch(/A · a-modal · .* \(picked\): 4 scenario\(s\) ≈ \d+ (s|min)[^·]* · missing \d+ · undecided \d+/);
  expect(r.out).toMatch(/ {4}revoke +.*\d+ steps ≈ \d+ s +success · cases: revoked/);
  expect(r.out).toMatch(/ {4}denied +.*initial state only/);
  expect(r.out).toMatch(/ {4}success +.*\d+ steps ≈ \d+ s +success · cases: happy/);
  expect(lines.at(-2)).toMatch(/^check: 0 error, \d+ warning, \d+ info \(.*warning CASE_NOT_COVERED ×\d+/);
});

test('JSON 大纲与文字同一份数据；--option 只看一个方案', async () => {
  const d = await project();
  const r = await run(['outline', d, '--format', 'json', '--option', 'invite.b-batch']);
  expect(r.code).toBe(0);
  const j = JSON.parse(r.out);
  expect(j).toMatchObject({ ok: true, data: { summary: { error: 0 } } });
  const f = j.data.outline.features[0];
  expect(f.options.map((o: { id: string }) => o.id)).toEqual(['invite.b-batch']);
  expect(f.cases.find((c: { key: string }) => c.key === 'happy')).toMatchObject({ priority: 'high', dimension: 'main', expected: '管理员发出邀请，受邀者接受后成为成员', coverage: { 'invite.b-batch': expect.any(String) } });
  expect(f.options[0].scenarios[0]).toMatchObject({ id: expect.stringMatching(/^invite\.b-batch\./), steps: expect.any(Number), ms: expect.any(Number), opening: false, ending: false });
  const bad = await run(['outline', d, '--option', 'invite.zz']);
  expect(bad.code).toBe(2);
  expect(bad.out).toMatch(/^USAGE {2}Option does not exist: invite\.zz/);
});

test('有 error 时退出 1：能编译出 IR 时照常输出大纲并写出错误数；编译不出时只写错误数，JSON 是失败信封', async () => {
  const d = await project();
  await writeFile(join(d, 'features/invite/options/broken.tsx'), 'export default 1;\n');
  const r = await run(['outline', d]);
  expect(r.code).toBe(1);
  expect(r.out).toContain('## invite · 团队成员邀请');
  expect(r.out).toMatch(/check: [1-9]\d* error/);
  await writeFile(join(d, 'joplo.config.ts'), 'export default {;\n');
  const broken = await run(['outline', d]);
  expect(broken.code).toBe(1);
  expect(broken.out).toMatch(/did not compile \([1-9]\d* error\)/);
  const j = await run(['outline', d, '--format', 'json']);
  expect(j.code).toBe(1);
  expect(JSON.parse(j.out)).toMatchObject({ ok: false, error: { code: 'INVALID_SCHEMA' }, data: { outline: null } });
});

test('有过渡卡的项目：标出开场 / 收尾卡', async () => {
  const d = await project('camping');
  const r = await run(['outline', d]);
  expect(r.code).toBe(0);
  expect(r.out).toMatch(/opens with a card, ends with a card/);
});

test('approx：一分钟以内写秒，再长写分和秒；负数当 0', () => {
  expect(approx(0)).toBe('≈ 0 s');
  expect(approx(-5)).toBe('≈ 0 s');
  expect(approx(15_400)).toBe('≈ 15 s');
  expect(approx(60_000)).toBe('≈ 1 min');
  expect(approx(95_000)).toBe('≈ 1 min 35 s');
});

test('components：不带名字等于 skill components；带名字输出示例；未知名字报 USAGE', async () => {
  const all = await run(['components']);
  expect(all.code).toBe(0);
  expect(all.out).toBe(skillTopic('components', COMPONENT_DOCS));
  const two = await run(['components', 'EmptyState', 'datatable']);
  expect(two.code).toBe(0);
  expect(two.out).toContain('# ui:EmptyState');
  expect(two.out).toContain('# ui:DataTable');
  expect(two.out).toContain('selectedRecords={$.ui.selected}');
  const bad = await run(['components', 'Toastt']);
  expect(bad.code).toBe(2);
  expect(bad.out).toMatch(/^USAGE {2}Unknown component "Toastt"/);
});
