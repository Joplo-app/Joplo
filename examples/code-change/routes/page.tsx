import { $, eq, page } from '@joplo-app/kit';
import { Editor } from '@joplo-app/plugin-code';
import { Group, Stack, Terminal, Text, Title } from '@joplo-app/plugin-ui';
import { V1 } from '../shared/code.ts';

const ui = $.ui;

export default page({ title: '接口失败自动重试', layout: false },
  <Stack px="xl" pt={72} pb="xl" gap="lg">
    <Stack gap={4}>
      <Title order={2}>loadUser：失败的请求自动重试</Title>
      <Text c="dimmed">Agent 修一个线上偶发的 503</Text>
    </Stack>
    <Group align="flex-start" gap="lg" wrap="nowrap">
      <Editor id="api" file="user.ts" lang="typescript" code={V1} h={540} w={700} />
      <Stack w={440} gap="sm">
        <Terminal id="term" title="终端" h={540}>
          <Terminal.Command>pnpm test user.test.ts</Terminal.Command>
          <Terminal.Output when={eq(ui.run, 'fail')}>{'✗ loadUser › 503 时整页白屏\n  HttpError: 503 Service Unavailable\n\n1 failed, 2 passed'}</Terminal.Output>
          <Terminal.Output when={eq(ui.run, 'pass')}>{'✓ loadUser › 503 时自动重试\n✓ loadUser › 404 不重试\n✓ loadUser › 正常返回\n\n3 passed'}</Terminal.Output>
        </Terminal>
      </Stack>
    </Group>
  </Stack>,
);
