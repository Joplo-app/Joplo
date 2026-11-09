import { layout, Outlet, Slot } from '@joplo-app/kit';
import { AppShell, Group, Text, Title } from '@joplo-app/plugin-ui';

export default layout(
  <AppShell header={{ height: 52 }} padding="md">
    <AppShell.Header>
      <Group h="100%" px="md" gap="md">
        <Title order={4}>Agent 脑手分离</Title>
        <Text size="sm" c="dimmed">后端架构说明 · 左边是客户端，右边是同一时刻的后端调用链</Text>
      </Group>
    </AppShell.Header>
    <AppShell.Main>
      <Outlet />
    </AppShell.Main>
    <Slot name="overlay" />
  </AppShell>,
);
