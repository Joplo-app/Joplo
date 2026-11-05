import { page } from '@tokenroll/joplo-kit';
import { Card, SimpleGrid, Stack, Text, TextInput, Title } from '@tokenroll/joplo-kit/ui';

export default page(
  { title: '空间设置' },
  <Stack gap="md">
    <Title order={2}>空间设置</Title>
    <SimpleGrid cols={{ base: 1, md: 2 }}>
      <Card withBorder>
        <Stack gap="sm">
          <Title order={4}>基本信息</Title>
          <Text size="sm" c="dimmed">本页面只用于展示整体布局，暂未建模设置行为。</Text>
          <TextInput id="in_space_name" label="空间名称" placeholder="设计团队空间" unmodeled />
        </Stack>
      </Card>
      <Card withBorder>
        <Stack gap="sm">
          <Title order={4}>套餐</Title>
          <Text size="sm" c="dimmed">团队版 · 最多 50 名成员</Text>
        </Stack>
      </Card>
    </SimpleGrid>
  </Stack>,
);
