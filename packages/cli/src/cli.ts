import { PASSWORD_PROTECTED, USERNAME_SETUP } from './share-messages.ts';
import { Command, CommanderError, Option } from 'commander';
import { formatBytes, terminalText } from './cloud-error.ts';
import type { CloudDependencies } from './cloud.ts';
import { resolve } from 'node:path';
import { componentIndex, componentDetails, findPluginTopic, JoploError, pluginSkillIndex, pluginSkillTopic, skillIndex, skillTopic } from '@joplo-app/core';
import { projectPlugins } from './plugins.ts';
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
const position = (value: string) => {
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw new JoploError('USAGE', 'position must be a non-negative integer');
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
  // 在参数解析之前登记，Commander 的用法错误也不能回显密码。
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    const secret = arg.startsWith('--password=') ? arg.slice(11) : arg === '--password' && args[i + 1] && !args[i + 1]!.startsWith('-') ? args[i + 1] : undefined;
    if (secret) secrets.add(secret);
  }
  const envPassword = (deps.cloud?.env ?? process.env).JOPLO_SHARE_PASSWORD;
  if (envPassword && args.some(a => a === '--password' || a.startsWith('--password='))) secrets.add(envPassword);
  const envVoiceKey = (deps.cloud?.env ?? process.env).JOPLO_VOICE_KEY;
  if (envVoiceKey && args[0] === 'voice' && args[1] === 'key') secrets.add(envVoiceKey);
  const redact = (s: string) => { for (const token of secrets) for (const form of new Set([token, JSON.stringify(token).slice(1, -1), terminalText(token)])) if (form) s = s.split(form).join('[REDACTED]'); return s; };
  const writeStdout = (s: string) => (deps.stdout ?? (s => { process.stdout.write(s); }))(s);
  const stdout = (s: string) => writeStdout(redact(s));
  const stderr = (s: string) => (deps.stderr ?? (s => { process.stderr.write(s); }))(redact(s));
  const line = (s: string) => stdout(s + '\n');
  // 按值脱敏，保留 passwordProtected 等协议键；也保证引号和换行不会破坏 JSON。
  const json = (value: unknown) => writeStdout(JSON.stringify(value, (_key, v: unknown) => typeof v === 'string' ? redact(v) : v) + '\n');
  let exitCode = 0;
  const serverPackage = '@joplo-app/server';
  const loadServer = deps.loadServer ?? (() => import(serverPackage));
  async function serverFunction<K extends 'buildFeatureDiff' | 'startDev' | 'buildSite' | 'startPreview' | 'renderStep' | 'renderSheet' | 'renderFilm' | 'renderFrames' | 'renderVideo' | 'exportRuntimeStatus' | 'installExportRuntime' | 'uninstallExportRuntime' | 'generateProjectVoice' | 'generateResources'>(name: K): Promise<typeof Server[K]> {
    let module: Record<string, unknown>;
    try { module = await loadServer(); }
    catch (e) { throw new JoploError('UNSUPPORTED_ACTION', `@joplo-app/server cannot load ${name}: ${e instanceof Error ? e.message : String(e)}`); }
    if (typeof module[name] !== 'function') throw new JoploError('UNSUPPORTED_ACTION', `@joplo-app/server does not provide ${name}; use a version implementing the IR v2 service contract`);
    return module[name] as typeof Server[K];
  }
  const program = new Command().enablePositionalOptions().name('joplo').description('Joplo: Author and publish works, explainers, and feature designs with TSX').exitOverride()
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
  const cloudClient = async (server?: string, format?: string) => {
    const { CloudClient } = await import('./cloud.ts');
    return new CloudClient(server, deps.cliVersion ?? await readCliVersion(), s => stderr(s + '\n'), s => secrets.add(s), { ...deps.cloud, format });
  };
  const boardClient = async () => new (await import('./board.ts')).BoardClient(deps.cloud?.env ?? process.env);
  const localInteractive = (outputFormat = 'text') => deps.interactive ?? (!!process.stdin.isTTY && !!process.stdout.isTTY && !process.env.CI && process.env.JOPLO_NONINTERACTIVE !== '1' && outputFormat !== 'json');
  const cloudCommand = (name: string) => program.command(name).option('--server <url>', 'Cloud server (overrides JOPLO_CLOUD_URL)');
  const confirmDeletion = async (interactive: boolean, question: string, yes: boolean | undefined) => {
    if (yes) return;
    if (!interactive) throw new JoploError('USAGE', 'Deletion is disabled in non-interactive mode without --yes; no request was sent');
    const ask = deps.ask ?? deps.cloud?.confirm ?? (await import('./setup.ts')).askYesNo;
    if (!await ask(question)) throw new JoploError('USAGE', 'Deletion cancelled; nothing was deleted');
  };
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
    // 朗读额度（D85）：与账号一起读；旧云端（404）或连不上时没有这一项，不让 whoami 失败
    const { fetchVoiceInfo, voiceQuotaLine } = await import('./cloud-voice.ts');
    const [me, voiceInfo] = await Promise.all([client.me(auth.token), fetchVoiceInfo(client, auth.token).catch(() => null)]);
    const data = { ...me, ...(voiceInfo ? { voice: voiceInfo.quota } : {}) };
    const key = data.apiKey ? `API key ${data.apiKey.name ? `"${data.apiKey.name}" ` : ''}${data.apiKey.prefix ?? ''}…${data.apiKey.scopes ? ` · scopes: ${data.apiKey.scopes.join(', ') || 'none'}` : ''}${data.apiKey.expiresAt ? ` · expires ${data.apiKey.expiresAt}` : ''} (JOPLO_API_KEY)` : null;
    if (opts.format === 'json') json(result(client.server, `${terminalText(data.user.email)} (${data.plan})`, data));
    else line(`${terminalText(data.user.email)} (${data.plan})${key ? `\n${key}` : ''}\nNew upload limit: ${data.limits.maxUploadBytes} bytes\nManifest total limit: ${data.limits.maxTotalBytes} bytes, ${data.limits.maxFiles} files\nPublications per hour: ${data.limits.publishesPerHour ?? 'Not provided by the server'}${data.storage ? `\nStorage: ${formatBytes(data.storage.usedBytes)} of ${formatBytes(data.storage.quotaBytes)} used` : ''}${data.voice ? `\n${voiceQuotaLine(data.voice)}` : ''}`);
  });
  const voiceCommand = cloudCommand('voice').description('Generate missing narration audio for independent works and picked feature options (same cache as the board): Joplo Cloud narration when signed in, or the source chosen in the board or joplo.config.ts')
    .argument('[dir]', 'Project directory', '.').addOption(format())
    .option('--work <id>', 'Only this standalone work key or qualified feature work id')
    .option('--scenario <id>', 'Only this chapter and its continuing-chapter dependencies')
    .option('--scenario-id <id>', 'Alias for --scenario')
    .option('--dry-run', 'Only count the steps and characters that would be generated')
    .option('--locale <lang>', 'Only this content language from config locales (D84); repeatable', collect, [])
    .action(async (dir, opts) => {
      const { voiceCommand } = await import('./voice.ts');
      const r = await voiceCommand(resolve(dir), { dryRun: !!opts.dryRun, locales: opts.locale, server: opts.server, work: opts.work, scenario: opts.scenario ?? opts.scenarioId }, {
        version: deps.cliVersion ?? await readCliVersion(), cloud: deps.cloud, generate: () => serverFunction('generateProjectVoice'),
        build: async options => (await serverFunction('buildSite'))(options), render: () => serverFunction('renderStep'), progress: l => stderr(oneLine(l) + '\n'),
      });
      if (opts.format === 'json') json(result(resolve(dir), r.summary, r.data));
      else for (const l of r.lines) line(l);
      if (r.data.total.failed) exitCode = 1;
    });
  voiceCommand.command('profiles').description('List voice sources, narrators, and non-secret key status from the running board').addOption(format()).action(async opts => {
    const data = await (await import('./board-voice.ts')).boardVoiceProfiles(await boardClient());
    if (opts.format === 'json') json(result('voice', `${data.profiles.length} voice profile(s)`, data));
    else {
      line(`Voice profiles: ${data.file}`);
      for (const profile of data.profiles) line((await import('./board-voice.ts')).voiceProfileLine(profile));
    }
  });
  voiceCommand.command('select').description('Select this project’s voice source in the running board').argument('[dir]', 'Project directory', '.')
    .option('--profile <id>', 'Voice profile id (cloud, openai, elevenlabs, or a listed legacy id)').option('--browser', 'Use browser narration without a provider').addOption(format()).action(async (dir, opts) => {
      if (!!opts.browser === !!opts.profile) throw new JoploError('USAGE', 'Choose exactly one of --profile <id> or --browser');
      const state = await (await boardClient()).selectVoice(resolve(dir), opts.browser ? null : opts.profile);
      if (opts.format === 'json') json(result(resolve(dir), 'Voice source selected', state));
      else line(opts.browser ? 'Selected browser narration.' : `Selected voice profile ${opts.profile}.`);
    });
  voiceCommand.command('narrator').description('Set a voice profile’s default narrator in the running board').argument('<profileId>', 'Voice profile id').argument('<voiceId>', 'Narrator id from voice profiles').addOption(format()).action(async (profileId, voiceId, opts) => {
    const profile = await (await import('./board-voice.ts')).selectBoardNarrator(await boardClient(), profileId, voiceId);
    if (opts.format === 'json') json(result(profileId, 'Narrator selected', { profile }));
    else line(`Narrator for ${profileId}: ${voiceId}`);
  });
  const voiceKey = voiceCommand.command('key').description('Manage OpenAI / ElevenLabs keys through the running board (values are never printed)');
  const readVoiceKey = async () => {
    if (envVoiceKey !== undefined) return envVoiceKey;
    if (!localInteractive()) throw new JoploError('USAGE', 'Set JOPLO_VOICE_KEY in your own environment for non-interactive key storage; no key was sent');
    const read = deps.cloud?.readPassword ?? (await import('./share-password.ts')).hiddenPassword;
    const key = await read('API key (input hidden): '); secrets.add(key); return key;
  };
  voiceKey.command('set').description('Save a key from hidden input or JOPLO_VOICE_KEY').argument('<profileId>', 'openai or elevenlabs').addOption(format()).action(async (profileId, opts) => {
    const key = await readVoiceKey();
    const profile = await (await import('./board-voice.ts')).setBoardVoiceKey(await boardClient(), profileId, key);
    if (opts.format === 'json') json(result(profileId, 'Voice key saved', { profile }));
    else line(`Saved the ${profileId} key ${profile.key.hint ?? ''} in the board’s private profile store.`);
  });
  voiceKey.command('test').description('Test a saved key, or JOPLO_VOICE_KEY without saving it').argument('<profileId>', 'openai or elevenlabs').addOption(format()).action(async (profileId, opts) => {
    const tested = await (await import('./board-voice.ts')).testBoardVoiceKey(await boardClient(), profileId, envVoiceKey || undefined);
    if (opts.format === 'json') json(result(profileId, tested.ok ? 'Voice key works' : 'Voice key test failed', tested));
    else line(tested.ok ? `Voice key works (${tested.contentType ?? 'audio'}, ${tested.bytes ?? 0} bytes).` : `Voice key test failed: ${JSON.stringify(tested.error)}`);
    if (!tested.ok) exitCode = 1;
  });
  voiceKey.command('delete').description('Delete a saved key and reset that voice profile').argument('<profileId>', 'Voice profile id').option('--yes', 'Confirm deletion; required in non-interactive mode').addOption(format()).action(async (profileId, opts) => {
    await confirmDeletion(localInteractive(opts.format), `Delete the saved key and local overrides for ${profileId}?`, opts.yes);
    const data = await (await boardClient()).deleteVoiceProfile(profileId);
    if (opts.format === 'json') json(result(profileId, 'Voice key deleted', data));
    else line(`Deleted the ${profileId} key and reset its local overrides.`);
  });
  program.command('assets').description('Read-only asset usage: author references, selected publish IR inclusion, and unknown sampled visibility')
    .argument('[dir]', 'Project directory', '.').addOption(format())
    .option('--usage', 'Report usage (the default; never deletes or uploads)')
    .option('--scan <directory>', 'Explicit project-relative file or directory to inventory; repeatable, symlinks skipped', collect, [])
    .option('--work <id>', 'Limit authored work scope by exact compiled work id')
    .option('--scenario <id>', 'Limit chapter scope, including continuing predecessors')
    .action(async (dir, opts) => {
      const { assetsCommand } = await import('./assets.ts');
      const report = await assetsCommand(resolve(dir), { scan: opts.scan, work: opts.work, scenario: opts.scenario });
      if (opts.format === 'json') json(result(resolve(dir), `${report.entries.length} asset/resource record(s)`, report));
      else {
        line(`Asset scope: work=${report.scope.work ?? 'all'}, scenario=${report.scope.scenario ?? 'all'}; scanned ${report.scope.scan.join(', ') || '(no directories)'}`);
        for (const entry of report.entries) {
          line(`${entry.path ?? entry.id}: ${entry.mime ?? entry.kind}, ${entry.bytes === null ? 'unknown size' : `${entry.bytes} bytes`}; ${entry.authorReference}; ${entry.publication}; visibility unknown`);
          for (const ref of entry.references) line(`  ${ref.workId ?? '?'} / ${ref.scenarioId ?? '?'} / ${ref.layer ?? '?'} / ${ref.elementId ?? '?'} / ${ref.source ?? '?'} (${ref.evidence})`);
        }
        for (const unknown of report.unknowns) line(`Unknown: ${unknown.source ?? '?'}: ${unknown.reason}`);
        for (const limitation of report.limitations) line(limitation);
      }
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
  const shareCommand = cloudCommand('share').description('Check, build, and publish to the cloud').argument('[dir]', 'Project directory', '.').addOption(format())
    .option('--new', 'Create a new share link').option('--title <title>', 'Share title (defaults to project name)')
    .option('--password [password]', 'Protect a private share (Pro); omit value for hidden terminal input or JOPLO_SHARE_PASSWORD').option('--no-password', 'Remove the existing access password (private shares only)')
    .option('--public', 'Publish publicly: portfolio and search engines').option('--private', 'Only people with the link can view')
    .option('--review', 'Also publish a private review link: independent works and every feature option').option('--no-review', 'Do not publish a review version').option('--json', 'Print structured JSON (non-interactive)')
    .option('--pr <number>', 'Attach a GitHub pull request (PR preview); repo, commit, and run URL come from GitHub Actions', integer('pr', 2147483647))
    .option('--repo <owner/name>', 'Repository for --pr outside GitHub Actions').option('--sha <commit>', 'Commit for --pr (defaults to the PR head or git HEAD)')
    .option('--scenario <id>', 'Share only this scenario; repeatable. Other works, scenarios, and pages are left out of the uploaded files (D75)', collect, [])
    .option('--work <id>', "Share one work entry: independent key or feature key (picked option; every option with --review); repeatable", collect, [])
    .option('--update <link>', 'Update this existing share (its link, for example from another computer without .joplo/cloud.json) and reuse its narration audio (D84)')
    .action(async (dir, opts) => {
      if (opts.json) opts.format = 'json';
      if (args.includes('--review') && args.includes('--no-review')) throw new JoploError('USAGE', '--review and --no-review are mutually exclusive');
      if (args.some(a => a === '--password' || a.startsWith('--password=')) && args.includes('--no-password')) throw new JoploError('USAGE', '--password and --no-password are mutually exclusive');
      const client = await cloudClient(opts.server, opts.format);
      const { share } = await import('./cloud-share.ts');
      const published = await share(client, dir, { ...opts, scenarios: opts.scenario, entryIds: opts.work }, async options => (await serverFunction('buildSite'))(options), () => serverFunction('renderStep'));
      if (opts.format === 'json') json(result(resolve(dir), 'Published', published.result));
      else {
        const scope = published.result.scope;
        line(`Published ${published.result.mode === 'review' ? 'the review version ' : ''}${scope ? 'a scoped share ' : ''}${published.result.url}\n${published.result.expiresAt ? `Expires at: ${terminalText(published.result.expiresAt)}` : 'Permanent link'}`);
        if (published.result.passwordProtected) line(PASSWORD_PROTECTED);
        if (published.result.review?.passwordProtected) line('The review version is protected with the same password.');
        if (scope) line(`Scope: ${scope.scenarios.length} scenario(s): ${scope.scenarios.join(', ')}. The main link and the review link are unchanged`);
        if (published.result.pr) { const { prCommentLine } = await import('./cloud-pr.ts'); const note = prCommentLine(published.result.pr, client.server); if (note) line(note); }
        // C27：免费分享不再过期；改为告诉作者账号用了多少空间
        if (published.result.review) line(`Published the review version ${published.result.review.url} (private)`);
        if (published.result.visibility) line(`Visibility: ${published.result.visibility}`);
        if (published.result.visibility === 'public') {
          const p = published.result.portfolio;
          if (p?.needsUsername) line(`${USERNAME_SETUP}${client.server}${p.setupPath}`);
          else if (p?.workUrl) line(`Portfolio: ${terminalText(p.workUrl)}`);
        }
        if (published.result.storage) line(`Storage: ${formatBytes(published.result.storage.usedBytes)} of ${formatBytes(published.result.storage.quotaBytes)} used (this share: ${formatBytes(published.result.storage.shareBytes)})`);
        line(`Add to README: ${terminalText(published.result.embed.markdown)}\nMore embed options: ${client.server}/shares/${published.result.shareId}`);
      }
    });
  shareCommand.command('list').description('List your Cloud shares').addOption(format()).option('--server <url>', 'Cloud server (overrides JOPLO_CLOUD_URL)').action(async opts => {
    const client = await cloudClient(opts.server, opts.format);
    const shares = await (await import('./cloud-shares.ts')).listCloudShares(client);
    if (opts.format === 'json') json(result(client.server, `${shares.length} share(s)`, { shares }));
    else if (!shares.length) line('No Cloud shares.');
    else for (const share of shares) line((await import('./cloud-shares.ts')).cloudShareLine(share));
  });
  const shareShow = async (id: string, opts: { server?: string; format?: string }) => {
    const client = await cloudClient(opts.server, opts.format);
    const share = await (await import('./cloud-shares.ts')).showCloudShare(client, id);
    if (opts.format === 'json') json(result(client.server, `${share.title} · v${share.version}`, share));
    else for (const text of (await import('./cloud-shares.ts')).cloudShareText(share)) line(text);
  };
  shareCommand.command('show').description('Read a Cloud share and its embed snippets').argument('<shareId>', 'Ten-character share id').addOption(format()).option('--server <url>', 'Cloud server (overrides JOPLO_CLOUD_URL)').action(shareShow);
  shareCommand.command('embed').description('Read embed snippets for an existing Cloud share').argument('<shareId>', 'Ten-character share id').addOption(format()).option('--server <url>', 'Cloud server (overrides JOPLO_CLOUD_URL)').action(shareShow);
  shareCommand.command('delete').description('Permanently delete a Cloud share (interactive confirmation, or --yes)').argument('<shareId>', 'Ten-character share id').option('--yes', 'Confirm permanent deletion; required in non-interactive mode').addOption(format()).option('--server <url>', 'Cloud server (overrides JOPLO_CLOUD_URL)').action(async (id, opts) => {
    const client = await cloudClient(opts.server, opts.format);
    await confirmDeletion(deps.interactive ?? client.interactive, `Permanently delete Cloud share ${id} and its published files?`, opts.yes);
    await (await import('./cloud-shares.ts')).deleteCloudShare(client, id);
    const summary = `Deleted Cloud share ${id}`;
    if (opts.format === 'json') json(result(client.server, summary, { shareId: id, deleted: true }));
    else line(summary);
  });
  const feedbackCommand = cloudCommand('feedback').description('Read cloud feedback, or watch local/cloud reviews').argument('[dir]', 'Project directory', '.').addOption(format())
    .option('--share <id>', 'Share id (defaults to .joplo/cloud.json)').option('--applied <ids>', 'Mark comma-separated decision ids as applied to the source').option('--ref <ref>', 'Source version for --applied (for example a commit SHA)').option('--expected-version <version>', 'Require this current share version for --applied', integer('expected-version'))
    .action(async (dir, opts) => {
      if ((opts.ref !== undefined || opts.expectedVersion !== undefined) && opts.applied === undefined) throw new JoploError('USAGE', '--ref and --expected-version apply only with --applied <ids>');
      const f = await import('./cloud-feedback.ts');
      const client = await cloudClient(opts.server, opts.format);
      const ids = opts.applied === undefined ? null : f.decisionIds(opts.applied);
      const shareId = await f.feedbackShareId(client, dir, opts.share);
      if (ids) {
        const data = await f.markApplied(client, shareId, ids, opts.ref, opts.expectedVersion);
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
    .option('--json', 'Print JSON').option('--all', 'Include completed and stopped sessions').option('--work <id>', 'Filter by independent work key or qualified option id')
    .action(async (dir, opts) => {
      const { reviewSessions, reviewSummary, reviewLine } = await import('./local-review.ts');
      const labels = await feedbackWorkLabels(dir);
      const sessions = reviewSessions(dir, { ...opts, workId: opts.work ? await feedbackWorkId(dir, opts.work) : undefined });
      if (opts.json) json(sessions.map(reviewSummary));
      else if (!sessions.length) line('No active reviews. Run joplo dev in this project, or use --all for history.');
      else sessions.forEach(s => line(reviewLine(s, labels)));
    });
  feedbackCommand.command('watch').description('Watch local events or poll cloud feedback; exit when the target option is confirmed').argument('[dir]', 'Project directory for local reviews', '.')
    .option('--local', 'Watch local review files without connecting to Cloud').option('--session <id>', 'Exact local review session')
    .option('--share <id>', 'Cloud share id (requires --work)').option('--work <id>', 'Standalone work key or qualified option id: feature.option')
    .option('--version <number>', 'Cloud share version; defaults to the first response', integer('version'))
    .option('--interval <seconds>', 'Cloud polling interval, 10–30 seconds (default: 15)', integer('interval', 30))
    .option('--after <seq>', 'Local replay cursor', cursor).option('--cursor <cursor>', 'Cloud event cursor from a previous event or Cloud cursor status line').option('--json', 'Stream one normalized JSON event per line')
    .option('--follow', 'With --local: follow every option and every new round of this project until the board stops')
    .option('--once', 'With --follow: exit 0 as soon as new feedback or an approval arrives (for hosts that wake the agent when a background command ends)')
    .option('--since <time>', 'With --follow: skip events created at or before this ISO time (the createdAt of the last event you handled)')
    .option('--server <url>', 'Cloud server (overrides JOPLO_CLOUD_URL)')
    .action(async (dir, opts, command) => {
      // 父命令的 --share / --server 在 watch 前后均能识别；拒绝把旧的写回标记用到监听命令。
      const all = command.optsWithGlobals();
      opts.json = opts.json || all.format === 'json';
      opts.workId = opts.work ? await feedbackWorkId(dir, opts.work) : undefined;
      if (all.applied !== undefined || all.ref !== undefined || all.expectedVersion !== undefined) throw new JoploError('USAGE', '--applied, --ref, and --expected-version cannot be used with feedback watch');
      const shareId = opts.share ?? all.share;
      const server = opts.server ?? all.server;
      if ((opts.once || opts.since !== undefined) && !opts.follow) throw new JoploError('USAGE', '--once and --since work with --local --follow');
      if (opts.local) {
        if (shareId !== undefined || server !== undefined || opts.interval !== undefined || opts.version !== undefined || opts.cursor !== undefined)
          throw new JoploError('USAGE', '--local cannot be combined with --share, --server, --interval, --version, or --cursor');
        opts.labels = await feedbackWorkLabels(dir);
        const { watchLocalReview, followLocalReviews } = await import('./local-review.ts');
        await withWatchSignal(signal => (opts.follow ? followLocalReviews : watchLocalReview)(dir, opts, { out: stdout, err: stderr }, signal));
      } else {
        if (opts.follow) throw new JoploError('USAGE', '--follow applies to local reviews: add --local');
        if (!shareId || opts.session !== undefined || opts.after !== undefined)
          throw new JoploError('USAGE', 'Choose --local [--session <id>] or --share <id> --work <key|feature.option>; --after applies only to local reviews');
        const { watchCloudFeedback, validateCloudWatchOptions } = await import('./cloud-feedback-watch.ts');
        validateCloudWatchOptions(opts);
        const { SHARE_ID } = await import('./cloud-feedback.ts');
        if (!SHARE_ID.test(shareId)) throw new JoploError('USAGE', 'share must be a 10-character share id');
        const client = await cloudClient(server, opts.json ? 'json' : 'text');
        await withWatchSignal(signal => watchCloudFeedback(client, shareId, opts, { out: stdout, err: stderr }, signal));
      }
    });
  const localReviewWrite = async (dir: string, opts: { work?: string; session?: string; body?: string; scenario?: string; position?: number; scene?: string; requestId?: string; approve?: boolean; format?: string }) => {
    const written = await (await import('./board-review.ts')).writeBoardReview(await boardClient(), resolve(dir), opts);
    const summary = written.type === 'approved' ? `Approved ${written.sessionId}` : `Submitted feedback to ${written.sessionId}`;
    if (opts.format === 'json') json(result(resolve(dir), summary, written));
    else line(`${summary}\nRequest: ${written.requestId}`);
  };
  feedbackCommand.command('submit').description('Submit feedback at an explicit scenario/position to a local review').argument('[dir]', 'Project directory', '.').requiredOption('--local', 'Write to the running local board')
    .option('--session <id>', 'Exact local review session').option('--work <id>', 'Standalone work key or qualified option id').requiredOption('--body <text>', 'Submitted feedback, 1-10000 characters')
    .requiredOption('--scenario <id>', 'Reviewed scenario id (not a playback action)').requiredOption('--position <n>', 'Executed step count: 0 is initial', position).option('--scene <id>', 'Visible scene id; defaults to the scene at this position').option('--request-id <uuid>', 'Idempotency key for a safe retry').addOption(format()).action(localReviewWrite);
  feedbackCommand.command('approve').description('Confirm a local option revision (does not change pick or publish)').argument('[dir]', 'Project directory', '.').requiredOption('--local', 'Write to the running local board')
    .option('--session <id>', 'Exact local review session').option('--work <id>', 'Standalone work key or qualified option id').option('--request-id <uuid>', 'Idempotency key for a safe retry').addOption(format()).action(async (dir, opts) => localReviewWrite(dir, { ...opts, approve: true }));
  feedbackCommand.command('comment').description('Submit a Cloud review comment at an explicit version and position').requiredOption('--share <id>', 'Cloud share id').requiredOption('--review-id <id>', 'Review link id from cloud /review/<id>')
    .requiredOption('--version <n>', 'Reviewed and expected current share version', integer('version')).requiredOption('--work <id>', 'Exact work id').requiredOption('--scenario <id>', 'Reviewed scenario id').requiredOption('--position <n>', 'Executed step count: 0 is initial', position)
    .option('--step-id <id>', 'Step id; required after a step and omitted at position 0').option('--layer <id>', 'Visible layer id').option('--element <id>', 'Reviewed element id').option('--element-label <label>', 'Element label (defaults to its id)')
    .requiredOption('--body <text>', 'Comment, 1-10000 characters').addOption(format()).option('--server <url>', 'Cloud server (overrides JOPLO_CLOUD_URL)').action(async opts => {
      const client = await cloudClient(opts.server, opts.format);
      const written = await (await import('./cloud-feedback-write.ts')).submitCloudComment(client, { shareId: opts.share, reviewId: opts.reviewId, body: opts.body, version: opts.version, workId: opts.work, scenario: opts.scenario, position: opts.position, stepId: opts.stepId, layer: opts.layer, element: opts.element, elementLabel: opts.elementLabel });
      if (opts.format === 'json') json(result(opts.share, 'Cloud comment submitted', written)); else line(`Submitted Cloud comment ${written.id}`);
    });
  feedbackCommand.command('resolve').description('Resolve a Cloud comment (or reopen it with --reopen)').argument('<commentId>', 'Cloud comment id').requiredOption('--share <id>', 'Cloud share id').option('--reopen', 'Reopen instead of resolve').addOption(format()).option('--server <url>', 'Cloud server (overrides JOPLO_CLOUD_URL)').action(async (commentId, opts) => {
    const client = await cloudClient(opts.server, opts.format);
    const written = await (await import('./cloud-feedback-write.ts')).resolveCloudComment(client, opts.share, commentId, !opts.reopen);
    if (opts.format === 'json') json(result(opts.share, opts.reopen ? 'Cloud comment reopened' : 'Cloud comment resolved', written)); else line(opts.reopen ? `Reopened Cloud comment ${commentId}` : `Resolved Cloud comment ${commentId}`);
  });
  feedbackCommand.command('decide').description('Record a Cloud pick/rule/answer decision with version protection').requiredOption('--share <id>', 'Cloud share id').requiredOption('--kind <kind>', 'pick, confirm_rule, reject_rule, or answer')
    .option('--feature <id>', 'Feature id; omit for a standalone work').option('--work <id>', 'Exact work id when the decision is work-scoped').requiredOption('--target <id>', 'Work, rule, or question id').option('--note <text>', 'Decision note; required for answer and reject_rule')
    .requiredOption('--expected-version <n>', 'Current share version the reviewer actually saw', integer('expected-version')).addOption(format()).option('--server <url>', 'Cloud server (overrides JOPLO_CLOUD_URL)').action(async opts => {
      const client = await cloudClient(opts.server, opts.format);
      const written = await (await import('./cloud-feedback-write.ts')).submitCloudDecision(client, { shareId: opts.share, kind: opts.kind, featureId: opts.feature, workId: opts.work, targetId: opts.target, note: opts.note, expectedVersion: opts.expectedVersion });
      if (opts.format === 'json') json(result(opts.share, 'Cloud decision recorded', written)); else line(`Recorded Cloud decision ${written.id}`);
    });
  feedbackCommand.command('retract').description('Retract an unapplied Cloud decision (append-only and idempotent)').argument('<decisionId>', 'Cloud decision id').requiredOption('--share <id>', 'Cloud share id').addOption(format()).option('--server <url>', 'Cloud server (overrides JOPLO_CLOUD_URL)').action(async (decisionId, opts) => {
    const client = await cloudClient(opts.server, opts.format);
    const written = await (await import('./cloud-feedback-write.ts')).retractCloudDecision(client, opts.share, decisionId);
    if (opts.format === 'json') json(result(opts.share, 'Cloud decision retracted', written)); else line(`Retracted Cloud decision ${decisionId}`);
  });
  feedbackCommand.command('vote').description('Vote for a Cloud option (a vote is not approval)').requiredOption('--share <id>', 'Cloud share id').requiredOption('--review-id <id>', 'Review link id').requiredOption('--feature <id>', 'Feature id').requiredOption('--work <id>', 'Exact option work id').requiredOption('--expected-version <n>', 'Current share version', integer('expected-version')).addOption(format()).option('--server <url>', 'Cloud server (overrides JOPLO_CLOUD_URL)').action(async opts => {
    const client = await cloudClient(opts.server, opts.format);
    const written = await (await import('./cloud-feedback-write.ts')).voteCloudReview(client, { shareId: opts.share, reviewId: opts.reviewId, featureId: opts.feature, workId: opts.work, expectedVersion: opts.expectedVersion });
    if (opts.format === 'json') json(result(opts.share, 'Cloud vote recorded', written)); else line('Cloud vote recorded; this is not an approval.');
  });
  const boardCommand = program.command('board').description('Manage the running local board; playback and fullscreen remain browser interactions');
  const boardProjects = async (opts: { format?: string }) => {
    const projects = await (await boardClient()).projects();
    if (opts.format === 'json') json(result('board', `${projects.length} project(s)`, { projects }));
    else if (!projects.length) line('No projects in the running board.');
    else for (const project of projects) line(`${project.id}  ${project.status}${project.errors ? ` (${project.errors} errors)` : ''}  ${terminalText(project.name)}  ${project.dir}`);
  };
  boardCommand.command('projects').description('List projects registered in the running board').addOption(format()).action(boardProjects);
  boardCommand.command('list').description('Alias for board projects').addOption(format()).action(boardProjects);
  boardCommand.command('add').description('Add and compile a project in the running board').argument('[dir]', 'Project directory', '.').addOption(format()).action(async (dir, opts) => {
    const added = await (await boardClient()).addProject(resolve(dir));
    if (opts.format === 'json') json(result(added.id, 'Project added', added));
    else line(`Added ${added.id}\n${added.url}`);
  });
  boardCommand.command('remove').description('Remove a project record without deleting project files').argument('[dir]', 'Project directory or board project id', '.').option('--yes', 'Confirm record removal; required in non-interactive mode').addOption(format()).action(async (dir, opts) => {
    await confirmDeletion(localInteractive(opts.format), `Remove ${dir} from the board? Project files will not be deleted.`, opts.yes);
    const removed = await (await boardClient()).removeProject(dir);
    if (opts.format === 'json') json(result(removed.id, 'Project record removed', { removed, filesDeleted: false }));
    else line(`Removed ${removed.id} from the board. Project files were not deleted.`);
  });
  boardCommand.command('appearance').description('Read or update board appearance (global without dir, project override with dir)').argument('[dir]', 'Project directory; omit for global defaults')
    .option('--theme <name>', 'Built-in or project theme name').option('--font <font>', 'hand, sans, serif, kai, or mono').option('--stroke <stroke>', 'rough or clean')
    .addOption(new Option('--reset <fields>', 'Reset theme, font, stroke, or all to inherited defaults').choices(['theme', 'font', 'stroke', 'all'])).addOption(format()).action(async (dir, opts) => {
      const client = await boardClient(), settings = await client.settings();
      const changes = [opts.theme !== undefined, opts.font !== undefined, opts.stroke !== undefined, opts.reset !== undefined].filter(Boolean).length;
      if (!changes) {
        const data = { settings, scope: dir === undefined ? 'global' : 'project', projectId: dir === undefined ? null : (await import('./board.ts')).boardProjectId(resolve(dir)) };
        if (opts.format === 'json') json(result('board', 'Board appearance', data)); else line(JSON.stringify(data, null, 2));
        return;
      }
      if (changes > 1) throw new JoploError('USAGE', 'Update one appearance field at a time, or use --reset all');
      const { THEME_NAME, isAppearanceFont, isAppearanceStroke } = await import('@joplo-app/core');
      if (opts.theme !== undefined && !THEME_NAME.test(opts.theme)) throw new JoploError('USAGE', 'Invalid theme name');
      if (opts.font !== undefined && !isAppearanceFont(opts.font)) throw new JoploError('USAGE', 'font must be hand, sans, serif, kai, or mono');
      if (opts.stroke !== undefined && !isAppearanceStroke(opts.stroke)) throw new JoploError('USAGE', 'stroke must be rough or clean');
      const patch = opts.reset === 'all' ? { theme: null, font: null, stroke: null } : opts.reset ? { [opts.reset]: null } : opts.theme !== undefined ? { theme: opts.theme } : opts.font !== undefined ? { font: opts.font } : { stroke: opts.stroke };
      const next = dir === undefined ? { ...settings, ...patch } : { ...settings, projects: { ...settings.projects, [(await import('./board.ts')).boardProjectId(resolve(dir))]: { ...settings.projects?.[(await import('./board.ts')).boardProjectId(resolve(dir))], ...patch } } };
      const saved = await client.writeSettings(next);
      if (opts.format === 'json') json(result('board', 'Board appearance updated', { settings: saved })); else line('Board appearance updated.');
    });
  boardCommand.command('open').description('Open project source in the configured editor (not a browser playback command)').argument('[dir]', 'Project directory', '.').option('--at <location>', 'Source file:line[:column]; defaults to the current board selection').addOption(format()).action(async (dir, opts) => {
    const at = opts.at ?? (await readSelection(resolve(dir))).selection?.at;
    if (!at) throw new JoploError('USAGE', 'Pass --at <file:line[:column]>, or select an element in the board first');
    await (await boardClient()).openEditor(resolve(dir), at);
    if (opts.format === 'json') json(result(resolve(dir), 'Opened in editor', { at })); else line(`Opened ${at} in the configured editor.`);
  });
  program.command('resources').argument('[dir]', 'Project directory', '.').option('--work <qid>', 'Generate resources for one independent work key or qualified option id').option('--dry-run', 'List missing persistent resources and estimated credits').option('--allow-spend', 'Authorize the displayed generation estimates').addOption(format()).action(async (dir, opts) => {
    const generateResources = await serverFunction('generateResources');
    const interactive = deps.interactive ?? (!!process.stdin.isTTY && !!process.stderr.isTTY && !process.env.CI);
    const data = await generateResources(resolve(dir), { work: opts.work, dryRun: !!opts.dryRun, allowSpend: !!opts.allowSpend, onProgress: s => stderr(`${s}\n`), confirm: interactive && opts.format !== 'json' ? deps.ask ?? (async message => {
      const { createInterface } = await import('node:readline/promises');
      const rl = createInterface({input:process.stdin,output:process.stderr});
      try { return /^(y|yes)$/i.test((await rl.question(`${message} [y/N] `)).trim()); } finally { rl.close(); }
    }) : undefined });
    const failed = !opts.dryRun && data.some(r => r.diagnostic);
    if (opts.format === 'json') json({ok:!failed,data}); else for (const item of data) line(JSON.stringify(item));
    if (failed) exitCode = 1;
  });
  program.command('check').argument('[dir]', 'Project directory', '.').addOption(format()).option('--work <qid>', 'Validate one independent work key or qualified option id').action(async (dir, opts) => {
    const report = await check(dir, opts.work);
    const summary = `${report.summary.error} error, ${report.summary.warning} warning, ${report.summary.info} info`;
    if (opts.format === 'json') {
      if (report.summary.error) json({ ...failure(new JoploError('INVALID_SCHEMA', summary, { diagnostics: report.diagnostics })), data: report });
      else json(result(report.name, summary, report, report.diagnostics));
    } else { for (const d of report.diagnostics) line(diagnosticLine(d)); line(summary); }
    if (report.summary.error) exitCode = 1;
  });
  const i18n = program.command('i18n').description('Author content in several languages (D84): source text in one language, translations in locales/<lang>.json');
  i18n.command('add').description('Add a content language, or add missing keys to it; writes locales/<lang>.json with "" for texts to translate')
    .argument('<lang>', 'Language: en, zh-CN, zh-TW, ja, ko, es, fr, de, pt-BR, ru').argument('[dir]', 'Project directory', '.')
    .option('--source <lang>', 'Language the source files are written in (needed the first time, when config has no locales)')
    .option('--prune', 'Remove entries no text uses any more').addOption(format())
    .action(async (lang, dir, opts) => {
      const { i18nAdd, i18nAddText } = await import('./i18n.ts');
      const r = await i18nAdd(dir, lang, { source: opts.source, prune: opts.prune });
      if (opts.format === 'json') json(result(r.file, `${r.untranslated} to translate`, r));
      else for (const l of i18nAddText(r)) line(l);
    });
  program.command('outline').description('Print works and their slices, steps and duration; features also show audience, cases, expected results and option coverage')
    .argument('[dir]', 'Project directory', '.').addOption(format()).option('--work <qid>', 'One independent work key or qualified option id').action(async (dir, opts) => {
      const { readOutline, outlineText } = await import('./outline.ts');
      const r = await readOutline(dir, opts.work);
      if (opts.format === 'json') json(r.outline ? result(r.name, `${r.outline.entries.length} feature(s)`, { outline: r.outline, summary: r.summary }, r.diagnostics) : { ...failure(new JoploError('INVALID_SCHEMA', `${r.summary.error} error`, { diagnostics: r.diagnostics })), data: { outline: null, summary: r.summary } });
      else for (const l of outlineText(r)) line(l);
      // 与 check 一致：有 error 时退出 1（大纲照常输出，编译不出 IR 时只写错误数）
      if (!r.outline || r.summary.error) exitCode = 1;
    });
  program.command('components').description('List catalog components, or show props and an example for the named ones from config.plugins')
    .argument('[names...]', 'Component names, use the full plugin namespace if ambiguous').action(async (names: string[]) => {
      const {plugins,error} = await projectPlugins('.');
      if (error) throw new JoploError('USAGE', `Could not read enabled plugins: ${error}`);
      stdout(names.length ? componentDetails(names, plugins) : componentIndex(plugins));
    });
  program.command('selection').argument('[dir]', 'Project directory', '.').addOption(format()).action(async (dir, opts) => {
    const data = await readSelection(dir);
    const summary = data.selection ? `${data.selection.at ?? 'No source location'}  ${oneLine(data.selection.label ?? '')}` : 'Nothing selected';
    if (opts.format === 'json') json(result(resolve(dir), summary, data));
    else { line(summary); for (const l of data.lines) line(`${l.number} | ${l.text}`); if (data.note) line(data.note); }
  });
  program.command('init').argument('[dir]', 'Project directory', '.').option('--name <name>', 'Project name (defaults to directory name)').option('--keep', 'Add missing files in a nonempty directory; preserve existing files')
    .option('--template <spec>', 'Template name from https://github.com/Joplo-app/joplo-templates default branch (starter by default; e.g. work); lowercase letters, digits and hyphens. Names take priority over local directories (use ./work). Also accepts local paths or github:owner/repo[/subdir][#ref]')
    .option('--no-skill', 'Do not install the agent skills (.claude/skills/joplo*, AGENTS.md block)')
    .action(async (dir, opts) => { for (const l of initSummary(await initProject(dir, opts.name, { keep: opts.keep, skill: opts.skill, template: opts.template }))) line(l); });
  program.command('skill').description('Read agent usage on demand or install a usage pointer')
    .argument('[topic]', 'authoring/demo/cases/check/review/publish/plugins, a plugin[/topic], or install')
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
        // 插件（D86）：当前目录是 Joplo 项目时，列出 config({ plugins }) 并输出插件自己的技能
        const { plugins, error } = await projectPlugins('.');
        const note = error ? `Could not read plugins from joplo.config.ts: ${error}\n` : '';
        const plugin = topic === undefined ? null : findPluginTopic(topic, plugins);
        if (plugin) stdout(pluginSkillTopic(plugin, topic?.split('/').slice(1).join('/') || undefined));
        else if (topic === undefined) stdout(`${skillIndex(await readCliVersion())}${pluginSkillIndex(plugins)}${note}`);
        else if (/^(?:plugin:|joplo-plugin-)/.test(topic)) throw new JoploError('USAGE', `${note}Plugin guide "${topic}" is not enabled in config.plugins. Run npx joplo skill to list enabled plugin guides.`);
        else stdout(skillTopic(topic));
      }
    });
  program.command('dev').argument('[dir]', 'Project directory', '.').option('--port <port>', 'Port (default: 4790)', integer('port', 65535)).option('--open', 'Open the browser').action(async (dir, opts) => {
    const startDev = await serverFunction('startDev');
    // 看板直接发布到云端（D76）：把登录与 share() 注入看板进程；加入已有看板时由那个进程自己的 CLI 提供
    const { cloudBridge } = await import('./cloud-bridge.ts');
    const cloud = cloudBridge({ version: deps.cliVersion ?? await readCliVersion(), deps: deps.cloud, build: async options => (await serverFunction('buildSite'))(options), render: () => serverFunction('renderStep') });
    const handle = await startDev({ projectDir: resolve(dir), port: opts.port, open: opts.open, log: s => stderr(oneLine(s) + '\n'), cloud });
    line(handle.url);
    // 已有存活的看板：项目已注册进去，本进程直接退出（不启动第二个看板进程）
    if (handle.attached) stderr(`Joined the running board. Open ${handle.url}\nThe existing board process hosts this project. Keep its terminal running: stopping it stops this link and feedback watch. If it exits, run joplo dev and feedback watch again.\n`);
    // stdout 只有地址（脚本会读）；在 stderr 告诉 Agent 用哪一条命令跟住这个项目的全部评审反馈。
    const shown = /^[\w./@:+-]+$/.test(dir) ? dir : `'${dir.replace(/'/g, `'\\''`)}'`;
    stderr(`Agents: stream reviewer feedback from this board with\n  npx joplo feedback watch ${shown} --local --follow --json\nIf you end your response while the user tests and your host wakes you when a background command ends, add --once (it prints how to resume with --since).\n`);
  });
  program.command('build').argument('[dir]', 'Project directory', '.').option('--out-dir <dir>', 'Output directory (default: project dist)').option('--out <dir>', 'Alias for --out-dir').option('--overwrite', 'Allow clearing a nonempty output directory')
    .option('--scenario <id>', 'Build only this scenario; repeatable (same scope as share --scenario)', collect, [])
    .option('--work <id>', "Build one work entry: independent key or feature key (picked option); repeatable", collect, [])
    .action(async (dir, opts) => {
    const buildSite = await serverFunction('buildSite');
    const output = opts.outDir ?? opts.out;
    const scope = opts.scenario.length || opts.work.length ? { scope: { scenarios: opts.scenario, entryIds: opts.work } } : {};
    // 项目没选过声音来源时，已登录 Joplo Cloud 就按 cloud 带上已生成的音频（D85，与看板同一规则；只读本机登录，不联网）
    const signedIn = await cloudClient().then(c => c.auth()).then(Boolean, () => false);
    const data = await buildSite({ projectDir: resolve(dir), outDir: output === undefined ? undefined : resolve(output), overwrite: opts.overwrite, ...scope, voiceDefault: signedIn ? 'cloud' : null });
    for (const d of data.diagnostics) line(diagnosticLine(d));
    line(`Built ${data.outDir} (${data.files.length} files)`);
    if (data.entries) line(`Works: ${data.entries.length} · ${data.entries.map(e => `${e.id} (${e.title})`).join(', ')}`);
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
  // 预览构建产物（D98）：素材是独立文件，只保证通过 HTTP 打开；dir 可以是构建输出目录，或项目目录（用它的 dist/）
  program.command('preview').argument('[dir]', 'Built site directory, or a project directory (uses its dist/)', '.').option('--port <port>', 'Port (default: 4799; a free port if taken)', integer('port', 65535)).action(async (dir, opts) => {
    const startPreview = await serverFunction('startPreview');
    const base = resolve(dir);
    const { existsSync } = await import('node:fs');
    const site = existsSync(resolve(base, 'index.html')) ? base : resolve(base, 'dist');
    let handle;
    try { handle = await startPreview({ dir: site, port: opts.port ?? 4799 }); }
    catch (e) { if (opts.port === undefined && (e as { code?: string }).code === 'EADDRINUSE') handle = await startPreview({ dir: site, port: 0 }); else throw e; }
    line(handle.url);
    stderr(`Serving ${site} (read-only). Press Ctrl+C to stop.\n`);
  });
  program.command('render').argument('[dir]', 'Project directory', '.').requiredOption('--scenario-id <qid>', 'Scenario ID').option('--step-id <qid>', 'Position after this step; defaults to the initial state')
    .option('--theme <theme>', 'Theme: built-in (sketch, clean, blueprint, nord, dracula, solarized-light, terminal, kraft, contrast) or project themes/<name>.css; defaults to the project theme').option('--out <file>', 'Screenshot / film / video output file; frames-out writes its own directory')
    .option('--width <pixels>', 'Screenshot width (stage width follows the page viewport); with --video the video resolution, stage centered on the theme background (e.g. 1920x1080, 1080x1920); requires height', integer('width')).option('--height <pixels>', 'Screenshot / video height; requires width', integer('height'))
    .option('--scale <scale>', 'Pixel scale', scale).option('--overwrite', 'Allow overwriting the screenshot')
    .option('--content <lang>', 'Author content language from config locales (D84); defaults to the source language')
    .option('--audit-layout', 'Measure actual text/clipping/safe-area geometry; static screenshot or --film only')
    .option('--audit-content <selector-or-rect>', 'Content frame: CSS selector or x,y,width,height relative to the export root')
    .option('--audit-safe-area <selector-or-rect>', 'Reserved area for declared important content; repeatable', collect, [])
    .option('--audit-important <selector>', 'Important elements: CSS selector; repeatable', collect, [])
    .option('--audit-exclude <selector>', 'Exclude decorations or intentional overlaps and their subtree; repeatable', collect, [])
    .option('--audit-every-ms <ms>', 'Diagnostic probe interval in engine ms, 20–1000; phase deadlines sampled separately', Number)
    .option('--crop <selector-or-rect>', 'Crop to CSS selector or x,y,width,height in CSS pixels')
    .option('--viewport <size>', 'Logical stage WIDTHxHEIGHT, shared by layout, camera and overlays')
    .option('--no-frame', 'Omit the device frame')
    .option('--timeline <file>', 'Write versioned actual playback timestamps')
    .option('--frames-out <dir>', 'Export offline JPEG frame sequence with timeline.json')
    .option('--fps <n>', 'With --frames-out: frames per second (default 30)', Number)
    .option('--chapter-timeout <ms>', 'Maximum wall-clock processing time per film chapter (default 180000)', integer('chapter-timeout'))
    .option('--checkpoint <file>', 'Save film progress at chapter boundaries')
    .option('--resume', 'Replay engine state and reuse verified checkpoint image analysis')
    .option('--sample-ms <ms>', 'Film computation interval, 20–250 ms (default 50); larger values can miss brief CUTs', integer('sample-ms'))
    .option('--sheet', 'Storyboard: every step of the scenario in one image, with step number, caption, and narration under each frame')
    .option('--columns <n>', 'Storyboard / film columns (with --sheet default 3, with --film default 8)', integer('columns'))
    .option('--film', 'Film strip: play the scenario on a frozen engine clock and sample a frame every --every ms, with time, step, adjacent-frame change, hard cuts, and still runs marked; one page per scenario')
    .option('--video', 'Record a .webm of the scenario playing in real time (same recorder as the board export), with the media plugins\' music and generated narration on its audio track')
    .option('--silent', 'With --video: omit all audio while keeping playback timing')
    .option('--voice <mode>', 'Playback voice: real uses generated clip timing; estimate is silent with estimated timing; off reads nothing (video/frames default real, film defaults estimate)')
    .option('--hide <items>', 'With playback exports: comma list of player elements to leave out: cover, cursor, title (step title bar and completion badge), subtitles')
    .option('--clean', 'With playback exports: same as --hide cover,cursor,title,subtitles')
    .option('--srt <file>', 'With --video: also write the subtitles as a SubRip file timed to the video')
    .option('--chain', 'With --film/--video/--frames-out: play the next chapters of the work in published order, to the last one')
    .option('--every <ms>', 'With --film: save one cell every N ms (default 250); computation remains --sample-ms', integer('every'))
    .option('--frames <dir>', 'With --film: also save each cell as a JPEG in this directory')
    .option('--format <format>', 'With --film: text or json summary', 'text').action(async (dir, opts) => {
      if (!opts.out && !opts.framesOut) throw new JoploError('USAGE', '--out is required unless --frames-out is used');
      const viewportParts = opts.viewport ? /^(\d+)x(\d+)$/.exec(opts.viewport) : null;
      if (opts.viewport && !viewportParts) throw new JoploError('USAGE', '--viewport must be WIDTHxHEIGHT');
      const cropParts = opts.crop && /^-?[\d.]+,-?[\d.]+,[\d.]+,[\d.]+$/.test(opts.crop) ? opts.crop.split(',').map(Number) : null;
      const { auditOptions } = await import('./layout-audit.ts');
      const auditLayout = auditOptions(opts);
      if (auditLayout && (opts.sheet || opts.video || opts.framesOut)) throw new JoploError('USAGE', '--audit-layout currently supports static screenshots or --film; use --film for motion diagnostics');
      if (auditLayout && opts.resume) throw new JoploError('USAGE', '--audit-layout requires a fresh render; do not combine with --resume');
      if (auditLayout && opts.sampleMs !== undefined && opts.sampleMs > 50) throw new JoploError('USAGE', 'Motion layout audit requires --sample-ms <= 50');
      const geometry = { ...(auditLayout ? { auditLayout } : {}), ...(viewportParts ? { logicalViewport: { width: Number(viewportParts[1]), height: Number(viewportParts[2]) } } : {}), ...(opts.frame === false ? { noFrame: true } : {}), ...(opts.crop ? { crop: cropParts ? { x: cropParts[0], y: cropParts[1], width: cropParts[2], height: cropParts[3] } : opts.crop } : {}) };
      if ((opts.width === undefined) !== (opts.height === undefined)) throw new JoploError('USAGE', 'width and height must be provided together');
      if ([opts.sheet, opts.film, opts.video, opts.framesOut].filter(Boolean).length > 1) throw new JoploError('USAGE', '--sheet, --film, --video and --frames-out are separate modes; pick one');
      if ((opts.chain || opts.every !== undefined || opts.frames) && !opts.film && !opts.video && !opts.framesOut) throw new JoploError('USAGE', '--chain, --every and --frames need --film (or --video for --chain)');
      if ((opts.voice !== undefined || opts.hide !== undefined || opts.clean || opts.timeline) && !opts.video && !opts.framesOut && !opts.film) throw new JoploError('USAGE', '--voice, --hide, --clean and --timeline need playback export');
      if (opts.silent && !opts.video) throw new JoploError('USAGE', '--silent needs --video');
      if (opts.srt && !opts.video) throw new JoploError('USAGE', '--srt needs --video');
      if (opts.fps !== undefined && !opts.framesOut) throw new JoploError('USAGE', '--fps needs --frames-out');
      if ((opts.sampleMs !== undefined || opts.checkpoint || opts.resume || opts.chapterTimeout !== undefined) && !opts.film) throw new JoploError('USAGE', '--sample-ms, --checkpoint, --resume and --chapter-timeout need --film');
      if (opts.film || opts.video || opts.framesOut) {
        if (opts.stepId !== undefined) throw new JoploError('USAGE', '--film/--video play the whole scenario; do not combine with --step-id');
        const { askYesNo, isInteractive, withExportComponent } = await import('./setup.ts');
        const exportHide = (opts.clean ? ['cover', 'cursor', 'title', 'subtitles'] : String(opts.hide ?? '').split(',').map((x: string) => x.trim()).filter(Boolean)) as ('cover' | 'cursor' | 'title' | 'subtitles')[];
        const base = { ...geometry, ...(opts.voice ? { voice: opts.voice } : {}), ...(exportHide.length ? { hide: exportHide } : {}), ...(opts.timeline ? { timeline: resolve(opts.timeline) } : {}), ...(opts.width !== undefined ? { width: opts.width, height: opts.height } : {}), projectDir: resolve(dir), scenarioId: opts.scenarioId, theme: opts.theme, out: resolve(opts.out ?? `${opts.framesOut}/film.png`), overwrite: opts.overwrite, chain: !!opts.chain, ...(opts.content ? { content: opts.content } : {}) };
        const setup = { server: setupServer, interactive: deps.interactive ?? isInteractive(), ask: deps.ask ?? askYesNo, io: setupIo() };
        if (opts.framesOut) {
          const renderFrames = await serverFunction('renderFrames');
          const result = await withExportComponent(() => renderFrames({ ...base, ...(opts.voice ? { voice: opts.voice } : {}), framesOut: resolve(opts.framesOut), fps: opts.fps, scale: opts.scale }), setup);
          json(result); return;
        }
        if (opts.video) {
          const renderVideo = await serverFunction('renderVideo');
          // 未知项交给 renderVideo 报 USAGE（带可用项）
          const hide = (opts.clean ? ['cover', 'cursor', 'title', 'subtitles'] : String(opts.hide ?? '').split(',').map((x: string) => x.trim()).filter(Boolean)) as ('cover' | 'cursor' | 'title' | 'subtitles')[];
          const video = await withExportComponent(() => renderVideo({ ...base, ...(opts.silent ? { audio: false } : {}), ...(opts.width !== undefined ? { width: opts.width, height: opts.height } : {}), ...(opts.voice !== undefined ? { voice: opts.voice } : {}), ...(hide.length ? { hide } : {}), ...(opts.srt ? { srt: resolve(opts.srt) } : {}) }), setup);
          line(video.path);
          if (video.srt) line(video.srt);
          line(`${video.size.width}×${video.size.height} · voice ${video.voice.mode}`);
          // 没有音频的旁白按估算时长停留：列出来，作者可以先 joplo voice 再录
          if (video.voice.mode === 'real' && video.voice.missing.length) {
            line(`${video.voice.missing.length} narration line(s) had no generated audio and used estimated timing (run npx joplo voice, then record again):`);
            for (const m of video.voice.missing.slice(0, 10)) line(`  - ${m.role ? `${m.role}: ` : ''}${m.text.length > 70 ? `${m.text.slice(0, 69)}…` : m.text}`);
            if (video.voice.missing.length > 10) line(`  … ${video.voice.missing.length - 10} more`);
          }
          return;
        }
        const renderFilm = await serverFunction('renderFilm');
        const film = await withExportComponent(() => renderFilm({ ...base, ...(opts.chapterTimeout ? { chapterTimeoutMs: opts.chapterTimeout } : {}), ...(opts.checkpoint ? { checkpoint: resolve(opts.checkpoint) } : {}), ...(opts.resume ? { resume: true } : {}), ...(opts.sampleMs ? { sampleMs: opts.sampleMs } : {}), ...(opts.every ? { every: opts.every } : {}), ...(opts.columns ? { columns: opts.columns } : {}), ...(opts.frames ? { frames: resolve(opts.frames) } : {}) }), setup);
        if (opts.format === 'json') { json(film); return; }
        for (const f of film.files) line(f);
        const s = (ms: number) => `${(ms / 1000).toFixed(2)}s`;
        line(`duration ${s(film.durationMs)} · ${film.samples} frames every ${film.sampleMs} ms · max adjacent diff ${(film.maxDiff * 100).toFixed(1)}%`);
        for (const warning of film.warnings) stderr(oneLine(warning) + '\n');
        for (const b of film.boundaries.filter(b => b.chapter)) line(`chapter → ${b.scenarioId} at ${s(b.atMs)}: max adjacent diff ${(b.maxDiff * 100).toFixed(1)}%, changed ${(b.maxChanged * 100).toFixed(0)}%`);
        for (const c of film.cuts) line(`CUT ${s(c.atMs)} ${c.scenarioId} step ${c.position}: ${(c.changed * 100).toFixed(0)}% of pixels changed in one frame`);
        for (const x of film.stills) line(`STILL ${s(x.fromMs)}–${s(x.toMs)} (${s(x.toMs - x.fromMs)}) ${x.scenarioId} step ${x.position}`);
        return;
      }
      if (opts.sheet) {
        if (opts.stepId !== undefined || opts.width !== undefined) throw new JoploError('USAGE', '--sheet renders every step; do not combine it with --step-id, --width, or --height');
        const renderSheet = await serverFunction('renderSheet');
        const { askYesNo, isInteractive, withExportComponent } = await import('./setup.ts');
        const sheet = await withExportComponent(() => renderSheet({ ...geometry, projectDir: resolve(dir), scenarioId: opts.scenarioId, theme: opts.theme, out: resolve(opts.out), overwrite: opts.overwrite, ...(opts.columns ? { columns: opts.columns } : {}), ...(opts.content ? { content: opts.content } : {}) }),
          { server: setupServer, interactive: deps.interactive ?? isInteractive(), ask: deps.ask ?? askYesNo, io: setupIo() });
        line(sheet.path);
        for (const warning of sheet.warnings) stderr(oneLine(warning) + '\n');
        return;
      }
      const renderStep = await serverFunction('renderStep');
      const { askYesNo, isInteractive, withExportComponent } = await import('./setup.ts');
      const data = await withExportComponent(() => renderStep({ ...geometry, projectDir: resolve(dir), scenarioId: opts.scenarioId, stepId: opts.stepId, theme: opts.theme, out: resolve(opts.out),
        viewport: opts.width === undefined ? undefined : { width: opts.width, height: opts.height }, scale: opts.scale, overwrite: opts.overwrite, ...(opts.content ? { content: opts.content } : {}) }),
        { server: setupServer, interactive: deps.interactive ?? isInteractive(), ask: deps.ask ?? askYesNo, io: setupIo() });
      line(data.path);
      if (data.audit) line(`Layout audit: ${data.audit.path} · ${data.audit.findings} warning(s), ${data.audit.samples} sample(s)`);
      for (const warning of data.warnings) stderr(oneLine(warning) + '\n');
    });
  try { await program.parseAsync(args, { from: 'user' }); }
  catch (e) {
    if (e instanceof CommanderError && ['commander.helpDisplayed', 'commander.help', 'commander.version'].includes(e.code)) return 0;
    const f = failure(e instanceof CommanderError ? new JoploError('USAGE', e.message) : e);
    const wantsJson = args.includes('--json') || args.some((arg, i) => arg === '--format=json' || arg === '--format' && args[i + 1] === 'json');
    if (args[0] === 'feedback' && (args.includes('watch') || args.includes('list'))) stderr((args.includes('--json') || wantsJson ? JSON.stringify(f) : `${f.error.code}  ${f.error.message.split('\n').map(line => terminalText(line)).join('\n')}`) + '\n');
    else if (wantsJson) json(f); else line(`${f.error.code}  ${oneLine(terminalText(f.error.message))}`);
    // 6：账号容量不足（C27），与 QUOTA_EXCEEDED 的其他种类（每小时限额，可以稍后重试）区分
    const storageFull = f.error.code === 'QUOTA_EXCEEDED' && (f.error.details as { kind?: unknown } | undefined)?.kind === 'storage';
    // 7：Joplo Cloud 朗读额度不够（D85，joplo voice）；已生成的音频保留
    return ['USAGE', 'CHOICE_REQUIRED'].includes(f.error.code) ? 2 : ['AUTH_REQUIRED', 'AUTH_EXPIRED'].includes(f.error.code) ? 3 : f.error.code === 'EXPORT_COMPONENT_MISSING' ? 4 : storageFull ? 6 : f.error.code === 'TTS_QUOTA_EXCEEDED' ? 7 : 1;
  }
  return exitCode;
}

async function feedbackWorkId(dir: string, id: string): Promise<string> {
  const { existsSync } = await import('node:fs');
  if (!existsSync(resolve(dir, 'joplo.config.ts'))) return id;
  const { checkWithProject } = await import('./check.ts');
  const { resolveWorkId } = await import('./work.ts');
  const r = await checkWithProject(dir);
  if (!r.project) throw new JoploError('INVALID_SCHEMA', 'The project must compile to resolve an independent work key');
  return resolveWorkId(r.project, id);
}

async function feedbackWorkLabels(dir: string): Promise<Record<string, string>> {
  const { existsSync } = await import('node:fs');
  const { join } = await import('node:path');
  if (!existsSync(join(dir, 'works'))) return {};
  const { checkWithProject } = await import('./check.ts');
  const { entriesOf } = await import('@joplo-app/core');
  const r = await checkWithProject(dir);
  return Object.fromEntries(r.project ? entriesOf(r.project).flatMap(e => e.featureId === null && e.workId ? [[e.workId, e.id]] : []) : []);
}
