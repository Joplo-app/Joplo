/**
 * 同一个输入框从头到尾不换：四章接着上一章的画面开始，大字说明浮在输入框上方，字幕放正在说的那句话
 */
import { $, done, chapter, free, hold, layer, narrate, work, patch, role, say, stream } from '@joplo-app/kit';
import { VoiceWorld } from '../shared/world.tsx';

/**
 * 台本：四章连成一条，后一章默认接续前一章，接着上一章最后的画面开始。
 *
 * 一步 = 输入框的一个状态。两种声音：
 * - 用户说的每一小段是一个 system 步骤：say(这一小段, { role: 'me' }) 用“我”的声音读、字幕显示这句话；
 *   stream($.ui.spoken, 到目前为止说的全部, { pace: 'voice' }) 让框里的字跟着声音一个个出来（原有的字不重出）。
 * - 讲解用 narrate()：放在开始、停顿、完成这些步骤上，一步只读一句。
 */
const ui = (v: Record<string, string | boolean>) => patch($.ui, v);

/** 开始听：光标出现在说话位置，带一个小麦克风；底栏换成 取消 / 波形 / 计时 / 完成。 */
const listen = (hint: string) => ui({ rec: true, caret: true, hint, level: 'quiet', timer: '0:00', tip: '', empty: false });
/** 正在说：phrase 是这一小段（读出来、放进字幕），sofar 是到目前为止说的全部（框里跟着声音出字，虚下划线）。 */
const speak = (phrase: string, sofar: string, timer: string) => [
  say(phrase, { role: 'me' }),
  stream($.ui.spoken, sofar, { pace: 'voice' }),
  ui({ timer, level: 'loud', hint: '' }),
];
/** 说完一段停下来：波形回到短点，末尾虚线闪。 */
const pause = (timer: string) => ui({ level: 'pause', timer });
/** 结束：这次说的话并进原文，去掉虚下划线；字留在框里，不发出去。 */
const commit = (text: string, after = '') => ui({ rec: false, finishing: false, before: text, spoken: '', after, hint: '', level: 'quiet', tip: '' });
const chapterLabel = (no: string, title: string) => ui({ chNo: no, chTitle: title });

// ---------- 01 开始说 ----------
const S1 = '帮我写一封邮件给王总。告诉他，发布会改到下周四下午。';
const start = chapter('开始说', { expected: '点麦克风开始，说的话边说边出现；停顿时末尾虚线闪着表示还在听；点完成后字留在框里，不会自动发出去', description: '点一下麦克风，说的话实时写进输入框' })
  .card('Manus 语音输入', { sub: '这是 Manus 的语音输入：你说的话，会实时写在光标处' })
  .hover('mic', 900, '点麦克风，或按 Control D', chapterLabel('01', '开始说'), ui({ tip: 'mic', headline: '点一下麦克风，或者按 Control D，就能开始' }),
    narrate('想把要求说出来，不想打字？点一下麦克风，或者按 Control D。'))
  .click('mic', '点一下，开始听', listen('请说，我在听…'), ui({ tip: 'finish', headline: '' }), narrate('它马上开始听。'), hold(1))
  .system('说', '“帮我写一封”', speak('帮我写一封', '帮我写一封', '0:03'), ui({ tip: '' }), hold(0.5))
  .system('说', '“邮件给王总。”', speak('邮件给王总。', '帮我写一封邮件给王总。', '0:04'), hold(0.5))
  .system('说', '“告诉他，”', speak('告诉他，', '帮我写一封邮件给王总。告诉他，', '0:05'), hold(0.5))
  .system('说', '“发布会改到下周”', speak('发布会改到下周', '帮我写一封邮件给王总。告诉他，发布会改到下周', '0:07'), hold(0.5))
  .system('说', '“四下午。”', speak('四下午。', S1, '0:08'), hold(0.5))
  .system('停顿', '停下来想一想', pause('0:10'), ui({ headline: '停下来想一想的时候，末尾这段短虚线会一直闪，表示还在听' }),
    narrate('停下来想一想也没关系。末尾这段短虚线一直在闪，说明它还在听。'), hold(3))
  .click('finish', '点完成', ui({ finishing: true, level: 'quiet', headline: '' }), narrate('说完了，点完成。'), hold(0.8))
  .system('完成', '字留在输入框里', commit(S1), ui({ caret: false, headline: '点完成，字就留在输入框里，不会自动发出去' }),
    narrate('字就留在输入框里，不会自动发出去，你还可以接着改。'), hold(2.5), done('说的话留在输入框里'));

// ---------- 02 框里已有文字 ----------
const S2 = '帮我写一封邮件给王总，告诉他发布会改到下周四下午。';
const S2_ADD = '把会议纪要整理好发给我。';
const existing = chapter('框里已有文字', { expected: '框里已有字时按 Control D 开始，原文照样看得见，新说的话接在光标后面；再按一次结束', description: '框里有字时按 Control D，接着往后说' })
  .system('框里已有文字', '框里已经有一段字', chapterLabel('02', '框里已有文字'), commit(S2), ui({ headline: '' }), narrate('如果框里已经有字了呢？'), hold(1))
  .press('⌃D', '按 Control D 开始', listen('请说…'), ui({ headline: '框里已经有字也没关系，原文照样看得见，提示就出现在光标处' }),
    narrate('照样按 Control D。原文都还在，提示就出现在光标后面。'), hold(2))
  .system('说', '“把”', speak('把', '把', '0:06'), ui({ headline: '' }), hold(0.5))
  .system('说', '“会议纪要整理好”', speak('会议纪要整理好', '把会议纪要整理好', '0:08'), hold(0.5))
  .system('说', '“发给我。”', speak('发给我。', S2_ADD, '0:09'), hold(0.5))
  .press('⌃D', '再按一次结束', commit(S2 + S2_ADD), ui({ caret: false }), narrate('再按一次 Control D，就结束了。'), hold(1.5), done('新说的话接在原文后面'));

// ---------- 03 说得很长 ----------
const REQS = [
  '要求一：先查清楚新的发布会场地和时间，再动笔。',
  '要求二：语气正式但不要太生硬。',
  '要求三：开头先道歉，说明改期原因。',
  '要求四：列出新的议程，标明茶歇时间。',
  '要求五：同步更新共享日历里的发布会日程，并通知已经报名的媒体和嘉宾。',
  '要求六：邮件发出前先把草稿发给我确认。',
  '要求七：邮件标题写清楚“发布会改期通知”，正文控制在五段以内。',
  '要求八：新的议程表里标出每个环节的负责人和时长。',
  '要求九：附上新场地的地址、停车信息和到场时间。',
  '要求十：如果王总需要远程参加，提前准备好线上会议链接。',
  '要求十一：抄送名单里不要漏掉财务部的张经理。',
  '要求十二：所有附件统一用 PDF，文件名带上日期。',
];
const LONG = `${REQS.join('\n')}\n补充：`;
const S3 = '另外，记得提醒王总，开场致辞控制在五分钟以内。';
const long = chapter('说得很长', { expected: '说得再长，输入框长到上限后在框里滚动，始终显示最新的字', description: '说得再长，框长到上限就在框里滚动' })
  .system('说得很长', '一段很长的要求', chapterLabel('03', '说得很长'), commit(LONG), ui({ headline: '' }), narrate('再看一段很长的要求。'), hold(1))
  .press('⌃D', '按 Control D 开始', listen('请说…'), narrate('按 Control D，接着往下补充。'), hold(1))
  .system('说', '“另外，”', speak('另外，', '另外，', '0:02'), hold(0.5))
  .system('说', '“记得提醒王总，”', speak('记得提醒王总，', '另外，记得提醒王总，', '0:04'), hold(0.5))
  .system('说', '“开场致辞控制在”', speak('开场致辞控制在', '另外，记得提醒王总，开场致辞控制在', '0:05'), hold(0.5))
  .system('说', '“五分钟以内。”', speak('五分钟以内。', S3, '0:07'), hold(0.5))
  .system('停顿', '框到了上限就滚动', pause('0:09'), ui({ headline: '说得再长，输入框也会跟着长高；到了上限，就在框里滚动，始终跟住最新的字' }),
    narrate('说得再长也不怕。输入框会跟着长高，到了上限就在框里滚动，一直跟着最新的字。'), hold(2))
  .click('finish', '点完成', ui({ finishing: true, level: 'quiet', headline: '' }), narrate('点完成。'), hold(0.8))
  .system('完成', '长长一段都留在框里', commit(LONG + S3), ui({ caret: true }), narrate('这一大段，完整地留在了框里。'), hold(1.5), done('长段落完整留在框里'));

// ---------- 04 光标在哪，写在哪 ----------
const S4_BEFORE = '邮件里写清楚发布会时间，';
const S4_AFTER = '提醒大家准时参加。';
const S4_ADD = '附上新的日程安排。';
const cursor = chapter('光标在哪，写在哪', { expected: '把光标点在句子中间再说，字插在光标处，后面的原文往后挪', description: '光标点在句子中间再说，字插在那里' })
  .system('光标在哪，写在哪', '一句写好的话', chapterLabel('04', '光标在哪，写在哪'), commit(S4_BEFORE, S4_AFTER),
    ui({ pivot: '再', caret: false, headline: '光标点到哪，字就写到哪，后面的原文会自动往后挪' }), narrate('最后一个细节：字会写在光标所在的地方。'), hold(1.5))
  .click('pivot', '光标点在“再”字前面', ui({ pivot: '', after: `再${S4_AFTER}`, caret: true }), narrate('先把光标点在“再”字前面。'), hold(0.8))
  .click('mic', '点一下，开始听', listen('请说…'), ui({ tip: 'finish' }), narrate('然后点麦克风。'), hold(1))
  .system('说', '“附上新的”', speak('附上新的', '附上新的', '0:03'), ui({ tip: '', headline: '' }), hold(0.5))
  .system('说', '“日程安排。”', speak('日程安排。', S4_ADD, '0:05'), hold(0.5))
  .system('停顿', '插在光标处，后面的字往后挪', pause('0:07'), narrate('新说的话插在光标处，后面的原文自动往后挪。'), hold(1.5))
  .click('finish', '点完成', ui({ finishing: true, level: 'quiet' }), narrate('点完成。'), hold(0.8))
  .system('完成', '插进去的字和原文连成一句', commit(S4_BEFORE + S4_ADD, `再${S4_AFTER}`), ui({ caret: false }),
    narrate('插进去的字和原文，连成了一句话。'), hold(2), done('字插在光标处'));

export default work({
  title: 'Manus 语音输入',
  summary: '看懂语音输入怎么用：点麦克风或按 Control D 开始，说的话实时写在光标处，点完成留在框里、不会自动发出去',
  // 用户说的话用“我”的声音读，字幕里显示角色名。
  roles: { me: role('我', { desc: '习惯用嘴代替打字、要写长指令的人' }) },
  layers: { box: layer('输入框', <VoiceWorld />, { icon: 'chat' }) },
  state: {
    ui: {
      chNo: '', chTitle: '', headline: '',
      empty: true, rec: false, finishing: false, caret: false, tip: '', level: 'quiet', timer: '0:00',
      before: '', pivot: '', spoken: '', hint: '', after: '',
    },
  },
  // 暂停时观众可以自己点 ×：这次说的话被丢掉，原文不动（只改本地画面，按播放就恢复）。
  free: { cancel: free.click('cancel', ui({ rec: false, finishing: false, spoken: '', hint: '', level: 'quiet', tip: '', caret: false })) },
  scenarios: { start, existing, long, cursor },
});
