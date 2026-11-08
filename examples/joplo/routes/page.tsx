import { page } from '@joplo-app/kit';
import { Badge, Stack, Text, Title } from '@joplo-app/kit/ui';

export default page({ title: '用 Joplo 设计 Joplo', layout: false },
  <Stack p="xl" gap="lg">
    <Badge variant="light">持续迭代的真实设计项目</Badge>
    <Title order={1}>我们怎样用 Joplo 设计 Joplo</Title>
    <Text size="lg">从最初的工作台草稿，到播放器、评审和功能差异，每一个功能都有自己的问题、方案和可回放场景。</Text>
    <Text c="dimmed">从功能目录选择一个 Feature，先看设计回放，再探索它的具体交互。本地看板保留备选方案与待决问题；公开演示只展示主动整理的设计记录和选定方案。</Text>
  </Stack>,
);
