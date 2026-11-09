import { $, callout, done, flow, fork, highlight, hold, mark, narrate, numbered, option, set, shot, spotlight, uses } from '@joplo-app/kit';

import { withDesignRecord } from '../../../shared/design/record.ts';
import { designRecords } from '../../../shared/design/records.ts';
import { CHAPTERS, initialUi, layers } from '../common.tsx';

/** 进入第 n 章：章节列表、画面标题、字幕和进度一起变。 */
const chapter = (n: 1 | 2 | 3 | 4, prog: number) => {
  const c = CHAPTERS[n - 1]!;
  return [
    set($.ui.ch, n),
    set($.ui.chapterTag, `第 ${n} 章`),
    set($.ui.chapterTitle, c.title),
    set($.ui.frameTitle, c.title.slice(3).split('：')[0]!),
    set($.ui.cap, c.cap),
    set($.ui.prog, prog),
  ];
};
const watching = { ui: { ...initialUi(), mode: 'video' } };

export default withDesignRecord(option({
  name: 'A · 视频式播放器',
  idea: '手机上把分享当成分章节的视频：竖屏是 16:10 画面加章节列表，横过来铺满屏幕；自动播放时一章接一章',
  focus: '手机上看分享的方式从“操作一个网页”变成“看一个视频”',
  tradeoffs: ['画面和电脑上看到的一样，不变形', '竖屏画面偏小，需要横过来才看得清细节', 'iPhone 只能伪横屏：画面旋转，地址栏和系统手势仍在'],

  layers: layers(),
  state: { ui: initialUi() },

  scenarios: {
    now: flow('现在：竖屏打开分享', { cases: ['now'], start: '/', outcome: 'failure', mock: '现在的发布站', expected: '（现状）画面被挤成竖条；标签挤在一起，字幕被盖住，控制条溢出' })
      .card('现在：小陈在地铁上点开链接', { role: 'chen', sub: '同事发来一个 Joplo 分享，他只有手机' }, narrate('小陈在地铁上点开同事发来的分享，手边只有手机。'))
      .system('画面被挤成竖条', '舞台按手机宽度重新排版', narrate('舞台按手机的宽度重新排版，原本横着设计的画面被挤成了竖条。'), shot('n_video'), uses('video_aspect'))
      .system('四处溢出', '标签、字幕、控制条都放不下', narrate('图层标签挤成一团，字幕被朗读标签盖住，控制条也溢出了。'), numbered('n_reading', 'n_controls'), uses('mobile_chrome'),
        done('在手机上看不下去', 'failure')),

    watch: flow('从头看到尾，横过来看', { cases: ['watch'], start: '/', state: watching, expected: '一章播完自动接下一章；点「横屏」铺满屏幕，点画面出控件，滑动切步骤' })
      .card('改进后：小陈再点开链接', { role: 'chen', sub: '这次像打开一个视频' }, narrate('同一个链接，这次打开像一个视频。'))
      .system('竖屏播放页', '16:10 画面、字幕、控制条、章节', narrate('上面是和电脑上一样比例的画面，下面是字幕、一行控制条和章节列表。'), numbered('p_video', 'p_caption', 'p_controls', 'p_chapters'), hold(5), uses('video_aspect', 'mobile_chrome'))
      .click('p_play', '小陈点播放', narrate('点播放，自动往下放，还带旁白。'), set($.ui.playing, true), ...chapter(1, 12), shot('p_video'))
      .system('第 1 章播完', '自动进入第 2 章', narrate('第一章播完，不用点，直接进入第二章。'), ...chapter(2, 30), set($.ui.nextHint, '下一章 · 3 秒后播放：02 规则：三十秒讲清楚'), highlight('p_ch2'), uses('autoplay_next'))
      .click('p_land', '想看清楚，点「横屏」', narrate('想看清楚细节，点横屏。'), set($.ui.nextHint, ''), ...chapter(2, 38), uses('android_lock'))
      .system('铺满屏幕', '画面铺满，字幕在底部', narrate('画面铺满整个屏幕，只剩画面和字幕，像在看视频。'), ...chapter(3, 55), shot('phone_landscape'), uses('landscape_fill'))
      .system('点一下画面', '控件浮出，3 秒后隐藏', narrate('点一下画面，控件浮出来；不碰它，三秒后自己藏起来。'), set($.ui.ctl, true), mark('l_stage', { kind: 'circle', note: '点一下' }), spotlight('l_controls'))
      .system('向左滑', '滑动切到下一步', narrate('向左一滑，就是下一步。'), set($.ui.ctl, false), set($.ui.swipe, '下一步 ›'), mark('l_swipe', { kind: 'arrow', note: '向左滑' }), uses('swipe_steps'))
      .system('第 4 章', '一章接一章，播到最后一章', narrate('就这样一章接一章，一直播到最后。'), set($.ui.swipe, ''), ...chapter(4, 88), hold(3),
        done('在手机上从头看到尾')),

    ios_locked: flow('iPhone 锁着竖屏点「横屏」', { cases: ['ios_locked'], start: '/', state: watching, expected: '画面转 90° 铺满屏幕，提示把手机横过来；横过来后不再旋转' })
      .card('小陈用的是 iPhone，锁着竖屏', { role: 'chen', sub: 'Safari 不能让网页全屏，也不能锁方向' }, narrate('换成 iPhone，而且锁着竖屏。Safari 不允许网页全屏，也不能锁方向。'))
      .click('p_land', '小陈点「横屏」', narrate('他点横屏。'), set($.ui.playing, true), ...chapter(2, 30))
      .system('画面转 90°', '画面转过来铺满屏幕', narrate('网页就把画面转九十度铺满屏幕，并提示把手机横过来。'), set($.ui.rotateHint, true), shot('phone_rotated'), callout('r_hint', '手机还竖着，画面先转过来'), uses('ios_rotate'))
      .system('横过来看', '手机横过来，画面正好是正的', narrate('手机一横过来，画面正好是正的。'), set($.ui.rotateHint, false), ...chapter(3, 55), shot('phone_landscape'),
        done('iPhone 上也能横屏看')),

    end: flow('最后一章播完', { cases: ['end'], start: '/', state: { ui: { ...initialUi(), mode: 'video', playing: true, ch: 4, chapterTag: '第 4 章', frameTitle: '影响', cap: '最后，说说和你有关的部分', prog: 96 } }, expected: '停在结束画面：重看、复制链接' })
      .system('最后一章播完', '停在结束画面', narrate('最后一章播完，停在结束画面，不会再跳到别处。'), set($.ui.playing, false), set($.ui.ended, true), set($.ui.prog, 100), set($.ui.cap, ''), spotlight('p_video'), uses('autoplay_next'))
      .click('p_replay', '小陈点「重看」', narrate('想再看一遍，点重看，从第一章开始。'), set($.ui.ended, false), set($.ui.playing, true), ...chapter(1, 2), highlight('p_ch1'),
        done('从第一章重新开始'), fork('可选：幕后说明', 'optional_branch')),

    optional_branch: flow('可选支线：主动进入，播完停下', { cases: ['optional_branch'], from: 'end', autoplay: false, expected: '连续播放跳过这条支线；主动选择后可以观看，结束停下并提供返回主线入口' })
      .system('打开幕后', '观众主动选择了支线', set($.ui.chapterTag, '可选支线'), set($.ui.frameTitle, '故事背后的选择'), set($.ui.cap, '主线继续向前，支线留给好奇的人'), set($.ui.playing, true), shot('p_video'), narrate('这段只在观众选择后播放。它不会插入原本的章节顺序。'), uses('optional_autoplay'))
      .system('支线结束', '停下，等待观众选择', set($.ui.playing, false), set($.ui.cap, '回到主线，或留在这里'), fork('回到主线', 'watch'), done('支线由观众决定，不自动接续')),
  },
}), designRecords.mobile_watch);
