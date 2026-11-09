/**
 * 网页里的朗读（D74）：看板与发布站共用。DemoController 在每一步提交时调用 narrator.speak，播放时等它读完。
 *
 * - 有这一步当前声音的音频（voiceIndex.clips[clipKey(指纹, 文字)]）：用 <audio> 播放（看板来自 joplo dev，发布站来自 build 带上的 voice/）。
 *   分享页在沙箱里（connect-src 'none'），只能用 <audio src> 读同一站点的文件，不能 fetch。
 * - 没有音频，或音频加载 / 播放失败：用浏览器朗读（Web Speech）。浏览器不支持时这一步不读（返回 null）。
 * - 倍速：音频 playbackRate、朗读 rate 都等于播放速度。
 * - 每段都有兜底计时：读完事件没来（浏览器的已知问题）时按估算时长结束，播放不会卡住。
 */
import { clipKey, readingMs, voiceFingerprint } from '@joplo-app/core/runtime';

export type NarrationSource = 'clip' | 'browser';

export interface Narration {
  readonly source: NarrationSource;
  /** 读完、出错或被取消时 resolve（不会 reject）。 */
  readonly done: Promise<void>;
  pause(): void;
  resume(): void;
  cancel(): void;
}

export type VoiceLookup = { narrator: string | null; roles: Record<string, string>; clips: Record<string, string>; overrides?: Record<string, string> };

/** 浏览器能用的朗读声音（可能异步加载）。 */
export function browserVoices(): SpeechSynthesisVoice[] {
  try {
    return typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis.getVoices() : [];
  } catch {
    return [];
  }
}

/** 有没有中日韩文字（按码点判断：源码里不放 CJK 字面量）。 */
const hasWide = (t: string) =>
  [...t].some((ch) => {
    const c = ch.codePointAt(0) ?? 0;
    return (c >= 0x2e80 && c <= 0x9fff) || (c >= 0xac00 && c <= 0xd7af) || (c >= 0xf900 && c <= 0xfaff);
  });
const WIDE_LOCALES = /^(zh|ja|ko)/;

/** 朗读语言：文字是中日韩而界面语言不是时，按 zh-CN 读；否则跟随界面语言。 */
export function speechLang(text: string, locale: string): string {
  return hasWide(text) && !WIDE_LOCALES.test(locale) ? 'zh-CN' : locale;
}

/** 一段计时：可以暂停、继续、取消；到时调 fire。 */
function guard(ms: number, fire: () => void) {
  let left = ms;
  let started = Date.now();
  let t: ReturnType<typeof setTimeout> | null = setTimeout(fire, left);
  return {
    pause() {
      if (!t) return;
      clearTimeout(t);
      t = null;
      left -= Date.now() - started;
    },
    resume() {
      if (t) return;
      started = Date.now();
      t = setTimeout(fire, Math.max(0, left));
    },
    clear() {
      if (t) clearTimeout(t);
      t = null;
    },
  };
}

function settle(): { done: Promise<void>; finish: () => void; finished: () => boolean } {
  let finish!: () => void;
  let over = false;
  const done = new Promise<void>((r) => (finish = () => ((over = true), r())));
  return { done, finish, finished: () => over };
}

/** 浏览器朗读一段。 */
function speakBrowser(text: string, o: { speed: number; lang: string; voiceURI: string | null }): Narration | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') return null;
  const synth = window.speechSynthesis;
  const u = new SpeechSynthesisUtterance(text);
  u.rate = Math.max(0.5, Math.min(2, o.speed));
  const voices = synth.getVoices();
  const chosen = (o.voiceURI ? voices.find((v) => v.voiceURI === o.voiceURI) : undefined) ?? voices.find((v) => v.lang.toLowerCase() === o.lang.toLowerCase()) ?? voices.find((v) => v.lang.toLowerCase().startsWith(o.lang.slice(0, 2).toLowerCase()));
  if (chosen) {
    u.voice = chosen;
    u.lang = chosen.lang;
  } else u.lang = o.lang;
  const s = settle();
  // 兜底：按阅读时长的 2 倍 + 3 秒（end 事件偶尔不来）
  const g = guard((readingMs(text) * 2) / u.rate + 3000, () => end());
  const end = () => {
    if (s.finished()) return;
    g.clear();
    s.finish();
  };
  u.onend = end;
  u.onerror = end;
  synth.cancel();
  synth.speak(u);
  return {
    source: 'browser',
    done: s.done,
    pause: () => {
      g.pause();
      synth.pause();
    },
    resume: () => {
      g.resume();
      synth.resume();
    },
    cancel: () => {
      if (s.finished()) return;
      synth.cancel();
      end();
    },
  };
}

/** 播放一段音频；加载或播放失败时改用 onFail 给的朗读（失败那一刻接上，done 跟着它）。 */
function playClip(url: string, o: { speed: number; onFail: () => Narration | null }): Narration {
  const a = new Audio(url);
  a.preload = 'auto';
  a.playbackRate = o.speed;
  (a as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true;
  const s = settle();
  let paused = false;
  let fallback: Narration | null = null;
  let cancelled = false;
  // 兜底：时长已知时按时长 + 3 秒，未知时 60 秒
  let g = guard(60_000, () => end());
  const end = () => {
    if (s.finished()) return;
    g.clear();
    s.finish();
  };
  const fail = () => {
    if (s.finished() || fallback || cancelled) return;
    g.clear();
    a.pause();
    fallback = o.onFail();
    if (!fallback) return end();
    if (paused) fallback.pause();
    void fallback.done.then(end);
  };
  a.addEventListener('loadedmetadata', () => {
    if (!Number.isFinite(a.duration) || fallback) return;
    g.clear();
    g = guard((a.duration * 1000) / o.speed + 3000, () => end());
    if (paused) g.pause();
  });
  a.addEventListener('ended', end);
  a.addEventListener('error', fail);
  void a.play().catch((e: unknown) => {
    // 浏览器不允许自动出声（没有用户手势）：这一步不读，播放照常往下走
    if (e instanceof DOMException && e.name === 'NotAllowedError') return end();
    fail();
  });
  return {
    get source() {
      return fallback ? 'browser' : 'clip';
    },
    done: s.done,
    pause: () => {
      paused = true;
      g.pause();
      if (fallback) fallback.pause();
      else a.pause();
    },
    resume: () => {
      paused = false;
      g.resume();
      if (fallback) fallback.resume();
      else void a.play().catch(() => end());
    },
    cancel: () => {
      cancelled = true;
      a.pause();
      a.removeAttribute('src');
      fallback?.cancel();
      end();
    },
  } as Narration;
}

/**
 * 还没有音频、正在生成的一段（边放边生成）：等生成结果，最多 waitMs；拿到地址就播音频，失败或超时改用浏览器朗读。
 * 等待期间这一段算“正在读”（自动播放会等它），暂停 / 取消同样生效。
 */
function pendingClip(url: Promise<string | null>, o: { waitMs: number; play: (url: string) => Narration; fallback: () => Narration | null }): Narration {
  const s = settle();
  let inner: Narration | null = null;
  let paused = false;
  let over = false;
  const g = guard(o.waitMs, () => go(null));
  const go = (u: string | null) => {
    if (inner || over) return;
    g.clear();
    inner = u ? o.play(u) : o.fallback();
    if (!inner) return void ((over = true), s.finish());
    if (paused) inner.pause();
    void inner.done.then(() => s.finish());
  };
  url.then(go, () => go(null));
  return {
    get source() {
      return inner?.source ?? 'clip';
    },
    done: s.done,
    pause: () => {
      paused = true;
      g.pause();
      inner?.pause();
    },
    resume: () => {
      paused = false;
      g.resume();
      inner?.resume();
    },
    cancel: () => {
      over = true;
      g.clear();
      inner?.cancel();
      s.finish();
    },
  } as Narration;
}

/** 看板 / 发布站各有一个；enabled 关闭时什么都不读。 */
export class Narrator {
  enabled = false;
  /** 音频索引：看板来自 joplo dev（GET …/voice），发布站来自 IR 的 voiceIndex；没有时只用浏览器朗读。 */
  lookup: VoiceLookup | null = null;
  /** 看板里选的浏览器声音（voiceURI）；null = 按语言自动选。 */
  browserVoice: string | null = null;
  /** 界面语言（决定浏览器朗读的语言）。 */
  locale = 'en';
  /**
   * 边放边生成（只有看板有）：这一段还没有音频时向 joplo dev 要一段；返回 null 表示不生成（没选供应商、没 Key）。
   */
  ensure: ((text: string, role: string | null) => Promise<string | null> | null) | null = null;
  /** 等生成的最长时间；超过就先用浏览器朗读，音频生成好之后下次播放再用。 */
  waitMs = 10_000;

  /** 读一段：role 为 null 时是旁白。返回 null 表示这一步不读。 */
  speak(text: string, role: string | null, speed: number): Narration | null {
    const t = text.trim();
    if (!this.enabled || !t) return null;
    const browser = () => speakBrowser(t, { speed, lang: speechLang(t, this.locale), voiceURI: this.browserVoice });
    const fp = this.lookup ? voiceFingerprint(this.lookup, role, t) : null;
    const url = fp ? this.lookup!.clips[clipKey(fp, t)] : undefined;
    if (url) return playClip(url, { speed, onFail: browser });
    const pending = fp ? this.ensure?.(t, role) : null;
    if (pending) return pendingClip(pending, { waitMs: this.waitMs, play: (u) => playClip(u, { speed, onFail: browser }), fallback: browser });
    return browser();
  }

  /** 预先生成后面几步（不等结果）。 */
  prefetch(text: string, role: string | null) {
    const t = text.trim();
    if (!this.enabled || !t || this.hasClip(t, role)) return;
    void this.ensure?.(t, role)?.catch(() => null);
  }

  /** 选了声音来源（有这个角色的声音指纹）：这时用浏览器朗读就是“兜底”，字幕区标出来（额度不够、没生成、云端连不上）。 */
  hasVoice(role: string | null): boolean {
    return !!this.lookup && !!voiceFingerprint(this.lookup, role);
  }

  /** 这段文字有没有现成的音频（看板浮层统计用）。 */
  hasClip(text: string, role: string | null): boolean {
    const fp = this.lookup ? voiceFingerprint(this.lookup, role, text) : null;
    return !!fp && !!this.lookup!.clips[clipKey(fp, text.trim())];
  }

  /** 立刻停掉一切声音（关闭开关、离开页面）。 */
  silence() {
    try {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
  }
}
