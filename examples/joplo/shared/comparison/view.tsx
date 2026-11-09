import { $, layer, not } from '@joplo-app/kit';
import { Alert, Badge, Button, Divider, Grid, Group, Paper, Stack, Text, Title } from '@joplo-app/plugin-ui';

export const comparisonInitial = () => ({
  kind: '修改', scenario: '单人邀请', status: '已对齐 · 完整前置状态已恢复',
  beforeVisible: true, afterVisible: true, span: 6,
  beforeTitle: '单人邀请', afterTitle: '单人邀请',
  beforeStep: '第 1 / 3 步 · 打开', afterStep: '第 2 / 4 步 · 新增预览',
  beforeState: '邀请草稿已打开', afterState: '邀请草稿已打开，展示预览',
  beforeValue: 'teammate@example.com', afterValue: 'teammate@example.com',
  context: false, uncertain: false, aligned: true, playing: false,
  beforeAck: false, afterAck: false, waiting: false,
  generation: 'generation 2 · 最新任务', publishResult: '等待模拟发布检查', stale: false,
});

const Version = (p: { side: 'before' | 'after' }) => {
  const before = p.side === 'before';
  return <Paper id={before ? 'cd_before' : 'cd_after'} withBorder p="lg" h="100%">
    <Stack gap="md">
      <Group justify="space-between"><Text fw={700}>{before ? '旧版 · 固定起点' : '新版 · 当前 head'}</Text><Badge variant="outline">{before ? $.ui.beforeStep : $.ui.afterStep}</Badge></Group>
      <Divider />
      <Title order={3}>{before ? $.ui.beforeTitle : $.ui.afterTitle}</Title>
      <Paper withBorder p="md">
        <Stack gap="xs">
          <Text size="sm" c="dimmed">示例邀请状态</Text>
          <Text fw={600}>{before ? $.ui.beforeState : $.ui.afterState}</Text>
          <Text>{before ? $.ui.beforeValue : $.ui.afterValue}</Text>
        </Stack>
      </Paper>
      <Text size="sm" c="dimmed">场景状态由回放恢复。</Text>
    </Stack>
  </Paper>;
};

export const ComparisonView = () => (
  <Stack id="cd_viewer" p="lg" gap="md" h="100%">
    <Group justify="space-between">
      <Stack gap={2}><Title order={2}>这次迭代，改变了什么？</Title><Text c="dimmed">示例 PR · 固定起点 → 当前 head</Text></Stack>
      <Badge variant="outline">源码已合入 · CLI 待发行</Badge>
    </Group>
    <Group gap="xs"><Badge color="yellow">{$.ui.kind}</Badge><Text fw={600}>{$.ui.scenario}</Text></Group>
    <Group gap="xs">
      <Button id="cd_match" variant="default">插入后继续对齐</Button>
      <Button id="cd_added" variant="default">新增场景</Button>
      <Button id="cd_removed" variant="default">删除场景</Button>
      <Button id="cd_uncertain" variant="default">重复动作</Button>
      <Button id="cd_initial" variant="default">初始状态变化</Button>
      <Button id="cd_context" variant="default">展开完整上下文</Button>
    </Group>
    <Alert id="cd_status" color="blue" title={$.ui.status}>
      <Text when={not($.ui.uncertain)}>跳过未变步骤，也要恢复完整状态。</Text>
      <Text when={$.ui.uncertain}>重复候选无法可靠配对。保留上下文，请人工判断。</Text>
    </Alert>
    <Grid gutter="lg" style={{ flex: 1, minHeight: 0 }}>
      <Grid.Col span={$.ui.span} when={$.ui.beforeVisible}><Version side="before" /></Grid.Col>
      <Grid.Col span={$.ui.span} when={$.ui.afterVisible}><Version side="after" /></Grid.Col>
    </Grid>
    <Paper id="cd_context_rows" withBorder p="sm" when={$.ui.context}>
      <Text size="sm" when={not($.ui.uncertain)}>旧版：打开 → 发送 → 完成　｜　新版：打开 → 预览 → 发送 → 完成</Text>
      <Text size="sm" when={$.ui.uncertain}>旧版：重试 → 重试　｜　新版：重试 → 重试 → 重试</Text>
      <Text size="sm" c="dimmed" when={$.ui.uncertain}>重复动作按未匹配项保留，不猜成同一个步骤。</Text>
    </Paper>
    <Group justify="space-between">
      <Group gap="xs">
        <Button id="cd_play" disabled={not($.ui.aligned)} disabledReason="先重新对齐，等待两侧新的位置回执">播放变化</Button>
        <Button id="cd_move" variant="default">仅移动新版场景</Button>
        <Button id="cd_realign" variant="default">重新对齐</Button>
      </Group>
      <Text size="sm" when={$.ui.playing}>正在播放</Text><Text size="sm" when={not($.ui.playing)}>已暂停</Text>
      <Group gap="xs" when={$.ui.waiting}>
        <Group id="cd_before_ack"><Badge color="green" when={$.ui.beforeAck}>旧版已回报</Badge><Badge variant="outline" when={not($.ui.beforeAck)}>等待旧版</Badge></Group>
        <Group id="cd_after_ack"><Badge color="green" when={$.ui.afterAck}>新版已回报</Badge><Badge variant="outline" when={not($.ui.afterAck)}>等待新版</Badge></Group>
      </Group>
    </Group>
    <Text size="xs" c="dimmed">设计回放，非真实 PR 操作。依据：docs/feature-diff、4603038；对齐恢复修复 397310e。</Text>
  </Stack>
);

const PublishBoundary = () => (
  <Stack id="cd_boundary" p="xl" gap="lg" h="100%">
    <Group justify="space-between"><Title order={2}>比较结果，何时可以成为当前结果？</Title><Badge variant="outline">设计机制 · 示例数据</Badge></Group>
    <Grid gutter="lg">
      <Grid.Col span={6}><Paper withBorder p="lg"><Stack gap="sm"><Title order={3}>固定起点</Title><Text>第一次 prepare 固定 base；后续重试仍沿用它。</Text><Badge>base · 首次比较起点</Badge><Text c="dimmed">拿不到起点时停止，不能当作全部新增。</Text></Stack></Paper></Grid.Col>
      <Grid.Col span={6}><Paper withBorder p="lg"><Stack gap="sm"><Title order={3}>单调递增的运行代次</Title><Text id="cd_generation">{$.ui.generation}</Text><Text>真实 head 与 generation 都要匹配，才能更新当前指针。</Text><Text c="dimmed">新任务开始后，旧任务不能后来居上。</Text></Stack></Paper></Grid.Col>
    </Grid>
    <Button id="cd_publish">模拟检查旧任务的发布资格</Button>
    <Alert id="cd_publish_result" title={$.ui.publishResult} color="yellow">
      <Text when={$.ui.stale}>重新 prepare，按返回的固定 base 与最新 head 构建；不复用旧 receipt。</Text>
      <Text when={not($.ui.stale)}>每次成功发布新建不可变分享，已完成的比较包不被原地替换。</Text>
    </Alert>
    <Divider />
    <Title order={3}>这项功能的实际设计边界</Title>
    <Text>对比的是 Joplo 演示，不证明真实产品已实现；根页面支持 HTML 与 manifest，未提供跨版本 Agent 读取模型。</Text>
    <Text>Cloud 比较接口已部署，仓库 CI 已验证真实 PR 预览、原评论更新、固定起点及关闭后过期。新 diff CLI 尚未发布到 npm，自动流程固定使用可信源码版本。</Text>
    <Text size="sm" c="dimmed">来源：Cloud docs/feature-diff/CONTRACT.md；Core docs/feature-diff/README.md；Joplo PR #13。</Text>
  </Stack>
);
export const comparisonLayers = () => ({
  viewer: layer('功能变化如何呈现', <ComparisonView />, { icon: 'window' }),
  boundary: layer('固定起点与发布边界', <PublishBoundary />, { icon: 'flow' }),
});
