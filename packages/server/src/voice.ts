/**
 * 朗读（D74）的服务端：声音供应商 profile、合成请求、项目里的音频缓存、发布时带上音频。
 *
 * 数据流：
 * - profile：看板「声音 → 管理供应商」→ PUT /__joplo/voice/profiles/:id → ProfileStore 写 `<JOPLO_HOME>/voice/profiles.json`（0600，含 Key）
 *   → GET 时 publicProfile 去掉 Key（只给是否已保存、末 4 位、可用的环境变量名）→ 看板列表与浮层。
 *   预设（OpenAI / ElevenLabs / AiHubMix）不写文件也存在；改过的预设以覆盖的形式存，删除 = 恢复预设。
 * - 选用：config({ voice: { profile } }) 优先；否则看板浮层里选的（PUT /__joplo/p/:id/voice → `<项目>/.joplo/voice/index.json` 的 profileId）。
 *   resolveVoices 算出旁白与各角色的音色和“声音指纹”（profile 的接口、地址、模型、音色、返回格式；不含 Key）。
 * - 生成：看板按当前语言算出每一步的朗读文字与角色 → POST /__joplo/p/:id/voice/generate → 每段用 clipKey(指纹, 文字) 作键，
 *   已有就跳过，否则 synthesize → 识别音频格式 → 写 `<项目>/.joplo/voice/clips/<sha256>.<ext>`，index.json 记 { 文件, 步骤, 指纹, 文字, 语言 }；
 *   失败记在 failures（看板显示原因，播放时这一步改用浏览器朗读）。进度用 HMR 自定义事件 joplo:voice 推给看板。
 * - 播放：GET /__joplo/p/:id/voice → { voices（指纹）, clips（键 → 音频地址）} → 网页 narrator 按同一个 clipKey 找音频，没有就用浏览器朗读。
 * - 发布：bundleVoice（joplo build / share）把发布 IR 里步骤用到的、当前声音的音频拷进站点 `voice/`，写 IR 的 voiceIndex；Key 永远不进产物。
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_STYLE, clipKey, speakerRoleAt, spokenLine, voiceFingerprint, type Project, type VoiceConfig, type VoiceIndex } from '@joplo-app/core';

export { DEFAULT_STYLE };

// ---------- profile ----------

export type ProfileKind = 'openai' | 'elevenlabs' | 'http';
/** 返回内容：音频文件本身；JSON 里的 base64；JSON 里的音频链接。 */
export type ResponseMode = 'audio' | 'json-base64' | 'json-url';
export type PresetId = 'openai' | 'elevenlabs' | 'aihubmix';

export type VoiceProfile = {
  id: string;
  name: string;
  kind: ProfileKind;
  preset?: PresetId;
  /** openai / elevenlabs：接口根地址（例如 https://api.openai.com/v1）；http：完整的请求地址。 */
  baseUrl: string;
  model: string;
  /** 默认音色（旁白）；elevenlabs 是 voice_id。 */
  voice: string;
  response: ResponseMode;
  /** response 是 JSON 时音频所在的字段路径，例如 data.audio、choices.0.audio。 */
  path?: string;
  /** 额外请求头；值里的 {{key}} 换成 Key。http 类型不写时用 Authorization: Bearer {{key}}。 */
  headers?: Record<string, string>;
  /** http 类型的请求体模板（JSON），{{text}} {{voice}} {{model}} 换成对应的值（已按 JSON 字符串转义）。 */
  body?: string;
  /** 说话风格（OpenAI 兼容接口的 instructions；tts-1 系列不支持，不发）。缺省用 DEFAULT_STYLE。 */
  style?: string;
  key?: string;
};

/** 预设音色：名字、性别、口音（BCP-47，没有表示多语言通用）、是否推荐。看板按旁白语言排序、按界面语言显示说明。 */
export type VoiceChoice = { id: string; name: string; gender: 'female' | 'male' | 'neutral'; accent?: string; recommended?: boolean };



export type PublicProfile = Omit<VoiceProfile, 'key'> & {
  key: { saved: boolean; hint: string | null; env: string | null; envSet: boolean };
  /** 这个接口的预设音色（看板里作为候选；可以填别的）。 */
  voices: VoiceChoice[];
  /** 可以删除（自建的）；预设只能恢复默认。 */
  removable: boolean;
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

type Preset = Omit<VoiceProfile, 'key' | 'id'> & { id: PresetId; env: string; voices: VoiceChoice[] };
export const PRESETS: Preset[] = [
  { id: 'openai', preset: 'openai', name: 'OpenAI', kind: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini-tts', voice: 'marin', response: 'audio', style: DEFAULT_STYLE, env: 'OPENAI_API_KEY', voices: OPENAI_VOICES },
  // voice_id 是 ElevenLabs 文档示例里的 George；多语言模型能读中文
  { id: 'elevenlabs', preset: 'elevenlabs', name: 'ElevenLabs', kind: 'elevenlabs', baseUrl: 'https://api.elevenlabs.io/v1', model: 'eleven_multilingual_v2', voice: 'JBFqnCBsd6RMkjVDRZzb', response: 'audio', env: 'ELEVENLABS_API_KEY', voices: ELEVENLABS_VOICES },
  { id: 'aihubmix', preset: 'aihubmix', name: 'AiHubMix', kind: 'openai', baseUrl: 'https://aihubmix.com/v1', model: 'gpt-4o-mini-tts', voice: 'marin', response: 'audio', style: DEFAULT_STYLE, env: 'AIHUBMIX_API_KEY', voices: OPENAI_VOICES },
];
const presetOf = (id: string | undefined) => PRESETS.find((p) => p.id === id);

export class VoiceError extends Error {
  constructor(
    readonly code: 'NO_KEY' | 'HTTP' | 'NOT_AUDIO' | 'BAD_RESPONSE' | 'NETWORK' | 'TOO_LARGE' | 'INVALID' | 'NOT_FOUND' | 'BUSY',
    message: string,
    readonly hint?: { response: ResponseMode; path: string },
  ) {
    super(message);
  }
}

const ID_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : null);
const isHttpUrl = (v: string) => {
  try {
    const u = new URL(v);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
};

/** 校验看板提交的 profile（不含 id / key）。返回规整后的字段，或抛 VoiceError('INVALID')。 */
export function normalizeProfile(input: unknown, base?: VoiceProfile): Omit<VoiceProfile, 'id' | 'key' | 'preset'> {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const kind = base?.preset ? base.kind : o.kind === 'openai' || o.kind === 'elevenlabs' || o.kind === 'http' ? o.kind : null;
  if (!kind) throw new VoiceError('INVALID', 'kind must be openai, elevenlabs or http');
  const name = str(o.name, 60);
  if (!name) throw new VoiceError('INVALID', 'Name is required (up to 60 characters)');
  const baseUrl = str(o.baseUrl, 500)?.replace(/\/+$/, '');
  if (!baseUrl || !isHttpUrl(baseUrl)) throw new VoiceError('INVALID', 'Base URL must start with https:// or http://');
  const model = str(o.model, 200) ?? '';
  const voice = str(o.voice, 200) ?? '';
  if (kind !== 'http' && !voice) throw new VoiceError('INVALID', 'Default voice is required');
  const response: ResponseMode = o.response === 'json-base64' || o.response === 'json-url' ? o.response : 'audio';
  const p = response === 'audio' ? undefined : str(o.path, 200);
  if (response !== 'audio' && (!p || !/^[\w$-]+(\.[\w$-]+)*$/.test(p))) throw new VoiceError('INVALID', 'Audio field path is required for JSON responses, for example data.audio');
  let headers: Record<string, string> | undefined;
  if (o.headers !== undefined && o.headers !== null) {
    if (typeof o.headers !== 'object' || Array.isArray(o.headers)) throw new VoiceError('INVALID', 'headers must be an object of strings');
    const entries = Object.entries(o.headers as Record<string, unknown>);
    if (entries.length > 20) throw new VoiceError('INVALID', 'At most 20 headers');
    headers = {};
    for (const [k, v] of entries) {
      if (!/^[A-Za-z0-9-]{1,100}$/.test(k) || typeof v !== 'string' || v.length > 2000 || /[\r\n]/.test(v)) throw new VoiceError('INVALID', `Invalid header: ${k}`);
      headers[k] = v;
    }
    if (!Object.keys(headers).length) headers = undefined;
  }
  let body: string | undefined;
  if (kind === 'http') {
    body = str(o.body, 4000) ?? undefined;
    if (!body || !body.includes('{{text}}')) throw new VoiceError('INVALID', 'The request body template must contain {{text}}');
    try {
      JSON.parse(fillTemplate(body, { text: 't', voice: 'v', model: 'm' }));
    } catch {
      throw new VoiceError('INVALID', 'The request body template is not valid JSON once {{text}} {{voice}} {{model}} are filled in');
    }
  }
  const style = kind === 'openai' && o.style !== undefined && o.style !== null ? (typeof o.style === 'string' && o.style.length <= 1000 ? o.style.trim() : (() => { throw new VoiceError('INVALID', 'Speaking style is up to 1000 characters'); })()) : undefined;
  return { name, kind, baseUrl, model, voice, response, ...(p ? { path: p } : {}), ...(headers ? { headers } : {}), ...(body ? { body } : {}), ...(style ? { style } : {}) };
}

type StoreFile = { version: 1; profiles: VoiceProfile[] };

/** `<JOPLO_HOME>/voice/profiles.json`：自建的 profile 与改过的预设（含 Key），权限 0600。 */
export class ProfileStore {
  readonly file: string;
  constructor(
    home: string,
    private readonly env: Record<string, string | undefined> = process.env,
  ) {
    this.file = path.join(home, 'voice', 'profiles.json');
  }

  private read(): VoiceProfile[] {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8')) as StoreFile;
      return Array.isArray(raw?.profiles) ? raw.profiles.filter((p) => p && typeof p.id === 'string' && ID_RE.test(p.id) && typeof p.name === 'string') : [];
    } catch {
      return [];
    }
  }

  private write(list: VoiceProfile[]) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
    const tmp = `${this.file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ version: 1, profiles: list } satisfies StoreFile, null, 2), { mode: 0o600 });
    fs.chmodSync(tmp, 0o600);
    fs.renameSync(tmp, this.file);
  }

  /** 预设（合并本机覆盖）在前，自建的在后。 */
  list(): VoiceProfile[] {
    const stored = this.read();
    const presets = PRESETS.map(({ env: _e, voices: _v, ...p }) => ({ ...p, ...(stored.find((s) => s.id === p.id) ?? {}), id: p.id, preset: p.id, kind: p.kind }));
    return [...presets, ...stored.filter((s) => !presetOf(s.id))];
  }

  get(id: string): VoiceProfile | null {
    return this.list().find((p) => p.id === id) ?? null;
  }

  /** 按 id 或名字（不区分大小写）找，config({ voice: { profile } }) 用。 */
  find(ref: string): VoiceProfile | null {
    const r = ref.trim().toLowerCase();
    return this.list().find((p) => p.id === r || p.name.toLowerCase() === r) ?? null;
  }

  /** Key：保存的优先，其次是预设对应的环境变量。 */
  keyOf(p: VoiceProfile): string | null {
    if (p.key) return p.key;
    const env = presetOf(p.preset)?.env;
    const v = env ? this.env[env] : undefined;
    return v && v.trim() ? v.trim() : null;
  }

  /**
   * 新建或修改。id 为 null 时新建（id 由名字生成）。key：undefined = 不改；null 或 '' = 删掉保存的 Key；字符串 = 保存。
   */
  upsert(id: string | null, input: unknown, key: string | null | undefined): VoiceProfile {
    const list = this.read();
    const current = id ? this.get(id) : null;
    if (id && !current) throw new VoiceError('NOT_FOUND', `Unknown voice profile: ${id}`);
    const fields = normalizeProfile(input, current ?? undefined);
    let nextId = id;
    if (!nextId) {
      const slug = fields.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'voice';
      nextId = slug;
      for (let i = 2; this.get(nextId) || presetOf(nextId); i++) nextId = `${slug}-${i}`;
    }
    if (key !== undefined && key !== null && (typeof key !== 'string' || key.length > 500 || /[\r\n]/.test(key))) throw new VoiceError('INVALID', 'Invalid API key');
    const keep = list.find((p) => p.id === nextId)?.key;
    const nextKey = key === undefined ? keep : key && key.trim() ? key.trim() : undefined;
    const next: VoiceProfile = { id: nextId, ...fields, ...(presetOf(nextId) ? { preset: nextId as PresetId } : {}), ...(nextKey ? { key: nextKey } : {}) };
    this.write([...list.filter((p) => p.id !== nextId), next]);
    return next;
  }

  /** 自建的删除；预设恢复默认（去掉本机覆盖，包括保存的 Key）。 */
  remove(id: string) {
    const list = this.read();
    if (!presetOf(id) && !list.some((p) => p.id === id)) throw new VoiceError('NOT_FOUND', `Unknown voice profile: ${id}`);
    this.write(list.filter((p) => p.id !== id));
  }

  publicOf(p: VoiceProfile): PublicProfile {
    const { key: _k, ...rest } = p;
    const preset = presetOf(p.preset);
    const env = preset?.env ?? null;
    return { ...rest, key: { saved: !!p.key, hint: p.key ? `…${p.key.slice(-4)}` : null, env, envSet: !!(env && this.env[env]?.trim()) }, voices: preset?.voices ?? (p.kind === 'openai' ? OPENAI_VOICES : p.kind === 'elevenlabs' ? ELEVENLABS_VOICES : []), removable: !preset };
  }
}

// ---------- 合成 ----------

const MAX_AUDIO = 20 * 1024 * 1024;
const TIMEOUT_MS = 60_000;

/** JSON 字符串转义后替换 {{text}} {{voice}} {{model}}（模板本身是 JSON，值放在引号里）。 */
export function fillTemplate(tpl: string, v: { text: string; voice: string; model: string; key?: string }): string {
  const esc = (s: string) => JSON.stringify(s).slice(1, -1);
  return tpl.replace(/\{\{\s*(text|voice|model|key)\s*\}\}/g, (_m, k: 'text' | 'voice' | 'model' | 'key') => esc(v[k] ?? ''));
}

/** 发给模型的说话风格：只有 OpenAI 兼容接口、且不是 tts-1 系列（不支持 instructions）时才发。 */
export const styleOf = (p: VoiceProfile): string | null => (p.kind === 'openai' && p.style?.trim() && !/^tts-1/i.test(p.model) ? p.style.trim() : null);

/** 这次合成的 HTTP 请求（不发出）。 */
export function buildRequest(p: VoiceProfile, key: string | null, text: string, voice: string): { url: string; init: RequestInit } {
  const headerVals = (h: Record<string, string>) => Object.fromEntries(Object.entries(h).map(([k, v]) => [k, v.replace(/\{\{\s*key\s*\}\}/g, key ?? '')]));
  if (p.kind === 'elevenlabs') {
    if (!key) throw new VoiceError('NO_KEY', 'No API key for this provider');
    const url = `${p.baseUrl}/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`;
    return { url, init: { method: 'POST', headers: { 'content-type': 'application/json', accept: 'audio/mpeg', 'xi-api-key': key, ...headerVals(p.headers ?? {}) }, body: JSON.stringify({ text, ...(p.model ? { model_id: p.model } : {}) }) } };
  }
  if (p.kind === 'openai') {
    if (!key) throw new VoiceError('NO_KEY', 'No API key for this provider');
    return {
      url: `${p.baseUrl}/audio/speech`,
      init: { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}`, ...headerVals(p.headers ?? {}) }, body: JSON.stringify({ model: p.model, input: text, voice, response_format: 'mp3', ...(styleOf(p) ? { instructions: styleOf(p) } : {}) }) },
    };
  }
  const headers = p.headers ? headerVals(p.headers) : key ? { authorization: `Bearer ${key}` } : {};
  return { url: p.baseUrl, init: { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: fillTemplate(p.body ?? '{"input":"{{text}}"}', { text, voice, model: p.model, key: key ?? '' }) } };
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

/** 按 a.b.0.c 取值。 */
export function getPath(v: unknown, p: string): unknown {
  let cur = v;
  for (const seg of p.split('.')) {
    if (cur === null || cur === undefined) return undefined;
    cur = Array.isArray(cur) && /^\d+$/.test(seg) ? cur[Number(seg)] : typeof cur === 'object' ? (cur as Record<string, unknown>)[seg] : undefined;
  }
  return cur;
}

const B64_RE = /^(data:audio\/[\w.+-]+;base64,)?[A-Za-z0-9+/=\r\n_-]+$/;
const decodeB64 = (s: string) => Buffer.from(s.replace(/^data:[^,]*,/, '').replace(/[\r\n]/g, '').replace(/-/g, '+').replace(/_/g, '/'), 'base64');

/** 返回的是 JSON 时，找出像音频的字段，给出“返回内容 + 字段路径”的建议。 */
export function suggestFromJson(v: unknown): { response: ResponseMode; path: string } | null {
  const seen: { response: ResponseMode; path: string }[] = [];
  const walk = (x: unknown, p: string[], depth: number) => {
    if (depth > 6 || seen.length) return;
    if (typeof x === 'string') {
      if (x.length >= 64 && B64_RE.test(x) && sniffAudio(decodeB64(x.slice(0, 4096 - (4096 % 4))))) seen.push({ response: 'json-base64', path: p.join('.') });
      else if (/^https?:\/\/\S+$/.test(x) && (/\.(mp3|wav|ogg|m4a|aac|flac|opus)(\?|$)/i.test(x) || /audio/i.test(p.join('.')))) seen.push({ response: 'json-url', path: p.join('.') });
      return;
    }
    if (Array.isArray(x)) x.slice(0, 20).forEach((y, i) => walk(y, [...p, String(i)], depth + 1));
    else if (x && typeof x === 'object') for (const [k, y] of Object.entries(x)) walk(y, [...p, k], depth + 1);
  };
  walk(v, [], 0);
  return seen[0] ?? null;
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

/** 合成一段：返回音频字节与格式。失败抛 VoiceError（信息里不含 Key）。 */
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
  if (p.response === 'audio') {
    const t = sniffAudio(bytes);
    if (t) return { bytes, ...t };
    let hint: ReturnType<typeof suggestFromJson> = null;
    if (/json/i.test(ct) || /^\s*[{[]/.test(bytes.subarray(0, 16).toString('utf8'))) {
      try {
        hint = suggestFromJson(JSON.parse(bytes.toString('utf8')));
      } catch {
        /* 不是 JSON */
      }
    }
    throw new VoiceError('NOT_AUDIO', `The response is not audio (${ct || 'no content type'}): ${scrub(bytes.subarray(0, 200).toString('utf8'), key)}`, hint ?? undefined);
  }
  let json: unknown;
  try {
    json = JSON.parse(bytes.toString('utf8'));
  } catch {
    const t = sniffAudio(bytes);
    throw new VoiceError('BAD_RESPONSE', t ? 'The response is an audio file, not JSON' : `The response is not JSON (${ct || 'no content type'})`, t ? { response: 'audio', path: '' } : undefined);
  }
  const v = getPath(json, p.path ?? '');
  if (typeof v !== 'string' || !v) {
    throw new VoiceError('BAD_RESPONSE', `No text at "${p.path}" in the JSON response: ${scrub(JSON.stringify(json), key)}`, suggestFromJson(json) ?? undefined);
  }
  if (p.response === 'json-base64') {
    const audio = decodeB64(v);
    const t = sniffAudio(audio);
    if (!t) throw new VoiceError('NOT_AUDIO', `"${p.path}" is not base64 audio`, suggestFromJson(json) ?? undefined);
    if (audio.length > MAX_AUDIO) throw new VoiceError('TOO_LARGE', `The audio is larger than ${MAX_AUDIO / 1024 / 1024} MB`);
    return { bytes: audio, ...t };
  }
  if (!isHttpUrl(v)) throw new VoiceError('BAD_RESPONSE', `"${p.path}" is not an http(s) link`, suggestFromJson(json) ?? undefined);
  let dl: Response;
  try {
    dl = await f(v, { signal, redirect: 'follow' });
  } catch (e) {
    throw new VoiceError('NETWORK', `Could not download the audio: ${scrub(e instanceof Error ? e.message : String(e), key)}`);
  }
  const audio = await readLimited(dl);
  if (!dl.ok) throw new VoiceError('HTTP', `Downloading the audio failed: HTTP ${dl.status}`);
  const t = sniffAudio(audio);
  if (!t) throw new VoiceError('NOT_AUDIO', `The link in "${p.path}" did not return audio`);
  return { bytes: audio, ...t };
}

// ---------- 声音指纹与选用 ----------

/** 声音指纹：接口、地址、模型、音色、返回格式、请求体模板、说话风格（不含 Key 与请求头）。 */
export function fingerprint(p: VoiceProfile, voice: string): string {
  return crypto.createHash('sha256').update(JSON.stringify([p.kind, p.baseUrl, p.model, voice, p.response, p.path ?? '', p.body ?? '', styleOf(p) ?? ''])).digest('hex').slice(0, 16);
}

export type ResolvedVoices = {
  profile: VoiceProfile | null;
  /** 选用来源：config = joplo.config.ts 的 voice.profile；board = 看板浮层里选的；null = 只用浏览器朗读。 */
  source: 'config' | 'board' | null;
  /** config 里写了、但本机没有的 profile 名。 */
  missing: string | null;
  narrator: string | null;
  roles: Record<string, string>;
  /** 旁白与各角色的声音指纹（没有 profile 时都是 null / 空）。 */
  voices: { narrator: string | null; roles: Record<string, string> };
};

export function resolveVoices(config: VoiceConfig | undefined, selected: string | null, store: ProfileStore): ResolvedVoices {
  let profile: VoiceProfile | null = null;
  let source: ResolvedVoices['source'] = null;
  let missing: string | null = null;
  if (config?.profile) {
    profile = store.find(config.profile);
    if (profile) source = 'config';
    else missing = config.profile;
  } else if (selected) {
    profile = store.get(selected);
    if (profile) source = 'board';
  }
  if (!profile) return { profile: null, source, missing, narrator: null, roles: {}, voices: { narrator: null, roles: {} } };
  const narrator = config?.narrator ?? profile.voice;
  const roles = { ...(config?.roles ?? {}) };
  return {
    profile,
    source,
    missing,
    narrator,
    roles,
    voices: { narrator: fingerprint(profile, narrator), roles: Object.fromEntries(Object.entries(roles).map(([r, v]) => [r, fingerprint(profile, v)])) },
  };
}

// ---------- 项目缓存 ----------

export type ClipRecord = { file: string; stepId: string; fp: string; text: string; locale: string; bytes: number; at: string };
type IndexFile = { version: 1; profileId: string | null; clips: Record<string, ClipRecord>; failures: Record<string, { stepId: string; message: string; at: string }> };
const FILE_RE = /^[0-9a-f]{64}\.(mp3|wav|ogg|flac|m4a|aac)$/;

export type Segment = { stepId: string; text: string; role: string | null };
export type GenerateSummary = { total: number; generated: number; skipped: number; failed: { stepId: string; message: string }[]; noProfile?: boolean };

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
      return { version: 1, profileId: typeof raw.profileId === 'string' ? raw.profileId : null, clips: raw.clips && typeof raw.clips === 'object' ? raw.clips : {}, failures: raw.failures && typeof raw.failures === 'object' ? raw.failures : {} };
    } catch {
      return { version: 1, profileId: null, clips: {}, failures: {} };
    }
  }

  write(idx: IndexFile) {
    fs.mkdirSync(this.root, { recursive: true });
    const file = path.join(this.root, 'index.json');
    const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(idx, null, 2));
    fs.renameSync(tmp, file);
  }

  select(profileId: string | null) {
    this.write({ ...this.read(), profileId });
  }

  /** 片段文件的绝对路径（文件名不合法或不存在时为 null）。 */
  fileOf(name: string): string | null {
    if (!FILE_RE.test(name)) return null;
    const f = path.join(this.clipsDir, name);
    return fs.existsSync(f) ? f : null;
  }

  /** 当前声音下已有的片段：键 → 文件名；以及失败的键 → 原因。 */
  current(voices: ResolvedVoices['voices']): { clips: Record<string, string>; failures: Record<string, { stepId: string; message: string }> } {
    const fps = new Set([voices.narrator, ...Object.values(voices.roles)].filter(Boolean) as string[]);
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
  private recordFailure(k: string, stepId: string, message: string) {
    const idx = this.read();
    idx.failures[k] = { stepId, message, at: new Date().toISOString() };
    this.write(idx);
  }

  /** 这一段的键与要用的音色；文字为空或没有供应商时为 null。 */
  plan(seg: Segment, resolved: ResolvedVoices): { key: string; text: string; voice: string; fp: string } | null {
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

  /** 生成一段（已有就直接返回）：返回文件名；失败记进 failures 并抛 VoiceError。 */
  async generateOne(seg: Segment, locale: string, resolved: ResolvedVoices, store: ProfileStore, opts: { fetch?: FetchLike; signal?: AbortSignal } = {}): Promise<{ key: string; file: string; generated: boolean }> {
    const p = resolved.profile;
    const j = this.plan(seg, resolved);
    if (!p || !j) throw new VoiceError('INVALID', 'No voice provider is selected for this project, or the text is empty');
    const have = this.clipOf(j.key);
    if (have) return { key: j.key, file: have, generated: false };
    const key = store.keyOf(p);
    try {
      if (!key && p.kind !== 'http') throw new VoiceError('NO_KEY', 'No API key for this provider');
      const a = await synthesize(p, key, j.text, j.voice, opts);
      const file = `${crypto.createHash('sha256').update(a.bytes).digest('hex')}.${a.ext}`;
      fs.mkdirSync(this.clipsDir, { recursive: true });
      const dest = path.join(this.clipsDir, file);
      if (!fs.existsSync(dest)) fs.writeFileSync(dest, a.bytes);
      this.record(j.key, { file, stepId: seg.stepId, fp: j.fp, text: j.text, locale, bytes: a.bytes.length, at: new Date().toISOString() });
      return { key: j.key, file, generated: true };
    } catch (e) {
      this.recordFailure(j.key, seg.stepId, e instanceof Error ? e.message : String(e));
      throw e;
    }
  }

  /**
   * 生成缺的片段（已有的跳过），并发 2。每段完成后调 onProgress。失败记进 failures，成功时清掉这个键的失败。
   */
  async generate(segments: Segment[], locale: string, resolved: ResolvedVoices, store: ProfileStore, opts: { fetch?: FetchLike; signal?: AbortSignal; onProgress?: (done: number, total: number, failed: number) => void } = {}): Promise<GenerateSummary> {
    if (!resolved.profile) return { total: segments.length, generated: 0, skipped: 0, failed: [], noProfile: true };
    const jobs = new Map<string, Segment>();
    for (const s of segments) {
      const j = this.plan(s, resolved);
      if (j) jobs.set(j.key, s);
    }
    const todo = [...jobs.entries()].filter(([k]) => !this.clipOf(k));
    const summary: GenerateSummary = { total: jobs.size, generated: 0, skipped: jobs.size - todo.length, failed: [] };
    let done = summary.skipped;
    opts.onProgress?.(done, summary.total, 0);
    let next = 0;
    const worker = async () => {
      while (next < todo.length) {
        if (opts.signal?.aborted) return;
        const [, seg] = todo[next++]!;
        try {
          const r = await this.generateOne(seg, locale, resolved, store, opts);
          if (r.generated) summary.generated++;
          else summary.skipped++;
        } catch (e) {
          summary.failed.push({ stepId: seg.stepId, message: e instanceof Error ? e.message : String(e) });
        }
        done++;
        opts.onProgress?.(done, summary.total, summary.failed.length);
      }
    };
    await Promise.all([worker(), worker()]);
    return summary;
  }
}

// ---------- 发布 ----------

export type BundleReport = { clips: number; bytes: number; missing: number; profile: string | null };

/**
 * 发布（joplo build / share）：把发布 IR 里步骤用到的、当前声音的音频拷进 `<outDir>/voice/`，返回 IR 的 voiceIndex。
 * 同一步同一声音同一语言只留最新的一段（改过字之后旧的不再带上）。
 * missing：当前声音下还没有音频的步骤数（文字与语言无关的步骤按键判断；自动字幕的步骤只要有任意语言的音频就算有）。
 * 没有选用 profile 时不带任何音频（观众端用浏览器朗读）。
 */
export function bundleVoice(projectDir: string, project: Project, outDir: string, store: ProfileStore, devConfig?: VoiceConfig): { index: VoiceIndex | null; report: BundleReport } {
  const cache = new VoiceCache(projectDir);
  const idx = cache.read();
  const resolved = resolveVoices(devConfig ?? project.voiceConfig, idx.profileId, store);
  const empty = { index: null, report: { clips: 0, bytes: 0, missing: 0, profile: resolved.profile?.name ?? null } };
  if (!resolved.profile) return empty;
  const fps = new Set([resolved.voices.narrator, ...Object.values(resolved.voices.roles)].filter(Boolean) as string[]);
  const stepIds = new Set(Object.values(project.scenarios).flatMap((s) => s.steps.map((st) => st.id)));
  const latest = new Map<string, [string, ClipRecord]>();
  for (const [k, c] of Object.entries(idx.clips)) {
    if (!stepIds.has(c.stepId) || !fps.has(c.fp) || !FILE_RE.test(c.file) || !fs.existsSync(path.join(cache.clipsDir, c.file))) continue;
    const g = `${c.stepId}|${c.fp}|${c.locale}`;
    const prev = latest.get(g);
    if (!prev || prev[1].at < c.at) latest.set(g, [k, c]);
  }
  const clips: Record<string, string> = {};
  let bytes = 0;
  if (latest.size) fs.mkdirSync(path.join(outDir, 'voice'), { recursive: true });
  for (const [k, c] of latest.values()) {
    const dest = path.join(outDir, 'voice', c.file);
    if (!fs.existsSync(dest)) {
      fs.copyFileSync(path.join(cache.clipsDir, c.file), dest);
      bytes += c.bytes;
    }
    clips[k] = `voice/${c.file}`;
  }
  let missing = 0;
  for (const sc of Object.values(project.scenarios))
    sc.steps.forEach((st, i) => {
      const line = spokenLine(st, st.caption, speakerRoleAt(project, sc.id, i + 1));
      const fp = voiceFingerprint(resolved.voices, line.role);
      if (!fp || !line.text) return;
      // 自动字幕在网页里按观众语言生成：这一步有任意语言的音频就算有
      const localized = !!st.captionAuto && !st.say && !st.narrate && st.action.type !== 'card';
      const ok = localized ? [...latest.values()].some(([, c]) => c.stepId === st.id && c.fp === fp) : !!clips[clipKey(fp, line.text)];
      if (!ok) missing++;
    });
  if (!Object.keys(clips).length) return { index: null, report: { ...empty.report, missing } };
  return { index: { narrator: resolved.voices.narrator, roles: resolved.voices.roles, clips }, report: { clips: Object.keys(clips).length, bytes, missing, profile: resolved.profile.name } };
}
