import { useEffect, useRef } from 'react';
import type { Project } from '@joplo-app/core/runtime';
import type { DemoController } from './demo';
import { MediaEngine } from './media';
/** Mounted only by interactive players, never Stage thumbnails or render routes. */
export function useMedia(ctl: DemoController, project: Project | null, enabled: boolean) {
  const current = useRef({ project, enabled });
  current.current = { project, enabled };
  useEffect(() => {
    if (!project?.mediaAssets || !Object.keys(project.mediaAssets).length) return;
    const engine = new MediaEngine();
    const unlock = (e: Event) => { if (e.isTrusted) engine.unlock(); };
    window.addEventListener('pointerdown', unlock, true); window.addEventListener('keydown', unlock, true);
    let raf = 0;
    const tick = () => {
      const s = ctl.getSnapshot(), sc = s.scenarioId ? s.project?.scenarios[s.scenarioId] : undefined;
      const position = s.state?.position ?? 0;
      const media = (position ? sc?.steps[position - 1]?.media : sc?.media) ?? {};
      // identity = 跳转计数 seek（D92）：跳转、重置、换章（非接力）时才重新定位；逐步提交、接力的下一章、暂停 → 继续都连续播放
      const elapsedMs = ctl.mediaElapsed();
      engine.update(media, current.current.project?.mediaAssets ?? {}, { playing: s.view === 'stage' && s.playing && !s.paused, enabled: current.current.enabled, speed: ctl.speed, elapsedMs, timeMs: ctl.clock.getSnapshot().timeMs, duck: !!s.narration, identity: `${s.seek}` });
      (window as unknown as Record<string, unknown>).__JOPLO_MEDIA__ = engine.status();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); engine.destroy(); window.removeEventListener('pointerdown', unlock, true); window.removeEventListener('keydown', unlock, true); };
  }, [ctl, project?.mediaAssets]);
}
