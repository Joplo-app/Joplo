import { afterEach, expect, test, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { runCli } from '../src/cli.ts';
import { readCliVersion } from '../src/skill.ts';

const serverImports = vi.hoisted(() => vi.fn());
vi.mock('@joplo-app/server', () => { serverImports(); throw Error('读取主题时不应导入服务端模块'); });
const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });
async function temp(project = true) {
  const dir = await mkdtemp(join(tmpdir(), 'joplo-skill-test-')); dirs.push(dir);
  if (project) await writeFile(join(dir, 'joplo.config.ts'), '// 测试安装不执行作者代码\n');
  return dir;
}
const skillPath = (dir: string) => join(dir, '.claude/skills/joplo/SKILL.md');
async function run(args: string[]) {
  let stdout = '', stderr = '';
  const loadServer = vi.fn(async () => { throw Error('不应载入服务端'); });
  const code = await runCli(args, { stdout: s => { stdout += s; }, stderr: s => { stderr += s; }, loadServer });
  expect(stderr).toBe(''); expect(stdout).not.toMatch(/\x1b\[/); expect(loadServer).not.toHaveBeenCalled();
  return { code, stdout };
}
test('列表版本取自 CLI package.json；主题、guide 均不加载 server', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const r = await run(['skill']); expect(r.code).toBe(0);
  expect(r.stdout.split('\n')[0]).toBe(`Joplo ${pkg.version} · Agent usage (read on demand)`);
  for (const name of ['authoring', 'demo', 'components', 'cases', 'check', 'selection', 'publish']) {
    const topic = await run(['skill', name]); expect(topic.code).toBe(0);
    expect(topic.stdout.trimEnd().split('\n').length).toBeLessThan(150);
    expect(topic.stdout.trimEnd().split('\n').at(-1)).toMatch(/^Related topics: /);
  }
  expect((await run(['guide'])).stdout).toBe((await run(['skill', 'authoring'])).stdout);
});
test('版本读取支持升级后的 package.json，不写死', async () => {
  const dir = await temp(); const file = join(dir, 'package.json');
  await writeFile(file, '{"version":"7.6.5-beta.2"}');
  expect(await readCliVersion(pathToFileURL(file))).toBe('7.6.5-beta.2');
});
test.each([['authring', 'authoring'], ['componets', 'components'], ['selction', 'selection'], ['publsh', 'publish'], ['CHECK', 'check']])('未知主题 %s 给出最近的 %s，退出 2', async (input, suggestion) => {
  const r = await run(['skill', input]); expect(r.code).toBe(2); expect(r.stdout).toContain(suggestion); expect(r.stdout).toContain('npx joplo skill');
});
test('安装短指针、真实哈希，重复运行字节和 mtime 均不变', async () => {
  const dir = await temp(); const r = await run(['skill', 'install', dir]); expect(r.code).toBe(0);
  const content = await readFile(skillPath(dir), 'utf8');
  expect(content.trimEnd().split('\n').length).toBeLessThanOrEqual(20);
  expect(content).toContain('name: joplo');
  expect(content).toContain('description: Use to design feature prototypes, options, and demos in Joplo projects (with joplo.config.ts)');
  expect(content).toContain('npx joplo skill demo'); expect(content).toContain('npx joplo skill authoring'); expect(content).toContain('npx joplo check'); expect(content).toContain('npx joplo selection');
  const match = /<!-- joplo-skill ([^ ]+) sha256:([a-f0-9]{64}) -->\n$/.exec(content)!;
  expect(match).not.toBeNull(); expect(match[1]).toBe(await readCliVersion());
  expect(match[2]).toBe(createHash('sha256').update(content.slice(0, match.index)).digest('hex'));
  const before = await stat(skillPath(dir));
  const second = await run(['skill', 'install', dir]); expect(second.code).toBe(0); expect(second.stdout).toContain('Already up to date');
  expect(await readFile(skillPath(dir), 'utf8')).toBe(content); expect((await stat(skillPath(dir))).mtimeMs).toBe(before.mtimeMs);
  await expect(stat(join(dir, 'AGENTS.md'))).rejects.toMatchObject({ code: 'ENOENT' });
});
test.each(['正文修改', 'frontmatter', '末尾追加', '无标记'])('用户改过的 %s 永不自动覆盖，--force 才覆盖', async kind => {
  const dir = await temp(); await run(['skill', 'install', dir]);
  const original = await readFile(skillPath(dir), 'utf8');
  const modified = kind === '正文修改' ? original.replace('npx joplo check', 'npx joplo check --option mine.a') : kind === 'frontmatter' ? original.replace('name: joplo', 'name: mine') : kind === '末尾追加' ? original + '用户追加\n' : '# 我的文件\n';
  await writeFile(skillPath(dir), modified); await writeFile(join(dir, 'AGENTS.md'), '用户说明\n');
  const r = await run(['skill', 'install', dir]); expect(r.code).toBe(1); expect(r.stdout).toContain('--diff'); expect(r.stdout).toContain('--force');
  expect(await readFile(skillPath(dir), 'utf8')).toBe(modified); expect(await readFile(join(dir, 'AGENTS.md'), 'utf8')).toBe('用户说明\n');
  const forced = await run(['skill', 'install', dir, '--force']); expect(forced.code).toBe(0); expect(await readFile(skillPath(dir), 'utf8')).toBe(original);
});
test('未修改的旧生成内容可自动升级', async () => {
  const dir = await temp(); await mkdir(join(dir, '.claude/skills/joplo'), { recursive: true });
  const body = '---\nname: joplo\ndescription: 旧版入口\n---\n旧内容\n';
  await writeFile(skillPath(dir), body + `<!-- joplo-skill old-version sha256:${createHash('sha256').update(body).digest('hex')} -->\n`);
  expect((await run(['skill', 'install', dir])).code).toBe(0);
  expect(await readFile(skillPath(dir), 'utf8')).not.toContain('旧内容');
});
test('--diff 输出 unified diff，既不改文件也不改变目录', async () => {
  const dir = await temp(); await run(['skill', 'install', dir]);
  const modified = '# 我的技能（无结尾换行）'; await writeFile(skillPath(dir), modified);
  const before = await stat(skillPath(dir)); const r = await run(['skill', 'install', dir, '--diff', '--force']);
  expect(r.code).toBe(0); expect(r.stdout).toContain('--- a/.claude/skills/joplo/SKILL.md\n+++ b/.claude/skills/joplo/SKILL.md\n@@');
  expect(r.stdout).toContain('-# 我的技能'); expect(r.stdout).toContain('+name: joplo'); expect(r.stdout).toContain('\\ No newline at end of file');
  expect(await readFile(skillPath(dir), 'utf8')).toBe(modified); expect((await stat(skillPath(dir))).mtimeMs).toBe(before.mtimeMs);
  const empty = await temp(); const preview = await run(['skill', 'install', empty, '--diff', '--agents-md']);
  expect(preview.stdout).toContain('--- /dev/null'); await expect(stat(join(empty, '.claude'))).rejects.toMatchObject({ code: 'ENOENT' });
  await expect(stat(join(empty, 'AGENTS.md'))).rejects.toMatchObject({ code: 'ENOENT' });
});
test('AGENTS.md 仅替换托管段；保留段外 BOM、CRLF、非 UTF-8 字节，不重复追加', async () => {
  const dir = await temp();
  const prefix = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf, 0xff]), Buffer.from('# 用户\r\n原始说明\r\n')]);
  const suffix = Buffer.from('\r\n\r\n后续说明（无换行）');
  await writeFile(join(dir, 'AGENTS.md'), Buffer.concat([prefix, Buffer.from('<!-- joplo:start -->\r\n旧段落\r\n<!-- joplo:end -->'), suffix]));
  expect((await run(['skill', 'install', dir])).code).toBe(0);
  const content = await readFile(join(dir, 'AGENTS.md'));
  expect(content.subarray(0, prefix.length)).toEqual(prefix); expect(content.subarray(-suffix.length)).toEqual(suffix);
  expect(content.toString()).toContain('npx joplo skill demo'); expect(content.toString()).toContain('npx joplo skill'); expect(content.toString().match(/<!-- joplo:start -->/g)).toHaveLength(1);
  const again = await run(['skill', 'install', dir]); expect(again.stdout).toContain('Already up to date'); expect(await readFile(join(dir, 'AGENTS.md'))).toEqual(content);
});
test('已有 AGENTS 无托管段时追加且保留前缀，显式 agents-md 可新建', async () => {
  const dir = await temp(); const original = '用户已有规则（没有尾换行）'; await writeFile(join(dir, 'AGENTS.md'), original);
  expect((await run(['skill', 'install', dir])).code).toBe(0);
  expect((await readFile(join(dir, 'AGENTS.md'), 'utf8')).startsWith(original)).toBe(true);
  const other = await temp(); expect((await run(['skill', 'install', other, '--agents-md'])).code).toBe(0);
  expect(await readFile(join(other, 'AGENTS.md'), 'utf8')).toContain('<!-- joplo:end -->');
});
test.each(['<!-- joplo:start -->', '<!-- joplo:end -->', '<!-- joplo:start --><!-- joplo:end --><!-- joplo:start --><!-- joplo:end -->'])('AGENTS 标记损坏时不写任何文件：%s', async content => {
  const dir = await temp(); await writeFile(join(dir, 'AGENTS.md'), content);
  const r = await run(['skill', 'install', dir]); expect(r.code).toBe(1); expect(r.stdout).toContain('AGENTS.md');
  expect(await readFile(join(dir, 'AGENTS.md'), 'utf8')).toBe(content);
  await expect(stat(skillPath(dir))).rejects.toMatchObject({ code: 'ENOENT' });
});
test('无项目配置时只警告并成功安装；路径含空格', async () => {
  const parent = await temp(false); const dir = join(parent, '含 空格');
  const r = await run(['skill', 'install', dir]); expect(r.code).toBe(0); expect(r.stdout).toContain('Warning'); expect(r.stdout).toContain('joplo.config.ts');
  expect(await readFile(skillPath(dir), 'utf8')).toContain('name: joplo');
});
test('install 专用参数不能静默用于主题', async () => {
  expect((await run(['skill', 'authoring', '--force'])).code).toBe(2);
  expect((await run(['skill', '--agents-md'])).code).toBe(2);
});

test('默认接线读取所有主题时不触发 server 模块初始化', async () => {
  for (const args of [['skill'], ...['authoring', 'demo', 'components', 'cases', 'check', 'selection', 'publish'].map(name => ['skill', name]), ['guide']]) {
    expect(await runCli(args, { stdout: () => {}, stderr: () => {} })).toBe(0);
  }
  expect(serverImports).not.toHaveBeenCalled();
});
test('unified diff 可被 git apply 检查，不只具有 diff 外观', async () => {
  const dir = await temp(); await run(['skill', 'install', dir, '--agents-md']);
  const text = await readFile(skillPath(dir), 'utf8');
  await writeFile(skillPath(dir), text.replace('npx joplo check', '自定义检查') + '用户追加（无换行）');
  const agents = await readFile(join(dir, 'AGENTS.md'), 'utf8');
  await writeFile(join(dir, 'AGENTS.md'), agents.replace('## Joplo', '## 用户修改的托管段'));
  const diff = await run(['skill', 'install', dir, '--diff']);
  const result = await new Promise<{ code: number | null; stderr: string }>((res, rej) => {
    const child = spawn('git', ['apply', '--check', '-'], { cwd: dir }); let stderr = '';
    child.stderr.on('data', data => { stderr += data; }); child.stdout.resume(); child.on('error', rej);
    child.on('close', code => res({ code, stderr })); child.stdin.end(diff.stdout);
  });
  expect(result, diff.stdout).toEqual({ code: 0, stderr: '' });
});

test('同版本旧指针无用户修改时可加入 demo，旧哈希更新后再次安装幂等', async () => {
  const dir = await temp();
  await run(['skill', 'install', dir, '--agents-md']);
  const original = await readFile(skillPath(dir), 'utf8');
  const marker = /<!-- joplo-skill ([^ ]+) sha256:([a-f0-9]{64}) -->\n$/.exec(original)!;
  const oldBody = original.slice(0, marker.index).split('\n').filter(line => !line.includes('skill demo')).join('\n');
  const oldHash = createHash('sha256').update(oldBody).digest('hex');
  await writeFile(skillPath(dir), oldBody + `<!-- joplo-skill ${marker[1]} sha256:${oldHash} -->\n`);
  const oldAgents = (await readFile(join(dir, 'AGENTS.md'), 'utf8')).split('\n').filter(line => !line.includes('skill demo')).join('\n');
  await writeFile(join(dir, 'AGENTS.md'), oldAgents);
  const update = await run(['skill', 'install', dir]);
  expect(update.code).toBe(0);
  expect(update.stdout).toContain('Wrote');
  expect(await readFile(skillPath(dir), 'utf8')).toBe(original);
  expect(await readFile(join(dir, 'AGENTS.md'), 'utf8')).toContain('npx joplo skill demo');
  const current = await readFile(skillPath(dir), 'utf8');
  expect(/sha256:([a-f0-9]{64})/.exec(current)![1]).not.toBe(oldHash);
  const again = await run(['skill', 'install', dir]);
  expect(again.stdout).toContain('Already up to date'); expect(await readFile(skillPath(dir), 'utf8')).toBe(current);
});
