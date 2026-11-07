import type { Text } from '../i18n/messages';
import { LocalText } from '../i18n/LocalText';
import { useBoardI18n } from '../i18n/board/context';
import { useI18n } from '../i18n/context';
/**
 * 看板的朗读（D74）：播放坞里的「声音」按钮 → 浮层（开关、声音来源、生成音频）→「管理供应商…」→ 设置对话框（profile 增删改、测试）。
 *
 * 数据流：
 * - 开关与浏览器声音：本机 localStorage（joplo.voice.on / joplo.voice.browser），看板默认关。
 * - 声音来源：PUT /__joplo/p/:id/voice（记在项目 .joplo/voice/index.json）；config 写了 voice.profile 时以 config 为准，这里只读。
 * - 音频：GET …/voice + joplo:voice 推送 → narrator.lookup（声音指纹 + 片段键 → 地址）→ DemoController 播放时用。
 * - 生成：voiceSegments（当前方案所有场景、当前语言）→ POST …/voice/generate（每 100 段一批）。
 * - profile：GET/PUT/DELETE /__joplo/voice/profiles；Key 只提交、不回显（只显示末 4 位）。
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AudioLines, Check, ListChecks, Loader2, Plus, Settings2, Volume2, VolumeX, X } from 'lucide-react';
import { speakerRoleAt, spokenLine, type Project } from '@joplo-app/core';
import { stepCaption } from '../i18n/step-caption';
import { cn } from '@/lib/utils';
import { Btn, Switch } from '../player/controls';
import { Popover } from '../player/popover';
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
  type VoiceProfileView,
  type VoiceResponseMode,
  type VoiceState,
  type VoiceTestResult,
} from '../runtime/dev-client';
import { connectionChanged, draftOf, draftReady, hasKey, inputOf, narrationLanguage, sortVoices, voiceCoverage, voiceSegments, type VoiceDraft } from './voice-model';
import type { Locale } from '../i18n/locale';

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
export function useVoice(projectId: string, project: Project | null, optionId: string | null, ctl: DemoController, locale: Locale, at: { scenarioId: string | null; position: number }) {
  const { t } = useI18n();
  const narrator = useMemo(() => new Narrator(), [projectId]);
  const [on, setOnState] = useState(() => readLocal(ON_KEY) === '1');
  const [browserVoice, setBrowserVoiceState] = useState<string | null>(() => readLocal(BROWSER_KEY));
  const [state, setState] = useState<VoiceState | null>(null);
  const [profiles, setProfiles] = useState<VoiceProfileView[] | null>(null);
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

  const reloadProfiles = () => fetchVoiceProfiles().then((r) => (Array.isArray(r) ? setProfiles(r) : setError(r.error)));

  // narrator 跟着状态走；控制器在播放时用它
  narrator.enabled = on;
  narrator.browserVoice = browserVoice;
  narrator.locale = locale;
  narrator.lookup = state ? { narrator: state.voices.narrator, roles: state.voices.roles, clips: state.clips } : null;
  // 边放边生成：选了供应商且有 Key 时，播到还没有音频的一步就当场生成这一段（同一段只请求一次）
  const inflight = useRef(new Map<string, Promise<string | null>>());
  const ready = !!state?.profile && hasKey(state.profile);
  // 换了供应商或音色（声音指纹变了）：之前请求过的段作废
  const voicesSig = state ? JSON.stringify(state.voices) : '';
  useEffect(() => inflight.current.clear(), [voicesSig]);
  narrator.ensure = ready
    ? (text, role) => {
        const k = `${role ?? ''}|${text}`;
        let p = inflight.current.get(k);
        if (!p) {
          const stepId = segmentsRef.current.find((s) => s.text === text && s.role === role)?.stepId ?? 'adhoc';
          p = requestClip(projectId, locale, { stepId, text, role }).then((r) => (r.ok ? r.url : null));
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
  const coverage = voiceCoverage(segments, (s) => narrator.hasClip(s.text, s.role), state?.failures ?? {});
  /** 旁白的语言（跟随语言）：按朗读文字识别，识别不出时跟随界面语言。 */
  const lang = narrationLanguage(segments, locale);

  const select = async (profileId: string | null) => {
    setError(null);
    const r = await selectVoiceProfile(projectId, profileId);
    if (r.ok) setState(r.state);
    else setError(r.message);
  };

  const generate = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      for (let i = 0; i < segments.length; i += 100) {
        const r = await generateVoice(projectId, locale, segments.slice(i, i + 100));
        if (!r.ok) {
          setError(r.message);
          break;
        }
        setState(r.state);
      }
    } finally {
      setBusy(false);
    }
  };

  return { narrator, on, setOn, browserVoice, setBrowserVoice, state, profiles, reloadProfiles, setProfiles, select, generate, busy: busy || !!state?.generating, error, setError, coverage, segments, lang, locale };
}

const CUSTOM = '__custom__';
const field = 'jb-focus h-8 w-full min-w-0 rounded-[6px] border border-jb-line bg-jb-surface px-2.5 font-jb text-[13px] text-jb-fg placeholder:text-jb-faint disabled:opacity-50';

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

/** 声音浮层：开关、声音来源、生成音频。 */
export function VoicePopover({ api, open, anchor, onClose, onManage }: { api: VoiceApi; open: boolean; anchor: HTMLElement | null; onClose: () => void; onManage: () => void }) {
  const { t: i18n } = useBoardI18n();
  const { t: shared } = useI18n();
  const { state, profiles } = api;
  useEffect(() => {
    if (open) void api.reloadProfiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => browserVoices());
  useEffect(() => {
    if (!open || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const up = () => setVoices(browserVoices());
    up();
    window.speechSynthesis.addEventListener('voiceschanged', up);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', up);
  }, [open]);
  const fromConfig = state?.source === 'config';
  const current = state?.profile ?? null;
  const lang = api.narrator.locale.slice(0, 2).toLowerCase();
  const shownVoices = voices.filter((v) => v.lang.toLowerCase().startsWith(lang) || (/^(zh|ja|ko)/.test(lang) && v.lang.toLowerCase().startsWith('zh'))).slice(0, 40);
  const g = state?.generating;
  const cov = api.coverage;

  const sourceRow = (id: string | null, name: string, note: ReactNode, testid: string) => {
    const checked = (current?.id ?? null) === id && !state?.missing;
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
        <span className="min-w-0 flex-1 truncate">{name}</span>
        {note}
      </button>
    );
  };

  return (
    <Popover open={open} anchor={anchor} onClose={onClose} placement="top-end" width={360} label={i18n.board.voice} testid="voice-popover">
      <div className="flex flex-col font-jb text-jb-fg">
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
            {sourceRow(null, i18n.board.voiceBrowser, null, 'voice-source-browser')}
            {(profiles ?? []).map((p) => sourceRow(p.id, p.name, hasKey(p) ? null : <span className="shrink-0 text-[11.5px] text-jb-faint">{i18n.board.voiceNoKeyBadge}</span>, `voice-source-${p.id}`))}
          </div>
        </section>

        {!current ? (
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
        ) : (
          <section className="flex flex-col gap-2 border-t border-jb-line px-4 pb-3 pt-2.5" data-testid="voice-provider-section">
            <div className="flex items-baseline justify-between gap-2 text-[12.5px]">
              <span className="truncate text-jb-muted">{i18n.board.voiceNarrator(state?.narrator ?? current.voice)}</span>
              <span className="shrink-0 font-semibold" data-testid="voice-coverage">
                {g ? i18n.board.voiceGenerating(g.done, g.total) : i18n.board.voiceCoverage(cov.have, cov.total)}
              </span>
            </div>
            {g ? <div className="h-1.5 overflow-hidden rounded-full bg-jb-sunken"><div className="h-full bg-jb-ink transition-[width]" style={{ width: `${g.total ? Math.round((g.done / g.total) * 100) : 0}%` }} /></div> : null}
            {cov.failed ? <p className="text-[12px] text-jb-danger" data-testid="voice-failed">{i18n.board.voiceFailed(cov.failed, Object.values(state?.failures ?? {})[0]?.message ?? '')}</p> : null}
            {!hasKey(current) ? <p className="text-[12px] text-jb-pending">{i18n.board.voiceNoKey}</p> : null}
            <Btn
              icon={api.busy ? <Loader2 className="size-4 animate-spin" /> : <AudioLines className="size-4" />}
              label={cov.have && cov.have < cov.total ? i18n.board.voiceGenerateMissing(cov.total - cov.have) : cov.have === cov.total && cov.total ? i18n.board.voiceAllReady : i18n.board.voiceGenerate}
              variant="primary"
              disabled={api.busy || !cov.total || cov.have === cov.total || !hasKey(current)}
              onClick={() => void api.generate()}
              className="w-full"
              data-testid="voice-generate"
            />
            <p className="text-[11.5px] leading-snug text-jb-faint">{i18n.board.voiceGenerateHint}</p>
          </section>
        )}
        {api.error ? <p className="border-t border-jb-line px-4 py-2 text-[12px] text-jb-danger" data-testid="voice-error"><LocalText value={api.error} /></p> : null}
        <footer className="border-t border-jb-line px-2 py-1.5">
          <Btn icon={<Settings2 className="size-4" />} label={i18n.board.voiceManage} variant="ghost" onClick={onManage} className="w-full justify-start" data-testid="voice-manage" />
        </footer>
        <span className="sr-only" aria-live="polite">{api.on ? shared.player.turnNarrationOff : shared.player.turnNarrationOn}</span>
      </div>
    </Popover>
  );
}

/** 「管理供应商」对话框：左边 profile 列表，右边表单；测试通过才能保存。 */
export function VoiceProfilesDialog({ api, open, onClose, canSelect }: { api: VoiceApi; open: boolean; onClose: () => void; canSelect: boolean }) {
  const { t: i18n } = useBoardI18n();
  const profiles = api.profiles ?? [];
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [draft, setDraft] = useState<VoiceDraft>(draftOf(null));
  const [key, setKey] = useState('');
  const [tested, setTested] = useState<{ d: VoiceDraft; k: string } | null>(null);
  const [test, setTest] = useState<VoiceTestResult | null>(null);
  const [working, setWorking] = useState<'test' | 'save' | null>(null);
  const [msg, setMsg] = useState<Text | null>(null);
  const panel = useRef<HTMLDivElement | null>(null);
  const cur = editing && editing !== 'new' ? (profiles.find((p) => p.id === editing) ?? null) : null;
  const [customVoice, setCustomVoice] = useState(false);
  // 预设音色：推荐的、口音与旁白语言一致的排前面；名字之外的说明按界面语言显示
  const choices = sortVoices(cur?.voices ?? (draft.kind === 'openai' ? (profiles.find((p) => p.preset === 'openai')?.voices ?? []) : draft.kind === 'elevenlabs' ? (profiles.find((p) => p.preset === 'elevenlabs')?.voices ?? []) : []), api.lang);
  const genderLabel = { female: i18n.board.voiceFemale, male: i18n.board.voiceMale, neutral: i18n.board.voiceNeutral };
  const names = (type: 'language' | 'region') => {
    try {
      return new Intl.DisplayNames([api.locale], { type });
    } catch {
      return null;
    }
  };
  const langName = names('language')?.of(api.lang) ?? api.lang;
  const accentName = (tag: string) => names('language')?.of(tag) ?? tag;

  useEffect(() => {
    if (!open) return;
    void api.reloadProfiles();
    const k = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopPropagation(), onClose());
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  // 打开时选中正在用的 profile（没有时第一个）
  useEffect(() => {
    if (!open || editing || !profiles.length) return;
    pick(api.state?.profile?.id ?? profiles[0]!.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, profiles.length]);

  const pick = (id: string | 'new') => {
    setEditing(id);
    const next = draftOf(id === 'new' ? null : (profiles.find((p) => p.id === id) ?? null));
    setDraft(next);
    setCustomVoice(false);
    setKey('');
    setTested(null);
    setTest(null);
    setMsg(null);
  };
  const set = (patch: Partial<VoiceDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const passed = !!tested && !connectionChanged(tested.d, draft) && tested.k === key;
  const keyed = !!key || !!cur?.key.saved || !!cur?.key.envSet || draft.kind === 'http';

  const runTest = async () => {
    setWorking('test');
    setMsg(null);
    const r = await testVoiceProfile({ ...(cur ? { id: cur.id } : {}), profile: inputOf(draft), ...(key ? { key } : {}) });
    setWorking(null);
    setTest(r);
    if (r.ok) {
      setTested({ d: draft, k: key });
      void new Audio(r.audio).play().catch(() => undefined);
    }
  };
  const save = async (use: boolean) => {
    setWorking('save');
    setMsg(null);
    const r = await saveVoiceProfile(cur?.id ?? null, inputOf(draft), key ? key : undefined);
    setWorking(null);
    if (!r.ok) return setMsg(r.message);
    api.setProfiles(r.profiles);
    setEditing(r.profile.id);
    setKey('');
    // 保存后已测试的状态保留（Key 已经存下，输入框清空，不再算“改过”）
    if (passed) setTested({ d: draft, k: '' });
    if (use) {
      await api.select(r.profile.id);
      onClose();
    } else setMsg(i18n.board.voiceSaved);
  };
  const remove = async () => {
    if (!cur) return;
    const r = await deleteVoiceProfile(cur.id);
    if (!r.ok) return setMsg(r.message);
    api.setProfiles(r.profiles);
    if (cur.removable) {
      if (api.state?.selected === cur.id) await api.select(null);
      setEditing(null);
      pick(r.profiles[0]?.id ?? 'new');
    } else pick(cur.id);
  };

  if (!open) return null;
  const respLabel: Record<VoiceResponseMode, string> = { audio: i18n.board.voiceResponseAudio, 'json-base64': i18n.board.voiceResponseBase64, 'json-url': i18n.board.voiceResponseUrl };
  const preset = !!cur?.preset;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panel} role="dialog" aria-modal="true" aria-label={i18n.board.voiceProviders} data-jb-pop="" className="jb-pop flex max-h-[88vh] w-[780px] max-w-full flex-col overflow-hidden font-jb text-[13px] text-jb-fg" data-testid="voice-dialog">
        <header className="flex items-center justify-between border-b border-jb-line px-5 py-3">
          <h2 className="text-[17px] font-bold">{i18n.board.voiceProviders}</h2>
          <Btn icon={<X className="size-4" />} label={i18n.board.voiceClose} iconOnly variant="ghost" onClick={onClose} data-testid="voice-dialog-close" />
        </header>
        <div className="flex min-h-0 flex-1">
          <nav className="flex w-[230px] shrink-0 flex-col gap-1 overflow-y-auto border-r border-jb-line p-3">
            {profiles.map((p) => (
              <button key={p.id} type="button" onClick={() => pick(p.id)} data-testid={`voice-profile-${p.id}`} className={cn('jb-focus flex flex-col items-start gap-0.5 rounded-[6px] px-2.5 py-2 text-left', editing === p.id ? 'bg-jb-selected outline-[1.5px] outline-jb-ink' : 'hover:bg-jb-hover')} style={editing === p.id ? { outlineStyle: 'solid' } : undefined}>
                <span className="w-full truncate font-semibold">{p.name}</span>
                <span className="w-full truncate text-[11.5px] text-jb-muted">
                  {p.preset ? `${i18n.board.voicePreset} · ` : ''}
                  {p.key.saved ? i18n.board.voiceKeySaved : p.key.envSet && p.key.env ? i18n.board.voiceKeyFromEnv(p.key.env) : p.kind === 'http' ? hostOf(p.baseUrl) : i18n.board.voiceNoKeyBadge}
                </span>
              </button>
            ))}
            <Btn icon={<Plus className="size-4" />} label={i18n.board.voiceNewProvider} variant="default" onClick={() => pick('new')} className="mt-1 w-full" data-testid="voice-profile-new" />
            <p className="mt-2 px-1 text-[11.5px] leading-snug text-jb-faint">{i18n.board.voiceProvidersHint}</p>
          </nav>
          <form
            className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (passed) void save(canSelect);
            }}
            data-testid="voice-form"
          >
            <div className="grid grid-cols-2 gap-3">
              <Label text={i18n.board.voiceName}>
                <input className={field} value={draft.name} onChange={(e) => set({ name: e.target.value })} data-testid="voice-name" />
              </Label>
              <Label text={i18n.board.voiceKind}>
                <select className={field} value={draft.kind} disabled={preset} onChange={(e) => set({ kind: e.target.value as VoiceDraft['kind'] })} data-testid="voice-kind">
                  <option value="openai">{i18n.board.voiceKindOpenai}</option>
                  <option value="elevenlabs">ElevenLabs</option>
                  <option value="http">{i18n.board.voiceKindHttp}</option>
                </select>
              </Label>
            </div>
            <Label text={draft.kind === 'http' ? i18n.board.voiceRequestUrl : i18n.board.voiceBaseUrl} hint={draft.kind === 'openai' ? i18n.board.voiceBaseUrlHint(`${draft.baseUrl.replace(/\/+$/, '') || '…'}/audio/speech`) : draft.kind === 'elevenlabs' ? i18n.board.voiceBaseUrlHint(`${draft.baseUrl.replace(/\/+$/, '') || '…'}/text-to-speech/{voice}`) : undefined}>
              <input className={field} value={draft.baseUrl} placeholder="https://" onChange={(e) => set({ baseUrl: e.target.value })} data-testid="voice-base-url" />
            </Label>
            <Label text={i18n.board.voiceApiKey} hint={cur?.key.saved ? i18n.board.voiceKeyKeep(cur.key.hint ?? '') : cur?.key.env ? i18n.board.voiceKeyEnv(cur.key.env) : i18n.board.voiceKeyLocal}>
              <input className={field} type="password" autoComplete="off" value={key} placeholder={cur?.key.saved ? (cur.key.hint ?? '') : ''} onChange={(e) => setKey(e.target.value)} data-testid="voice-key" />
            </Label>
            <div className="grid grid-cols-2 gap-3">
              <Label text={i18n.board.voiceModel}>
                <input className={field} value={draft.model} onChange={(e) => set({ model: e.target.value })} data-testid="voice-model" />
              </Label>
              <Label text={i18n.board.voiceDefaultVoice} hint={draft.kind === 'openai' ? i18n.board.voiceLanguageHint(langName) : undefined}>
                {choices.length && !customVoice ? (
                  <select className={field} value={choices.some((c) => c.id === draft.voice) ? draft.voice : ''} onChange={(e) => (e.target.value === CUSTOM ? setCustomVoice(true) : set({ voice: e.target.value }))} data-testid="voice-voice">
                    {choices.some((c) => c.id === draft.voice) ? null : <option value="">{draft.voice || '—'}</option>}
                    {choices.map((c) => (
                      <option key={c.id} value={c.id}>
                        {[c.name, genderLabel[c.gender], c.accent ? accentName(c.accent) : null, c.recommended ? i18n.board.voiceRecommended : null].filter(Boolean).join(' · ')}
                      </option>
                    ))}
                    <option value={CUSTOM}>{i18n.board.voiceOtherVoice}</option>
                  </select>
                ) : (
                  <span className="relative flex min-w-0">
                    <input className={cn(field, choices.length && 'pr-9')} value={draft.voice} autoFocus={customVoice} onChange={(e) => set({ voice: e.target.value })} data-testid="voice-voice" />
                    {choices.length ? (
                      <Btn
                        icon={<ListChecks className="size-4" />}
                        label={i18n.board.voicePickFromList}
                        iconOnly
                        variant="ghost"
                        size={28}
                        className="absolute right-0.5 top-0.5"
                        onClick={() => {
                          setCustomVoice(false);
                          if (!choices.some((c) => c.id === draft.voice)) set({ voice: choices[0]!.id });
                        }}
                        data-testid="voice-pick-from-list"
                      />
                    ) : null}
                  </span>
                )}
              </Label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Label text={i18n.board.voiceResponse}>
                <select className={field} value={draft.response} onChange={(e) => set({ response: e.target.value as VoiceResponseMode })} data-testid="voice-response">
                  {(['audio', 'json-base64', 'json-url'] as const).map((r) => (
                    <option key={r} value={r}>
                      {respLabel[r]}
                    </option>
                  ))}
                </select>
              </Label>
              <Label text={i18n.board.voiceFieldPath}>
                <input className={field} value={draft.path} placeholder="data.audio" disabled={draft.response === 'audio'} onChange={(e) => set({ path: e.target.value })} data-testid="voice-path" />
              </Label>
            </div>
            {draft.kind === 'openai' ? (
              <Label text={i18n.board.voiceStyle} hint={i18n.board.voiceStyleHint}>
                <textarea className={cn(field, 'h-[72px] py-1.5 text-[12.5px] leading-snug')} value={draft.style} onChange={(e) => set({ style: e.target.value })} data-testid="voice-style" />
              </Label>
            ) : null}
            {draft.kind === 'http' ? (
              <Label text={i18n.board.voiceBodyTemplate} hint={i18n.board.voiceBodyHint}>
                <textarea className={cn(field, 'h-20 py-1.5 font-jb-mono text-[12px]')} value={draft.body} onChange={(e) => set({ body: e.target.value })} data-testid="voice-body" />
              </Label>
            ) : null}

            {test && !test.ok ? (
              <div className="flex flex-col gap-1.5 rounded-[8px] border border-jb-danger bg-jb-danger-bg px-3 py-2 text-[12.5px]" data-testid="voice-test-error">
                <span className="break-words text-jb-danger"><LocalText value={test.message} /></span>
                {test.hint ? (
                  <span className="flex flex-wrap items-center gap-2">
                    <span>{i18n.board.voiceTestHint(respLabel[test.hint.response], test.hint.path)}</span>
                    <Btn label={i18n.board.voiceUseSuggestion} size={28} onClick={() => test.hint && set({ response: test.hint.response, path: test.hint.path })} data-testid="voice-use-hint" />
                  </span>
                ) : null}
              </div>
            ) : null}
            {test?.ok && passed ? (
              <div className="flex items-center gap-2 rounded-[8px] border border-jb-ok bg-jb-ok-bg px-3 py-2 text-[12.5px]" data-testid="voice-test-ok">
                <Check className="size-4 text-jb-ok" aria-hidden />
                <span>{i18n.board.voiceTestOk(test.contentType.replace('audio/', ''), Math.max(1, Math.round(test.bytes / 1024)))}</span>
                <Btn icon={<Volume2 className="size-4" />} label={i18n.board.voicePlayAgain} iconOnly size={28} variant="ghost" onClick={() => void new Audio(test.audio).play().catch(() => undefined)} />
              </div>
            ) : null}
            {msg ? <p className="text-[12.5px] text-jb-muted" data-testid="voice-dialog-msg"><LocalText value={msg} /></p> : null}

            <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-jb-line pt-3">
              <div>{cur ? <Btn label={cur.removable ? i18n.board.voiceDelete : i18n.board.voiceResetPreset} variant="ghost" onClick={() => void remove()} data-testid="voice-remove" /> : null}</div>
              <div className="flex items-center gap-2">
                <Btn icon={working === 'test' ? <Loader2 className="size-4 animate-spin" /> : undefined} label={i18n.board.voiceTest} disabled={!draftReady(draft) || !keyed || !!working} onClick={() => void runTest()} data-testid="voice-test" />
                <Btn label={i18n.board.voiceSave} disabled={!passed || !!working} title={passed ? undefined : i18n.board.voiceTestFirst} onClick={() => void save(false)} data-testid="voice-save" />
                {canSelect ? <Btn label={i18n.board.voiceSaveAndUse} variant="primary" disabled={!passed || !!working} title={passed ? undefined : i18n.board.voiceTestFirst} onClick={() => void save(true)} data-testid="voice-save-use" /> : null}
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

const hostOf = (u: string) => {
  try {
    return new URL(u).host;
  } catch {
    return u;
  }
};
