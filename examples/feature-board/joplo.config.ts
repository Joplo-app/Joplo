import { config } from '@joplo-app/kit';
import content from '@joplo-app/plugin-content';
import ui from '@joplo-app/plugin-ui';

export default config({
  name: '免密登录：邮箱里的一次性链接',
  description: '流程白板（D96）：同一块白板上摆几屏 ui 画面，箭头连成流程，便签写边界情况，镜头随步骤移动。',
  home: '/',
  plugins: [ui, content],
});
