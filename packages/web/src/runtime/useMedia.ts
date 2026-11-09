import { useEffect, useRef } from 'react';
import type { Project } from '@joplo-app/core';
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
      engine.update(media, current.current.project?.mediaAssets ?? {}, { playing: s.view === 'stage' && s.playing && !s.paused, enabled: current.current.enabled, speed: ctl.speed, elapsedMs: ctl.mediaElapsed(), duck: !!s.narration, identity: `${s.scenarioId ?? ''}` });
      (window as unknown as Record<string, unknown>).__JOPLO_MEDIA__ = engine.status();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); engine.destroy(); window.removeEventListener('pointerdown', unlock, true); window.removeEventListener('keydown', unlock, true); };
  }, [ctl, project?.mediaAssets]);
}
