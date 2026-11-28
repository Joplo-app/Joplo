import ui from '@joplo-app/plugin-ui';
import content from '@joplo-app/plugin-content';
import { config } from '@joplo-app/kit';

export default config({
  plugins: [ui, content],
  name: 'Loop Transformer：不加参数，怎么让模型“多想一圈”？',
  description: '纯几何可视动化样片：用同一叠网络层、回流弧线、门控阀与按词思考点数，讲清 Loop Transformer 如何在不增加参数显存的前提下靠中段层循环实现潜空间深推理。',
  theme: 'loop-void',
});
