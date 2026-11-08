/**
 * 资讯视频里的照片：网上找来的素材（assets/，来源与许可见 assets/CREDITS.md），
 * 用 Joplo 的 asset() 内嵌、<Image> 显示，再叠上去色、党派色调和边缘渐隐。
 */
import { asset, type Bind } from '@joplo-app/kit';
import { Image } from '@joplo-app/kit/ui';

const abs = { position: 'absolute' as const, inset: 0 };

// ---------- 网上找来的照片（见 assets/CREDITS.md） ----------

type PhotoProps = {
  id: string;
  name: string;
  tint?: Bind | string;
  pos?: string;
  credit?: string;
  gray?: boolean;
  /** 边缘渐隐到背景：left / right / bottom / none */
  fade?: 'left' | 'right' | 'bottom' | 'soft' | 'none';
  /** 署名放在顶部（底部会被其他元素挡住时用）。 */
  creditTop?: boolean;
  style?: Record<string, unknown>;
};

/** 照片：去色 + 党派色调（可绑定，红蓝之间平滑过渡）+ 边缘渐隐，自媒体视频常见的处理。 */
export function Photo({ id, name, tint, pos = 'center', credit, creditTop, gray = true, fade = 'none', style }: PhotoProps) {
  // 素材读不到时 asset() 直接报错（带路径），不悄悄换成别的画面
  const src = asset(`../assets/${name}`);
  const edge =
    fade === 'left' ? 'linear-gradient(to right, transparent 0%, #000 35%)'
    : fade === 'right' ? 'linear-gradient(to left, transparent 0%, #000 35%)'
    : fade === 'bottom' ? 'linear-gradient(to top, transparent 0%, #000 40%)'
    : fade === 'soft' ? 'radial-gradient(ellipse 58% 62% at 50% 42%, #000 55%, transparent 100%)'
    : undefined;
  return (
    <div id={id} style={{ position: 'relative', overflow: 'hidden', ...(edge ? { WebkitMaskImage: edge, maskImage: edge } : {}), ...style }}>
      <Image id={`${id}_img`} src={src} alt={credit ?? name} w="100%" h="100%" fit="cover" position={pos} style={{ position: 'absolute', inset: 0, filter: gray ? 'grayscale(1) contrast(1.15) brightness(.95)' : undefined }} />
      {tint ? <div style={{ ...abs, background: tint as never, mixBlendMode: 'multiply', transition: 'background-color 900ms ease' }} /> : null}
      {credit ? <div style={{ position: 'absolute', right: 8, ...(creditTop ? { top: 6 } : { bottom: 6 }), fontSize: 10, color: 'rgba(255,255,255,.7)', textShadow: '0 1px 2px #000' }}>{credit}</div> : null}
    </div>
  );
}
