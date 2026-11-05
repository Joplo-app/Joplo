import { layout, Outlet, Slot } from '@tokenroll/joplo-kit';
import { AppShell, Burger, Group, Title } from '@tokenroll/joplo-kit/ui';

/** Joplo 的外壳：左上角品牌，顶栏其余位置由页面决定（首页为空，演示页放面包屑和设备切换）。 */
export default layout(
  <AppShell header={{ height: 56 }} navbar={{ width: 280, breakpoint: 'sm' }} padding="md">
    <AppShell.Header>
      <Group h="100%" px="md" gap="lg" wrap="nowrap">
        <Burger id="shell_burger" hiddenFrom="sm" aria-label="打开左栏" unmodeled />
        <Title order={4}>Joplo</Title>
        <Slot name="header" />
      </Group>
    </AppShell.Header>
    <AppShell.Navbar p="sm">
      <Slot name="nav" />
    </AppShell.Navbar>
    <AppShell.Main>
      <Outlet />
    </AppShell.Main>
    <Slot name="overlay" />
  </AppShell>,
);
