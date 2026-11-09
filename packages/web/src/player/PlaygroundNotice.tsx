import { useEffect, useRef } from 'react';
import { useI18n } from '../i18n/context';
import type { DemoController, Snapshot } from '../runtime/demo';

/**
 * Outside Stage: these controls cannot accidentally become prototype gestures.
 * D97 用户要求去掉“自由体验中 · 按播放继续 / 改动不会保留 / 重置”状态卡：只保留切换场景的确认（D88）。
 * 重置用控制条的 ↺，或按播放（播放会丢弃自由体验的改动）。
 */
export function PlaygroundNotice({ ctl, snap }: { ctl: DemoController; snap: Snapshot }) {
  const { t } = useI18n();
  const prompt = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!snap.switchPrompt) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = prompt.current;
    dialog?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => { if (previous?.isConnected && (document.activeElement === document.body || dialog?.contains(document.activeElement))) previous.focus(); };
  }, [snap.switchPrompt]);
  if (!snap.switchPrompt) return null;
  return <div className="flex flex-col gap-2 text-[12px]" data-testid="playground-notice">
    {snap.switchPrompt ? <div ref={prompt} role="dialog" aria-label={t.player.freeSwitchConfirm} className="jb-pop rounded-lg p-3 text-[13px]" onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); ctl.dismissSwitch(); } }}>
      {snap.switchPrompt.some(candidate => snap.project?.scenarios[candidate.scenarioId]?.actionEntry !== 'after') ? <p className="mb-2 text-jb-muted">{t.player.freeSwitchDescription}</p> : null}
      <div className="flex flex-col gap-2">{snap.switchPrompt.map((candidate, index) => <button key={`${candidate.scenarioId}:${candidate.position}`} type="button" className="jb-focus rounded-md bg-jb-inverse px-3 py-2 text-left text-jb-on-inverse hover:bg-jb-inverse-hover" onClick={() => ctl.confirmSwitch(index)}>
        {t.player.freeSwitchPrompt(snap.project?.scenarios[candidate.scenarioId]?.name ?? candidate.scenarioId)} <span className="opacity-70">· {candidate.position + 1}</span>
      </button>)}<button type="button" className="jb-focus rounded-md px-3 py-2 text-jb-muted hover:bg-jb-hover" onClick={() => ctl.dismissSwitch()}>{t.player.freeSwitchCancel}</button></div>
    </div> : null}
  </div>;
}
