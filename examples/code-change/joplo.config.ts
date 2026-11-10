import { config } from '@joplo-app/kit';
import code from '@joplo-app/plugin-code';
import ui from '@joplo-app/plugin-ui';

export default config({
  name: '接口失败自动重试',
  description: '代码插件原型（D96）：编辑器逐字打出新代码、按行 diff、高亮几行，全部跟着引擎时钟走。',
  theme: 'clean',
  plugins: [ui, code],
});
