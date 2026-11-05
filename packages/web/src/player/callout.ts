/**
 * 解说卡的位置（T-director2，纯函数）：放在焦点旁边，带指向焦点的箭头，自动避开画面边缘。
 * 依次尝试右、左、下、上；都放不下时放在空间最大的一侧并夹进画面（可能压住焦点的一部分）。
 * 没有焦点时放在画面底部居中，没有箭头。
 */
export type Box = { x: number; y: number; w: number; h: number };
export type Side = 'right' | 'left' | 'bottom' | 'top' | 'none';
export type Placement = { x: number; y: number; side: Side; /** 箭头尖端（画面坐标），side 为 none 时为 null。 */ arrow: { x: number; y: number } | null };

export const CARD_GAP = 18;
export const CARD_MARGIN = 12;

const clamp = (v: number, lo: number, hi: number) => (hi < lo ? lo : Math.min(hi, Math.max(lo, v)));

export function placeCallout(anchor: Box | null, card: { w: number; h: number }, frame: { W: number; H: number }, gap = CARD_GAP, margin = CARD_MARGIN): Placement {
  const { W, H } = frame;
  const { w, h } = card;
  if (!anchor) return { x: clamp((W - w) / 2, margin, W - w - margin), y: clamp(H - h - margin - 8, margin, H - h - margin), side: 'none', arrow: null };
  const a = anchor;
  const cx = a.x + a.w / 2;
  const cy = a.y + a.h / 2;
  const at = (side: Exclude<Side, 'none'>) => {
    if (side === 'right' || side === 'left') {
      const x = side === 'right' ? a.x + a.w + gap : a.x - gap - w;
      const y = clamp(cy - h / 2, margin, H - h - margin);
      return { x, y, fits: side === 'right' ? x + w <= W - margin : x >= margin, room: side === 'right' ? W - (a.x + a.w) : a.x };
    }
    const y = side === 'bottom' ? a.y + a.h + gap : a.y - gap - h;
    const x = clamp(cx - w / 2, margin, W - w - margin);
    return { x, y, fits: side === 'bottom' ? y + h <= H - margin : y >= margin, room: side === 'bottom' ? H - (a.y + a.h) : a.y };
  };
  const sides = ['right', 'left', 'bottom', 'top'] as const;
  const tries = sides.map((s) => ({ side: s, ...at(s) }));
  const best = tries.find((t) => t.fits) ?? [...tries].sort((p, q) => q.room - p.room)[0]!;
  const x = clamp(best.x, margin, W - w - margin);
  const y = clamp(best.y, margin, H - h - margin);
  // 箭头尖端：落在焦点朝向卡片的那条边上，并与卡片的对边对齐（夹在卡片范围内，离角至少 16px）
  const arrow =
    best.side === 'right' ? { x: a.x + a.w + 2, y: clamp(cy, y + 16, y + h - 16) }
    : best.side === 'left' ? { x: a.x - 2, y: clamp(cy, y + 16, y + h - 16) }
    : best.side === 'bottom' ? { x: clamp(cx, x + 16, x + w - 16), y: a.y + a.h + 2 }
    : { x: clamp(cx, x + 16, x + w - 16), y: a.y - 2 };
  return { x, y, side: best.side, arrow };
}

/**
 * 导演模式下，镜头给解说卡预留的位置（画面坐标）：宽屏留右侧一列，窄屏（手机）留底部。
 * 镜头把焦点放进剩下的区域，解说卡就能放在焦点旁边而不压住它。
 */
export function cardReserve(W: number, cardW: number): { right: number; bottom: number } {
  return W >= 900 ? { right: cardW + 2 * CARD_GAP, bottom: 0 } : { right: 0, bottom: 220 };
}
