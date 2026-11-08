import { config } from '@joplo-app/kit';
import scene3d from 'joplo-plugin-scene3d';

export default config({
  name: '智能家居：一键离家',
  description: 'Joplo 插件示例：3D 场景插件（joplo-plugin-scene3d）。画面左边是家里的 3D 场景，右边是 App；步骤可以点 3D 里的物体，状态同时驱动 App 和 3D 画面。',
  home: '/',
  plugins: [scene3d],
});
