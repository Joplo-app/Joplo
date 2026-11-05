import { layout, Outlet, Slot } from '@joplo/kit';
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@joplo/kit/ui';

export default layout(
  <div className="flex h-full">
    <Sidebar>
      <SidebarHeader>设计团队空间</SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>空间</SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem><SidebarMenuButton id="nav_overview" unmodeled>概览</SidebarMenuButton></SidebarMenuItem>
            <SidebarMenuItem><SidebarMenuButton id="nav_members" href="/members" unmodeled>成员</SidebarMenuButton></SidebarMenuItem>
            <SidebarMenuItem><SidebarMenuButton id="nav_settings" href="/settings" unmodeled>空间设置</SidebarMenuButton></SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
    <main className="flex flex-1 flex-col gap-4 p-6">
      <Outlet />
    </main>
    <Slot name="overlay" />
  </div>,
);
