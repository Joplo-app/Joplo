/**
 * 看板与发布站的 URL（hash）：所有界面状态都在 hash 里，复制链接就能回到同一个项目 / 功能 / 方案 / 情况 / 场景 / 步骤 / 层级。
 *
 * 看板：  #/                         首页（选中最近打开的项目）
 *        #/settings[/<项目>]          旧的设置页（D51）：看板跳到首页并打开外观浮层（D55）
 *        #/<项目>                    首页，选中该项目
 *        #/<项目>/f/<功能>?o=&c=&s=&step=&l=   演示页
 * 发布站：#/                         首页（功能列表）
 *        #/f/<功能>?s=&step=&l=       演示页
 *        #/s/<场景>                   旧链接：直接进入该场景
 *
 * o = 方案、c = 情况、s = 场景、step = 位置（0 = 初始状态）、l = 手动选的层级（有 l 表示导演关闭；没有 = 导演跟随）、
 * speed = 自动播放速度（0.5 / 1.5；1× 不写）。
 * 设备不在 URL 里（D44）：每个页面只有一种设备，由 page 的 viewport 决定。
 */
export type PlayRoute = { featureId: string; workId?: string; caseId?: string; scenarioId?: string; step?: number; layer?: string; speed?: number };

export type BoardRoute = { kind: 'home'; projectId?: string } | { kind: 'play'; projectId: string; play: PlayRoute } | { kind: 'settings'; projectId?: string };
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
  return {
    featureId,
    ...(q.get('o') ? { workId: q.get('o')! } : {}),
    ...(q.get('c') ? { caseId: q.get('c')! } : {}),
    ...(q.get('s') ? { scenarioId: q.get('s')! } : {}),
    ...(Number.isInteger(n) && n >= 0 ? { step: n } : {}),
    ...(q.get('l') ? { layer: q.get('l')! } : {}),
    ...(q.get('speed') === '0.5' || q.get('speed') === '1.5' ? { speed: Number(q.get('speed')) } : {}),
  };
}

function playQuery(p: PlayRoute): string {
  const q = new URLSearchParams();
  if (p.workId) q.set('o', p.workId);
  if (p.caseId) q.set('c', p.caseId);
  if (p.scenarioId) q.set('s', p.scenarioId);
  if (p.step !== undefined) q.set('step', String(p.step));
  if (p.layer) q.set('l', p.layer);
  if (p.speed === 0.5 || p.speed === 1.5) q.set('speed', String(p.speed));
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
  if (parts[0] === 'settings') return parts[1] ? { kind: 'settings', projectId: parts[1] } : { kind: 'settings' };
  if (parts.length >= 3 && parts[1] === 'f') return { kind: 'play', projectId: parts[0]!, play: parsePlay(parts[2]!, query) };
  return { kind: 'home', projectId: parts[0]! };
}

export function boardHash(r: BoardRoute): string {
  if (r.kind === 'home') return r.projectId ? `#/${enc(r.projectId)}` : '#/';
  if (r.kind === 'settings') return r.projectId ? `#/settings/${enc(r.projectId)}` : '#/settings';
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

/** 演示页 hash 查询里认识的参数（parsePlay 读取的全部）。 */
export const PLAY_PARAMS = ['o', 'c', 's', 'step', 'l', 'speed'] as const;

/** 演示页 hash 查询里不认识的参数名（去重、按出现顺序）；不是演示页或没有查询时为空。 */
export function unknownPlayParams(hash: string): string[] {
  const { query } = split(hash);
  if (!query) return [];
  const known = new Set<string>(PLAY_PARAMS);
  return [...new Set([...new URLSearchParams(query).keys()].filter((k) => !known.has(k)))];
}

/**
 * 开发模式的提示（看板，以及在本机预览的发布站）：深链接里写错的参数（例如 layer= 应为 l=）会被静默忽略，
 * 这里在控制台说明一次。只是提示，不改变解析和播放；返回是否输出了提示。
 */
export function warnUnknownPlayParams(hash: string, warn: (message: string) => void = console.warn): boolean {
  const unknown = unknownPlayParams(hash);
  if (!unknown.length) return false;
  warn(`Joplo: ignored URL parameter${unknown.length > 1 ? 's' : ''} ${unknown.map((k) => `"${k}"`).join(', ')}. Deep links use o=<work id>, c=<case id>, s=<scenario id>, step=<n>, l=<layer key>, speed=0.5|1.5 (see npx joplo skill demo).`);
  return true;
}

/** 发布站只在本机预览时（localhost / 127.0.0.1 / ::1）算开发模式。 */
export const isLocalHost = (hostname: string) => hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1';
