import { $, done, flow, free, hold, layer, narrate, option, patch, set } from '@joplo-app/kit';
import { camera } from '@joplo-app/plugin-content';
import { basicsMap, basicsSeats } from '../../../shared/basics.tsx';
import { AS_OF, GOV_SOURCE, HISTORY_SOURCE, HOUSE, SENATE } from '../../../shared/data.ts';
import { histCols, indexBars, VIX } from '../../../shared/film/bottom.tsx';
import { WorldLayer } from '../../../shared/film/world.tsx';
import { C } from '../../../shared/palette.ts';
import { maps, seats } from '../../../shared/results.tsx';

/**
 * 台本：整支片子是同一张画布上的一串状态变化。
 * - ui({...}) 一步改多处；camera(...) 移镜头（按区块 id 取景）；
 * - 每一章 flow({ from: '上一章' })：从上一章最后的画面接着开始，不翻页、不放章节卡；
 * - 每一步：镜头去哪 + 画面里哪个物件变了 + 一句旁白。屏幕上只放标签和数字，整句话交给字幕。
 */
const ui = (v: Record<string, string | number | boolean>) => patch($.ui, v);
const MAP_BLANK_RING = maps.blank.ring;
const SRC = {
  term: '美国宪法：总统任期四年，众议员两年，参议员六年。',
  ballot: '示意选票：各州选票格式不同；候选人为示意。参议院 35 席含俄亥俄、佛罗里达两场补选。',
  house: `${HOUSE.source} ${AS_OF}。`,
  why: '来源：Ballotpedia 支持率平均（10 月底）；AP VoteCast 选民调查（超过 10 万名选民）。',
  stakes: '规则：美国宪法第一条与第二条（否决与推翻否决、国会的拨款权；参议院的人事同意权）。上一次停摆：2025 年秋，持续 43 天。',
  market: '来源：TheStreet、CNBC 收盘数据（11/4–11/6）；VIX 为收盘值。红涨绿跌。',
  ai: '公投统计：Ballotpedia（经《科学美国人》）；高盛估计经 NBC 引述；个股周涨跌：The Glass Desk。',
};

// ---------- 00 开场：封面 → 推近 → 一夜翻蓝 → 拉远，三个问题钉在各自的区块上 ----------
const hook = flow('一夜之间，特朗普丢掉了整个国会', { cases: ['hook'], start: '/', description: '一夜之间，国会由红变蓝' })
  .system('选票上没有他', '选票上没有特朗普', camera('sd_trump', 'headline', { pad: 30, ms: 2200 }),
    narrate('十一月三号，美国人去投票。选票上没有特朗普的名字，可这次投票，决定了他接下来两年还能做多少事。'))
  .system('一夜之间', '一夜之间，国会由红变蓝', ui({ head: 'flip', capTint: '#2563eb', chipBg: C.dem, chipParty: '民主党' }), camera('headline', 'sd_cap', { pad: 20, ms: 1800 }),
    narrate('结果出来，一夜之间，众议院和参议院同时被民主党拿走。'), hold(3))
  .system('三个问题', '这一期讲清三件事', ui({ overview: true, q1: 'ask', q2: 'ask', q3: 'ask' }), camera({ ms: 2600, drift: { zoom: 1.1, ms: 10000 } }),
    narrate('中期选举到底选什么？特朗普接下来会被怎样卡住？和你的股票账户又有什么关系？一个一个说。'), hold(4),
    done('带着三个问题往下看'));

// ---------- 01 规则：任期过半 → 一张选票勾三项，席位和地图跟着亮 ----------
const basics = flow('中期选举，到底在选什么？', { cases: ['basics'], from: 'hook', description: '一张选票，改写整个国会' })
  .system('任期', '总统一届四年', ui({ overview: false, q1: 'now', chN: '01', src: SRC.term, term: 'start', termW: '1.4%' }), camera('c_term', { ms: 2400 }),
    narrate('先花三十秒，把规则讲清楚。总统一届四年，特朗普这一届从二零二五年一月开始。'))
  .system('走到一半', '走到一半，就是中期选举', ui({ term: 'mid', termW: '47.1%' }), camera('term_axis', { pad: 60, ms: 1600 }), hold(3),
    narrate('走到第二年年底，正好是任期的一半，所以叫中期选举。'))
  .system('下次大选', '总统本人要等到 2028', ui({ term: 'next', termW: '100%' }), camera('term_axis', 'f_pres', { pad: 40 }), hold(3),
    narrate('总统本人要等到二零二八年。这一次，换的是国会和各州的人。'))
  .select('b_house', 'D', '第一项：众议员，435 席全换', ui({ src: SRC.ballot, cgH: 'up' }), set($.data.house, basicsSeats.houseUp), camera('ballot', 'h_panel', { pad: 30, ms: 2000 }),
    narrate('拿到选票，第一项是众议员。全国四百三十五个席位，同一天全部重选。'))
  .select('b_senate', 'R', '第二项：参议员，只换 35 席', ui({ cgS: 'up' }), set($.data.senate, basicsSeats.senateUp), camera('ballot', 'c_congress', { pad: 20, ms: 1400 }),
    narrate('第二项是参议员。参议员一当六年，这次只换三十五席，大约三分之一。'))
  .select('b_gov', 'D', '第三项：州长', camera('ballot', { pad: 40, ms: 1600 }),
    narrate('第三项是州长。'))
  .system('36 个州', '36 个州同时选州长', ui({ mapMode: 'upGov', mapSide: 'up', mapTitle: '本次改选州长的州', mapBig: '36', mapBigSub: '个州同时选州长' }),
    set($.data.mapFill, basicsMap.gov.fill), set($.data.mapInk, basicsMap.gov.ink), set($.data.mapRing, MAP_BLANK_RING), camera('c_map', { ms: 2200 }),
    narrate('三十六个州同时换人。一张选票，同时改写国会和各州。'), hold(3))
  .system('记住', '中期选举 = 总统的期中考', ui({ q1: 'done' }), camera('tag_1', 'ballot', { pad: 40, ms: 1800 }), hold(3),
    narrate('一句话：中期选举不选总统，选的是国会和州长，像是选民给总统的期中考。'),
    done('看懂一张选票选什么'));

// ---------- 02 结果：同一张席位图由红翻蓝 → 地图上的翻转 → 原因 ----------
const results = flow('蓝色浪潮有多大？', { cases: ['results'], from: 'basics', description: '两院一起翻蓝，七个州翻转' })
  .system('选前', '选前：两院都在共和党手里', ui({ chN: '02', src: SRC.house, cgH: 'result', cgS: 'result', hD: '215', hU: '—', hR: '220', sD: '47', sU: '—', sR: '53' }),
    set($.data.house, seats.houseBefore), set($.data.senate, seats.senateBefore), camera('c_congress', { ms: 2000 }),
    narrate('那这次的结果，到底有多夸张？先看选前：两院的红色都过了中线，都在共和党手里。'), hold(3))
  .system('众议院', '众议院：民主党 254 席', ui({ hD: '254', hU: '19', hR: '162' }), set($.data.house, seats.houseAfter), camera('h_panel', { pad: 30, ms: 1400 }),
    narrate('开票后，众议院的蓝色一路越过中线。民主党已经拿到两百五十四席，还有十九席没出结果。'), hold(3))
  .system('参议院', '参议院也翻了：54 比 44', ui({ sD: '54', sU: '2', sR: '44', src: `${SENATE.source} ${AS_OF}。` }), set($.data.senate, seats.senateAfter), camera('s_panel', { pad: 30, ms: 1400 }),
    narrate('参议院更难翻，这次也翻了。民主党党团五十四席，过了五十一的半数线。'), hold(3))
  .system('全国', '全国得票领先约 13 个点', ui({ national: true }), camera('c_congress', { ms: 1600 }),
    narrate('全国加起来，民主党领先十三个百分点左右。投票率接近一半，是一百多年来第二高的中期选举。'), hold(3))
  .system('参议院地图', '7 个州的参议员由红翻蓝', ui({ mapMode: 'senate', mapSide: 'races', mapTitle: '参议院：7 个州由红翻蓝', src: SENATE.source }),
    set($.data.mapFill, maps.senate.fill), set($.data.mapInk, maps.senate.ink), set($.data.mapRing, maps.senate.ring), camera('c_map', { ms: 2200 }),
    narrate('放到地图上看。带白框的七个州，原本都是共和党的参议员，这次全被翻掉。'), hold(3))
  .click('btn_tx', '得州：38 年来第一次', ui({ race: 'TX' }), camera('r_map_TX', 'map_side', { pad: 30, ms: 1400 }),
    narrate('最让人意外的是得州。上一次得州选出民主党参议员，还是一九八八年。'))
  .click('btn_me', '缅因：柯林斯落选', ui({ race: 'ME' }), camera('r_map_ME', 'map_side', { pad: 30, ms: 1400 }),
    narrate('缅因州，做了将近三十年参议员的柯林斯，也输了。'))
  .system('州长', '州长：5 个州由红翻蓝', ui({ race: '', mapMode: 'gov', mapSide: 'none', mapTitle: '州长：5 个州由红翻蓝', src: GOV_SOURCE }),
    set($.data.mapFill, maps.gov.fill), set($.data.mapInk, maps.gov.ink), set($.data.mapRing, maps.gov.ring), camera('c_map', { ms: 1600 }),
    narrate('州长也一样。得州、佐治亚、俄亥俄、艾奥瓦、内华达，五个州由红翻蓝。'), hold(3))
  .system('为什么', '选民在用选票说：太贵了', ui({ why: true, src: SRC.why }), camera('c_why', { ms: 2200 }), hold(5),
    narrate('为什么？最直接的答案是钱包。九成选民说生活成本是关键，三分之二认为特朗普的政策推高了通胀。'),
    done('看到两院翻蓝和原因'));

// ---------- 03 后果：回到开场那一幕，文件在白宫和国会之间飞、盖章；再把丢掉的 39 席放进历史 ----------
const stakes = flow('他接下来会被怎样卡住？', { cases: ['stakes'], from: 'results', description: '白宫 vs 国会：否决、停摆、搁置' })
  .system('分裂政府', '2027 年 1 月 3 日：分裂政府', ui({ chN: '03', q2: 'now', head: 'none', split: true, sworn: true, src: SRC.stakes }), camera('c_standoff', { ms: 2400 }),
    narrate('回到开头这一幕。明年一月三号新国会就职，白宫还是红的，国会变成了蓝的。这就叫分裂政府。'), hold(3))
  .system('送出法案', '民主党能让法案在国会通过', ui({ sworn: false, paperAt: 'cap', paperKind: '法案', paperText: '两院都已通过，等待总统签字' }), camera('sd_cap', 'split_label', { pad: 20, ms: 1400 }),
    narrate('民主党现在能让自己的法案在国会通过，然后送到白宫。'))
  .system('否决', '送到白宫：否决', ui({ paperAt: 'wh', veto: 'on' }), camera('sd_trump', 'split_label', { pad: 20, ms: 1400 }), hold(2),
    narrate('可特朗普已经放话：民主党送来的法案，他会否决。'))
  .system('推翻否决', '想推翻否决？票不够', ui({ veto: 'row', override: true }), camera('override', { pad: 50, ms: 1400 }), hold(4),
    narrate('国会能不能推翻否决？要两院各三分之二。民主党差得很远，谁也推不动谁。'))
  .system('预算', '预算要国会批', ui({ override: false, paperAt: 'mid', paperKind: '政府预算', paperText: '每一笔联邦开支都要国会批准' }), camera('headline', { pad: 30, ms: 1400 }),
    narrate('更要命的是钱。政府每一笔开支都要国会批。'))
  .system('停摆', '谈不拢：停摆', ui({ shut: 'on' }), camera('headline', { pad: 30, drift: { zoom: 1.1, y: 30, ms: 8000 } }), hold(2),
    narrate('谈不拢，政府就关门。上一次停摆就在去年秋天，整整四十三天，史上最长。'))
  .system('传票', '调查权换到民主党手里', ui({ shut: 'row', paperAt: 'wh', paperKind: '传票', paperText: '国会委员会要求出席听证、提交文件' }), camera('sd_trump', 'split_label', { pad: 20, ms: 1400 }),
    narrate('还有调查。国会各委员会的主席换成民主党，听证、传票，都由他们来发。'))
  .system('提名', '部长和法官要参议院点头', ui({ paperAt: 'cap', paperKind: '人事提名', paperText: '部长 · 大使 · 联邦法官', shelve: 'on' }), camera('sd_cap', 'split_label', { pad: 20, ms: 1400 }), hold(2),
    narrate('最后是人事。部长、大使、联邦法官，都要参议院同意。现在这道门在民主党手里。'))
  .system('僵局', '接下来两年：大概率是僵局', ui({ shelve: 'row', paperAt: 'none', q2: 'done' }), camera('c_standoff', { pad: 10, ms: 1600 }), hold(3),
    narrate('所以接下来两年，大概率是僵局：法案互相卡，预算随时可能停摆，人事和调查的主动权到了民主党手里。'))
  .system('反转', '共和党至少丢了 39 席', ui({ lost: 'glow' }), camera('h_panel', { pad: 30, ms: 2000 }), hold(3),
    narrate('先别急着说特朗普完了。回到众议院，这些金色的点，是共和党确定丢掉的至少三十九席。'))
  .system('放进历史', '放进历史里比一比', ui({ lost: 'hist', src: HISTORY_SOURCE }), camera('c_history', { ms: 2000 }), hold(2),
    narrate('把这三十九席，放进历史里比一比。'))
  .system('宿命', '20 次里 18 次丢席', set($.data.hist, histCols(true)), camera('hist_chart', { pad: 30, ms: 1400 }), hold(3),
    narrate('一九四六年以来二十次中期选举，执政党十八次丢席，只有两次例外。'))
  .system('平均', '比平均更惨，但不是最惨', ui({ avg: true }), camera('col_2002', 'col_2026', 'col_2010', { pad: 60, ms: 1600 }), hold(4),
    narrate('平均丢二十六席。这一次比平均更惨，但还没到奥巴马二零一零年的六十三席。'),
    done('看懂失去国会的后果'));

// ---------- 04 钱：股市三天 → AI 股分成两堆 → 回到得州 → 全景，三个问题都有了答案 ----------
const money = flow('AI 和股市：你的钱会怎样？', { cases: ['money'], from: 'stakes', description: '利好只撑一天，AI 股冰火两重天' })
  .system('第一天', '第一天：道指大涨 3%', ui({ chN: '04', q3: 'now', src: SRC.market, day: 'd1', vix: VIX.d1, vixColor: C.ink }), set($.data.idx, indexBars.d1), camera('c_market', { ms: 2200 }),
    narrate('最后，说说大家最关心的：钱。结果出来第一天，市场先是欢呼，道指涨了百分之三，一年半以来最好的一天。'))
  .system('第二天', '第二天：芯片股跌 12%', ui({ day: 'd2', vix: VIX.d2, vixColor: C.rep }), set($.data.idx, indexBars.d2), camera('idx', { pad: 40, ms: 1400 }), hold(3),
    narrate('可第二天，风向突变。纳斯达克跌了百分之五点五，芯片股一天跌了百分之十二，二零二零年三月以来最惨。'))
  .system('恐慌', '恐慌指数一天涨了七成', camera('vix', 'idx_sox', { pad: 40, ms: 1400 }),
    narrate('恐慌指数从十六点六，一下跳到二十八。'))
  .system('第三天', '第三天：小反弹，没收复', ui({ day: 'd3', vix: VIX.d3, vixColor: C.gold }), set($.data.idx, indexBars.d3), camera('c_market', { ms: 1400 }),
    narrate('周五小幅反弹，但没收复失地。'))
  .system('AI 股', '同一周的十只 AI 股', ui({ ai: 'list', src: SRC.ai }), camera('c_ai', { ms: 2000 }), hold(2),
    narrate('再看 AI 股。同一周，十只股票，大部分在跌。'))
  .system('分成两堆', '云巨头涨，芯片和算力跌', ui({ ai: 'split' }), camera('ai_bars', { pad: 10, ms: 1400 }), hold(4),
    narrate('但分开看就清楚了。亚马逊、微软、谷歌这些手里已经有算力的，周线反而涨；卖芯片、租算力的，全线大跌。'))
  .system('回到得州', '一场“数据中心选举”', ui({ mapSide: 'dc', mapTitle: '得州：新州长要先暂停审批数据中心' }), set($.data.mapRing, { ...MAP_BLANK_RING, TX: `inset 0 0 0 6px ${C.gold}` }), camera('r_map_TX', 'map_side', { pad: 30, ms: 2000 }), hold(4),
    narrate('为什么？还记得得州吗？这次很多人是投票反对在家门口建数据中心。地方公投四十一项，四十项站在限制一边。'))
  .system('别全算在选举头上', '别把账全算在选举头上', ui({ notes: true, src: SRC.market }), camera('c_market', { ms: 2000 }), hold(4),
    narrate('也提醒一句：同一周还有油价暴跌、财报不好，别把账全算在选举头上。历史上，中期选举之后一年，美股平均是涨的。'))
  .system('全景', '三个问题，三个答案', ui({ q3: 'done', overview: true, chN: '', src: '数据截至美东时间 2026 年 11 月 7 日；来源见各区块与 assets/CREDITS.md。', cta: true }),
    camera({ ms: 2800, drift: { zoom: 1.15, ms: 26000 } }), hold(5),
    narrate('退后一步再看：中期选举选的是国会和州长；国会换了主人，法案、预算、人事都会被卡；钱的方面，利好只撑了一天，芯片和算力跌得最多。接下来两年，盯住否决、停摆和听证。'),
    done('看懂选后股市和 AI 的变化'));

export default option({
  name: '一镜到底版',
  idea: '整支片子是同一张“华盛顿地图”：选票、席位图、地图从头用到尾，镜头在区块间推拉摇；三个问题钉在各自的区块上，章末翻成答案',
  layers: { world: layer('世界', <WorldLayer />, { icon: 'flow' }) },
  free: {
    tx: free.click('btn_tx', set($.ui.race, 'TX')),
    me: free.click('btn_me', set($.ui.race, 'ME')),
  },
  state: {
    ui: {
      __plugins: { content: { camera: { targets: ['c_standoff'] } } },
      // 全局：章节、来源、全景、问题标签、片尾
      chN: '', src: '', overview: false, cta: false, q1: 'hidden', q2: 'hidden', q3: 'hidden',
      // 对峙
      head: 'intro', capTint: '#c0392b', chipBg: C.rep, chipParty: '共和党', split: false, sworn: false,
      paperAt: 'none', paperKind: '法案', paperText: '', veto: 'none', shut: 'none', shelve: 'none', override: false,
      // 任期、原因
      term: 'none', termW: '0%', why: false,
      // 席位
      cgH: 'blank', cgS: 'blank', hD: '', hU: '', hR: '', sD: '', sU: '', sR: '', national: false, lost: 'none',
      // 地图
      mapMode: 'blank', mapSide: 'none', race: '', mapTitle: '美国 50 个州（瓦片地图，一州一格）', mapBig: '', mapBigSub: '',
      // 历史、股市、AI
      avg: false, day: 'd0', vix: VIX.d0, vixColor: C.muted, notes: false, ai: 'none',
    },
    data: {
      house: basicsSeats.houseBlank, senate: basicsSeats.senateBlank,
      mapFill: maps.blank.fill, mapInk: maps.blank.ink, mapRing: maps.blank.ring,
      hist: histCols(false), idx: indexBars.empty,
    },
  },
  scenarios: { hook, basics, results, stakes, money },
});
