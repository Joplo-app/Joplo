import { page, Slot } from '@tokenroll/joplo-kit';
import { Button, Card, Group, Stack, Text, TextInput, Title } from '@tokenroll/joplo-kit/ui';

/** 终端窗口：方案把命令输出堆叠到 lines 插槽，输入行所有方案共用。 */
export default page(
  { title: '终端' },
  <Card withBorder ff="monospace">
    <Stack gap="md">
      <Title order={4} ff="monospace">~/work — zsh</Title>
      <Stack gap="md" fz={14}>
        <Slot name="lines" />
      </Stack>
      <Group gap="xs" wrap="nowrap">
        <Text>$</Text>
        <TextInput id="term_cmd" ff="monospace" placeholder="输入命令" flex={1} />
        <Button id="term_enter" variant="default">⏎ 回车</Button>
      </Group>
    </Stack>
  </Card>,
);
