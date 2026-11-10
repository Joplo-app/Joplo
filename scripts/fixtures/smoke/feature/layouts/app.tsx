import { layout, Outlet, Slot } from '@joplo-app/kit';
import { AppShell } from '@joplo-app/plugin-ui';
export default layout(
  <AppShell padding="lg">
    <AppShell.Main><Outlet /></AppShell.Main>
    <Slot name="overlay" />
  </AppShell>,
);
