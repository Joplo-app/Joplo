/**
 * 发布站 / 嵌入的朗读开关（D74）：默认关；观众点一下才出声（浏览器不允许页面自己出声，也不打扰同一屋子的人）。
 * 有 build 带上的音频（IR 的 voiceIndex）时用它，否则用观众浏览器的朗读。不发任何网络请求（分享页 connect-src 'none'）。
 */
import { useEffect, useMemo, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import type { Project } from '@joplo-app/core';
import { useI18n } from '../i18n/context';
import type { DemoController } from '../runtime/demo';
import { Narrator } from '../runtime/voice';
import { Btn, type BtnSize } from './controls';

export function useSiteVoice(ctl: DemoController, project: Project | null, muted = false) {
  const { locale } = useI18n();
  const narrator = useMemo(() => new Narrator(), []);
  const [on, setOnState] = useState(false);
  narrator.enabled = on && !muted;
  narrator.locale = locale;
  narrator.lookup = project?.voiceIndex ?? null;
  useEffect(() => {
    ctl.narrator = narrator;
    return () => {
      ctl.stopNarration();
      ctl.narrator = null;
    };
  }, [ctl, narrator]);
  const setOn = (v: boolean) => {
    setOnState(v && !muted);
    narrator.enabled = v && !muted;
    if (!v) ctl.stopNarration();
  };
  return { on, setOn, hasAudio: !!project?.voiceIndex && Object.keys(project.voiceIndex.clips).length > 0 };
}

export function SiteVoiceButton({ voice, size = 34, testid = 'site-voice' }: { voice: ReturnType<typeof useSiteVoice>; size?: BtnSize; testid?: string }) {
  const { t: i18n } = useI18n();
  const label = voice.on ? i18n.player.turnNarrationOff : i18n.player.turnNarrationOn;
  return (
    <Btn
      icon={voice.on ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
      label={label}
      title={!voice.on && voice.hasAudio ? `${i18n.player.narrationAvailable} · ${label}` : label}
      iconOnly
      variant="ghost"
      size={size}
      selected={voice.on}
      className="rounded-[8px]"
      onClick={() => voice.setOn(!voice.on)}
      data-testid={testid}
    />
  );
}
