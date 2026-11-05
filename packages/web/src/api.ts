/** 与本地服务（@joplo/server）通信。只有写接口需要本地令牌。 */
import type { Project } from '@joplo/core';

export type Selection = {
  optionId: string;
  scenarioId: string;
  /** 选中时所在的位置（已执行步骤数）。 */
  position: number;
  /** 产生当前画面的步骤（steps[position-1]）；初始状态为 null。与 `joplo render --step` 语义一致。 */
  stepId: string | null;
  sceneId: string;
  /** 选中的元素；只选中步骤时为 null。 */
  nodeId: string | null;
  at: string;
};

export type ProjectLoad =
  | { ok: true; revision: number; project: Project }
  | { ok: false; error: { code: string; message: string; issues?: { path: string; message: string }[] } };

export function localToken(): string | null {
  const v = document.querySelector<HTMLMetaElement>('meta[name="joplo-token"]')?.content ?? '';
  return v && v !== '__JOPLO_TOKEN__' ? v : null;
}

export async function fetchProject(): Promise<ProjectLoad> {
  try {
    const res = await fetch('/api/project', { cache: 'no-store' });
    const body = await res.json().catch(() => null);
    if (res.ok && body && typeof body === 'object' && 'project' in body) return { ok: true, revision: body.revision, project: body.project };
    return { ok: false, error: body?.error ?? { code: `HTTP_${res.status}`, message: `读取项目失败（HTTP ${res.status}）` } };
  } catch (e) {
    return { ok: false, error: { code: 'NETWORK', message: `无法连接本地服务：${e instanceof Error ? e.message : String(e)}` } };
  }
}

export async function putSelection(sel: Selection): Promise<{ ok: true } | { ok: false; message: string }> {
  const token = localToken();
  if (!token) return { ok: false, message: '页面没有本地令牌（请通过 joplo serve 打开）' };
  try {
    const res = await fetch('/api/selection', { method: 'PUT', headers: { 'content-type': 'application/json', 'x-joplo-token': token }, body: JSON.stringify(sel) });
    if (res.ok) return { ok: true };
    const body = await res.json().catch(() => null);
    return { ok: false, message: body?.error?.message ?? `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/** 订阅项目修订事件（SSE）。返回取消函数。 */
export function subscribeRevisions(onRevision: (revision: number | null) => void, onConnection?: (connected: boolean) => void): () => void {
  const es = new EventSource('/api/events');
  es.addEventListener('revision', (e) => {
    try {
      const d = JSON.parse((e as MessageEvent).data);
      onRevision(typeof d.revision === 'number' ? d.revision : null);
    } catch {
      onRevision(null);
    }
  });
  es.onopen = () => onConnection?.(true);
  es.onerror = () => onConnection?.(false);
  return () => es.close();
}
