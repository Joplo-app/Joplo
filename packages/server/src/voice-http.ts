/**
 * 朗读（D74 / D85）的看板接口。写接口都经 dev.ts 的 guardWrite（Origin + 本机令牌 + JSON）。
 *
 * 全局（本机）：
 * - GET    /__joplo/voice/profiles            → { profiles: PublicProfile[], file }（不含 Key；file = 本机存储文件，所有项目共用）
 *                                              预设（cloud、openai、elevenlabs）在前，本机旧的 profile（unsupported: true）在后。
 * - PUT    /__joplo/voice/profiles/:id        { profile?: { voice?, model?, style? }, key? } → { profile, profiles }
 *                                              只能改预设（「管理密钥」与浮层里换旁白音色）；key：省略 = 不改，null / '' = 删掉。
 *                                              新建（:id = new）与改旧的 profile 返回 400 INVALID（D85：不再提供自定义接口）。
 * - DELETE /__joplo/voice/profiles/:id        → { profiles }（预设恢复默认，旧的 profile 删除）
 *   保存、删除成功后调 opts.profilesChanged：dev.ts 推 joplo:voice { profilesChanged }，打开着的看板重新取自己项目的声音状态。
 * - POST   /__joplo/voice/test                { id, key? } → { ok: true, audio: data URL, bytes, contentType } | { ok: false, error: { code, message } }
 *                                              （OpenAI / ElevenLabs 的 Key 测试；cloud 用样音试听，不走这里）
 * 项目：
 * - GET    /__joplo/p/:id/voice[?refresh=1]   → VoiceState（refresh=1 时重新问一次云端额度）
 * - PUT    /__joplo/p/:id/voice               { profileId | null } → VoiceState（看板里选的，记在 .joplo/voice/index.json，chosen: true）
 * - POST   /__joplo/p/:id/voice/clip          { locale, segment: { stepId, text, role } } → { key, url }（边放边生成一段；与批量生成共用 inflight）
 *                                              cloud 额度不够时 402 TTS_QUOTA_EXCEEDED（不再问云端，直到额度刷新）
 * - POST   /__joplo/p/:id/voice/generate      { locale, segments: [{ stepId, text, role }] } → { summary, state }；进度推 joplo:voice
 * - GET    /__joplo/p/:id/voice/clips/:file   → 音频
 *
 * 托管朗读的状态（D85）：opts.cloud（CLI 注入的 bridge.voice）→ status() 记在内存 60 秒（cloudInfo）→ VoiceState.cloud（已登录、额度、用量页）。
 * 已登录且项目没选过来源时默认用 cloud（resolveVoices 的 fallback）。每段 cloud 合成成功后用响应头 X-Joplo-Chars-Remaining 更新内存里的
 * totalRemainingChars 并推送状态；402 时记下 exhausted（需要 / 剩余），之后的边放边生成直接返回 402，直到重新取到的额度大于 0。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type http from 'node:http';
import type { Project } from '@joplo-app/core';
import type { CloudVoiceBridge, CloudVoiceInfo, CloudVoiceStatus, VoiceQuota } from './cloud.ts';
import { AUDIO_TYPES, ProfileStore, voiceLocaleOf, VoiceCache, VoiceError, resolveVoices, synthesize, type CloudReceipt, type FetchLike, type GenerateSummary, type Inflight, type PublicProfile, type ResolvedVoices, type Segment } from './voice.ts';

/** 看板里托管朗读的状态（D85）。null = 这个看板没有 bridge（旧 CLI 启动），只能用浏览器朗读与自带 Key 的供应商。 */
export type VoiceCloudView = {
  signedIn: boolean;
  server: string | null;
  /** 没登录时给的登录命令（看板里可复制）。 */
  loginCommand: string | null;
  /** 已登录且云端给了 /api/v1/voice（连不上或旧云端 404 时为 false，看板不显示数字）。 */
  available: boolean;
  /** 额度：云端给的，每段合成后用响应头里的剩余字数更新。 */
  quota: VoiceQuota | null;
  /** 控制台的用量页（`<server>/usage`，买加油包也在这里）。 */
  usageUrl: string | null;
  /** 上一次 cloud 合成收到 402：需要多少、还剩多少。 */
  exhausted: { neededChars: number | null; remainingChars: number | null } | null;
};

export type VoiceState = {
  /**
   * 版本：每次算状态时递增（以微秒时钟为下限，dev 重启后也不会变小）。看板只接受 rev 不比当前小的状态：
   * 推送、选择 / 生成的返回、profilesChanged 之后的重新读取可能乱序到达，晚到的旧状态不能覆盖新的。
   */
  rev: number;
  /** 看板里选的 profile（config 写了 voice.profile 时以 config 为准，见 source）；没选过为 null，看 source 是否为 default。 */
  selected: string | null;
  /** config / board / default（没选过，已登录时默认 cloud）/ null（浏览器朗读）。 */
  source: ResolvedVoices['source'];
  /** config 里写了、本机没有的 profile 名。 */
  missing: string | null;
  profile: PublicProfile | null;
  /** 旁白与各角色的声音指纹（网页用 clipKey 找音频）。 */
  voices: { narrator: string | null; roles: Record<string, string> };
  narrator: string | null;
  roles: Record<string, string>;
  /** 片段键 → 音频地址。 */
  clips: Record<string, string>;
  /** 片段键 → 失败原因。 */
  failures: Record<string, { stepId: string; message: string }>;
  generating: { done: number; total: number; failed: number } | null;
  /** 内容语言（D84）→ 这种语言的旁白、角色音色与指纹；只有项目写了 locales 才有。看板按当前内容语言取指纹算片段键。 */
  byLocale?: Record<string, { narrator: string | null; roles: Record<string, string>; voices: { narrator: string | null; roles: Record<string, string> } }>;
  /** 托管朗读（D85）。 */
  cloud: VoiceCloudView | null;
};

/** 请求里的内容语言：必须是项目声明的语言；没有 i18n 或不合法时为 null（按原来的方式处理）。 */
function contentLocaleOf(project: Project | null, v: unknown): string | null {
  return typeof v === 'string' && project?.i18n?.locales.includes(v) ? v : null;
}

type Ctx = {
  guardWrite: (needJson?: boolean) => boolean;
  jsonBody: () => Promise<{ ok: true; body: unknown } | { ok: false }>;
  send: (status: number, body: unknown) => void;
};

const MAX_SEGMENTS = 2000;
/** 云端额度与音色表在内存里放多久（看板打开浮层时可以 refresh=1 立刻重取）。 */
const CLOUD_TTL_MS = 60_000;

let lastRev = 0;
const nextRev = () => (lastRev = Math.max(lastRev + 1, Date.now() * 1000));

/** 用户目录写成 ~（看板显示 profile 存在哪里；不在用户目录下时原样）。 */
export function tildify(file: string, home = os.homedir()): string {
  return home && (file === home || file.startsWith(home + path.sep)) ? '~' + file.slice(home.length) : file;
}
const MAX_TEXT = 2000;
const num = (v: unknown) => (Number.isSafeInteger(v) && (v as number) >= 0 ? (v as number) : null);

export class VoiceHub {
  readonly store: ProfileStore;
  private jobs = new Map<string, { done: number; total: number; failed: number; abort: AbortController }>();
  /** 正在生成的段：项目 → （片段键 → 结果）。批量生成与边放边生成共用，同一段只请求一次。 */
  private inflight = new Map<string, Inflight>();
  private inflightOf(projectId: string): Inflight {
    let m = this.inflight.get(projectId);
    if (!m) this.inflight.set(projectId, (m = new Map()));
    return m;
  }
  /** 托管朗读状态（内存，CLOUD_TTL_MS）：status = null 表示问云端时出错（当作连不上）。 */
  private cloudCache: { at: number; status: CloudVoiceStatus | null; pending?: Promise<CloudVoiceStatus | null> } | null = null;
  private exhausted: VoiceCloudView['exhausted'] = null;

  constructor(
    home: string,
    private readonly opts: { emit: (projectId: string, state: VoiceState) => void; profilesChanged?: () => void; fetch?: FetchLike; env?: Record<string, string | undefined>; cloud?: CloudVoiceBridge; now?: () => number },
  ) {
    this.store = new ProfileStore(home, opts.env ?? process.env, { catalog: () => this.liveInfo() });
  }

  private now = () => (this.opts.now ?? Date.now)();
  private liveInfo(): CloudVoiceInfo | null {
    const s = this.cloudCache?.status;
    return s?.signedIn && s.voice ? s.voice : null;
  }

  /** 托管朗读的状态：内存里有、没过期就直接用；否则问一次 bridge（并发的请求共用一次）。出错不抛，当作连不上。 */
  private async cloudStatus(refresh = false): Promise<CloudVoiceStatus | null> {
    if (!this.opts.cloud) return null;
    const c = this.cloudCache;
    if (c?.pending) return c.pending;
    if (c && !refresh && this.now() - c.at < CLOUD_TTL_MS) return c.status;
    const pending = this.opts.cloud
      .status()
      .then((s) => (s && typeof s === 'object' && typeof s.signedIn === 'boolean' ? s : null))
      .catch(() => null);
    this.cloudCache = { at: c?.at ?? 0, status: c?.status ?? null, pending };
    const status = await pending;
    this.cloudCache = { at: this.now(), status };
    if (status?.signedIn && status.voice) {
      this.store.rememberCloudCatalog(status.voice);
      // 额度刷新后有字了（例如买了加油包）：解除“额度不够”
      if (status.voice.quota.totalRemainingChars > 0) this.exhausted = null;
    }
    return status;
  }

  private cloudView(status: CloudVoiceStatus | null): VoiceCloudView | null {
    if (!this.opts.cloud) return null;
    if (!status) return { signedIn: true, server: null, loginCommand: null, available: false, quota: null, usageUrl: null, exhausted: this.exhausted };
    if (!status.signedIn) return { signedIn: false, server: status.server, loginCommand: status.loginCommand, available: false, quota: null, usageUrl: `${status.server}/usage`, exhausted: null };
    return { signedIn: true, server: status.server, loginCommand: null, available: !!status.voice, quota: status.voice?.quota ?? null, usageUrl: `${status.server}/usage`, exhausted: this.exhausted };
  }

  /** 没选过来源时的默认（D85）：已登录用 cloud，否则浏览器朗读。云端暂时连不上时仍算已登录（音色用本机记下的）。 */
  private fallbackOf(status: CloudVoiceStatus | null): string | null {
    if (!this.opts.cloud) return null;
    return !status || status.signedIn ? 'cloud' : null;
  }

  /** 每段 cloud 合成成功：剩余字数以响应头为准（不在本地估算）。 */
  private receipt(r: CloudReceipt) {
    const s = this.cloudCache?.status;
    if (s?.signedIn && s.voice && r.remaining !== null) s.voice.quota = { ...s.voice.quota, totalRemainingChars: r.remaining };
    if (r.remaining === null || r.remaining > 0) this.exhausted = null;
  }

  /** 402：记下需要 / 剩余，剩余字数也以 402 里的为准。 */
  private quotaHit(data: { neededChars: number | null; remainingChars: number | null }) {
    this.exhausted = data;
    const s = this.cloudCache?.status;
    if (s?.signedIn && s.voice && data.remainingChars !== null) s.voice.quota = { ...s.voice.quota, totalRemainingChars: data.remainingChars };
  }

  private profiles = () => this.store.list().map((p) => this.store.publicOf(p));

  private error(ctx: Ctx, e: unknown) {
    if (e instanceof VoiceError) {
      const status = e.code === 'NOT_FOUND' ? 404 : e.code === 'BUSY' ? 409 : e.code === 'TTS_QUOTA_EXCEEDED' ? 402 : e.code === 'AUTH_REQUIRED' || e.code === 'AUTH_EXPIRED' ? 401 : e.code === 'RATE_LIMITED' ? 429 : e.code === 'TTS_UNAVAILABLE' || e.code === 'NETWORK' ? 503 : 400;
      return ctx.send(status, { error: { code: e.code, message: e.message, ...(e.data ? { data: e.data } : {}) } });
    }
    throw e;
  }

  /** /__joplo/voice/<rest>；不认识的路径返回 false。 */
  async handleGlobal(rest: string, req: http.IncomingMessage, ctx: Ctx): Promise<boolean> {
    const method = req.method ?? 'GET';
    if (rest === 'profiles' && method === 'GET') {
      await this.cloudStatus();
      return ctx.send(200, { profiles: this.profiles(), file: tildify(this.store.file) }), true;
    }
    const pm = /^profiles\/([a-z0-9][a-z0-9_-]{0,39}|new)$/.exec(rest);
    if (pm && method === 'PUT') {
      if (!ctx.guardWrite()) return true;
      const b = await ctx.jsonBody();
      if (!b.ok) return true;
      const body = (b.body ?? {}) as { profile?: unknown; key?: unknown };
      try {
        const key = body.key === undefined ? undefined : body.key === null ? null : typeof body.key === 'string' ? body.key : (() => { throw new VoiceError('INVALID', 'key must be a string or null'); })();
        const saved = this.store.upsert(pm[1] === 'new' ? null : pm[1]!, body.profile, key);
        ctx.send(200, { profile: this.store.publicOf(saved), profiles: this.profiles() });
        this.opts.profilesChanged?.();
      } catch (e) {
        this.error(ctx, e);
      }
      return true;
    }
    if (pm && pm[1] !== 'new' && method === 'DELETE') {
      if (!ctx.guardWrite(false)) return true;
      try {
        this.store.remove(pm[1]!);
        ctx.send(200, { profiles: this.profiles() });
        this.opts.profilesChanged?.();
      } catch (e) {
        this.error(ctx, e);
      }
      return true;
    }
    if (rest === 'test' && method === 'POST') {
      if (!ctx.guardWrite()) return true;
      const b = await ctx.jsonBody();
      if (!b.ok) return true;
      const body = (b.body ?? {}) as { id?: unknown; key?: unknown; text?: unknown };
      try {
        const saved = typeof body.id === 'string' ? this.store.get(body.id) : null;
        if (!saved) throw new VoiceError('NOT_FOUND', `Unknown voice profile: ${String(body.id)}`);
        if (saved.kind !== 'openai' && saved.kind !== 'elevenlabs') throw new VoiceError('INVALID', 'Only OpenAI and ElevenLabs keys can be tested here');
        const key = typeof body.key === 'string' && body.key.trim() ? body.key.trim() : this.store.keyOf(saved);
        if (!key) throw new VoiceError('NO_KEY', 'No API key: paste one, or set the environment variable shown next to the key field');
        const text = typeof body.text === 'string' && body.text.trim() ? body.text.trim().slice(0, 200) : 'Hello, this is the Joplo narrator.';
        const a = await synthesize(saved, key, text, saved.voice, { fetch: this.opts.fetch });
        ctx.send(200, { ok: true, contentType: a.contentType, bytes: a.bytes.length, audio: `data:${a.contentType};base64,${a.bytes.toString('base64')}` });
      } catch (e) {
        if (e instanceof VoiceError && e.code !== 'NOT_FOUND') return ctx.send(200, { ok: false, error: { code: e.code, message: e.message } }), true;
        this.error(ctx, e);
      }
      return true;
    }
    return false;
  }

  /** 项目的声音状态（看板浮层、播放时找音频）。refresh：重新问一次云端额度。 */
  async state(projectId: string, dir: string, project: Project | null, refresh = false): Promise<VoiceState> {
    const status = await this.cloudStatus(refresh);
    const fallback = this.fallbackOf(status);
    const cache = new VoiceCache(dir);
    const selected = cache.selection();
    const r = resolveVoices(project?.voiceConfig, selected, this.store, null, fallback);
    const per = Object.fromEntries((project?.i18n?.locales ?? []).map((l) => [l, resolveVoices(project?.voiceConfig, selected, this.store, voiceLocaleOf(project, l), fallback)]));
    const all = Object.values(per);
    const cur = cache.current({ narrator: r.voices.narrator, roles: r.voices.roles }, all.flatMap((x) => [x.voices.narrator, ...Object.values(x.voices.roles)]).filter((x): x is string => !!x));
    const job = this.jobs.get(projectId);
    const enc = encodeURIComponent;
    return {
      rev: nextRev(),
      selected: selected ?? null,
      source: r.source,
      missing: r.missing,
      profile: r.profile ? this.store.publicOf(r.profile) : null,
      voices: r.voices,
      narrator: r.narrator,
      roles: r.roles,
      clips: Object.fromEntries(Object.entries(cur.clips).map(([k, f]) => [k, `/__joplo/p/${enc(projectId)}/voice/clips/${f}`])),
      failures: cur.failures,
      generating: job ? { done: job.done, total: job.total, failed: job.failed } : null,
      ...(all.length ? { byLocale: Object.fromEntries(Object.entries(per).map(([l, x]) => [l, { narrator: x.narrator, roles: x.roles, voices: x.voices }])) } : {}),
      cloud: this.cloudView(status),
    };
  }

  private emitState(projectId: string, dir: string, project: Project | null) {
    void this.state(projectId, dir, project).then((s) => this.opts.emit(projectId, s), () => undefined);
  }

  /** 生成用的声音：与 state() 同一套默认来源。 */
  private async resolveFor(dir: string, project: Project | null, content: string | null) {
    const fallback = this.fallbackOf(await this.cloudStatus());
    return resolveVoices(project?.voiceConfig, new VoiceCache(dir).selection(), this.store, voiceLocaleOf(project, content), fallback);
  }

  /** cloud 请求的内容语言（D84）：项目写了 locales 时是当前内容语言（没传时是默认语言）；没写时不带，由云端按文字判断。 */
  private speechLocaleOf(project: Project | null, content: string | null): string | null {
    return project?.i18n ? (content ?? project.i18n.default) : null;
  }

  /** /__joplo/p/:id/voice[/…]；不认识的路径返回 false。 */
  async handleProject(projectId: string, dir: string, project: Project | null, rest: string, req: http.IncomingMessage, res: http.ServerResponse, ctx: Ctx): Promise<boolean> {
    const method = req.method ?? 'GET';
    if (rest === '' && method === 'GET') return ctx.send(200, await this.state(projectId, dir, project, /[?&]refresh=1(&|$)/.test(req.url ?? ''))), true;
    if (rest === '' && method === 'PUT') {
      if (!ctx.guardWrite()) return true;
      const b = await ctx.jsonBody();
      if (!b.ok) return true;
      const id = (b.body as { profileId?: unknown })?.profileId;
      if (id !== null && (typeof id !== 'string' || !this.store.get(id))) return ctx.send(400, { error: { code: 'USAGE', message: `Unknown voice profile: ${String(id)}` } }), true;
      new VoiceCache(dir).select(id);
      const st = await this.state(projectId, dir, project);
      this.opts.emit(projectId, st);
      return ctx.send(200, st), true;
    }
    if (rest === 'generate' && method === 'POST') {
      if (!ctx.guardWrite()) return true;
      const b = await ctx.jsonBody();
      if (!b.ok) return true;
      const body = (b.body ?? {}) as { locale?: unknown; contentLocale?: unknown; segments?: unknown };
      const segs = Array.isArray(body.segments) ? body.segments : null;
      const ok = segs && segs.length <= MAX_SEGMENTS && segs.every((s: Segment) => s && typeof s.stepId === 'string' && typeof s.text === 'string' && s.text.length <= MAX_TEXT && (s.role === null || typeof s.role === 'string'));
      if (!ok) return ctx.send(400, { error: { code: 'USAGE', message: `segments must be up to ${MAX_SEGMENTS} items of { stepId, text, role }` } }), true;
      if (this.jobs.has(projectId)) return ctx.send(409, { error: { code: 'BUSY', message: 'Narration is already being generated for this project' } }), true;
      const cache = new VoiceCache(dir);
      const content = contentLocaleOf(project, body.contentLocale);
      const resolved = await this.resolveFor(dir, project, content);
      const job = { done: 0, total: segs!.length, failed: 0, abort: new AbortController() };
      this.jobs.set(projectId, job);
      let summary: GenerateSummary;
      try {
        summary = await cache.generate(segs as Segment[], content ?? (typeof body.locale === 'string' ? body.locale.slice(0, 20) : 'en'), resolved, this.store, {
          fetch: this.opts.fetch,
          signal: job.abort.signal,
          inflight: this.inflightOf(projectId),
          cloud: this.opts.cloud,
          project: project?.name ?? null,
          speechLocale: this.speechLocaleOf(project, content),
          onCloud: (r) => this.receipt(r),
          onProgress: (done, total, failed) => {
            Object.assign(job, { done, total, failed });
            this.emitState(projectId, dir, project);
          },
        });
      } finally {
        this.jobs.delete(projectId);
      }
      if (summary.quota) this.quotaHit(summary.quota);
      const st = await this.state(projectId, dir, project);
      this.opts.emit(projectId, st);
      return ctx.send(200, { summary, state: st }), true;
    }
    if (rest === 'clip' && method === 'POST') {
      // 边放边生成：播放到这一步（或预取后面几步）时只生成这一段；同一段同时只生成一次
      if (!ctx.guardWrite()) return true;
      const b = await ctx.jsonBody();
      if (!b.ok) return true;
      const body = (b.body ?? {}) as { locale?: unknown; contentLocale?: unknown; segment?: Segment };
      const seg = body.segment;
      if (!seg || typeof seg.stepId !== 'string' || typeof seg.text !== 'string' || seg.text.length > MAX_TEXT || (seg.role !== null && typeof seg.role !== 'string')) return ctx.send(400, { error: { code: 'USAGE', message: 'segment must be { stepId, text, role }' } }), true;
      const cache = new VoiceCache(dir);
      const content = contentLocaleOf(project, body.contentLocale);
      const resolved = await this.resolveFor(dir, project, content);
      const plan = cache.plan(seg, resolved);
      if (!plan) return ctx.send(400, { error: { code: 'INVALID', message: 'No voice provider is selected for this project' } }), true;
      const have = cache.clipOf(plan.key);
      // 额度已经用完：不再问云端（每播一步都会来一次），这一步由网页用浏览器朗读
      if (!have && resolved.profile?.kind === 'cloud' && this.exhausted) return ctx.send(402, { error: { code: 'TTS_QUOTA_EXCEEDED', message: 'Not enough Joplo Cloud narration characters left', data: this.exhausted } }), true;
      const p = cache.generateOne(seg, content ?? (typeof body.locale === 'string' ? body.locale.slice(0, 20) : 'en'), resolved, this.store, {
        fetch: this.opts.fetch,
        inflight: this.inflightOf(projectId),
        cloud: this.opts.cloud,
        project: project?.name ?? null,
        speechLocale: this.speechLocaleOf(project, content),
        onCloud: (r) => this.receipt(r),
      });
      try {
        const r = await p;
        if (r.generated) this.emitState(projectId, dir, project);
        return ctx.send(200, { key: r.key, url: `/__joplo/p/${encodeURIComponent(projectId)}/voice/clips/${r.file}` }), true;
      } catch (e) {
        if (e instanceof VoiceError && e.code === 'TTS_QUOTA_EXCEEDED') this.quotaHit({ neededChars: num(e.data?.neededChars), remainingChars: num(e.data?.remainingChars) });
        this.emitState(projectId, dir, project);
        return this.error(ctx, e), true;
      }
    }
    const cm = /^clips\/([^/]+)$/.exec(rest);
    if (cm && (method === 'GET' || method === 'HEAD')) {
      const f = new VoiceCache(dir).fileOf(cm[1]!);
      if (!f) return ctx.send(404, { error: { code: 'NOT_FOUND', message: 'No such audio clip' } }), true;
      const ext = cm[1]!.split('.').pop() as keyof typeof AUDIO_TYPES;
      const size = fs.statSync(f).size;
      res.writeHead(200, { 'content-type': AUDIO_TYPES[ext], 'content-length': size, 'cache-control': 'private, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' });
      if (method === 'HEAD') return res.end(), true;
      fs.createReadStream(f).pipe(res);
      return true;
    }
    return false;
  }

  /** 关闭看板时停掉正在生成的任务。 */
  close() {
    for (const j of this.jobs.values()) j.abort.abort();
  }
}
