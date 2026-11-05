import type { Bind, CondExpr } from '@tokenroll/joplo-kit';
import { Code, Stack, Text } from '@tokenroll/joplo-kit/ui';

const TONE = { plain: 'dark.4', ok: 'green.8', warn: 'orange.8', error: 'red.8' } as const;

/** 终端里的一条命令及其输出；when 为真时出现。 */
export const Cmd = (p: { id: string; when: Bind | CondExpr; cmd: string; out: string; tone?: keyof typeof TONE }) => (
  <Stack id={p.id} when={p.when} gap={4}>
    <Code>$ {p.cmd}</Code>
    <Text c={TONE[p.tone ?? 'plain']}>{p.out}</Text>
  </Stack>
);
