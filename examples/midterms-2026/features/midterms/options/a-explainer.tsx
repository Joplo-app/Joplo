import { $, callout, done, flow, highlight, hold, layer, narrate, numbered, option, set, shot, spotlight } from '@joplo-app/kit';
import { BallotLayer, TermLayer, basicsMap, basicsSeats, basicsState } from '../../../shared/basics.tsx';
import { CoverLayer, coverFlip, coverState } from '../../../shared/cover.tsx';
import { GOV_SOURCE, SENATE } from '../../../shared/data.ts';
import { HistoryLayer, histCols, historyState } from '../../../shared/history.tsx';
import { AiLayer, MarketLayer, VIX, aiBars, indexBars, marketState } from '../../../shared/market.tsx';
import { C } from '../../../shared/palette.ts';
import { AT, PowerLayer, STAMP_UP, congressBlue, powerState, stampDown } from '../../../shared/power.tsx';
import { CongressLayer, MapLayer, WhyLayer, counts, maps, resultsState, seats } from '../../../shared/results.tsx';

/** 一次 set 多个 $.data / $.ui 字段。 */
const setData = (o: Record<string, unknown>) => Object.entries(o).map(([k, v]) => set(($.data as unknown as Record<string, never>)[k]!, v as never));
const setUi = (o: Record<string, unknown>) => Object.entries(o).map(([k, v]) => set(($.ui as unknown as Record<string, never>)[k]!, v as never));

const b = basicsState();
const cv = coverState();
const r = resultsState();
const m = marketState();
const p = powerState();

export default option({
  name: '深色快剪版',
  idea: '自媒体快剪风格：深色舞台、红蓝强对比、真实照片做调色，每一章用钩子开场、用画面里的变化讲事实',
  layers: {
    cover: layer('开场', <CoverLayer />, { icon: 'window' }),
    term: layer('任期', <TermLayer />, { icon: 'flow' }),
    ballot: layer('选票', <BallotLayer />, { icon: 'doc' }),
    congress: layer('席位', <CongressLayer />, { icon: 'data' }),
    map: layer('地图', <MapLayer />, { icon: 'browser' }),
    why: layer('原因', <WhyLayer />, { icon: 'chat' }),
    power: layer('对峙', <PowerLayer />, { icon: 'server' }),
    history: layer('历史', <HistoryLayer />, { icon: 'data' }),
    market: layer('股市', <MarketLayer />, { icon: 'data' }),
    ai: layer('AI', <AiLayer />, { icon: 'agent' }),
  },
  state: {
    ui: { ...cv.ui, ...b.ui, ...r.ui, ...p.ui, ...m.ui },
    data: { ...cv.data, ...b.data, ...r.data, ...p.data, ...historyState(), ...m.data },
  },
  scenarios: {
    // ---------- 00 开场 ----------
    hook: flow('一夜之间，特朗普丢掉了整个国会', { cases: ['hook'], start: '/', description: '一夜之间，国会由红变蓝' })
      .system('选票上没有他', '选票上没有特朗普的名字', narrate('十一月三号，美国人去投票。选票上没有特朗普的名字，可这次投票，决定了他接下来两年还能做多少事。'),
        highlight('cv_intro'), hold(4))
      .system('一夜之间', '一夜之间，国会由红变蓝', narrate('结果出来，一夜之间，众议院和参议院同时被民主党拿走。'),
        ...setUi({ cover: 'flip' }), ...setData(coverFlip), highlight('cv_flip'), hold(4))
      .system('三个问题', '接下来讲清楚三件事', narrate('中期选举到底选什么？特朗普接下来会被怎样卡住？和你的股票账户又有什么关系？一个一个说。'),
        ...setUi({ cover: 'ask' }), spotlight('cv_ask'), hold(5), done('带着三个问题往下看')),

    // ---------- 01 中期选举是什么 ----------
    basics: flow('中期选举，到底在选什么？', { cases: ['basics'], start: '/', description: '一张选票，改写整个国会' })
      .card('01 中期选举，到底在选什么？', { sub: '三十秒讲清楚' }, narrate('先花三十秒，把规则讲清楚。'))
      .system('总统就职', '2025 年 1 月，特朗普第二次就职', narrate('总统一届四年。特朗普这一届，从二零二五年一月开始。'), set($.ui.term, 'start'), set($.data.termWidth, '1.4%'), highlight('m_inaug'))
      .system('走到一半', '走到一半，就是中期选举', narrate('走到第二年年底，正好是任期的一半，所以叫中期选举。'), set($.ui.term, 'mid'), set($.data.termWidth, '47.1%'), highlight('m_mid'))
      .system('下一次大选', '总统本人要等到 2028 年', narrate('总统本人要等到二零二八年。这一次，换的是国会和各州的人。'), set($.ui.term, 'next'), set($.data.termWidth, '100%'), highlight('f_pres'), hold(4))
      .select('b_house', 'D', '第一项：众议员，435 席全换', narrate('拿到选票，第一项是众议员。全国四百三十五个席位，同一天全部重选。'),
        set($.data.bHouse, basicsSeats.houseUp), set($.data.bHouseSub, '435 席全部改选'), highlight('p_house'))
      .select('b_senate', 'R', '第二项：参议员，只换 35 席', narrate('第二项是参议员。参议员一当六年，这次只换三十五席，大约三分之一。'),
        set($.data.bSenate, basicsSeats.senateUp), set($.data.bSenateSub, '100 席中改选 35 席'), set($.data.bMap, basicsMap.senate.fill), set($.data.bMapInk, basicsMap.senate.ink), set($.data.bMapSub, '35 个州选参议员'), highlight('p_senate'))
      .select('b_gov', 'D', '第三项：36 个州选州长', narrate('第三项是州长，三十六个州同时换人。'),
        set($.data.bMap, basicsMap.gov.fill), set($.data.bMapInk, basicsMap.gov.ink), set($.data.bMapSub, '36 个州选州长'), highlight('p_gov'))
      .card('中期选举 = 总统的期中考', { points: ['众议院 435 席全部重选', '参议院改选约三分之一', '36 个州同时选州长'] }, narrate('一句话：中期选举，就是选民给总统的期中考。'),
        done('看懂一张选票选什么')),

    // ---------- 02 结果 ----------
    results: flow('蓝色浪潮有多大？', { cases: ['results'], start: '/', description: '两院一起翻蓝，七个州翻转' })
      .card('02 蓝色浪潮有多大？', { sub: '数据截至美东时间 11 月 7 日' }, narrate('那这次的结果，到底有多夸张？'))
      .system('选前', '选前：两院都是共和党', narrate('先看选前。众议院和参议院，红色都过了中线，也就是都在共和党手里。'), numbered('c_house', 'c_senate'), hold(4))
      .system('众议院', '众议院：民主党 254 席', narrate('开票后，众议院的蓝色一路越过中线。民主党已经拿到两百五十四席，还有十九席没出结果。'),
        set($.data.rHouse, seats.houseAfter), ...setData(counts.houseAfter), set($.data.resTitle, '众议院：民主党 254 席，远远越过 218'), callout('r_house', '中线就是过半数：218 席'), hold(5))
      .system('参议院', '参议院也翻了：54 比 44', narrate('参议院更难翻，这次也翻了。民主党党团五十四席，过了五十一的半数线。'),
        set($.data.rSenate, seats.senateAfter), ...setData(counts.senateAfter), set($.data.resTitle, '参议院也丢了：民主党党团 54 席'), highlight('c_senate'), hold(4))
      .system('全国', '全国得票领先约 13 个百分点', narrate('全国加起来，民主党领先十三个百分点左右。投票率接近一半，是一百多年来第二高的中期选举。'),
        set($.ui.resStage, 'national'), set($.data.resTitle, '不是险胜，是一边倒'), numbered('n_vote', 'n_turnout', 'n_gov'), hold(5))
      .system('参议院地图', '参议院：7 个州由红翻蓝', narrate('放到地图上看。带白框的七个州，原本都是共和党的参议员，这次全被翻掉。'),
        set($.data.rMap, maps.senate.fill), set($.data.rMapInk, maps.senate.ink), set($.data.rMapRing, maps.senate.ring), set($.data.mapSource, SENATE.source), highlight('r_map'))
      .click('btn_tx', '得州：38 年来第一个民主党参议员', narrate('最让人意外的是得州。上一次得州选出民主党参议员，还是一九八八年。'), set($.ui.race, 'TX'), highlight('r_map_TX'))
      .click('btn_me', '缅因：共和党老将柯林斯落选', narrate('缅因州，做了将近三十年参议员的柯林斯，也输了。'), set($.ui.race, 'ME'), highlight('r_map_ME'))
      .system('州长', '州长：5 个州由红翻蓝', narrate('州长也一样。得州、佐治亚、俄亥俄、艾奥瓦、内华达，五个州由红翻蓝。'),
        set($.ui.race, ''), set($.ui.mapMode, 'gov'), set($.data.rMap, maps.gov.fill), set($.data.rMapInk, maps.gov.ink), set($.data.rMapRing, maps.gov.ring), set($.data.mapTitle, '州长：5 个州由红翻蓝'), set($.data.mapSource, GOV_SOURCE), highlight('r_map'))
      .system('为什么', '选民在用选票说：太贵了', narrate('为什么？最直接的答案是钱包。九成选民说生活成本是关键，三分之二认为特朗普的政策推高了通胀。'),
        numbered('why_approval', 'why_cost', 'why_inflation'), hold(6), done('看到两院翻蓝和原因')),

    // ---------- 03 后果 ----------
    stakes: flow('他接下来会被怎样卡住？', { cases: ['stakes'], start: '/', description: '白宫 vs 国会：否决、停摆、调查' })
      .card('03 他接下来会被怎样卡住？', { sub: '从 2027 年 1 月 3 日起' }, narrate('国会换了主人，特朗普接下来会被怎样卡住？'))
      .system('国会变蓝', '1 月 3 日，新国会就职', narrate('明年一月三号，新国会宣誓就职。白宫还是红的，国会变成了蓝的。这就叫分裂政府。'),
        ...setData(congressBlue), set($.data.rule, '2027 年 1 月 3 日起：国会两院归民主党，白宫还是特朗普'), highlight('cap_chips'), hold(3))
      .system('送出法案', '民主党能在国会通过法案', narrate('民主党现在能让自己的法案在国会通过，然后送到白宫。'),
        ...setData({ paperOp: 1, paperKind: '法案', paperText: '两院都已通过，等待总统签字', paperX: AT.whitehouse }), set($.data.rule, '法案在国会通过后，最后一步要总统签字'), spotlight('paper'))
      .system('否决', '特朗普：会否决', narrate('可特朗普已经放话：民主党送来的法案，他会否决。'),
        ...setData(stampDown('否决', AT.whitehouse, C.rep)), set($.data.rule, '特朗普选后表态：民主党送来的“疯狂法案”，他会否决'), highlight('stamp'))
      .system('推翻否决', '想推翻否决？票不够', narrate('国会能不能推翻否决？要两院各三分之二。民主党差得很远。'),
        set($.ui.override, true), ...setData({ ...STAMP_UP, paperOp: 0, paperX: AT.congress }), set($.data.rule, '结果：谁也推不动谁，这就是僵局'), hold(5))
      .system('预算', '预算谈不拢，政府就停摆', narrate('更要命的是钱。政府每一笔开支都要国会批。谈不拢，政府就关门。'),
        set($.ui.override, false), ...setData({ paperOp: 1, paperKind: '政府预算', paperText: '每一笔联邦开支都要国会批准', paperX: '50%' }),
        set($.data.rule, '钱袋子在国会：谈不拢，政府就停摆'), spotlight('paper'))
      .system('停摆', '盖章：停摆', narrate('上一次停摆就在去年秋天，整整四十三天，史上最长。'), ...setData(stampDown('停摆', '50%', C.gold)),
        set($.data.rule, '上一次停摆：2025 年秋天，持续 43 天，史上最长'), highlight('stamp'))
      .system('传票', '调查权换到民主党手里', narrate('还有调查。国会各委员会的主席换成民主党，听证、传票，都由他们来发。'),
        ...setData({ ...STAMP_UP, paperKind: '传票', paperText: '国会委员会要求出席听证、提交文件', paperX: AT.whitehouse }),
        set($.data.rule, '委员会主席换成民主党：听证、调查、传票都由他们发起'), spotlight('paper'))
      .system('提名', '部长和法官，要参议院点头', narrate('最后是人事。部长、大使、联邦法官，都要参议院同意。现在这道门在民主党手里。'),
        ...setData({ paperKind: '人事提名', paperText: '部长 · 大使 · 联邦法官', paperX: AT.congress }), set($.data.rule, '内阁和法官提名要参议院同意：这一关也换了人'), spotlight('paper'))
      .system('搁置', '盖章：搁置', ...setData(stampDown('搁置', AT.congress, C.gold)), highlight('stamp'))
      .system('反转', '可这几乎是宿命', narrate('先别急着说特朗普完了。一九四六年以来二十次中期选举，执政党十八次丢席，平均丢二十六席。'),
        set($.data.hist, histCols('past')), callout('col_2002', '20 次里只有 2 次例外'), hold(5))
      .system('2026', '2026：至少丢 39 席', narrate('这一次，共和党至少丢了三十九席。比平均更惨，但还没到奥巴马二零一零年的六十三席。'),
        set($.data.hist, histCols('all')), callout('col_2026', '至少 −39，还有 19 席未定'), hold(5))
      .card('接下来两年', { points: ['法案：国会能通过，总统能否决，谁也推不动谁', '预算：谈不拢就停摆', '调查和人事：主动权换到民主党手里'] }, narrate('接下来两年，大概率是僵局。法案互相卡，预算随时可能停摆，调查和人事的主动权，到了民主党手里。'),
        done('看懂失去国会的后果')),

    // ---------- 04 AI 和股市 ----------
    money: flow('AI 和股市：你的钱会怎样？', { cases: ['money'], start: '/', description: '利好只撑一天，AI 股冰火两重天' })
      .card('04 AI 和股市：你的钱会怎样？', { sub: '选后三个交易日' }, narrate('最后，说说大家最关心的：钱。'))
      .system('第一天', '第一天：道指大涨 3%', narrate('结果出来第一天，市场先是欢呼。道指涨了百分之三，是一年半以来最好的一天。'),
        set($.ui.day, 'd1'), set($.data.idx, indexBars.d1), set($.data.vix, VIX.d1), set($.data.vixColor, C.ink), set($.data.mkTitle, '第一天：“分裂政府利好股市”'), highlight('idx_dow'))
      .system('第二天', '第二天：纳指暴跌 5.5%', narrate('可第二天，风向突变。纳斯达克跌了百分之五点五，芯片股一天跌了百分之十二，二零二零年三月以来最惨。'),
        set($.ui.day, 'd2'), set($.data.idx, indexBars.d2), set($.data.vix, VIX.d2), set($.data.vixColor, C.rep), set($.data.mkTitle, '第二天：利好只撑了一天'), highlight('idx_sox'), hold(4))
      .system('恐慌', '恐慌指数一天涨了七成', narrate('恐慌指数从十六点六一下跳到二十八。'), spotlight('vix'))
      .system('第三天', '第三天：小幅反弹', narrate('周五小幅反弹，但没收复失地。'), set($.ui.day, 'd3'), set($.data.idx, indexBars.d3), set($.data.vix, VIX.d3), set($.data.vixColor, C.gold), set($.data.mkTitle, '第三天：小反弹，没收复失地'))
      .system('AI 分化', '云巨头涨，芯片和算力跌', narrate('AI 股一半天堂一半地狱。亚马逊、微软、谷歌这些手里已经有算力的，周线反而涨；卖芯片、租算力的，全线大跌。'),
        set($.data.ai, aiBars.week), shot('ai_bars'), hold(5))
      .system('为什么', '因为这是一场“数据中心选举”', narrate('为什么？这次很多人是投票反对在家门口建数据中心。地方公投四十一项，四十项站在限制一边。'),
        spotlight('ai_why'), numbered('f_vote', 'f_gs', 'f_tx'), hold(6))
      .card('别把账全算在选举头上', { points: ['同一周：油价跌约 13%，财报偏弱', '分裂政府 ≠ 一定利好：这次好消息只撑了一天', '历史上：选后一年标普平均涨约 15%'] },
        narrate('最后提醒一句：同一周还有油价暴跌、财报不好、加息预期，别把账全算在选举头上。历史上，中期选举之后一年，美股平均是涨的。'),
        done('看懂选后股市和 AI 的变化')),
  },
});
