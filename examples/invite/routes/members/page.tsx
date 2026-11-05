import { $, page, Slot } from '@joplo-app/kit';
import { DataTable, Group, Stack, Text, Title } from '@joplo-app/kit/ui';

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
    <Text c="dimmed">成员 3 人</Text>
    <DataTable
      id="tbl_members"
      columns={[{ accessor: 'name', title: '姓名' }, { accessor: 'email', title: '邮箱' }, { accessor: 'role', title: '权限' }]}
      records={$.data.members}
    />
    <Title order={4}>待接受的邀请</Title>
    <DataTable
      id="tbl_pending"
      columns={[{ accessor: 'email', title: '邮箱' }, { accessor: 'role', title: '权限' }, { accessor: 'status', title: '状态' }]}
      records={$.data.pending}
      noRecordsText="暂无待接受的邀请"
    />
  </Stack>,
);
