import { $, and, layer, not } from '@joplo-app/kit';
import { Alert, Badge, Button, Code, Divider, Grid, Group, Paper, Stack, Text, TextInput, Title } from '@joplo-app/plugin-ui';

export const modelInitial = () => ({
  model: false, modal: false, failed: false, revised: false, sent: false,
  source: 'tsx', stage: '一个想法，只有顺利路径', note: 'Joplo 最初要解决的，是原型与规则脱节、失败情况看不见。',
  published: false, historical: false,
});

export const ModelLab = () => (
  <Stack id="am_lab" h="100%" p="lg" gap="md">
    <Group justify="space-between">
      <Stack gap={2}><Title order={2}>把行为留下来</Title><Text c="dimmed">Joplo 的创作模型 · 设计过程重建</Text></Stack>
      <Badge variant="outline">依据 D18 → D28/D29 → D35</Badge>
    </Group>
    <Alert id="am_problem" color="yellow" title={$.ui.stage}>{$.ui.note}</Alert>
    <Grid gutter="lg" style={{ flex: 1, minHeight: 0 }}>
      <Grid.Col span={4}>
        <Stack gap="sm">
          <Text fw={700}>我们需要保留什么？</Text>
          <Paper withBorder p="md">
            <Stack gap="sm">
              <Text fw={600}>功能 · 团队成员邀请</Text>
              <Text size="sm" c="dimmed">谁要完成什么，以及哪些情况不能遗漏。</Text>
              <Divider />
              <Stack id="am_tree" gap="xs" when={$.ui.model}>
                <Text>方案 · 邮件邀请弹窗</Text>
                <Text c="green">场景 · 发送成功</Text>
                <Text c="red">场景 · 网络失败后重试</Text>
                <Text size="sm" c="dimmed">两条场景共用画面，状态各自声明。</Text>
              </Stack>
              <Text when={not($.ui.model)} c="dimmed">初稿：点一下就显示成功。</Text>
            </Stack>
          </Paper>
          <Button id="am_structure" variant="default">拆出情况与场景</Button>
          <Button id="am_failure" variant="default">查看失败场景</Button>
          <Button id="am_revise" variant="default">调整提示与重试</Button>
          <Button id="am_success" variant="default">回看成功场景</Button>
        </Stack>
      </Grid.Col>
      <Grid.Col span={8}>
        <Paper id="am_canvas" withBorder p="lg" h="100%">
          <Stack gap="md">
            <Group justify="space-between"><Title order={3}>团队成员</Title><Badge variant="light">示例界面</Badge></Group>
            <Group justify="space-between"><Text>小林 · 管理员</Text><Text size="sm" c="dimmed">1 位成员</Text></Group>
            <Divider />
            <Paper id="am_form" withBorder p="md" when={$.ui.modal}>
              <Stack gap="sm">
                <Text fw={700}>邀请成员</Text>
                <TextInput id="am_email" label="邮箱" placeholder="teammate@example.com" />
                <Alert id="am_error" color="red" when={$.ui.failed}>
                  <Text when={not($.ui.revised)}>发送失败</Text>
                  <Text when={$.ui.revised}>网络连接中断。已保留邮箱，可以重新发送。</Text>
                </Alert>
                <Button id="am_send" when={not($.ui.revised)}>发送邀请</Button>
                <Button id="am_retry" when={$.ui.revised}>重新发送邀请</Button>
              </Stack>
            </Paper>
            <Alert id="am_sent" color="green" title="邀请已发送" when={$.ui.sent}>示例收件人已加入待接受列表。</Alert>
            <Text id="am_before" c="dimmed" when={and(not($.ui.modal), not($.ui.sent))}>最初的静态草稿只有页面与一个成功结果。</Text>
            <Text size="sm" c="dimmed">画面状态由 Joplo 场景驱动，不会发送真实邀请。</Text>
          </Stack>
        </Paper>
      </Grid.Col>
    </Grid>
  </Stack>
);

const SourceDecision = () => (
  <Stack id="am_decision" p="xl" gap="lg" h="100%">
    <Group justify="space-between"><Title order={2}>我们怎样选择创作方式</Title><Badge color="yellow">设计史重建</Badge></Group>
    <Grid gutter="lg">
      <Grid.Col span={6}>
        <Paper id="am_old_source" withBorder p="lg">
          <Stack gap="sm">
            <Badge variant="outline">最初提案 · PRD / D18</Badge>
            <Title order={3}>独立设计数据 + 工具写入</Title>
            <Text>画面、情况与步骤都是数据；通过工具维护修改与修订。</Text>
            <Code block>{'设计对象 → 工具操作 → 设计数据 → 画板'}</Code>
            <Text c="dimmed">这张结构图按原始材料重建；不是旧版运行画面的截图。</Text>
          </Stack>
        </Paper>
      </Grid.Col>
      <Grid.Col span={6}>
        <Paper id="am_new_source" withBorder p="lg">
          <Stack gap="sm">
            <Badge color="yellow">采用 · D28 / D29</Badge>
            <Title order={3}>TSX 源文件 + 路径堆叠</Title>
            <Text>Agent 直接修改文件；方案往共享页面加内容，行为依然是步骤数据。</Text>
            <Code block>{'routes/ + features/ → 编译 IR → 看板 / 静态站'}</Code>
            <Text c="dimmed">Git 保存版本；D35 将组件词汇改为 Mantine 风格，未改“行为是数据”的原则。</Text>
          </Stack>
        </Paper>
      </Grid.Col>
    </Grid>
    <Alert id="am_tradeoff" color="blue" title="取舍">以更熟悉的文件创作和项目内复用降低修改成本，同时保留可校验的行为模型。</Alert>
    <Group><Button id="am_choose_tsx">查看采用后的模型</Button><Button id="am_publish" variant="default">检查公开构建边界</Button></Group>
    <Paper id="am_public" withBorder p="lg" when={$.ui.published}>
      <Stack gap="xs"><Title order={3}>公开给观众的内容</Title><Text>功能、目标、选定方案的画面和回放。</Text><Text c="dimmed">未选方案、私有规则与待决问题保留在创作侧。这里的历史说明是特意写入公开场景的内容。</Text></Stack>
    </Paper>
    <Text size="sm" c="dimmed">证据：Joplo-PRD-v0.1.md §1.2 / §1.4；DECISIONS.md D18、D21–D35。</Text>
  </Stack>
);

export const modelLayers = () => ({
  interface: layer('行为怎样变成画面', <ModelLab />, { icon: 'window' }),
  decision: layer('创作方式的取舍', <SourceDecision />, { icon: 'doc' }),
});
