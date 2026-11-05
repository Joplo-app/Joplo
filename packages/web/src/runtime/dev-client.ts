/**
 * 看板与 `joplo dev` 服务通信：首次载入取 IR，之后通过 Vite HMR 自定义事件 `joplo:ir` 接收新 IR（不整页刷新）。
 * 只有写接口（选中）需要本地令牌。
 */
import type { Diagnostic, Project, Selection } from '@tokenroll/joplo-core';
import type { SelectionInput, SelectionWriteResult } from './demo';

export type DevPayload = { version: number; ok: boolean; project: Project | null; diagnostics: Diagnostic[]; home: string | null };

export function localToken(): string | null {
  const v = document.querySelector<HTMLMetaElement>('meta[name="joplo-token"]')?.content ?? '';
  return v && v !== '__JOPLO_TOKEN__' ? v : null;
}

export async function fetchIR(): Promise<DevPayload | { error: string }> {
  try {
    const res = await fetch('/__joplo/ir', { cache: 'no-store' });
    if (!res.ok) return { error: `读取编译结果失败（HTTP ${res.status}）` };
    return (await res.json()) as DevPayload;
  } catch (e) {
    return { error: `无法连接 joplo dev：${e instanceof Error ? e.message : String(e)}` };
  }
}

/** 订阅热更新推送的 IR。返回取消函数。 */
export function subscribeIR(cb: (p: DevPayload) => void, onConnection?: (connected: boolean) => void): () => void {
  const hot = import.meta.hot;
  if (!hot) return () => undefined;
  const handler = (p: DevPayload) => cb(p);
  hot.on('joplo:ir', handler);
  const up = () => onConnection?.(true);
  const down = () => onConnection?.(false);
  hot.on('vite:ws:connect', up);
  hot.on('vite:ws:disconnect', down);
  onConnection?.(true);
  return () => {
    hot.off('joplo:ir', handler);
    hot.off('vite:ws:connect', up);
    hot.off('vite:ws:disconnect', down);
  };
}

export async function fetchSelection(): Promise<Selection | null> {
  try {
    const res = await fetch('/__joplo/selection', { cache: 'no-store' });
    const body = (await res.json()) as { selection?: Selection | null };
    return body.selection ?? null;
  } catch {
    return null;
  }
}

/** 写回选中；null 表示取消选中（selection.json 写为 null）。 */
export async function putSelection(input: SelectionInput | null): Promise<SelectionWriteResult> {
  const token = localToken();
  if (!token) return { ok: false, message: '页面没有本地令牌（请通过 joplo dev 打开）' };
  try {
    const res = await fetch('/__joplo/selection', { method: 'PUT', headers: { 'content-type': 'application/json', 'x-joplo-token': token }, body: JSON.stringify({ selection: input }) });
    const body = (await res.json().catch(() => null)) as { selection?: Selection | null; current?: Selection | null; error?: { message?: string } } | null;
    if (res.ok) return { ok: true, selection: body?.selection ?? null };
    return { ok: false, message: body?.error?.message ?? `HTTP ${res.status}`, ...(body && 'current' in body ? { current: body.current ?? null } : {}) };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
