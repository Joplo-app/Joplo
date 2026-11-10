import ui from '@joplo-app/plugin-ui'; import diagram from '@joplo-app/plugin-diagram'; import content from '@joplo-app/plugin-content'; import { config } from '@joplo-app/kit';

export default config({ plugins: [ui, diagram, content],
  name: '大模型是怎么“写”出一句话的？',
  description: '讲解类视频风格的科普：大模型读到的“字”是什么、下一个字怎么选、为什么同一个问题答案会变、为什么会一本正经地胡说。概率数字是为讲清原理而设的示意，来源见每页底部与 SOURCES.md。',
  theme: 'content:studio',
});
