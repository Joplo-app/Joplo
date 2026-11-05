import { layout, Outlet, Slot } from '@joplo-app/kit';
import { Anchor, AppShell, Group, Text } from '@joplo-app/kit/ui';

/** 开发者桌面：终端、Agent 会话、npm 网站三个窗口，用顶栏切换。 */
export default layout(
  <AppShell header={{ height: 52 }} padding="lg">
    <AppShell.Header>
      <Group h="100%" px="lg" gap="xl">
        <Text fw={700}>开发机</Text>
        <Group gap="md">
          <Anchor id="nav_terminal" href="/terminal" unmodeled>终端</Anchor>
          <Anchor id="nav_agent" href="/agent" unmodeled>Claude Code</Anchor>
          <Anchor id="nav_npm" href="/npm" unmodeled>npmjs.com</Anchor>
        </Group>
      </Group>
    </AppShell.Header>
    <AppShell.Main>
      <Outlet />
    </AppShell.Main>
    <Slot name="overlay" />
  </AppShell>,
);
