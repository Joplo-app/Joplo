import { type Text } from '../i18n/messages';
/** 看板的数据钩子：项目列表、某个项目的 IR（首次载入 + 热更新，只应用版本号更大的结果）。 */
import { useCallback, useEffect, useState } from 'react';
import { fetchIR, fetchProjects, subscribeIR, subscribeProjects, type DevPayload, type ProjectSummary } from '../runtime/dev-client';

export function useProjects(): { list: ProjectSummary[] | null; error: Text | null; refresh: () => void } {
  const [list, setList] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<Text | null>(null);
  const refresh = useCallback(() => {
    void fetchProjects().then((r) => {
      if ('error' in r) setError(r.error);
      else {
        setError(null);
        setList(r);
      }
    });
  }, []);
  useEffect(() => {
    refresh();
    return subscribeProjects((l) => setList(l));
  }, [refresh]);
  return { list, error, refresh };
}

export type IRState = { payload: DevPayload | null; error: Text | null; status?: number; live: boolean };

export function useProjectIR(projectId: string | null): IRState {
  const [s, setS] = useState<IRState>({ payload: null, error: null, live: false });
  useEffect(() => {
    setS({ payload: null, error: null, live: false });
    if (!projectId) return;
    let alive = true;
    let applied = -1;
    const apply = (p: DevPayload) => {
      if (!alive || p.version <= applied) return;
      applied = p.version;
      setS((prev) => ({ ...prev, payload: p, error: null }));
      (window as unknown as { __JOPLO_VERSION__?: number }).__JOPLO_VERSION__ = p.version;
    };
    const off = subscribeIR(projectId, apply, (live) => alive && setS((prev) => ({ ...prev, live })));
    void fetchIR(projectId).then((r) => {
      if (!alive) return;
      if ('error' in r) setS((prev) => ({ ...prev, error: r.error, ...(r.status ? { status: r.status } : {}) }));
      else apply(r);
    });
    return () => {
      alive = false;
      off();
    };
  }, [projectId]);
  return s;
}

