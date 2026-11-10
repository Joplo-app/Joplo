/**
 * 看板直接发布到云端（D76）。云端能力（登录、构建、上传）在 CLI 里，由 `joplo dev` 启动看板时注入（CloudBridge）；
 * 看板只转发请求、记录发布任务、把进度推给页面。令牌只在本机进程里，页面只拿到账号邮箱和套餐。
 *
 * 数据流：
 * - 账号：`GET /__joplo/cloud/account`（本机令牌）→ bridge.account() → 浮层的“已登录 / 需要登录（可复制的登录命令）”。
 * - 发布：`POST /__joplo/p/<id>/cloud/publish`（令牌 + Origin + JSON，body = 范围）→ bridge.publish()（即 CLI 的 share()）
 *   → 任务状态（running → done / failed）存在 CloudHub，变化时推 `joplo:cloud`；`GET …/cloud/publish` 读当前任务。
 * - 同一项目同时只有一个发布任务：再次 POST 返回正在进行的那个，不另起。
 * - 旧版 CLI 启动的看板没有 bridge：account 返回 available: false，页面禁用这一项并提示重启 joplo dev。
 */
import type http from 'node:http';
import type { ScopeInfo } from '@joplo-app/core';

export const CLOUD_EVENT = 'joplo:cloud';

export type CloudVisibility = 'public' | 'private';
export type CloudPortfolio = { workUrl: string | null; profileUrl: string | null; needsUsername: boolean; setupPath: string };
export type CloudLinks = { main: { visibility?: CloudVisibility; passwordProtected?: boolean } | null; scoped?: Record<string, { visibility?: CloudVisibility; passwordProtected?: boolean }> };
export type CloudAccount =
  | {
      signedIn: true;
      server: string;
      email: string;
      plan: 'free' | 'pro' | null;
      /** 账号容量（C27）；云端连不上或旧云端时没有。 */
      storage?: CloudStorage;
      /** 托管朗读额度（D85，`GET /api/v1/voice` 的 quota）；云端连不上或旧云端（404）时没有。 */
      voice?: VoiceQuota;
      username?: string | null;
      portfolioUrl?: string | null;
    }
  | { signedIn: false; server: string; loginCommand: string; message?: string };

/** 托管朗读额度（D85，与 Cloud 契约 `GET /api/v1/voice` 的 quota 一致）：免费是一次性的体验额度（trial），Pro 按月（month）。字数 = Array.from(文字).length。 */
export type VoiceQuota = {
  plan: string;
  period: 'trial' | 'month';
  allowanceChars: number;
  usedChars: number;
  remainingChars: number;
  /** 本月额度的重置时间（ISO）；体验额度为 null。 */
  resetsAt: string | null;
  /** 加油包：各自剩余与到期时间。 */
  packs: { remainingChars: number; expiresAt: string }[];
  /** 当月（或体验）剩余 + 加油包剩余。看板与 CLI 显示的“剩 N 字”就是它。 */
  totalRemainingChars: number;
};
/** Joplo 音色（Cloud 固定 6 个，都是多语言）：labels / samples 按界面语言（10 种之一）。 */
export type CloudVoice = { id: string; gender: 'female' | 'male'; labels: Record<string, string>; samples: Record<string, string> };
/** `GET /api/v1/voice` 去掉 quota 之后的部分：音色表、每种语言的推荐音色、默认音色。 */
export type CloudVoiceCatalog = { model: string; voices: CloudVoice[]; recommended: Record<string, string[]>; defaultVoice: string };
export type CloudVoiceInfo = CloudVoiceCatalog & { quota: VoiceQuota };
/**
 * 托管朗读的状态：没登录时给登录命令；已登录时 voice 是 `GET /api/v1/voice` 的内容，云端连不上或旧云端（404）时为 null（看板退回浏览器朗读）。
 */
export type CloudVoiceStatus =
  | { signedIn: false; server: string; loginCommand: string }
  | { signedIn: true; server: string; voice: CloudVoiceInfo | null };
/** `POST /api/v1/voice/speech` 的请求：locale 是内容语言（D84，不知道时不带），project 是项目名（控制台明细用）。 */
export type CloudSpeechRequest = { text: string; voice: string; locale?: string; project?: string };
/** 合成结果：音频与响应头（X-Joplo-Chars-Charged / -Remaining、X-Joplo-Cache、X-Joplo-Audio-Sha256），头缺失或不合法时为 null。 */
export type CloudSpeechResult = { audio: Uint8Array; contentType: string; charged: number | null; remaining: number | null; cache: 'hit' | 'miss' | null; sha256: string | null };
/**
 * 托管朗读（D85）的 CLI 一侧：看板与 `joplo voice` 共用。server 包不依赖 CLI，由 CLI 注入（与 publish 一样）。
 * speech 失败时抛 `{ code, message, data? }`：TTS_QUOTA_EXCEEDED（data: neededChars / remainingChars / usageUrl）、AUTH_REQUIRED、AUTH_EXPIRED、
 * EMAIL_UNVERIFIED、FORBIDDEN、RATE_LIMITED、TTS_UNAVAILABLE、BAD_REQUEST、NOT_FOUND（旧云端）、NETWORK。
 */
export type CloudVoiceBridge = {
  status(): Promise<CloudVoiceStatus>;
  speech(req: CloudSpeechRequest): Promise<CloudSpeechResult>;
};
/** 账号容量（C27）：已用 / 上限，字节。 */
export type CloudStorage = { usedBytes: number; quotaBytes: number };
/** 容量不足（QUOTA_EXCEEDED，kind: storage）：数字可能缺；两个链接已拼好当前 server。 */
export type CloudStorageFull = { usedBytes?: number; quotaBytes?: number; shareBytes?: number; replacedBytes?: number; manageUrl: string; upgradeUrl: string };

/** 范围：都为空 = 整个项目（D75）。 */
export type CloudPublishRequest = { password?: string | null; visibility?: CloudVisibility; review?: boolean; scenarios?: string[]; entryIds?: string[] };

export type CloudPublishResult = { passwordProtected?: boolean; mode?: 'review'; visibility?: CloudVisibility; portfolio?: CloudPortfolio; review?: { url: string; shareId: string }; shareId: string; url: string; expiresAt: string | null; version: number; plan: 'free' | 'pro'; scope?: ScopeInfo; /** 发布后的账号容量与这次大小（C27）。 */ storage?: CloudStorage & { shareBytes: number } };

/** CLI 实现：account 只读本机登录（必要时问一次云端套餐）；publish 就是 share()，progress 是它写给终端的每一行。 */
export type CloudBridge = {
  account(): Promise<CloudAccount>;
  links?(projectDir: string): Promise<CloudLinks>;
  publish(projectDir: string, request: CloudPublishRequest, progress: (line: string) => void): Promise<CloudPublishResult>;
  /** 托管朗读（D85）；旧 CLI 没有这一项时看板只用浏览器朗读与自带 Key 的供应商。 */
  voice?: CloudVoiceBridge;
};

/** 发布失败：code 来自 CLI（AUTH_REQUIRED、NOT_FOUND、NETWORK…）；需要登录时带 loginCommand。 */
export type CloudJobError = { code: string; message: string; loginCommand?: string; upgradeUrl?: string; /** 容量不足时的数字与链接（C27）。 */ storage?: CloudStorageFull };

export type CloudJob = {
  id: string;
  state: 'running' | 'done' | 'failed';
  request: Omit<CloudPublishRequest, 'password'>;
  startedAt: number;
  /** 进度：CLI 写给终端的行（英文，页面按开头识别阶段）。 */
  lines: string[];
  result?: CloudPublishResult;
  error?: CloudJobError;
};

type Ctx = {
  guardWrite: (needJson?: boolean) => boolean;
  jsonBody: () => Promise<{ ok: true; body: unknown } | { ok: false }>;
  send: (status: number, body: unknown) => void;
};

const MAX_LINES = 40;
const strings = (v: unknown, name: string): string[] | undefined => {
  if (v === undefined) return undefined;
  if (!Array.isArray(v) || v.length > 200 || v.some((x) => typeof x !== 'string' || !x || x.length > 512)) throw new Error(`${name} must be an array of non-empty strings`);
  return v as string[];
};

export class CloudHub {
  private jobs = new Map<string, CloudJob>();
  private seq = 0;
  constructor(
    private readonly bridge: CloudBridge | undefined,
    private readonly emit: (projectId: string, job: CloudJob) => void,
  ) {}

  get available(): boolean {
    return !!this.bridge;
  }

  /** `/__joplo/cloud/<sub>`：sub = 'account'。 */
  async handleGlobal(sub: string, req: http.IncomingMessage, ctx: Ctx): Promise<boolean> {
    if (sub !== 'account' || (req.method ?? 'GET') !== 'GET') return false;
    if (!ctx.guardWrite(false)) return true;
    if (!this.bridge) return ctx.send(200, { available: false }), true;
    try {
      ctx.send(200, { available: true, account: await this.bridge.account() });
    } catch (e) {
      ctx.send(500, { error: { code: 'INTERNAL', message: e instanceof Error ? e.message : String(e) } });
    }
    return true;
  }

  /** `/__joplo/p/<id>/cloud/<sub>`：sub = 'publish'（GET 读任务，POST 开始发布）。 */
  async handleProject(projectId: string, dir: string, sub: string, req: http.IncomingMessage, ctx: Ctx): Promise<boolean> {
    if (sub === 'links' && req.method === 'GET') {
      if (!ctx.guardWrite(false)) return true;
      ctx.send(200, { links: await this.bridge?.links?.(dir) ?? { main: null } });
      return true;
    }
    if (sub !== 'publish') return false;
    const method = req.method ?? 'GET';
    if (method === 'GET') {
      if (!ctx.guardWrite(false)) return true;
      ctx.send(200, { available: this.available, job: this.jobs.get(projectId) ?? null });
      return true;
    }
    if (method !== 'POST') return false;
    if (!ctx.guardWrite()) return true;
    if (!this.bridge) return ctx.send(409, { error: { code: 'UNSUPPORTED_ACTION', message: 'This board process cannot publish to the cloud. Stop it and run joplo dev again' } }), true;
    const b = await ctx.jsonBody();
    if (!b.ok) return true;
    let request: CloudPublishRequest;
    try {
      const body = (b.body ?? {}) as { scenarios?: unknown; entryIds?: unknown; visibility?: unknown; review?: unknown; password?: unknown };
      const scenarios = strings(body.scenarios, 'scenarios');
      const entryIds = strings(body.entryIds, 'entryIds');
      if (body.visibility !== 'public' && body.visibility !== 'private') throw new Error('Choose visibility: public / private');
      if (typeof body.review !== 'boolean') throw new Error('Choose review: true / false');
      if (body.visibility === 'public' && (scenarios?.length || entryIds?.length)) throw new Error('Scoped shares must be private');
      if (body.password !== undefined) {
        if (body.visibility !== 'private') throw new Error('Passwords require a private share');
        if (body.password !== null && (typeof body.password !== 'string' || Array.from(body.password).length < 8 || Array.from(body.password).length > 128)) throw new Error('Access password must contain 8–128 characters');
      }
      request = { ...(body.password !== undefined ? { password: body.password as string | null } : {}), visibility: body.visibility, review: body.review, ...(scenarios?.length ? { scenarios } : {}), ...(entryIds?.length ? { entryIds } : {}) };
    } catch (e) {
      return ctx.send(400, { error: { code: 'USAGE', message: e instanceof Error ? e.message : String(e) } }), true;
    }
    const running = this.jobs.get(projectId);
    if (running?.state === 'running') return ctx.send(200, { job: running }), true;
    ctx.send(202, { job: this.start(projectId, dir, request) });
    return true;
  }

  private start(projectId: string, dir: string, request: CloudPublishRequest): CloudJob {
    const { password, ...safeRequest } = request;
    const redact = (text: string) => typeof password === 'string' && password ? text.split(password).join('[REDACTED]') : text;
    const safe = <T,>(value: T): T => JSON.parse(JSON.stringify(value, (_key, v: unknown) => typeof v === 'string' ? redact(v) : v)) as T;
    const job: CloudJob = { id: `c${++this.seq}`, state: 'running', request: safe(safeRequest), startedAt: Date.now(), lines: [] };
    this.jobs.set(projectId, job);
    const push = () => this.emit(projectId, job);
    push();
    void this.bridge!
      .publish(dir, request, (line) => {
        job.lines = [...job.lines, redact(line)].slice(-MAX_LINES);
        push();
      })
      .then((result) => {
        job.state = 'done';
        job.result = safe(result);
      })
      .catch((e: unknown) => {
        const err = e as { code?: unknown; message?: unknown; loginCommand?: unknown; storage?: unknown; upgradeUrl?: unknown };
        job.state = 'failed';
        job.error = safe({
          code: typeof err.code === 'string' ? err.code : 'INTERNAL',
          message: typeof err.message === 'string' ? err.message : String(e),
          ...(typeof err.loginCommand === 'string' ? { loginCommand: err.loginCommand } : {}),
          ...(err.storage && typeof err.storage === 'object' ? { storage: err.storage as CloudStorageFull } : {}),
          ...(typeof err.upgradeUrl === 'string' ? { upgradeUrl: err.upgradeUrl } : {}),
        });
      })
      .finally(push);
    return job;
  }

  /** 测试：等当前任务结束。 */
  async settled(projectId: string): Promise<CloudJob | null> {
    for (let i = 0; i < 2000; i++) {
      const j = this.jobs.get(projectId);
      if (!j || j.state !== 'running') return j ?? null;
      await new Promise((r) => setTimeout(r, 5));
    }
    return this.jobs.get(projectId) ?? null;
  }
}
