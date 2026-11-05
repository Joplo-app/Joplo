import { page, Slot } from '@joplo-app/kit';
import { Stack, Title } from '@joplo-app/kit/ui';

/** 测试夹具（不是示例项目）：Diagram 的渲染、播放、检查与截图。 */
export default page(
  { title: '架构', layout: false },
  <Stack p="md" gap="sm">
    <Title order={3}>Agent 脑手分离（夹具）</Title>
    <Slot name="main" />
  </Stack>,
);
