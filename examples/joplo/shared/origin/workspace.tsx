import { $, and, eq, not, or } from '@joplo-app/kit';
import { Badge, Box, Button, Divider, Group, Paper, Stack, Text, Title } from '@joplo-app/plugin-ui';

export type OriginVariant = 'fold' | 'mode' | 'annotations';
export const originState = (variant: OriginVariant) => ({
  variant, leftOpen: false, rightOpen: false, reviewing: false,
  annotated: false, gap: false, invited: false, decision: false, later: false,
});

const showCases = or(and(eq($.ui.variant, 'fold'), $.ui.leftOpen), and(eq($.ui.variant, 'mode'), $.ui.reviewing), eq($.ui.variant, 'annotations'));
const showRules = or(and(eq($.ui.variant, 'fold'), $.ui.rightOpen), and(eq($.ui.variant, 'mode'), $.ui.reviewing));

/** An intentionally reconstructed product workspace; the archived JSON remains the source of the historical layouts. */
export function originWorkspace() {
  return <Stack p="lg" gap="md">
    <Group justify="space-between">
      <Stack gap={2}>
        <Title order={3}>让原型成为主角</Title>
        <Text size="sm" c="dimmed">同一项邀请功能，三种不同的信息组织方式。</Text>
      </Stack>
      <Badge variant="outline">2026-11-05 · 历史重建</Badge>
    </Group>
    <Group gap="xs">
      <Button id="origin_choose_a" variant="default">A · 收起侧栏</Button>
      <Button id="origin_choose_b" variant="default">B · 切换模式</Button>
      <Button id="origin_choose_c" variant="default">C · 就地标注</Button>
      <Badge variant="light" color="yellow" when={$.ui.decision}>D32 · 当时采用 B</Badge>
    </Group>
    <Paper withBorder radius="md" p="md">
      <Stack gap="sm">
        <Group justify="space-between">
          <Text fw={600}>Joplo / 团队邀请 / 单人邀请</Text>
          <Badge variant="outline" color="orange">2 个缺口</Badge>
        </Group>
        <Group gap="xs" when={eq($.ui.variant, 'fold')}>
          <Button id="origin_a_cases" size="xs" variant="default">情况与场景</Button>
          <Button id="origin_a_rules" size="xs" variant="default">规则检查器</Button>
          <Button id="origin_a_collapse" size="xs" variant="subtle">收起两侧</Button>
          <Text size="xs" c="dimmed">A：保持原来的位置，按需展开。</Text>
        </Group>
        <Group gap="xs" when={eq($.ui.variant, 'mode')}>
          <Button id="origin_b_demo" size="xs" variant="default">演示模式</Button>
          <Button id="origin_b_review" size="xs" variant="default">审阅模式</Button>
          <Text size="xs" c="dimmed" when={not($.ui.reviewing)}>B：现在只看原型。</Text>
          <Text size="xs" c="dimmed" when={$.ui.reviewing}>B：审阅时，两侧信息一起出现。</Text>
        </Group>
        <Group gap="xs" when={eq($.ui.variant, 'annotations')}>
          <Text size="xs" c="dimmed">C：没有右侧检查器，规则跟着元素。</Text>
          <Button id="origin_c_hide" size="xs" variant="subtle">收起规则标注</Button>
        </Group>
        <Divider />
        <Group align="stretch" wrap="nowrap" gap="md" mih={350}>
          <Paper withBorder p="sm" w={190} when={showCases}>
            <Stack gap="sm">
              <Text size="sm" fw={600}>情况与场景</Text>
              <Text size="sm">● 正常邀请</Text>
              <Text size="sm">● 已是成员</Text>
              <Button id="origin_gap" variant="light" color="orange" size="xs">查看未设计情况</Button>
              <Text size="xs" c="orange" when={$.ui.gap}>邀请失效后重新发送：当时尚未表达。</Text>
            </Stack>
          </Paper>
          <Box style={{ flex: 1, minWidth: 0 }}>
            <Stack gap="md">
              <Group justify="space-between">
                <Title order={4}>团队成员</Title>
                <Badge variant="default">2 位成员</Badge>
              </Group>
              <Text size="sm" c="dimmed">邀请同事加入团队，一起完成项目。</Text>
              <Paper withBorder p="md">
                <Group justify="space-between"><Text>林舟</Text><Text size="sm" c="dimmed">管理员</Text></Group>
                <Divider my="sm" />
                <Group justify="space-between"><Text>小周</Text><Text size="sm" c="dimmed">成员</Text></Group>
              </Paper>
              <Group gap="sm">
                <Button id="origin_invite">邀请成员</Button>
                <Button id="origin_c_annotation" variant="outline" size="xs" when={eq($.ui.variant, 'annotations')}>① 邀请规则</Button>
              </Group>
              <Paper withBorder p="sm" when={and(eq($.ui.variant, 'annotations'), $.ui.annotated)}>
                <Stack gap={4}>
                  <Text size="sm" fw={600}>① 谁可以邀请？</Text>
                  <Text size="sm">只有管理员可以邀请新成员。</Text>
                  <Text size="xs" c="dimmed">C 的取舍：离画面近，标注多时会遮挡内容。</Text>
                </Stack>
              </Paper>
              <Text id="origin_invite_result" size="sm" c="green" when={$.ui.invited}>已打开邀请操作。此处只回放预设原型，不发送邮件。</Text>
            </Stack>
          </Box>
          <Paper withBorder p="sm" w={210} when={showRules}>
            <Stack gap="sm">
              <Text size="sm" fw={600}>规则检查器</Text>
              <Text size="sm">邀请成员</Text>
              <Text size="sm">只有管理员可以邀请新成员。</Text>
              <Divider />
              <Text size="xs" c="dimmed">已表达：正常邀请</Text>
              <Text size="xs" c="orange">未表达：邀请失效</Text>
            </Stack>
          </Paper>
        </Group>
      </Stack>
    </Paper>
    <Text size="sm" when={eq($.ui.variant, 'fold')}>A 的取舍：改动最小；两侧都展开时，画面又会变挤。</Text>
    <Text size="sm" when={eq($.ui.variant, 'mode')}>B 的取舍：演示更干净；审阅仍是三栏，切模式会改变布局。</Text>
    <Text size="sm" when={eq($.ui.variant, 'annotations')}>C 的取舍：规则最接近画面；改动更多，还需要控制标注密度。</Text>
    <Paper id="origin_later" withBorder p="sm" when={$.ui.later}>
      <Text size="sm">后续 D39：取消双模式，改为左侧情况导航与右侧检查抽屉。下一阶段见“演示页”Feature。</Text>
    </Paper>
    <Text size="xs" c="dimmed">依据：v1 自迭代归档与 DECISIONS D32 / D39。这里的切换只改变回放，不创建真实审批。</Text>
  </Stack>;
}
