import { layout, Outlet } from '@joplo-app/kit';
import { AppShell, Burger, Group, NavLink, Title } from '@joplo-app/plugin-ui';

/** 变化：去掉 <Slot name="overlay" />，弹窗由页面的 overlay 参数放进来（Dialog 自己浮在最上层）。 */
export default layout(
  <AppShell header={{ height: 56 }} navbar={{ width: 220, breakpoint: 'sm' }} padding="lg">
    <AppShell.Header>
      <Group h="100%" px="md" gap="sm">
        <Burger id="nav_burger" hiddenFrom="sm" aria-label="打开导航" unmodeled />
        <Title order={4}>设计团队空间</Title>
      </Group>
    </AppShell.Header>
    <AppShell.Navbar p="sm">
      <NavLink id="nav_overview" label="概览" unmodeled />
      <NavLink id="nav_members" label="成员" href="/members" />
      <NavLink id="nav_settings" label="空间设置" href="/settings" />
    </AppShell.Navbar>
    <AppShell.Main>
      <Outlet />
    </AppShell.Main>
  </AppShell>,
);
