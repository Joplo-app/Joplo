/**
 * 「按容量发布」的画面（两个方案共用，只有用量条什么时候出现不同）：
 * - board：林舟的本地看板，右上角「发布到 Joplo Cloud」打开的发布浮层（账号、范围、容量、发布、结果）；
 * - terminal：Agent 在终端里运行 joplo share 的输出（用量一行；超出时 QUOTA_EXCEEDED）。
 * 被演示的原型（邀请成员）只画个轮廓，这里关心的是发布浮层。
 */
import { $, and, done, eq, flow, highlight, hold, layer, narrate, not, numbered, or, set, shot, spotlight, callout, uses, type Bind, type EffectDef } from '@joplo-app/kit';
import { Alert, Anchor, Badge, Box, Button, Group, Paper, Progress, Stack, Terminal, Text } from '@joplo-app/kit/ui';

const ui = $.ui as unknown as Record<string, Bind>;
export type Variant = 'a' | 'b';

export const initialUi = (v: Variant) => ({
  v,
  plan: 'free',
  email: 'lin@example.com',
  quota: '100 MB',
  used: '38.1 MB',
  pct: 38,
  level: 'ok',
  open: false,
  publishing: false,
  done: false,
  over: false,
  size: '',
  url: '',
  update: false,
  term: 'idle',
});

/** 用量条在这个方案里此刻是否显示：A 一直显示；B 只在快满或超出时显示。 */
const meterOn = or(eq(ui.v, 'a'), neq2(ui.level, 'ok'));
function neq2(b: Bind, v: string) {
  return not(eq(b, v));
}

function Meter() {
  return (
    <Stack id="q_meter" gap={4} when={meterOn as never}>
      <Group justify="space-between">
        <Text size="xs" fw={600} c="dimmed">空间</Text>
        <Text size="xs" c="dimmed">{ui.used as never} / {ui.quota as never}</Text>
      </Group>
      <Box when={eq(ui.level, 'ok') as never}><Progress value={ui.pct as never} size="sm" color="blue" /></Box>
      <Box when={eq(ui.level, 'near') as never}><Progress value={ui.pct as never} size="sm" color="yellow" /></Box>
      <Box when={eq(ui.level, 'over') as never}><Progress value={ui.pct as never} size="sm" color="red" /></Box>
    </Stack>
  );
}

function Popover() {
  return (
    <Paper id="q_pop" withBorder shadow="md" p="md" w={340} when={ui.open as never} style={{ position: 'absolute', right: 16, top: 56, zIndex: 5 }}>
      <Stack gap="sm">
        <Text id="q_acct" size="xs" c="dimmed">
          {ui.email as never} · <span>{ui.plan as never}</span>
        </Text>
        <Text id="q_mini" size="xs" c="dimmed" when={and(eq(ui.v, 'b'), eq(ui.level, 'ok')) as never}>已用 {ui.used as never} / {ui.quota as never} · 链接永久有效</Text>
        <Stack gap={4}>
          <Text size="xs" fw={600} c="dimmed">发布范围</Text>
          <Paper withBorder p={6} bg="var(--jp-subtle)"><Text size="sm">◉ 当前场景：正常发出邀请</Text></Paper>
          <Text size="sm" px={6}>○ 当前功能：邀请成员</Text>
          <Text size="sm" px={6}>○ 整个项目</Text>
        </Stack>
        <Meter />
        <Alert id="q_warn" color="yellow" title="空间快满了" when={and(eq(ui.level, 'near'), not(ui.over)) as never}>
          <Stack gap={6}>
            <Text size="sm">还能发布，但剩下的不多了。删掉不再需要的分享，或者升级 Pro（5 GB）。</Text>
            <Group gap="xs"><Anchor id="q_manage" size="sm" href="https://cloud.joplo.app/shares" unmodeled>管理我的分享 ↗</Anchor><Anchor id="q_up" size="sm" href="https://cloud.joplo.app/settings/billing" unmodeled>升级 Pro ↗</Anchor></Group>
          </Stack>
        </Alert>
        <Alert id="q_over" color="red" title="空间不够，这次没有发布" when={ui.over as never}>
          <Stack gap={6}>
            <Text size="sm">这次需要 12.4 MB，只剩 4.1 MB（还差 8.3 MB）。</Text>
            <Text size="sm" fw={600}>已经发出去的链接都不受影响。</Text>
            <Group gap="xs"><Anchor id="q_manage2" size="sm" href="https://cloud.joplo.app/shares">管理我的分享 ↗</Anchor><Anchor id="q_up2" size="sm" href="https://cloud.joplo.app/settings/billing" unmodeled>升级 Pro · 5 GB ↗</Anchor></Group>
          </Stack>
        </Alert>
        <Paper id="q_result" withBorder p="sm" when={ui.done as never}>
          <Stack gap={4}>
            <Text size="sm" fw={700} c="green">✓ 已发布</Text>
            <Text size="sm" c="blue">{ui.url as never}</Text>
            <Text size="xs" c="dimmed">永久链接 · 这次 {ui.size as never}</Text>
            <Text id="q_delta" size="xs" c="dimmed" when={ui.update as never}>更新了同一个链接：只按和旧版本的差额计入（+0.6 MB）</Text>
          </Stack>
        </Paper>
        <Button id="q_publish" color="blue" fullWidth loading={ui.publishing as never}>发布</Button>
      </Stack>
    </Paper>
  );
}

function Board() {
  return (
    <Stack gap={0} h="100%" style={{ position: 'relative' }}>
      <Group justify="space-between" px="md" py={8} style={{ borderBottom: '1px solid var(--jp-line)' }}>
        <Group gap={8}><Badge variant="filled" color="yellow" c="dark">Joplo</Badge><Text size="sm" c="dimmed">团队空间 › 邀请成员</Text></Group>
        <Group gap={6}>
          <Button id="q_open" size="xs" color="blue">☁ 发布到 Joplo Cloud</Button>
        </Group>
      </Group>
      <Box p="lg" style={{ flex: 1 }}>
        <Paper withBorder h="100%" p="md" bg="var(--jp-subtle)">
          <Text c="dimmed" size="sm">（被演示的原型：邀请成员）</Text>
        </Paper>
      </Box>
      <Popover />
    </Stack>
  );
}

function Shell() {
  return (
    <Stack p="lg" h="100%" justify="center">
      <Terminal id="t_term" title="~/work/team-space">
        <Terminal.Command>npx joplo share --public --no-review</Terminal.Command>
        <Terminal.Output when={eq(ui.term, 'ok') as never} tone="ok">{'Published https://joplo.app/s/Ab3dK9/\nPermanent link\nStorage: 47.2 MB of 100 MB used (this share: 9.1 MB)'}</Terminal.Output>
        <Terminal.Output id="t_over" when={eq(ui.term, 'over') as never} tone="error">{'QUOTA_EXCEEDED: this share needs 12.4 MB, but only 4.1 MB of your 100 MB is left.\nNothing was uploaded. Existing links keep working.\nFree up space: https://cloud.joplo.app/shares\nUpgrade to Pro (5 GB): https://cloud.joplo.app/settings/billing'}</Terminal.Output>
        <Terminal.Output when={eq(ui.term, 'over') as never}>{'$ echo $?\n6'}</Terminal.Output>
      </Terminal>
    </Stack>
  );
}

export const layers = () => ({
  board: layer('林舟的看板', <Board />, { role: 'lin', icon: 'window' }),
  terminal: layer('Agent 的终端', <Shell />, { role: 'lin', icon: 'terminal' }),
});

const usage = (used: string, pct: number, level: 'ok' | 'near' | 'over'): EffectDef[] => [set(ui.used, used), set(ui.pct, pct), set(ui.level, level)];

/** 两个方案的场景一样，只有用量条什么时候出现不同。 */
export const scenarios = (v: Variant) => {
  const base = initialUi(v);
  const meterNote = v === 'a' ? '一直显示用量条' : '平时只有一行小字';
  return {
    normal: flow('发布一个新分享', { cases: ['normal'], start: '/', state: { ui: base }, expected: '发布前看到已用多少；发完显示“永久链接”和这次占了多少' })
      .card('林舟要把邀请流程发给同事', { role: 'lin', sub: '免费账号，已经发过几个分享' }, narrate('林舟用免费账号，想把邀请流程发给同事看。'))
      .click('q_open', '点「发布到 Joplo Cloud」', narrate('他点发布到 Joplo Cloud。'), set($.ui.open, true), shot('q_pop'))
      .system('先看到用了多少', meterNote, narrate(v === 'a' ? '浮层里先看到空间：一百兆用了三十八兆。' : '浮层里只有一行小字：用了三十八兆，链接永久有效。'), spotlight(v === 'a' ? 'q_meter' : 'q_mini'), uses('raw_size', 'permanent'))
      .click('q_publish', '点「发布」', narrate('点发布。'), set($.ui.publishing, true))
      .system('发布完成', '永久链接，这次占了 9.1 MB', narrate('发完了。链接永久有效，这次占了九点一兆。'), set($.ui.publishing, false), set($.ui.done, true), set($.ui.url, 'https://joplo.app/s/Ab3dK9/'), set($.ui.size, '9.1 MB'), ...usage('47.2 MB', 47, 'ok'), highlight('q_result'), uses('permanent'),
        done('同事拿到一个不会过期的链接')),

    near: flow('用到八成', { cases: ['near'], start: '/', state: { ui: { ...base, ...{ used: '82.6 MB', pct: 83, level: 'near' } } }, expected: '提醒快满了，给出管理分享和升级两个入口；仍然可以发布' })
      .card('林舟已经发了很多分享', { role: 'lin', sub: '用到 82.6 MB' }, narrate('林舟已经发了不少分享，用到了八十多兆。'))
      .click('q_open', '打开发布浮层', narrate('他再打开发布浮层。'), set($.ui.open, true), shot('q_pop'))
      .system('提前提醒', '用量条变黄，说清两个出路', narrate('用量条变黄，提醒快满了：可以删掉不用的分享，或者升级 Pro。'), numbered('q_meter', 'q_warn'), uses('warn_80'))
      .click('q_publish', '仍然可以发布', narrate('这次还放得下，照常发布。'), set($.ui.done, true), set($.ui.url, 'https://joplo.app/s/Kp2mQ7/'), set($.ui.size, '6.8 MB'), ...usage('89.4 MB', 89, 'near'), highlight('q_result'),
        done('提前知道快满了')),

    over: flow('这次发布会超出', { cases: ['over'], start: '/', state: { ui: { ...base, ...{ used: '95.9 MB', pct: 96, level: 'near' } } }, outcome: 'failure', expected: '说清楚差多少；不发布；已有链接不受影响' })
      .card('只剩 4.1 MB', { role: 'lin', sub: '这次要发一个带朗读的讲解' }, narrate('林舟只剩四兆多，这次却要发一个带朗读的讲解。'))
      .click('q_open', '打开发布浮层', narrate('打开发布浮层。'), set($.ui.open, true))
      .click('q_publish', '点「发布」', narrate('点发布，先构建出要上传的文件。'), set($.ui.publishing, true))
      .system('构建完才知道大小', '12.4 MB，放不下', narrate('构建完一算要十二兆多，放不下，这次就不上传了。'), set($.ui.publishing, false), set($.ui.over, true), ...usage('95.9 MB', 100, 'over'), spotlight('q_over'), uses('over_after_build', 'permanent'))
      .click('q_manage2', '点「管理我的分享」', narrate('他点管理我的分享，去删掉几个旧的。已经发出去的链接都还在。'), callout('q_over', '已有链接不受影响'),
        done('知道差多少、去哪里腾地方', 'failure')),

    update: flow('更新同一个链接', { cases: ['update'], start: '/', state: { ui: base }, expected: '只按新旧版本的差额算' })
      .card('林舟改了几处，重新发布', { role: 'lin', sub: '同一个项目、同一个范围' }, narrate('林舟改了几处，重新发布同一个范围。'))
      .click('q_open', '打开发布浮层', narrate('打开发布浮层。'), set($.ui.open, true))
      .click('q_publish', '点「发布」', narrate('点发布。'), set($.ui.done, true), set($.ui.update, true), set($.ui.url, 'https://joplo.app/s/Ab3dK9/'), set($.ui.size, '9.7 MB'), ...usage('38.7 MB', 39, 'ok'))
      .system('只算差额', '还是原来的链接，多占 0.6 MB', narrate('还是原来的链接，只多占了零点六兆，不会把整个分享算两遍。免费账号也能更新同一个链接。'), highlight('q_delta'), uses('update_delta', 'free_update_same'),
        done('更新不浪费容量')),

    pro: flow('Pro 的容量', { cases: ['pro'], start: '/', state: { ui: { ...base, plan: 'Pro', email: 'jie@example.com', quota: '5 GB', used: '1.2 GB', pct: 24 } }, expected: '5 GB；不够时可以买扩容包' })
      .card('阿杰是 Pro', { role: 'jie', sub: '发了很多带朗读的讲解' }, narrate('阿杰是 Pro 会员，发了很多带朗读的讲解。'))
      .click('q_open', '打开发布浮层', narrate('打开发布浮层。'), set($.ui.open, true))
      .system('5 GB', '用了 1.2 GB', narrate(v === 'a' ? 'Pro 有五个 G，他用了一点二个 G。' : '只有一行小字：五个 G 用了一点二个。'), spotlight(v === 'a' ? 'q_meter' : 'q_mini'), uses('quotas'), hold(3),
        done('Pro 空间宽裕')),

    agent: flow('Agent 用 CLI 发布', { cases: ['agent'], start: '/', state: { ui: base }, expected: '输出里有用量；超出时单独的错误码和下一步' })
      .card('林舟让 Agent 发布', { role: 'lin', sub: 'Agent 在终端里运行 joplo share' }, narrate('林舟让 Agent 帮他发布。'))
      .system('发布成功', '最后一行是用量', narrate('发布成功，最后一行写着用了多少空间。'), set($.ui.term, 'ok'), shot('t_term'))
      .system('空间不够时', 'QUOTA_EXCEEDED，退出码 6', narrate('空间不够时，以单独的错误结束：写明差多少、已有链接不受影响、去哪里腾地方，Agent 原样转告就行。'), set($.ui.term, 'over'), spotlight('t_over'), uses('agent_code'),
        done('Agent 能把原因和下一步告诉用户')),
  };
};
