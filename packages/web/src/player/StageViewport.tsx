/**
 * 把固定尺寸的画框按比例缩放到可用区域（尽量占满主体）；mobile 时自动套上手机外框（直接复用目录组件 Phone 的渲染 PhoneFrame）。
 * 看板与发布站共用。
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { Notice } from '../runtime/demo';
import { VIEWPORTS, type Viewport } from '../renderer/Stage';
import { PhoneFrame, phoneFrameSize } from '../renderer/components';
import { ThemeContext, type StageTheme } from '../renderer/rough';

export function StageViewport({ viewport, mode, notice, onDismiss, children, tag, theme = 'sketch' }: { viewport: Viewport; mode: 'demo' | 'review'; notice: Notice | null; onDismiss: () => void; children: ReactNode; tag?: ReactNode; theme?: StageTheme }) {
  const box = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState({ w: 800, h: 500 });
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAvail({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setAvail({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  const vp = VIEWPORTS[viewport];
  const phone = viewport === 'mobile';
  // 手机外框：两侧机身 + 侧键余量
  const frame = phone ? phoneFrameSize(vp.width, vp.height) : vp;
  const frameW = frame.width;
  const frameH = frame.height;
  const pad = 14;
  const scale = Math.max(0.2, Math.min((avail.w - pad * 2) / frameW, (avail.h - pad * 2) / frameH, 1.5));
  const floating = notice && !('nodeId' in notice) ? notice : null;
  return (
    <div ref={box} className="relative min-h-0 flex-1 overflow-hidden" data-testid="stage-viewport" data-scale={scale.toFixed(3)}>
      {tag ? <div className="absolute left-3 top-2 z-10 flex items-center gap-2 text-[12px]">{tag}</div> : null}
      {floating ? (
        <div
          role="status"
          data-testid="notice"
          data-notice-kind={floating.kind}
          className={`absolute left-1/2 top-2 z-10 flex max-w-[70%] -translate-x-1/2 items-center gap-2 rounded-md border px-3 py-1.5 text-[13px] shadow ${floating.kind === 'error' ? 'border-[#c92a2a] bg-[#fff0f0] text-[#a51d1d]' : floating.kind === 'selected' ? 'border-[var(--sel)] bg-[#f6f3ff] text-[#5f3dc4]' : 'border-[#d0d0d0] bg-white text-[#1e1e1e]'}`}
        >
          <span>{floating.text}</span>
          <button type="button" className="text-[#8a8a8a] hover:text-black" aria-label="关闭提示" onClick={onDismiss}>
            ×
          </button>
        </div>
      ) : null}
      <div className="absolute inset-0 flex items-center justify-center">
        {phone ? (
          <ThemeContext.Provider value={{ theme, registry: null }}>
            <div style={{ outline: mode === 'review' ? '2px solid #6741d9' : '2px solid transparent', outlineOffset: 3, borderRadius: 56 * scale }} data-testid="device-phone">
              <PhoneFrame width={vp.width} height={vp.height} scale={scale} seed="stage-phone">
                {children}
              </PhoneFrame>
            </div>
          </ThemeContext.Provider>
        ) : (
          <div className="shadow-[0_2px_0_#d6d6d2,0_10px_30px_rgba(0,0,0,0.08)]" style={{ outline: mode === 'review' ? '2px solid #6741d9' : '2px solid transparent', outlineOffset: 3 }}>
            <div style={{ width: vp.width * scale, height: vp.height * scale }}>
              <div style={{ width: vp.width, height: vp.height, transform: `scale(${scale})`, transformOrigin: '0 0' }}>{children}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
