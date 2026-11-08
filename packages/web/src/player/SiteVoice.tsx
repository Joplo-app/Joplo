/**
 * 发布站 / 嵌入的朗读开关（D74）：分享带了音频（IR 的 voiceIndex 有片段）时默认开，没有音频时默认关、观众点一下才用浏览器朗读。
 * 打开前还没有用户手势时浏览器会拒绝出声（runtime/voice.ts 按 NotAllowedError 跳过这一段，播放照常往下走）；观众按播放后就能听到。
 * PR 差异的同步播放（muted）始终静音。
 * 有 build 带上的音频（IR 的 voiceIndex）时用它，否则用观众浏览器的朗读。不发任何网络请求（分享页 connect-src 'none'）。
 */
import { useEffect, useMemo, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import type { Project } from '@joplo-app/core';
import { useI18n } from '../i18n/context';
import type { DemoController } from '../runtime/demo';
import { Narrator } from '../runtime/voice';
import { Btn, type BtnSize } from './controls';
import { useContent } from '../i18n/content-context';
import { siteVoiceLookup } from '../i18n/content';

/** 分享里有没有 build 带上的音频。 */
export function hasVoiceClips(project: Project | null): boolean {
  return !!project?.voiceIndex && Object.keys(project.voiceIndex.clips).length > 0;
}

/** 朗读开关的初始值：有音频就默认开；静音（差异同步播放）时始终关。 */
export function siteVoiceDefault(project: Project | null, muted = false): boolean {
  return !muted && hasVoiceClips(project);
}

export function useSiteVoice(ctl: DemoController, project: Project | null, muted = false) {
  const { locale } = useI18n();
  const content = useContent();
  const narrator = useMemo(() => new Narrator(), []);
  const [on, setOnState] = useState(() => siteVoiceDefault(project, muted));
  narrator.enabled = on && !muted;
  // 内容多语言（D84）：浏览器朗读用内容语言；生成的音频用这种语言的声音（没有单独的声音时用默认声音）
  narrator.locale = content?.locale ?? locale;
  narrator.lookup = siteVoiceLookup(project?.voiceIndex, content?.locale);
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
  return { on, setOn, hasAudio: hasVoiceClips(project) };
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
