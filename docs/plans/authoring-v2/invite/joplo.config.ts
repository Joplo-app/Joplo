import ui from '@joplo-app/plugin-ui';
import { config } from '@joplo-app/kit';
import * as app from './components.ts';
import { DesignSystemProvider } from './design-system/index.tsx';

export default config({
  plugins: [ui],                 // 版面、表格这类还用 ui；产品自己的控件用 app
  components: app,               // 新增：登记过的产品组件，命名空间 app:
  wrapper: DesignSystemProvider, // 新增：包在舞台外面的 Provider
  name: '团队邀请功能',
  locales: ['zh-CN', 'en'],
  description: 'Joplo 黄金案例：空间管理员邀请成员并指定协作权限。方案仅用于测试设计能力，不是对真实产品的推荐。',
  layout: 'app',
  home: '/members',
});
