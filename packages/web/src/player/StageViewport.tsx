/**
 * 舞台的显示区域（看板与发布站共用）：
 * - 电脑页面：舞台铺满可用区域（fillStage），逻辑尺寸随区域的宽高比变化，只在舞台边缘裁切；
 * - 手机页面：固定 390 宽，套上手机外框（直接复用目录组件 Phone 的 PhoneFrame），按比例放进可用区域。
 * children 接收舞台的逻辑尺寸，传给 Stage（镜头、聚焦小图、适应画面都按它计算）。
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { Notice } from '../runtime/demo';
import { VIEWPORTS, type Viewport } from '../renderer/Stage';
import { PhoneFrame, phoneFrameSize } from '../renderer/components';
import { ThemeContext, type StageTheme } from '../renderer/rough';
import { fillStage, fitStage } from './fit';

export function StageViewport({ viewport, notice, onDismiss, children, tag, theme = 'sketch' }: { viewport: Viewport; notice: Notice | null; onDismiss: () => void; children: (size: { width: number; height: number }) => ReactNode; tag?: ReactNode; theme?: StageTheme }) {
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
  const frame = phone ? phoneFrameSize(vp.width, vp.height) : vp;
  const fill = fillStage(avail, vp);
  const scale = phone ? fitStage(avail, frame) : fill.scale;
  const size = phone ? { width: vp.width, height: vp.height } : { width: fill.width, height: fill.height };
  const floating = notice && !('nodeId' in notice) ? notice : null;
  return (
    <div ref={box} className="relative min-h-0 flex-1 overflow-hidden" data-testid="stage-viewport" data-scale={scale.toFixed(3)} data-device={viewport}>
      {tag ? <div className="absolute left-3 top-2 z-10 flex items-center gap-2 text-[12px]">{tag}</div> : null}
      {floating ? (
        <div
          role="status"
          data-testid="notice"
          data-notice-kind={floating.kind}
          className={`absolute left-1/2 top-2 z-10 flex max-w-[70%] -translate-x-1/2 items-center gap-2 rounded-md border px-3 py-2 text-[14px] shadow ${floating.kind === 'error' ? 'border-[#c92a2a] bg-[#fff0f0] text-[#a51d1d]' : floating.kind === 'selected' ? 'border-[var(--sel)] bg-[#f6f3ff] text-[#5f3dc4]' : 'border-[#d0d0d0] bg-white text-[#1e1e1e]'}`}
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
            <div data-testid="device-phone">
              <PhoneFrame width={vp.width} height={vp.height} scale={scale} seed="stage-phone">
                {children(size)}
              </PhoneFrame>
            </div>
          </ThemeContext.Provider>
        ) : (
          <div data-testid="device-desktop" data-stage-size={`${size.width}x${size.height}`}>
            <div style={{ width: size.width * scale, height: size.height * scale, overflow: 'hidden' }}>
              <div style={{ width: size.width, height: size.height, transform: `scale(${scale})`, transformOrigin: '0 0' }}>{children(size)}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
