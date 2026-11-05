/** 看板与发布站共用的小工具：hash 路由、轻提示、下载、复制。 */
import { useCallback, useEffect, useState, type ReactNode } from 'react';

export function useHash(): [string, (h: string, replace?: boolean) => void] {
  const [hash, setHash] = useState(() => location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = useCallback((h: string, replace = false) => {
    if (h === location.hash) return;
    if (replace) history.replaceState(history.state, '', h);
    else history.pushState(history.state, '', h);
    setHash(h);
  }, []);
  return [hash, go];
}

/** 页面级轻提示：几秒后自动消失（默认 2.6 秒；带操作按钮的提示可以留久一点）。 */
export function useFlash(): [ReactNode | null, (m: ReactNode, ms?: number) => void] {
  const [msg, setMsg] = useState<{ m: ReactNode; ms: number } | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), msg.ms);
    return () => clearTimeout(t);
  }, [msg]);
  const set = useCallback((m: ReactNode, ms = 2600) => setMsg({ m, ms }), []);
  return [msg?.m ?? null, set];
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** 复制文字（file:// 等不能用剪贴板 API 时退回 execCommand）。 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}
