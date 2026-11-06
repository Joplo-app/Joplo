import type { Locale } from '../i18n/locale';
import { translate, type Text } from '../i18n/messages';
import { useBoardI18n } from '../i18n/board/context';
/**
 * 导出视频（只在本机看板，D55「导出视频：有进度，能取消」）：
 * - 点「导出整个场景视频」直接开始（不再弹对话框）；「导出」按钮上出现小进度环；
 * - 重新打开「导出 ▾」，菜单顶部是进度卡：“正在录制「场景」 第 3 / 5 步”和「取消」（关掉菜单不会中断导出）；
 * - 完成后轻提示“已导出 exports/…webm”并可“再导出一次”；失败说明原因（含安装命令）并可重试。
 * 同一项目已有任务时（409）接上那个任务的进度。尺寸跟随页面自己的 viewport（D44），外观跟随看板（D55）。
 */
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { cancelVideo, startVideo, watchVideo, type VideoJob } from '../runtime/dev-client';
import type { Look } from '../renderer/appearance';
import { exportProgress } from './states-model';

export function useVideoExport(projectId: string, onFinish: (job: VideoJob) => void) {
  const [job, setJob] = useState<VideoJob | null>(null);
  const [error, setError] = useState<Text | null>(null);
  const [watching, setWatching] = useState(0);
  const finish = useRef(onFinish);
  finish.current = onFinish;
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (!watching) return;
    return watchVideo(
      projectId,
      (j) => {
        if (!j) return;
        setJob(j);
        const key = `${j.id}|${j.status}`;
        if (j.status !== 'running' && last.current !== key) {
          last.current = key;
          finish.current(j);
        }
      },
      (m) => setError(m),
    );
  }, [projectId, watching]);
  const start = async (scenarioId: string, look: Look, locale: Locale) => {
    setError(null);
    const r = await startVideo(projectId, { scenarioId, ...look, locale });
    if (r.ok) setJob(r.job);
    else if (r.job) setJob(r.job);
    else {
      setError(r.message);
      return false;
    }
    setWatching((n) => n + 1);
    return true;
  };
  const cancel = async () => {
    const r = await cancelVideo(projectId);
    if (r.ok) setJob(r.job);
  };
  return { job, error, start, cancel, running: job?.status === 'running' };
}

/** 「导出」按钮上的小进度环。 */
export function ProgressRing({ percent, size = 16 }: { percent: number; size?: number }) {
  const { t: i18n } = useBoardI18n();

  const r = (size - 3) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-label={i18n.board.exporting(percent)} role="img" className="shrink-0 -rotate-90" data-testid="export-ring">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--jb-border-default)" strokeWidth={2.5} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--jb-accent-press)" strokeWidth={2.5} strokeDasharray={c} strokeDashoffset={c * (1 - percent / 100)} strokeLinecap="round" />
    </svg>
  );
}

/** 菜单顶部的进度卡（录制中）。 */
export function VideoProgressCard({ job, scenarioName, onCancel }: { job: VideoJob; scenarioName: string; onCancel: () => void }) {
  const { t: i18n } = useBoardI18n();

  const v = exportProgress(job, scenarioName, i18n)!;
  return (
    <div className="m-1 mb-0 flex flex-col gap-2 rounded-[8px] border-[1.5px] border-jb-ink bg-jb-surface p-2.5 font-jb" data-testid="video-progress" data-status={job.status}>
      <div className="flex flex-col gap-0.5 text-[12px]">
        <span className="min-w-0 truncate font-semibold" title={v.text}>
          {v.text}
        </span>
        <span className="text-jb-muted">{job.phase === 'recording' ? i18n.board.recordingStep(job.step, job.total) : v.step}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-jb-sunken">
        <div className="h-full rounded-full bg-jb-accent-press transition-[width]" style={{ width: `${v.percent}%` }} />
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onCancel} className="jb-focus inline-flex h-7 items-center gap-1 rounded-[6px] border border-jb-line px-2 text-[12px] hover:bg-jb-hover" data-testid="video-cancel">
          <X className="size-3.5" aria-hidden />
          {i18n.board.cancel}</button>
        <span className="text-[11px] text-jb-faint">{i18n.board.closingThisMenuWillNotStopTheExport}</span>
      </div>
    </div>
  );
}
