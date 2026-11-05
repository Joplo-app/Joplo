import { config } from '@tokenroll/joplo-kit';

export default config({
  name: 'Agent 脑手分离：后端架构说明',
  description: '一次 Agent 任务从客户端到 AWS 的完整链路：大脑只产出工具调用，手（端侧执行器、云端沙箱）负责执行；工具定义集中管理，实现分布在各处；Biz Server 把关，Billing 预检额度并异步计量。',
  layout: 'app',
  home: '/',
});
