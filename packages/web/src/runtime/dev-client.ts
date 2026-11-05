/**
 * 看板与 `joplo dev` 看板进程通信（一个进程、多个项目，D39）。
 *
 * - 读：项目列表 `/__joplo/projects`、某个项目的 IR `/__joplo/p/<id>/ir`、选中、视频导出状态。
 * - 推送：Vite HMR 自定义事件 `joplo:ir`（带 projectId，只接收当前项目的）与 `joplo:projects`（列表变化）。
 * - 写：选中、移除项目、打开编辑器、导出 —— 都带本地令牌（页面 meta），服务端另校验 Origin。
 */
import type { Diagnostic, Project, Selection } from '@tokenroll/joplo-core';
import type { SelectionInput, SelectionWriteResult } from './demo';

export type DevPayload = { projectId?: string; version: number; ok: boolean; project: Project | null; diagnostics: Diagnostic[]; home: string | null };

export type ProjectSummary = {
  id: string;
  dir: string;
  name: string;
  lastOpened: string;
  status: 'idle' | 'compiling' | 'ok' | 'error' | 'missing';
  errors: number;
  version: number;
};

export type VideoJob = {
  id: string;
  projectId: string;
  scenarioId: string;
  status: 'running' | 'done' | 'error';
  phase: 'starting' | 'recording' | 'saving' | 'done' | 'error';
  step: number;
  total: number;
  percent: number;
  file: string | null;
  error: string | null;
};

export function localToken(): string | null {
  const v = document.querySelector<HTMLMetaElement>('meta[name="joplo-token"]')?.content ?? '';
  return v && v !== '__JOPLO_TOKEN__' ? v : null;
}

const enc = encodeURIComponent;
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function readError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? `HTTP ${res.status}`;
}

function writeHeaders(json = true): Record<string, string> | null {
  const token = localToken();
  if (!token) return null;
  return { 'x-joplo-token': token, ...(json ? { 'content-type': 'application/json' } : {}) };
}

export async function fetchProjects(): Promise<ProjectSummary[] | { error: string }> {
  try {
    const res = await fetch('/__joplo/projects', { cache: 'no-store' });
    if (!res.ok) return { error: `读取项目列表失败（${await readError(res)}）` };
    return ((await res.json()) as { projects: ProjectSummary[] }).projects;
  } catch (e) {
    return { error: `无法连接 joplo dev：${errMsg(e)}` };
  }
}

export async function fetchIR(projectId: string): Promise<DevPayload | { error: string; status?: number }> {
  try {
    const res = await fetch(`/__joplo/p/${enc(projectId)}/ir`, { cache: 'no-store' });
    if (!res.ok) return { error: await readError(res), status: res.status };
    return (await res.json()) as DevPayload;
  } catch (e) {
    return { error: `无法连接 joplo dev：${errMsg(e)}` };
  }
}

type Hot = { on(ev: string, cb: (d: any) => void): void; off(ev: string, cb: (d: any) => void): void };
const hot = (): Hot | null => (import.meta.hot as unknown as Hot | undefined) ?? null;

/** 订阅某个项目的 IR 推送。返回取消函数。 */
export function subscribeIR(projectId: string, cb: (p: DevPayload) => void, onConnection?: (connected: boolean) => void): () => void {
  const h = hot();
  if (!h) return () => undefined;
  const handler = (p: DevPayload) => {
    if (p.projectId === projectId) cb(p);
  };
  const up = () => onConnection?.(true);
  const down = () => onConnection?.(false);
  h.on('joplo:ir', handler);
  h.on('vite:ws:connect', up);
  h.on('vite:ws:disconnect', down);
  onConnection?.(true);
  return () => {
    h.off('joplo:ir', handler);
    h.off('vite:ws:connect', up);
    h.off('vite:ws:disconnect', down);
  };
}

/** 订阅项目列表变化（再次 joplo dev 注册、编译状态变化、移除）。 */
export function subscribeProjects(cb: (list: ProjectSummary[]) => void): () => void {
  const h = hot();
  if (!h) return () => undefined;
  const handler = (d: { projects: ProjectSummary[] }) => cb(d.projects);
  h.on('joplo:projects', handler);
  return () => h.off('joplo:projects', handler);
}

export async function fetchSelection(projectId: string): Promise<Selection | null> {
  try {
    const res = await fetch(`/__joplo/p/${enc(projectId)}/selection`, { cache: 'no-store' });
    const body = (await res.json()) as { selection?: Selection | null };
    return body.selection ?? null;
  } catch {
    return null;
  }
}

/** 写回选中；null 表示取消选中（selection.json 写为 null）。 */
export function selectionWriter(projectId: string) {
  return async (input: SelectionInput | null): Promise<SelectionWriteResult> => {
    const headers = writeHeaders();
    if (!headers) return { ok: false, message: '页面没有本地令牌（请通过 joplo dev 打开）' };
    try {
      const res = await fetch(`/__joplo/p/${enc(projectId)}/selection`, { method: 'PUT', headers, body: JSON.stringify({ selection: input }) });
      const body = (await res.json().catch(() => null)) as { selection?: Selection | null; current?: Selection | null; error?: { message?: string } } | null;
      if (res.ok) return { ok: true, selection: body?.selection ?? null };
      return { ok: false, message: body?.error?.message ?? `HTTP ${res.status}`, ...(body && 'current' in body ? { current: body.current ?? null } : {}) };
    } catch (e) {
      return { ok: false, message: errMsg(e) };
    }
  };
}

async function post(url: string, body: unknown, method = 'POST'): Promise<Response> {
  const headers = writeHeaders(body !== undefined);
  if (!headers) throw new Error('页面没有本地令牌（请通过 joplo dev 打开）');
  return fetch(url, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
}

/** 从列表移除（只删记录，不删项目文件）。 */
export async function removeProject(projectId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const res = await post(`/__joplo/projects/${enc(projectId)}`, undefined, 'DELETE');
    return res.ok ? { ok: true } : { ok: false, message: await readError(res) };
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
}

export async function openInEditor(projectId: string, at: string): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const res = await post(`/__joplo/p/${enc(projectId)}/open`, { at });
    return res.ok ? { ok: true } : { ok: false, message: await readError(res) };
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
}

export type ExportRequest = { scenarioId: string; position: number; device: 'desktop' | 'mobile'; theme: 'sketch' | 'clean' };

/** 本机导出图片：服务端用 Playwright 渲染当前步骤（与 joplo render 同一渲染路径）。 */
export async function exportImage(projectId: string, body: ExportRequest): Promise<{ ok: true; blob: Blob; name: string } | { ok: false; message: string }> {
  try {
    const res = await post(`/__joplo/p/${enc(projectId)}/export/image`, body);
    if (!res.ok) return { ok: false, message: await readError(res) };
    const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? 'joplo.png';
    return { ok: true, blob: await res.blob(), name };
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
}

export async function startVideo(projectId: string, body: Omit<ExportRequest, 'position'>): Promise<{ ok: true; job: VideoJob } | { ok: false; message: string; job?: VideoJob }> {
  try {
    const res = await post(`/__joplo/p/${enc(projectId)}/export/video`, body);
    const b = (await res.json().catch(() => null)) as { job?: VideoJob; error?: { message?: string } } | null;
    if (res.ok && b?.job) return { ok: true, job: b.job };
    return { ok: false, message: b?.error?.message ?? `HTTP ${res.status}`, ...(b?.job ? { job: b.job } : {}) };
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
}

/** 视频导出进度（SSE，用 fetch 读流以便带令牌）。返回取消函数。 */
export function watchVideo(projectId: string, cb: (job: VideoJob | null) => void, onError: (message: string) => void): () => void {
  const ac = new AbortController();
  void (async () => {
    try {
      const headers = writeHeaders(false);
      if (!headers) throw new Error('页面没有本地令牌');
      const res = await fetch(`/__joplo/p/${enc(projectId)}/export/video/events`, { headers, signal: ac.signal, cache: 'no-store' });
      if (!res.ok || !res.body) throw new Error(await readError(res));
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i: number;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, i);
          buf = buf.slice(i + 2);
          if (chunk.startsWith('data: ')) cb(JSON.parse(chunk.slice(6)) as VideoJob | null);
        }
      }
    } catch (e) {
      if (!ac.signal.aborted) onError(errMsg(e));
    }
  })();
  return () => ac.abort();
}
