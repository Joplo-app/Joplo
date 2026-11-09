import { feature } from '@joplo-app/kit';
export default feature({
  name: '同一个按钮的 40 年',
  goal: '跟着同一个发送按钮，亲手体验从鼠标命令到自然语言意图的四段交互变化。',
  cases: {
    mac: { title: '01 · 1984：指向命令', expected: '编辑信件、点发送，理解鼠标把命令放到可见的界面里。' },
    desktop: { title: '02 · 1995：找到应用', expected: '打开开始菜单和信箱，发送消息；凸起按钮成为桌面的动作入口。' },
    touch: { title: '03 · 2007：直接触碰', expected: '在手机里输入和发送消息，悬停读提示；手指成为指针。' },
    intent: { title: '04 · 2024：说出意图', expected: '输入请求、查看预设草稿，理解同一个发送动作可以交代意图。' },
  }, pick: 'a',
});
