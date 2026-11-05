/**
 * 导出视频（只在本机看板）：选尺寸 → 开始 → SSE 进度 → 完成后给出文件位置；失败说明原因（含安装命令）并可重试。
 * 同一项目已有任务时，服务端返回 409，这里接上那个任务的进度。
 */
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { startVideo, watchVideo, type VideoJob } from '../runtime/dev-client';
import type { Device } from '../runtime/route';
import type { StageTheme } from '../renderer/rough';
import { Segmented } from '../player/PlayerPage';

const PHASE: Record<VideoJob['phase'], string> = { starting: '正在启动浏览器…', recording: '正在录制', saving: '正在保存…', done: '已完成', error: '失败' };

export function VideoDialog({ projectId, scenarioId, scenarioName, device: initial, theme, onClose }: { projectId: string; scenarioId: string; scenarioName: string; device: Device; theme: StageTheme; onClose: () => void }) {
  const [device, setDevice] = useState<Device>(initial);
  const [job, setJob] = useState<VideoJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [watching, setWatching] = useState(0);

  useEffect(() => {
    if (!watching) return;
    return watchVideo(
      projectId,
      (j) => j && setJob(j),
      (m) => setError(m),
    );
  }, [projectId, watching]);

  const running = job?.status === 'running';
  const start = async () => {
    setError(null);
    const r = await startVideo(projectId, { scenarioId, device, theme });
    if (r.ok) setJob(r.job);
    else if (r.job) setJob(r.job);
    else return setError(r.message);
    setWatching((n) => n + 1);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-[12vh]" data-testid="video-dialog">
      <div role="dialog" aria-label="导出视频" className="w-[440px] max-w-[92vw] rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[17px] font-semibold">导出视频</h2>
          <button type="button" aria-label="关闭" onClick={onClose} className="rounded p-1 hover:bg-black/5" data-testid="video-close">
            <X className="size-4" />
          </button>
        </div>
        <p className="mb-3 text-[13px] text-[#6b6b6b]">录制「{scenarioName}」的自动播放（含鼠标与字幕），保存到项目的 exports/ 目录。</p>
        <div className="mb-4">
          <div className="mb-1 text-[13px] font-medium">尺寸</div>
          <Segmented<Device>
            full
            label="尺寸"
            value={device}
            onChange={(d) => !running && setDevice(d)}
            items={[
              { value: 'desktop', label: '电脑 1280×800', testid: 'video-desktop' },
              { value: 'mobile', label: '手机 390×844', testid: 'video-mobile' },
            ]}
          />
        </div>
        {job && (job.status === 'running' || job.status === 'done') ? (
          <div className="mb-4" data-testid="video-progress" data-status={job.status}>
            <div className="h-2 overflow-hidden rounded-full bg-[#f1f3f5]">
              <div className="h-full rounded-full bg-[#1e1e1e] transition-[width]" style={{ width: `${job.percent}%` }} />
            </div>
            <div className="mt-1 text-[13px] text-[#6b6b6b]">
              {job.phase === 'recording' ? `正在录制第 ${job.step} / ${job.total} 步…` : PHASE[job.phase]}
            </div>
          </div>
        ) : null}
        {job?.status === 'done' && job.file ? (
          <div className="mb-4 rounded-md border border-[#2b8a3e] bg-[#effaf1] px-3 py-2 text-[13px] text-[#1f6e30]" data-testid="video-done">
            已导出：<code className="font-mono">{job.file}</code>（在项目目录下）
          </div>
        ) : null}
        {job?.status === 'error' || error ? (
          <div className="mb-4 rounded-md border border-[#c92a2a] bg-[#fff0f0] px-3 py-2 text-[13px] text-[#a51d1d]" data-testid="video-error">
            <div className="font-semibold">导出失败</div>
            <div className="mt-1 whitespace-pre-wrap break-words">{job?.error ?? error}</div>
          </div>
        ) : null}
        <div className="flex justify-end">
          <button type="button" onClick={() => void start()} disabled={running} className="rounded-md bg-[#1e1e1e] px-4 py-2 text-[14px] font-medium text-white disabled:opacity-40" data-testid="video-start">
            {running ? '正在导出…' : job?.status === 'error' || error ? '重试' : job?.status === 'done' ? '再导出一次' : '开始导出'}
          </button>
        </div>
      </div>
    </div>
  );
}
