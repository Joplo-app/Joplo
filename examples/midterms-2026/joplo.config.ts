import ui from '@joplo-app/plugin-ui'; import diagram from '@joplo-app/plugin-diagram'; import content from '@joplo-app/plugin-content'; import { config } from '@joplo-app/kit';

export default config({ plugins: [ui, diagram, content],
  name: '特朗普丢掉国会之后：五分钟看懂 2026 美国中期选举',
  description: '自媒体快剪风格的资讯讲解：中期选举选什么、民主党赢了多少、特朗普接下来会被怎样卡住、AI 和股市受什么影响。数据截至美东时间 2026 年 11 月 7 日，来源见各页底部与 assets/CREDITS.md。',
  theme: 'newsroom',
  home: '/',
});
