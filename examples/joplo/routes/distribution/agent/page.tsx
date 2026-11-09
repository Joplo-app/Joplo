import { page, Slot } from '@joplo-app/kit';
import { ActionIcon, Card, Group, PromptInput, Stack, Title } from '@joplo-app/plugin-ui';

/** Claude Code 会话：方案把消息和工具调用堆叠到 conversation 插槽。 */
export default page(
  { layout: 'distribution', title: 'Claude Code 会话' },
  <Card withBorder>
    <Stack gap="md">
      <Title order={4}>Claude Code · ~/work/my-demo</Title>
      <Stack gap="md">
        <Slot name="conversation" />
      </Stack>
      <Group align="flex-end" gap="xs" wrap="nowrap">
        <PromptInput id="agent_prompt" placeholder="和 Claude 说点什么…" />
        <ActionIcon id="agent_send" aria-label="发送" size="lg" radius="xl">↑</ActionIcon>
      </Group>
    </Stack>
  </Card>,
);
