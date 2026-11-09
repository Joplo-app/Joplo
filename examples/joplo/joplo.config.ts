import ui from '@joplo-app/plugin-ui'; import diagram from '@joplo-app/plugin-diagram'; import content from '@joplo-app/plugin-content'; import { config } from '@joplo-app/kit';

export default config({ plugins: [ui, diagram, content],
  name: 'Joplo · 用 Joplo 设计 Joplo',
  description: 'Joplo 自身持续迭代的产品设计项目：保留真实功能的方案、场景、规则与取舍，回看设计如何形成，再继续设计下一次变化。历史原型与当前实现的差异在设计记录中说明。',
  theme: 'sketch',
  home: '/',
});
