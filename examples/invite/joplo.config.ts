import ui from '@joplo-app/plugin-ui'; import diagram from '@joplo-app/plugin-diagram'; import content from '@joplo-app/plugin-content'; import { config } from '@joplo-app/kit';

export default config({ plugins: [ui, diagram, content],
  name: '团队邀请功能',
  locales: ['zh-CN', 'en'],
  description: 'Joplo 黄金案例：空间管理员邀请成员并指定协作权限。方案仅用于测试设计能力，不是对真实产品的推荐。',
  layout: 'app',
  home: '/members',
});
