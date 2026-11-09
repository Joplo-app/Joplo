/** 深靛蓝舞台 + 一个琥珀强调色；词元用一组低饱和的区分色（像分词器可视化那样一块一色）。所有图形从这里取色。 */
export const C = {
  bg: '#0d1020',
  panel: '#161a30',
  panel2: '#1c2140',
  line: '#262c4d',
  lineStrong: '#3a4270',
  ink: '#f3f1ec',
  muted: '#9aa3c0',
  faint: '#5c6485',
  accent: '#ffb020',
  accentSoft: 'rgba(255,176,32,.16)',
  blue: '#5b8cff',
  blueSoft: 'rgba(91,140,255,.18)',
  ok: '#34d399',
  bad: '#ff6b6b',
  bar: '#3b4478',
} as const;

/** 词元底色：相邻两块颜色不同，读者一眼看出“切在哪里”。 */
export const TOKEN_COLORS = ['#3d5a9e', '#7a4f9c', '#2f7d6d', '#9c5a3d', '#5a6f2f', '#8e3d63'] as const;
export const tokenColor = (i: number) => TOKEN_COLORS[i % TOKEN_COLORS.length]!;
