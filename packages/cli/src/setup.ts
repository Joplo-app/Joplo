/**
 * `joplo setup export`（D66）：安装 / 检查 / 删除 Joplo 托管的导出组件（Playwright + Chromium，装在 JOPLO_HOME 下，不改项目）。
 * 以及 render 缺少导出组件时的处理：交互终端询问（默认否）；非交互（Agent / CI）直接以 EXPORT_COMPONENT_MISSING、退出码 4 结束，不下载。
 */
import { createInterface } from 'node:readline/promises';
import { JoploError } from '@joplo-app/core';
import type * as Server from '@joplo-app/server';

export type SetupServer = Pick<typeof Server, 'exportRuntimeStatus' | 'installExportRuntime' | 'uninstallExportRuntime' | 'EXPORT_DOWNLOAD_MB' | 'PLAYWRIGHT_VERSION' | 'SETUP_COMMAND'>;

export type SetupIo = {
  /** 进度与说明（stderr）。 */
  err: (s: string) => void;
  /** stderr 是不是终端：是时进度在同一行刷新，否则每 10% 打一行。 */
  tty: boolean;
};

/** 交互终端：stdin 与 stderr 都是 TTY，且不在 CI 里。 */
export function isInteractive(env: Record<string, string | undefined> = process.env): boolean {
  return !!process.stdin.isTTY && !!process.stderr.isTTY && !env.CI;
}

/** 在终端问一个是 / 否问题，默认否（直接回车、EOF 都是否）。 */
export async function askYesNo(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const a = (await rl.question(`${question} [y/N] `)).trim().toLowerCase();
    return a === 'y' || a === 'yes';
  } catch {
    return false;
  } finally {
    rl.close();
  }
}

const PHASE: Record<Server.InstallProgress['phase'], string> = { package: 'Installing playwright-core', browser: 'Downloading Chromium', verify: 'Checking Chromium', done: 'Done' };

/** 安装进度的打印器：TTY 同一行刷新；否则阶段变化或每过 10% 打一行。 */
export function progressPrinter(io: SetupIo): { onProgress: (p: Server.InstallProgress) => void; end: () => void } {
  let lastPhase = '';
  let lastBucket = -1;
  let drawn = false;
  return {
    onProgress: (p) => {
      if (p.phase === 'done') return; // 结果由调用方打印
      const size = p.totalMB ? ` of ${p.totalMB} MiB` : '';
      const text = `${p.phase === 'browser' ? p.message : PHASE[p.phase]}… ${p.percent}%${p.phase === 'browser' ? size : ''}`;
      if (io.tty) {
        io.err(`\r\x1b[2K${text}`);
        drawn = true;
        return;
      }
      const bucket = Math.floor(p.percent / 10);
      if (p.phase === lastPhase && bucket === lastBucket) return;
      lastPhase = p.phase;
      lastBucket = bucket;
      io.err(text + '\n');
    },
    end: () => {
      if (drawn) io.err('\n');
      drawn = false;
    },
  };
}

export type SetupOutcome = { summary: string; data: Record<string, unknown>; code: number };

/** setup export 的三种操作。不读写项目目录。 */
export async function setupExport(server: SetupServer, opts: { uninstall?: boolean; force?: boolean; status?: boolean }, io: SetupIo): Promise<SetupOutcome> {
  if ([opts.uninstall, opts.force, opts.status].filter(Boolean).length > 1) throw new JoploError('USAGE', 'Use only one of --status, --force, and --uninstall');
  if (opts.uninstall) {
    const r = server.uninstallExportRuntime();
    return { summary: r.removed.length ? `Removed the export component (${r.removed.join(', ')})` : 'The export component is not installed; nothing to remove', data: { removed: r.removed }, code: 0 };
  }
  const st = server.exportRuntimeStatus({ projectDir: process.cwd() });
  if (opts.status) {
    const summary =
      st.source === 'managed' ? `Export component is ready: Playwright ${st.version} + Chromium at ${st.dir}`
      : st.source === 'project' ? `Using the Playwright already in this project. To use Joplo's own export component instead, run: ${st.command} (about ${st.downloadMB} MB download)`
      : `Export component is not installed. Run: ${st.command} (about ${st.downloadMB} MB download)`;
    return { summary, data: { ...st }, code: st.ready ? 0 : 4 };
  }
  if (st.source === 'managed' && !opts.force) return { summary: `Export component is already installed: ${st.dir} (reinstall with --force)`, data: { ...st, alreadyInstalled: true }, code: 0 };
  io.err(`Installing the Joplo export component: Playwright ${server.PLAYWRIGHT_VERSION} + Chromium headless shell, about ${server.EXPORT_DOWNLOAD_MB} MB download, into ${st.dir}. Project files are not changed.\n`);
  const printer = progressPrinter(io);
  try {
    const r = await server.installExportRuntime({ force: opts.force, onProgress: printer.onProgress });
    printer.end();
    return { summary: `Export component is ready: ${r.dir}`, data: { ...server.exportRuntimeStatus(), alreadyInstalled: r.alreadyInstalled, removedOld: r.removedOld }, code: 0 };
  } catch (e) {
    printer.end();
    throw e;
  }
}

const isMissing = (e: unknown) => e instanceof JoploError && e.code === 'EXPORT_COMPONENT_MISSING';

/**
 * render 缺少导出组件时：交互终端询问是否安装（默认否），装好后重试一次；非交互直接抛出（退出码 4），绝不自动下载。
 */
export async function withExportComponent<T>(run: () => Promise<T>, o: { server: () => Promise<SetupServer>; interactive: boolean; ask: (q: string) => Promise<boolean>; io: SetupIo }): Promise<T> {
  try {
    return await run();
  } catch (e) {
    if (!isMissing(e) || !o.interactive) throw e;
    const server = await o.server();
    const ok = await o.ask(`Screenshots need the Joplo export component (Playwright ${server.PLAYWRIGHT_VERSION} + Chromium, about ${server.EXPORT_DOWNLOAD_MB} MB download). It is installed once for this computer, not into your project. Install it now?`);
    if (!ok) throw e;
    await setupExport(server, {}, o.io);
    return run();
  }
}
