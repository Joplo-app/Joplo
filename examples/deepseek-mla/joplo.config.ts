import ui from '@joplo-app/plugin-ui';
import content from '@joplo-app/plugin-content';
import { config } from '@joplo-app/kit';

export default config({
  plugins: [ui, content],
  name: 'DeepSeek MLA：怎么把 KV 显存砍掉 93.3%，还不伤多头精度？',
  description: '纯几何可视动化拆解：用低秩潜向量、矩阵吸收飞行与解耦 RoPE 双轨拓扑，直观讲透 DeepSeek 多头潜在注意力（MLA）的 512+64 显存奇迹。',
  theme: 'mla-void',
});
