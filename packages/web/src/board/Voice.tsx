import type { Text } from '../i18n/messages';
import { LocalText } from '../i18n/LocalText';
import { useBoardI18n } from '../i18n/board/context';
import { useI18n } from '../i18n/context';
/**
 * 看板的朗读（D74 / D85）：播放坞里的「声音」按钮 → 浮层（开关、声音来源、旁白音色与试听、生成音频）→「管理密钥…」→ 对话框（OpenAI / ElevenLabs 的 Key）。
 * 原型：examples/joplo 的 cloud_usage（用户确认方案 A）。
 *
 * 数据流：
 * - 开关与浏览器声音：本机 localStorage（joplo.voice.on / joplo.voice.browser），看板默认关。
 * - 声音来源：PUT /__joplo/p/:id/voice（记在项目 .joplo/voice/index.json）；config 写了 voice.profile 时以 config 为准，这里只读。
 *   没选过时服务端按登录状态给默认（已登录 = Joplo Cloud 朗读，state.source = 'default'）。
 * - Joplo Cloud 朗读：state.cloud（服务端经 CLI 的 bridge 问云端，60 秒缓存；打开浮层时 refresh=1）→ 剩余字数、登录命令、用量页；
 *   每生成一段服务端用响应头的剩余字数更新并推送 joplo:voice，这里不在本地估算剩余。
 * - 估算：voiceEstimate（缺音频的段，Array.from 计字）→ 按钮“约 X 字”与“生成后还剩 Y 字”（cloudQuotaView）。
 * - 试听：cloud 用音色的样音地址（samples[语言]，<audio> 直接播放，不扣字数）。
 * - 音频：GET …/voice + joplo:voice 推送 → narrator.lookup（声音指纹 + 片段键 → 地址）→ DemoController 播放时用；
 *   没有音频的步骤用浏览器朗读，字幕区标“浏览器朗读”（额度不够、云端连不上时也一样）。
 *   Joplo Cloud 朗读不在播放时现场生成、也不预取（会花用户的字数）：只有点「生成缺少的音频」或运行 joplo voice 才请求云端。
 * - 生成：voiceSegments（当前方案所有场景、当前语言）→ POST …/voice/generate（每 100 段一批）；402 时服务端停下并在 state.cloud.exhausted 里标出。
 * - Key：GET/PUT/DELETE /__joplo/voice/profiles；Key 只提交、不回显（只显示末 4 位）。
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AudioLines, Check, Copy, KeyRound, Loader2, Play, Square, Volume2, VolumeX, X } from 'lucide-react';
import { speakerRoleAt, spokenLine, type Project } from '@joplo-app/core';
import { stepCaption } from '../i18n/step-caption';
import { cn } from '@/lib/utils';
import { Btn, Switch } from '../player/controls';
import { Popover } from '../player/popover';
import { copyText } from '../player/util';
import type { DemoController } from '../runtime/demo';
import { Narrator, browserVoices } from '../runtime/voice';
import {
  deleteVoiceProfile,
  fetchVoiceProfiles,
  fetchVoiceState,
  generateVoice,
  requestClip,
  saveVoiceProfile,
  selectVoiceProfile,
  subscribeVoice,
  testVoiceProfile,
  type VoiceChoiceView,
  type VoiceProfileView,
  type VoiceState,
  type VoiceTestResult,
} from '../runtime/dev-client';
import { canGenerate, cloudQuotaView, hasKey, liveGenerate, narrationLanguage, newerVoiceState, sampleUrl, sortVoices, sourceRows, voiceCoverage, voiceEstimate, voiceLabel, voiceSegments, type CloudQuotaView } from './voice-model';
import { isLocale, type Locale } from '../i18n/locale';
import { boardVoiceLookup } from '../i18n/content';

const ON_KEY = 'joplo.voice.on';
const BROWSER_KEY = 'joplo.voice.browser';
const readLocal = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const writeLocal = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* 隐私模式：只影响记忆 */
  }
};

export type VoiceApi = ReturnType<typeof useVoice>;

/** 看板播放页的朗读：narrator 交给 DemoController；状态来自 joplo dev。 */
export function useVoice(projectId: string, project: Project | null, optionId: string | null, ctl: DemoController, locale: Locale, at: { scenarioId: string | null; position: number }, contentLocale: string | null = null) {
  const { t } = useI18n();
  const narrator = useMemo(() => new Narrator(), [projectId]);
  const [on, setOnState] = useState(() => readLocal(ON_KEY) === '1');
  const [browserVoice, setBrowserVoiceState] = useState<string | null>(() => readLocal(BROWSER_KEY));
  const [state, setStateRaw] = useState<VoiceState | null>(null);
  /** 所有来源（推送、重新读取、选择 / 生成的返回）都经这里：晚到的旧状态不覆盖新的。 */
  const setState = (s: VoiceState) => setStateRaw((prev) => newerVoiceState(prev, s));
  const [profiles, setProfiles] = useState<VoiceProfileView[] | null>(null);
  /** profile 的本机存储文件（所有项目共用；dev 用了别的 JOPLO_HOME 时在这里看得出来）。 */
  const [profilesFile, setProfilesFile] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Text | null>(null);

  useEffect(() => {
    let alive = true;
    void fetchVoiceState(projectId).then((s) => alive && s && setState(s));
    const off = subscribeVoice(projectId, (s) => setState(s));
    return () => {
      alive = false;
      off();
    };
  }, [projectId]);

  const reloadProfiles = () =>
    fetchVoiceProfiles().then((r) => {
      if ('error' in r) return setError(r.error);
      setProfiles(r.profiles);
      setProfilesFile(r.file);
    });
  /** 打开浮层时：重新问一次云端额度（例如刚买了加油包）。 */
  const refresh = () => fetchVoiceState(projectId, true).then((s) => s && setState(s));

  // narrator 跟着状态走；控制器在播放时用它
  narrator.enabled = on;
  narrator.browserVoice = browserVoice;
  // 内容多语言（D84）：浏览器朗读用内容语言；生成的音频用这种语言的声音（服务端 byLocale），没有时用默认声音
  narrator.locale = contentLocale ?? locale;
  narrator.lookup = boardVoiceLookup(state, contentLocale);
  // 边放边生成：只有用户自己的 Key（OpenAI / ElevenLabs）——播到还没有音频的一步就当场生成这一段（同一段只请求一次），并预取后面几步。
  // Joplo Cloud 朗读不在播放时请求（会花字数）：只用已生成的音频，缺的步骤用浏览器朗读并在字幕区标出。
  const inflight = useRef(new Map<string, Promise<string | null>>());
  const ready = liveGenerate(state?.profile ?? null, state?.cloud);
  // 换了供应商或音色（声音指纹变了）：之前请求过的段作废
  const voicesSig = state ? JSON.stringify([state.voices, contentLocale, contentLocale ? state.byLocale?.[contentLocale]?.voices : null]) : '';
  useEffect(() => inflight.current.clear(), [voicesSig]);
  narrator.ensure = ready
    ? (text, role) => {
        const k = `${role ?? ''}|${text}`;
        let p = inflight.current.get(k);
        if (!p) {
          const stepId = segmentsRef.current.find((s) => s.text === text && s.role === role)?.stepId ?? 'adhoc';
          p = requestClip(projectId, locale, { stepId, text, role }, contentLocale).then((r) => (r.ok ? r.url : null));
          inflight.current.set(k, p);
          void p.then((u) => !u && inflight.current.delete(k));
        }
        return p;
      }
    : null;
  useEffect(() => {
    ctl.narrator = narrator;
    return () => {
      ctl.stopNarration();
      ctl.narrator = null;
    };
  }, [ctl, narrator]);

  const setOn = (v: boolean) => {
    setOnState(v);
    writeLocal(ON_KEY, v ? '1' : null);
    narrator.enabled = v;
    if (!v) ctl.stopNarration();
  };
  const setBrowserVoice = (v: string | null) => {
    setBrowserVoiceState(v);
    writeLocal(BROWSER_KEY, v);
  };

  const segments = useMemo(() => (project ? voiceSegments(project, optionId, t) : []), [project, optionId, t]);
  const segmentsRef = useRef(segments);
  segmentsRef.current = segments;
  // 预取：当前位置之后的 3 步（正在读的这一步由播放时当场生成）
  useEffect(() => {
    if (!on || !ready || !project || !at.scenarioId) return;
    const sc = project.scenarios[at.scenarioId];
    if (!sc) return;
    for (let i = at.position; i < Math.min(sc.steps.length, at.position + 3); i++) {
      const st = sc.steps[i]!;
      const line = spokenLine(st, stepCaption(st, t), speakerRoleAt(project, sc.id, i + 1));
      narrator.prefetch(line.text, line.role);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, ready, project, at.scenarioId, at.position, t]);
  const has = (s: { text: string; role: string | null }) => narrator.hasClip(s.text, s.role);
  const coverage = voiceCoverage(segments, has, state?.failures ?? {});
  /** 这次要生成的段数与字数（D85：Array.from 计字，同一段只算一次）。 */
  const estimate = voiceEstimate(segments, has);
  /** 旁白的语言（跟随语言）：按朗读文字识别，识别不出时跟随界面语言。 */
  const lang = narrationLanguage(segments, contentLocale && isLocale(contentLocale) ? contentLocale : locale);

  const select = async (profileId: string | null) => {
    setError(null);
    const r = await selectVoiceProfile(projectId, profileId);
    if (r.ok) setState(r.state);
    else setError(r.message);
  };

  /** 换旁白的默认音色（存在本机，所有项目共用；config 写了 voice.narrator 时以 config 为准）。状态由 profilesChanged 推送带回来。 */
  const setVoice = async (voice: string) => {
    const p = state?.profile;
    if (!p || p.unsupported) return;
    setError(null);
    const r = await saveVoiceProfile(p.id, { voice });
    if (!r.ok) setError(r.message);
    else setProfiles(r.profiles);
  };

  const generate = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      for (let i = 0; i < segments.length; i += 100) {
        const r = await generateVoice(projectId, locale, segments.slice(i, i + 100), contentLocale);
        if (!r.ok) {
          setError(r.message);
          break;
        }
        setState(r.state);
        // 额度不够（402）或账号问题：停下；已生成的保留，浮层里说明（额度不够时有买加油包的入口）
        if (r.summary.quota) break;
        if (r.summary.error) {
          setError(r.summary.error.message);
          break;
        }
      }
    } finally {
      setBusy(false);
    }
  };

  return { narrator, on, setOn, browserVoice, setBrowserVoice, state, profiles, profilesFile, reloadProfiles, refresh, setProfiles, select, setVoice, generate, busy: busy || !!state?.generating, error, setError, coverage, estimate, segments, lang, locale, contentLocale };
}

const field = 'jb-focus h-8 w-full min-w-0 rounded-[6px] border border-jb-line bg-jb-surface px-2.5 font-jb text-[13px] text-jb-fg placeholder:text-jb-faint disabled:opacity-50';
const linkClass = 'jb-focus rounded-[4px] font-medium text-jb-cloud underline-offset-2 hover:underline';

function Label({ text, hint, children, className }: { text: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn('flex min-w-0 flex-col gap-1 text-[12px]', className)}>
      <span className="font-semibold text-jb-muted">{text}</span>
      {children}
      {hint ? <span className="text-[11.5px] leading-snug text-jb-faint">{hint}</span> : null}
    </label>
  );
}

/** 播放坞里的「声音」按钮。 */
export function VoiceButton({ api, open, onToggle, btnRef, variant = 'ghost', size = 34 }: { api: VoiceApi; open: boolean; onToggle: () => void; btnRef: (el: HTMLButtonElement | null) => void; variant?: 'ghost' | 'default'; size?: 32 | 34 }) {
  const { t: i18n } = useBoardI18n();
  return (
    <Btn
      ref={btnRef}
      icon={api.on ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
      label={i18n.board.voice}
      title={api.on ? i18n.board.voiceOnTip : i18n.board.voiceOffTip}
      iconOnly
      variant={variant}
      size={size}
      selected={open}
      aria-haspopup="dialog"
      aria-expanded={open}
      className="rounded-[8px]"
      onClick={onToggle}
      data-testid="voice-button"
    />
  );
}

/** 可复制的一行命令（登录命令）。 */
function CommandLine({ text }: { text: string }) {
  const { t: i18n } = useBoardI18n();
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex h-8 items-center gap-2 rounded-[6px] border border-jb-line bg-jb-surface pl-2.5 pr-1">
      <code className="min-w-0 flex-1 truncate font-jb-mono text-[12px]" data-testid="voice-login-command">{text}</code>
      <button type="button" className="jb-focus flex size-6 shrink-0 items-center justify-center rounded-[4px] text-jb-muted hover:bg-jb-hover hover:text-jb-fg" aria-label={i18n.board.copy(text)} title={copied ? i18n.board.cloudCommandCopied : i18n.board.cloudCopyCommand} onClick={() => void copyText(text).then((ok) => setCopied(ok))}>
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </button>
    </div>
  );
}

/** 一个外链（新标签页打开控制台）。 */
function Ext({ href, children, testid }: { href: string; children: ReactNode; testid: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={linkClass} data-testid={testid}>
      {children}
    </a>
  );
}

/** 浮层里正在试听的样音：同一时间只有一个，再点一次停。 */
function useSample() {
  const [playing, setPlaying] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const stop = () => {
    audio.current?.pause();
    audio.current = null;
    setPlaying(null);
  };
  const play = (id: string, url: string) => {
    if (playing === id) return stop();
    stop();
    try {
      const a = new Audio(url);
      audio.current = a;
      a.onended = () => audio.current === a && setPlaying(null);
      a.onerror = () => audio.current === a && setPlaying(null);
      setPlaying(id);
      void a.play().catch(() => audio.current === a && setPlaying(null));
    } catch {
      setPlaying(null);
    }
  };
  useEffect(() => stop, []);
  return { playing, play, stop };
}

/** 额度不够（D85）：说明还差多少、这几步先用浏览器朗读，给“买加油包 ↗”。 */
export function VoiceQuotaOut({ q, steps, chars }: { q: CloudQuotaView; steps: number; chars: number }) {
  const { t: i18n } = useBoardI18n();
  return (
    <div role="alert" className="flex flex-col gap-1 rounded-[8px] border border-[#E0AE00] bg-jb-selected px-3 py-2" data-testid="voice-quota-out">
      <div className="text-[13px] font-semibold">{i18n.board.voiceQuotaOutTitle}</div>
      <p className="text-[12px] leading-[1.5]">{q.out ? i18n.board.voiceQuotaOutBody(steps, chars, Math.max(0, q.left)) : i18n.board.voiceQuotaShortBody(chars, Math.max(0, q.left))}</p>
      {q.usageUrl ? (
        <p className="text-[12px]">
          <Ext href={q.usageUrl} testid="voice-buy-pack">{i18n.board.voiceBuyPack}</Ext>
        </p>
      ) : null}
    </div>
  );
}

/** 声音浮层：开关、声音来源、旁白音色与试听、生成音频。 */
export function VoicePopover({ api, open, anchor, onClose, onManage }: { api: VoiceApi; open: boolean; anchor: HTMLElement | null; onClose: () => void; onManage: () => void }) {
  const { t: i18n } = useBoardI18n();
  useEffect(() => {
    if (open) {
      void api.reloadProfiles();
      void api.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return (
    <Popover open={open} anchor={anchor} onClose={onClose} placement="top-end" width={360} label={i18n.board.voice} testid="voice-popover">
      <VoicePanel api={api} onManage={onManage} />
    </Popover>
  );
}

/** 浮层的内容（单独导出，测试直接渲染）。 */
export function VoicePanel({ api, onManage }: { api: Pick<VoiceApi, 'state' | 'profiles' | 'on' | 'setOn' | 'browserVoice' | 'setBrowserVoice' | 'select' | 'setVoice' | 'generate' | 'busy' | 'error' | 'coverage' | 'estimate' | 'narrator' | 'locale' | 'contentLocale' | 'lang'>; onManage: () => void }) {
  const { t: i18n } = useBoardI18n();
  const { t: shared } = useI18n();
  const { state } = api;
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => browserVoices());
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const up = () => setVoices(browserVoices());
    up();
    window.speechSynthesis.addEventListener('voiceschanged', up);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', up);
  }, []);
  const [listOpen, setListOpen] = useState(false);
  const sample = useSample();
  const fromConfig = state?.source === 'config';
  const current = state?.profile ?? null;
  const cloud = state?.cloud ?? null;
  const lang = api.narrator.locale.slice(0, 2).toLowerCase();
  const shownVoices = voices.filter((v) => v.lang.toLowerCase().startsWith(lang) || (/^(zh|ja|ko)/.test(lang) && v.lang.toLowerCase().startsWith('zh'))).slice(0, 40);
  const g = state?.generating;
  const cov = api.coverage;
  const est = api.estimate;
  const q = current?.kind === 'cloud' ? cloudQuotaView(cloud, est) : null;
  const rows = sourceRows(api.profiles ?? (current ? [current] : []), current);
  /** 样音与音色名按内容语言（没有时界面语言）。 */
  const voiceLocale = api.contentLocale ?? api.locale;
  const narratorId = state?.narrator ?? current?.voice ?? '';
  const narratorChoice = current?.voices.find((v) => v.id === narratorId);
  const narratorName = current?.kind === 'cloud' ? voiceLabel(narratorChoice, narratorId, voiceLocale) : (narratorChoice?.name ?? narratorId);
  const genderLabel = { female: i18n.board.voiceFemale, male: i18n.board.voiceMale, neutral: i18n.board.voiceNeutral };
  const choices: VoiceChoiceView[] = current ? (current.kind === 'cloud' ? current.voices : sortVoices(current.voices, api.lang)) : [];

  const noteOf = (p: VoiceProfileView | null): ReactNode => {
    const n = (text: string, testid?: string, tone = 'text-jb-faint') => <span className={cn('shrink-0 text-[11.5px]', tone)} data-testid={testid}>{text}</span>;
    if (!p) return n(i18n.board.voiceThisComputer);
    if (p.unsupported) return n(i18n.board.voiceUnsupportedBadge, `voice-unsupported-${p.id}`, 'text-jb-pending');
    if (p.kind === 'cloud') {
      if (!cloud) return n(i18n.board.voiceCloudRestart, 'voice-cloud-note');
      if (!cloud.signedIn) return n(i18n.board.voiceSignInToUse, 'voice-cloud-note');
      if (!cloud.quota) return n(i18n.board.voiceCloudOffline, 'voice-cloud-note');
      return n(i18n.board.voiceCharsLeft(cloud.quota.totalRemainingChars), 'voice-cloud-left', 'text-jb-muted');
    }
    return hasKey(p) ? null : n(i18n.board.voiceNoKeyBadge);
  };
  const nameOf = (p: VoiceProfileView | null) => (!p ? i18n.board.voiceBrowser : p.kind === 'cloud' ? i18n.board.voiceCloud : p.name);
  const checkedId = state?.missing ? '__none__' : (current?.id ?? null);

  const sourceRow = (id: string | null, p: VoiceProfileView | null) => {
    const checked = checkedId === id;
    const testid = `voice-source-${id ?? 'browser'}`;
    return (
      <button
        key={testid}
        type="button"
        role="radio"
        aria-checked={checked}
        disabled={fromConfig}
        onClick={() => void api.select(id)}
        data-testid={testid}
        className={cn('jb-focus flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-[13px] disabled:cursor-default', checked ? 'bg-jb-selected font-semibold' : 'hover:bg-jb-hover')}
      >
        <span className={cn('flex size-3.5 shrink-0 items-center justify-center rounded-full border', checked ? 'border-jb-ink bg-jb-accent' : 'border-jb-line')}>{checked ? <Check className="size-2.5" strokeWidth={3} aria-hidden /> : null}</span>
        <span className={cn('min-w-0 flex-1 truncate', p?.unsupported && 'text-jb-muted')}>{nameOf(p)}</span>
        {p?.kind === 'cloud' ? <span className="shrink-0 rounded-[4px] bg-jb-sunken px-1.5 py-px text-[10.5px] font-medium text-jb-muted">{i18n.board.voiceRecommended}</span> : null}
        {noteOf(p)}
      </button>
    );
  };

  let body: ReactNode;
  if (!current) {
    body = (
      <section className="flex flex-col gap-2 border-t border-jb-line px-4 pb-3 pt-2.5">
        <Label text={i18n.board.voiceBrowserVoice} hint={i18n.board.voiceBrowserHint}>
          <select className={field} value={api.browserVoice ?? ''} onChange={(e) => api.setBrowserVoice(e.target.value || null)} data-testid="voice-browser-voice">
            <option value="">{i18n.board.voiceAutomatic}</option>
            {shownVoices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name} ({v.lang})
              </option>
            ))}
          </select>
        </Label>
      </section>
    );
  } else if (current.kind === 'cloud' && cloud && !cloud.signedIn) {
    // 没登录：给可复制的登录命令；先用浏览器朗读
    body = (
      <section className="flex flex-col gap-2 border-t border-jb-line px-4 pb-3 pt-2.5" data-testid="voice-login">
        <p className="text-[13px]">{i18n.board.voiceLoginBody}</p>
        <CommandLine text={cloud.loginCommand ?? 'npx joplo login'} />
        <p className="text-[11.5px] text-jb-faint">{i18n.board.voiceLoginBrowser}</p>
      </section>
    );
  } else {
    const sampleOf = (v: VoiceChoiceView | undefined) => (current.kind === 'cloud' ? sampleUrl(v, voiceLocale) : null);
    const narratorSample = sampleOf(narratorChoice);
    const out = !!q?.out;
    const generateLabel = cov.have === cov.total && cov.total ? i18n.board.voiceAllReady : current.kind === 'cloud' ? i18n.board.voiceGenerateCloud(est.steps, est.chars) : cov.have ? i18n.board.voiceGenerateMissing(cov.total - cov.have) : i18n.board.voiceGenerate;
    body = (
      <section className="flex flex-col gap-2 border-t border-jb-line px-4 pb-3 pt-2.5" data-testid="voice-provider-section">
        {current.unsupported ? <p className="rounded-[8px] bg-jb-sunken px-3 py-2 text-[12px] leading-[1.5]" data-testid="voice-unsupported">{i18n.board.voiceUnsupportedNote}</p> : null}
        <div className="flex items-center justify-between gap-2 text-[12.5px]">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-jb-muted" data-testid="voice-narrator">{i18n.board.voiceNarrator(narratorName)}</span>
            {narratorSample ? (
              <Btn icon={sample.playing === narratorId ? <Square className="size-3" /> : <Play className="size-3" />} label={i18n.board.voicePreview} size={28} variant="default" onClick={() => sample.play(narratorId, narratorSample)} data-testid="voice-preview" />
            ) : null}
            {!current.unsupported && choices.length > 1 ? <Btn label={i18n.board.voiceChange} size={28} variant="ghost" selected={listOpen} onClick={() => setListOpen((v) => !v)} data-testid="voice-change" /> : null}
          </span>
          <span className="shrink-0 font-semibold" data-testid="voice-coverage">
            {g ? i18n.board.voiceGenerating(g.done, g.total) : i18n.board.voiceCoverage(cov.have, cov.total)}
          </span>
        </div>
        {sample.playing ? <span className="self-start rounded-full bg-jb-ok-bg px-2 py-px text-[11px] text-jb-ok" data-testid="voice-previewing">{i18n.board.voicePreviewing}</span> : null}
        {listOpen && !current.unsupported ? (
          <ul className="flex max-h-[180px] flex-col overflow-y-auto rounded-[8px] border border-jb-line" data-testid="voice-list" aria-label={i18n.board.voiceChange}>
            {choices.map((v) => {
              const on = v.id === narratorId;
              const url = sampleOf(v);
              return (
                <li key={v.id} className={cn('flex items-center gap-1.5 px-2 py-1', on ? 'bg-jb-selected' : 'hover:bg-jb-hover')}>
                  <button type="button" className="jb-focus min-w-0 flex-1 truncate rounded-[4px] text-left text-[12.5px]" aria-pressed={on} onClick={() => void api.setVoice(v.id)} data-testid={`voice-pick-${v.id}`}>
                    {on ? '✓ ' : ''}
                    {current.kind === 'cloud' ? voiceLabel(v, v.id, voiceLocale) : v.name}
                    <span className="text-jb-faint"> · {genderLabel[v.gender]}</span>
                  </button>
                  {url ? <Btn icon={sample.playing === v.id ? <Square className="size-3" /> : <Play className="size-3" />} label={i18n.board.voicePreview} iconOnly size={28} variant="ghost" onClick={() => sample.play(v.id, url)} data-testid={`voice-sample-${v.id}`} /> : null}
                </li>
              );
            })}
          </ul>
        ) : null}
        {g ? <div className="h-1.5 overflow-hidden rounded-full bg-jb-sunken"><div className="h-full bg-jb-ink transition-[width]" style={{ width: `${g.total ? Math.round((g.done / g.total) * 100) : 0}%` }} /></div> : null}
        {cov.failed ? <p className="text-[12px] text-jb-danger" data-testid="voice-failed">{i18n.board.voiceFailed(cov.failed, Object.values(state?.failures ?? {})[0]?.message ?? '')}</p> : null}
        {current.kind !== 'cloud' && !current.unsupported && !hasKey(current) ? <p className="text-[12px] text-jb-pending">{i18n.board.voiceNoKey}</p> : null}
        {current.kind === 'cloud' && cloud?.signedIn && !cloud.available ? <p className="text-[12px] text-jb-pending" data-testid="voice-cloud-offline">{i18n.board.voiceCloudOfflineBody}</p> : null}
        {out && q ? (
          <VoiceQuotaOut q={q} steps={est.steps} chars={est.chars} />
        ) : current.unsupported ? null : (
          <>
            <Btn
              icon={api.busy ? <Loader2 className="size-4 animate-spin" /> : <AudioLines className="size-4" />}
              label={generateLabel}
              variant="primary"
              disabled={api.busy || !cov.total || cov.have === cov.total || !canGenerate(current, cloud)}
              onClick={() => void api.generate()}
              className="w-full"
              data-testid="voice-generate"
            />
            {q && q.short && est.steps ? <VoiceQuotaOut q={q} steps={est.steps} chars={est.chars} /> : null}
            {q && !q.short ? <p className="text-[12px] text-jb-muted" data-testid="voice-after">{est.steps ? i18n.board.voiceCharsAfter(q.after) : i18n.board.voiceCharsLeft(q.left)}</p> : null}
          </>
        )}
        <p className="text-[11.5px] leading-snug text-jb-faint">
          {i18n.board.voiceGenerateHint}
          {q?.usageUrl ? (
            <>
              {' '}
              <Ext href={q.usageUrl} testid="voice-usage">{i18n.board.voiceUsage}</Ext>
            </>
          ) : null}
        </p>
      </section>
    );
  }

  return (
    <div className="flex flex-col font-jb text-jb-fg" data-testid="voice-panel">
      <header className="flex items-center justify-between gap-3 px-4 pb-2 pt-3.5">
        <h2 className="text-[17px] font-bold">{i18n.board.voice}</h2>
        <Switch on={api.on} onChange={api.setOn} label={i18n.board.voiceReadAloud} testid="voice-switch" />
      </header>
      <p className="px-4 pb-3 text-[12px] leading-snug text-jb-muted">{i18n.board.voiceReadAloudHint}</p>

      <section className="flex flex-col gap-1 border-t border-jb-line px-3 pb-3 pt-2.5">
        <div className="px-1 pb-1 text-[12px] font-semibold tracking-[1px] text-jb-muted">{i18n.board.voiceSource}</div>
        {fromConfig ? <p className="px-1 pb-1 text-[12px] text-jb-faint" data-testid="voice-from-config">{i18n.board.voiceSetByConfig}</p> : null}
        {state?.missing ? <p className="px-1 pb-1 text-[12px] text-jb-pending" data-testid="voice-config-missing">{i18n.board.voiceConfigMissing(state.missing)}</p> : null}
        <div role="radiogroup" aria-label={i18n.board.voiceSource} className="flex flex-col">
          {rows.map((r) => sourceRow(r.id, r.profile))}
        </div>
      </section>

      {body}
      {api.error ? <p className="border-t border-jb-line px-4 py-2 text-[12px] text-jb-danger" data-testid="voice-error"><LocalText value={api.error} /></p> : null}
      <footer className="border-t border-jb-line px-2 py-1.5">
        <Btn icon={<KeyRound className="size-4" />} label={i18n.board.voiceManageKeys} variant="ghost" onClick={onManage} className="w-full justify-start" data-testid="voice-manage" />
      </footer>
      <span className="sr-only" aria-live="polite">{api.on ? shared.player.turnNarrationOff : shared.player.turnNarrationOn}</span>
    </div>
  );
}

/** 「管理密钥」对话框（D85）：只管 OpenAI 与 ElevenLabs 的 Key（地址固定）；本机旧的 profile 列在下面，可以删除。 */
export function VoiceKeysDialog({ api, open, onClose }: { api: VoiceApi; open: boolean; onClose: () => void }) {
  const { t: i18n } = useBoardI18n();
  useEffect(() => {
    if (!open) return;
    void api.reloadProfiles();
    const k = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopPropagation(), onClose());
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  if (!open) return null;
  const profiles = api.profiles ?? [];
  const keyed = profiles.filter((p) => !p.unsupported && (p.kind === 'openai' || p.kind === 'elevenlabs'));
  const legacy = profiles.filter((p) => p.unsupported);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={i18n.board.voiceKeysTitle} data-jb-pop="" className="jb-pop flex max-h-[88vh] w-[520px] max-w-full flex-col overflow-hidden font-jb text-[13px] text-jb-fg" data-testid="voice-dialog">
        <header className="flex items-center justify-between border-b border-jb-line px-5 py-3">
          <h2 className="text-[17px] font-bold">{i18n.board.voiceKeysTitle}</h2>
          <Btn icon={<X className="size-4" />} label={i18n.board.voiceClose} iconOnly variant="ghost" onClick={onClose} data-testid="voice-dialog-close" />
        </header>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
          <p className="text-[12px] leading-[1.5] text-jb-muted [overflow-wrap:anywhere]" data-testid="voice-profiles-file">{i18n.board.voiceKeysHint(api.profilesFile ?? '~/.joplo')}</p>
          {keyed.map((p) => (
            <KeyRow key={p.id} p={p} api={api} />
          ))}
          {legacy.length ? (
            <section className="flex flex-col gap-2 border-t border-jb-line pt-3" data-testid="voice-legacy">
              <div className="text-[12px] font-semibold text-jb-muted">{i18n.board.voiceLegacyTitle}</div>
              <p className="text-[12px] leading-[1.5] text-jb-faint">{i18n.board.voiceUnsupportedNote}</p>
              {legacy.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate">{p.name}</span>
                  <Btn label={i18n.board.voiceDelete} size={28} variant="ghost" onClick={() => void deleteVoiceProfile(p.id).then((r) => (r.ok ? api.setProfiles(r.profiles) : api.setError(r.message)))} data-testid={`voice-remove-${p.id}`} />
                </div>
              ))}
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** 一家供应商的 Key：状态、粘贴新 Key、测试（试读一句）、保存、删掉保存的 Key。 */
function KeyRow({ p, api }: { p: VoiceProfileView; api: VoiceApi }) {
  const { t: i18n } = useBoardI18n();
  const [key, setKey] = useState('');
  const [working, setWorking] = useState<'test' | 'save' | null>(null);
  const [test, setTest] = useState<VoiceTestResult | null>(null);
  const [msg, setMsg] = useState<Text | null>(null);
  const status = p.key.saved ? i18n.board.voiceKeySaved : p.key.envSet && p.key.env ? i18n.board.voiceKeyFromEnv(p.key.env) : i18n.board.voiceNoKeyBadge;
  const runTest = async () => {
    setWorking('test');
    setMsg(null);
    const r = await testVoiceProfile({ id: p.id, ...(key ? { key } : {}) });
    setWorking(null);
    setTest(r);
    if (r.ok) void new Audio(r.audio).play().catch(() => undefined);
  };
  const save = async (next: string | null) => {
    setWorking('save');
    setMsg(null);
    const r = await saveVoiceProfile(p.id, undefined, next);
    setWorking(null);
    if (!r.ok) return setMsg(r.message);
    api.setProfiles(r.profiles);
    setKey('');
    setTest(null);
    setMsg(i18n.board.voiceSaved);
  };
  return (
    <section className="flex flex-col gap-2 rounded-[10px] border border-jb-line p-3" data-testid={`voice-key-${p.id}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[14px] font-semibold">{p.name}</span>
        <span className="text-[11.5px] text-jb-muted">{status}</span>
      </div>
      <Label text={i18n.board.voiceApiKey} hint={p.key.saved ? i18n.board.voiceKeyKeep(p.key.hint ?? '') : p.key.env ? i18n.board.voiceKeyEnv(p.key.env) : i18n.board.voiceKeyLocal}>
        <input className={field} type="password" autoComplete="off" value={key} placeholder={p.key.saved ? (p.key.hint ?? '') : ''} onChange={(e) => (setKey(e.target.value), setTest(null))} data-testid={`voice-key-input-${p.id}`} />
      </Label>
      {test && !test.ok ? <p className="break-words text-[12px] text-jb-danger" data-testid="voice-test-error"><LocalText value={test.message} /></p> : null}
      {test?.ok ? <p className="text-[12px] text-jb-ok" data-testid="voice-test-ok">{i18n.board.voiceTestOk(test.contentType.replace('audio/', ''), Math.max(1, Math.round(test.bytes / 1024)))}</p> : null}
      {msg ? <p className="text-[12px] text-jb-muted"><LocalText value={msg} /></p> : null}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {p.key.saved ? <Btn label={i18n.board.voiceRemoveKey} size={28} variant="ghost" disabled={!!working} onClick={() => void save(null)} data-testid={`voice-key-remove-${p.id}`} /> : null}
        <Btn icon={working === 'test' ? <Loader2 className="size-4 animate-spin" /> : undefined} label={i18n.board.voiceTest} size={28} disabled={!!working || (!key && !hasKey(p))} onClick={() => void runTest()} data-testid={`voice-key-test-${p.id}`} />
        <Btn label={i18n.board.voiceSave} size={28} variant="primary" disabled={!!working || !key.trim()} onClick={() => void save(key.trim())} data-testid={`voice-key-save-${p.id}`} />
      </div>
    </section>
  );
}
