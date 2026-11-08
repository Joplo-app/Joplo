/**
 * 按场景保密分享（D75）的画面：
 * - author：林舟的电脑（终端里运行 joplo share，右边是 .joplo/cloud.json）；
 * - inside：分享里有什么（项目里的功能、场景、页面、堆叠进来的元素，逐条标出进分享 / 保留 / 裁掉 / 借用）；
 * - site：小周的浏览器（打开分享链接看到的发布站，可以点「查看源码」在 index.html 里搜索）。
 * 被分享的项目是「团队空间」：邀请成员（要给外部合作方小周看）、账单（新定价，还没公布）、数据导出。
 * 所有层共享同一份状态，由场景步骤驱动。
 */
import { $, eq, layer, neq, or, set, type Bind, type EffectDef } from '@joplo-app/kit';
import {
  Alert, Avatar, Badge, Box, Button, Code, Grid, Group, Menu, NavLink, Paper, Stack, Terminal, Text, TextInput, Title,
} from '@joplo-app/kit/ui';

const ui = $.ui as unknown as Record<string, Bind>;

/* ---------------- 分享里有什么：逐条状态 ---------------- */

/** 每一条的状态：all = 现在的分享（整个项目都进去）；keep = 保留；cut = 裁掉；borrow = 别的功能的元素，因为被引用而带上。 */
export type Mark = 'all' | 'keep' | 'cut' | 'borrow';

/** 项目里的条目：键 → 显示名。键也是状态名（ui.r_<键>）。 */
const ITEMS = {
  f_invite: '功能「邀请成员」',
  sc_happy: '场景「正常发出邀请」',
  sc_full: '场景「席位已满时邀请」',
  sc_expired: '场景「邀请链接过期」',
  f_billing: '功能「账单」· 新定价，还没公布',
  sc_upgrade: '场景「升级到 Pro」',
  sc_refund: '场景「申请退款」',
  f_export: '功能「数据导出」',
  sc_csv: '场景「导出成员 CSV」',
  p_members: '/members 成员页（routes/ 基础页面）',
  p_billing: '/billing 账单页（账单新增）',
  p_export: '/export 导出页（数据导出新增）',
  e_invite: '「邀请成员」按钮 · 邀请成员堆进来',
  e_seat: '「席位 5 / 5」徽标 · 账单堆进来',
  e_banner: '「新定价」横幅 · 账单堆进来（when 隐藏）',
  e_export: '「导出 CSV」按钮 · 数据导出堆进来',
  v_voice: '朗读音频',
  v_preview: '预览图 _joplo/preview.png',
} as const;
export type ItemKey = keyof typeof ITEMS;
const ALL_KEYS = Object.keys(ITEMS) as ItemKey[];

/** 把每一条设成给定状态；没写的设成 fallback。 */
export const marks = (m: Partial<Record<ItemKey, Mark>>, fallback: Mark): EffectDef[] =>
  ALL_KEYS.map((k) => set(ui[`r_${k}`]!, m[k] ?? fallback));

const Row = (p: { k: ItemKey; indent?: number }) => (
  <Group id={`i_${p.k}`} justify="space-between" gap="xs" pl={(p.indent ?? 0) * 18} wrap="nowrap">
    <Text size="sm">{ITEMS[p.k]}</Text>
    <Group gap={4} wrap="nowrap">
      <Badge when={eq(ui[`r_${p.k}`]!, 'all')} color="gray" variant="light">进分享</Badge>
      <Badge when={eq(ui[`r_${p.k}`]!, 'keep')} color="green" variant="light">保留</Badge>
      <Badge when={eq(ui[`r_${p.k}`]!, 'cut')} color="red" variant="outline">裁掉</Badge>
      <Badge when={eq(ui[`r_${p.k}`]!, 'borrow')} color="orange" variant="filled">借用 · 只这一个</Badge>
    </Group>
  </Group>
);

const Inside = () => (
  <Stack id="inside" p="lg" gap="md" maw={980} mx="auto">
    <Group justify="space-between">
      <Title order={2}>分享里有什么</Title>
      <Text id="in_title" fw={600}>{$.ui.insideTitle}</Text>
    </Group>
    <Grid gutter="lg">
      <Grid.Col span={6}>
        <Paper id="in_features" withBorder p="md">
          <Stack gap={6}>
            <Text fw={600}>功能与场景（选定方案）</Text>
            <Row k="f_invite" />
            <Row k="sc_happy" indent={1} />
            <Row k="sc_full" indent={1} />
            <Row k="sc_expired" indent={1} />
            <Box id="in_billing">
              <Stack gap={6}>
                <Row k="f_billing" />
                <Row k="sc_upgrade" indent={1} />
                <Row k="sc_refund" indent={1} />
              </Stack>
            </Box>
            <Row k="f_export" />
            <Row k="sc_csv" indent={1} />
          </Stack>
        </Paper>
      </Grid.Col>
      <Grid.Col span={6}>
        <Stack gap="md">
          <Paper id="in_pages" withBorder p="md">
            <Stack gap={6}>
              <Text fw={600}>页面</Text>
              <Row k="p_members" />
              <Row k="p_billing" />
              <Row k="p_export" />
            </Stack>
          </Paper>
          <Paper id="in_stacked" withBorder p="md">
            <Stack gap={6}>
              <Text fw={600}>/members 上堆叠进来的元素</Text>
              <Row k="e_invite" />
              <Row k="e_seat" />
              <Row k="e_banner" />
              <Row k="e_export" />
            </Stack>
          </Paper>
          <Paper id="in_files" withBorder p="md">
            <Stack gap={6}>
              <Text fw={600}>随分享上传的文件</Text>
              <Row k="v_voice" />
              <Row k="v_preview" />
            </Stack>
          </Paper>
        </Stack>
      </Grid.Col>
    </Grid>
    <Alert id="in_note" color="blue" when={$.ui.insideNote}>{$.ui.insideNote}</Alert>
  </Stack>
);

/* ---------------- 作者电脑：终端 + .joplo/cloud.json ---------------- */

const CLOUD_BEFORE = `// .joplo/cloud.json
{
  "server": "https://joplo.app",
  "shareId": "k3x9q",
  "url": "https://joplo.app/s/k3x9q",
  "review": { "shareId": "r5t1a", "url": "…/s/r5t1a" }
}`;

const CLOUD_AFTER = `// .joplo/cloud.json
{
  "server": "https://joplo.app",
  "shareId": "k3x9q",                 // 主链接：不动
  "url": "https://joplo.app/s/k3x9q",
  "review": { "shareId": "r5t1a", … }, // 评审链接：不动
  "scoped": {                          // 每个范围一条
    "invite.a-modal.happy": {
      "shareId": "p7m2c", "url": "…/s/p7m2c" },
    "invite.a-modal.full": {
      "shareId": "w8d4e", "url": "…/s/w8d4e" }
  }
}`;

const Author = () => (
  <Grid h="100%" p="md" gutter="md">
    <Grid.Col span={7}>
      <Terminal id="t_term" title="终端 · team-space" h="100%">
        {/* 现在：整个项目 + 深链接 */}
        <Terminal.Command when={$.ui.tOld}>npx joplo share</Terminal.Command>
        <Terminal.Output id="t_old" when={$.ui.tOld} tone="ok">{'构建：3 个功能 · 6 个场景\n✓ https://joplo.app/s/k3x9q'}</Terminal.Output>
        <Terminal.Output id="t_deeplink" when={$.ui.tDeep}>{'复制场景链接：https://joplo.app/s/k3x9q#/f/invite?s=invite.a-modal.happy\n（只决定从哪里开始看）'}</Terminal.Output>

        {/* 按场景分享 */}
        <Terminal.Command when={$.ui.tHappy}>npx joplo share --scenario invite.a-modal.happy</Terminal.Command>
        <Terminal.Output id="t_scope" when={$.ui.tHappy}>{'范围：邀请成员 › 正常发出邀请（1 个场景）\n裁掉：2 个功能 · 5 个场景 · 2 个页面 · 4 个别的功能堆进来的元素'}</Terminal.Output>
        <Terminal.Output id="t_happy_ok" when={$.ui.tHappyOk} tone="ok">{'上传 6 个文件（3 段朗读音频、预览图用「正常发出邀请」）\n✓ https://joplo.app/s/p7m2c  范围分享，主链接不变'}</Terminal.Output>

        {/* 按功能分享 */}
        <Terminal.Command when={$.ui.tFeature}>npx joplo share --feature invite</Terminal.Command>
        <Terminal.Output id="t_feature" when={$.ui.tFeature}>{'范围：邀请成员 · 选定方案 A · 弹窗（3 个场景）\n裁掉：2 个功能 · 3 个场景 · 2 个页面 · 3 个别的功能堆进来的元素'}</Terminal.Output>
        <Terminal.Output id="t_feature_borrow" when={$.ui.tFeature} tone="warn">{'带上了 1 个别的功能的元素：账单 › 「席位 5 / 5」徽标（「席位已满时邀请」第 2 步的镜头）'}</Terminal.Output>
        <Terminal.Output id="t_feature_ok" when={$.ui.tFeature} tone="ok">✓ https://joplo.app/s/n2v6h  范围分享</Terminal.Output>

        {/* 借用：场景引用了别的功能堆进来的元素 */}
        <Terminal.Command when={$.ui.tFull}>npx joplo share --scenario invite.a-modal.full</Terminal.Command>
        <Terminal.Output id="t_borrow" when={$.ui.tFull} tone="warn">{'带上了 1 个别的功能的元素（第 2 步的镜头对准了它）：\n  账单 › 「席位 5 / 5」徽标   /members 顶栏\n只带这一个元素：不带账单的名字、场景和其他元素\n不想带上：改这个场景，不再引用它'}</Terminal.Output>
        <Terminal.Output id="t_full_ok" when={$.ui.tFullOk} tone="ok">✓ https://joplo.app/s/w8d4e  范围分享</Terminal.Output>

        {/* 写错场景 id */}
        <Terminal.Command when={$.ui.tBad}>npx joplo share --scenario invite.happy</Terminal.Command>
        <Terminal.Output id="t_bad" when={$.ui.tBad} tone="error">{'SCOPE_UNKNOWN_SCENARIO  没有场景 invite.happy\n邀请成员（选定方案 a-modal）的场景：\n  invite.a-modal.happy    正常发出邀请\n  invite.a-modal.full     席位已满时邀请\n  invite.a-modal.expired  邀请链接过期\n没有上传任何文件'}</Terminal.Output>
        <Terminal.Command when={$.ui.tFix}>npx joplo share --scenario invite.a-modal.happy</Terminal.Command>
        <Terminal.Output id="t_fix" when={$.ui.tFix} tone="ok">{'✓ 更新范围分享 https://joplo.app/s/p7m2c（第 2 版）\n链接和评论保留；主链接、评审链接不变'}</Terminal.Output>

        <Terminal.Input id="t_in" placeholder="输入命令" />
      </Terminal>
    </Grid.Col>
    <Grid.Col span={5}>
      <Stack gap="sm">
        <Code id="a_cloud_before" block when={neq($.ui.cloud, 'after')}>{CLOUD_BEFORE}</Code>
        <Code id="a_cloud_after" block when={eq($.ui.cloud, 'after')}>{CLOUD_AFTER}</Code>
        <Text size="sm" c="dimmed">每个范围单独一个分享：重新分享同一个范围只更新它自己，不会把主链接换成只有一个场景的版本。</Text>
      </Stack>
    </Grid.Col>
  </Grid>
);

/* ---------------- 小周的浏览器：发布站 + 查看源码 ---------------- */

const members = [
  { name: '林舟', role: '管理员' },
  { name: '陈晨', role: '编辑者' },
  { name: '刘洋', role: '查看者' },
];

/** 被演示的成员页：基础页面 + 三个功能堆进来的元素（按 ui.show* 显示）。 */
const MembersPage = () => (
  <Stack id="s_page" gap="sm" h="100%">
    <Group justify="space-between">
      <Title order={3}>成员</Title>
      <Group gap="xs">
        <Badge id="s_seat" color="orange" variant="light" when={$.ui.showSeat}>席位 5 / 5</Badge>
        <Button id="s_export" variant="default" when={$.ui.showExport} unmodeled note="数据导出功能堆进来的按钮">导出 CSV</Button>
        <Button id="s_invite" unmodeled note="邀请成员功能堆进来的按钮；这里只演示分享，不演示邀请本身">邀请成员</Button>
      </Group>
    </Group>
    <Alert id="s_banner" color="grape" when={$.ui.showBanner}>新定价：Pro 每席 ¥39 起（还没公布）</Alert>
    <Grid>
      <Grid.Col span={5}>
        <Stack gap={6}>
          {members.map((m) => (
            <Group gap="sm"><Avatar name={m.name} size="sm" /><Text size="sm">{m.name}</Text><Badge variant="light" size="sm">{m.role}</Badge></Group>
          ))}
        </Stack>
      </Grid.Col>
      <Grid.Col span={7}>
        <Paper id="s_dlg" withBorder shadow="md" p="md" when={$.ui.dlg}>
          <Stack gap="xs">
            <Text fw={600}>邀请成员</Text>
            <TextInput id="s_email" label="邮箱" value={$.ui.email} unmodeled note="由被演示的场景填入" />
            <Text size="sm" c="orange" when={$.ui.seatFull}>席位已满：发出邀请后需要管理员加席位</Text>
            <Text size="sm" c="green" when={$.ui.sent}>✓ 已向 ajie@example.com 发送邀请</Text>
          </Stack>
        </Paper>
      </Grid.Col>
    </Grid>
  </Stack>
);

const Site = () => (
  <Stack id="s_root" h="100%" gap="sm" p="md">
    <Group justify="space-between">
      <Group gap="sm">
        <Text fw={600}>团队空间</Text>
        {/* 现在的发布站：功能下拉能切到任何功能 */}
        <Menu opened={$.ui.featOpen} position="bottom-start">
          <Menu.Target><Button id="s_feat" variant="default" when={eq($.ui.siteMode, 'full')}>邀请成员 ▾</Button></Menu.Target>
          <Menu.Dropdown>
            <Menu.Item id="s_feat_invite" unmodeled note="切到邀请成员">邀请成员</Menu.Item>
            <Menu.Item id="s_feat_billing" unmodeled note="现在的分享里，还没公布的账单也能切过去">账单（新定价）</Menu.Item>
            <Menu.Item id="s_feat_export" unmodeled note="切到数据导出">数据导出</Menu.Item>
          </Menu.Dropdown>
        </Menu>
        <Text id="s_scope_title" when={neq($.ui.siteMode, 'full')} c="dimmed">› 邀请成员</Text>
      </Group>
      <Group gap="xs">
        <Text size="xs" c="dimmed">用 Joplo 制作的概念原型 · 非正式实现</Text>
        <Button id="s_src" variant="subtle">查看源码</Button>
      </Group>
    </Group>
    <Grid style={{ flex: 1, minHeight: 0 }}>
      <Grid.Col span={3}>
        <Stack id="s_side" gap={4}>
          <Text fw={600}>邀请成员</Text>
          <Text size="xs" c="dimmed">管理员把同事拉进空间</Text>
          <NavLink id="s_sc_happy" label="正常发出邀请" active={eq($.ui.siteScenario, 'happy')} unmodeled note="当前场景" />
          <NavLink id="s_sc_full" label="席位已满时邀请" active={eq($.ui.siteScenario, 'full')} when={or(eq($.ui.siteMode, 'full'), eq($.ui.siteMode, 'feature'), eq($.ui.siteScenario, 'full'))} />
          <NavLink id="s_sc_expired" label="邀请链接过期" when={or(eq($.ui.siteMode, 'full'), eq($.ui.siteMode, 'feature'))} unmodeled note="同一功能的另一个场景" />
          <Text id="s_only" size="xs" c="dimmed" when={eq($.ui.siteMode, 'scenario')}>这个分享只有这一个场景</Text>
        </Stack>
      </Grid.Col>
      <Grid.Col span={9}>
        <Paper id="s_stage" withBorder radius="lg" p="lg" h="100%">
          <MembersPage />
        </Paper>
      </Grid.Col>
    </Grid>
    <Paper id="s_sub" withBorder radius="md" p="sm">
      <Text ta="center" size="lg" fw={600}>{$.ui.caption}</Text>
    </Paper>
    <Paper id="s_srcpanel" withBorder p="sm" when={$.ui.srcOpen}>
      <Stack gap={6}>
        <Group gap="sm">
          <Text size="sm" fw={600}>view-source:index.html</Text>
          <TextInput id="s_find" placeholder="在源码里搜索" w={220} />
          <Badge id="s_hits" color="red" variant="filled" when={eq($.ui.findState, 'hit')}>找到 7 处</Badge>
          <Badge id="s_nohit" color="green" variant="filled" when={eq($.ui.findState, 'none')}>0 处</Badge>
        </Group>
        <Code id="s_srchit" block when={eq($.ui.findState, 'hit')}>{'"billing":{"name":"账单（新定价）","goal":"Pro 每席 ¥39 起，老用户 6 折一年"…\n"billing.a-tier.upgrade":{"name":"升级到 Pro","steps":[…'}</Code>
        <Code id="s_srcnone" block when={eq($.ui.findState, 'none')}>{'"features":{"invite":{…}}   // 只有邀请成员\n"scenarios":{"invite.a-modal.happy":{…}}   // 只有这一个场景'}</Code>
      </Stack>
    </Paper>
  </Stack>
);

export const layers = () => ({
  author: layer('林舟的电脑', <Author />, { role: 'lin', icon: 'terminal' }),
  inside: layer('分享里有什么', <Inside />, { icon: 'server' }),
  site: layer('小周的浏览器', <Site />, { role: 'zhou', icon: 'browser' }),
});

/** 被演示的邀请流程（第 1 步开弹窗、第 2 步填邮箱、第 3 步发出）。 */
export const invite = {
  open: (): EffectDef[] => [set(ui.dlg, true), set(ui.caption, '管理员点「邀请成员」')],
  email: (): EffectDef[] => [set(ui.email, 'ajie@example.com'), set(ui.caption, '输入阿杰的邮箱')],
  send: (): EffectDef[] => [set(ui.sent, true), set(ui.caption, '邀请发出，阿杰会收到邮件')],
};

/** 小周打开的发布站：mode = full（现在：整个项目）/ feature / scenario。 */
export const site = (mode: 'full' | 'feature' | 'scenario', scenario: 'happy' | 'full' = 'happy'): EffectDef[] => [
  set(ui.siteMode, mode), set(ui.siteScenario, scenario),
  set(ui.showBanner, mode === 'full'), set(ui.showExport, mode === 'full'), set(ui.showSeat, mode === 'full' || scenario === 'full'),
  set(ui.dlg, false), set(ui.email, ''), set(ui.sent, false), set(ui.seatFull, false),
  set(ui.srcOpen, false), set(ui.findState, 'idle'), set(ui.featOpen, false),
  set(ui.caption, '▶ 点播放开始'),
];

/** 初始状态：林舟准备把演示发给小周。 */
export const initialUi = () => ({
  ...Object.fromEntries(ALL_KEYS.map((k) => [`r_${k}`, 'all'])),
  insideTitle: '现在：joplo share（整个项目）', insideNote: '',
  tOld: false, tDeep: false, tHappy: false, tHappyOk: false, tFeature: false, tFull: false, tFullOk: false, tBad: false, tFix: false,
  cloud: 'before',
  siteMode: 'full', siteScenario: 'happy',
  showBanner: true, showExport: true, showSeat: true,
  dlg: false, email: '', sent: false, seatFull: false,
  featOpen: false, srcOpen: false, findState: 'idle',
  caption: '▶ 点播放开始',
});
