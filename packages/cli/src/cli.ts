import { Command, CommanderError, Option } from 'commander';
import { terminalText } from './cloud-error.ts';
import type { CloudDependencies } from './cloud.ts';
import { resolve } from 'node:path';
import { COMPONENT_DOCS, guide, JoploError, skillIndex, skillTopic } from '@joplo-app/core';
import type * as Server from '@joplo-app/server';
import { check } from './check.ts';
import { initProject, initSummary } from './init.ts';
import { projectNotes } from './startup.ts';
import { readSelection } from './selection.ts';
import { installSkill, readCliVersion } from './skill.ts';
import { diagnosticLine, failure, oneLine, result } from './common.ts';

type Dependencies = {
  stdout?: (s: string) => void;
  stderr?: (s: string) => void;
  loadServer?: () => Promise<Record<string, unknown>>;
  /** 测试用：覆盖 CLI 自己的版本（缺省读 package.json）。 */
  cliVersion?: string;
  cloud?: CloudDependencies;
};
const integer = (name: string, max = Number.MAX_SAFE_INTEGER) => (text: string) => {
  const n = Number(text);
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(n) || n < 1 || n > max) throw new JoploError('USAGE', `${name} must be an integer from 1 to ${max}`);
  return n;
};
const scale = (text: string) => {
  const n = Number(text);
  if (!Number.isFinite(n) || n <= 0) throw new JoploError('USAGE', 'scale must be positive');
  return n;
};

/** 每次创建独立 commander 实例，测试无需启动真实服务或占用固定端口。 */
export async function runCli(args: string[], deps: Dependencies = {}): Promise<number> {
  const secrets = new Set<string>();
  const redact = (s: string) => { for (const token of secrets) s = s.split(token).join('[REDACTED]'); return s; };
  const stdout = (s: string) => (deps.stdout ?? (s => { process.stdout.write(s); }))(redact(s));
  const stderr = (s: string) => (deps.stderr ?? (s => { process.stderr.write(s); }))(redact(s));
  const line = (s: string) => stdout(s + '\n');
  const json = (value: unknown) => line(JSON.stringify(value));
  let exitCode = 0;
  const serverPackage = '@joplo-app/server';
  const loadServer = deps.loadServer ?? (() => import(serverPackage));
  async function serverFunction<K extends 'startDev' | 'buildSite' | 'renderStep'>(name: K): Promise<typeof Server[K]> {
    let module: Record<string, unknown>;
    try { module = await loadServer(); }
    catch (e) { throw new JoploError('UNSUPPORTED_ACTION', `@joplo-app/server cannot load ${name}: ${e instanceof Error ? e.message : String(e)}`); }
    if (typeof module[name] !== 'function') throw new JoploError('UNSUPPORTED_ACTION', `@joplo-app/server does not provide ${name}; use a version implementing the IR v2 service contract`);
    return module[name] as typeof Server[K];
  }
  const program = new Command().name('joplo').description('Joplo: Author, demo, and publish feature designs with TSX').exitOverride()
    .configureOutput({ writeOut: stdout, writeErr: stderr, outputError: () => {} });
  // 读取项目的命令先检查项目里的 @joplo-app/kit 与 CLI 是否同一版本（只提示，不阻止）
  program.hook('preAction', (_root, action) => {
    for (const note of projectNotes(resolve(String(action.args[0] ?? '.')), action.name(), { cli: deps.cliVersion })) stderr(note + '\n');
  });
  const format = () => new Option('--format <format>', 'Output format').choices(['text', 'json']).default('text');
  const cloudClient = async (server?: string, format?: string) => {
    const { CloudClient } = await import('./cloud.ts');
    return new CloudClient(server, deps.cliVersion ?? await readCliVersion(), s => stderr(s + '\n'), s => secrets.add(s), { ...deps.cloud, format });
  };
  const cloudCommand = (name: string) => program.command(name).option('--server <url>', 'Cloud server (overrides JOPLO_CLOUD_URL)');
  cloudCommand('login').description('Authorize the CLI in your browser').addOption(format()).option('--no-browser', 'Open the login URL manually').action(async opts => {
    const c = await (await cloudClient(opts.server, opts.format)).login(opts.browser === false);
    if (opts.format === 'json') json(result(c.server, 'Signed in', { server: c.server, user: c.user, createdAt: c.createdAt }));
    else line(`Signed in as ${terminalText(c.user.email)}`);
  });
  cloudCommand('logout').description('Revoke the session and remove local credentials').action(async opts => {
    const client = await cloudClient(opts.server, opts.format);
    await client.logout();
    line('Signed out');
  });
  cloudCommand('whoami').description('Show the cloud account, plan, and limits').addOption(format()).action(async opts => {
    const client = await cloudClient(opts.server, opts.format), credentials = await client.requireCredentials();
    const data = await client.me(credentials.accessToken);
    if (opts.format === 'json') json(result(client.server, `${terminalText(data.user.email)} (${data.plan})`, data));
    else line(`${terminalText(data.user.email)} (${data.plan})\nNew upload limit: ${data.limits.maxUploadBytes} bytes\nManifest total limit: ${data.limits.maxTotalBytes} bytes, ${data.limits.maxFiles} files\nPublications per hour: ${data.limits.publishesPerHour ?? 'Not provided by the server'}`);
  });
  cloudCommand('share').description('Check, build, and publish to the cloud').argument('[dir]', 'Project directory', '.').addOption(format())
    .option('--new', 'Create a new share link').option('--title <title>', 'Share title (defaults to project name)').action(async (dir, opts) => {
      const client = await cloudClient(opts.server, opts.format);
      const { share } = await import('./cloud-share.ts');
      const published = await share(client, dir, opts, async options => (await serverFunction('buildSite'))(options));
      if (opts.format === 'json') json(result(resolve(dir), 'Published', published.result));
      else {
        line(`Published ${published.result.url}\n${published.result.expiresAt ? `Expires at: ${terminalText(published.result.expiresAt)}` : 'Permanent link'}`);
        if (published.plan === 'free') line(`Free shares expire after 1 hour. Upgrade for permanent links: ${client.server}/billing`);
      }
    });
  program.command('check').argument('[dir]', 'Project directory', '.').addOption(format()).option('--option <qid>', 'Validate only the specified option').action(async (dir, opts) => {
    const report = await check(dir, opts.option);
    const summary = `${report.summary.error} error, ${report.summary.warning} warning, ${report.summary.info} info`;
    if (opts.format === 'json') {
      if (report.summary.error) json({ ...failure(new JoploError('INVALID_SCHEMA', summary, { diagnostics: report.diagnostics })), data: report });
      else json(result(report.name, summary, report, report.diagnostics));
    } else { for (const d of report.diagnostics) line(diagnosticLine(d)); line(summary); }
    if (report.summary.error) exitCode = 1;
  });
  program.command('selection').argument('[dir]', 'Project directory', '.').addOption(format()).action(async (dir, opts) => {
    const data = await readSelection(dir);
    const summary = data.selection ? `${data.selection.at ?? 'No source location'}  ${oneLine(data.selection.label ?? '')}` : 'Nothing selected';
    if (opts.format === 'json') json(result(resolve(dir), summary, data));
    else { line(summary); for (const l of data.lines) line(`${l.number} | ${l.text}`); if (data.note) line(data.note); }
  });
  program.command('init').argument('<dir>').option('--name <name>', 'Project name (defaults to directory name)').option('--keep', 'Add missing files in a nonempty directory; preserve existing files')
    .action(async (dir, opts) => { for (const l of initSummary(await initProject(dir, opts.name, { keep: opts.keep }))) line(l); });
  program.command('skill').description('Read agent usage on demand or install a usage pointer')
    .argument('[topic]', 'authoring/demo/components/cases/check/selection/publish, or install')
    .argument('[dir]', 'Target project directory for install')
    .option('--force', 'Overwrite a modified SKILL.md')
    .option('--diff', 'Show a unified diff without writing files')
    .option('--agents-md', 'Create a managed block even if AGENTS.md does not exist')
    .action(async (topic, dir, opts) => {
      if (topic === 'install') {
        const installed = await installSkill(dir ?? '.', await readCliVersion(), opts);
        stdout(installed.output); exitCode = installed.code;
      } else {
        if (dir !== undefined || opts.force || opts.diff || opts.agentsMd) throw new JoploError('USAGE', 'dir, --force, --diff, and --agents-md apply only to joplo skill install');
        stdout(topic === undefined ? skillIndex(await readCliVersion(), COMPONENT_DOCS) : skillTopic(topic, COMPONENT_DOCS));
      }
    });
  program.command('guide').description('Compatibility alias for joplo skill authoring').action(() => { stdout(guide()); });
  program.command('dev').argument('[dir]', 'Project directory', '.').option('--port <port>', 'Port (default: 4790)', integer('port', 65535)).option('--open', 'Open the browser').action(async (dir, opts) => {
    const startDev = await serverFunction('startDev');
    const handle = await startDev({ projectDir: resolve(dir), port: opts.port, open: opts.open, log: s => stderr(oneLine(s) + '\n') });
    line(handle.url);
    // 已有存活的看板：项目已注册进去，本进程直接退出（不启动第二个看板进程）
    if (handle.attached) stderr(`Joined the running board. Open ${handle.url}\n`);
  });
  program.command('build').argument('[dir]', 'Project directory', '.').option('--out-dir <dir>', 'Output directory (default: project dist)').option('--out <dir>', 'Alias for --out-dir').option('--overwrite', 'Allow clearing a nonempty output directory').action(async (dir, opts) => {
    const buildSite = await serverFunction('buildSite');
    const output = opts.outDir ?? opts.out;
    const data = await buildSite({ projectDir: resolve(dir), outDir: output === undefined ? undefined : resolve(output), overwrite: opts.overwrite });
    for (const d of data.diagnostics) line(diagnosticLine(d));
    line(`Built ${data.outDir} (${data.files.length} files)`);
    if (data.diagnostics.some(d => d.severity === 'error')) exitCode = 1;
  });
  program.command('render').argument('[dir]', 'Project directory', '.').requiredOption('--scenario-id <qid>', 'Scenario ID').option('--step-id <qid>', 'Position after this step; defaults to the initial state')
    .option('--theme <theme>', 'Theme: built-in (sketch, clean, blueprint, nord, dracula, solarized-light, terminal, kraft, contrast) or project themes/<name>.css; defaults to the project theme').requiredOption('--out <file>', 'Screenshot file')
    .option('--width <pixels>', 'Screenshot width (stage width follows the page viewport); requires height', integer('width')).option('--height <pixels>', 'Screenshot height; requires width', integer('height'))
    .option('--scale <scale>', 'Pixel scale', scale).option('--overwrite', 'Allow overwriting the screenshot').action(async (dir, opts) => {
      if ((opts.width === undefined) !== (opts.height === undefined)) throw new JoploError('USAGE', 'width and height must be provided together');
      const renderStep = await serverFunction('renderStep');
      const data = await renderStep({ projectDir: resolve(dir), scenarioId: opts.scenarioId, stepId: opts.stepId, theme: opts.theme, out: resolve(opts.out),
        viewport: opts.width === undefined ? undefined : { width: opts.width, height: opts.height }, scale: opts.scale, overwrite: opts.overwrite });
      line(data.path);
      for (const warning of data.warnings) stderr(oneLine(warning) + '\n');
    });
  try { await program.parseAsync(args, { from: 'user' }); }
  catch (e) {
    if (e instanceof CommanderError && ['commander.helpDisplayed', 'commander.help', 'commander.version'].includes(e.code)) return 0;
    const f = failure(e instanceof CommanderError ? new JoploError('USAGE', e.message) : e);
    const wantsJson = args.some((arg, i) => arg === '--format=json' || arg === '--format' && args[i + 1] === 'json');
    if (wantsJson) json(f); else line(`${f.error.code}  ${oneLine(terminalText(f.error.message))}`);
    return f.error.code === 'USAGE' ? 2 : ['AUTH_REQUIRED', 'AUTH_EXPIRED'].includes(f.error.code) ? 3 : 1;
  }
  return exitCode;
}
