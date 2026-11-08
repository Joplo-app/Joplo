/**
 * 演示里出现的全部事实数字，集中放在这里，便于核对与更新。
 * 截至：美东时间 2026-11-07（AP 宣布结果，经 Yahoo / CBS / ABC / NBC 转引）。
 * “已宣布”是媒体预测，不是各州认证结果；未定席位仍在计票。
 */

export const AS_OF = '数据截至美东时间 2026 年 11 月 7 日';

/** 众议院：2024 年选后格局（220 R / 215 D）；本次 AP 统计 254 D / 162 R / 19 未定。 */
export const HOUSE = {
  before: { D: 215, R: 220 },
  after: { D: 254, R: 162, U: 19 },
  majority: 218,
  source: '来源：AP（11/7）。民主党 254 席、共和党 162 席、19 席未定；NBC、CBS 预计民主党最终约 256–258 席。',
};

/** 参议院：选前 53 R / 47 D（含 2 名与民主党同一党团的独立派）；本次 54 D 党团 / 44 R / 2 未定（密西西比、阿拉斯加）。 */
export const SENATE = {
  before: { D: 45, I: 2, R: 53 },
  after: { D: 52, I: 2, R: 44, U: 2 },
  majority: 51,
  source: '来源：AP（11/7）、ABC（11/8）。民主党党团 54 席含 2 名独立派；密西西比、阿拉斯加仍在计票。',
};

/** 全国众议院得票（Cook Political Report，约 1.13 亿票已计）与初步投票率（佛罗里达大学 Michael McDonald）。 */
export const NATIONAL = {
  popularLead: '约 13 个百分点',
  turnout: '约 49%',
  turnoutNote: '初步估计，1914 年以来中期选举第二高（仅次于 2018 年）',
};

/** 为什么：特朗普支持率（Ballotpedia 10 月底均值）与 AP VoteCast 选民调查。 */
export const WHY = {
  approval: '38%',
  approvalNote: '特朗普选前支持率（Ballotpedia 10 月底平均）',
  costOfLiving: '约 9 成',
  costNote: '选民说生活成本是关键或主要因素（AP VoteCast）',
  inflation: '约 2/3',
  inflationNote: '选民认为特朗普的政策推高了通胀（AP VoteCast）',
};

/**
 * 参议院 35 场选举（33 个常规席位 + 俄亥俄、佛罗里达两场补选）的结果。
 * 民主党原有的 13 席全部保住；共和党原有 22 席中 7 席翻转、2 席未定、13 席保住。
 */
export const SENATE_RESULT: Record<string, 'D' | 'R' | 'U'> = {
  // 民主党保住
  CO: 'D', DE: 'D', GA: 'D', IL: 'D', MA: 'D', MI: 'D', MN: 'D', NH: 'D', NJ: 'D', NM: 'D', OR: 'D', RI: 'D', VA: 'D',
  // 共和党 → 民主党
  NC: 'D', ME: 'D', OH: 'D', TX: 'D', IA: 'D', KS: 'D', SC: 'D',
  // 未定
  MS: 'U', AK: 'U',
  // 共和党保住
  AL: 'R', AR: 'R', ID: 'R', KY: 'R', LA: 'R', MT: 'R', NE: 'R', OK: 'R', SD: 'R', TN: 'R', WV: 'R', WY: 'R', FL: 'R',
};
export const SENATE_FLIPS = ['NC', 'ME', 'OH', 'TX', 'IA', 'KS', 'SC'];

/** 州长：民主党翻转 5 州；堪萨斯（原民主党）、阿拉斯加（原共和党）未定。 */
export const GOV_FLIPS = ['TX', 'GA', 'OH', 'IA', 'NV'];
export const GOV_PENDING = ['KS', 'AK'];
export const GOV_SOURCE = '来源：AP（经 PBS 转引）、ABC、Fox（11/4–11/7）。已宣布：民主党 28 席、共和党 20 席，2 席未定。';

/** 关键战场的细节（得票率为 ABC 11/8 页面的四舍五入数）。 */
export const RACES = {
  TX: { state: '得克萨斯', winner: '詹姆斯·塔拉里科（民主党）', loser: '肯·帕克斯顿（共和党）', pct: '约 55% : 43%', note: '1988 年以来得州第一次选出民主党参议员' },
  ME: { state: '缅因', winner: '特洛伊·杰克逊（民主党）', loser: '苏珊·柯林斯（共和党，现任）', pct: '约 53% : 47%', note: '共和党现任参议员柯林斯落选并已认输' },
  NC: { state: '北卡罗来纳', winner: '罗伊·库珀（民主党）', loser: '迈克尔·沃特利（共和党）', pct: '约 59% : 39%', note: '前州长库珀拿下共和党留下的空缺席位' },
};

/**
 * 1946–2022 年 20 次中期选举，总统所在党在众议院的席位变化（UCSB 美国总统项目，2026-07-13 更新）。
 * 平均约 −26 席；只有 1998、2002 两次增加。
 */
export const HISTORY: { year: number; pres: string; party: 'D' | 'R'; house: number }[] = [
  { year: 1946, pres: '杜鲁门', party: 'D', house: -56 },
  { year: 1950, pres: '杜鲁门', party: 'D', house: -28 },
  { year: 1954, pres: '艾森豪', party: 'R', house: -18 },
  { year: 1958, pres: '艾森豪', party: 'R', house: -48 },
  { year: 1962, pres: '肯尼迪', party: 'D', house: -4 },
  { year: 1966, pres: '约翰逊', party: 'D', house: -47 },
  { year: 1970, pres: '尼克松', party: 'R', house: -12 },
  { year: 1974, pres: '福特', party: 'R', house: -48 },
  { year: 1978, pres: '卡特', party: 'D', house: -15 },
  { year: 1982, pres: '里根', party: 'R', house: -26 },
  { year: 1986, pres: '里根', party: 'R', house: -5 },
  { year: 1990, pres: '老布什', party: 'R', house: -8 },
  { year: 1994, pres: '克林顿', party: 'D', house: -54 },
  { year: 1998, pres: '克林顿', party: 'D', house: 4 },
  { year: 2002, pres: '小布什', party: 'R', house: 8 },
  { year: 2006, pres: '小布什', party: 'R', house: -30 },
  { year: 2010, pres: '奥巴马', party: 'D', house: -63 },
  { year: 2014, pres: '奥巴马', party: 'D', house: -13 },
  { year: 2018, pres: '特朗普', party: 'R', house: -41 },
  { year: 2022, pres: '拜登', party: 'D', house: -9 },
];
/** 2026：相对 2024 年选后 220 席，共和党至少失去 39 席（AP 11/7 仍有 19 席未定）。 */
export const HISTORY_2026 = { year: 2026, pres: '特朗普', party: 'R' as const, house: -39 };
export const HISTORY_SOURCE = '来源：UCSB 美国总统项目（1946–2022）；2026 年为 AP 11/7 统计下的最少失席数，19 席未定。';
