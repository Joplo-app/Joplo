import { option } from '@joplo-app/kit';
import { filmInitial, filmLayers, filmScenarios } from '../../../shared/film/lab.tsx';

export default option({
  name: 'A · 左栏章节清单',
  idea: '看板的布局不变，只把左栏的“方案、情况、缺口”换成章节清单：每章一行，带自动编号、步数和时长，上面是影片信息和总时长，下面是审片命令',
  focus: '影片的章节放在看板的哪里',
  tradeoffs: ['和功能演示共用同一套布局，改动最小，两种形态切换时不跳版面', '章节标题能完整显示（讲解片的章节名通常是一句问话）', '看不出各章的时长比例，只有数字'],
  state: { ui: filmInitial() },
  layers: filmLayers('list'),
  scenarios: filmScenarios('list'),
});
