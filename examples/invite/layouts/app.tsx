import { layout, go, Outlet, Slot } from '@joplo-app/kit';
import { AppShell, Burger, Group, NavLink, Title } from '@joplo-app/plugin-ui';

/** 应用外壳：顶栏 + 左侧导航；窄于 sm 时导航收起，显示 Burger。 */
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
      <NavLink id="nav_members" label="成员" href="/members" onClick={go('/members')} />
      <NavLink id="nav_settings" label="空间设置" href="/settings" onClick={go('/settings')} />
    </AppShell.Navbar>
    <AppShell.Main>
      <Outlet />
    </AppShell.Main>
    <Slot name="overlay" />
  </AppShell>,
);
