import { page } from '@joplo/kit';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from '@joplo/kit/ui';

export default page(
  { title: '空间设置' },
  <>
    <h1>空间设置</h1>
    <Card>
      <CardHeader>
        <CardTitle>基本信息</CardTitle>
        <CardDescription>本页面只用于展示整体布局，暂未建模设置行为。</CardDescription>
      </CardHeader>
      <CardContent>
        <Label htmlFor="in_space_name">空间名称</Label>
        <Input id="in_space_name" placeholder="设计团队空间" unmodeled />
      </CardContent>
    </Card>
  </>,
);
