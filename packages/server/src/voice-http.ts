/**
 * 朗读（D74）的看板接口。写接口都经 dev.ts 的 guardWrite（Origin + 本机令牌 + JSON）。
 *
 * 全局（本机）：
 * - GET    /__joplo/voice/profiles            → { profiles: PublicProfile[], file }（不含 Key；file = 本机存储文件，所有项目共用）
 * - PUT    /__joplo/voice/profiles/:id|new    { profile, key? } → { profile, profiles }（key：省略 = 不改，null / '' = 删掉）
 * - DELETE /__joplo/voice/profiles/:id        → { profiles }（自建的删除，预设恢复默认）
 *   保存、删除成功后调 opts.profilesChanged：dev.ts 推 joplo:voice { profilesChanged }，打开着的看板重新取自己项目的声音状态
 *   （Key 是否保存、音色、声音指纹都可能变了）。
 * - POST   /__joplo/voice/test                { id?, profile?, key?, text? } → { ok: true, audio: data URL, bytes, contentType }
 *                                              | { ok: false, error: { code, message, hint? } }（hint = 建议的返回内容与字段路径）
 * 项目：
 * - GET    /__joplo/p/:id/voice               → VoiceState
 * - PUT    /__joplo/p/:id/voice               { profileId | null } → VoiceState（看板里选的，记在 .joplo/voice/index.json）
 * - POST   /__joplo/p/:id/voice/clip          { locale, segment: { stepId, text, role } } → { key, url }（边放边生成一段；与批量生成共用 inflight，同一段并发只生成一次）
 * - POST   /__joplo/p/:id/voice/generate      { locale, segments: [{ stepId, text, role }] } → { summary, state }；进度推 joplo:voice
 * - GET    /__joplo/p/:id/voice/clips/:file   → 音频
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type http from 'node:http';
import type { Project } from '@joplo-app/core';
import { AUDIO_TYPES, ProfileStore, VoiceCache, VoiceError, normalizeProfile, resolveVoices, synthesize, type FetchLike, type GenerateSummary, type Inflight, type PublicProfile, type Segment, type VoiceProfile } from './voice.ts';

export type VoiceState = {
  /**
   * 版本：每次算状态时递增（以微秒时钟为下限，dev 重启后也不会变小）。看板只接受 rev 不比当前小的状态：
   * 推送、选择 / 生成的返回、profilesChanged 之后的重新读取可能乱序到达，晚到的旧状态不能覆盖新的。
   */
  rev: number;
  /** 看板里选的 profile（config 写了 voice.profile 时以 config 为准，见 source）。 */
  selected: string | null;
  source: 'config' | 'board' | null;
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
};

type Ctx = {
  guardWrite: (needJson?: boolean) => boolean;
  jsonBody: () => Promise<{ ok: true; body: unknown } | { ok: false }>;
  send: (status: number, body: unknown) => void;
};

const MAX_SEGMENTS = 2000;

let lastRev = 0;
const nextRev = () => (lastRev = Math.max(lastRev + 1, Date.now() * 1000));

/** 用户目录写成 ~（看板显示 profile 存在哪里；不在用户目录下时原样）。 */
export function tildify(file: string, home = os.homedir()): string {
  return home && (file === home || file.startsWith(home + path.sep)) ? '~' + file.slice(home.length) : file;
}
const MAX_TEXT = 2000;

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

  constructor(
    home: string,
    private readonly opts: { emit: (projectId: string, state: VoiceState) => void; profilesChanged?: () => void; fetch?: FetchLike; env?: Record<string, string | undefined> },
  ) {
    this.store = new ProfileStore(home, opts.env ?? process.env);
  }

  private profiles = () => this.store.list().map((p) => this.store.publicOf(p));

  private error(ctx: Ctx, e: unknown) {
    if (e instanceof VoiceError) return ctx.send(e.code === 'NOT_FOUND' ? 404 : e.code === 'BUSY' ? 409 : 400, { error: { code: e.code, message: e.message, ...(e.hint ? { hint: e.hint } : {}) } });
    throw e;
  }

  /** /__joplo/voice/<rest>；不认识的路径返回 false。 */
  async handleGlobal(rest: string, req: http.IncomingMessage, ctx: Ctx): Promise<boolean> {
    const method = req.method ?? 'GET';
    if (rest === 'profiles' && method === 'GET') return ctx.send(200, { profiles: this.profiles(), file: tildify(this.store.file) }), true;
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
      const body = (b.body ?? {}) as { id?: unknown; profile?: unknown; key?: unknown; text?: unknown };
      try {
        const saved = typeof body.id === 'string' ? this.store.get(body.id) : null;
        if (typeof body.id === 'string' && !saved) throw new VoiceError('NOT_FOUND', `Unknown voice profile: ${body.id}`);
        // 草稿（还没保存的表单）优先；没传 Key 时用已保存的 / 环境变量里的
        const draft: VoiceProfile = body.profile !== undefined ? { ...(saved ?? { id: 'draft' }), ...normalizeProfile(body.profile, saved ?? undefined), id: saved?.id ?? 'draft', ...(saved?.preset ? { preset: saved.preset } : {}) } as VoiceProfile : saved!;
        if (!draft) throw new VoiceError('INVALID', 'Pass id or profile');
        const key = typeof body.key === 'string' && body.key.trim() ? body.key.trim() : this.store.keyOf(saved ? { ...draft, key: saved.key } : draft);
        if (!key && draft.kind !== 'http') throw new VoiceError('NO_KEY', 'No API key: paste one, or set the environment variable shown next to the key field');
        const text = typeof body.text === 'string' && body.text.trim() ? body.text.trim().slice(0, 200) : 'Hello, this is the Joplo narrator.';
        const a = await synthesize(draft, key, text, draft.voice, { fetch: this.opts.fetch });
        ctx.send(200, { ok: true, contentType: a.contentType, bytes: a.bytes.length, audio: `data:${a.contentType};base64,${a.bytes.toString('base64')}` });
      } catch (e) {
        if (e instanceof VoiceError && e.code !== 'NOT_FOUND') return ctx.send(200, { ok: false, error: { code: e.code, message: e.message, ...(e.hint ? { hint: e.hint } : {}) } }), true;
        this.error(ctx, e);
      }
      return true;
    }
    return false;
  }

  state(projectId: string, dir: string, project: Project | null): VoiceState {
    const cache = new VoiceCache(dir);
    const idx = cache.read();
    const r = resolveVoices(project?.voiceConfig, idx.profileId, this.store);
    const cur = cache.current(r.voices);
    const job = this.jobs.get(projectId);
    const enc = encodeURIComponent;
    return {
      rev: nextRev(),
      selected: idx.profileId,
      source: r.source,
      missing: r.missing,
      profile: r.profile ? this.store.publicOf(r.profile) : null,
      voices: r.voices,
      narrator: r.narrator,
      roles: r.roles,
      clips: Object.fromEntries(Object.entries(cur.clips).map(([k, f]) => [k, `/__joplo/p/${enc(projectId)}/voice/clips/${f}`])),
      failures: cur.failures,
      generating: job ? { done: job.done, total: job.total, failed: job.failed } : null,
    };
  }

  /** /__joplo/p/:id/voice[/…]；不认识的路径返回 false。 */
  async handleProject(projectId: string, dir: string, project: Project | null, rest: string, req: http.IncomingMessage, res: http.ServerResponse, ctx: Ctx): Promise<boolean> {
    const method = req.method ?? 'GET';
    if (rest === '' && method === 'GET') return ctx.send(200, this.state(projectId, dir, project)), true;
    if (rest === '' && method === 'PUT') {
      if (!ctx.guardWrite()) return true;
      const b = await ctx.jsonBody();
      if (!b.ok) return true;
      const id = (b.body as { profileId?: unknown })?.profileId;
      if (id !== null && (typeof id !== 'string' || !this.store.get(id))) return ctx.send(400, { error: { code: 'USAGE', message: `Unknown voice profile: ${String(id)}` } }), true;
      new VoiceCache(dir).select(id);
      const st = this.state(projectId, dir, project);
      this.opts.emit(projectId, st);
      return ctx.send(200, st), true;
    }
    if (rest === 'generate' && method === 'POST') {
      if (!ctx.guardWrite()) return true;
      const b = await ctx.jsonBody();
      if (!b.ok) return true;
      const body = (b.body ?? {}) as { locale?: unknown; segments?: unknown };
      const segs = Array.isArray(body.segments) ? body.segments : null;
      const ok = segs && segs.length <= MAX_SEGMENTS && segs.every((s: Segment) => s && typeof s.stepId === 'string' && typeof s.text === 'string' && s.text.length <= MAX_TEXT && (s.role === null || typeof s.role === 'string'));
      if (!ok) return ctx.send(400, { error: { code: 'USAGE', message: `segments must be up to ${MAX_SEGMENTS} items of { stepId, text, role }` } }), true;
      if (this.jobs.has(projectId)) return ctx.send(409, { error: { code: 'BUSY', message: 'Narration is already being generated for this project' } }), true;
      const cache = new VoiceCache(dir);
      const resolved = resolveVoices(project?.voiceConfig, cache.read().profileId, this.store);
      const job = { done: 0, total: segs!.length, failed: 0, abort: new AbortController() };
      this.jobs.set(projectId, job);
      let summary: GenerateSummary;
      try {
        summary = await cache.generate(segs as Segment[], typeof body.locale === 'string' ? body.locale.slice(0, 20) : 'en', resolved, this.store, {
          fetch: this.opts.fetch,
          signal: job.abort.signal,
          inflight: this.inflightOf(projectId),
          onProgress: (done, total, failed) => {
            Object.assign(job, { done, total, failed });
            this.opts.emit(projectId, this.state(projectId, dir, project));
          },
        });
      } finally {
        this.jobs.delete(projectId);
      }
      const st = this.state(projectId, dir, project);
      this.opts.emit(projectId, st);
      return ctx.send(200, { summary, state: st }), true;
    }
    if (rest === 'clip' && method === 'POST') {
      // 边放边生成：播放到这一步（或预取后面几步）时只生成这一段；同一段同时只生成一次
      if (!ctx.guardWrite()) return true;
      const b = await ctx.jsonBody();
      if (!b.ok) return true;
      const body = (b.body ?? {}) as { locale?: unknown; segment?: Segment };
      const seg = body.segment;
      if (!seg || typeof seg.stepId !== 'string' || typeof seg.text !== 'string' || seg.text.length > MAX_TEXT || (seg.role !== null && typeof seg.role !== 'string')) return ctx.send(400, { error: { code: 'USAGE', message: 'segment must be { stepId, text, role }' } }), true;
      const cache = new VoiceCache(dir);
      const resolved = resolveVoices(project?.voiceConfig, cache.read().profileId, this.store);
      const plan = cache.plan(seg, resolved);
      if (!plan) return ctx.send(400, { error: { code: 'INVALID', message: 'No voice provider is selected for this project' } }), true;
      const p = cache.generateOne(seg, typeof body.locale === 'string' ? body.locale.slice(0, 20) : 'en', resolved, this.store, { fetch: this.opts.fetch, inflight: this.inflightOf(projectId) });
      try {
        const r = await p;
        if (r.generated) this.opts.emit(projectId, this.state(projectId, dir, project));
        return ctx.send(200, { key: r.key, url: `/__joplo/p/${encodeURIComponent(projectId)}/voice/clips/${r.file}` }), true;
      } catch (e) {
        this.opts.emit(projectId, this.state(projectId, dir, project));
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
