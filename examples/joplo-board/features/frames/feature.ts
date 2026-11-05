import { feature, question, rule } from '@tokenroll/joplo-kit';

export default feature({
  name: '设备外框：终端与手机',
  goal: '写命令行和移动端原型时，作者直接用现成的终端组件和手机外框，不用自己拼',
  roles: ['作者'],
  cases: {
    terminal: { title: 'CLI 原型：输入命令，出现输出', dimension: 'main', priority: 'high', expected: '命令一块、输出一块；输出可以有成功 / 警告 / 错误三种颜色' },
    phone: { title: '移动端页面放进手机外框', dimension: 'main', priority: 'high', expected: 'page 写 viewport: "mobile" 或顶栏切到手机时自动套上外框' },
    long_output: { title: '命令输出很长', dimension: 'input', expected: '终端内部滚动，不把页面撑开' },
  },
  rules: {
    frame_is_component: rule('终端是目录里的组件（Terminal、Terminal.Command、Terminal.Output），手机外框由舞台自动加，不需要作者写', { cases: ['terminal', 'phone'] }),
  },
  questions: {
    more_frames: question('还要别的外框吗？例如浏览器窗口（带地址栏）、平板、桌面应用窗口', { severity: 'minor', refs: ['phone'] }),
  },
  pick: 'a-builtin',
});
