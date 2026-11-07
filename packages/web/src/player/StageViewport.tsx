import { useI18n } from '../i18n/context';
/**
 * 舞台的显示区域（看板与发布站共用）：
 * - 电脑页面：舞台铺满可用区域（fillStage），逻辑尺寸随区域的宽高比变化，只在舞台边缘裁切；
 * - 手机页面：固定 390 宽，套上手机外框（直接复用目录组件 Phone 的 PhoneFrame），按比例放进可用区域。
 * children 接收舞台的逻辑尺寸，传给 Stage（镜头、聚焦小图、适应画面都按它计算）。
 */
import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { Notice } from '../runtime/demo';
import { VIEWPORTS, type Viewport } from '../renderer/Stage';
import { PHONE_BEZEL, PHONE_SAFE, PhoneFrame, phoneFrameSize } from '../renderer/components';
import { DeviceZoomContext, type DeviceFocus } from '../renderer/camera';
import { CAMERA_EASE, CAMERA_MS } from '../runtime/pace';
import { ThemeContext, type StageTheme, type StrokeMode } from '../renderer/rough';
import { fillStage, fitStage } from './fit';
import { Ban, CircleArrowRight, CircleCheck, CircleDashed, CircleX, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { noticeView, type NoticeView } from './states';

function NoticeIcon({ icon }: { icon: NoticeView['icon'] }) {
  const { t: i18n } = useI18n();

  const cls = 'size-4 shrink-0';
  if (icon === 'next') return <CircleArrowRight className={cls} aria-label={i18n.player.thatIsNotTheNextStep} />;
  if (icon === 'uncovered') return <CircleDashed className={cn(cls, 'text-jb-muted')} aria-label={i18n.player.notCoveredByThisDemo} />;
  if (icon === 'disabled') return <Ban className={cn(cls, 'text-jb-danger')} aria-label={i18n.player.unavailableNow} />;
  if (icon === 'error') return <CircleX className={cn(cls, 'text-jb-danger')} aria-label={i18n.player.error} />;
  if (icon === 'ok') return <CircleCheck className={cn(cls, 'text-jb-ok')} aria-label={i18n.player.done} />;
  return <Info className={cn(cls, 'text-jb-muted')} aria-hidden />;
}
import type { AppearanceFont } from '../renderer/appearance';

export function StageViewport({ viewport, notice, onDismiss, onBack, children, tag, theme = 'sketch', stroke = 'rough', font = null, curtain, curtainUp = false }: {
  viewport: Viewport; notice: Notice | null; onDismiss: () => void; /** 「回到演示」（顺序不对的提示）。 */ onBack?: () => void; children: (size: { width: number; height: number }) => ReactNode; tag?: ReactNode; theme?: StageTheme; stroke?: StrokeMode; font?: AppearanceFont | null;
  /**
   * 幕布（D61：过渡卡、场景封面）：铺满整个显示区域，不进手机外框。逻辑尺寸与电脑页面的舞台相同（fillStage），
   * 按同一比例缩放，所以电脑层与手机层上的卡片一样大。
   */
  curtain?: (size: { width: number; height: number }) => ReactNode;
  /** 幕布此刻挡住了舞台：画面不可聚焦、不可点击（inert）。 */
  curtainUp?: boolean;
}) {
  const { t: i18n } = useI18n();

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
  const sheet = phone ? fillStage(avail, VIEWPORTS.desktop) : fill;
  // 手机层推近：镜头报来目标在手机内容里的位置与还需要的放大倍数，整台手机放大、目标移到舞台中央（不超过舞台能放下目标的大小）
  const [focus, setFocus] = useState<DeviceFocus | null>(null);
  const onDevice = useCallback((f: DeviceFocus | null) => setFocus(f), []);
  let deviceZoom = 1;
  let deviceShift = { x: 0, y: 0 };
  if (phone && focus) {
    const fit = Math.min((avail.w - 48) / Math.max(1, focus.w * scale), (avail.h - 48) / Math.max(1, focus.h * scale));
    deviceZoom = Math.max(1, Math.min(focus.z, fit));
    if (deviceZoom > 1.02) {
      const px = (4 + PHONE_BEZEL + PHONE_SAFE.x + focus.x) * scale;
      const py = (PHONE_BEZEL + PHONE_SAFE.top + focus.y) * scale;
      deviceShift = { x: -deviceZoom * (px - (frame.width * scale) / 2), y: -deviceZoom * (py - (frame.height * scale) / 2) };
    } else deviceZoom = 1;
  }
  // 所有提示（含点错位置的三种）都在画面顶部居中，一条轻提示（D55）
  const view = noticeView(notice, i18n);
  return (
    <div ref={box} className={cn('relative min-h-0 flex-1 overflow-hidden', phone && 'bg-jb-app')} data-testid="stage-viewport" data-scale={scale.toFixed(3)} data-device={viewport}>
      {tag ? <div className="absolute left-3 top-3 z-10 flex items-center gap-2 text-[12px]">{tag}</div> : null}
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
              {i18n.player.backToDemo}</button>
          ) : null}
          <button type="button" className="jb-focus flex size-6 shrink-0 items-center justify-center rounded-[6px] text-jb-muted hover:bg-jb-hover hover:text-jb-fg" aria-label={i18n.player.dismissNotice} onClick={onDismiss}>
            <X className="size-3.5" />
          </button>
        </div>
      ) : null}
      <div className="absolute inset-0 flex items-center justify-center" inert={curtainUp || undefined}>
        {phone ? (
          <ThemeContext.Provider value={{ theme, stroke, font, registry: null }}>
            <div
              data-testid="device-phone"
              data-device-zoom={deviceZoom.toFixed(3)}
              style={{ transform: deviceZoom > 1 ? `translate(${deviceShift.x}px, ${deviceShift.y}px) scale(${deviceZoom})` : undefined, transformOrigin: 'center', transition: `transform ${CAMERA_MS}ms cubic-bezier(${CAMERA_EASE.join(',')})` }}
            >
              <DeviceZoomContext.Provider value={onDevice}>
                <PhoneFrame width={vp.width} height={vp.height} scale={scale} seed="stage-phone">
                  {children(size)}
                </PhoneFrame>
              </DeviceZoomContext.Provider>
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
      {curtain ? (
        <div className="pointer-events-none absolute inset-0 z-[15] overflow-hidden" data-testid="stage-curtain">
          <div className="absolute left-1/2 top-1/2" style={{ width: sheet.width, height: sheet.height, transform: `translate(-50%, -50%) scale(${sheet.scale})` }}>
            {curtain({ width: sheet.width, height: sheet.height })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
