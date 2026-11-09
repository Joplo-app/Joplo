/**
 * 一镜到底版的“世界地图”：整支片子是一张 3840×2400 的画布（16:10，和 1280×800 的取景同比例），
 * 九个区块按讲述顺序摆成 3×3，镜头在相邻区块之间推拉摇：
 *
 *   任期 term        │ 对峙 standoff（白宫 ↔ 国会） │ 原因 why
 *   ─────────────────┼─────────────────────────────┼──────────────
 *   问题 1 · 选票     │ 席位 congress               │ 地图 map
 *   ─────────────────┼─────────────────────────────┼──────────────
 *   历史 history     │ 股市 market                 │ AI ai
 *
 * 相邻关系就是镜头路线：选票 → 席位（勾一项，右边亮一块）；席位 → 历史（39 个席位飞过去）；地图 ↕ AI（回到得州）。
 * 每个区块大约 16:10，镜头按区块 id 取景，不猜坐标。
 */
export const WORLD = { w: 3840, h: 2400 };

export type Box = { x: number; y: number; w: number; h: number };
export const BOX = {
  term: { x: 60, y: 110, w: 1160, h: 620 },
  standoff: { x: 1300, y: 40, w: 1240, h: 720 },
  why: { x: 2620, y: 110, w: 1160, h: 620 },
  ballot: { x: 620, y: 860, w: 560, h: 680 },
  congress: { x: 1260, y: 840, w: 1300, h: 720 },
  map: { x: 2620, y: 860, w: 1160, h: 680 },
  history: { x: 60, y: 1660, w: 1160, h: 680 },
  market: { x: 1300, y: 1660, w: 1240, h: 680 },
  ai: { x: 2620, y: 1660, w: 1160, h: 680 },
} satisfies Record<string, Box>;

/** 绝对定位的简写（设计像素）。 */
export const at = (x: number, y: number, w?: number, h?: number) => ({
  position: 'absolute' as const, left: x, top: y,
  ...(w !== undefined ? { width: w } : {}), ...(h !== undefined ? { height: h } : {}),
});
export const box = (b: Box) => at(b.x, b.y, b.w, b.h);
