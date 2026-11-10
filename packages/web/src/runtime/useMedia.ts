import { useEffect, useRef } from 'react';
import type { Project } from '@joplo-app/core/runtime';
import type { DemoController } from './demo';
import { MediaEngine } from './media';
/** Shared by interactive players and video recording; static screenshots never mount it. */
/** always：没有配乐也建引擎（录制带旁白的视频时，旁白经它进录音轨）。 */
export function useMedia(ctl: DemoController, project: Project | null, enabled: boolean, always = false) {
  const reference = useRef<MediaEngine | null>(null);
  const current = useRef({ project, enabled });
  current.current = { project, enabled };
  useEffect(() => {
    if (!always && (!project?.mediaAssets || !Object.keys(project.mediaAssets).length)) return;
    const engine = new MediaEngine(); reference.current = engine;
    const unlock = (e: Event) => { if (e.isTrusted) engine.unlock(); };
    window.addEventListener('pointerdown', unlock, true); window.addEventListener('keydown', unlock, true);
    let raf = 0;
    const tick = () => {
      const s = ctl.getSnapshot(), sc = s.scenarioId ? s.project?.scenarios[s.scenarioId] : undefined;
      const position = s.state?.position ?? 0;
      const media = (position ? sc?.steps[position - 1]?.media : sc?.media) ?? {};
      // identity = 跳转计数 seek（D92）：跳转、重置、换章（非接力）时才重新定位；逐步提交、接力的下一章、暂停 → 继续都连续播放
      // 只读时钟：推进它的是控制器的帧驱动（每个显示帧一次），这里再采样会让订阅者一帧收到两次通知
      const elapsedMs = ctl.clock.getSnapshot().elapsedMs;
      engine.update(media, current.current.project?.mediaAssets ?? {}, { playing: s.view === 'stage' && s.playing && !s.paused, enabled: current.current.enabled, speed: ctl.speed, elapsedMs, timeMs: ctl.clock.getSnapshot().timeMs, duck: !!s.narration, identity: `${s.seek}` },current.current.project?.mediaInfo);
      (window as unknown as Record<string, unknown>).__JOPLO_MEDIA__ = engine.status();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { reference.current = null; cancelAnimationFrame(raf); engine.destroy(); window.removeEventListener('pointerdown', unlock, true); window.removeEventListener('keydown', unlock, true); };
  }, [ctl, project?.mediaAssets, always]);
  return reference;
}
