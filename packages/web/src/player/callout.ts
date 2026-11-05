/**
 * 解说卡的尺寸与位置（T-director2 / T-director3，纯函数）。
 * - 锚点 = 导演层本步镜头的主目标（该层第一个 shot 的第一个 id；没有 shot 时是被操作的元素），箭头尖端落在它的包围盒边上；
 * - 卡片放在锚点旁边的空白处，不压住本步任何焦点元素（obstacles），也不出画面；
 * - 依次试右、左、下、上，每一侧从正对锚点的位置开始沿边滑动找空位；都放不下时取压住最少的位置。
 * - 没有锚点时放在画面底部居中（避开焦点），没有箭头。
 * 坐标都是画框坐标，并且是镜头变换（含用户缩放平移）之后的位置。
 */
export type Box = { x: number; y: number; w: number; h: number };
export type Side = 'right' | 'left' | 'bottom' | 'top' | 'none';
export type Placement = {
  x: number;
  y: number;
  side: Side;
  /** 箭头尖端（锚点包围盒的边上），side 为 none 时为 null。 */
  arrow: { x: number; y: number } | null;
  /** 箭头尾端（卡片朝向锚点的边上）。 */
  tail: { x: number; y: number } | null;
};

export const CARD_GAP = 22;
export const CARD_MARGIN = 12;
/** 解说卡说明 / 解说的基础字号（画框像素；屏幕上按舞台缩放再补偿）。 */
export const CARD_CAPTION_PX = 26;
export const CARD_EXPLAIN_PX = 19;
const CARD_PAD_X = 22;
const CARD_PAD_Y = 16;

const clamp = (v: number, lo: number, hi: number) => (hi < lo ? lo : Math.min(hi, Math.max(lo, v)));
const overlap = (a: Box, b: Box) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const inflate = (b: Box, m: number): Box => ({ x: b.x - m, y: b.y - m, w: b.w + 2 * m, h: b.h + 2 * m });

/** 卡片最大宽度：舞台宽度的 60%，不小于 480（窄屏时不超过画面）。 */
export function cardMaxWidth(W: number): number {
  return Math.max(200, Math.min(W - 2 * CARD_MARGIN, Math.max(480, Math.round(W * 0.6))));
}

const textW = (s: string, px: number) => {
  let w = 0;
  for (const ch of s) w += (ch.codePointAt(0) ?? 0) > 0x2e80 ? px : px * 0.56;
  return w;
};

/** 按文字估算卡片尺寸（宽度自适应文字，最大 cardMaxWidth；说明大字、解说小一号）：镜头据此给卡片留位置。 */
export function cardSize(caption: string, explain: string | null | undefined, W: number, px = { caption: CARD_CAPTION_PX, explain: CARD_EXPLAIN_PX }): { w: number; h: number } {
  const maxW = cardMaxWidth(W);
  const cw = textW(caption, px.caption);
  const ew = explain ? Math.max(...explain.split('\n').map((l) => textW(l, px.explain))) : 0;
  const w = Math.min(maxW, Math.max(240, Math.ceil(Math.max(cw, ew)) + 2 * CARD_PAD_X + 2));
  const lines = (tw: number) => Math.max(1, Math.ceil(tw / Math.max(1, w - 2 * CARD_PAD_X)));
  const capLines = lines(cw);
  const expLines = explain ? explain.split('\n').reduce((n, l) => n + lines(textW(l, px.explain)), 0) : 0;
  const h = Math.ceil(2 * CARD_PAD_Y + capLines * px.caption * 1.35 + (explain ? 8 + expLines * px.explain * 1.55 : 0) + 4);
  return { w, h };
}

/**
 * 导演模式下镜头给解说卡留的位置：卡片窄（不超过画面 42%）时留右侧一列，否则留底部一条；手机留底部。
 * 镜头把焦点放进剩下的区域，卡片就能放在焦点旁边而不压住它。
 */
export function cardReserve(W: number, card: { w: number; h: number }): { right: number; bottom: number } {
  if (W >= 900 && card.w <= W * 0.42) return { right: card.w + 2 * CARD_GAP, bottom: 0 };
  return { right: 0, bottom: card.h + 2 * CARD_GAP };
}

export function placeCallout(anchor: Box | null, card: { w: number; h: number }, frame: { W: number; H: number }, obstacles: Box[] = [], gap = CARD_GAP, margin = CARD_MARGIN): Placement {
  const { W, H } = frame;
  const { w, h } = card;
  const obs = [...obstacles, ...(anchor ? [anchor] : [])].map((o) => inflate(o, 6));
  const cost = (x: number, y: number) => obs.reduce((a, o) => a + overlap({ x, y, w, h }, o), 0);
  const fx = (x: number) => clamp(x, margin, W - w - margin);
  const fy = (y: number) => clamp(y, margin, H - h - margin);
  if (!anchor) {
    const cands = [
      { x: fx((W - w) / 2), y: fy(H - h - margin - 8) },
      { x: fx((W - w) / 2), y: fy(margin + 8) },
      { x: fx(W - w - margin), y: fy(H - h - margin) },
      { x: fx(margin), y: fy(H - h - margin) },
    ];
    const best = cands.find((c) => cost(c.x, c.y) === 0) ?? [...cands].sort((a, b) => cost(a.x, a.y) - cost(b.x, b.y))[0]!;
    return { ...best, side: 'none', arrow: null, tail: null };
  }
  const a = anchor;
  const cx = a.x + a.w / 2;
  const cy = a.y + a.h / 2;
  const slide = (center: number, lo: number, hi: number) => {
    const out = [clamp(center, lo, hi)];
    for (let k = 1; k <= 40; k++) out.push(clamp(center - k * 16, lo, hi), clamp(center + k * 16, lo, hi));
    return out;
  };
  type C = { x: number; y: number; side: Exclude<Side, 'none'>; c: number };
  const cands: C[] = [];
  const sides = ['right', 'left', 'bottom', 'top'] as const;
  for (const side of sides) {
    if (side === 'right' || side === 'left') {
      const x = side === 'right' ? a.x + a.w + gap : a.x - gap - w;
      if (x < margin - 0.5 || x + w > W - margin + 0.5) continue;
      for (const y of slide(cy - h / 2, margin, H - h - margin)) cands.push({ x, y, side, c: cost(x, y) });
    } else {
      const y = side === 'bottom' ? a.y + a.h + gap : a.y - gap - h;
      if (y < margin - 0.5 || y + h > H - margin + 0.5) continue;
      for (const x of slide(cx - w / 2, margin, W - w - margin)) cands.push({ x, y, side, c: cost(x, y) });
    }
  }
  let best = cands.find((c) => c.c === 0);
  if (!best) {
    // 四边都放不下：在画面里找压住最少的位置（仍然优先贴着锚点）
    const all: C[] = [...cands];
    for (const side of sides) {
      const x = side === 'right' ? fx(a.x + a.w + gap) : side === 'left' ? fx(a.x - gap - w) : fx(cx - w / 2);
      const y = side === 'bottom' ? fy(a.y + a.h + gap) : side === 'top' ? fy(a.y - gap - h) : fy(cy - h / 2);
      all.push({ x, y, side, c: cost(x, y) });
    }
    best = [...all].sort((p, q) => p.c - q.c)[0]!;
  }
  const { x, y, side } = best;
  // 箭头尖端落在锚点朝向卡片那条边上；尽量与卡片正对（直的箭头）
  const ex = (v: number) => clamp(v, a.x + Math.min(6, a.w / 2), a.x + a.w - Math.min(6, a.w / 2));
  const ey = (v: number) => clamp(v, a.y + Math.min(6, a.h / 2), a.y + a.h - Math.min(6, a.h / 2));
  let arrow: { x: number; y: number };
  let tail: { x: number; y: number };
  if (side === 'right' || side === 'left') {
    const ty = ey(clamp(cy, y + 14, y + h - 14));
    arrow = { x: side === 'right' ? a.x + a.w : a.x, y: ty };
    tail = { x: side === 'right' ? x : x + w, y: clamp(ty, y + 14, y + h - 14) };
  } else {
    const tx = ex(clamp(cx, x + 14, x + w - 14));
    arrow = { x: tx, y: side === 'bottom' ? a.y + a.h : a.y };
    tail = { x: clamp(tx, x + 14, x + w - 14), y: side === 'bottom' ? y : y + h };
  }
  return { x, y, side, arrow, tail };
}
