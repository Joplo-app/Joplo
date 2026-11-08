import { Command, CommanderError, Option } from 'commander';
import { terminalText } from './cloud-error.ts';
import type { CloudDependencies } from './cloud.ts';
import { resolve } from 'node:path';
import { COMPONENT_DOCS, componentDetails, guide, JoploError, skillIndex, skillTopic } from '@joplo-app/core';
import type * as Server from '@joplo-app/server';
import { check } from './check.ts';
import { initProject, initSummary } from './init.ts';
import { projectNotes } from './startup.ts';
import { readSelection } from './selection.ts';
import { installSkill, readCliVersion } from './skill.ts';
import { diagnosticLine, failure, oneLine, result } from './common.ts';
import type { SetupServer } from './setup.ts';

type Dependencies = {
  stdout?: (s: string) => void;
  stderr?: (s: string) => void;
  loadServer?: () => Promise<Record<string, unknown>>;
  /** 测试用：覆盖 CLI 自己的版本（缺省读 package.json）。 */
  cliVersion?: string;
  cloud?: CloudDependencies;
  /** 测试用：是否交互终端（缺省看 stdin / stderr 是否 TTY、是否 CI）与是 / 否询问。 */
  interactive?: boolean;
  ask?: (question: string) => Promise<boolean>;
};
/** 可重复的选项（--scenario a --scenario b）：逐个收进数组。 */
const collect = (value: string, previous: string[]) => [...previous, value];
const integer = (name: string, max = Number.MAX_SAFE_INTEGER) => (text: string) => {
  const n = Number(text);
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(n) || n < 1 || n > max) throw new JoploError('USAGE', `${name} must be an integer from 1 to ${max}`);
  return n;
};
const cursor = (value: string) => {
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw new JoploError('USAGE', 'after must be a non-negative integer');
  return Number(value);
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
  async function serverFunction<K extends 'buildFeatureDiff' | 'startDev' | 'buildSite' | 'renderStep' | 'exportRuntimeStatus' | 'installExportRuntime' | 'uninstallExportRuntime'>(name: K): Promise<typeof Server[K]> {
    let module: Record<string, unknown>;
    try { module = await loadServer(); }
    catch (e) { throw new JoploError('UNSUPPORTED_ACTION', `@joplo-app/server cannot load ${name}: ${e instanceof Error ? e.message : String(e)}`); }
    if (typeof module[name] !== 'function') throw new JoploError('UNSUPPORTED_ACTION', `@joplo-app/server does not provide ${name}; use a version implementing the IR v2 service contract`);
    return module[name] as typeof Server[K];
  }
  const program = new Command().enablePositionalOptions().name('joplo').description('Joplo: Author, demo, and publish feature designs with TSX').exitOverride()
    .configureOutput({ writeOut: stdout, writeErr: stderr, outputError: () => {} });
  // 读取项目的命令先检查项目里的 @joplo-app/kit 与 CLI 是否同一版本（只提示，不阻止）
  program.hook('preAction', (_root, action) => {
    for (const note of projectNotes(resolve(String(action.args[0] ?? '.')), action.name(), { cli: deps.cliVersion })) stderr(note + '\n');
  });
  const format = () => new Option('--format <format>', 'Output format').choices(['text', 'json']).default('text');
  const withWatchSignal = async (run: (signal: AbortSignal) => Promise<number>) => {
    const ac = new AbortController();
    const stop = () => ac.abort();
    process.on('SIGINT', stop); process.on('SIGTERM', stop);
    try { exitCode = await run(ac.signal); }
    finally { process.off('SIGINT', stop); process.off('SIGTERM', stop); }
  };
  const review = program.command('review').description('Read and watch local review sessions (no cloud account required)');
  review.command('list').argument('[dir]', 'Project directory', '.').option('--json', 'Print JSON').option('--all', 'Include approved, closed, and stopped sessions').option('--option <id>', 'Filter by qualified option id')
    .action(async (dir, opts) => {
      const { reviewSessions, reviewSummary, reviewLine } = await import('./local-review.ts');
      const sessions = reviewSessions(dir, opts);
      if (opts.json) json(sessions.map(reviewSummary));
      else if (!sessions.length) line('No active reviews. Run joplo dev in this project, or use --all for history.');
      else sessions.forEach(s => line(reviewLine(s)));
    });
  review.command('watch').argument('[dir]', 'Project directory', '.').option('--session <id>', 'Bind to this exact review session').option('--option <id>', 'Filter by qualified option id; fails if multiple instances match')
    .option('--after <seq>', 'Resume after this event sequence number', cursor, 0).option('--json', 'Stream one JSON event per line (NDJSON)')
    .option('--follow', 'Follow every option and every new round of this project until the board stops')
    .action(async (dir, opts) => {
      const { watchLocalReview, followLocalReviews } = await import('./local-review.ts');
      await withWatchSignal(signal => (opts.follow ? followLocalReviews : watchLocalReview)(dir, opts, { out: stdout, err: stderr }, signal));
    });
  const cloudClient = async (server?: string, format?: string) => {
    const { CloudClient } = await import('./cloud.ts');
    return new CloudClient(server, deps.cliVersion ?? await readCliVersion(), s => stderr(s + '\n'), s => secrets.add(s), { ...deps.cloud, format });
  };
  const cloudCommand = (name: string) => program.command(name).option('--server <url>', 'Cloud server (overrides JOPLO_CLOUD_URL)');
  const apiKeyNotice = 'JOPLO_API_KEY is set: cloud commands use the API key and ignore the saved login. Unset JOPLO_API_KEY to sign in with the browser';
  cloudCommand('login').description('Authorize the CLI in your browser').addOption(format()).option('--no-browser', 'Open the login URL manually').action(async opts => {
    const client = await cloudClient(opts.server, opts.format);
    // 契约 8.4：有 API Key 时不进入设备登录、不读写 credentials.json、不打开浏览器
    if (client.apiKey()) {
      if (opts.format === 'json') json(result(client.server, apiKeyNotice, { server: client.server, apiKey: true }));
      else line(apiKeyNotice);
      return;
    }
    const c = await client.login(opts.browser === false);
    if (opts.format === 'json') json(result(c.server, 'Signed in', { server: c.server, user: c.user, createdAt: c.createdAt }));
    else line(`Signed in as ${terminalText(c.user.email)}`);
  });
  cloudCommand('logout').description('Revoke the session and remove local credentials').action(async opts => {
    const client = await cloudClient(opts.server, opts.format);
    if (client.apiKey()) { line(`JOPLO_API_KEY is set; local credentials were not touched. Unset it, or revoke the key in Settings → API keys: ${client.server}/settings/api-keys`); return; }
    await client.logout();
    line('Signed out');
  });
  cloudCommand('whoami').description('Show the cloud account, plan, and limits').addOption(format()).action(async opts => {
    const client = await cloudClient(opts.server, opts.format), auth = await client.requireAuth();
    const data = await client.me(auth.token);
    const key = data.apiKey ? `API key ${data.apiKey.name ? `"${data.apiKey.name}" ` : ''}${data.apiKey.prefix ?? ''}…${data.apiKey.scopes ? ` · scopes: ${data.apiKey.scopes.join(', ') || 'none'}` : ''}${data.apiKey.expiresAt ? ` · expires ${data.apiKey.expiresAt}` : ''} (JOPLO_API_KEY)` : null;
    if (opts.format === 'json') json(result(client.server, `${terminalText(data.user.email)} (${data.plan})`, data));
    else line(`${terminalText(data.user.email)} (${data.plan})${key ? `\n${key}` : ''}\nNew upload limit: ${data.limits.maxUploadBytes} bytes\nManifest total limit: ${data.limits.maxTotalBytes} bytes, ${data.limits.maxFiles} files\nPublications per hour: ${data.limits.publishesPerHour ?? 'Not provided by the server'}`);
  });
  const diff = program.command('diff').enablePositionalOptions().description('Compare two public builds; prepare and publish immutable PR comparisons')
    .argument('[before]', 'Baseline static build directory').argument('[after]', 'Current static build directory')
    .option('--out <dir>', 'New diff output directory').option('--base-sha <sha>', 'Normalized baseline commit SHA').option('--head-sha <sha>', 'Normalized current commit SHA').addOption(format())
    .action(async (before, after, opts) => {
      if (!before || !after || !opts.out) throw new JoploError('USAGE', 'Use joplo diff <before-site> <after-site> --out <new-directory>');
      const built = await (await serverFunction('buildFeatureDiff'))({ beforeDir: resolve(before), afterDir: resolve(after), outDir: resolve(opts.out), baseSha: opts.baseSha, headSha: opts.headSha });
      if (opts.format === 'json') json(built); else line(`Feature diff: ${built.manifest.status} · ${built.outDir}`);
    });
  diff.command('prepare').description('Pin the PR baseline before building; writes a receipt without credentials')
    .requiredOption('--pr <number>', 'Pull request number', integer('pr', 2147483647)).option('--repo <owner/name>', 'Repository').option('--sha <sha>', 'Current PR head')
    .requiredOption('--base-sha <sha>', 'Candidate git merge-base, full SHA').requiredOption('--out <file>', 'New receipt file')
    .option('--server <url>', 'Cloud server').addOption(format()).action(async opts => {
      const { prepareComparison } = await import('./feature-diff.ts');
      const receipt = await prepareComparison(await cloudClient(opts.server, opts.format), opts);
      if (opts.format === 'json') json(receipt); else line(`Prepared generation ${receipt.prepared.generation}. Build baseline ${receipt.prepared.baseSha} and head ${receipt.prepared.headSha}. Receipt: ${opts.out}`);
    });
  diff.command('publish').description('Upload a prepared static diff; never executes project code')
    .argument('<dir>', 'Diff bundle directory').requiredOption('--prepared <file>', 'Prepare receipt')
    .requiredOption('--pr <number>', 'Pull request number', integer('pr', 2147483647)).option('--repo <owner/name>', 'Repository').option('--sha <sha>', 'Current PR head')
    .option('--title <title>', 'Share title').option('--server <url>', 'Cloud server').addOption(format()).action(async (dir, opts) => {
      const { publishComparison } = await import('./feature-diff.ts');
      const published = await publishComparison(await cloudClient(opts.server, opts.format), resolve(dir), opts);
      if (opts.format === 'json') json(published); else line(`Feature diff published: ${published.url}`);
    });
  cloudCommand('share').description('Check, build, and publish to the cloud').argument('[dir]', 'Project directory', '.').addOption(format())
    .option('--new', 'Create a new share link').option('--title <title>', 'Share title (defaults to project name)')
    .option('--review', 'Publish the review version: every option of every feature (rules and questions still stay out of the uploaded files)')
    .option('--pr <number>', 'Attach a GitHub pull request (PR preview); repo, commit, and run URL come from GitHub Actions', integer('pr', 2147483647))
    .option('--repo <owner/name>', 'Repository for --pr outside GitHub Actions').option('--sha <commit>', 'Commit for --pr (defaults to the PR head or git HEAD)')
    .option('--scenario <id>', 'Share only this scenario; repeatable. Other features, scenarios, and pages are left out of the uploaded files (D75)', collect, [])
    .option('--feature <id>', "Share only this feature's scenarios (picked option; every option with --review); repeatable", collect, [])
    .action(async (dir, opts) => {
      const client = await cloudClient(opts.server, opts.format);
      const { share } = await import('./cloud-share.ts');
      const published = await share(client, dir, { ...opts, scenarios: opts.scenario, features: opts.feature }, async options => (await serverFunction('buildSite'))(options), () => serverFunction('renderStep'));
      if (opts.format === 'json') json(result(resolve(dir), 'Published', published.result));
      else {
        const scope = published.result.scope;
        line(`Published ${published.result.mode === 'review' ? 'the review version ' : ''}${scope ? 'a scoped share ' : ''}${published.result.url}\n${published.result.expiresAt ? `Expires at: ${terminalText(published.result.expiresAt)}` : 'Permanent link'}`);
        if (scope) line(`Scope: ${scope.scenarios.length} scenario(s): ${scope.scenarios.join(', ')}. The main link and the review link are unchanged`);
        if (published.result.pr) { const { prCommentLine } = await import('./cloud-pr.ts'); const note = prCommentLine(published.result.pr, client.server); if (note) line(note); }
        if (published.plan === 'free') line(`Free shares expire after 1 hour. Upgrade for permanent links: ${client.server}/settings/billing`);
        line(`Add to README: ${terminalText(published.result.embed.markdown)}\nMore embed options: ${client.server}/shares/${published.result.shareId}`);
      }
    });
  const feedbackCommand = cloudCommand('feedback').description('Read cloud feedback, or watch local/cloud reviews').argument('[dir]', 'Project directory', '.').addOption(format())
    .option('--share <id>', 'Share id (defaults to .joplo/cloud.json)').option('--applied <ids>', 'Mark comma-separated decision ids as applied to the source').option('--ref <ref>', 'Source version for --applied (for example a commit SHA)')
    .action(async (dir, opts) => {
      if (opts.ref !== undefined && opts.applied === undefined) throw new JoploError('USAGE', '--ref applies only with --applied <ids>');
      const f = await import('./cloud-feedback.ts');
      const client = await cloudClient(opts.server, opts.format);
      const ids = opts.applied === undefined ? null : f.decisionIds(opts.applied);
      const shareId = await f.feedbackShareId(client, dir, opts.share);
      if (ids) {
        const data = await f.markApplied(client, shareId, ids, opts.ref);
        const summary = `Marked ${data.applied.length} decision(s) as applied`;
        if (opts.format === 'json') json(result(resolve(dir), summary, { shareId, ...data }));
        else line(`${summary}: ${data.applied.join(', ') || 'none'}`);
        return;
      }
      const data = await f.fetchFeedback(client, shareId);
      const summary = `${data.decisions.length} decision(s), ${data.comments.length} unresolved comment(s)`;
      if (opts.format === 'json') json(result(resolve(dir), summary, data));
      else for (const l of f.feedbackText(data)) line(l);
    });
  feedbackCommand.command('list').description('List local review sessions').argument('[dir]', 'Project directory', '.').requiredOption('--local', 'Read this project’s local review sessions')
    .option('--json', 'Print JSON').option('--all', 'Include completed and stopped sessions').option('--option <id>', 'Filter by qualified option id')
    .action(async (dir, opts) => {
      const { reviewSessions, reviewSummary, reviewLine } = await import('./local-review.ts');
      const sessions = reviewSessions(dir, opts);
      if (opts.json) json(sessions.map(reviewSummary));
      else if (!sessions.length) line('No active reviews. Run joplo dev in this project, or use --all for history.');
      else sessions.forEach(s => line(reviewLine(s)));
    });
  feedbackCommand.command('watch').description('Watch local events or poll cloud feedback; exit when the target option is confirmed').argument('[dir]', 'Project directory for local reviews', '.')
    .option('--local', 'Watch local review files without connecting to Cloud').option('--session <id>', 'Exact local review session')
    .option('--share <id>', 'Cloud share id (requires --option)').option('--option <id>', 'Qualified option id: feature.option')
    .option('--version <number>', 'Cloud share version; defaults to the first response', integer('version'))
    .option('--interval <seconds>', 'Cloud polling interval, 10–30 seconds (default: 15)', integer('interval', 30))
    .option('--after <seq>', 'Local replay cursor', cursor).option('--json', 'Stream one normalized JSON event per line')
    .option('--follow', 'With --local: follow every option and every new round of this project until the board stops')
    .option('--server <url>', 'Cloud server (overrides JOPLO_CLOUD_URL)')
    .action(async (dir, opts, command) => {
      // 父命令的 --share / --server 在 watch 前后均能识别；拒绝把旧的写回标记用到监听命令。
      const all = command.optsWithGlobals();
      opts.json = opts.json || all.format === 'json';
      if (all.applied !== undefined || all.ref !== undefined) throw new JoploError('USAGE', '--applied and --ref cannot be used with feedback watch');
      const shareId = opts.share ?? all.share;
      const server = opts.server ?? all.server;
      if (opts.local) {
        if (shareId !== undefined || server !== undefined || opts.interval !== undefined || opts.version !== undefined)
          throw new JoploError('USAGE', '--local cannot be combined with --share, --server, --interval, or --version');
        const { watchLocalReview, followLocalReviews } = await import('./local-review.ts');
        await withWatchSignal(signal => (opts.follow ? followLocalReviews : watchLocalReview)(dir, opts, { out: stdout, err: stderr }, signal));
      } else {
        if (opts.follow) throw new JoploError('USAGE', '--follow applies to local reviews: add --local');
        if (!shareId || opts.session !== undefined || opts.after !== undefined)
          throw new JoploError('USAGE', 'Choose --local [--session <id>] or --share <id> --option <feature.option>; --after applies only to local reviews');
        const { watchCloudFeedback, validateCloudWatchOptions } = await import('./cloud-feedback-watch.ts');
        validateCloudWatchOptions(opts);
        const { SHARE_ID } = await import('./cloud-feedback.ts');
        if (!SHARE_ID.test(shareId)) throw new JoploError('USAGE', 'share must be a 10-character share id');
        const client = await cloudClient(server, opts.json ? 'json' : 'text');
        await withWatchSignal(signal => watchCloudFeedback(client, shareId, opts, { out: stdout, err: stderr }, signal));
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
  program.command('outline').description('Print who each feature is for, its cases with expected results and coverage, and every scenario\'s steps and estimated duration')
    .argument('[dir]', 'Project directory', '.').addOption(format()).option('--option <qid>', 'Only the specified option').action(async (dir, opts) => {
      const { readOutline, outlineText } = await import('./outline.ts');
      const r = await readOutline(dir, opts.option);
      if (opts.format === 'json') json(r.outline ? result(r.name, `${r.outline.features.length} feature(s)`, { outline: r.outline, summary: r.summary }, r.diagnostics) : { ...failure(new JoploError('INVALID_SCHEMA', `${r.summary.error} error`, { diagnostics: r.diagnostics })), data: { outline: null, summary: r.summary } });
      else for (const l of outlineText(r)) line(l);
      // 与 check 一致：有 error 时退出 1（大纲照常输出，编译不出 IR 时只写错误数）
      if (!r.outline || r.summary.error) exitCode = 1;
    });
  program.command('components').description('List catalog components, or show props and an example for the named ones (same catalog as joplo skill components)')
    .argument('[names...]', 'Component names, for example EmptyState Menu').action((names: string[]) => {
      stdout(names.length ? componentDetails(names) : skillTopic('components', COMPONENT_DOCS));
    });
  program.command('selection').argument('[dir]', 'Project directory', '.').addOption(format()).action(async (dir, opts) => {
    const data = await readSelection(dir);
    const summary = data.selection ? `${data.selection.at ?? 'No source location'}  ${oneLine(data.selection.label ?? '')}` : 'Nothing selected';
    if (opts.format === 'json') json(result(resolve(dir), summary, data));
    else { line(summary); for (const l of data.lines) line(`${l.number} | ${l.text}`); if (data.note) line(data.note); }
  });
  program.command('init').argument('<dir>').option('--name <name>', 'Project name (defaults to directory name)').option('--keep', 'Add missing files in a nonempty directory; preserve existing files')
    .option('--no-skill', 'Do not install the agent skills (.claude/skills/joplo*, AGENTS.md block)')
    .action(async (dir, opts) => { for (const l of initSummary(await initProject(dir, opts.name, { keep: opts.keep, skill: opts.skill }))) line(l); });
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
    // 看板直接发布到云端（D76）：把登录与 share() 注入看板进程；加入已有看板时由那个进程自己的 CLI 提供
    const { cloudBridge } = await import('./cloud-bridge.ts');
    const cloud = cloudBridge({ version: deps.cliVersion ?? await readCliVersion(), deps: deps.cloud, build: async options => (await serverFunction('buildSite'))(options), render: () => serverFunction('renderStep') });
    const handle = await startDev({ projectDir: resolve(dir), port: opts.port, open: opts.open, log: s => stderr(oneLine(s) + '\n'), cloud });
    line(handle.url);
    // 已有存活的看板：项目已注册进去，本进程直接退出（不启动第二个看板进程）
    if (handle.attached) stderr(`Joined the running board. Open ${handle.url}\n`);
    // stdout 只有地址（脚本会读）；在 stderr 告诉 Agent 用哪一条命令跟住这个项目的全部评审反馈。
    const shown = /^[\w./@:+-]+$/.test(dir) ? dir : `'${dir.replace(/'/g, `'\\''`)}'`;
    stderr(`Agents: stream reviewer feedback from this board with\n  npx joplo feedback watch ${shown} --local --follow --json\n`);
  });
  program.command('build').argument('[dir]', 'Project directory', '.').option('--out-dir <dir>', 'Output directory (default: project dist)').option('--out <dir>', 'Alias for --out-dir').option('--overwrite', 'Allow clearing a nonempty output directory')
    .option('--scenario <id>', 'Build only this scenario; repeatable (same scope as share --scenario)', collect, [])
    .option('--feature <id>', "Build only this feature's scenarios; repeatable", collect, [])
    .action(async (dir, opts) => {
    const buildSite = await serverFunction('buildSite');
    const output = opts.outDir ?? opts.out;
    const scope = opts.scenario.length || opts.feature.length ? { scope: { scenarios: opts.scenario, features: opts.feature } } : {};
    const data = await buildSite({ projectDir: resolve(dir), outDir: output === undefined ? undefined : resolve(output), overwrite: opts.overwrite, ...scope });
    for (const d of data.diagnostics) line(diagnosticLine(d));
    line(`Built ${data.outDir} (${data.files.length} files)`);
    if (data.scope) {
      const { borrowedLine } = await import('@joplo-app/core');
      line(`Scope: ${data.scope.scenarios.length} scenario(s): ${data.scope.scenarios.join(', ')}`);
      for (const b of data.scope.borrowed) line(`Borrowed from another feature: ${terminalText(borrowedLine(b))}`);
    }
    const voice = (await import('./cloud-share.ts')).voiceSummary(data.voice);
    if (voice) line(voice);
    if (data.diagnostics.some(d => d.severity === 'error')) exitCode = 1;
  });
  // 导出组件（D66）：Playwright + Chromium 装在 JOPLO_HOME 下，不改项目；写演示、dev、check、build、share 都不需要它
  const setupServer = async (): Promise<SetupServer> => {
    const [exportRuntimeStatus, installExportRuntime, uninstallExportRuntime] = await Promise.all([serverFunction('exportRuntimeStatus'), serverFunction('installExportRuntime'), serverFunction('uninstallExportRuntime')]);
    const m = await loadServer();
    return { exportRuntimeStatus, installExportRuntime, uninstallExportRuntime, EXPORT_DOWNLOAD_MB: Number(m.EXPORT_DOWNLOAD_MB) || 100, PLAYWRIGHT_VERSION: String(m.PLAYWRIGHT_VERSION ?? ''), SETUP_COMMAND: String(m.SETUP_COMMAND ?? 'npx joplo setup export') };
  };
  const setupIo = () => ({ err: stderr, tty: deps.stderr ? false : !!process.stderr.isTTY });
  program.command('setup').description('Install the optional export component (Playwright + Chromium) for render, image/video export, and share preview images')
    .argument('<component>', 'Component to set up: export').addOption(format())
    .option('--status', 'Only report whether the export component is installed (exit code 4 if not)').option('--force', 'Reinstall even if already installed').option('--uninstall', 'Remove the export component')
    .action(async (component, opts) => {
      if (component !== 'export') throw new JoploError('USAGE', `Unknown component: ${component} (available: export)`);
      const { setupExport } = await import('./setup.ts');
      const r = await setupExport(await setupServer(), opts, setupIo());
      if (opts.format === 'json') json(r.code === 0 ? result('export', r.summary, r.data) : { ...failure(new JoploError('EXPORT_COMPONENT_MISSING', r.summary, { details: r.data })), data: r.data });
      else line(r.summary);
      exitCode = r.code;
    });
  program.command('render').argument('[dir]', 'Project directory', '.').requiredOption('--scenario-id <qid>', 'Scenario ID').option('--step-id <qid>', 'Position after this step; defaults to the initial state')
    .option('--theme <theme>', 'Theme: built-in (sketch, clean, blueprint, nord, dracula, solarized-light, terminal, kraft, contrast) or project themes/<name>.css; defaults to the project theme').requiredOption('--out <file>', 'Screenshot file')
    .option('--width <pixels>', 'Screenshot width (stage width follows the page viewport); requires height', integer('width')).option('--height <pixels>', 'Screenshot height; requires width', integer('height'))
    .option('--scale <scale>', 'Pixel scale', scale).option('--overwrite', 'Allow overwriting the screenshot').action(async (dir, opts) => {
      if ((opts.width === undefined) !== (opts.height === undefined)) throw new JoploError('USAGE', 'width and height must be provided together');
      const renderStep = await serverFunction('renderStep');
      const { askYesNo, isInteractive, withExportComponent } = await import('./setup.ts');
      const data = await withExportComponent(() => renderStep({ projectDir: resolve(dir), scenarioId: opts.scenarioId, stepId: opts.stepId, theme: opts.theme, out: resolve(opts.out),
        viewport: opts.width === undefined ? undefined : { width: opts.width, height: opts.height }, scale: opts.scale, overwrite: opts.overwrite }),
        { server: setupServer, interactive: deps.interactive ?? isInteractive(), ask: deps.ask ?? askYesNo, io: setupIo() });
      line(data.path);
      for (const warning of data.warnings) stderr(oneLine(warning) + '\n');
    });
  try { await program.parseAsync(args, { from: 'user' }); }
  catch (e) {
    if (e instanceof CommanderError && ['commander.helpDisplayed', 'commander.help', 'commander.version'].includes(e.code)) return 0;
    const f = failure(e instanceof CommanderError ? new JoploError('USAGE', e.message) : e);
    const wantsJson = args.some((arg, i) => arg === '--format=json' || arg === '--format' && args[i + 1] === 'json');
    if (args[0] === 'review' || args[0] === 'feedback' && (args.includes('watch') || args.includes('list'))) stderr((args.includes('--json') || wantsJson ? JSON.stringify(f) : `${f.error.code}  ${f.error.message.split('\n').map(line => terminalText(line)).join('\n')}`) + '\n');
    else if (wantsJson) json(f); else line(`${f.error.code}  ${oneLine(terminalText(f.error.message))}`);
    return f.error.code === 'USAGE' ? 2 : ['AUTH_REQUIRED', 'AUTH_EXPIRED'].includes(f.error.code) ? 3 : f.error.code === 'EXPORT_COMPONENT_MISSING' ? 4 : 1;
  }
  return exitCode;
}
