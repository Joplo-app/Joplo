/**
 * 「看板里的云端用量与 Joplo Cloud 朗读」的画面：一层「林舟的看板」，两页——
 * - 首页：最近的项目；方案 A 在左栏底部放一张 Joplo Cloud 账号卡片；方案 B 在顶栏点账号弹出一个小浮层；
 * - 演示页：播放控制右侧的声音浮层，声音来源只剩官方的；选 Joplo Cloud 朗读时显示剩余字数、可试听的音色。
 */
import { $, and, callout, done, eq, flow, highlight, layer, narrate, not, numbered, set, shot, spotlight, uses, type Bind, type Flow } from '@joplo-app/kit';
import { Alert, Anchor, Badge, Button, Code, Group, ListRow, NavLink, Paper, Progress, Select, Stack, Switch, Text, Title } from '@joplo-app/plugin-ui';

const ui = $.ui as unknown as Record<string, Bind>;
export type Variant = 'a' | 'b';

export const initialUi = (v: Variant) => ({
  v,
  page: 'home',
  acct: false,
  signedIn: true,
  voiceOpen: false,
  source: 'cloud',
  left: '3,200 字',
  leftPct: 64,
  exhausted: false,
  playing: '',
  voice: '讲解 · 温和女声',
  caption: '管理员打开「邀请成员」',
  browserNote: false,
  have: '17 / 18 步有音频',
  genLabel: '生成缺少的音频（1 步 · 约 45 字）',
  after: '生成后还剩 3,155 字',
  generating: false,
  voices: false,
});

const Usage = ({ id }: { id: string }) => (
  <Stack id={id} gap={6}>
    <Group justify="space-between">
      <Text size="xs" fw={600} c="dimmed">空间</Text>
      <Text size="xs" c="dimmed">38.1 MB / 100 MB</Text>
    </Group>
    <Progress value={38} size="xs" />
    <Group justify="space-between">
      <Text size="xs" fw={600} c="dimmed">朗读</Text>
      <Text size="xs" c="dimmed">{ui.left as never}（体验额度）</Text>
    </Group>
    <Progress value={ui.leftPct as never} size="xs" color="grape" />
  </Stack>
);

/** 方案 A：首页左栏底部的账号卡片。 */
const AccountCard = () => (
  <Paper id="c_card" withBorder p="sm" when={eq(ui.v, 'a') as never}>
    <Stack gap="xs">
      <Group justify="space-between">
        <Text size="sm" fw={600}>Joplo Cloud</Text>
        <Badge variant="light" color="gray">免费版</Badge>
      </Group>
      <Text size="xs" c="dimmed">lin@example.com</Text>
      <Usage id="c_card_usage" />
      <Anchor id="c_card_link" size="xs" href="https://cloud.joplo.app/usage">用量与音色 ↗</Anchor>
    </Stack>
  </Paper>
);

/** 方案 B：顶栏的账号按钮与浮层。 */
const AccountPop = () => (
  <Paper id="c_pop" withBorder shadow="md" p="sm" w={280} when={and(eq(ui.v, 'b'), ui.acct) as never} style={{ position: 'absolute', right: 12, top: 48, zIndex: 6 }}>
    <Stack gap="xs">
      <Group justify="space-between">
        <Text size="sm" fw={600}>lin@example.com</Text>
        <Badge variant="light" color="gray">免费版</Badge>
      </Group>
      <Usage id="c_pop_usage" />
      <Anchor id="c_pop_link" size="xs" href="https://cloud.joplo.app/usage">用量与音色 ↗</Anchor>
    </Stack>
  </Paper>
);

/** 声音浮层：照着真实看板的浮层画（开关、声音来源、旁白、几步有音频、生成缺少的音频），把 AiHubMix 换成 Joplo Cloud 朗读。 */
const VoicePop = () => (
  <Paper id="c_voice" withBorder shadow="md" p="sm" w={360} when={ui.voiceOpen as never} style={{ position: 'absolute', right: 12, bottom: 64, zIndex: 6 }}>
    <Stack gap="sm">
      <Group justify="space-between">
        <Text fw={700}>声音</Text>
        <Switch id="c_v_on" label="朗读每一步" checked unmodeled />
      </Group>
      <Text size="xs" c="dimmed">自动播放和「下一步」时朗读。写了 say() 读 say()，否则读字幕。</Text>
      <Stack id="c_v_source" gap={2}>
        <Text size="xs" fw={600} c="dimmed">声音来源</Text>
        <Group justify="space-between" px={8} py={6} style={{ borderRadius: 8, background: 'var(--jp-selected, #fff3bf)' }}>
          <Group gap={6}><Text size="sm" fw={600}>✓ Joplo Cloud 朗读</Text><Badge size="xs" variant="light">推荐</Badge></Group>
          <Text id="c_v_left" size="xs" c="dimmed" when={ui.signedIn as never}>剩 {ui.left as never}</Text>
          <Text size="xs" c="dimmed" when={not(ui.signedIn) as never}>登录后可用</Text>
        </Group>
        <Group justify="space-between" px={8} py={6}><Text size="sm">浏览器朗读</Text><Text size="xs" c="dimmed">本机</Text></Group>
        <Group justify="space-between" px={8} py={6}><Text size="sm">OpenAI</Text><Text size="xs" c="dimmed">没有密钥</Text></Group>
        <Group justify="space-between" px={8} py={6}><Text size="sm">ElevenLabs</Text><Text size="xs" c="dimmed">没有密钥</Text></Group>
      </Stack>
      <Stack gap={6} when={ui.signedIn as never} style={{ borderTop: '1px solid var(--jp-line)', paddingTop: 8 }}>
        <Group justify="space-between">
          <Group gap={6}>
            <Text size="sm">旁白：{ui.voice as never}</Text>
            <Button id="c_v_play1" size="compact-xs" variant="default">▶ 试听</Button>
            <Badge variant="dot" color="green" when={ui.playing as never}>试听中 · 不扣字数</Badge>
          </Group>
          <Text size="sm" fw={600}>{ui.have as never}</Text>
        </Group>
        <Stack id="c_v_list" gap={2} when={ui.voices as never}>
          {['讲解 · 温和女声', '讲解 · 沉稳男声', '对话 · 轻快女声'].map((name, i) => (
            <ListRow key={name} id={`c_v_row${i}`} title={name} active={eq(ui.voice, name) as never} />
          ))}
        </Stack>
        <Button id="c_v_gen" color="dark" fullWidth when={not(ui.exhausted) as never} loading={ui.generating as never}>{ui.genLabel as never}</Button>
        <Text id="c_v_after" size="xs" c="dimmed" when={not(ui.exhausted) as never}>{ui.after as never}</Text>
        <Alert id="c_v_out" color="orange" title="朗读额度不够" when={ui.exhausted as never}>
          <Stack gap={4}>
            <Text size="sm">还有 3 步没有音频，约 160 字，剩 0 字。这几步先用浏览器朗读，演示照常播放。</Text>
            <Anchor id="c_v_buy" size="sm" href="https://cloud.joplo.app/usage" unmodeled note="新标签页打开控制台的用量页">买加油包 ↗</Anchor>
          </Stack>
        </Alert>
        <Text size="xs" c="dimmed">覆盖这个方案的所有场景。build 和分享时会带上生成的音频。<Anchor id="c_v_usage" size="xs" href="https://cloud.joplo.app/usage" unmodeled> 用量 ↗</Anchor></Text>
      </Stack>
      <Stack id="c_v_login" gap={6} when={not(ui.signedIn) as never} style={{ borderTop: '1px solid var(--jp-line)', paddingTop: 8 }}>
        <Text size="sm">登录 Joplo Cloud 后就能用，不用配密钥。</Text>
        <Code>npx joplo login</Code>
        <Text size="xs" c="dimmed">没登录时用浏览器朗读。</Text>
      </Stack>
      <Button id="c_v_keys" variant="subtle" size="xs" leftSection="⚙" unmodeled note="只管 OpenAI / ElevenLabs 的密钥">管理密钥…</Button>
    </Stack>
  </Paper>
);

function Board() {
  return (
    <Stack gap={0} h="100%" style={{ position: 'relative' }}>
      <Group justify="space-between" px="md" py={8} style={{ borderBottom: '1px solid var(--jp-line)' }}>
        <Group gap={8}>
          <Badge variant="filled" color="yellow" c="dark">Joplo</Badge>
          <Text size="sm" c="dimmed" when={eq(ui.page, 'player') as never}>团队空间 › 邀请成员</Text>
        </Group>
        <Group gap={6}>
          <Button id="c_acct" size="xs" variant="default" when={eq(ui.v, 'b') as never}>lin@ · 38 MB / 100 MB</Button>
          <Button id="c_publish" size="xs" color="blue" unmodeled>☁ 发布到 Joplo Cloud</Button>
        </Group>
      </Group>
      <Group gap={0} align="stretch" wrap="nowrap" style={{ flex: 1, minHeight: 0 }} when={eq(ui.page, 'home') as never}>
        <Stack gap="xs" p="sm" w={260} style={{ borderRight: '1px solid var(--jp-line)' }}>
          <Text size="xs" c="dimmed">最近的项目</Text>
          <NavLink id="c_proj" label="团队空间" description="3 个功能" />
          <NavLink id="c_proj2" label="中期选举解读" description="1 个功能" unmodeled />
          <Stack style={{ flex: 1 }} />
          <AccountCard />
        </Stack>
        <Stack p="lg" gap="sm" style={{ flex: 1 }}>
          <Title order={3}>团队空间</Title>
          <Text c="dimmed" size="sm">邀请成员 · 席位管理 · 账单</Text>
        </Stack>
      </Group>
      <Stack gap="sm" p="lg" style={{ flex: 1 }} when={eq(ui.page, 'player') as never}>
        <Paper withBorder h={260} bg="var(--jp-subtle)" p="md"><Text c="dimmed" size="sm">（被演示的原型：邀请成员）</Text></Paper>
        <Group justify="space-between">
          <Text id="c_caption" fw={600}>{ui.caption as never}</Text>
          <Badge variant="outline" color="gray" when={ui.browserNote as never}>浏览器朗读</Badge>
        </Group>
        <Group gap={8}>
          <Badge variant="outline">‹</Badge>
          <Badge variant="filled" color="dark">▶</Badge>
          <Badge variant="outline">›</Badge>
          <Button id="c_voice_btn" size="xs" variant="default">🔊 声音</Button>
        </Group>
      </Stack>
      <AccountPop />
      <VoicePop />
    </Stack>
  );
}

export const layers = () => ({
  board: layer('林舟的看板', <Board />, { role: 'lin', icon: 'window' }),
});

export const scenarios = (v: Variant) => {
  const base = { ui: initialUi(v) };
  const glance = (f: Flow): Flow =>
    v === 'a'
      ? f.system('左栏底部的账号卡片', '空间 38 MB / 100 MB，朗读还剩 3,200 字', narrate('左栏底部是 Joplo Cloud 的账号卡片：空间用了三十八兆，朗读还剩三千二百字。'), spotlight('c_card'), uses('both_places'))
      : f
          .click('c_acct', '点顶栏的账号', narrate('点顶栏的账号，弹出一个小浮层。'), set($.ui.acct, true))
          .system('账号浮层', '空间 38 MB / 100 MB，朗读还剩 3,200 字', narrate('浮层里是空间和朗读的用量。'), spotlight('c_pop'), uses('both_places'));
  const toPlayer = (f: Flow): Flow => f.click('c_proj', '打开「团队空间」', narrate('打开团队空间，进入演示。'), set($.ui.page, 'player'), set($.ui.acct, false));
  return {
    glance: glance(
      flow('在看板里看用量', { cases: ['glance'], start: '/', state: base, expected: '空间和朗读一眼看到；点一下去控制台' })
        .card('林舟打开本地看板', { role: 'lin', sub: '已经登录 Joplo Cloud' }, narrate('林舟打开本地看板，他已经登录了 Joplo Cloud。')),
    ).click(v === 'a' ? 'c_card_link' : 'c_pop_link', '点「用量与音色 ↗」', narrate('想看明细，点用量与音色，在新标签页打开控制台。'), callout(v === 'a' ? 'c_card_link' : 'c_pop_link', '新标签页打开控制台'), uses('console_link'), done('不用离开看板就知道还剩多少')),

    cloud_voice: toPlayer(
      flow('用 Joplo Cloud 朗读做旁白', { cases: ['cloud_voice'], start: '/', state: base, expected: '在声音浮层里选 Joplo Cloud 朗读；试听不扣字数；生成前就知道用多少字' })
        .card('林舟想给演示配上旁白', { role: 'lin', sub: '不想自己去申请密钥' }, narrate('林舟想给演示配上旁白，但不想自己去申请密钥。')),
    )
      .click('c_voice_btn', '打开声音浮层', narrate('打开声音浮层。'), set($.ui.voiceOpen, true), shot('c_voice'))
      .system('Joplo Cloud 朗读排在第一', '后面写着还剩多少字', narrate('声音来源第一个就是 Joplo Cloud 朗读，后面写着还剩多少字；其他只剩官方的几个。'), numbered('c_v_source', 'c_v_left'), uses('official_only', 'cloud_default'))
      .click('c_v_play1', '试听旁白', narrate('先试听一下旁白的声音，不扣字数。'), set($.ui.playing, true), set($.ui.voices, true), highlight('c_v_list'), uses('preview_free'))
      .system('生成前就知道用多少', '1 步 · 约 45 字，生成后还剩 3,155', narrate('生成按钮上写着这次要用多少字，下面写着生成后还剩多少。'), set($.ui.playing, false), numbered('c_v_gen', 'c_v_after'))
      .click('c_v_gen', '生成缺少的音频', narrate('点生成，把缺的那一步补上。'), set($.ui.generating, true))
      .system('补齐了', '18 / 18 步有音频，剩 3,155 字', narrate('补齐了，十八步都有音频，剩下的字数跟着更新。分享时会带上这些音频。'), set($.ui.generating, false), set($.ui.have, '18 / 18 步有音频'), set($.ui.left, '3,155 字'), set($.ui.genLabel, '全部步骤都有音频'), set($.ui.after, '剩 3,155 字'), spotlight('c_v_left'), uses('live_count'), done('在本地就把旁白配好了')),

    exhausted: toPlayer(
      flow('朗读额度用完了', { cases: ['exhausted'], start: '/', state: { ui: { ...initialUi(v), left: '0 字', leftPct: 0 } }, expected: '改用浏览器朗读，演示照常播放；给买加油包的入口' })
        .card('体验额度用完了', { role: 'lin', sub: '还有几步没生成声音' }, narrate('林舟的体验额度用完了，还有几步没生成声音。')),
    )
      .system('改用浏览器朗读', '演示照常播放，字幕区标出', narrate('没有声音的步骤改用浏览器朗读，演示照常播放，字幕旁边标出来。'), set($.ui.browserNote, true), set($.ui.caption, '邀请发出，阿杰会收到邮件'), highlight('c_caption'), uses('fallback_browser'))
      .click('c_voice_btn', '打开声音浮层看看', narrate('打开声音浮层看看。'), set($.ui.voiceOpen, true), set($.ui.exhausted, true))
      .system('说清楚用完了', '给「买加油包 ↗」', narrate('浮层里说清楚额度用完了，给了买加油包的入口。'), spotlight('c_v_out'), uses('console_link'), done('知道为什么、去哪里补')),

    signed_out: toPlayer(
      flow('还没登录', { cases: ['signed_out'], start: '/', state: { ui: { ...initialUi(v), signedIn: false } }, expected: '写“登录后可用”，给登录命令；浏览器朗读照常' })
        .card('林舟还没登录 Joplo Cloud', { role: 'lin', sub: '刚装好 Joplo' }, narrate('林舟刚装好 Joplo，还没登录。')),
    )
      .click('c_voice_btn', '打开声音浮层', narrate('打开声音浮层。'), set($.ui.voiceOpen, true))
      .system('登录后可用', '给可复制的登录命令', narrate('Joplo Cloud 朗读写着登录后可用，给了登录命令；没登录时先用浏览器朗读。'), spotlight('c_v_login'), done('知道怎么开始用')),
  };
};
