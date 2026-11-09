import { feature, role } from '@joplo-app/kit';

/** 一段产品功能演示：每个情况是一章，按顺序连着播放。 */
export default feature({
  name: 'Manus 语音输入',
  goal: '看懂语音输入怎么用：点麦克风或按 Control D 开始，说的话实时写在光标处，点完成留在框里、不会自动发出去',
  // say(…, { role: 'me' })：用户说的话用这个人的声音读，字幕里显示“我”
  roles: { me: role('我', { desc: '习惯用嘴代替打字、要写长指令的人' }) },
  pick: 'a',
  cases: {
    start: { title: '01 开始说', dimension: 'main', priority: 'high', expected: '点麦克风开始，说的话边说边出现；停顿时末尾虚线闪着表示还在听；点完成后字留在框里，不会自动发出去' },
    existing: { title: '02 框里已有文字', dimension: 'main', priority: 'high', expected: '框里已有字时按 Control D 开始，原文照样看得见，新说的话接在光标后面；再按一次结束' },
    long: { title: '03 说得很长', dimension: 'main', priority: 'medium', expected: '说得再长，输入框长到上限后在框里滚动，始终显示最新的字' },
    cursor: { title: '04 光标在哪，写在哪', dimension: 'main', priority: 'high', expected: '把光标点在句子中间再说，字插在光标处，后面的原文往后挪' },
  },
});
