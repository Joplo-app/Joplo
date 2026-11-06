import { $, page, Slot } from '@joplo-app/kit';
import { DataTable, Group, SimpleGrid, Stack, Stat, Title } from '@joplo-app/kit/ui';

export default page(
  { title: '成员' },
  <Stack gap="md">
    <Group justify="space-between">
      <Title order={2}>成员</Title>
      <Group gap="xs">
        <Slot name="header.actions" />
      </Group>
    </Group>
    <Slot name="notice" />
    <SimpleGrid cols={3}>
      <Stat id="stat_members" label="成员" value="3" icon="👥" />
      <Stat id="stat_seats" label="席位" value="4 / 5" progress={80} description="还可以再邀请 1 人" />
      <Stat id="stat_accept" label="近 30 天接受率" value="86%" diff="+6%" />
    </SimpleGrid>
    <DataTable
      id="tbl_members"
      columns={[{ accessor: 'name', title: '姓名', avatar: true }, { accessor: 'email', title: '邮箱' }, { accessor: 'role', title: '权限', badge: { 管理员: 'blue', 编辑者: 'green', 查看者: 'gray' } }]}
      records={$.data.members}
    />
    <Group justify="space-between">
      <Title order={4}>待接受的邀请</Title>
      <Slot name="pending.actions" />
    </Group>
    <DataTable
      id="tbl_pending"
      columns={[{ accessor: 'email', title: '邮箱' }, { accessor: 'role', title: '权限' }, { accessor: 'status', title: '状态', badge: { 待接受: 'yellow', 已撤销: 'gray' } }]}
      records={$.data.pending}
      noRecordsText="暂无待接受的邀请"
    />
  </Stack>,
);
