import { $, and, empty, eq, layer, not, notEmpty, or } from '@joplo-app/kit';
import { ActionIcon, Alert, Badge, Box, Button, Divider, Group, NavLink, Paper, Progress, SimpleGrid, Stack, Terminal, Text, Textarea, Title } from '@joplo-app/plugin-ui';

const grow = { flex: 1, minHeight: 0 };
export const initialUi = () => ({
  page: 'projects', panel: false, context: '项目看板 · /projects · 进度自动更新 · 第 3 步',
  sent: false, sending: false, approved: false, disconnected: false,
  feedback1: '', feedback2: '', approvalEvent: '', exited: false,
  receipt: '已保存 · Agent 正在监听', count: 0,
  ambiguous: false, bound: false, bFeedback: false, bApproved: false,
  replayed: false, localPending: false,
});

const Task = (p: { label: string; category: string }) => <Paper withBorder p="sm" bg="var(--jp-surface)"><Text size="xs" c="dimmed">{p.category}</Text><Text fw={600}>{p.label}</Text></Paper>;

const Prototype = () => (
  <Group align="stretch" wrap="nowrap" h="100%" gap={0}>
    <Stack w={158} p="md" bg="var(--jp-subtle)" gap="sm" style={{ flexShrink: 0 }}>
      <Text fw={700}>▧ 我的工作台</Text>
      <Text size="xs" c="dimmed" mt="md">我的新产品</Text>
      <NavLink id="page_projects" label="项目" active={eq($.ui.page, 'projects')} />
      <NavLink id="page_schedule" label="日程" active={eq($.ui.page, 'schedule')} />
      <Box style={grow} />
      <Text size="xs" c="dimmed">个人工作空间</Text>
    </Stack>
    <Stack p="lg" gap="md" style={{ ...grow, minWidth: 0 }}>
      <Group justify="space-between"><Title order={3}>把想法，一件件做出来。</Title><Badge variant="light">方案 A</Badge></Group>
      <Stack when={eq($.ui.page, 'projects')} gap="sm" style={grow}>
        <Group justify="space-between"><Text fw={600}>我的新产品</Text><Text size="sm">3 / 5 个任务已完成</Text></Group>
        <Progress value={60} color="yellow" size="sm" />
        <Divider />
        <SimpleGrid cols={3} spacing="sm" style={grow}>
          <Stack p="sm" bg="var(--jp-subtle)" gap="sm"><Text c="dimmed">待开始 · 2</Text><Task category="项目规划" label="整理产品想法" /><Task category="产品设计" label="写出核心使用流程" /></Stack>
          <Stack p="sm" bg="var(--jp-subtle)" justify="space-between"><Text c="dimmed">进行中 · 0</Text><Text c="dimmed" ta="center" size="sm">这一轮，完成了。</Text><Box /></Stack>
          <Stack p="sm" bg="var(--jp-subtle)" gap="sm"><Text c="dimmed">已完成 · 3</Text><Task category="刚刚完成" label="完成第一版原型" /><Task category="项目规划" label="确定产品方向" /><Task category="用户研究" label="收集用户反馈" /></Stack>
        </SimpleGrid>
      </Stack>
      <Stack when={eq($.ui.page, 'schedule')} gap="md" style={grow}>
        <Group justify="space-between"><Title order={4}>本周日程</Title><Badge variant="outline">11 月 9 日 — 13 日</Badge></Group>
        <SimpleGrid cols={3} spacing="sm" style={grow}>
          <Stack bg="var(--jp-subtle)" p="md"><Text c="dimmed">周一 · 09</Text><Task category="10:00 · 30 分钟" label="产品方案评审" /></Stack>
          <Stack bg="var(--jp-subtle)" p="md"><Text c="dimmed">周二 · 10</Text><Task category="14:00 · 60 分钟" label="细化核心使用流程" /></Stack>
          <Stack bg="var(--jp-subtle)" p="md"><Text c="dimmed">周三 · 11</Text><Text size="sm" c="dimmed">暂无安排</Text></Stack>
        </SimpleGrid>
      </Stack>
    </Stack>
  </Group>
);

const Review = () => (
  <Stack id="review_screen" h="100%" p="md" gap="sm">
    <Group justify="space-between"><Group gap="sm"><Text fw={700}>JOPLO</Text><Text size="sm" c="dimmed">我的新产品 / 工作台 / 方案 A</Text></Group><Badge variant="light" color="orange">功能演示</Badge></Group>
    <Group justify="space-between"><Text size="xs" c="dimmed">本地评审 · 第 1 轮</Text><Badge color="green" variant="light" when={not($.ui.disconnected)}>Agent 正在监听</Badge><Badge color="orange" variant="light" when={$.ui.disconnected}>Agent 未连接 · 反馈保存在本地</Badge></Group>
    <Group align="stretch" wrap="nowrap" gap="sm" style={{ ...grow, position: 'relative' }}>
      <Paper withBorder style={{ ...grow, minWidth: 0, overflow: 'hidden' }}><Prototype /></Paper>
      <Paper id="feedback_panel" when={$.ui.panel} withBorder shadow="lg" p="md" w={340} bg="var(--jp-surface)" style={{ position: 'absolute', top: 0, right: 54, zIndex: 20, maxWidth: 'calc(100% - 54px)', maxHeight: '100%', display: 'flex', flexDirection: 'column' }}>
        <Stack gap="sm" style={{ minHeight: 0 }}>
          <Group justify="space-between" style={{ flexShrink: 0 }}><Text fw={700}>反馈与评审</Text><ActionIcon id="close_feedback" aria-label="收起反馈" variant="subtle">×</ActionIcon></Group>
          <Stack gap="sm" style={{ minHeight: 0, overflow: 'auto' }}>
          <Text size="xs" c="dimmed">这条反馈的位置</Text>
          <Paper withBorder p="xs"><Text id="feedback_context" size="sm">{$.ui.context}</Text></Paper>
          <Alert color="orange" when={and(eq($.ui.page, 'schedule'), eq($.ui.context, '项目看板 · /projects · 进度自动更新 · 第 3 步'))}>你已切换到日程，草稿仍属于项目看板。</Alert>
          <Textarea id="feedback_text" label="你希望怎么调整？" placeholder="描述这个页面的问题或建议…" minRows={3} disabled={$.ui.approved} disabledReason="本轮方案已确认" />
          <Button id="send_feedback" disabled={or($.ui.sending, $.ui.approved, empty($.inputs.feedback_text))} disabledReason="请填写反馈；保存中或评审结束后不能提交">{$.ui.sendingLabel}</Button>
          <Text size="xs" c="dimmed">自动附上当前页面、场景和步骤。</Text>
          <Divider />
          <Stack when={$.ui.sent} gap={6}><Badge color="green" variant="light">{$.ui.receipt}</Badge><Text size="sm">{$.ui.lastFeedback}</Text></Stack>
          <Text size="sm" c="dimmed" when={not($.ui.sent)}>还没有提交反馈。</Text>
          </Stack>
          <Divider />
          <Button id="approve_panel" disabled={or($.ui.sending, notEmpty($.inputs.feedback_text))} disabledReason="先提交当前反馈草稿" when={not($.ui.approved)}>✓ 确认方案，结束评审</Button>
          <Text size="xs" c="dimmed" when={not($.ui.approved)}>没有修改意见，也可以直接确认。</Text>
          <Badge color="green" variant="light" when={$.ui.approved}>本轮评审已结束</Badge>
        </Stack>
      </Paper>
      <Stack w={42} align="center" pt="sm" style={{ flexShrink: 0 }}>
        <ActionIcon id="open_feedback" aria-label="写页面反馈" variant="default" size="lg">✎</ActionIcon>
        <Text size="xs">反馈</Text>
        <Badge size="sm" variant="light" when={$.ui.sent}>{$.ui.count}</Badge>
      </Stack>
    </Group>
    <Group justify="space-between" py="xs">
      <Text size="sm" c="dimmed">方案 A · 工作台　 /　{$.ui.pageLabel}</Text>
      <Button id="approve" disabled={notEmpty($.inputs.feedback_text)} disabledReason="先提交当前反馈草稿" when={not($.ui.approved)}>✓ 确认方案</Button>
      <Badge id="approved_status" color="green" variant="filled" when={$.ui.approved}>✓ 已确认方案 A · 本轮评审结束</Badge>
    </Group>
    <Text size="xs" c="dimmed">确认后通知 Agent 继续；本轮反馈记录保留。</Text>
  </Stack>
);

const Agent = () => (
  <Stack id="agent_screen" p="lg" h="100%" gap="md">
    <Group justify="space-between"><Title order={3}>Agent 的后台终端</Title><Badge variant="outline">拟议 CLI · 模拟事件</Badge></Group>
    <Terminal id="monitor" title="编码 Agent · 我的新产品" style={grow}>
      <Terminal.Command>joplo review watch --session rv_8k2 --json</Terminal.Command>
      <Terminal.Output tone="plain">{'连接：127.0.0.1:4790 · instance inst_A\n项目：/work/my-product · feature workbench · option a-board\n会话：rv_8k2 · revision r1\n等待反馈；收到 approved 后退出。'}</Terminal.Output>
      <Terminal.Output id="event1" when={notEmpty($.ui.feedback1)} tone="ok">{$.ui.feedback1}</Terminal.Output>
      <Terminal.Output id="event2" when={notEmpty($.ui.feedback2)} tone="ok">{$.ui.feedback2}</Terminal.Output>
      <Terminal.Output id="offline_log" when={$.ui.disconnected} tone="warn">{'连接中断。最后读取：seq=1\n等待恢复；不把断线视为方案确认。'}</Terminal.Output>
      <Terminal.Command when={$.ui.replayed}>joplo review watch --session rv_8k2 --after 1 --json</Terminal.Command>
      <Terminal.Output when={$.ui.replayed}>恢复会话 rv_8k2 · 补收 seq &gt; 1</Terminal.Output>
      <Terminal.Output id="approval_event" when={notEmpty($.ui.approvalEvent)} tone="ok">{$.ui.approvalEvent}</Terminal.Output>
      <Terminal.Output id="exit_result" when={$.ui.exited} tone="ok">{'✓ 本轮评审已确认，监听完成\nprocess exited with code 0'}</Terminal.Output>
      <Terminal.Output when={not($.ui.exited)}>▍</Terminal.Output>
    </Terminal>
    <Alert color="green" when={$.ui.exited}>Agent 可以读取本轮反馈继续工作。Joplo 本地服务仍在运行。</Alert>
    <Text size="sm" c="dimmed">反馈提交后按事件逐条输出；不会把未提交的键盘输入发给 Agent。</Text>
  </Stack>
);

const Isolation = () => (
  <Stack id="instances_screen" p="lg" h="100%" gap="md">
    <Group justify="space-between"><Title order={3}>同一台电脑，两个评审会话</Title><Badge variant="outline">拟议会话绑定</Badge></Group>
    <Terminal title="Agent A · 选择监听目标" mah={215}>
      <Terminal.Command>joplo review watch --json</Terminal.Command>
      <Terminal.Output id="ambiguous_error" when={$.ui.ambiguous} tone="error">{'AMBIGUOUS_REVIEW · 找到多个会话，请指定 --session\nrv_8k2  inst_A :4790  /work/my-product  workbench/a-board@r1\nrv_9m4  inst_B :4791  /work/client-site  checkout/a-page@r3\n未开始监听；exit 2'}</Terminal.Output>
      <Terminal.Input id="bind_command" placeholder="输入带会话 ID 的监听命令" />
    </Terminal>
    <SimpleGrid cols={2} spacing="md" style={grow}>
      <Stack gap="sm"><Text fw={700}>A · 我的新产品</Text><Terminal id="terminal_a" title="inst_A :4790 · rv_8k2" style={grow}>
        <Terminal.Output tone="ok" when={$.ui.bound}>已绑定 /work/my-product · workbench/a-board@r1</Terminal.Output>
        <Terminal.Output when={$.ui.bound}>等待 A 的反馈… ▍</Terminal.Output>
      </Terminal><Badge color="blue" variant="light" when={$.ui.bound}>A 持续监听中</Badge></Stack>
      <Stack gap="sm"><Group justify="space-between"><Text fw={700}>B · 客户网站</Text><Button id="b_feedback" size="xs" variant="default">提交 B 的反馈</Button></Group><Terminal id="terminal_b" title="inst_B :4791 · rv_9m4" style={grow}>
        <Terminal.Output>已绑定 /work/client-site · checkout/a-page@r3</Terminal.Output>
        <Terminal.Output when={$.ui.bFeedback} tone="ok">{'{"session":"rv_9m4","seq":1,"type":"feedback",\n "page":"/checkout","text":"付款按钮更醒目一点"}'}</Terminal.Output>
        <Terminal.Output when={$.ui.bApproved} tone="ok">{'{"session":"rv_9m4","seq":2,"type":"approved"}\nprocess exited with code 0'}</Terminal.Output>
      </Terminal><Button id="b_approve" size="sm" disabled={$.ui.bApproved} disabledReason="B 已确认">确认 B 的方案</Button></Stack>
    </SimpleGrid>
    <Text size="sm" c="dimmed">同一个看板服务多个项目、同仓库不同 worktree，也按独立会话绑定。</Text>
  </Stack>
);

export const layers = () => ({
  review: layer('用户 · 本地评审', <Review />, { icon: 'browser' }),
  agent: layer('Agent · 监听终端', <Agent />, { icon: 'terminal' }),
  instances: layer('多实例 · 隔离验证', <Isolation />, { icon: 'server' }),
});
