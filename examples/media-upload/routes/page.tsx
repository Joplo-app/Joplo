import { $, asset, eq, page } from '@joplo-app/kit';
import { Lottie, Video } from '@joplo-app/plugin-av';
import { Badge, Button, Card, Group, Stack, Text, Title } from '@joplo-app/plugin-ui';

const ui = $.ui;

export default page({ title: '上传产品演示视频', layout: false },
  <Stack px="xl" pt={72} pb="xl" gap="lg">
    <Stack gap={4}>
      <Title order={2}>上传产品演示视频</Title>
      <Text c="dimmed">product-demo.mov · 248 MB</Text>
    </Stack>
    <Group align="flex-start" gap="lg" wrap="nowrap">
      <Video id="rec" src={asset('../assets/upload.mp4')} w={720} h={405} />
      <Card w={340} withBorder p="lg">
        <Stack gap="md" align="center">
          <Lottie id="ok" src={asset('../assets/success.json')} w={140} h={140} when={eq(ui.state, 'done')} />
          <Badge when={eq(ui.state, 'idle')} color="gray">还没开始</Badge>
          <Badge when={eq(ui.state, 'uploading')} color="blue">上传中</Badge>
          <Text fw={600} when={eq(ui.state, 'done')}>上传完成，正在生成预览</Text>
          <Button id="pick" fullWidth disabled={eq(ui.state, 'done')} disabledReason="已经上传">选择文件</Button>
        </Stack>
      </Card>
    </Group>
  </Stack>,
);
