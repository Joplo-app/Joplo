import { afterEach, expect, test } from 'vitest';
import { spawn } from 'node:child_process';
import { cp, mkdtemp, readFile, writeFile, mkdir, rm, symlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import type { Selection } from '@joplo-app/core';
const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map(d => rm(d, { recursive: true, force: true }))); });
async function temp(copy = true) {
  const base = await mkdtemp(join(tmpdir(), 'joplo-cli-')); dirs.push(base);
  await symlink(resolve('node_modules'), join(base, 'node_modules'));
  await writeFile(join(base, 'package.json'), JSON.stringify({ type: 'module' }));
  const d = join(base, 'project');
  // 样板可能已在本地看板或云端使用过；测试副本不继承运行时状态、依赖或构建产物。
  if (copy) await cp('examples/invite', d, { recursive: true, filter: (src) => !/[/\\](dist|node_modules|\.joplo)([/\\]|$)/.test(src) });
  else await mkdir(d);
  return d;
}
function cli(args: string[], cwd = process.cwd()) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((res, rej) => {
    const p = spawn(process.execPath, ['--import', 'tsx', resolve('packages/cli/src/bin.ts'), ...args], { cwd });
    let stdout = '', stderr = '';
    p.stdout.on('data', x => stdout += x); p.stderr.on('data', x => stderr += x);
    p.on('error', rej); p.on('close', code => res({ code, stdout, stderr }));
  });
}
const option = 'features/invite/options/a-modal.tsx';
const feature = 'features/invite/feature.ts';
async function edit(dir: string, file: string, change: (s: string) => string) {
  const path = join(dir, file); const text = change(await readFile(path, 'utf8')); await writeFile(path, text); return text;
}
function at(text: string, needle: string) { return text.slice(0, text.indexOf(needle)).split('\n').length; }
test('原样 check、缺省目录、text 和 DomainResult JSON 输出', async () => {
  const d = await temp();
  const r = await cli(['check'], d);
  expect(r.code).toBe(0); expect(r.stderr).toBe(''); expect(r.stdout).toMatch(/0 error/);
  expect(r.stdout).toMatch(/features\/invite\/options\/a-modal\.tsx:\d+:\d+  info  PENDING_AI_ASSUMPTION/);
  const json = await cli(['check', d, '--format', 'json', '--option', 'invite.a-modal']);
  expect(json.code).toBe(0);
  expect(JSON.parse(json.stdout)).toMatchObject({ ok: true, data: { summary: { error: 0 }, verification: { 'invite.a-modal': 'replay_ok' } } });
  expect(Object.keys(JSON.parse(json.stdout).data.verification)).toEqual(['invite.a-modal']);
});
test.each([
  ['UNKNOWN_COMPONENT', option, (s: string) => s.replace('export default option', 'const Bogus = "Bogus";\nexport default option').replace('<Button id="btn_invite"', '<Bogus id="btn_invite"').replace('邀请成员\n        </Button>', '邀请成员\n        </Bogus>'), '<Bogus', 1],
  ['MISSING_ID', option, (s: string) => s.replace('id="btn_invite" ', ''), '<Button disabled=', 1],
  ['FUNCTION_PROP', option, (s: string) => s.replace('<Button id="btn_invite"', '<Button onClick={() => {}} id="btn_invite"'), '<Button onClick=', 1],
  ['UNKNOWN_CASE', option, (s: string) => s.replace("cases: ['no_permission']", "cases: ['absent']"), "denied: flow(", 1],
  ['ASSUMPTION_CONFIRMED', feature, (s: string) => s.replace("origin: 'user', status: 'confirmed'", "status: 'confirmed'"), "admin_only: rule(", 1],
  ['UNBOUND_INTERACTIVE', option, (s: string) => s.replace('<Group justify="flex-end" gap="sm">', '<Group justify="flex-end" gap="sm">\n              <Button id="loose">新按钮</Button>'), '<Button id="loose"', 0],
  ['UNKNOWN_SLOT', option, (s: string) => s.replace("'header.actions':", "'absent':"), 'export default option(', 1],
  ['CASE_NOT_COVERED', feature, (s: string) => s.replace('cases: {', "cases: {\n    new_case: '新增情况',"), 'export default feature(', 0],
] as const)('%s 包含正确文件及行号', async (code, file, change, needle, exit) => {
  const d = await temp(); const text = await edit(d, file, change);
  const r = await cli(['check', d, '--format', 'json', '--option', 'invite.a-modal']);
  expect(r.code, r.stdout + r.stderr).toBe(exit);
  const ds = JSON.parse(r.stdout).diagnostics;
  const expectedFile = code === 'CASE_NOT_COVERED' ? option : file;
  const line = code === 'CASE_NOT_COVERED' ? at(await readFile(join(d, option), 'utf8'), 'export default option(') : at(text, needle);
  expect(ds, r.stdout).toEqual(expect.arrayContaining([expect.objectContaining({ code, at: expect.stringMatching(new RegExp(`^${expectedFile}:${line}:`)) })]));
});
test.each(['NaN', 'Infinity', "'1'"])('check 拒绝非法 order %s 并定位到 feature.ts', async (value) => {
  const d = await temp();
  const text = await edit(d, feature, s => s.replace('export default feature({', `export default feature({ order: ${value},`));
  const r = await cli(['check', d, '--format', 'json']);
  expect(r.code, r.stdout + r.stderr).toBe(1);
  expect(JSON.parse(r.stdout).diagnostics).toContainEqual(expect.objectContaining({
    code: 'FEATURE_ORDER_INVALID', severity: 'error',
    at: expect.stringMatching(new RegExp(`^${feature}:${at(text, 'export default feature(')}:`)),
  }));
});
test('selection 返回定位、标签与前后各三行，JSON 保留 Selection', async () => {
  const d = await temp(); const text = await readFile(join(d, option), 'utf8'); const line = at(text, '<Button id="btn_invite"');
  const selection: Selection = { featureId: 'invite', optionId: 'invite.a-modal', scenarioId: null, position: 0, stepId: null, sceneId: 'invite.a-modal@/members', route: '/members', nodeId: 'btn_invite', at: `${option}:${line}:9`, label: '邀请成员', selectedAt: new Date().toISOString() };
  await mkdir(join(d, '.joplo')); await writeFile(join(d, '.joplo/selection.json'), JSON.stringify(selection));
  const r = await cli(['selection', d]);
  expect(r.code).toBe(0); expect(r.stdout).toContain(selection.at); expect(r.stdout).toContain('邀请成员');
  for (let n = line - 3; n <= line + 3; n++) expect(r.stdout).toContain(`${n} | ${text.split('\n')[n - 1]}`);
  const j = JSON.parse((await cli(['selection', d, '--format', 'json'])).stdout);
  expect(j.data.selection).toEqual(selection); expect(j.data.lines).toHaveLength(7);
});
test('selection 文件不存在、null、无 at 均受控', async () => {
  const d = await temp();
  expect((await cli(['selection', d])).stdout).toContain('Nothing selected');
  await mkdir(join(d, '.joplo')); await writeFile(join(d, '.joplo/selection.json'), 'null');
  const r = await cli(['selection', d]); expect(r.code).toBe(0); expect(r.stdout).toContain('Nothing selected');
  await writeFile(join(d, '.joplo/selection.json'), '{"at":null,"label":"画面"}');
  expect((await cli(['selection', d])).code).toBe(0);
});
test('init 后立即 check 通过，非空目录拒绝且保留内容', async () => {
  const d = await temp(false); const target = join(d, 'new');
  expect((await cli(['init', target, '--name', '最小项目'])).code).toBe(0);
  expect((await cli(['check', target])).code).toBe(0);
  const example = await readFile(join(target, 'features/example/options/a.tsx'), 'utf8');
  expect(example).toContain(".click('start', 'Click Start', done('Completed'))");
  expect(example).not.toMatch(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u);
  expect(JSON.parse(await readFile(join(target, 'tsconfig.json'), 'utf8')).compilerOptions).toMatchObject({ jsx: 'react-jsxdev', jsxImportSource: '@joplo-app/kit', allowImportingTsExtensions: true });
  expect((await cli(['init', target])).code).toBe(1);
  expect(await readFile(join(target, '.gitignore'), 'utf8')).toContain('.joplo/');
  expect(await readFile(join(target, '.gitignore'), 'utf8')).toContain('exports/');
});
test('init 缺省名称，engine skill 与 help 主输出走 stdout', async () => {
  const d = await temp(false); expect((await cli(['init', d])).code).toBe(0);
  const r = await cli(['skill','authoring']); expect(r.code).toBe(0); expect(r.stderr).toBe('');

  for (const word of ['flow', 'selection', 'check', 'pick']) expect(r.stdout).toContain(word);
  const h = await cli(['--help']); expect(h.stdout).toContain('check'); expect(h.stderr).toBe('');
});
test.each([
  ['check', '--format', 'xml'], ['check', '--option', 'absent'], ['dev', '--port', '0'], ['dev', '--port', 'abc'],
  ['render', '--scenario-id', 's', '--out', 'a.png', '--width', '100'],
  ['render', '--scenario-id', 's', '--out', 'a.png', '--scale', '0'],
  ['render', '--scenario-id', 's', '--out', 'a.png', '--width', '-1', '--height', '100'],
  ['build', '--wat'], ['init','--wat'], ['apply'], ['get'], ['history'], ['restore'], ['mcp'], ['serve'], ['validate'],
])('用法错误退出 2：%j', async (...args) => {
  const d = await temp(); const r = await cli([args[0]!, ...(args[0] === 'check' ? [d] : []), ...args.slice(1)]);
  expect(r.code, r.stdout + r.stderr).toBe(2);
});

test.each([['true', 'true'], ['false', 'false'], ["'code' as any", '"code"']])('when={%s} 普通值：一条 INVALID_CONDITION，指向作者源码行，合并多处画面并计 1 条', async (value, shown) => {
  const d = await temp();
  const text = await edit(d, option, s => s.replace('<Alert id="alert_denied" color="gray" when={not($.ui.isAdmin)}>', `<Alert id="alert_denied" color="gray" when={${value}}>`));
  const line = at(text, '<Alert id="alert_denied"');
  const r = await cli(['check', d, '--format', 'json']);
  expect(r.code, r.stdout).toBe(1);
  const out = JSON.parse(r.stdout);
  const ds = out.diagnostics.filter((x: { code: string }) => x.code === 'INVALID_CONDITION' || x.code === 'INVALID_SCHEMA');
  expect(ds, r.stdout).toHaveLength(1);
  const [diag] = ds;
  expect(diag).toMatchObject({ severity: 'error', code: 'INVALID_CONDITION', source: 'schema', at: expect.stringMatching(new RegExp(`^${option}:${line}:`)) });
  expect(diag.message).toContain(`when received a plain`);
  expect(diag.message).toContain(shown);
  expect(diag.message).toContain("eq($.ui.mode, 'code')");
  expect(diag.message).toMatch(/\(affects 2 views\)$/);
  expect(diag.affects).toHaveLength(2);
  expect(out.data.summary.error).toBe(1);
  const text2 = await cli(['check', d]);
  expect(text2.stdout).toMatch(new RegExp(`^${option}:${line}:\\d+  error  INVALID_CONDITION  <ui:Alert> when received a plain`, 'm'));
  expect(text2.stdout).not.toContain('joplo.config.ts:1:1');
  expect(text2.stdout).toMatch(/^1 error, /m);
});
test('其他结构错误也指向作者元素并合并（不是 joplo.config.ts:1:1）', async () => {
  const d = await temp();
  const text = await edit(d, option, s => s.replace('<Alert id="alert_denied" color="gray" when={not($.ui.isAdmin)}>', '<Alert id="alert_denied" color="gray" when={{ truthy: 1 } as any}>'));
  const line = at(text, '<Alert id="alert_denied"');
  const r = await cli(['check', d, '--format', 'json']);
  const ds = JSON.parse(r.stdout).diagnostics.filter((x: { code: string }) => x.code === 'INVALID_SCHEMA');
  expect(ds.length, r.stdout).toBeGreaterThanOrEqual(1);
  for (const x of ds) { expect(x.at).toMatch(new RegExp(`^${option}:${line}:`)); expect(x.message).toMatch(/^<ui:Alert> when/); }
  expect(new Set(ds.map((x: { message: string }) => x.message)).size).toBe(ds.length);
});
