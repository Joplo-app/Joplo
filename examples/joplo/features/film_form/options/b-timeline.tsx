import { option } from '@joplo-app/kit';
import { filmInitial, filmLayers, filmScenarios } from '../../../shared/film/lab.tsx';

export default option({
  name: 'B · 画面下方的章节时间轴',
  idea: '左栏只留影片信息，章节变成画面下方一条按时长比例分段的时间轴，像剪辑软件；点一段跳到那一章，当前章的步骤仍在步骤条里',
  focus: '影片的章节放在看板的哪里',
  tradeoffs: ['一眼看出哪一章太长、整体节奏是否均衡，更像做视频', '时间轴上放不下章节标题，只能写编号和时长，标题要靠悬停', '画面变矮；和功能演示的版面不同，切换形态时布局会跳', '手机宽度下时间轴的短章节会挤得点不中'],
  state: { ui: filmInitial() },
  layers: filmLayers('timeline'),
  scenarios: filmScenarios('timeline'),
});
