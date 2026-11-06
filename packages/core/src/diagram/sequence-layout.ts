/**
 * 时序图布局（D67，纯函数、确定）：参与者按源码顺序排成列，消息按源码顺序一行一条，片段（alt / opt / loop…）是包住
 * 若干行的框，参与者分组是包住若干列的业务域框。不需要通用图布局算法，编译期直接算好写进 IR。
 *
 * - 列间距：先按相邻头部宽度加最小间隙，再保证每条消息的标签放得下（跨多列的消息把不够的宽度平均分给它跨过的间隙）；
 *   自调用（from === to）的回环和标签放在生命线右侧，下一列让出位置。
 * - 行：消息行高固定（标签在线上方），自调用多一点；片段开始处多一行放片段标签，结束处留一点底。
 */
import { GROUP_HEAD, GROUP_PAD, EDGE_FONT, groupTitleWidth, textWidth, type Box, type Point, type SequenceLayout, type SequenceStructure } from './model.ts';

const M = 12;
const GAP = 48;
const ROW = 44;
const SELF_ROW = 58;
const SELF_W = 36;
const BLOCK_HEAD = 30;
const BLOCK_TAIL = 12;
const BLOCK_PAD = 18;
/** 序号徽章占的宽度（numbered 时标签前面画一个圆形序号）。 */
export const SEQ_BADGE = 20;

export function layoutSequence(s: SequenceStructure): SequenceLayout {
  const empty: SequenceLayout = { kind: 'sequence', width: 0, height: 0, actors: {}, lifelines: {}, messages: {}, groups: {}, titles: {}, blocks: {}, blockTitles: {} };
  if (!s.actors.length) return empty;
  const idx = new Map(s.actors.map((a, i) => [a.id, i]));
  const n = s.actors.length;
  const labelW = (label: string) => (label ? textWidth(label, EDGE_FONT) + 12 : 0) + (s.numbered ? SEQ_BADGE : 0);

  // ---------- 列 ----------
  // gap[i] = 第 i 列与第 i+1 列中心的距离
  const gap: number[] = [];
  for (let i = 0; i < n - 1; i++) gap.push(s.actors[i]!.w / 2 + s.actors[i + 1]!.w / 2 + GAP);
  // 同一分组的参与者之间、分组边界也要留出分组的内边距
  for (let i = 0; i < n - 1; i++) if (s.actors[i]!.group !== s.actors[i + 1]!.group) gap[i] = gap[i]! + 2 * GROUP_PAD;
  const valid = s.messages.filter((m) => idx.has(m.from) && idx.has(m.to));
  // 自调用：回环 + 标签放在右侧
  for (const m of valid) {
    if (m.from !== m.to) continue;
    const i = idx.get(m.from)!;
    const need = SELF_W + 8 + labelW(m.label) + 16 + (i < n - 1 ? s.actors[i + 1]!.w / 2 : 0);
    if (i < n - 1) gap[i] = Math.max(gap[i]!, need);
  }
  // 普通消息：标签放得下（按跨度从小到大处理，结果确定）
  const spans = valid.filter((m) => m.from !== m.to).map((m) => ({ a: Math.min(idx.get(m.from)!, idx.get(m.to)!), b: Math.max(idx.get(m.from)!, idx.get(m.to)!), w: labelW(m.label) + 28 }));
  spans.sort((x, y) => x.b - x.a - (y.b - y.a) || x.a - y.a);
  for (const sp of spans) {
    let have = 0;
    for (let i = sp.a; i < sp.b; i++) have += gap[i]!;
    if (have >= sp.w) continue;
    const add = (sp.w - have) / (sp.b - sp.a);
    for (let i = sp.a; i < sp.b; i++) gap[i] = gap[i]! + add;
  }
  const hasGroups = s.actors.some((a) => a.group);
  const left = M + (hasGroups ? GROUP_PAD : 0);
  const cx: number[] = [left + s.actors[0]!.w / 2];
  for (let i = 1; i < n; i++) cx.push(cx[i - 1]! + gap[i - 1]!);

  // ---------- 头部 ----------
  const top = M + (hasGroups ? GROUP_HEAD + 4 : 0);
  const headH = Math.max(...s.actors.map((a) => a.h));
  const actors: Record<string, Box> = {};
  s.actors.forEach((a, i) => {
    actors[a.id] = { x: cx[i]! - a.w / 2, y: top + (headH - a.h), w: a.w, h: a.h };
  });

  // ---------- 行 ----------
  const blockOf = new Map(s.blocks.map((b) => [b.id, b]));
  const depthOf = (id: string): number => {
    let d = 0;
    for (let b = blockOf.get(id); b?.parent; b = blockOf.get(b.parent)) d++;
    return d;
  };
  let y = top + headH + 26;
  const messages: SequenceLayout['messages'] = {};
  const blockY = new Map<string, { y0: number; y1: number }>();
  let open: string[] = [];
  let k = 0;
  for (const m of s.messages) {
    // 离开的片段：收尾
    const keep = open.filter((b, i) => m.blocks[i] === b);
    for (const b of open.slice(keep.length).reverse()) {
      y += BLOCK_TAIL;
      blockY.get(b)!.y1 = y;
    }
    // 进入的片段：留出标签行
    for (const b of m.blocks.slice(keep.length)) {
      blockY.set(b, { y0: y, y1: y });
      y += BLOCK_HEAD;
    }
    open = [...m.blocks];
    if (!idx.has(m.from) || !idx.has(m.to)) continue; // 编译期已报 UNKNOWN_DIAGRAM_NODE
    k++;
    const lw = labelW(m.label);
    if (m.from === m.to) {
      const x = cx[idx.get(m.from)!]!;
      const ly = y + 18;
      const points: Point[] = [{ x, y: ly }, { x: x + SELF_W, y: ly }, { x: x + SELF_W, y: ly + 20 }, { x, y: ly + 20 }];
      messages[m.id] = { points, label: lw ? { x: x + SELF_W + 8, y: ly + 1, w: lw, h: 18 } : null, n: k, self: true };
      y += SELF_ROW;
    } else {
      const x1 = cx[idx.get(m.from)!]!;
      const x2 = cx[idx.get(m.to)!]!;
      const ly = y + 28;
      messages[m.id] = { points: [{ x: x1, y: ly }, { x: x2, y: ly }], label: lw ? { x: (x1 + x2) / 2 - lw / 2, y: ly - 24, w: lw, h: 18 } : null, n: k, self: false };
      y += ROW;
    }
  }
  for (const b of open.reverse()) {
    y += BLOCK_TAIL;
    blockY.get(b)!.y1 = y;
  }
  // 没有消息的片段（只有标题）
  for (const b of s.blocks) if (!blockY.has(b.id)) blockY.set(b.id, { y0: y, y1: (y += BLOCK_HEAD + BLOCK_TAIL) });
  const bottom = y + 18;

  // ---------- 片段框 ----------
  const blocks: Record<string, Box> = {};
  const blockTitles: Record<string, Box> = {};
  const involved = (bid: string): number[] => {
    const cols = new Set<number>();
    for (const m of s.messages) if (m.blocks.includes(bid) && idx.has(m.from) && idx.has(m.to)) [idx.get(m.from)!, idx.get(m.to)!].forEach((c) => cols.add(c));
    return [...cols];
  };
  for (const b of s.blocks) {
    const cols = involved(b.id);
    const d = depthOf(b.id);
    const inset = (BLOCK_PAD * 2) / 3;
    const c0 = cols.length ? Math.min(...cols) : 0;
    const c1 = cols.length ? Math.max(...cols) : n - 1;
    // 包含自调用时右侧多留出回环与标签
    const selfExtra = Math.max(0, ...s.messages.filter((m) => m.blocks.includes(b.id) && m.from === m.to && idx.get(m.from) === c1).map((m) => SELF_W + 8 + labelW(m.label)));
    const x0 = cx[c0]! - Math.max(BLOCK_PAD + 40, s.actors[c0]!.w / 2 - 6) + d * inset;
    const x1 = cx[c1]! + Math.max(BLOCK_PAD + 40, s.actors[c1]!.w / 2 - 6, selfExtra + 10) - d * inset;
    const yy = blockY.get(b.id)!;
    blocks[b.id] = { x: x0, y: yy.y0 + 2, w: x1 - x0, h: yy.y1 - yy.y0 - 2 };
    const title = `${b.kind}${b.label ? ` ${b.label}` : ''}`;
    blockTitles[b.id] = { x: x0, y: yy.y0 + 2, w: Math.min(x1 - x0, textWidth(title, EDGE_FONT) + 18), h: 20 };
  }

  // ---------- 生命线与分组 ----------
  const lifelines: SequenceLayout['lifelines'] = {};
  for (const a of s.actors) lifelines[a.id] = { x: cx[idx.get(a.id)!]!, y1: actors[a.id]!.y + actors[a.id]!.h, y2: bottom };
  const groups: Record<string, Box> = {};
  const titles: Record<string, Box> = {};
  for (const g of s.groups) {
    const members = s.actors.filter((a) => a.group === g.id);
    if (!members.length) continue;
    const x0 = Math.min(...members.map((a) => actors[a.id]!.x)) - GROUP_PAD;
    const x1 = Math.max(...members.map((a) => actors[a.id]!.x + actors[a.id]!.w)) + GROUP_PAD;
    groups[g.id] = { x: x0, y: M, w: x1 - x0, h: bottom + 6 - M };
    titles[g.id] = { x: x0 + 6, y: M + 4, w: Math.min(x1 - x0 - 12, groupTitleWidth(g.label, !!g.icon)), h: GROUP_HEAD - 6 };
  }

  // ---------- 整体尺寸 ----------
  const boxes = [...Object.values(actors), ...Object.values(groups), ...Object.values(blocks), ...Object.values(messages).flatMap((m) => (m.label ? [m.label] : []))];
  const maxX = Math.max(...boxes.map((b) => b.x + b.w), ...Object.values(messages).flatMap((m) => m.points.map((p) => p.x)));
  const minX = Math.min(...boxes.map((b) => b.x));
  const dx = minX < M ? M - minX : 0;
  const r2 = (v: number) => Math.round(v * 2) / 2;
  const mv = (b: Box): Box => ({ x: r2(b.x + dx), y: r2(b.y), w: r2(b.w), h: r2(b.h) });
  const mvAll = (o: Record<string, Box>) => Object.fromEntries(Object.entries(o).map(([k2, b]) => [k2, mv(b)]));
  return {
    kind: 'sequence',
    width: Math.ceil(maxX + dx + M),
    height: Math.ceil(bottom + 6 + M),
    actors: mvAll(actors),
    lifelines: Object.fromEntries(Object.entries(lifelines).map(([k2, l]) => [k2, { x: r2(l.x + dx), y1: r2(l.y1), y2: r2(l.y2) }])),
    messages: Object.fromEntries(Object.entries(messages).map(([k2, m]) => [k2, { ...m, points: m.points.map((p) => ({ x: r2(p.x + dx), y: r2(p.y) })), label: m.label ? mv(m.label) : null }])),
    groups: mvAll(groups),
    titles: mvAll(titles),
    blocks: mvAll(blocks),
    blockTitles: mvAll(blockTitles),
  };
}
