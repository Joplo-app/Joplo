/** 深色舞台 + 红蓝强对比（自媒体资讯视频风格）。所有图形组件从这里取色。 */
export const C = {
  bg: '#0a0e16',
  panel: '#121927',
  panel2: '#182133',
  line: '#26304a',
  lineStrong: '#3a4663',
  ink: '#f4f1ea',
  muted: '#93a0b8',
  dem: '#3b82f6',
  demLight: '#1d3a6b',
  demGlow: 'rgba(59,130,246,.35)',
  rep: '#ef4444',
  repLight: '#5e2228',
  repGlow: 'rgba(239,68,68,.35)',
  ind: '#8b5cf6',
  gold: '#f5b301',
  tossup: '#f5b301',
  none: '#232c3f',
  pending: '#5b6478',
  up: '#22c55e',
  paper: '#0a0e16',
} as const;

export type Party = 'D' | 'R' | 'I' | 'U' | 'N';
/** 席位的颜色：D 民主党，R 共和党，I 独立，U 未定，N 不在本次改选。 */
export const partyColor = (p: Party, light = false): string =>
  p === 'D' ? (light ? C.demLight : C.dem) : p === 'R' ? (light ? C.repLight : C.rep) : p === 'I' ? C.ind : p === 'U' ? C.pending : C.none;
