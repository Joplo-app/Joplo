import { page, Slot } from '@tokenroll/joplo-kit';
import { Stack, Title } from '@tokenroll/joplo-kit/ui';

/** 测试夹具（不是示例项目）：视角层级与导演镜头（D43）。页面故意很长，检验“一屏放下”。 */
export default page(
  { title: '导演', layout: false },
  <Stack p="md" gap="md">
    <Title order={3}>Agent 脑手分离（导演夹具）</Title>
    <Slot name="main" />
  </Stack>,
);
