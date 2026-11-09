/**
 * 两个人的画面（D56）：小雨的电脑（营地助手：左边对话，右边行程单）和阿杰的手机（只收到一条消息）。
 * 两层共享同一份状态，由场景步骤驱动；文字用 $.ui.x 绑定，stream() 让它们逐字出现。
 */
import { $, and, eq, layer, neq, not, notEmpty, type Bind } from '@joplo-app/kit';
import { Alert, AppShell, Artifact, Avatar, Badge, Box, Button, Card, ChatMessage, Grid, Group, Notification, Email, DataCard, StateFlow, Placeholder, PromptInput, ScrollArea, Stack, Text, Thinking, Title } from '@joplo-app/plugin-ui';



const ui = $.ui as unknown as Record<string, Bind>;

export const initialTrip = () => ({ status: 'draft', date: '周六至周日', camp: '待选营地', budget: 500, reply: '等待阿杰回复' });
export const sharedTrip = () => ({ status: 'shared', date: '周六至周日', camp: '白河营地', budget: 460, reply: '等待阿杰回复' });

export const ASK = '这周六想和阿杰去露营，两个人，预算 500 以内，帮我安排一下';

/** 第一次规划用到的文字。 */
export const PLAN = {
  thinkLog: '周六晴，最高 24°，夜里 12°。\n两小时车程内有三个营地：白河、云蒙山、雁栖湖。\n白河最便宜，周六还有帐篷位。',
  reply: '周六晴，夜里 12°，记得带厚睡袋。推荐白河营地：开车 1.5 小时，帐篷位 ¥180/晚，两个人预算够用。行程单放在右边了。',
  title: '周六 · 白河营地',
  d1: '周六\n09:00 出发，10:30 到营地搭帐篷\n15:00 河边徒步 5 公里\n18:30 烧烤晚饭，看星星',
  d2: '周日\n08:00 早饭，收帐篷\n11:00 返程，路上吃午饭',
  budget: '预算 ¥460：营地 ¥180 · 油费 ¥120 · 食材 ¥160',
};

/** 下雨后调整的版本（v2）。 */
export const PLAN_V2 = {
  thinkLog: '周六 14:00 起雷阵雨，降水概率 80%。\n周日晴，白河营地周日白天还有位置。\n阿杰周一要上班，改成一日游更稳妥。',
  reply: '周六下午有雷阵雨，不适合搭帐篷。建议改到周日，做成一日游；行程单已更新为 v2，也通知了阿杰。',
  title: '周日 · 白河营地一日游',
  d1: '周日\n08:00 出发，09:30 到营地\n10:00 河边徒步 5 公里\n12:30 烧烤午饭\n16:00 返程',
  d2: '不过夜：周一要上班，改成一日游',
  budget: '预算 ¥280：营地日间 ¥60 · 油费 ¥120 · 食材 ¥100',
};

/** 方案的初始状态：什么都还没发生。 */
export const initialUi = () => ({
  asked: false,
  thinking: false,
  thought: '',
  thinkLog: '',
  reply: '',
  planShown: false,
  planStatus: 'generating',
  planVersion: 'v1',
  planTitle: '',
  planD1: '',
  planD2: '',
  planBudget: '',
  shared: false,
  notifText: '小雨邀请你周六一起去露营',
  ajieOpened: false,
  ajieReply: '',
  confirmed: false,
  confirmText: '',
  rainShown: false,
  thinking2: false,
  thought2: '',
  thinkLog2: '',
  reply2: '',
});

/** 场景从“行程已经分享、阿杰已经确认”开始时的状态（rain 场景用）。 */
export const sharedUi = () => ({
  ...initialUi(),
  asked: true,
  thought: '选定白河营地',
  thinkLog: PLAN.thinkLog,
  reply: PLAN.reply,
  planShown: true,
  planStatus: 'ready',
  planTitle: PLAN.title,
  planD1: PLAN.d1,
  planD2: PLAN.d2,
  planBudget: PLAN.budget,
  shared: true,
  ajieOpened: false,
  ajieReply: '',
  confirmed: true,
  confirmText: '阿杰回复：我能去！',
});

// ---------- 小雨的电脑：营地助手 ----------
const xiaoyuApp = () => (
  <AppShell header={{ height: 52 }} padding="md">
    <AppShell.Header>
      <Group h="100%" px="md" justify="space-between">
        <Group gap="sm">
          <Title order={4}>营地助手</Title>
          <Badge variant="light">周末露营</Badge>
        </Group>
        <Avatar name="小雨" size="sm" />
      </Group>
    </AppShell.Header>
    <AppShell.Main>
      {/* 高度跟着舞台走（层级铺满整个舞台，大小随看板窗口变化）：两栏都占满主区域，输入框和分享按钮固定在底部 */}
      <Grid gutter="lg" h="100%">
        <Grid.Col id="chat_col" span={6}>
          <Stack h="100%" gap="md">
            <ScrollArea style={{ flex: 1, minHeight: 0 }}>
              <Stack gap="lg">
                <ChatMessage id="msg_user" from="user" when={ui.asked}>{ASK}</ChatMessage>
                <ChatMessage id="msg_reply" from="assistant" name="营地助手" when={ui.asked}>
                  <Thinking id="thinking" title={ui.thought} active={ui.thinking} opened={ui.thinking} duration="6 秒">
                    <Text size="sm" c="dimmed">{ui.thinkLog}</Text>
                  </Thinking>
                  <Text when={notEmpty(ui.reply)}>{ui.reply}</Text>
                </ChatMessage>
                <ChatMessage id="msg_confirm" from="assistant" name="营地助手" when={ui.confirmed}>{ui.confirmText}</ChatMessage>
                <ChatMessage id="msg_rain" from="assistant" name="营地助手 · 主动提醒" when={ui.rainShown}>
                  <Thinking id="thinking2" title={ui.thought2} active={ui.thinking2} opened={ui.thinking2} duration="4 秒">
                    <Text size="sm" c="dimmed">{ui.thinkLog2}</Text>
                  </Thinking>
                  <Text when={notEmpty(ui.reply2)}>{ui.reply2}</Text>
                </ChatMessage>
              </Stack>
            </ScrollArea>
            <Group gap="sm" wrap="nowrap">
              <PromptInput id="prompt" placeholder="说说你想怎么玩…" />
              <Button id="send" unmodeled>发送</Button>
            </Group>
          </Stack>
        </Grid.Col>
        <Grid.Col id="plan_col" span={6}>
          <Stack h="100%" gap="md">
            <Box style={{ flex: 1, minHeight: 0 }}>
              <Artifact id="plan" title="周末露营行程.md" kind="doc" status={ui.planStatus} version={ui.planVersion} when={ui.planShown}>
                <Title id="plan_title" order={3}>{ui.planTitle}</Title>
                <Text>{ui.planD1}</Text>
                <Text>{ui.planD2}</Text>
                <Text c="dimmed">{ui.planBudget}</Text>
              </Artifact>
              <Placeholder id="plan_empty" when={not(ui.planShown)} label="行程单会出现在这里" h="100%" />
            </Box>
            <Group justify="flex-end">
              <Button id="share" disabled={neq(ui.planStatus, 'ready')} disabledReason="行程单生成完才能分享">分享给阿杰</Button>
            </Group>
          </Stack>
        </Grid.Col>
      </Grid>
    </AppShell.Main>
  </AppShell>
);

// ---------- 阿杰的手机：只收到一条消息 ----------
const ajiePhone = () => (
  <Stack p="md" gap="md">
    <Group justify="space-between">
      <Title order={4}>消息</Title>
      <Text size="sm" c="dimmed">周五 20:05</Text>
    </Group>
    <Text id="no_msg" c="dimmed" ta="center" mt="xl" when={not(ui.shared)}>还没有新消息</Text>
    <Notification id="notif" title="小雨 · 来自营地助手" withCloseButton={false} when={and(ui.shared, not(ui.ajieOpened), eq(ui.planVersion, 'v1'))}>
      {ui.notifText}
      <Group mt="xs">
        <Button id="open_trip" size="xs" variant="light">查看行程</Button>
      </Group>
    </Notification>
    <Email id="update_email" from="营地助手" to="阿杰" subject="行程有更新" time="周五 20:05" when={and(ui.shared, not(ui.ajieOpened), eq(ui.planVersion, 'v2'))}>
      <Text>{ui.notifText}</Text>
      <Button id="email_open" size="xs" variant="light">查看更新后的行程</Button>
    </Email>
    <Stack id="trip" gap="sm" when={ui.ajieOpened}>
      <Group justify="space-between">
        <Title order={3}>{ui.planTitle}</Title>
        <Badge id="trip_version">{ui.planVersion}</Badge>
      </Group>
      <Text size="sm" c="dimmed">小雨邀请你一起去 · 不用装 App 也能回复</Text>
      <Card withBorder>
        <Stack gap="xs">
          <Text>{ui.planD1}</Text>
          <Text>{ui.planD2}</Text>
        </Stack>
      </Card>
      <Text size="sm" c="dimmed">{ui.planBudget}</Text>
      <Group grow when={eq(ui.ajieReply, '')}>
        <Button id="cant_go" variant="default">去不了</Button>
        <Button id="can_go">我能去</Button>
      </Group>
      <Alert id="said_yes" color="green" when={eq(ui.ajieReply, 'yes')}>已告诉小雨：你能去</Alert>
      <Alert id="said_no" color="gray" when={eq(ui.ajieReply, 'no')}>已告诉小雨：你这次去不了</Alert>
    </Stack>
  </Stack>
);

/** 角色层级与行程数据层：每层独立展示（D56：一次只看一个人，换人用过渡卡）。 */
export const layers = () => ({
  xiaoyu: layer('小雨的电脑', xiaoyuApp(), { role: 'xiaoyu', icon: 'agent' }),
  ajie: layer('阿杰的手机', ajiePhone(), { role: 'ajie', viewport: 'mobile' }),
  data: layer('行程数据', <Stack p="xl" gap="lg" maw={860} mx="auto">
    <Title order={2}>行程数据</Title>
    <StateFlow id="trip_states" value={$.data.trip.status} states={['draft', 'shared', 'confirmed', 'rescheduled']} labels={{ draft: '草稿', shared: '已分享', confirmed: '已确认', rescheduled: '已改期' }} />
    <DataCard id="trip_data" title="周末露营" value={$.data.trip} fields={[{ key: 'date', label: '日期' }, { key: 'camp', label: '营地' }, { key: 'budget', label: '预算（元）' }, { key: 'reply', label: '阿杰的回复' }]} />
  </Stack>, { icon: 'data' }),
});
