import type { Locale } from '../i18n/locale';
import { type Text } from '../i18n/messages';
import { useBoardI18n } from '../i18n/board/context';
/**
 * 导出视频（只在本机看板，D55 + Juice UI ProgressRing / TaskProgressCard）：
 * - 点「导出整个场景视频」直接开始；「导出」按钮上出现 Juice ProgressRing；
 * - 重新打开「导出 ▾」，菜单顶部是 Juice TaskProgressCard 进度卡与「取消」（关掉菜单不会中断导出）；
 * - 完成后轻提示并可“再导出一次”；失败说明原因并可重试。
 */
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { ProgressRing as JuiceProgressRing, TaskProgressCard } from '@tokenroll/juice/primitives';
import { cancelVideo, startVideo, watchVideo, type VideoJob } from '../runtime/dev-client';
import type { Look } from '../renderer/appearance';
import { Btn } from '../player/controls';
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
  const start = async (scenarioId: string, look: Look, locale: Locale, contentLocale?: string | null, voice = false) => {
    setError(null);
    const r = await startVideo(projectId, { scenarioId, ...look, locale, ...(contentLocale ? { contentLocale } : {}), ...(voice ? { voice: true } : {}) });
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

/** 「导出」按钮上的小进度环（封装 Juice ProgressRing）。 */
export function ProgressRing({ percent, size = 16 }: { percent: number; size?: number }) {
  const { t: i18n } = useBoardI18n();

  return (
    <span role="img" aria-label={i18n.board.exporting(percent)} className="inline-flex shrink-0 text-jb-accent-press" data-testid="export-ring">
      <JuiceProgressRing value={percent} size={size} />
    </span>
  );
}

/** 菜单顶部的进度卡（使用 Juice TaskProgressCard）。 */
export function VideoProgressCard({ job, scenarioName, onCancel }: { job: VideoJob; scenarioName: string; onCancel: () => void }) {
  const { t: i18n } = useBoardI18n();

  const v = exportProgress(job, scenarioName, i18n)!;
  return (
    <div className="m-1 mb-0 font-jb" data-testid="video-progress" data-status={job.status}>
      <TaskProgressCard step={v.text} value={v.percent}>
        <span className="text-[12px] text-jb-muted">{job.phase === 'recording' ? i18n.board.recordingStep(job.step, job.total) : v.step}</span>
        <div className="flex items-center gap-2">
          <Btn icon={<X className="size-3.5" aria-hidden />} label={i18n.board.cancel} size={28} variant="default" sound="tap" onClick={onCancel} data-testid="video-cancel" />
          <span className="text-[11px] text-jb-faint">{i18n.board.closingThisMenuWillNotStopTheExport}</span>
        </div>
      </TaskProgressCard>
    </div>
  );
}
