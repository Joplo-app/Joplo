/**
 * Joplo Cloud 朗读（D85）的 CLI 一侧：读额度与音色表、合成一段。看板（cloud-bridge 的 voice）与 `joplo voice` 共用。
 *
 * 契约（Cloud C27，不能改）：
 * - `GET /api/v1/voice` → { model, quota, voices, recommended, defaultVoice }。旧云端 404 → null（不报错，退回浏览器朗读）。
 * - `POST /api/v1/voice/speech` { text, voice, locale?, style?, project? } → 200 audio/mpeg；响应头 X-Joplo-Chars-Charged、
 *   X-Joplo-Chars-Remaining、X-Joplo-Cache: hit|miss、X-Joplo-Audio-Sha256。
 * - 错误 { code, message, data }：400 BAD_REQUEST；401（API Key 需要 voice:generate）；402 TTS_QUOTA_EXCEEDED（data: neededChars / remainingChars / usagePath）；
 *   403 EMAIL_UNVERIFIED；429；503 TTS_UNAVAILABLE（可重试，不扣字数）。
 *
 * 不回显远端错误正文（可能有令牌回显）；只认白名单里的字段。字数 = Array.from(text).length，生成成功才扣，缓存命中不扣。
 */
import type { CloudSpeechRequest, CloudSpeechResult, CloudVoice, CloudVoiceInfo, VoiceQuota } from '@joplo-app/server';
import { API_KEY_FIX, apiKeyPrefix, nonempty, object, retryAfterMillis, type CloudClient } from './cloud.ts';
import { CloudError } from './cloud-error.ts';

const count = (v: unknown): number | null => (Number.isSafeInteger(v) && (v as number) >= 0 ? (v as number) : null);
const iso = (v: unknown): string | null => (typeof v === 'string' && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : null);
const VOICE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const LOCALE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
const httpsUrl = (v: unknown): string | null => {
  if (typeof v !== 'string' || v.length > 2000) return null;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
};

/** quota 合法时才采纳（非负整数、period 只认 trial / month）；不合法为 null。 */
export function readVoiceQuota(value: unknown): VoiceQuota | null {
  const q = object(value);
  const allowanceChars = count(q.allowanceChars), usedChars = count(q.usedChars), remainingChars = count(q.remainingChars), totalRemainingChars = count(q.totalRemainingChars);
  if (allowanceChars === null || usedChars === null || remainingChars === null || totalRemainingChars === null || (q.period !== 'trial' && q.period !== 'month')) return null;
  const packs = Array.isArray(q.packs) ? q.packs.flatMap((p) => { const o = object(p), r = count(o.remainingChars), e = iso(o.expiresAt); return r !== null && e ? [{ remainingChars: r, expiresAt: e }] : []; }).slice(0, 50) : [];
  const plan = typeof q.plan === 'string' && /^[a-z_-]{1,32}$/.test(q.plan) ? q.plan : 'free';
  return { plan, period: q.period, allowanceChars, usedChars, remainingChars, resetsAt: iso(q.resetsAt), packs, totalRemainingChars };
}

/** `GET /api/v1/voice` 的内容：音色只认合法 id，样音只认 http(s) 地址；推荐里只留认识的音色。不合法时为 null。 */
export function readVoiceInfo(value: unknown): CloudVoiceInfo | null {
  const d = object(value);
  const quota = readVoiceQuota(d.quota);
  if (!quota || !Array.isArray(d.voices)) return null;
  const voices: CloudVoice[] = d.voices.slice(0, 50).flatMap((v) => {
    const o = object(v);
    if (typeof o.id !== 'string' || !VOICE_ID.test(o.id) || (o.gender !== 'female' && o.gender !== 'male')) return [];
    const labels = Object.fromEntries(Object.entries(object(o.labels)).filter(([k, x]) => LOCALE.test(k) && typeof x === 'string' && x.trim() && x.length <= 80).map(([k, x]) => [k, (x as string).trim()]));
    const samples = Object.fromEntries(Object.entries(object(o.samples)).flatMap(([k, x]) => { const u = httpsUrl(x); return LOCALE.test(k) && u ? [[k, u]] : []; }));
    return [{ id: o.id, gender: o.gender, labels, samples }];
  });
  if (!voices.length) return null;
  const ids = new Set(voices.map((v) => v.id));
  const recommended = Object.fromEntries(Object.entries(object(d.recommended)).flatMap(([k, list]) => (LOCALE.test(k) && Array.isArray(list) ? [[k, list.filter((x): x is string => typeof x === 'string' && ids.has(x)).slice(0, 10)]] : [])).filter(([, l]) => (l as string[]).length));
  const defaultVoice = typeof d.defaultVoice === 'string' && ids.has(d.defaultVoice) ? d.defaultVoice : voices[0]!.id;
  return { model: typeof d.model === 'string' ? d.model.slice(0, 100) : '', quota, voices, recommended, defaultVoice };
}

/** 读额度与音色表：旧云端（404）、连不上、格式不对时为 null（看板与 whoami 不报错，只是不显示）；登录失效照常抛出。 */
export async function fetchVoiceInfo(client: CloudClient, token: string): Promise<CloudVoiceInfo | null> {
  try {
    return readVoiceInfo(await client.request('/api/v1/voice', token, undefined, { timeoutMs: 10_000 }));
  } catch (e) {
    if (e instanceof CloudError && (e.code === 'AUTH_EXPIRED' || e.code === 'AUTH_REQUIRED')) throw e;
    return null;
  }
}

/** 朗读额度不够（402）。details 里拼好当前 server 的用量页（不信任服务端给的绝对地址）。 */
export function ttsQuotaError(value: unknown, server: string): CloudError {
  const d = object(value);
  const neededChars = count(d.neededChars), remainingChars = count(d.remainingChars);
  const path = typeof d.usagePath === 'string' && /^\/[A-Za-z0-9/_-]*$/.test(d.usagePath) ? d.usagePath : '/usage';
  const usageUrl = server + path;
  const nums = neededChars !== null && remainingChars !== null ? ` This needs ${neededChars} characters, but only ${remainingChars} are left.` : '';
  return new CloudError('TTS_QUOTA_EXCEEDED', `Not enough Joplo Cloud narration characters.${nums} Audio already generated is kept; steps without audio use the browser voice. Buy a top-up pack: ${usageUrl}`, { neededChars, remainingChars, usageUrl });
}

const MAX_AUDIO = 20 * 1024 * 1024;

/**
 * 合成一段（POST /api/v1/voice/speech）。503 / 网络错误 / 429 按 CloudClient.retry 的策略重试（最多 3 次，读 Retry-After；
 * 503 不扣字数，网络中断后重试命中云端缓存也不重复扣）。402 → TTS_QUOTA_EXCEEDED；其他错误按状态归类，不回显正文。
 */
export async function speech(client: CloudClient, token: string, req: CloudSpeechRequest): Promise<CloudSpeechResult> {
  const body = { text: req.text, voice: req.voice, ...(req.locale ? { locale: req.locale } : {}), ...(req.project ? { project: req.project } : {}) };
  return client.retry(async () => {
    let res: Response;
    try {
      res = await fetch(`${client.server}/api/v1/voice/speech`, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(90_000),
        headers: { 'X-Joplo-Client': `joplo-cli/${client.version}`, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
        body: JSON.stringify(body),
      });
    } catch {
      throw new CloudError('NETWORK');
    }
    if (res.ok) {
      const len = Number(res.headers.get('content-length') ?? 0);
      if (len > MAX_AUDIO) throw new CloudError('INVALID_RESPONSE', 'The narration audio is too large');
      let audio: Uint8Array;
      try {
        audio = new Uint8Array(await res.arrayBuffer());
      } catch {
        throw new CloudError('NETWORK');
      }
      if (audio.length > MAX_AUDIO || !audio.length) throw new CloudError('INVALID_RESPONSE', 'Invalid narration audio from the cloud');
      const n = (h: string) => { const v = res.headers.get(h); return v !== null && /^\d+$/.test(v.trim()) ? count(Number(v.trim())) : null; };
      const cache = res.headers.get('x-joplo-cache')?.trim().toLowerCase();
      const sha = res.headers.get('x-joplo-audio-sha256')?.trim().toLowerCase() ?? '';
      return { audio, contentType: res.headers.get('content-type') ?? 'audio/mpeg', charged: n('x-joplo-chars-charged'), remaining: n('x-joplo-chars-remaining'), cache: cache === 'hit' || cache === 'miss' ? cache : null, sha256: /^[0-9a-f]{64}$/.test(sha) ? sha : null };
    }
    let data: Record<string, unknown> = {};
    try {
      data = object(await res.json());
    } catch {
      /* 没有正文 */
    }
    const code = data.code;
    if (res.status === 402) throw ttsQuotaError(data.data ?? data.details, client.server);
    if (res.status === 503 || res.status >= 500) throw new CloudError('NETWORK', 'Joplo Cloud narration is temporarily unavailable. Try again later', { code: 'TTS_UNAVAILABLE' }, { afterMs: retryAfterMillis(res.headers.get('retry-after'), client.now()) });
    if (res.status === 429) throw new CloudError('NETWORK', 'Too many narration requests. Try again later', { code: 'RATE_LIMITED' }, { afterMs: retryAfterMillis(res.headers.get('retry-after'), client.now()) ?? 5000 });
    if (res.status === 401) {
      if (token.startsWith('jpk_')) throw new CloudError('AUTH_EXPIRED', `The API key ${apiKeyPrefix(token)}… cannot generate narration: it is invalid, expired, revoked, or lacks the voice:generate scope. ${API_KEY_FIX} with voice:generate: ${client.server}/settings/api-keys`, { fix: `${client.server}/settings/api-keys` });
      throw new CloudError('AUTH_EXPIRED', undefined, { fix: 'npx joplo login' });
    }
    if (res.status === 403 && code === 'EMAIL_UNVERIFIED') throw new CloudError('EMAIL_UNVERIFIED', `Verify your email (or sign in with GitHub) to use Joplo Cloud narration: ${client.server}/settings`, { fix: `${client.server}/settings` });
    if (res.status === 403) throw new CloudError('FORBIDDEN', token.startsWith('jpk_') ? `The API key ${apiKeyPrefix(token)}… does not have the voice:generate scope. ${API_KEY_FIX}: ${client.server}/settings/api-keys` : undefined);
    if (res.status === 404) throw new CloudError('NOT_FOUND', 'This Joplo Cloud does not offer narration yet');
    if (res.status === 400) throw new CloudError('BAD_REQUEST', nonempty(data.message) && /voice|text|locale|2000/i.test(String(data.message)) ? `Joplo Cloud rejected the narration request: ${String(data.message).slice(0, 200)}` : 'Joplo Cloud rejected the narration request (empty text, more than 2000 characters, or an unknown voice)');
    throw new CloudError('BAD_REQUEST', undefined, undefined, undefined, res.status);
  });
}

/** CloudError → bridge.speech 抛出的 { code, message, data }（server 包的 synthesizeCloud 只认这些 code）。 */
export function speechFailure(e: unknown): Error & { code: string; data?: Record<string, unknown> } {
  if (e instanceof CloudError) {
    const sub = (e.details as { code?: unknown } | undefined)?.code;
    const code = e.code === 'NETWORK' && (sub === 'TTS_UNAVAILABLE' || sub === 'RATE_LIMITED') ? sub : e.code;
    return Object.assign(new Error(e.message), { code, ...(e.code === 'TTS_QUOTA_EXCEEDED' ? { data: e.details as Record<string, unknown> } : {}) });
  }
  return Object.assign(new Error(e instanceof Error ? e.message : String(e)), { code: 'NETWORK' });
}

/** 文本里的一行朗读额度：“Narration: 3,155 characters left (trial)” / “… this month, resets 2026-12-01”。 */
export function voiceQuotaLine(q: VoiceQuota): string {
  const n = (x: number) => x.toLocaleString('en-US');
  const packs = q.packs.reduce((s, p) => s + p.remainingChars, 0);
  const period = q.period === 'trial' ? 'free trial' : `this month${q.resetsAt ? `, resets ${q.resetsAt.slice(0, 10)}` : ''}`;
  return `Narration: ${n(q.totalRemainingChars)} characters left (${n(q.remainingChars)} of ${n(q.allowanceChars)} ${period}${packs ? ` + ${n(packs)} from top-up packs` : ''})`;
}
