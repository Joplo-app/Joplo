import { page, Slot } from '@joplo-app/kit';
import { Box, Group, Paper } from '@joplo-app/kit/ui';

/** 左边 3D 场景，右边 App 面板；具体内容由方案填进插槽。 */
export default page(
  { title: '我的家', layout: false },
  <Group gap="lg" p="lg" h="100%" align="stretch" wrap="nowrap">
    <Box flex={1}>
      <Paper withBorder p={0} h="100%">
        <Slot name="scene" />
      </Paper>
    </Box>
    <Paper withBorder p="lg" w={360}>
      <Slot name="panel" />
    </Paper>
  </Group>,
);
