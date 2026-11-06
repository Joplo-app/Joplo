import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { JoploError } from '@joplo-app/core';
import type { check } from './check.ts';
import { CLOUD_MESSAGES, CloudError, sizeError, type CloudCode, type SizeDetails } from './cloud-error.ts';

export type Credentials = { server: string; accessToken: string; user: { id: string; email: string }; createdAt: string };
export type Account = { user: { id: string; email: string; name: string }; plan: 'free' | 'pro'; limits: { maxUploadBytes: number; maxTotalBytes: number; maxFiles: number; publishesPerHour: number | null } };
/** 可替换时钟与系统边界供测试使用；生产默认不读 stdin、不提示输入。 */
export type CloudDependencies = {
  env?: NodeJS.ProcessEnv; interactive?: boolean; openBrowser?: (url: string) => Promise<boolean>;
  sleep?: (ms: number) => Promise<unknown>; now?: () => number; check?: typeof check;
};
export const object = (v: unknown): Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
export const nonempty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
export function serverUrl(value: string): string {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error();
    return url.origin;
  } catch { throw new JoploError('USAGE', '--server / JOPLO_CLOUD_URL 必须是完整的 HTTP(S) 源地址（不含用户名、密码、路径或查询参数）'); }
}
export function httpUrl(value: unknown): string {
  if (!nonempty(value)) throw new CloudError('INVALID_RESPONSE');
  try { const u = new URL(value); if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) throw new Error(); return value; }
  catch { throw new CloudError('INVALID_RESPONSE'); }
}

/** 与 server/home.ts 的 settings.json 目录解析一致；无需为读取凭证加载 server。 */
export function credentialsHome(env: NodeJS.ProcessEnv): string {
  return env.JOPLO_HOME?.trim() ? resolve(env.JOPLO_HOME) : join(homedir(), '.joplo');
}
export async function atomicJson(file: string, value: unknown): Promise<void> {
  const temp = `${file}.${randomUUID()}.tmp`;
  await mkdir(join(file, '..'), { recursive: true });
  try {
    const handle = await open(temp, 'wx', 0o600);
    try { await handle.chmod(0o600); await handle.writeFile(JSON.stringify(value, null, 2) + '\n'); await handle.sync(); }
    finally { await handle.close(); }
    await rename(temp, file);
  } finally { await rm(temp, { force: true }); }
}
export const writeCredentials = (home: string, credentials: Credentials) => atomicJson(join(home, 'credentials.json'), credentials);

/** 原型方案 A/B 的唯一切换点：目前打开预填验证码的方案 A。 */
export const browserLoginUrl = (code: { verification_uri: string; verification_uri_complete: string }) => code.verification_uri_complete;
export async function openBrowser(url: string, platform = process.platform): Promise<boolean> {
  const command = platform === 'darwin' ? 'open' : platform === 'win32' ? 'cmd.exe' : 'xdg-open';
  // Windows 的 start 是 cmd 内建命令；URL 经过校验，拒绝 shell 元字符，避免命令注入。
  if (platform === 'win32' && /["%\r\n&|<>^]/.test(url)) return false;
  const args = platform === 'win32' ? ['/d', '/s', '/c', `start "" "${url}"`] : [url];
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
  if ((d.kind !== 'upload' && d.kind !== 'total') || !bytes(maxBytes) || !bytes(d.actualBytes) || !Array.isArray(d.largestFiles)) return;
  const largestFiles: SizeDetails['largestFiles'] = [];
  for (const raw of d.largestFiles.slice(0, 5)) {
    const f = object(raw);
    if (!nonempty(f.path) || f.path.length > 512 || !bytes(f.size) || token && f.path.includes(token)) return;
    largestFiles.push({ path: f.path, size: f.size });
  }
  return { kind: d.kind, maxBytes, actualBytes: d.actualBytes, largestFiles,
    ...(bytes(d.maxFiles) ? { maxFiles: d.maxFiles } : {}), ...(bytes(d.actualFiles) ? { actualFiles: d.actualFiles } : {}) };
}

export class CloudClient {
  readonly server: string;
  readonly home: string;
  readonly env: NodeJS.ProcessEnv;
  readonly interactive: boolean;
  readonly sleep: (ms: number) => Promise<unknown>;
  readonly now: () => number;
  constructor(server: string | undefined, readonly version: string, readonly warn: (text: string) => void, readonly rememberSecret: (token: string) => void, readonly deps: CloudDependencies = {}) {
    this.env = deps.env ?? process.env;
    this.server = serverUrl(server ?? this.env.JOPLO_CLOUD_URL ?? 'https://app.joplo.app');
    this.home = credentialsHome(this.env);
    this.interactive = deps.interactive ?? Boolean(process.stdin.isTTY && process.stdout.isTTY);
    this.sleep = deps.sleep ?? sleep; this.now = deps.now ?? Date.now;
  }
  private async storedCredentials(): Promise<Credentials | null> {
    let data: unknown;
    try { data = JSON.parse(await readFile(join(this.home, 'credentials.json'), 'utf8')); }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') this.warn('凭证无法读取，请重新运行 npx joplo login'); return null; }
    const c = object(data), u = object(c.user);
    if (nonempty(c.accessToken)) this.rememberSecret(c.accessToken);
    let validServer = false;
    try { validServer = typeof c.server === 'string' && serverUrl(c.server) === c.server; } catch { /* 视为损坏 */ }
    if (!validServer || !nonempty(c.accessToken) || /\s/.test(c.accessToken) || !nonempty(u.id) || !nonempty(u.email) || !nonempty(c.createdAt) || !Number.isFinite(Date.parse(c.createdAt))) {
      this.warn('凭证已损坏，请重新运行 npx joplo login'); return null;
    }
    return { server: c.server as string, accessToken: c.accessToken, user: { id: u.id, email: u.email }, createdAt: c.createdAt };
  }
  async credentials(): Promise<Credentials | null> {
    const c = await this.storedCredentials();
    if (c && c.server !== this.server) { this.warn('当前服务器没有登录凭证，请运行 npx joplo login --server <url>'); return null; }
    return c;
  }
  async logout(): Promise<void> {
    const credentials = await this.storedCredentials();
    if (credentials && credentials.server !== this.server) throw new CloudError('AUTH_REQUIRED', '凭证属于其他服务器，未删除。请使用对应的 --server <url> 退出登录');
    if (credentials) {
      try {
        // 退出当前 CLI 会话；token 只在 Authorization 中，不进入请求体。
        const data = await this.request('/api/auth/sign-out', credentials.accessToken, {});
        if (data.success !== true) throw new CloudError('INVALID_RESPONSE');
      } catch { this.warn('未能确认云端会话已吊销，将删除本地凭证；可在网页设备管理中撤销会话。'); }
    }
    await rm(join(this.home, 'credentials.json'), { force: true });
  }
  async requireCredentials(): Promise<Credentials> {
    const c = await this.credentials(); if (!c) throw new CloudError('AUTH_REQUIRED', undefined, { fix: 'npx joplo login' }); return c;
  }
  /** 不回显远端错误正文或底层异常：其中可能包含 bearer、签名 URL 或代理回显。 */
  async response(path: string, token?: string, body?: unknown): Promise<{ response: Response; data: Record<string, unknown> }> {
    try {
      const response = await fetch(this.server + path, { method: body === undefined ? 'GET' : 'POST', redirect: 'error', signal: AbortSignal.timeout(30000),
        headers: { 'X-Joplo-Client': `joplo-cli/${this.version}`, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body) });
      const data = object(await response.json().catch(e => { if (e instanceof SyntaxError) return null; throw e; }));
      return { response, data };
    } catch { throw new CloudError('NETWORK'); }
  }
  async request(path: string, token?: string, body?: unknown): Promise<Record<string, unknown>> {
    const { response, data } = await this.response(path, token, body);
    if (!response.ok) {
      const statusCode = ({ 401: token ? 'AUTH_EXPIRED' : 'AUTH_REQUIRED', 403: 'PLAN_REQUIRED', 413: 'TOO_LARGE', 429: 'QUOTA_EXCEEDED', 426: 'CLIENT_OUTDATED', 503: 'NETWORK' } as Record<number, CloudCode>)[response.status];
      const code: CloudCode = response.status === 401 ? statusCode! : typeof data.code === 'string' && Object.hasOwn(CLOUD_MESSAGES, data.code) ? data.code as CloudCode : statusCode ?? 'BAD_REQUEST';
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
    this.warn('正在申请浏览器登录…');
    const d = await this.request('/api/auth/device/code', undefined, { client_id: 'joplo-cli' });
    if (!nonempty(d.device_code) || !nonempty(d.user_code) || typeof d.expires_in !== 'number' || !Number.isFinite(d.expires_in) || d.expires_in <= 0 || typeof d.interval !== 'number' || !Number.isFinite(d.interval) || d.interval <= 0) throw new CloudError('INVALID_RESPONSE');
    const verification_uri = httpUrl(d.verification_uri), verification_uri_complete = httpUrl(d.verification_uri_complete);
    if (new URL(verification_uri).origin !== this.server || new URL(verification_uri_complete).origin !== this.server) throw new CloudError('INVALID_RESPONSE');
    const deadline = this.now() + d.expires_in * 1000;
    const url = browserLoginUrl({ verification_uri, verification_uri_complete });
    this.warn(`请在浏览器中确认登录，核对验证码：${d.user_code}\n${url}`);
    if (!noBrowser && this.interactive && !this.env.SSH_CONNECTION) {
      const opened = await (this.deps.openBrowser ?? openBrowser)(url).catch(() => false);
      this.warn(opened ? '已打开浏览器，等待确认…' : '无法自动打开浏览器，请手动访问上面的网址。等待确认…');
    } else this.warn('请手动访问上面的网址。等待浏览器确认…');
    let interval = d.interval * 1000;
    while (this.now() < deadline) {
      await this.sleep(Math.min(interval, deadline - this.now()));
      if (this.now() >= deadline) break;
      const { response, data } = await this.response('/api/auth/device/token', undefined, { client_id: 'joplo-cli', device_code: d.device_code, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' });
      if (data.error === 'authorization_pending') continue;
      if (data.error === 'slow_down') { interval += 5000; continue; }
      if (data.error === 'access_denied') throw new CloudError('AUTH_DENIED');
      if (data.error === 'expired_token' || data.error === 'invalid_grant') throw new CloudError('AUTH_EXPIRED');
      if (!response.ok || !nonempty(data.access_token) || /\s/.test(data.access_token)) throw new CloudError(response.status >= 500 ? 'NETWORK' : 'INVALID_RESPONSE');
      this.rememberSecret(data.access_token);
      const account = await this.me(data.access_token);
      const credentials = { server: this.server, accessToken: data.access_token, user: { id: account.user.id, email: account.user.email }, createdAt: new Date().toISOString() };
      await writeCredentials(this.home, credentials);
      return credentials;
    }
    throw new CloudError('AUTH_EXPIRED', '验证码已过期，请重新运行 npx joplo login');
  }
  async retry<T>(action: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try { return await action(); }
      catch (e) { if (!(e instanceof CloudError) || e.code !== 'NETWORK' || attempt >= 3) throw e; await this.sleep(1000 * 2 ** attempt); }
    }
  }
}
