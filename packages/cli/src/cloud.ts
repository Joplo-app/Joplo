import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { openSync, closeSync } from 'node:fs';
import { trackTemporary } from './cloud-cleanup.ts';
import { chmod, mkdir, open, readFile, readdir, rename, rm, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { createInterface } from 'node:readline/promises';
import { JoploError } from '@joplo-app/core';
import type { check } from './check.ts';
import { CloudError, sizeError, terminalText, type CloudCode, type SizeDetails } from './cloud-error.ts';

export type Credentials = { server: string; accessToken: string; user: { id: string; email: string }; createdAt: string };
export type Account = { user: { id: string; email: string; name: string }; plan: 'free' | 'pro'; limits: { maxUploadBytes: number; maxTotalBytes: number; maxFiles: number; publishesPerHour: number | null } };
/** 可替换时钟与系统边界；只有交互式跨服务器替换凭证时才读取确认输入。 */
export type CloudDependencies = {
  env?: NodeJS.ProcessEnv; format?: string; interactive?: boolean; confirm?: (question: string) => Promise<boolean>; openBrowser?: (url: string) => Promise<boolean>;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<unknown>; now?: () => number; check?: typeof check;
};
export const object = (v: unknown): Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
export const nonempty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
export function serverUrl(value: string): string {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error();
    return url.origin;
  } catch { throw new JoploError('USAGE', '--server / JOPLO_CLOUD_URL must be an HTTP(S) origin without credentials, paths, or query parameters'); }
}
export function httpUrl(value: unknown): string {
  if (!nonempty(value)) throw new CloudError('INVALID_RESPONSE');
  try { const u = new URL(value); if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) throw new Error(); return u.href; }
  catch { throw new CloudError('INVALID_RESPONSE'); }
}

/** 与 server/home.ts 的 settings.json 目录解析一致；无需为读取凭证加载 server。 */
export function credentialsHome(env: NodeJS.ProcessEnv): string {
  return env.JOPLO_HOME?.trim() ? resolve(env.JOPLO_HOME) : join(homedir(), '.joplo');
}
export async function atomicJson(file: string, value: unknown): Promise<void> {
  const temp = `${file}.${randomUUID()}.tmp`;
  await mkdir(join(file, '..'), { recursive: true });
  let release = () => {};
  try {
    // 先同步独占创建并登记，再异步写入；中断时已知临时路径一定存在。
    const fd = openSync(temp, 'wx', 0o600);
    release = trackTemporary(temp); closeSync(fd);
    const handle = await open(temp, 'r+');
    try { await handle.chmod(0o600); await handle.writeFile(JSON.stringify(value, null, 2) + '\n'); await handle.sync(); }
    finally { await handle.close(); }
    await rename(temp, file);
  } finally { try { await rm(temp, { force: true }); } finally { release(); } }
}
export async function writeCredentials(home: string, credentials: Credentials): Promise<void> {
  await mkdir(home, { recursive: true, mode: 0o700 });
  await atomicJson(join(home, 'credentials.json'), credentials);
}

/** 原型方案 A/B 的唯一切换点：目前打开预填验证码的方案 A。 */
export const browserLoginUrl = (code: { verification_uri: string; verification_uri_complete: string }) => code.verification_uri_complete;
export async function openBrowser(url: string, platform = process.platform): Promise<boolean> {
  const command = platform === 'darwin' ? 'open' : platform === 'win32' ? 'rundll32' : 'xdg-open';
  const args = platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url];
  return new Promise(resolve => {
    const child = spawn(command, args, { stdio: 'ignore', windowsHide: true, timeout: 5000 });
    child.once('error', () => resolve(false)); child.once('close', code => resolve(code === 0));
  });
}


/** 只读取限额诊断字段，不把远端任意对象/错误正文带入结果信封。 */
function readSizeDetails(value: unknown, token?: string): SizeDetails | undefined {
  const d = object(value);
  const maxBytes = d.maxBytes ?? d.limitBytes;
  const bytes = (n: unknown): n is number => Number.isSafeInteger(n) && Number(n) >= 0;
  if ((d.kind !== 'upload' && d.kind !== 'total' && d.kind !== 'files') || !bytes(maxBytes) || !bytes(d.actualBytes) || !Array.isArray(d.largestFiles)) return;
  const largestFiles: SizeDetails['largestFiles'] = [];
  for (const raw of d.largestFiles.slice(0, 5)) {
    const f = object(raw);
    if (!nonempty(f.path) || f.path.length > 512 || !bytes(f.size) || token && f.path.includes(token)) return;
    largestFiles.push({ path: f.path, size: f.size });
  }
  if (d.kind === 'files') {
    if (!bytes(d.maxFiles) || !bytes(d.actualFiles)) return;
    return { kind: 'files', maxBytes, actualBytes: d.actualBytes, largestFiles, maxFiles: d.maxFiles, actualFiles: d.actualFiles };
  }
  return { kind: d.kind, maxBytes, actualBytes: d.actualBytes, largestFiles,
    ...(bytes(d.maxFiles) ? { maxFiles: d.maxFiles } : {}), ...(bytes(d.actualFiles) ? { actualFiles: d.actualFiles } : {}) };
}

/** 显式自动化标记优先于 TTY，也优先于测试中的 TTY 替身。 */
export function isInteractive(env: NodeJS.ProcessEnv, format = 'text', stdinTTY = process.stdin.isTTY, stdoutTTY = process.stdout.isTTY): boolean {
  const ci = env.CI?.trim().toLowerCase();
  return format !== 'json' && (!ci || ci === '0' || ci === 'false') && env.JOPLO_NONINTERACTIVE !== '1' && Boolean(stdinTTY && stdoutTTY);
}

async function confirmServerSwitch(question: string): Promise<boolean> {
  const input = createInterface({ input: process.stdin, output: process.stderr });
  const controller = new AbortController();
  const cancel = () => controller.abort();
  let onClose = () => {};
  // readline 的 question 在 EOF 时可能永不 settle，必须显式把 close 转为“否”。
  const eof = new Promise<null>(resolve => { onClose = () => resolve(null); input.once('close', onClose); });
  input.once('SIGINT', cancel);
  process.once('SIGINT', cancel);
  try {
    const answer = await Promise.race([input.question(`${terminalText(question)} [y/N] `, { signal: controller.signal }), eof]);
    return answer !== null && /^(y|yes|\u662f)$/i.test(answer.trim());
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new JoploError('USAGE', 'Login cancelled');
    if ((e as NodeJS.ErrnoException).code === 'ERR_USE_AFTER_CLOSE') return false;
    throw e;
  } finally {
    process.off('SIGINT', cancel); input.off('SIGINT', cancel); input.off('close', onClose);
    controller.abort(); input.close();
  }
}

/** Retry-After 可以是秒数或 HTTP 日期，客户端最多等待 30 秒。 */
export function retryAfterMillis(value: string | null, now: number): number | undefined {
  if (!value?.trim()) return;
  const text = value.trim();
  const ms = /^\d+(?:\.\d+)?$/.test(text) ? Number(text) * 1000 : /^[A-Za-z]{3},/.test(text) ? Date.parse(text) - now : NaN;
  return Number.isFinite(ms) ? Math.min(30000, Math.max(0, Math.ceil(ms))) : undefined;
}

function quotaError(value: unknown): CloudError {
  const d = object(value);
  const kind = d.kind === 'publishes' || d.kind === 'reserved_bytes' ? d.kind : undefined;
  const label = kind === 'publishes' ? 'Hourly publications' : kind === 'reserved_bytes' ? 'Hourly reserved bytes' : 'Cloud quota';
  const retryAt = typeof d.retryAt === 'string' && Number.isFinite(Date.parse(d.retryAt)) ? new Date(d.retryAt).toISOString() : undefined;
  const limit = Number.isSafeInteger(d.limit) && Number(d.limit) >= 0 ? Number(d.limit) : undefined;
  const actual = Number.isSafeInteger(d.actual) && Number(d.actual) >= 0 ? Number(d.actual) : undefined;
  const details = { ...(kind ? { kind } : {}), ...(retryAt ? { retryAt } : {}), ...(limit === undefined ? {} : { limit }), ...(actual === undefined ? {} : { actual }) };
  return new CloudError('QUOTA_EXCEEDED', `${label} limit reached${limit === undefined ? '' : ` (limit ${limit}${actual === undefined ? '' : `, actual ${actual}`})`}. ${retryAt ? `Retry at: ${retryAt}` : 'Try again later'}`, details);
}

/** 只有网络异常和 5xx 归为 NETWORK，不能被远端响应体改写成其他类别。 */
function responseCode(status: number, supplied: unknown, authenticated: boolean): CloudCode {
  if (status >= 500 && status <= 599) return 'NETWORK';
  if (status === 401) return authenticated ? 'AUTH_EXPIRED' : 'AUTH_REQUIRED';
  if (status === 403) return supplied === 'PLAN_REQUIRED' ? 'PLAN_REQUIRED' : supplied === 'FORBIDDEN' ? 'ACCOUNT_UNAVAILABLE' : 'FORBIDDEN';
  const expected: Record<string, number> = { PLAN_REQUIRED: 403, QUOTA_EXCEEDED: 429, TOO_LARGE: 413, CLIENT_OUTDATED: 426, BAD_REQUEST: 400, NOT_FOUND: 404, CONFLICT: 409 };
  if (typeof supplied === 'string' && Object.hasOwn(expected, supplied) && expected[supplied] === status) return supplied as CloudCode;
  return (Object.entries(expected).find(([, value]) => value === status)?.[0] as CloudCode | undefined) ?? 'BAD_REQUEST';
}

export class CloudClient {
  readonly server: string;
  readonly home: string;
  readonly env: NodeJS.ProcessEnv;
  readonly interactive: boolean;
  readonly sleep: (ms: number, signal?: AbortSignal) => Promise<unknown>;
  readonly now: () => number;
  constructor(server: string | undefined, readonly version: string, readonly warn: (text: string) => void, readonly rememberSecret: (token: string) => void, readonly deps: CloudDependencies = {}) {
    this.env = deps.env ?? process.env;
    this.server = serverUrl(server ?? (this.env.JOPLO_CLOUD_URL?.trim() || 'https://app.joplo.app'));
    this.home = credentialsHome(this.env);
    this.interactive = isInteractive(this.env, deps.format, deps.interactive ?? process.stdin.isTTY, deps.interactive ?? process.stdout.isTTY);
    this.sleep = deps.sleep ?? ((ms, signal) => sleep(ms, undefined, { signal })); this.now = deps.now ?? Date.now;
  }
  private async storedCredentials(): Promise<Credentials | null> {
    let data: unknown;
    try { data = JSON.parse(await readFile(join(this.home, 'credentials.json'), 'utf8')); }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') this.warn('Cannot read credentials. Run npx joplo login again'); return null; }
    const c = object(data), u = object(c.user);
    if (nonempty(c.accessToken)) this.rememberSecret(c.accessToken);
    let validServer = false;
    try { validServer = typeof c.server === 'string' && serverUrl(c.server) === c.server; } catch { /* 视为损坏 */ }
    if (!validServer || !nonempty(c.accessToken) || /\s/.test(c.accessToken) || !nonempty(u.id) || !nonempty(u.email) || !nonempty(c.createdAt) || !Number.isFinite(Date.parse(c.createdAt))) {
      this.warn('Credentials are invalid. Run npx joplo login again'); return null;
    }
    try {
      if ((await stat(join(this.home, 'credentials.json'))).mode & 0o077) await chmod(join(this.home, 'credentials.json'), 0o600);
    } catch { this.warn('Could not restrict credential permissions. Set them to 0600 manually; continuing with the credentials already read.'); }
    return { server: c.server as string, accessToken: c.accessToken, user: { id: u.id, email: u.email }, createdAt: c.createdAt };
  }
  async credentials(forShare = false): Promise<Credentials | null> {
    const c = await this.storedCredentials();
    if (c && c.server !== this.server) {
      if (!forShare || !this.interactive) {
        const fix = `npx joplo login --server ${this.server}`;
        throw new CloudError('AUTH_REQUIRED', `No credentials for this server. Run ${fix} in your own terminal and confirm replacement`, { fix, credentialServer: c.server });
      }
      return null;
    }
    return c;
  }
  private refuseServerSwitch(server: string): never {
    throw new JoploError('USAGE', `Credentials belong to ${server}. Run joplo login --server ${this.server} in your own terminal and confirm replacement`);
  }
  private async revoke(token: string, server = this.server): Promise<void> {
    // 撤销旧会话必须使用它原来的源，不能让新服务器看到旧 token。
    const target = server === this.server ? this : new CloudClient(server, this.version, this.warn, this.rememberSecret, this.deps);
    const data = await target.request('/api/auth/sign-out', token, {});
    if (data.success !== true) throw new CloudError('INVALID_RESPONSE');
  }
  async logout(): Promise<void> {
    const credentials = await this.storedCredentials();
    if (credentials && credentials.server !== this.server) throw new JoploError('USAGE', 'Credentials belong to another server and were preserved. Use its --server <url> to sign out');
    const entries = await readdir(this.home, { withFileTypes: true }).catch(e => { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []; throw e; });
    for (const entry of entries) if (/^credentials\.json\..+\.tmp$/.test(entry.name) && !entry.isDirectory()) await rm(join(this.home, entry.name), { force: true });
    if (credentials) {
      try {
        // 退出当前 CLI 会话；token 只在 Authorization 中，不进入请求体。
        await this.revoke(credentials.accessToken);
      } catch { this.warn('Could not confirm session revocation. Removing local credentials; revoke the session on the website if needed.'); }
    }
    await rm(join(this.home, 'credentials.json'), { force: true });
  }
  async requireCredentials(): Promise<Credentials> {
    const c = await this.credentials(); if (!c) throw new CloudError('AUTH_REQUIRED', undefined, { fix: 'npx joplo login' }); return c;
  }
  /** 不回显远端错误正文或底层异常：其中可能包含 bearer、签名 URL 或代理回显。 */
  async response(path: string, token?: string, body?: unknown, timeoutMs = 30000): Promise<{ response: Response; data: Record<string, unknown> }> {
    let response: Response;
    try {
      response = await fetch(this.server + path, { method: body === undefined ? 'GET' : 'POST', redirect: 'error', signal: AbortSignal.timeout(Math.max(1, Math.ceil(timeoutMs))),
        headers: { 'X-Joplo-Client': `joplo-cli/${this.version}`, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body) });
    } catch { throw new CloudError('NETWORK'); }
    let data: Record<string, unknown>;
    try { data = object(await response.json()); }
    catch (e) {
      // 已收到 4xx 的请求不能因为其正文截断/无效而变成可重试的网络错误。
      if (!response.ok || e instanceof SyntaxError) data = {};
      else throw new CloudError('NETWORK');
    }
    return { response, data };
  }
  async request(path: string, token?: string, body?: unknown): Promise<Record<string, unknown>> {
    const { response, data } = await this.response(path, token, body);
    if (!response.ok) {
      if (path === '/api/auth/device/code' && response.status === 429) throw new CloudError('RATE_LIMITED');
      const code = responseCode(response.status, data.code, Boolean(token));
      if (code === 'NETWORK') {
        const afterMs = response.status === 503 ? retryAfterMillis(response.headers.get('retry-after'), this.now()) : undefined;
        throw new CloudError(code, undefined, undefined, { afterMs, createSafe: response.status === 503 && data.code === 'SERVICE_UNAVAILABLE' && afterMs !== undefined });
      }
      if (code === 'PLAN_REQUIRED') throw new CloudError(code, `This action requires Pro: ${this.server}/billing`);
      if (code === 'QUOTA_EXCEEDED') throw quotaError(data.data ?? data.details);
      if (code === 'TOO_LARGE') {
        const details = readSizeDetails(data.data ?? data.details, token);
        if (details) throw sizeError(details);
      }
      throw new CloudError(code);
    }
    return data;
  }
  async me(token: string): Promise<Account> {
    const d = await this.request('/api/v1/me', token), u = object(d.user), l = object(d.limits);
    if (!nonempty(u.id) || !nonempty(u.email) || typeof u.name !== 'string' || !['free', 'pro'].includes(String(d.plan)) || !Number.isSafeInteger(l.maxUploadBytes) || Number(l.maxUploadBytes) < 0 || !Number.isSafeInteger(l.maxTotalBytes) || Number(l.maxTotalBytes) < 0 || !Number.isSafeInteger(l.maxFiles) || Number(l.maxFiles) < 1 || !(l.publishesPerHour === null || Number.isSafeInteger(l.publishesPerHour) && Number(l.publishesPerHour) >= 0)) throw new CloudError('INVALID_RESPONSE');
    return { user: { id: u.id, email: u.email, name: u.name }, plan: d.plan as Account['plan'], limits: { maxUploadBytes: l.maxUploadBytes as number, maxTotalBytes: l.maxTotalBytes as number, maxFiles: l.maxFiles as number, publishesPerHour: l.publishesPerHour as number | null } };
  }
  async login(noBrowser = false): Promise<Credentials> {
    const previous = await this.storedCredentials();
    if (previous && previous.server !== this.server) {
      if (!this.interactive) this.refuseServerSwitch(previous.server);
      let confirmed: boolean;
      try { confirmed = await (this.deps.confirm ?? confirmServerSwitch)(`Replace the login for ${previous.server}. Continue?`); }
      catch (e) { if ((e as Error).name === 'AbortError') throw new JoploError('USAGE', 'Login cancelled'); throw e; }
      if (!confirmed) throw new JoploError('USAGE', 'Login cancelled. The existing credentials were preserved');
    }
    this.warn('Requesting browser authorization...');
    const d = await this.request('/api/auth/device/code', undefined, { client_id: 'joplo-cli' });
    if (!nonempty(d.device_code) || typeof d.user_code !== 'string' || !/^[A-Z0-9-]{4,16}$/.test(d.user_code) || typeof d.expires_in !== 'number' || !Number.isFinite(d.expires_in) || d.expires_in <= 0 || d.interval != null && (typeof d.interval !== 'number' || !Number.isFinite(d.interval))) throw new CloudError('INVALID_RESPONSE');
    const verification_uri = httpUrl(d.verification_uri), verification_uri_complete = httpUrl(d.verification_uri_complete);
    if (new URL(verification_uri).origin !== this.server || new URL(verification_uri_complete).origin !== this.server) throw new CloudError('INVALID_RESPONSE');
    const deadline = this.now() + d.expires_in * 1000;
    const url = browserLoginUrl({ verification_uri, verification_uri_complete });
    this.warn(`Confirm login in your browser and verify this code: ${d.user_code}\n${url}`);
    if (!noBrowser && this.interactive && !this.env.SSH_CONNECTION) {
      const opened = await (this.deps.openBrowser ?? openBrowser)(url).catch(() => false);
      this.warn(opened ? 'Browser opened. Waiting for confirmation...' : 'Could not open the browser. Visit the URL above manually. Waiting for confirmation...');
    } else this.warn('Visit the URL above manually. Waiting for browser confirmation...');
    let interval = Math.max((d.interval as number | undefined) ?? 5, 1) * 1000;
    let delay = interval;
    const backoff = () => { delay = Math.min(Math.max(interval, delay * 2), 30000); };
    while (this.now() < deadline) {
      await this.sleep(Math.min(Math.max(interval, Math.min(delay, 30000)), deadline - this.now()));
      if (this.now() >= deadline) break;
      let polled: Awaited<ReturnType<CloudClient['response']>>;
      try {
        polled = await this.response('/api/auth/device/token', undefined, { client_id: 'joplo-cli', device_code: d.device_code, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' }, Math.min(30000, deadline - this.now()));
      } catch (e) { if (!(e instanceof CloudError) || e.code !== 'NETWORK') throw e; backoff(); continue; }
      const { response, data } = polled;
      // 设备协议的 429 是暂停轮询信号，与普通分享请求的 4xx 不重试规则分开。
      if (response.status >= 500 || response.status === 429) {
        const afterMs = response.status === 429 ? retryAfterMillis(response.headers.get('retry-after') ?? response.headers.get('x-retry-after'), this.now()) : undefined;
        if (afterMs === undefined) backoff(); else delay = afterMs;
        continue;
      }
      if (data.error === 'authorization_pending' && response.status === 400) { delay = interval; continue; }
      if (data.error === 'slow_down' && response.status === 400) { interval += 5000; delay = interval; continue; }
      if (data.error === 'access_denied') throw new CloudError('AUTH_DENIED');
      if (data.error === 'expired_token' || data.error === 'invalid_grant') throw new CloudError('AUTH_EXPIRED');
      if (!response.ok || !nonempty(data.access_token) || /\s/.test(data.access_token)) throw new CloudError('INVALID_RESPONSE');
      this.rememberSecret(data.access_token);
      try {
        const account = await this.me(data.access_token);
        const credentials = { server: this.server, accessToken: data.access_token, user: { id: account.user.id, email: account.user.email }, createdAt: new Date().toISOString() };
        await writeCredentials(this.home, credentials);
        if (previous && (previous.server !== this.server || previous.accessToken !== credentials.accessToken)) {
          try { await this.revoke(previous.accessToken, previous.server); }
          catch { this.warn('New login saved, but the old session could not be confirmed revoked. Revoke it on the website if needed.'); }
        }
        return credentials;
      } catch (e) {
        // token 已签发但登录尚未落盘；尽力回收会话，保留原始失败原因。
        try { await this.revoke(data.access_token); } catch { this.warn('Login incomplete; session revocation could not be confirmed. Revoke it on the website if needed.'); }
        throw e;
      }
    }
    throw new CloudError('AUTH_EXPIRED', 'The verification code expired. Run npx joplo login again');
  }
  async retry<T>(action: () => Promise<T>, options: { create?: boolean; signal?: AbortSignal } = {}): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      options.signal?.throwIfAborted();
      try { return await action(); }
      catch (e) {
        options.signal?.throwIfAborted();
        if (!(e instanceof CloudError) || e.code !== 'NETWORK' || options.create && !e.retry?.createSafe || attempt >= 3) throw e;
        // 上传共享 signal 同时中止在途 fetch 和重试等待；睡醒后再次检查才可发请求。
        options.signal?.throwIfAborted();
        await this.sleep(e.retry?.afterMs ?? 1000 * 2 ** attempt, options.signal);
        options.signal?.throwIfAborted();
      }
    }
  }
}
