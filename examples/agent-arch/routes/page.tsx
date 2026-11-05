import { page, Slot } from '@tokenroll/joplo-kit';
import { Grid, Stack, Title } from '@tokenroll/joplo-kit/ui';

/** 左：客户端；右：架构图；下：核心块说明。 */
export default page(
  { title: '架构演示' },
  <Stack gap="lg">
    <Grid gutter="lg">
      <Grid.Col span={{ base: 12, lg: 4 }}>
        <Slot name="client" />
      </Grid.Col>
      <Grid.Col span={{ base: 12, lg: 8 }}>
        <Slot name="diagram" />
      </Grid.Col>
    </Grid>
    <Title order={4}>核心块</Title>
    <Slot name="blocks" />
  </Stack>,
);
