/**
 * 朗读（D74 / D85）的服务端：声音来源、合成请求、项目里的音频缓存、发布时带上音频。
 *
 * 声音来源只有官方的（D85）：浏览器朗读（不是 profile）、Joplo Cloud 朗读（cloud，登录即用、不要 Key）、OpenAI 与 ElevenLabs
 * （接口地址固定，自带 Key）。以前的 AiHubMix 预设、可改 Base URL 的 OpenAI 兼容与自定义 HTTP 已去掉；本机已有的这类 profile
 * 列为“不再支持”（unsupported）：不能再生成，但声音指纹与以前一样，已生成的音频照常播放、照常随 build / share 带上。
 *
 * 数据流：
 * - Key：看板「声音 → 管理密钥」→ PUT /__joplo/voice/profiles/:id（只有 openai / elevenlabs）→ ProfileStore 写 `<JOPLO_HOME>/voice/profiles.json`
 *   （0600，含 Key 与改过的默认音色）→ GET 时 publicOf 去掉 Key（只给是否已保存、末 4 位、可用的环境变量名）→ 看板浮层与对话框。
 * - Cloud 音色表：bridge.voice.status()（`GET /api/v1/voice`）→ VoiceHub 记在内存并写 `<JOPLO_HOME>/voice/cloud-voices.json`
 *   （rememberCloudCatalog，不含额度）→ ProfileStore.cloudCatalog()（内存 > 本机文件 > 内置的 6 个英文标签）→ publicOf 的 voices（看板音色列表与样音）
 *   与 autoVoiceFor 的 recommended（按内容语言选音色）。build 时连不上云端也按本机文件选，音色与看板一致。
 * - 选用：config({ voice: { profile } }) 优先；否则看板浮层里选的（PUT /__joplo/p/:id/voice → `<项目>/.joplo/voice/index.json` 的 profileId，chosen: true）；
 *   都没有时（selection() 为 undefined）用调用方给的默认来源：已登录为 cloud，否则浏览器朗读（resolveVoices 的 fallback，source: 'default'）。
 *   resolveVoices 算出旁白与各角色的音色和“声音指纹”（cloud：音色；其他：接口、地址、模型、音色、返回格式；不含 Key）。
 * - 生成：看板按当前语言算出每一步的朗读文字与角色 → POST /__joplo/p/:id/voice/generate → 每段用 clipKey(指纹, 文字) 作键，
 *   已有就跳过，否则合成（cloud 经 bridge.voice.speech，带 locale 与 project）→ 识别音频格式 → 写 `<项目>/.joplo/voice/clips/<sha256>.<ext>`，
 *   index.json 记 { 文件, 步骤, 指纹, 文字, 语言 }；失败记在 failures（看板显示原因，播放时这一步改用浏览器朗读）。
 *   cloud 额度不够（402）时停止，不记失败（GenerateSummary.quota）。进度用 HMR 自定义事件 joplo:voice 推给看板。
 * - 播放：GET /__joplo/p/:id/voice → { voices（指纹）, clips（键 → 音频地址）} → 网页 narrator 按同一个 clipKey 找音频，没有就用浏览器朗读。
 * - 发布：bundleVoice（joplo build / share）把发布 IR 里步骤用到的、当前声音的音频拷进站点 `voice/`，写 IR 的 voiceIndex；Key 永远不进产物。
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_STYLE, automaticCaption, clipKey, localizeProject, speakerRoleAt, spokenChars, spokenLine, voiceFingerprint, type Project, type VoiceConfig, type VoiceIndex } from '@joplo-app/core';
import type { CloudSpeechResult, CloudVoice, CloudVoiceBridge, CloudVoiceCatalog } from './cloud.ts';

export { DEFAULT_STYLE };
export type CloudCatalog = CloudVoiceCatalog;

// ---------- profile ----------

/** 声音来源的类型。http 只出现在本机旧的 profile 里（不再支持）。 */
export type ProfileKind = 'cloud' | 'openai' | 'elevenlabs' | 'http';
/** 返回内容：音频文件本身；JSON 里的 base64；JSON 里的音频链接。后两种只出现在旧的 profile 里，只用于算指纹。 */
export type ResponseMode = 'audio' | 'json-base64' | 'json-url';
export type PresetId = 'cloud' | 'openai' | 'elevenlabs';

export type VoiceProfile = {
  id: string;
  name: string;
  kind: ProfileKind;
  preset?: PresetId;
  /** openai / elevenlabs：固定的官方接口根地址；cloud：空（用 CLI 登录的服务器）；旧 profile：原来的地址（只用于算指纹）。 */
  baseUrl: string;
  model: string;
  /** 默认音色（旁白）；elevenlabs 是 voice_id；cloud 是 Joplo 音色 id。 */
  voice: string;
  response: ResponseMode;
  path?: string;
  headers?: Record<string, string>;
  body?: string;
  /** 说话风格（OpenAI 的 instructions；tts-1 系列不支持，不发）。缺省用 DEFAULT_STYLE。 */
  style?: string;
  key?: string;
  /** 不再支持的旧 profile（D85）：不能再生成；声音指纹不变，已生成的音频照常播放与发布。由 ProfileStore 标出，不写进文件。 */
  unsupported?: true;
  /** 旧 id=cloud 的持久兼容别名；新项目默认 cloud 与明确选择官方 cloud 不使用它。 */
  legacyId?: 'cloud';
};

/**
 * 预设音色：名字、性别、口音（BCP-47，没有表示多语言通用）、是否推荐。看板按旁白语言排序、按界面语言显示说明。
 * cloud 的音色另有 labels（按界面语言的名字）与 samples（按界面语言的样音地址，试听不扣字数）。
 */
export type VoiceChoice = { id: string; name: string; gender: 'female' | 'male' | 'neutral'; accent?: string; recommended?: boolean; labels?: Record<string, string>; samples?: Record<string, string> };

export type PublicProfile = Omit<VoiceProfile, 'key' | 'unsupported'> & {
  key: { saved: boolean; hint: string | null; env: string | null; envSet: boolean };
  /** 这个来源的音色候选。 */
  voices: VoiceChoice[];
  /** 可以删除（本机旧的 profile）；预设只能恢复默认。 */
  removable: boolean;
  /** 不再支持（D85）：看板标出，不能再生成。 */
  unsupported: boolean;
};

/** OpenAI 的内置音色都能读多种语言；marin / cedar 是官方推荐的高质量音色。 */
const OPENAI_VOICES: VoiceChoice[] = [
  { id: 'marin', name: 'Marin', gender: 'female', recommended: true },
  { id: 'cedar', name: 'Cedar', gender: 'male', recommended: true },
  { id: 'coral', name: 'Coral', gender: 'female' },
  { id: 'nova', name: 'Nova', gender: 'female' },
  { id: 'shimmer', name: 'Shimmer', gender: 'female' },
  { id: 'sage', name: 'Sage', gender: 'female' },
  { id: 'alloy', name: 'Alloy', gender: 'neutral' },
  { id: 'ash', name: 'Ash', gender: 'male' },
  { id: 'ballad', name: 'Ballad', gender: 'male' },
  { id: 'echo', name: 'Echo', gender: 'male' },
  { id: 'fable', name: 'Fable', gender: 'male' },
  { id: 'onyx', name: 'Onyx', gender: 'male' },
  { id: 'verse', name: 'Verse', gender: 'male' },
];
/** ElevenLabs 的默认音色（voice_id）；配合 eleven_multilingual_v2 能读中文等多种语言，口音是音色本身的。 */
const ELEVENLABS_VOICES: VoiceChoice[] = [
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', gender: 'male', accent: 'en-GB', recommended: true },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', gender: 'female', accent: 'en-US', recommended: true },
  { id: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Alice', gender: 'female', accent: 'en-GB' },
  { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda', gender: 'female', accent: 'en-US' },
  { id: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica', gender: 'female', accent: 'en-US' },
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily', gender: 'female', accent: 'en-GB' },
  { id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte', gender: 'female', accent: 'sv-SE' },
  { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian', gender: 'male', accent: 'en-US' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel', gender: 'male', accent: 'en-GB' },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam', gender: 'male', accent: 'en-US' },
  { id: 'cjVigY5qzO86Huf0OWal', name: 'Eric', gender: 'male', accent: 'en-US' },
  { id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie', gender: 'male', accent: 'en-AU' },
];

/** Joplo Cloud 的 6 个音色 id（契约固定，都是多语言）；云端连不上时用它们和下面的英文标签。 */
export const CLOUD_VOICE_IDS = ['narrator-warm-f', 'narrator-calm-m', 'bright-f', 'friendly-m', 'clear-f', 'deep-m'] as const;
export const CLOUD_DEFAULT_VOICE = 'narrator-warm-f';
const BUILTIN_CLOUD_LABELS: Record<(typeof CLOUD_VOICE_IDS)[number], string> = {
  'narrator-warm-f': 'Narrator · warm (female)',
  'narrator-calm-m': 'Narrator · calm (male)',
  'bright-f': 'Bright (female)',
  'friendly-m': 'Friendly (male)',
  'clear-f': 'Clear (female)',
  'deep-m': 'Deep (male)',
};
export const BUILTIN_CLOUD_CATALOG: CloudCatalog = {
  model: '',
  defaultVoice: CLOUD_DEFAULT_VOICE,
  voices: CLOUD_VOICE_IDS.map((id) => ({ id, gender: id.endsWith('-m') ? 'male' : 'female', labels: { en: BUILTIN_CLOUD_LABELS[id] }, samples: {} })),
  recommended: {},
};

/** OpenAI / ElevenLabs 的官方地址（D85：固定，不能改）。 */
export const OFFICIAL_BASE_URL = { openai: 'https://api.openai.com/v1', elevenlabs: 'https://api.elevenlabs.io/v1' } as const;

type Preset = Omit<VoiceProfile, 'key' | 'id'> & { id: PresetId; env: string | null; voices: VoiceChoice[] };
/** 预设：Joplo Cloud 朗读排第一（D85）。 */
export const PRESETS: Preset[] = [
  { id: 'cloud', preset: 'cloud', name: 'Joplo Cloud', kind: 'cloud', baseUrl: '', model: '', voice: CLOUD_DEFAULT_VOICE, response: 'audio', env: null, voices: [] },
  { id: 'openai', preset: 'openai', name: 'OpenAI', kind: 'openai', baseUrl: OFFICIAL_BASE_URL.openai, model: 'gpt-4o-mini-tts', voice: 'marin', response: 'audio', style: DEFAULT_STYLE, env: 'OPENAI_API_KEY', voices: OPENAI_VOICES },
  // voice_id 是 ElevenLabs 文档示例里的 George；多语言模型能读中文
  { id: 'elevenlabs', preset: 'elevenlabs', name: 'ElevenLabs', kind: 'elevenlabs', baseUrl: OFFICIAL_BASE_URL.elevenlabs, model: 'eleven_multilingual_v2', voice: 'JBFqnCBsd6RMkjVDRZzb', response: 'audio', env: 'ELEVENLABS_API_KEY', voices: ELEVENLABS_VOICES },
];
const presetOf = (id: string | undefined) => PRESETS.find((p) => p.id === id);
/**
 * 以前内置的 AiHubMix 预设（D85 去掉）：项目里可能还选着它（index.json 或 config 的 voice.profile），甚至从没存进 profiles.json（Key 来自环境变量）。
 * 按原来的字段还原出来，标为不再支持：指纹不变，已生成的音频照常打包。
 */
const LEGACY_AIHUBMIX: VoiceProfile = { id: 'aihubmix', name: 'AiHubMix', kind: 'openai', baseUrl: 'https://aihubmix.com/v1', model: 'gpt-4o-mini-tts', voice: 'marin', response: 'audio', style: DEFAULT_STYLE, unsupported: true };

/** 声音来源的错误码；cloud 的错误码与 CloudVoiceBridge.speech 抛出的一致。 */
export type VoiceErrorCode =
  | 'NO_KEY' | 'HTTP' | 'NOT_AUDIO' | 'BAD_RESPONSE' | 'NETWORK' | 'TOO_LARGE' | 'INVALID' | 'NOT_FOUND' | 'BUSY'
  /** 不再支持的旧 profile（D85）。 */
  | 'UNSUPPORTED'
  /** 看板没有托管朗读的 bridge（旧 CLI 启动），或 cloud 的其他意外。 */
  | 'CLOUD_UNAVAILABLE'
  | 'TTS_QUOTA_EXCEEDED' | 'AUTH_REQUIRED' | 'AUTH_EXPIRED' | 'EMAIL_UNVERIFIED' | 'FORBIDDEN' | 'RATE_LIMITED' | 'TTS_UNAVAILABLE' | 'BAD_REQUEST';

export class VoiceError extends Error {
  constructor(
    readonly code: VoiceErrorCode,
    message: string,
    readonly hint?: { response: ResponseMode; path: string },
    /** cloud 错误的附加数据（例如 402 的 neededChars / remainingChars / usageUrl）。 */
    readonly data?: Record<string, unknown>,
  ) {
    super(message);
  }
}

/** 换用提示（D85）：旧 profile 不能再生成时告诉作者换成哪一个。 */
export const UNSUPPORTED_MESSAGE = (name: string) =>
  `"${name}" is no longer supported as a voice source. Audio it already generated still plays and is still included in build and share, but it cannot generate new audio. Switch to Joplo Cloud narration (npx joplo login), OpenAI or ElevenLabs in the board (Voice), or change voice.profile in joplo.config.ts.`;

const ID_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : null);

/**
 * 校验看板提交的改动（只有预设能改）：openai / elevenlabs 可以改默认音色、模型（openai 还有说话风格）；cloud 只能改默认音色。
 * 接口地址、返回格式、请求头与请求体都不能改（D85）。返回合并后的字段。
 */
export function normalizeProfile(input: unknown, base: VoiceProfile): Omit<VoiceProfile, 'id' | 'key' | 'preset'> {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const voice = o.voice === undefined ? base.voice : str(o.voice, 200);
  if (!voice) throw new VoiceError('INVALID', 'Default voice is required');
  if (base.kind === 'cloud' && !/^[a-z0-9][a-z0-9-]{0,63}$/.test(voice)) throw new VoiceError('INVALID', 'Unknown Joplo Cloud voice');
  const model = base.kind === 'cloud' || o.model === undefined ? base.model : (str(o.model, 200) ?? base.model);
  let style = base.style;
  if (base.kind === 'openai' && o.style !== undefined && o.style !== null) {
    if (typeof o.style !== 'string' || o.style.length > 1000) throw new VoiceError('INVALID', 'Speaking style is up to 1000 characters');
    style = o.style.trim() || undefined;
  }
  const preset = presetOf(base.preset)!;
  return { name: preset.name, kind: preset.kind, baseUrl: preset.baseUrl, model, voice, response: 'audio', ...(style ? { style } : {}) };
}

type StoreFile = { version: 1; profiles: VoiceProfile[] };

/** 本机对 OpenAI / ElevenLabs 预设的覆盖改了地址、请求头或返回格式（旧版允许）：不再是官方预设。 */
function isCustomOverride(p: Preset, s: VoiceProfile): boolean {
  if (p.kind !== 'openai' && p.kind !== 'elevenlabs') return false;
  const url = typeof s.baseUrl === 'string' && s.baseUrl.trim() ? s.baseUrl.trim().replace(/\/+$/, '') : p.baseUrl;
  return url !== p.baseUrl || (!!s.headers && Object.keys(s.headers).length > 0) || (!!s.response && s.response !== 'audio') || !!s.path || !!s.body;
}

/**
 * `<JOPLO_HOME>/voice/profiles.json`：改过的预设（Key、默认音色）与本机旧的 profile，权限 0600。
 * `<JOPLO_HOME>/voice/cloud-voices.json`：最近一次从云端拿到的 Joplo 音色表（不含额度、没有秘密）。
 */
export class ProfileStore {
  readonly file: string;
  readonly catalogFile: string;
  constructor(
    home: string,
    private readonly env: Record<string, string | undefined> = process.env,
    private readonly opts: { catalog?: () => CloudCatalog | null } = {},
  ) {
    this.file = path.join(home, 'voice', 'profiles.json');
    this.catalogFile = path.join(home, 'voice', 'cloud-voices.json');
  }

  private read(): VoiceProfile[] {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8')) as StoreFile;
      const list = Array.isArray(raw?.profiles) ? raw.profiles.filter((p) => p && typeof p.id === 'string' && ID_RE.test(p.id) && typeof p.name === 'string') : [];
      // 旧版自建的 profile 恰好叫 cloud（D85 之前没有 Joplo Cloud 预设）：改名保留为旧 profile，不当作 Joplo Cloud 的覆盖。
      // 下一次写文件时新名字就存下来了。
      return list.map((p) => {
        if (p.id !== 'cloud' || p.kind === 'cloud') return p;
        let id = 'cloud-old';
        for (let i = 2; list.some((x) => x.id === id); i++) id = `cloud-old-${i}`;
        return { ...p, id, legacyId: 'cloud' as const };
      });
    } catch {
      return [];
    }
  }

  private write(list: VoiceProfile[]) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
    const tmp = `${this.file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ version: 1, profiles: list.map(({ unsupported: _u, ...p }) => p) } satisfies StoreFile, null, 2), { mode: 0o600 });
    fs.chmodSync(tmp, 0o600);
    fs.renameSync(tmp, this.file);
  }

  /**
   * 预设（合并本机改过的默认音色、模型、风格与 Key；地址固定）在前；本机旧的 profile（不再支持）在后。
   * 旧版把 OpenAI / ElevenLabs 预设改成别的地址（代理）、请求头或返回格式的，不再当作官方预设：作为不再支持的旧 profile
   * 按原来的字段算指纹（旧音频照常播放与打包），Key 不给出去（原本是给代理的，绝不能发到官方地址）；删掉它才恢复官方预设。
   */
  list(): VoiceProfile[] {
    const stored = this.read();
    const customized = new Set<string>(PRESETS.filter((p) => { const s = stored.find((x) => x.id === p.id); return !!s && isCustomOverride(p, s); }).map((p) => p.id));
    const presets = PRESETS.filter((p) => !customized.has(p.id)).map(({ env: _e, voices: _v, ...p }): VoiceProfile => {
      const s = stored.find((x) => x.id === p.id);
      const out: VoiceProfile = { ...p };
      if (typeof s?.voice === 'string' && s.voice.trim()) out.voice = s.voice;
      else if (p.kind === 'cloud') out.voice = this.cloudCatalog().defaultVoice || p.voice;
      if (p.kind !== 'cloud' && typeof s?.model === 'string' && s.model.trim()) out.model = s.model;
      if (p.kind === 'openai' && s && 'style' in s) {
        if (s.style) out.style = s.style;
        else delete out.style;
      }
      if (s?.key && p.kind !== 'cloud') out.key = s.key;
      return out;
    });
    const legacy = stored
      .filter((s) => !presetOf(s.id) || customized.has(s.id))
      .map((s): VoiceProfile => {
        if (s.id === LEGACY_AIHUBMIX.id) return { ...LEGACY_AIHUBMIX, ...s, id: s.id, unsupported: true };
        // 改过地址的预设：以前的合并方式是“预设 + 本机覆盖”，指纹也按它算
        const base = presetOf(s.id);
        if (base) { const { env: _e, voices: _v, ...b } = base; return { ...b, ...s, id: s.id, kind: base.kind, unsupported: true }; }
        return { ...s, unsupported: true };
      });
    return [...presets, ...legacy];
  }

  /** 按 id 找；项目选着的 aihubmix 即使从没存过也找得到（不再支持）。 */
  get(id: string): VoiceProfile | null {
    return this.list().find((p) => p.id === id) ?? (id === LEGACY_AIHUBMIX.id ? { ...LEGACY_AIHUBMIX } : null);
  }

  /** 按 id 或名字（不区分大小写）找，config({ voice: { profile } }) 用。 */
  find(ref: string): VoiceProfile | null {
    const r = ref.trim().toLowerCase();
    const all = [...this.list(), ...(this.list().some((p) => p.id === LEGACY_AIHUBMIX.id) ? [] : [LEGACY_AIHUBMIX])];
    const hit = all.find((p) => p.id === r || p.name.toLowerCase() === r);
    return hit ? { ...hit } : null;
  }

  /** 项目升级前保存的 cloud 引用继续指向旧来源；官方名称始终可显式选用。 */
  projectProfile(ref: string, officialCloud = false): VoiceProfile | null {
    if (ref.trim().toLowerCase() === 'cloud' && !officialCloud) {
      const legacy = this.list().find((p) => p.legacyId === 'cloud');
      if (legacy) return legacy;
    }
    return this.find(ref);
  }

  /** Key：保存的优先，其次是预设对应的环境变量。cloud 不用 Key（用 CLI 的登录）；旧 profile 不再生成，也不给 Key。 */
  keyOf(p: VoiceProfile): string | null {
    if (p.unsupported || p.kind === 'cloud') return null;
    if (p.key) return p.key;
    const env = presetOf(p.preset)?.env;
    const v = env ? this.env[env] : undefined;
    return v && v.trim() ? v.trim() : null;
  }

  /**
   * 改预设：默认音色、模型、风格（见 normalizeProfile）与 Key。key：undefined = 不改；null 或 '' = 删掉保存的 Key；字符串 = 保存。
   * 不能新建（D85：不再提供 OpenAI 兼容与自定义 HTTP），也不能改旧的 profile。
   */
  upsert(id: string | null, input: unknown, key: string | null | undefined): VoiceProfile {
    if (!id || !presetOf(id)) {
      if (id && !this.get(id)) throw new VoiceError('NOT_FOUND', `Unknown voice profile: ${id}`);
      throw new VoiceError('INVALID', 'Custom voice providers are no longer supported. Use Joplo Cloud narration, OpenAI or ElevenLabs');
    }
    const current = this.get(id)!;
    if (current.unsupported) throw new VoiceError('INVALID', `${current.name} uses an address, headers or response format that is no longer supported. Delete it first to use the official ${current.name}`);
    const fields = normalizeProfile(input, current);
    if (key !== undefined && key !== null && (typeof key !== 'string' || key.length > 500 || /[\r\n]/.test(key))) throw new VoiceError('INVALID', 'Invalid API key');
    const list = this.read();
    const keep = list.find((p) => p.id === id)?.key;
    const nextKey = id === 'cloud' ? undefined : key === undefined ? keep : key && key.trim() ? key.trim() : undefined;
    const next: VoiceProfile = { id, ...fields, preset: id as PresetId, ...(nextKey ? { key: nextKey } : {}) };
    this.write([...list.filter((p) => p.id !== id), next]);
    return this.get(id)!;
  }

  /** 预设恢复默认（去掉本机覆盖，包括保存的 Key）；本机旧的 profile 删除。 */
  remove(id: string) {
    const list = this.read();
    if (!presetOf(id) && !list.some((p) => p.id === id)) throw new VoiceError('NOT_FOUND', `Unknown voice profile: ${id}`);
    this.write(list.filter((p) => p.id !== id));
  }

  /** Joplo 音色表：云端给的（内存）> 本机记下的上一次 > 内置的 6 个（英文标签，没有推荐与样音）。 */
  cloudCatalog(): CloudCatalog {
    const live = this.opts.catalog?.();
    if (live) return live;
    try {
      const raw = JSON.parse(fs.readFileSync(this.catalogFile, 'utf8')) as CloudCatalog;
      if (raw && Array.isArray(raw.voices) && raw.voices.length && raw.recommended && typeof raw.recommended === 'object') return raw;
    } catch {
      /* 没有或损坏：用内置的 */
    }
    return BUILTIN_CLOUD_CATALOG;
  }

  /** 记下云端给的音色表（内容变了才写），build 与离线时按它选音色，与看板一致。 */
  rememberCloudCatalog(c: CloudCatalog) {
    const next = JSON.stringify({ model: c.model, defaultVoice: c.defaultVoice, voices: c.voices, recommended: c.recommended }, null, 2);
    try {
      if (fs.existsSync(this.catalogFile) && fs.readFileSync(this.catalogFile, 'utf8') === next) return;
      fs.mkdirSync(path.dirname(this.catalogFile), { recursive: true, mode: 0o700 });
      const tmp = `${this.catalogFile}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
      fs.writeFileSync(tmp, next);
      fs.renameSync(tmp, this.catalogFile);
    } catch {
      /* 只影响离线时的音色选择 */
    }
  }

  /** cloud 的音色候选（看板列表与试听）。 */
  cloudVoices(): VoiceChoice[] {
    const c = this.cloudCatalog();
    return c.voices.map((v) => ({ id: v.id, name: v.labels.en ?? Object.values(v.labels)[0] ?? v.id, gender: v.gender, labels: v.labels, samples: v.samples, ...(v.id === c.defaultVoice ? { recommended: true } : {}) }));
  }

  publicOf(p: VoiceProfile): PublicProfile {
    const { key: _k, unsupported, ...rest } = p;
    const preset = unsupported ? undefined : presetOf(p.preset);
    const env = preset?.env ?? null;
    const voices = p.kind === 'cloud' ? this.cloudVoices() : (preset?.voices ?? (p.kind === 'openai' ? OPENAI_VOICES : p.kind === 'elevenlabs' ? ELEVENLABS_VOICES : []));
    return { ...rest, key: { saved: !!p.key, hint: p.key ? `…${p.key.slice(-4)}` : null, env, envSet: !!(env && this.env[env]?.trim()) }, voices, removable: !preset, unsupported: !!unsupported };
  }
}

// ---------- 合成 ----------

const MAX_AUDIO = 20 * 1024 * 1024;
const TIMEOUT_MS = 60_000;

/** 发给模型的说话风格：只有 OpenAI、且不是 tts-1 系列（不支持 instructions）时才发。 */
export const styleOf = (p: VoiceProfile): string | null => (p.kind === 'openai' && p.style?.trim() && !/^tts-1/i.test(p.model) ? p.style.trim() : null);

/** 这次合成的 HTTP 请求（不发出）：只有官方的 OpenAI 与 ElevenLabs（地址固定）。 */
export function buildRequest(p: VoiceProfile, key: string | null, text: string, voice: string): { url: string; init: RequestInit } {
  if (p.unsupported || (p.kind !== 'openai' && p.kind !== 'elevenlabs')) throw new VoiceError('UNSUPPORTED', UNSUPPORTED_MESSAGE(p.name));
  if (!key) throw new VoiceError('NO_KEY', 'No API key for this provider');
  if (p.kind === 'elevenlabs') {
    const url = `${OFFICIAL_BASE_URL.elevenlabs}/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`;
    return { url, init: { method: 'POST', headers: { 'content-type': 'application/json', accept: 'audio/mpeg', 'xi-api-key': key }, body: JSON.stringify({ text, ...(p.model ? { model_id: p.model } : {}) }) } };
  }
  return {
    url: `${OFFICIAL_BASE_URL.openai}/audio/speech`,
    init: { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body: JSON.stringify({ model: p.model, input: text, voice, response_format: 'mp3', ...(styleOf(p) ? { instructions: styleOf(p) } : {}) }) },
  };
}

export type AudioType = { ext: 'mp3' | 'wav' | 'ogg' | 'flac' | 'm4a' | 'aac'; contentType: string };
export const AUDIO_TYPES: Record<AudioType['ext'], string> = { mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac', m4a: 'audio/mp4', aac: 'audio/aac' };

/** 按文件头识别音频格式；不是音频返回 null。 */
export function sniffAudio(b: Uint8Array): AudioType | null {
  const at = (i: number, s: string) => [...s].every((c, j) => b[i + j] === c.charCodeAt(0));
  const t = (ext: AudioType['ext']): AudioType => ({ ext, contentType: AUDIO_TYPES[ext] });
  if (b.length < 12) return null;
  if (at(0, 'ID3')) return t('mp3');
  if (at(0, 'RIFF') && at(8, 'WAVE')) return t('wav');
  if (at(0, 'OggS')) return t('ogg');
  if (at(0, 'fLaC')) return t('flac');
  if (at(4, 'ftyp')) return t('m4a');
  if (b[0] === 0xff && (b[1]! & 0xf6) === 0xf0) return t('aac'); // ADTS
  if (b[0] === 0xff && (b[1]! & 0xe0) === 0xe0) return t('mp3'); // MPEG 帧同步
  return null;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);
/** 错误信息里去掉 Key，截断。 */
const scrub = (s: string, key: string | null) => clip(key ? s.split(key).join('••••') : s, 300).replace(/\s+/g, ' ').trim();

async function readLimited(res: Response): Promise<Buffer> {
  const len = Number(res.headers.get('content-length') ?? 0);
  if (len > MAX_AUDIO) throw new VoiceError('TOO_LARGE', `The response is larger than ${MAX_AUDIO / 1024 / 1024} MB`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_AUDIO) throw new VoiceError('TOO_LARGE', `The response is larger than ${MAX_AUDIO / 1024 / 1024} MB`);
  return buf;
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** 用自带 Key 的官方接口合成一段：返回音频字节与格式。失败抛 VoiceError（信息里不含 Key）。 */
export async function synthesize(p: VoiceProfile, key: string | null, text: string, voice: string, opts: { fetch?: FetchLike; signal?: AbortSignal } = {}): Promise<{ bytes: Buffer } & AudioType> {
  const f = opts.fetch ?? ((u, i) => fetch(u, i));
  const { url, init } = buildRequest(p, key, text, voice);
  const signal = opts.signal ? AbortSignal.any([opts.signal, AbortSignal.timeout(TIMEOUT_MS)]) : AbortSignal.timeout(TIMEOUT_MS);
  let res: Response;
  try {
    res = await f(url, { ...init, signal, redirect: 'follow' });
  } catch (e) {
    const timeout = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
    throw new VoiceError('NETWORK', timeout ? `No response from ${new URL(url).host} within ${TIMEOUT_MS / 1000} s` : `Could not reach ${new URL(url).host}: ${scrub(e instanceof Error ? e.message : String(e), key)}`);
  }
  const bytes = await readLimited(res);
  const ct = res.headers.get('content-type') ?? '';
  if (!res.ok) {
    const body = scrub(bytes.toString('utf8'), key);
    throw new VoiceError('HTTP', `HTTP ${res.status}${body ? `: ${body}` : ''}`);
  }
  const t = sniffAudio(bytes);
  if (t) return { bytes, ...t };
  throw new VoiceError('NOT_AUDIO', `The response is not audio (${ct || 'no content type'}): ${scrub(bytes.subarray(0, 200).toString('utf8'), key)}`);
}

const CLOUD_CODES = new Set<VoiceErrorCode>(['TTS_QUOTA_EXCEEDED', 'AUTH_REQUIRED', 'AUTH_EXPIRED', 'EMAIL_UNVERIFIED', 'FORBIDDEN', 'RATE_LIMITED', 'TTS_UNAVAILABLE', 'BAD_REQUEST', 'NETWORK', 'NOT_FOUND']);

/** 托管朗读合成一段（D85）：经 CLI 注入的 bridge，用 CLI 的登录，不要 Key。bridge 抛出的 { code, message, data } 转成 VoiceError。 */
export async function synthesizeCloud(bridge: CloudVoiceBridge | undefined, req: { text: string; voice: string; locale?: string | null; project?: string | null }): Promise<{ bytes: Buffer; result: CloudSpeechResult } & AudioType> {
  if (!bridge) throw new VoiceError('CLOUD_UNAVAILABLE', 'This board cannot use Joplo Cloud narration. Stop it and run npx joplo dev again');
  let result: CloudSpeechResult;
  try {
    result = await bridge.speech({ text: req.text, voice: req.voice, ...(req.locale ? { locale: req.locale } : {}), ...(req.project ? { project: req.project.slice(0, 200) } : {}) });
  } catch (e) {
    const err = (e ?? {}) as { code?: unknown; message?: unknown; data?: unknown };
    const code = typeof err.code === 'string' && CLOUD_CODES.has(err.code as VoiceErrorCode) ? (err.code as VoiceErrorCode) : 'CLOUD_UNAVAILABLE';
    const data = err.data && typeof err.data === 'object' ? (err.data as Record<string, unknown>) : undefined;
    throw new VoiceError(code, typeof err.message === 'string' && err.message ? err.message : 'Joplo Cloud narration failed', undefined, data);
  }
  const bytes = Buffer.from(result.audio);
  if (bytes.length > MAX_AUDIO) throw new VoiceError('TOO_LARGE', `The audio is larger than ${MAX_AUDIO / 1024 / 1024} MB`);
  const t = sniffAudio(bytes);
  if (!t) throw new VoiceError('NOT_AUDIO', 'Joplo Cloud did not return audio');
  return { bytes, result, ...t };
}

// ---------- 声音指纹与选用 ----------

/**
 * 声音指纹：cloud 只看音色（换上游模型不让旧音频失效，D85）；其他是接口、地址、模型、音色、返回格式、请求体模板、说话风格（不含 Key 与请求头）。
 * 旧 profile 的算法与以前完全一样，已生成的音频的键不变。
 */
export function fingerprint(p: VoiceProfile, voice: string): string {
  const parts = p.kind === 'cloud' ? ['cloud', voice] : [p.kind, p.baseUrl, p.model, voice, p.response, p.path ?? '', p.body ?? '', styleOf(p) ?? ''];
  return crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 16);
}

export type ResolvedVoices = {
  profile: VoiceProfile | null;
  /** 选用来源：config = joplo.config.ts 的 voice.profile；board = 看板浮层里选的；default = 没选过时的默认（已登录为 cloud）；null = 只用浏览器朗读。 */
  source: 'config' | 'board' | 'default' | null;
  /** config 里写了、但本机没有的 profile 名。 */
  missing: string | null;
  narrator: string | null;
  roles: Record<string, string>;
  /** 旁白与各角色的声音指纹（没有 profile 时都是 null / 空）。 */
  voices: { narrator: string | null; roles: Record<string, string> };
  /**
   * cloud 在非默认语言下自动选的音色（D84 / D85）：基础音色 → 选中的音色。第一次在这种语言下生成成功时记进项目 index.json 的 pins
   * （VoiceCache.pin），之后推荐列表变了、换了电脑也按记下的选，指纹不变。
   */
  autoPicks?: { locale: string; map: Record<string, string> };
};
/** 项目里记下的 cloud 自动音色：内容语言 → （基础音色 → 选中的音色）。 */
export type VoicePins = Record<string, Record<string, string>>;

/** 磁盘元数据不可信：只保留合法语言、基础音色和固定契约中的目标音色。 */
function cleanVoicePins(value: unknown): VoicePins {
  const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  const validVoice = (v: unknown): v is string => typeof v === 'string' && (CLOUD_VOICE_IDS as readonly string[]).includes(v);
  if (!object(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([locale, map]) => {
    if (!/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/.test(locale) || !object(map)) return [];
    const entries = Object.entries(map).filter((entry): entry is [string, string] => validVoice(entry[0]) && validVoice(entry[1]));
    return entries.length ? [[locale, Object.fromEntries(entries)]] : [];
  }));
}

/**
 * 某种内容语言用哪个音色（D84）：
 * - ElevenLabs 预设：音色有口音且口音不是这种语言、而预设里有这种语言的音色时，换成同语言的（优先同性别、推荐的）；
 * - Joplo Cloud：云端给了这种语言的推荐音色（recommended[语言]）时，音色在推荐里就不换，否则换成推荐里同性别的第一个，没有同性别的用第一个；
 * - 多语言音色（OpenAI 预设没有口音）原样用，由说话风格要求母语口音。
 */
export function autoVoiceFor(profile: Pick<VoiceProfile, 'preset'>, voice: string, locale: string | null | undefined, catalog?: CloudCatalog): string {
  if (!locale) return voice;
  if (profile.preset === 'cloud') {
    const c = catalog ?? BUILTIN_CLOUD_CATALOG;
    const rec = c.recommended[locale] ?? c.recommended[locale.split('-')[0]!] ?? [];
    if (!rec.length || rec.includes(voice)) return voice;
    const gender = c.voices.find((v) => v.id === voice)?.gender;
    return rec.find((id) => gender && c.voices.find((v) => v.id === id)?.gender === gender) ?? rec[0]!;
  }
  const choices = presetOf(profile.preset)?.voices;
  const cur = choices?.find((v) => v.id === voice);
  if (!choices || !cur?.accent) return voice;
  const lang = (tag: string) => tag.toLowerCase().split('-')[0];
  if (lang(cur.accent) === lang(locale)) return voice;
  const same = choices.filter((v) => v.accent && lang(v.accent) === lang(locale));
  const exact = same.filter((v) => v.accent!.toLowerCase() === locale.toLowerCase());
  const pool = exact.length ? exact : same;
  const pick = pool.find((v) => v.gender === cur.gender && v.recommended) ?? pool.find((v) => v.gender === cur.gender) ?? pool.find((v) => v.recommended) ?? pool[0];
  return pick?.id ?? voice;
}

/** 传给 resolveVoices 的语言：默认语言（源文件的语言）不自动换音色，保留作者原来的选择和已生成的音频。 */
export const voiceLocaleOf = (project: Pick<Project, 'i18n'> | null | undefined, locale: string | null | undefined): string | null => (locale && project?.i18n && locale !== project.i18n.default ? locale : null);

/**
 * locale：内容语言（D84，默认语言传 null，见 voiceLocaleOf）。config.voice.locales[locale] 优先，其次按 autoVoiceFor 自动选；不传时与之前一样。
 * selected：看板里选的（VoiceCache.selection()）：字符串 = 某个来源；null = 选了浏览器朗读；undefined = 没选过，这时用 fallback
 * （调用方给：已登录为 'cloud'，否则 null）。
 */
export function resolveVoices(config: VoiceConfig | undefined, selected: string | null | undefined, store: ProfileStore, locale?: string | null, fallback?: string | null, pins?: VoicePins, officialCloud = false): ResolvedVoices {
  let profile: VoiceProfile | null = null;
  let source: ResolvedVoices['source'] = null;
  let missing: string | null = null;
  if (config?.profile) {
    profile = store.projectProfile(config.profile);
    if (profile) source = 'config';
    else missing = config.profile;
  } else if (selected) {
    profile = store.projectProfile(selected, officialCloud);
    if (profile) source = 'board';
  } else if (selected === undefined && fallback) {
    profile = store.get(fallback);
    if (profile) source = 'default';
  }
  if (!profile) return { profile: null, source, missing, narrator: null, roles: {}, voices: { narrator: null, roles: {} } };
  const p = profile;
  const catalog = p.kind === 'cloud' ? store.cloudCatalog() : undefined;
  const own = locale ? config?.locales?.[locale] : undefined;
  // cloud：这种语言下已经记下的选择优先（不随推荐列表变），没记过才按推荐挑
  const picks: Record<string, string> = {};
  const safePins = cleanVoicePins(pins);
  const auto = (v: string) => {
    if (p.kind !== 'cloud' || !locale) return autoVoiceFor(p, v, locale, catalog);
    const chosen = safePins[locale]?.[v] ?? autoVoiceFor(p, v, locale, catalog);
    picks[v] = chosen;
    return chosen;
  };
  const narrator = own?.narrator ?? auto(config?.narrator ?? p.voice);
  const roles = { ...Object.fromEntries(Object.entries(config?.roles ?? {}).filter(([r]) => !own?.roles?.[r]).map(([r, v]) => [r, auto(v)])), ...(own?.roles ?? {}) };
  return {
    profile,
    source,
    missing,
    narrator,
    roles,
    voices: { narrator: fingerprint(p, narrator), roles: Object.fromEntries(Object.entries(roles).map(([r, v]) => [r, fingerprint(p, v)])) },
    ...(Object.keys(picks).length && locale ? { autoPicks: { locale, map: picks } } : {}),
  };
}

// ---------- 项目缓存 ----------

export type ClipRecord = { file: string; stepId: string; fp: string; text: string; locale: string; bytes: number; at: string; origin?: 'shared' };
export type GeneratedClip = { key: string; file: string; generated: boolean };
/** 正在生成的片段：片段键 → 结果（每个项目一张，见 VoiceCache.generateOne）。 */
export type Inflight = Map<string, Promise<GeneratedClip>>;

/**
 * profileId：看板里选的来源（null = 浏览器朗读）；chosen：作者在看板里选过（D85：没选过时用默认来源，已登录为 cloud）。
 * 旧版写下的文件没有 chosen：profileId 是字符串时算选过，null 时算没选过（旧版没选过时也写 null）。
 */
type IndexFile = { version: 1; profileId: string | null; chosen?: boolean; cloudSource?: 'official'; pins?: VoicePins; clips: Record<string, ClipRecord>; failures: Record<string, { stepId: string; message: string; at: string }> };
const FILE_RE = /^[0-9a-f]{64}\.(mp3|wav|ogg|flac|m4a|aac)$/;

export type Segment = { stepId: string; text: string; role: string | null; audio?: string };
export type GenerateSummary = {
  total: number;
  generated: number;
  skipped: number;
  failed: { stepId: string; message: string }[];
  noProfile?: boolean;
  /** 选用的来源不再支持（D85）：没有生成，已有的音频照常用。 */
  unsupported?: boolean;
  /** cloud 额度不够（402）：需要多少 / 还剩多少（云端给的）。生成在这里停下。 */
  quota?: { neededChars: number | null; remainingChars: number | null };
  /** 因为账号层面的错误（额度、登录、邮箱未验证…）停下时，没有尝试的段数。 */
  stopped?: number;
  /** 停下的原因（额度不够之外的账号错误，例如 AUTH_REQUIRED）。 */
  error?: { code: string; message: string };
};

/** cloud 合成的回执（每段一次）：扣了几个字、还剩多少（响应头）、是否命中云端缓存。 */
export type CloudReceipt = { charged: number | null; remaining: number | null; cache: 'hit' | 'miss' | null };
export type GenerateOptions = {
  fetch?: FetchLike;
  signal?: AbortSignal;
  inflight?: Inflight;
  /** 托管朗读（D85）的 bridge；没有时 cloud 报 CLOUD_UNAVAILABLE。 */
  cloud?: CloudVoiceBridge;
  /** 项目名（cloud 请求的 project，控制台明细用）。 */
  project?: string | null;
  /** 内容语言（cloud 请求的 locale，D84）；不知道时不带。 */
  speechLocale?: string | null;
  /** 每段 cloud 合成成功后（剩余字数来自响应头）。 */
  onCloud?: (r: CloudReceipt) => void;
};
/** 账号层面的错误：继续请求别的段也一样失败，生成在这里停下，也不记成某一步的失败。 */
const STOP_CODES = new Set<string>(['TTS_QUOTA_EXCEEDED', 'AUTH_REQUIRED', 'AUTH_EXPIRED', 'EMAIL_UNVERIFIED', 'FORBIDDEN', 'CLOUD_UNAVAILABLE', 'UNSUPPORTED', 'NOT_FOUND']);
const nonNeg = (v: unknown) => (Number.isSafeInteger(v) && (v as number) >= 0 ? (v as number) : null);

/**
 * 这次要生成的段数与字数（D85）：只算缺音频的段，同一段（同一个片段键）只算一次，字数按 spokenChars（Array.from）。
 * 看板按钮“约 X 字”与 `joplo voice --dry-run` 用它；没有选用来源时都是 0。
 */
export function estimateVoice(segments: Segment[], resolved: ResolvedVoices, cache: VoiceCache): { steps: number; chars: number } {
  const seen = new Set<string>();
  let chars = 0;
  for (const s of segments) {
    const j = cache.plan(s, resolved);
    if (!j || seen.has(j.key) || cache.clipOf(j.key)) continue;
    seen.add(j.key);
    chars += spokenChars(j.text);
  }
  return { steps: seen.size, chars };
}

/** `<项目>/.joplo/voice/`：index.json（选用的 profile、片段、失败）与 clips/。 */
export class VoiceCache {
  readonly root: string;
  constructor(readonly projectDir: string) {
    this.root = path.join(projectDir, '.joplo', 'voice');
  }
  get clipsDir() {
    return path.join(this.root, 'clips');
  }

  read(): IndexFile {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(this.root, 'index.json'), 'utf8')) as IndexFile;
      const profileId = typeof raw.profileId === 'string' ? raw.profileId : null;
      const pins = cleanVoicePins(raw.pins);
      return { version: 1, profileId, chosen: raw.chosen === true || profileId !== null, ...(raw.cloudSource === 'official' ? { cloudSource: 'official' as const } : {}), ...(Object.keys(pins).length ? { pins } : {}), clips: raw.clips && typeof raw.clips === 'object' ? raw.clips : {}, failures: raw.failures && typeof raw.failures === 'object' ? raw.failures : {} };
    } catch {
      return { version: 1, profileId: null, chosen: false, clips: {}, failures: {} };
    }
  }

  /** 看板里选的来源：字符串 = 某个来源；null = 选了浏览器朗读；undefined = 没选过（用默认来源，见 resolveVoices 的 fallback）。 */
  selection(): string | null | undefined {
    const idx = this.read();
    return idx.chosen ? idx.profileId : undefined;
  }

  write(idx: IndexFile) {
    fs.mkdirSync(this.root, { recursive: true });
    const file = path.join(this.root, 'index.json');
    const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(idx, null, 2));
    fs.renameSync(tmp, file);
  }

  select(profileId: string | null) {
    this.write({ ...this.read(), profileId, chosen: true, cloudSource: profileId === 'cloud' ? 'official' : undefined });
  }

  /** 新版看板明确选过官方 cloud；旧选择没有此标记。 */
  officialCloud(): boolean { return this.read().cloudSource === 'official'; }

  /** 记下的 cloud 自动音色（见 ResolvedVoices.autoPicks）；build、share、播放、joplo voice 都传给 resolveVoices。 */
  pins(): VoicePins {
    return this.read().pins ?? {};
  }

  /** 记下这种语言自动选的音色：已经记过的不改（只有从没生成过的组合才按推荐挑）。 */
  pin(locale: string, map: Record<string, string>) {
    const idx = this.read();
    const cur = idx.pins?.[locale] ?? {};
    const add = Object.entries(cleanVoicePins({ [locale]: map })[locale] ?? {}).filter(([k]) => !Object.hasOwn(cur, k));
    if (!add.length) return;
    this.write({ ...idx, pins: { ...(idx.pins ?? {}), [locale]: { ...cur, ...Object.fromEntries(add) } } });
  }

  /** 片段文件的绝对路径（文件名不合法或不存在时为 null）。 */
  fileOf(name: string): string | null {
    if (!FILE_RE.test(name)) return null;
    const f = path.join(this.clipsDir, name);
    return fs.existsSync(f) ? f : null;
  }

  /** 当前声音下已有的片段：键 → 文件名；以及失败的键 → 原因。 */
  current(voices: ResolvedVoices['voices'], extra: string[] = []): { clips: Record<string, string>; failures: Record<string, { stepId: string; message: string }> } {
    const fps = new Set([voices.narrator, ...Object.values(voices.roles), ...extra].filter(Boolean) as string[]);
    const idx = this.read();
    const clips: Record<string, string> = {};
    for (const [k, c] of Object.entries(idx.clips)) if (fps.has(c.fp) && FILE_RE.test(c.file) && fs.existsSync(path.join(this.clipsDir, c.file))) clips[k] = c.file;
    const failures = Object.fromEntries(Object.entries(idx.failures).filter(([k]) => !clips[k]).map(([k, v]) => [k, { stepId: v.stepId, message: v.message }]));
    return { clips, failures };
  }

  /**
   * 生成缺的片段（已有的跳过），并发 2。每段完成后调 onProgress。失败记进 failures，成功时清掉这个键的失败。
   */
  /** 记一段成功：重新读索引再写（看板的批量生成与边放边生成可能同时进行，不能互相覆盖）。 */
  private record(k: string, rec: ClipRecord) {
    const idx = this.read();
    idx.clips[k] = rec;
    delete idx.failures[k];
    this.write(idx);
  }
  /** 记一段失败；这一段已经有音频（别的请求先成功了）时不记。 */
  private recordFailure(k: string, stepId: string, message: string) {
    if (this.clipOf(k)) return;
    const idx = this.read();
    idx.failures[k] = { stepId, message, at: new Date().toISOString() };
    this.write(idx);
  }

  /** 这一段的键与要用的音色；文字为空或没有供应商时为 null。 */
  plan(seg: Segment, resolved: ResolvedVoices): { key: string; text: string; voice: string; fp: string } | null {
    if (seg.audio) return null;
    const p = resolved.profile;
    const text = seg.text.replace(/\s+/g, ' ').trim();
    if (!p || !text) return null;
    const voice = (seg.role ? resolved.roles[seg.role] : undefined) ?? resolved.narrator ?? p.voice;
    const fp = voiceFingerprint(resolved.voices, seg.role)!;
    return { key: clipKey(fp, text), text, voice, fp };
  }

  /** 已有的片段文件名（文件还在时）。 */
  clipOf(key: string): string | null {
    const c = this.read().clips[key];
    return c && FILE_RE.test(c.file) && fs.existsSync(path.join(this.clipsDir, c.file)) ? c.file : null;
  }

  /** 分享下载的片段不能被误认成本机新生成，进而覆盖另一语言的旧声音。旧缓存缺省为本机生成。 */
  localClipOf(key: string): string | null {
    return this.read().clips[key]?.origin === 'shared' ? null : this.clipOf(key);
  }

  /** 收下一段别处来的音频（D84：从已发布的分享沿用）：文件名必须是内容的 sha256，否则不收。 */
  adopt(key: string, file: string, bytes: Uint8Array, rec: Omit<ClipRecord, 'file' | 'bytes' | 'at'>): boolean {
    if (!FILE_RE.test(file) || crypto.createHash('sha256').update(bytes).digest('hex') !== file.split('.')[0]) return false;
    fs.mkdirSync(this.clipsDir, { recursive: true });
    const dest = path.join(this.clipsDir, file);
    if (!fs.existsSync(dest)) fs.writeFileSync(dest, bytes);
    this.record(key, { ...rec, file, bytes: bytes.length, at: new Date().toISOString() });
    return true;
  }

  /**
   * 生成一段（已有就直接返回）：返回文件名；失败记进 failures 并抛 VoiceError。
   * inflight：同一个项目共用的“正在生成”表（片段键 → 结果）。批量生成与边放边生成传同一张表，同一段同时只请求一次，后来的等先来的结果（generated 为 false）。
   */
  async generateOne(seg: Segment, locale: string, resolved: ResolvedVoices, store: ProfileStore, opts: GenerateOptions = {}): Promise<GeneratedClip> {
    if (seg.audio) throw new VoiceError('INVALID', 'This line supplies existing audio; it must never call a voice provider');
    const p = resolved.profile;
    const j = this.plan(seg, resolved);
    if (!p || !j) throw new VoiceError('INVALID', 'No voice provider is selected for this project, or the text is empty');
    const have = this.clipOf(j.key);
    if (have) return { key: j.key, file: have, generated: false };
    if (p.unsupported) throw new VoiceError('UNSUPPORTED', UNSUPPORTED_MESSAGE(p.name));
    const running = opts.inflight?.get(j.key);
    if (running) return { ...(await running), generated: false };
    const run = this.synthesizeOne(seg, locale, p, j, store, opts);
    opts.inflight?.set(j.key, run);
    try {
      const r = await run;
      // 第一次在这种语言下用 cloud 生成成功：把自动选的音色记进项目，之后不随推荐列表变
      if (resolved.autoPicks) this.pin(resolved.autoPicks.locale, resolved.autoPicks.map);
      return r;
    } finally {
      if (opts.inflight?.get(j.key) === run) opts.inflight.delete(j.key);
    }
  }

  private async synthesizeOne(seg: Segment, locale: string, p: VoiceProfile, j: { key: string; text: string; voice: string; fp: string }, store: ProfileStore, opts: GenerateOptions): Promise<GeneratedClip> {
    try {
      let a: { bytes: Buffer } & AudioType;
      if (p.kind === 'cloud') {
        const c = await synthesizeCloud(opts.cloud, { text: j.text, voice: j.voice, locale: opts.speechLocale, project: opts.project });
        opts.onCloud?.({ charged: c.result.charged, remaining: c.result.remaining, cache: c.result.cache });
        a = c;
      } else {
        const key = store.keyOf(p);
        if (!key) throw new VoiceError('NO_KEY', 'No API key for this provider');
        a = await synthesize(p, key, j.text, j.voice, opts);
      }
      const file = `${crypto.createHash('sha256').update(a.bytes).digest('hex')}.${a.ext}`;
      fs.mkdirSync(this.clipsDir, { recursive: true });
      const dest = path.join(this.clipsDir, file);
      if (!fs.existsSync(dest)) fs.writeFileSync(dest, a.bytes);
      this.record(j.key, { file, stepId: seg.stepId, fp: j.fp, text: j.text, locale, bytes: a.bytes.length, at: new Date().toISOString() });
      return { key: j.key, file, generated: true };
    } catch (e) {
      // 账号层面的错误（额度不够、没登录…）不是这一步的问题：不记失败，看板另外说明
      if (!(e instanceof VoiceError && STOP_CODES.has(e.code))) this.recordFailure(j.key, seg.stepId, e instanceof Error ? e.message : String(e));
      throw e;
    }
  }

  /**
   * 生成缺的片段（已有的跳过），并发 2。每段完成后调 onProgress。失败记进 failures，成功时清掉这个键的失败。
   */
  async generate(segments: Segment[], locale: string, resolved: ResolvedVoices, store: ProfileStore, opts: GenerateOptions & { onProgress?: (done: number, total: number, failed: number) => void } = {}): Promise<GenerateSummary> {
    if (!resolved.profile) return { total: segments.length, generated: 0, skipped: 0, failed: [], noProfile: true };
    const jobs = new Map<string, Segment>();
    for (const s of segments) {
      const j = this.plan(s, resolved);
      if (j) jobs.set(j.key, s);
    }
    const todo = [...jobs.entries()].filter(([k]) => !this.clipOf(k));
    const summary: GenerateSummary = { total: jobs.size, generated: 0, skipped: jobs.size - todo.length, failed: [] };
    // 旧 profile（D85）：不再生成；已有的音频照常播放与发布
    if (resolved.profile.unsupported) return { ...summary, unsupported: true, ...(todo.length ? { error: { code: 'UNSUPPORTED', message: UNSUPPORTED_MESSAGE(resolved.profile.name) } } : {}) };
    let done = summary.skipped;
    opts.onProgress?.(done, summary.total, 0);
    let next = 0;
    let stop = false;
    const worker = async () => {
      while (next < todo.length && !stop) {
        if (opts.signal?.aborted) return;
        const [, seg] = todo[next++]!;
        try {
          const r = await this.generateOne(seg, locale, resolved, store, opts);
          if (r.generated) summary.generated++;
          else summary.skipped++;
        } catch (e) {
          if (e instanceof VoiceError && STOP_CODES.has(e.code)) {
            // 额度不够（402）或账号问题：停下，已生成的保留；没生成的步骤由网页用浏览器朗读
            stop = true;
            if (e.code === 'TTS_QUOTA_EXCEEDED') summary.quota = { neededChars: nonNeg(e.data?.neededChars), remainingChars: nonNeg(e.data?.remainingChars) };
            else summary.error ??= { code: e.code, message: e.message };
          } else summary.failed.push({ stepId: seg.stepId, message: e instanceof Error ? e.message : String(e) });
        }
        done++;
        opts.onProgress?.(done, summary.total, summary.failed.length);
      }
    };
    await Promise.all([worker(), worker()]);
    if (stop) summary.stopped = todo.length - next;
    return summary;
  }
}

// ---------- 发布 ----------

export type BundleReport = {
  clips: number;
  bytes: number;
  missing: number;
  profile: string | null;
  /** 从上一次发布的分享沿用、这次没有重新生成的段数（D84）。 */
  reused?: number;
  /** 内容语言（D84）→ 这种语言还缺几步音频。只有项目写了 locales 才有。 */
  locales?: Record<string, { missing: number }>;
};

/** 每种内容语言（没有 i18n 时只有 null）用哪套声音指纹：本机有供应商时按本机，否则用已发布分享里的。 */
type PlaybackVoices = Pick<VoiceIndex, 'narrator' | 'roles' | 'overrides'>;
type LocaleVoices = { locale: string | null; project: Project; voices: PlaybackVoices };
function voicesPerLocale(project: Project, resolve: (locale: string | null) => PlaybackVoices | null): LocaleVoices[] {
  const locales = project.i18n ? project.i18n.locales : [null];
  return locales.flatMap((l) => {
    const v = resolve(l);
    return v ? [{ locale: l, project: l ? localizeProject(project, l) : project, voices: v }] : [];
  });
}
const sharedVoices = (index: VoiceIndex) => (l: string | null) => (l && index.locales?.[l]) || { narrator: index.narrator, roles: index.roles, ...(index.overrides ? { overrides: index.overrides } : {}) };

/** 上一次发布的分享（D84）：它的 voiceIndex（片段键 → voice/<sha256>.<ext>）和按相对路径取文件的方法。 */
export type SharedVoice = { index: VoiceIndex; fetch: (file: string) => Promise<Uint8Array | null> };

/**
 * 从上一次发布的分享沿用音频（D84）：Cloud 只存分享出去的作品，不另设缓存。按当前文字和声音算片段键，
 * 本机没有、分享里有的就下载到本机缓存（文件名必须是内容的 sha256），之后照常打包；上传时 Cloud 已有这些内容，不会重传。
 * 本机没有供应商时按分享里的声音指纹算键。自动字幕的步骤（文字由网页按语言生成）不在这里沿用。
 */
export async function reuseSharedVoice(projectDir: string, project: Project, shared: SharedVoice, store: ProfileStore, devConfig?: VoiceConfig, defaultProfile?: string | null): Promise<number> {
  const cache = new VoiceCache(projectDir);
  const selected = cache.selection();
  const pins = cache.pins();
  const local = resolveVoices(devConfig ?? project.voiceConfig, selected, store, null, defaultProfile, pins, cache.officialCloud());
  // 没选过来源（默认来源）时按分享里的指纹沿用：默认来源变了（例如登录后默认 cloud）也不能让已发布的音频丢掉
  const own = local.profile && local.source !== 'default';
  const per = voicesPerLocale(project, own ? (l) => resolveVoices(devConfig ?? project.voiceConfig, selected, store, voiceLocaleOf(project, l), defaultProfile, pins, cache.officialCloud()).voices : sharedVoices(shared.index));
  let reused = 0;
  for (const { locale, project: p, voices } of per)
    for (const sc of Object.values(p.scenarios))
      for (const [i, st] of sc.steps.entries()) {
        if (st.captionAuto && !st.say && !st.narrate) continue;
        const line = spokenLine(st, st.caption, speakerRoleAt(p, sc.id, i + 1));
        if (line.audio) continue;
        const fp = voiceFingerprint(voices, line.role, line.text);
        if (!fp || !line.text) continue;
        // 默认来源下已有的新片段优先，不为同一片段额外下载旧声音。
        if (local.source === 'default') {
          const current = resolveVoices(devConfig ?? project.voiceConfig, selected, store, voiceLocaleOf(project, locale), defaultProfile, pins, cache.officialCloud());
          const currentFp = voiceFingerprint(current.voices, line.role);
          if (currentFp && cache.localClipOf(clipKey(currentFp, line.text))) continue;
        }
        const text = line.text.replace(/\s+/g, ' ').trim();
        const key = clipKey(fp, text);
        const rel = shared.index.clips[key];
        if (!rel || cache.clipOf(key)) continue;
        const file = rel.replace(/^voice\//, '');
        const bytes = await shared.fetch(rel).catch(() => null);
        if (bytes && cache.adopt(key, file, bytes, { stepId: st.id, fp, text, locale: locale ?? project.i18n?.default ?? 'und', origin: 'shared' })) reused++;
      }
  return reused;
}

/**
 * 发布（joplo build / share）：把发布 IR 里步骤用到的、当前声音的音频拷进 `<outDir>/voice/`，返回 IR 的 voiceIndex。
 * 同一步同一声音同一语言只留最新的一段（改过字之后旧的不再带上）。
 * 内容多语言（D84）：每种内容语言按 resolveVoices(…, 语言) 选声音，voiceIndex.locales 记各语言的指纹；missing 按语言分别统计。
 * missing：还没有有效音频的步骤数（自动字幕必须匹配当前参数在片段语言下生成的文字）。
 * 没有选用 profile 时：给了 fallback（已发布分享的 voiceIndex）就按它的指纹带上本机已有的音频，否则不带（观众端用浏览器朗读）。
 * defaultProfile：项目没选过来源时的默认（D85：已登录为 'cloud'，与看板同一规则，见 resolveVoices）。
 * 不再支持的旧 profile 照常按它的指纹打包（D85：已生成的音频照常随分享上传）。
 */
export function bundleVoice(projectDir: string, project: Project, outDir: string, store: ProfileStore, devConfig?: VoiceConfig, fallback?: VoiceIndex, defaultProfile?: string | null): { index: VoiceIndex | null; report: BundleReport } {
  const cache = new VoiceCache(projectDir);
  const idx = cache.read();
  const selected = cache.selection();
  const cfg = devConfig ?? project.voiceConfig;
  const pins = cache.pins();
  const base = resolveVoices(cfg, selected, store, null, defaultProfile, pins, cache.officialCloud());
  // 有上一次的分享、而这里只是默认来源（没选过）时，按分享里的指纹打包（P0：默认来源的改变不能让已发布的音频丢失）
  const own = !!base.profile && !(fallback && base.source === 'default');
  const profileName = own ? base.profile!.name : fallback ? 'the published share' : null;
  const empty = { index: null, report: { clips: 0, bytes: 0, missing: 0, profile: profileName } };
  if (!own && !fallback) return { ...empty, report: { ...empty.report, profile: null } };
  const per = voicesPerLocale(project, own ? (l) => resolveVoices(cfg, selected, store, voiceLocaleOf(project, l), defaultProfile, pins, cache.officialCloud()).voices : sharedVoices(fallback!));
  const clips: Record<string, string> = {};
  let bytes = 0, missing = 0;
  const byLocale: Record<string, { missing: number }> = {};
  const output: LocaleVoices[] = [];
  for (const { locale, project: p, voices } of per) {
    const current = base.source === 'default'
      ? resolveVoices(cfg, selected, store, voiceLocaleOf(project, locale), defaultProfile, pins, cache.officialCloud()).voices
      : null;
    const overrides: Record<string, string> = {};
    let n = 0;
    for (const sc of Object.values(p.scenarios))
      sc.steps.forEach((st, i) => {
        const line = spokenLine(st, st.caption, speakerRoleAt(p, sc.id, i + 1));
        if (line.audio) return;
        const primary = voiceFingerprint(voices, line.role);
        if (!primary || !line.text) return;
        const localFp = current ? voiceFingerprint(current, line.role) : null;
        const previousFp = voiceFingerprint(voices, line.role, line.text);
        const preferredFp = localFp && cache.localClipOf(clipKey(localFp, line.text)) ? localFp : null;
        const candidates = [...new Set([preferredFp, previousFp, primary, localFp].filter((fp): fp is string => !!fp))];
        const localized = !!st.captionAuto && !st.say && !st.narrate && st.action.type !== 'card';
        // 自动字幕在网页里生成。按来源优先级找这种语言的最新片段，其他步骤严格匹配当前文字。
        const chosen: [string, ClipRecord][] = [];
        if (localized) {
          const records = Object.entries(idx.clips)
            .filter(([key, c]) => {
              if (c.stepId !== st.id || (locale && c.locale !== locale) || typeof c.text !== 'string') return false;
              const expected = c.locale === 'und' ? st.caption : automaticCaption(st.captionAuto!, c.locale);
              // 先证明文字仍属于当前内容，再考虑来源优先级；未知语言、旧文字或错配缓存键均不能发布。
              return expected !== null && c.text.replace(/\s+/g, ' ').trim() === expected.replace(/\s+/g, ' ').trim()
                && key === clipKey(c.fp, expected) && !!cache.clipOf(key);
            })
            .sort((a, b) => b[1].at.localeCompare(a[1].at));
          // 没有作者内容语言时，仍保留每种看板界面语言的自动字幕音频。
          for (const lang of new Set(records.map(([, c]) => c.locale))) {
            const sameLanguage = records.filter(([, c]) => c.locale === lang);
            const clip = sameLanguage.find(([, c]) => c.fp === localFp && c.origin !== 'shared')
              ?? sameLanguage.find(([, c]) => c.fp === voiceFingerprint(voices, line.role, c.text))
              ?? sameLanguage.find(([, c]) => c.fp === localFp);
            if (clip) chosen.push(clip);
          }
        } else {
          for (const fp of candidates) {
            const key = clipKey(fp, line.text);
            const c = idx.clips[key];
            if (c && cache.clipOf(key)) { chosen.push([key, c]); break; }
          }
        }
        if (!chosen.length) { n++; return; }
        for (const [key, c] of chosen) {
          if (!clips[key]) {
            fs.mkdirSync(path.join(outDir, 'voice'), { recursive: true });
            const dest = path.join(outDir, 'voice', c.file);
            if (!fs.existsSync(dest)) {
              fs.copyFileSync(path.join(cache.clipsDir, c.file), dest);
              bytes += c.bytes;
            }
            clips[key] = `voice/${c.file}`;
          }
          // 不伪造缓存指纹：索引单独记下这一语言、角色和文字实际使用的声音。
          if (c.fp !== primary) overrides[clipKey(line.role ?? '', c.text)] = c.fp;
        }
      });
    missing += n;
    if (locale) byLocale[locale] = { missing: n };
    output.push({ locale, project: p, voices: { narrator: voices.narrator, roles: voices.roles, ...(Object.keys(overrides).length ? { overrides } : {}) } });
  }
  const head = output[0]!.voices;
  const extra = project.i18n ? { locales: byLocale } : {};
  if (!Object.keys(clips).length) return { index: null, report: { ...empty.report, missing, ...extra } };
  const same = (x: PlaybackVoices) => JSON.stringify(x) === JSON.stringify(head);
  const locales = Object.fromEntries(output.filter((x) => x.locale && x.locale !== project.i18n?.default && !same(x.voices)).map((x) => [x.locale!, x.voices]));
  return {
    index: { ...head, clips, ...(Object.keys(locales).length ? { locales } : {}) },
    report: { clips: Object.keys(clips).length, bytes, missing, profile: profileName, ...extra },
  };
}
