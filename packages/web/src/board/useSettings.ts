/** 看板设置（D51）：从看板进程读取，设置页保存后通知同一页面里的演示页。 */
import { useEffect, useState } from 'react';
import { emitSettings, fetchSettings, onSettings, saveSettings, type BoardSettings } from '../runtime/dev-client';

export function useBoardSettings() {
  const [settings, setSettings] = useState<BoardSettings | null>(null);
  useEffect(() => {
    let alive = true;
    void fetchSettings().then((s) => alive && setSettings(s));
    const off = onSettings((s) => setSettings(s));
    return () => {
      alive = false;
      off();
    };
  }, []);
  const save = async (next: BoardSettings) => {
    setSettings(next); // 立即应用；失败时回滚
    const r = await saveSettings(next);
    if (r.ok) emitSettings(r.settings);
    else {
      const cur = await fetchSettings();
      setSettings(cur);
      emitSettings(cur);
    }
    return r;
  };
  return { settings, save };
}
