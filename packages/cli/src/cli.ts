import { Command, CommanderError, Option } from 'commander';
import { resolve } from 'node:path';
import { COMPONENT_DOCS, guide, JoploError, skillIndex, skillTopic } from '@tokenroll/joplo-core';
import type * as Server from '@tokenroll/joplo-server';
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
};
const integer = (name: string, max = Number.MAX_SAFE_INTEGER) => (text: string) => {
  const n = Number(text);
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(n) || n < 1 || n > max) throw new JoploError('USAGE', `${name} 必须是 1–${max} 的整数`);
  return n;
};
const scale = (text: string) => {
  const n = Number(text);
  if (!Number.isFinite(n) || n <= 0) throw new JoploError('USAGE', 'scale 必须为正数');
  return n;
};

/** 每次创建独立 commander 实例，测试无需启动真实服务或占用固定端口。 */
export async function runCli(args: string[], deps: Dependencies = {}): Promise<number> {
  const stdout = deps.stdout ?? (s => { process.stdout.write(s); });
  const stderr = deps.stderr ?? (s => { process.stderr.write(s); });
  const line = (s: string) => stdout(s + '\n');
  const json = (value: unknown) => line(JSON.stringify(value));
  let exitCode = 0;
  const serverPackage = '@tokenroll/joplo-server';
  const loadServer = deps.loadServer ?? (() => import(serverPackage));
  async function serverFunction<K extends 'startDev' | 'buildSite' | 'renderStep'>(name: K): Promise<typeof Server[K]> {
    let module: Record<string, unknown>;
    try { module = await loadServer(); }
    catch (e) { throw new JoploError('UNSUPPORTED_ACTION', `@tokenroll/joplo-server 无法加载 ${name}：${e instanceof Error ? e.message : String(e)}`); }
    if (typeof module[name] !== 'function') throw new JoploError('UNSUPPORTED_ACTION', `@tokenroll/joplo-server 尚未提供 ${name}；请使用实现 IR v2 服务契约的版本`);
    return module[name] as typeof Server[K];
  }
  const program = new Command().name('joplo').description('Joplo：用 TSX 创作、演示和发布功能设计').exitOverride()
    .configureOutput({ writeOut: stdout, writeErr: stderr, outputError: () => {} });
  // 读取项目的命令先检查项目里的 @tokenroll/joplo-kit 与 CLI 是否同一版本（只提示，不阻止）
  program.hook('preAction', (_root, action) => {
    for (const note of projectNotes(resolve(String(action.args[0] ?? '.')), action.name(), { cli: deps.cliVersion })) stderr(note + '\n');
  });
  const format = () => new Option('--format <format>', '输出格式').choices(['text', 'json']).default('text');
  program.command('check').argument('[dir]', '项目目录', '.').addOption(format()).option('--option <qid>', '仅校验指定方案').action(async (dir, opts) => {
    const report = await check(dir, opts.option);
    const summary = `${report.summary.error} error, ${report.summary.warning} warning, ${report.summary.info} info`;
    if (opts.format === 'json') {
      if (report.summary.error) json({ ...failure(new JoploError('INVALID_SCHEMA', summary, { diagnostics: report.diagnostics })), data: report });
      else json(result(report.name, summary, report, report.diagnostics));
    } else { for (const d of report.diagnostics) line(diagnosticLine(d)); line(summary); }
    if (report.summary.error) exitCode = 1;
  });
  program.command('selection').argument('[dir]', '项目目录', '.').addOption(format()).action(async (dir, opts) => {
    const data = await readSelection(dir);
    const summary = data.selection ? `${data.selection.at ?? '无源位置'}  ${oneLine(data.selection.label ?? '')}` : '当前没有选中';
    if (opts.format === 'json') json(result(resolve(dir), summary, data));
    else { line(summary); for (const l of data.lines) line(`${l.number} | ${l.text}`); if (data.note) line(data.note); }
  });
  program.command('init').argument('<dir>').option('--name <name>', '项目名（默认目录名）').option('--keep', '目录非空时只补缺失的文件，已有文件不改动')
    .action(async (dir, opts) => { for (const l of initSummary(await initProject(dir, opts.name, { keep: opts.keep }))) line(l); });
  program.command('skill').description('按需读取 Agent 用法，或安装用法入口')
    .argument('[topic]', 'authoring/components/cases/check/selection/publish，或 install')
    .argument('[dir]', 'install 的目标项目目录')
    .option('--force', '覆盖被修改过的 SKILL.md')
    .option('--diff', '只显示 unified diff，不写入')
    .option('--agents-md', '即使 AGENTS.md 不存在也创建托管段')
    .action(async (topic, dir, opts) => {
      if (topic === 'install') {
        const installed = await installSkill(dir ?? '.', await readCliVersion(), opts);
        stdout(installed.output); exitCode = installed.code;
      } else {
        if (dir !== undefined || opts.force || opts.diff || opts.agentsMd) throw new JoploError('USAGE', 'dir、--force、--diff、--agents-md 只适用于 joplo skill install');
        stdout(topic === undefined ? skillIndex(await readCliVersion(), COMPONENT_DOCS) : skillTopic(topic, COMPONENT_DOCS));
      }
    });
  program.command('guide').description('joplo skill authoring 的兼容别名').action(() => { stdout(guide()); });
  program.command('dev').argument('[dir]', '项目目录', '.').option('--port <port>', '端口（默认 4790）', integer('port', 65535)).option('--open', '打开浏览器').action(async (dir, opts) => {
    const startDev = await serverFunction('startDev');
    const handle = await startDev({ projectDir: resolve(dir), port: opts.port, open: opts.open, log: s => stderr(oneLine(s) + '\n') });
    line(handle.url);
  });
  program.command('build').argument('[dir]', '项目目录', '.').option('--out-dir <dir>', '输出目录（默认项目 dist）').option('--overwrite', '允许清空非空输出目录').action(async (dir, opts) => {
    const buildSite = await serverFunction('buildSite');
    const data = await buildSite({ projectDir: resolve(dir), outDir: opts.outDir === undefined ? undefined : resolve(opts.outDir), overwrite: opts.overwrite });
    for (const d of data.diagnostics) line(diagnosticLine(d));
    line(`已构建 ${data.outDir}（${data.files.length} 文件）`);
    if (data.diagnostics.some(d => d.severity === 'error')) exitCode = 1;
  });
  program.command('render').argument('[dir]', '项目目录', '.').requiredOption('--scenario-id <qid>', '场景 ID').option('--step-id <qid>', '步骤执行后的位置；默认初始状态')
    .addOption(new Option('--theme <theme>').choices(['sketch', 'clean'])).requiredOption('--out <file>', '截图文件')
    .option('--width <pixels>', '视口宽度，需同时提供 height', integer('width')).option('--height <pixels>', '视口高度，需同时提供 width', integer('height'))
    .option('--scale <scale>', '像素倍率', scale).option('--overwrite', '允许覆盖截图').action(async (dir, opts) => {
      if ((opts.width === undefined) !== (opts.height === undefined)) throw new JoploError('USAGE', 'width 与 height 必须同时提供');
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
    if (wantsJson) json(f); else line(`${f.error.code}  ${oneLine(f.error.message)}`);
    return f.error.code === 'USAGE' ? 2 : 1;
  }
  return exitCode;
}
