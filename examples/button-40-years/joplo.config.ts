import { config } from '@joplo-app/kit';
import ui from '@joplo-app/plugin-ui';
import content from '@joplo-app/plugin-content';
import alda from '@joplo-app/plugin-alda';
import { scores } from './music';
export default config({
  name: '同一个按钮的 40 年',
  description: '从鼠标到自然语言，跟着一个发送按钮穿过 1984—2024。暂停即上手，拖动时间轴回到任意年代。',
  home: '/', theme: 'forty', autoFocus: false,
  plugins: [ui, content, alda(scores)],
});
