import { useBoardI18n } from '../i18n/board/context';
import { boardEnglish, type BoardMessages } from '../i18n/board/dictionaries';
import type { Text } from '../i18n/messages';
import { LocalText } from '../i18n/LocalText';
import { m } from '../i18n/board/messages';
/**
 * 导出组件（D66，只在本机看板）：图片 / 视频导出需要的 Playwright + Chromium 由 Joplo 装在 JOPLO_HOME 下，不装进项目。
 *
 * - 状态：打开看板时读 `GET …/export/runtime`（托管运行时或项目里已有的 Playwright 都算可用）；导出时遇到
 *   EXPORT_COMPONENT_MISSING 会改回“未安装”。读不到（旧服务端）时视为可用，导出照旧，失败提示照旧。
 * - 安装：只有用户点「安装导出组件（约 N MB）」或提示里的「安装并导出」才开始（带本机令牌的 POST）；进度用 SSE 推送，
 *   显示在「导出」按钮的进度环和菜单顶部的卡片里（关掉菜单不会中断）。
 * - 装好后：继续刚才点的导出（图片或视频）；失败时卡片和提示说明原因，并可重试。
 *
 * 字段流向：InstallJob（服务端 startInstall 写入 → SSE / GET 读取）→ useExportRuntime 的 job → 进度环、卡片、完成 / 失败提示。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, RotateCw } from 'lucide-react';
import { fetchExportRuntime, installExportRuntime, watchExportRuntime, type ExportRuntimeStatus, type InstallJob } from '../runtime/dev-client';

/** 安装进度的文字与百分比（纯函数）。 */
export function setupProgress(job: InstallJob, i18n: BoardMessages = boardEnglish): { text: string; percent: number } {
  const percent = Math.max(0, Math.min(100, Math.round(job.percent)));
  const text =
    job.phase === 'package' ? i18n.board.exportSetupInstallingPlaywright
    : job.phase === 'browser' ? (job.totalMB ? i18n.board.exportSetupDownloading(Math.round(job.totalMB)) : i18n.board.exportSetupDownloadingChromium)
    : job.phase === 'verify' ? i18n.board.exportSetupVerifying
    : job.phase === 'done' ? i18n.board.exportSetupReady
    : i18n.board.exportSetupFailed(job.error ?? '');
  return { text, percent };
}

/**
 * 菜单里要不要显示安装卡：未安装、正在安装、或上次安装失败时显示；状态未知（旧服务端）时不显示。
 */
export function showSetupCard(status: ExportRuntimeStatus | null, job: InstallJob | null): boolean {
  if (job?.status === 'running' || job?.status === 'error') return true;
  return !!status && !status.ready;
}

export type ExportRuntime = ReturnType<typeof useExportRuntime>;

export function useExportRuntime(projectId: string, handlers: { onReady: () => void; onError: (message: Text) => void }) {
  const [status, setStatus] = useState<ExportRuntimeStatus | null>(null);
  const [job, setJob] = useState<InstallJob | null>(null);
  const [watching, setWatching] = useState(0);
  /** 装好后要继续的导出（用户点的是图片还是视频）。 */
  const pending = useRef<(() => void) | null>(null);
  const h = useRef(handlers);
  h.current = handlers;
  const finished = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    const r = await fetchExportRuntime(projectId);
    if (!r) return;
    setStatus(r.runtime);
    if (r.install?.status === 'running') {
      setJob(r.install);
      setWatching((n) => n + 1);
    }
  }, [projectId]);
  useEffect(() => {
    void refresh();
    // 用户可能在终端里装好 / 删掉了导出组件：回到这个页面时重新读状态
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);

  useEffect(() => {
    if (!watching) return;
    return watchExportRuntime(
      (j) => {
        if (!j) return;
        setJob(j);
        const key = `${j.id}|${j.status}`;
        if (j.status === 'running' || finished.current === key) return;
        finished.current = key;
        if (j.status === 'done') {
          setStatus((s) => (s ? { ...s, ready: true, source: 'managed' } : s));
          void refresh();
          h.current.onReady();
          const next = pending.current;
          pending.current = null;
          next?.();
        } else {
          pending.current = null;
          h.current.onError(j.error ?? '');
        }
      },
      (message) => h.current.onError(message),
    );
  }, [watching, refresh]);

  /** 开始安装；then = 装好后继续的导出。已有任务时接上那个任务。 */
  const install = async (then?: () => void) => {
    pending.current = then ?? null;
    const r = await installExportRuntime();
    if (!r.ok) {
      pending.current = null;
      h.current.onError(r.message);
      return;
    }
    setJob(r.job);
    setWatching((n) => n + 1);
  };

  return {
    status,
    job,
    /** 能导出（状态未知时按能导出处理，交给导出本身报错）。 */
    ready: status?.ready ?? true,
    installing: job?.status === 'running',
    downloadMB: status?.downloadMB ?? 100,
    command: status?.command ?? 'npx joplo setup export',
    install,
    /** 导出时服务端说没有导出组件（例如在终端里卸载了）。 */
    markMissing: () => setStatus((s) => (s ? { ...s, ready: false, source: null } : s)),
    refresh,
  };
}

/** 菜单顶部的卡片：未安装 → 说明 + 安装按钮；安装中 → 进度；失败 → 原因 + 重试。 */
export function ExportSetupCard({ rt }: { rt: ExportRuntime }) {
  const { t: i18n } = useBoardI18n();
  const job = rt.job;
  const running = job?.status === 'running';
  const failed = job?.status === 'error';
  const p = job ? setupProgress(job, i18n) : null;
  return (
    <div className="m-1 mb-0 flex w-[300px] flex-col gap-2 rounded-[8px] border-[1.5px] border-jb-ink bg-jb-surface p-2.5 font-jb" data-testid="export-setup" data-status={job?.status ?? 'missing'}>
      <div className="flex flex-col gap-0.5 text-[12px]">
        <span className="font-semibold">{i18n.board.exportSetupTitle}</span>
        <span className="text-jb-muted">{i18n.board.exportSetupBody(rt.downloadMB)}</span>
      </div>
      {running && p ? (
        <>
          <div className="flex items-center justify-between gap-2 text-[12px] text-jb-muted">
            <span className="min-w-0 truncate" title={p.text}>{p.text}</span>
            <span className="shrink-0 tabular-nums">{i18n.player.number(p.percent)}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-jb-sunken" role="progressbar" aria-valuenow={p.percent} aria-valuemin={0} aria-valuemax={100} aria-label={p.text}>
            <div className="h-full rounded-full bg-jb-accent-press transition-[width]" style={{ width: `${p.percent}%` }} />
          </div>
          <span className="text-[11px] text-jb-faint">{i18n.board.closingThisMenuWillNotStopTheInstall}</span>
        </>
      ) : (
        <>
          {failed && p ? (
            <span className="whitespace-normal break-words text-[12px] text-jb-danger" role="alert" data-testid="export-setup-error">
              {p.text}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => void rt.install()}
            className="jb-focus inline-flex h-8 items-center justify-center gap-1.5 rounded-[6px] border-[1.5px] border-jb-ink bg-jb-ink px-2.5 text-[12px] font-semibold text-jb-surface hover:opacity-90"
            data-testid="export-setup-install"
          >
            {failed ? <RotateCw className="size-3.5" aria-hidden /> : <Download className="size-3.5" aria-hidden />}
            {failed ? i18n.board.retry : i18n.board.installExportComponent(rt.downloadMB)}
          </button>
          <span className="select-text text-[11px] text-jb-faint">{i18n.board.exportSetupInTerminal(rt.command)}</span>
        </>
      )}
    </div>
  );
}

/** 点了导出但还没装：轻提示里说明并给「安装并导出」。 */
export function SetupNeededFlash({ rt, then }: { rt: ExportRuntime; then: () => void }) {
  return (
    <span className="inline-flex max-w-[640px] items-center gap-2 whitespace-normal" data-testid="export-setup-needed">
      <LocalText value={m.board.exportSetupNeeded(rt.downloadMB)} />
      <button type="button" className="shrink-0 font-semibold text-jb-accent underline-offset-2 hover:underline" onClick={() => void rt.install(then)} data-testid="export-setup-install-and-export">
        <LocalText value={m.board.installAndExport} />
      </button>
    </span>
  );
}
