import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { JoploError } from '@joplo-app/core';
import { detectPackageManager, pmCommands, type PackageManager } from './pm.ts';
import { installSkill } from './skill.ts';
import { cliVersion } from './startup.ts';

/**
 * skill：init 同时安装的 Agent 技能（D64，等同 `joplo skill install --agents-md`）；--no-skill 时为 null。
 * written 是写入的技能文件与 AGENTS.md；modified 是用户改过而保留的技能（此时一个都不写）；error 是 AGENTS.md 标记损坏等原因。
 */
export type InitSkill = { written: string[]; modified: string[]; error?: string };
export type InitResult = { root: string; written: string[]; skipped: string[]; version: string; skill: InitSkill | null };

/** 目录名 → 合法的 npm 包名（小写、无空格；无法推导时用 joplo-demo）。 */
export function packageName(dirName: string): string {
  const n = dirName.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[._-]+|[-._]+$/g, '').slice(0, 214);
  return n || 'joplo-demo';
}

/** init 写入的 package.json：joplo 与 @joplo-app/kit 锁定为当前 CLI 的精确版本（D36：所有包同一版本）。 */
export function projectPackageJson(dirName: string, version: string): string {
  const pkg = {
    name: packageName(dirName),
    private: true,
    type: 'module',
    scripts: { dev: 'joplo dev', check: 'joplo check', build: 'joplo build' },
    devDependencies: { joplo: version, '@joplo-app/kit': version },
  };
  return JSON.stringify(pkg, null, 2) + '\n';
}

/** init 写入的 tsconfig.json：作者的 TSX 由 @joplo-app/kit 的 JSX 运行时收集成数据。 */
export function projectTsconfig(): string {
  const compilerOptions = {
    target: 'ES2023',
    module: 'ESNext',
    moduleResolution: 'Bundler',
    jsx: 'react-jsxdev',
    jsxImportSource: '@joplo-app/kit',
    allowImportingTsExtensions: true,
    noEmit: true,
    strict: true,
    skipLibCheck: true,
  };
  return JSON.stringify({ compilerOptions, include: ['**/*.ts', '**/*.tsx'], exclude: ['node_modules', 'dist', '.joplo'] }, null, 2) + '\n';
}

const shellArg = (s: string) => (/^[\w@%+=:,./-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`);

/** init 结尾的一行：进入目录、安装、打开看板（与用户的包管理器一致）。 */
export function nextStepLine(pm: PackageManager, relDir: string): string {
  const c = pmCommands(pm);
  const steps = [...(relDir && relDir !== '.' ? [`cd ${shellArg(relDir)}`] : []), c.install, `${c.run} dev`];
  return `Next: ${steps.join(' && ')}`;
}

export async function initProject(dir: string, name?: string, opts: { keep?: boolean; skill?: boolean; env?: Record<string, string | undefined> } = {}): Promise<InitResult> {
  const root = resolve(dir);
  const version = cliVersion();
  if (!opts.keep) {
    let entries: string[] = [];
    try { entries = await readdir(root); }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
    if (entries.length) {
      const rel = relative(process.cwd(), root) || '.';
      const run = pmCommands(detectPackageManager(opts.env ?? process.env)).run;
      throw new JoploError('UNSUPPORTED_ACTION', `${rel}/ is not empty (contains ${entries.length} files). Nothing was written. Choose another directory, or enter it and run ${run} init . --keep to add missing files only.`);
    }
  }
  const files: Record<string, string> = {
    'package.json': projectPackageJson(basename(root), version),
    'joplo.config.ts': `import { config } from '@joplo-app/kit';\nexport default config({ name: ${JSON.stringify(name ?? (basename(root) || 'Joplo'))}, layout: 'app', home: '/' });\n`,
    'layouts/app.tsx': `import { layout, Outlet, Slot } from '@joplo-app/kit';\nimport { AppShell } from '@joplo-app/kit/ui';\nexport default layout(\n  <AppShell padding="lg">\n    <AppShell.Main>\n      <Outlet />\n    </AppShell.Main>\n    <Slot name="overlay" />\n  </AppShell>,\n);\n`,
    'routes/page.tsx': `import { page, Slot } from '@joplo-app/kit';\nimport { Group, Stack, Title } from '@joplo-app/kit/ui';\nexport default page(\n  { title: 'Home' },\n  <Stack gap="md">\n    <Title id="welcome" order={2}>Start designing</Title>\n    <Group gap="sm">\n      <Slot name="actions" />\n    </Group>\n  </Stack>,\n);\n`,
    'features/example/feature.ts': `import { feature } from '@joplo-app/kit';\nexport default feature({ name: 'Example feature', goal: 'Click the button to complete the demo', cases: { happy: 'Complete successfully' }, pick: 'a' });\n`,
    'features/example/options/a.tsx': `import { option, flow, done } from '@joplo-app/kit';\nimport { Button } from '@joplo-app/kit/ui';\nexport default option({\n  name: 'Option A', idea: 'Complete the action with one button',\n  on: { '/': { actions: <Button id="start">Start</Button> } },\n  scenarios: { happy: flow('Complete successfully', { cases: ['happy'], start: '/' }).click('start', 'Click Start', done('Completed')) },\n});\n`,
    'tsconfig.json': projectTsconfig(),
    '.gitignore': 'node_modules/\n.joplo/\ndist/\nexports/\n',
  };
  await mkdir(root, { recursive: true });
  const written: string[] = [];
  const skipped: string[] = [];
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    try {
      await writeFile(join(root, path), content, { flag: 'wx' });
      written.push(path);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST' || !opts.keep) throw e;
      skipped.push(path);
    }
  }
  // 项目文件写完后再装技能；技能装不上（用户改过、AGENTS.md 标记损坏）不影响 init 成功
  let skill: InitSkill | null = null;
  if (opts.skill !== false) {
    try {
      const r = await installSkill(root, version, { agentsMd: true });
      skill = { written: r.written, modified: r.modified };
    } catch (e) {
      if (!(e instanceof JoploError)) throw e;
      skill = { written: [], modified: [], error: e.message };
    }
  }
  return { root, written, skipped, version, skill };
}

/** `joplo init` 的输出（最后一行是下一步命令）。 */
export function initSummary(r: InitResult, env: Record<string, string | undefined> = process.env): string[] {
  const rel = relative(process.cwd(), r.root) || '.';
  const top = [...new Set(r.written.map((f) => (f.includes('/') ? `${f.split('/')[0]}/` : f)))].filter((f) => !['package.json', 'tsconfig.json', '.gitignore'].includes(f));
  const lines = [`✓ Created ${rel === '.' ? './' : `${rel}/`}${top.length ? `: ${top.join(', ')}` : ''}`];
  if (r.written.includes('package.json')) lines.push(`✓ package.json  devDependencies: { "joplo": "${r.version}", "@joplo-app/kit": "${r.version}" } (pinned to the same version)`);
  if (r.written.includes('tsconfig.json')) lines.push('✓ tsconfig.json jsxImportSource: "@joplo-app/kit"');
  if (r.skipped.length) lines.push(`! Existing files preserved: ${r.skipped.join(', ')}${r.skipped.includes('package.json') ? ` (check that devDependencies includes "joplo": "${r.version}" and "@joplo-app/kit": "${r.version}")` : ''}`);
  const s = r.skill;
  const run = pmCommands(detectPackageManager(env)).run;
  if (s?.error) lines.push(`! Agent skills not installed: ${s.error}`);
  else if (s?.modified.length) lines.push(`! Agent skills not installed: ${s.modified.join(', ')} ${s.modified.length > 1 ? 'were' : 'was'} modified; compare with ${run} skill install --diff, replace with --force`);
  else if (s) lines.push(`✓ Agent skills: .claude/skills/joplo, .claude/skills/joplo-feedback, AGENTS.md (Joplo block)${s.written.length ? '' : ', already up to date'}; skip with --no-skill`);
  lines.push(nextStepLine(detectPackageManager(env), rel));
  return lines;
}
