import { $, page, Slot } from '@joplo/kit';
import { DataTable } from '@joplo/kit/ui';

export default page(
  { title: '成员' },
  <>
    <div className="flex items-center justify-between">
      <h1>成员</h1>
      <div className="flex gap-2">
        <Slot name="header.actions" />
      </div>
    </div>
    <Slot name="notice" />
    <p className="text-muted-foreground">成员 3 人</p>
    <DataTable
      id="tbl_members"
      columns={[{ accessorKey: 'name', header: '姓名' }, { accessorKey: 'email', header: '邮箱' }, { accessorKey: 'role', header: '权限' }]}
      data={$.data.members}
    />
    <h3>待接受的邀请</h3>
    <DataTable
      id="tbl_pending"
      columns={[{ accessorKey: 'email', header: '邮箱' }, { accessorKey: 'role', header: '权限' }, { accessorKey: 'status', header: '状态' }]}
      data={$.data.pending}
      empty="暂无待接受的邀请"
    />
  </>,
);
