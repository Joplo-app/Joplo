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
import { ThemeContext, type StageTheme, type StrokeMode } from '../renderer/rough';
import { fillStage, fitStage } from './fit';
import { Ban, CircleArrowRight, CircleCheck, CircleDashed, CircleX, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { noticeView, type NoticeView } from './states';

function NoticeIcon({ icon }: { icon: NoticeView['icon'] }) {
  const cls = 'size-4 shrink-0';
  if (icon === 'next') return <CircleArrowRight className={cls} aria-label="下一步不是这里" />;
  if (icon === 'uncovered') return <CircleDashed className={cn(cls, 'text-jb-muted')} aria-label="演示没有覆盖" />;
  if (icon === 'disabled') return <Ban className={cn(cls, 'text-jb-danger')} aria-label="现在不可用" />;
  if (icon === 'error') return <CircleX className={cn(cls, 'text-jb-danger')} aria-label="出错" />;
  if (icon === 'ok') return <CircleCheck className={cn(cls, 'text-jb-ok')} aria-label="完成" />;
  return <Info className={cn(cls, 'text-jb-muted')} aria-hidden />;
}
import type { AppearanceFont } from '../renderer/appearance';

export function StageViewport({ viewport, notice, onDismiss, onBack, children, tag, theme = 'sketch', stroke = 'rough', font = null }: { viewport: Viewport; notice: Notice | null; onDismiss: () => void; /** 「回到演示」（顺序不对的提示）。 */ onBack?: () => void; children: (size: { width: number; height: number }) => ReactNode; tag?: ReactNode; theme?: StageTheme; stroke?: StrokeMode; font?: AppearanceFont | null }) {
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
  // 所有提示（含点错位置的三种）都在画面顶部居中，一条轻提示（D55）
  const view = noticeView(notice);
  return (
    <div ref={box} className="relative min-h-0 flex-1 overflow-hidden" data-testid="stage-viewport" data-scale={scale.toFixed(3)} data-device={viewport}>
      {tag ? <div className="absolute left-3 top-2 z-10 flex items-center gap-2 text-[12px]">{tag}</div> : null}
      {view ? (
        <div
          role="status"
          data-testid="notice"
          data-notice-kind={notice!.kind}
          className={cn('jb-pop absolute left-1/2 top-3 z-20 flex max-w-[min(640px,86%)] -translate-x-1/2 items-center gap-2 rounded-[8px] py-1.5 pl-3 pr-1.5 text-[13px]', view.icon === 'error' && 'border-jb-danger')}
        >
          <NoticeIcon icon={view.icon} />
          <span className="min-w-0 truncate" title={view.text}>
            {view.text}
          </span>
          {view.back ? (
            <button type="button" className="jb-focus shrink-0 whitespace-nowrap rounded-[6px] bg-jb-inverse px-2 py-1 text-[12px] font-medium text-jb-on-inverse hover:bg-jb-inverse-hover" onClick={onBack ?? onDismiss} data-testid="notice-back">
              回到演示
            </button>
          ) : null}
          <button type="button" className="jb-focus flex size-6 shrink-0 items-center justify-center rounded-[6px] text-jb-muted hover:bg-jb-hover hover:text-jb-fg" aria-label="关闭提示" onClick={onDismiss}>
            <X className="size-3.5" />
          </button>
        </div>
      ) : null}
      <div className="absolute inset-0 flex items-center justify-center">
        {phone ? (
          <ThemeContext.Provider value={{ theme, stroke, font, registry: null }}>
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
