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

export type CloudAccount =
  | { signedIn: true; server: string; email: string; plan: 'free' | 'pro' | null }
  | { signedIn: false; server: string; loginCommand: string; message?: string };

/** 范围：都为空 = 整个项目（D75）。 */
export type CloudPublishRequest = { scenarios?: string[]; features?: string[] };

export type CloudPublishResult = { shareId: string; url: string; expiresAt: string | null; version: number; plan: 'free' | 'pro'; scope?: ScopeInfo };

/** CLI 实现：account 只读本机登录（必要时问一次云端套餐）；publish 就是 share()，progress 是它写给终端的每一行。 */
export type CloudBridge = {
  account(): Promise<CloudAccount>;
  publish(projectDir: string, request: CloudPublishRequest, progress: (line: string) => void): Promise<CloudPublishResult>;
};

/** 发布失败：code 来自 CLI（AUTH_REQUIRED、NOT_FOUND、NETWORK…）；需要登录时带 loginCommand。 */
export type CloudJobError = { code: string; message: string; loginCommand?: string };

export type CloudJob = {
  id: string;
  state: 'running' | 'done' | 'failed';
  request: CloudPublishRequest;
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
      const body = (b.body ?? {}) as { scenarios?: unknown; features?: unknown };
      const scenarios = strings(body.scenarios, 'scenarios');
      const features = strings(body.features, 'features');
      request = { ...(scenarios?.length ? { scenarios } : {}), ...(features?.length ? { features } : {}) };
    } catch (e) {
      return ctx.send(400, { error: { code: 'USAGE', message: e instanceof Error ? e.message : String(e) } }), true;
    }
    const running = this.jobs.get(projectId);
    if (running?.state === 'running') return ctx.send(200, { job: running }), true;
    ctx.send(202, { job: this.start(projectId, dir, request) });
    return true;
  }

  private start(projectId: string, dir: string, request: CloudPublishRequest): CloudJob {
    const job: CloudJob = { id: `c${++this.seq}`, state: 'running', request, startedAt: Date.now(), lines: [] };
    this.jobs.set(projectId, job);
    const push = () => this.emit(projectId, job);
    push();
    void this.bridge!
      .publish(dir, request, (line) => {
        job.lines = [...job.lines, line].slice(-MAX_LINES);
        push();
      })
      .then((result) => {
        job.state = 'done';
        job.result = result;
      })
      .catch((e: unknown) => {
        const err = e as { code?: unknown; message?: unknown; loginCommand?: unknown };
        job.state = 'failed';
        job.error = {
          code: typeof err.code === 'string' ? err.code : 'INTERNAL',
          message: typeof err.message === 'string' ? err.message : String(e),
          ...(typeof err.loginCommand === 'string' ? { loginCommand: err.loginCommand } : {}),
        };
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
