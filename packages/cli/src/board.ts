import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { JoploError } from '@joplo-app/core';
import { terminalText } from './cloud-error.ts';
import { credentialsHome } from './cloud.ts';

export type BoardProject = { id: string; dir: string; name: string; lastOpened: string; status: 'idle' | 'compiling' | 'ok' | 'error' | 'missing'; errors: number; version: number };
export type BoardSettings = { version: 1; theme?: string | null; font?: string | null; stroke?: string | null; projects?: Record<string, { theme?: string | null; font?: string | null; stroke?: string | null }> };
type BoardInfo = { port: number; pid: number; token: string };
type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const realDirectory = (dir: string) => { const absolute = path.resolve(dir); try { return fs.realpathSync(absolute); } catch { return absolute; } };

export function boardProjectId(dir: string): string {
  const real = realDirectory(dir);
  const base = path.basename(real).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'project';
  return `${base}-${createHash('sha256').update(real).digest('hex').slice(0, 6)}`;
}

function readInfo(home: string): BoardInfo {
  try {
    const value = object(JSON.parse(fs.readFileSync(path.join(home, 'server.json'), 'utf8')));
    if (!Number.isInteger(value.port) || Number(value.port) < 1 || Number(value.port) > 65535 || !Number.isInteger(value.pid) || Number(value.pid) < 1 || typeof value.token !== 'string' || !value.token) throw new Error();
    return { port: value.port as number, pid: value.pid as number, token: value.token };
  } catch {
    throw new JoploError('NOT_FOUND', 'No running Joplo board was found. Run npx joplo dev in the project first');
  }
}

export class BoardClient {
  readonly home: string;
  private readonly fetch: Fetch;
  private info?: BoardInfo;
  constructor(env: NodeJS.ProcessEnv = process.env, fetchImpl: Fetch = fetch) {
    this.home = credentialsHome(env);
    this.fetch = fetchImpl;
  }
  private async connection(): Promise<BoardInfo> {
    if (this.info) return this.info;
    const info = readInfo(this.home);
    try {
      const response = await this.fetch(`http://127.0.0.1:${info.port}/__joplo/ping`, { signal: AbortSignal.timeout(2000) });
      const body = object(await response.json());
      if (!response.ok || body.joplo !== true || body.pid !== info.pid) throw new Error();
    } catch {
      throw new JoploError('NOT_FOUND', 'The saved Joplo board is not running. Run npx joplo dev again; no project files were changed');
    }
    this.info = info;
    return info;
  }
  async request(pathname: string, options: { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: unknown } = {}): Promise<unknown> {
    const info = await this.connection();
    let response: Response;
    try {
      response = await this.fetch(`http://127.0.0.1:${info.port}${pathname}`, {
        method: options.method ?? 'GET',
        headers: { 'x-joplo-token': info.token, ...(options.body === undefined ? {} : { 'content-type': 'application/json' }) },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: AbortSignal.timeout(120_000),
      });
    } catch (e) {
      throw new JoploError('UNSUPPORTED_ACTION', `Could not reach the running Joplo board: ${e instanceof Error ? e.message : String(e)}`);
    }
    const text = await response.text();
    let data: unknown = text;
    try { data = text ? JSON.parse(text) : {}; } catch { /* The editor launcher may return an empty or plain-text response. */ }
    if (!response.ok) {
      const error = object(object(data).error);
      const supplied = typeof error.code === 'string' ? error.code : response.status === 404 ? 'NOT_FOUND' : response.status === 409 ? 'REVISION_CONFLICT' : response.status === 400 ? 'USAGE' : 'UNSUPPORTED_ACTION';
      const allowed = ['INVALID_SCHEMA', 'NOT_FOUND', 'REVISION_CONFLICT', 'INVALID_REFERENCE', 'UNSUPPORTED_ACTION', 'PERMISSION_DENIED', 'IDEMPOTENCY_MISMATCH', 'USAGE'] as const;
      const code = allowed.includes(supplied as typeof allowed[number]) ? supplied as typeof allowed[number] : 'UNSUPPORTED_ACTION';
      const message = typeof error.message === 'string' ? terminalText(error.message).slice(0, 1000) : `The board returned HTTP ${response.status}`;
      throw new JoploError(code, message);
    }
    return data;
  }
  async projects(): Promise<BoardProject[]> {
    const data = object(await this.request('/__joplo/projects'));
    if (!Array.isArray(data.projects)) throw new JoploError('INVALID_SCHEMA', 'The board returned an invalid project list');
    return data.projects.map(value => {
      const project = object(value);
      if (typeof project.id !== 'string' || typeof project.dir !== 'string' || typeof project.name !== 'string' || typeof project.lastOpened !== 'string' || !['idle', 'compiling', 'ok', 'error', 'missing'].includes(String(project.status)) || !Number.isSafeInteger(project.errors) || !Number.isSafeInteger(project.version)) throw new JoploError('INVALID_SCHEMA', 'The board returned an invalid project record');
      return project as unknown as BoardProject;
    });
  }
  async addProject(dir: string): Promise<{ id: string; url: string }> {
    const data = object(await this.request('/__joplo/projects', { method: 'POST', body: { dir: realDirectory(dir) } }));
    if (typeof data.id !== 'string' || typeof data.url !== 'string') throw new JoploError('INVALID_SCHEMA', 'The board did not return the added project URL');
    return { id: data.id, url: data.url };
  }
  async removeProject(dir: string): Promise<BoardProject> {
    const real = realDirectory(dir);
    const project = (await this.projects()).find(item => item.dir === real || item.id === dir || item.id === boardProjectId(dir));
    if (!project) throw new JoploError('NOT_FOUND', `Project is not registered in this board: ${real}`);
    await this.request(`/__joplo/projects/${encodeURIComponent(project.id)}`, { method: 'DELETE' });
    return project;
  }
  async settings(): Promise<BoardSettings> {
    const data = object(await this.request('/__joplo/settings'));
    if (!object(data.settings).version) throw new JoploError('INVALID_SCHEMA', 'The board returned invalid appearance settings');
    return data.settings as BoardSettings;
  }
  async writeSettings(settings: BoardSettings): Promise<BoardSettings> {
    const data = object(await this.request('/__joplo/settings', { method: 'PUT', body: { settings } }));
    if (!object(data.settings).version) throw new JoploError('INVALID_SCHEMA', 'The board returned invalid appearance settings');
    return data.settings as BoardSettings;
  }
  async openEditor(dir: string, at: string): Promise<void> {
    await this.request(`/__joplo/p/${encodeURIComponent(boardProjectId(dir))}/open`, { method: 'POST', body: { at } });
  }
  async review(dir: string, input: Record<string, unknown>): Promise<unknown> {
    return this.request(`/__joplo/p/${encodeURIComponent(boardProjectId(dir))}/review`, { method: 'POST', body: input });
  }
  async voiceProfiles(): Promise<unknown> {
    return this.request('/__joplo/voice/profiles');
  }
  async writeVoiceProfile(id: string, body: Record<string, unknown>): Promise<unknown> {
    return this.request(`/__joplo/voice/profiles/${encodeURIComponent(id)}`, { method: 'PUT', body });
  }
  async deleteVoiceProfile(id: string): Promise<unknown> {
    return this.request(`/__joplo/voice/profiles/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }
  async testVoiceKey(body: Record<string, unknown>): Promise<unknown> {
    return this.request('/__joplo/voice/test', { method: 'POST', body });
  }
  async selectVoice(dir: string, profileId: string | null): Promise<unknown> {
    return this.request(`/__joplo/p/${encodeURIComponent(boardProjectId(dir))}/voice`, { method: 'PUT', body: { profileId } });
  }
}
