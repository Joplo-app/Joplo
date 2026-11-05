/**
 * 看板与发布站的 URL（hash）：所有界面状态都在 hash 里，复制链接就能回到同一个项目 / 功能 / 方案 / 情况 / 场景 / 步骤 / 设备。
 *
 * 看板：  #/                         首页（选中最近打开的项目）
 *        #/<项目>                    首页，选中该项目
 *        #/<项目>/f/<功能>?o=&c=&s=&step=&d=   演示页
 * 发布站：#/                         首页（功能列表）
 *        #/f/<功能>?s=&step=&d=       演示页
 *        #/s/<场景>                   旧链接：直接进入该场景
 *
 * o = 方案、c = 情况、s = 场景、step = 位置（0 = 初始状态）、d = 设备（mobile / desktop；缺省按页面自身的 viewport）。
 */
export type Device = 'desktop' | 'mobile';
export type PlayRoute = { featureId: string; optionId?: string; caseId?: string; scenarioId?: string; step?: number; device?: Device };

export type BoardRoute = { kind: 'home'; projectId?: string } | { kind: 'play'; projectId: string; play: PlayRoute };
export type SiteRoute = { kind: 'home' } | { kind: 'play'; play: PlayRoute } | { kind: 'scenario'; scenarioId: string };

const dec = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};
const enc = encodeURIComponent;

function parsePlay(featureId: string, query: string): PlayRoute {
  const q = new URLSearchParams(query);
  const step = q.get('step');
  const n = step === null ? NaN : Number(step);
  const d = q.get('d');
  return {
    featureId,
    ...(q.get('o') ? { optionId: q.get('o')! } : {}),
    ...(q.get('c') ? { caseId: q.get('c')! } : {}),
    ...(q.get('s') ? { scenarioId: q.get('s')! } : {}),
    ...(Number.isInteger(n) && n >= 0 ? { step: n } : {}),
    ...(d === 'mobile' || d === 'desktop' ? { device: d } : {}),
  };
}

function playQuery(p: PlayRoute): string {
  const q = new URLSearchParams();
  if (p.optionId) q.set('o', p.optionId);
  if (p.caseId) q.set('c', p.caseId);
  if (p.scenarioId) q.set('s', p.scenarioId);
  if (p.step !== undefined) q.set('step', String(p.step));
  if (p.device) q.set('d', p.device);
  const s = q.toString();
  return s ? `?${s}` : '';
}

const split = (hash: string) => {
  const h = hash.replace(/^#/, '');
  const i = h.indexOf('?');
  return { path: i < 0 ? h : h.slice(0, i), query: i < 0 ? '' : h.slice(i + 1) };
};

export function parseBoardHash(hash: string): BoardRoute {
  const { path, query } = split(hash);
  const parts = path.split('/').filter(Boolean).map(dec);
  if (parts.length === 0) return { kind: 'home' };
  if (parts.length >= 3 && parts[1] === 'f') return { kind: 'play', projectId: parts[0]!, play: parsePlay(parts[2]!, query) };
  return { kind: 'home', projectId: parts[0]! };
}

export function boardHash(r: BoardRoute): string {
  if (r.kind === 'home') return r.projectId ? `#/${enc(r.projectId)}` : '#/';
  return `#/${enc(r.projectId)}/f/${enc(r.play.featureId)}${playQuery(r.play)}`;
}

export function parseSiteHash(hash: string): SiteRoute {
  const { path, query } = split(hash);
  const parts = path.split('/').filter(Boolean).map(dec);
  if (parts[0] === 'f' && parts[1]) return { kind: 'play', play: parsePlay(parts[1], query) };
  if (parts[0] === 's' && parts[1]) return { kind: 'scenario', scenarioId: parts[1] };
  return { kind: 'home' };
}

export function siteHash(r: SiteRoute): string {
  if (r.kind === 'home') return '#/';
  if (r.kind === 'scenario') return `#/s/${enc(r.scenarioId)}`;
  return `#/f/${enc(r.play.featureId)}${playQuery(r.play)}`;
}

export const samePlay = (a: PlayRoute, b: PlayRoute) => playQuery(a) === playQuery(b) && a.featureId === b.featureId;
