/**
 * 导演模式朗读（TTS）的画面：
 * - board：林舟的本地看板（被演示的是“邀请成员”原型），字幕区下方有朗读状态，播放控制右侧是声音浮层；
 * - pace：一步里“文字停留”和“声音”两条时间线，用来讲清楚“声音没读完就不切走”；
 * - author：作者电脑（joplo.config.ts、narrate() / say() 写法、终端）；
 * - arch：声音从哪里来（浏览器朗读 / 提前生成的音频；Key 只在本机）；
 * - site：观众在发布站看到的播放器（默认静音，点 🔊 开声音）。
 * 所有层共享同一份状态，由场景步骤驱动。
 */
import { $, and, eq, layer, neq, not, set, type Bind, type EffectDef } from '@joplo-app/kit';
import {
  ActionIcon, Alert, Anchor, Avatar, Badge, Box, Breadcrumbs, Button, Code, Diagram, EmptyState, Grid, Group, KeyValue, Menu, Modal, NavLink, Paper,
  PasswordInput, Progress, Select, Stack, StateFlow, Switch, Terminal, Text, TextInput, Title,
} from '@joplo-app/kit/ui';

const ui = $.ui as unknown as Record<string, Bind>;

/* ---------------- 被演示的原型：邀请成员（三步） ---------------- */

/** 被演示原型的三步：每一步改原型画面、字幕和步数。 */
export const inner = {
  s1: (): EffectDef[] => [set(ui.dlg, true), set(ui.caption, '管理员打开「邀请成员」'), set(ui.speaker, '林舟'), set(ui.stepText, '第 1 / 3 步')],
  s2: (): EffectDef[] => [set(ui.email, 'ajie@example.com'), set(ui.caption, '输入阿杰的邮箱'), set(ui.stepText, '第 2 / 3 步')],
  s3: (): EffectDef[] => [set(ui.sent, true), set(ui.caption, '邀请发出，阿杰会收到邮件'), set(ui.stepText, '第 3 / 3 步')],
};

/** 读这一步：朗读状态 + 进度 + 用的哪个声音。 */
export const speak = (pct: number, name?: string): EffectDef[] => [set(ui.voice, 'speaking'), set(ui.voicePct, pct), ...(name ? [set(ui.voiceName, name)] : [])];

export const BROWSER_VOICE = '浏览器 · Tingting';
export const PROVIDER_VOICE = 'OpenAI 兼容 · nova';

const members = [
  { name: '林舟', role: '管理员' },
  { name: '陈晨', role: '编辑者' },
  { name: '刘洋', role: '查看者' },
];

const Prototype = (p: { id: string }) => (
  <Stack gap="sm" h="100%">
    <Group justify="space-between">
      <Title order={3}>成员</Title>
      <Button id={`${p.id}_invite`} unmodeled note="被演示原型里的按钮：这里只演示朗读，不演示邀请本身">邀请成员</Button>
    </Group>
    <Grid>
      <Grid.Col span={5}>
        <Stack gap={6}>
          {members.map((m) => (
            <Group gap="sm"><Avatar name={m.name} size="sm" /><Text size="sm">{m.name}</Text><Badge variant="light" size="sm">{m.role}</Badge></Group>
          ))}
        </Stack>
      </Grid.Col>
      <Grid.Col span={7}>
        <Paper id={`${p.id}_dlg`} withBorder shadow="md" p="md" when={$.ui.dlg}>
          <Stack gap="xs">
            <Text fw={600}>邀请成员</Text>
            <TextInput id={`${p.id}_email`} label="邮箱" value={$.ui.email} unmodeled note="由被演示的场景填入" />
            <Text size="sm">权限：编辑者</Text>
            <Text size="sm" c="green" when={$.ui.sent}>✓ 已向 ajie@example.com 发送邀请</Text>
          </Stack>
        </Paper>
      </Grid.Col>
    </Grid>
  </Stack>
);

/* ---------------- 字幕区：字幕 + 朗读状态 ---------------- */

const VoiceState = (p: { id: string }) => (
  <Group id={`${p.id}_vstate`} gap="xs" mih={26}>
    <Badge when={eq($.ui.voice, 'off')} variant="default">🔇 没开声音，只看字幕</Badge>
    <Badge id={`${p.id}_vready`} when={eq($.ui.voice, 'ready')} color="blue" variant="light">🔊 声音已开，播放时朗读</Badge>
    <Badge id={`${p.id}_vspeaking`} when={eq($.ui.voice, 'speaking')} color="blue" variant="dot">朗读中 · {$.ui.voiceName}</Badge>
    <Badge id={`${p.id}_vtextwait`} when={eq($.ui.voice, 'textwait')} color="gray" variant="dot">读完了，画面再停一会</Badge>
    <Badge id={`${p.id}_vwait`} when={eq($.ui.voice, 'waiting')} color="orange" variant="dot">字幕时间到了，等声音读完</Badge>
    <Badge id={`${p.id}_vbreath`} when={eq($.ui.voice, 'breath')} color="gray" variant="dot">读完了，换气 0.45 秒</Badge>
    <Badge id={`${p.id}_vpaused`} when={eq($.ui.voice, 'paused')} color="gray">⏸ 暂停：声音停在这里</Badge>
    <Badge id={`${p.id}_vfallback`} when={eq($.ui.voice, 'fallback')} color="yellow" variant="dot">这一步没生成好，改用浏览器朗读</Badge>
    <Progress w={180} value={$.ui.voicePct} when={and(neq($.ui.voice, 'off'), neq($.ui.voice, 'ready'))} />
  </Group>
);

const Subtitle = (p: { id: string }) => (
  <Paper id={`${p.id}_sub`} withBorder radius="md" p="md">
    <Stack gap={6} align="center">
      <Group gap="sm">
        <Badge variant="light">{$.ui.speaker}</Badge>
        <Text size="xl" fw={600}>{$.ui.caption}</Text>
      </Group>
      <VoiceState id={p.id} />
    </Stack>
  </Paper>
);

/* ---------------- 看板的声音浮层 ---------------- */

const VoicePanel = () => (
  <Stack id="b_vpanel" gap="sm" w={340} p="xs">
    <Group justify="space-between">
      <Text fw={600}>声音</Text>
      <Text size="xs" c="dimmed">只影响自动播放和「下一步」</Text>
    </Group>
    <Switch id="b_v_on" label="朗读每一步" description="读旁白 narrate()；没有时读角色台词 say()，再没有读字幕" />
    <Select id="b_v_profile" label="声音来源" data={['浏览器朗读（本机）', 'OpenAI', 'ElevenLabs', 'AiHubMix', '公司网关']} placeholder="浏览器朗读（本机）" unmodeled note="切换已保存的供应商 profile" />
    <Stack gap={6} when={eq($.ui.engine, 'browser')}>
      <Select id="b_v_sys" label="旁白的声音（本机）" data={['Tingting（中文）', 'Meijia（中文）', 'Samantha（英文）']} placeholder="Tingting（中文）" unmodeled note="列出浏览器能用的声音" />
      <Text size="xs" c="dimmed">不用配置。每台电脑的声音不一样，也进不了视频。</Text>
    </Stack>
    <Stack gap={6} when={eq($.ui.engine, 'provider')}>
      <KeyValue items={[{ label: '旁白', value: 'nova' }, { label: '林舟（管理员）', value: 'alloy' }]} />
      <Text id="b_v_status" size="sm">{$.ui.genStatus}</Text>
      <Progress value={$.ui.genPct} when={$.ui.generating} striped />
      <Button id="b_v_gen" variant="light">{$.ui.genButton}</Button>
      <Text size="xs" c="dimmed">分享时自动带上生成好的声音；Key 不上传。</Text>
    </Stack>
    <Button id="b_v_manage" variant="subtle" leftSection="⚙">管理供应商…</Button>
  </Stack>
);

/* ---------------- 看板设置：声音供应商（profile） ---------------- */

const Profiles = () => (
  <Modal id="b_profiles" opened={$.ui.profilesOpen} title="声音供应商" size="xl" centered>
    <Grid gutter="lg">
      <Grid.Col span={4}>
        <Stack gap={4}>
          <NavLink id="m_p_browser" label="浏览器朗读" description="内置 · 不用配置" unmodeled note="内置 profile，不能删除" />
          <NavLink id="m_p_openai" label="OpenAI" description="预设 · api.openai.com" unmodeled note="预设：填 Key 就能用" />
          <NavLink id="m_p_eleven" label="ElevenLabs" description="预设 · api.elevenlabs.io" unmodeled note="预设：填 Key 就能用" />
          <NavLink id="m_p_aihubmix" label="AiHubMix" description="预设 · aihubmix.com" unmodeled note="预设：填 Key 就能用" />
          <NavLink id="m_p_acme" label="公司网关" description="llm.acme.internal" active when={$.ui.editing} unmodeled note="正在编辑的 profile" />
          <Button id="m_new" variant="light" leftSection="+">新建供应商</Button>
          <Text size="xs" c="dimmed">保存在本机 ~/.joplo，所有项目共用；Key 不进项目。</Text>
        </Stack>
      </Grid.Col>
      <Grid.Col span={8}>
        <EmptyState id="m_empty" when={not($.ui.editing)} title="选一个供应商，或新建一个" description="OpenAI 兼容的接口都可以填自己的 Base URL" />
        <Stack id="m_form" gap="xs" when={$.ui.editing}>
          <Group grow>
            <TextInput id="m_name" label="名称" />
            <Select id="m_type" label="接口类型" data={['OpenAI 兼容', 'ElevenLabs', '自定义 HTTP']} placeholder="OpenAI 兼容" unmodeled note="自定义 HTTP：自己写请求体模板，{{text}} {{voice}} 会被替换" />
            <TextInput id="m_model" label="模型" placeholder="tts-1" unmodeled note="填网关支持的模型名" />
          </Group>
          <Group grow>
            <TextInput id="m_url" label="Base URL" />
            <PasswordInput id="m_key" label="API Key" />
          </Group>
          <Group grow>
            <TextInput id="m_voice" label="默认音色" placeholder="nova" unmodeled note="旁白和角色可以在项目里分别指定" />
            <Select id="m_format" label="返回内容" data={['音频文件（mp3 / wav）', 'JSON 里的 base64', 'JSON 里的音频链接']} placeholder="音频文件（mp3 / wav）" />
            <TextInput id="m_path" label="音频字段路径" placeholder="data.audio" disabled={not($.ui.jsonPath)} disabledReason="返回内容是 JSON 时才需要" />
          </Group>
          <Alert id="m_bad" color="red" when={eq($.ui.testState, 'bad')}>
            {'返回的不是音频，而是 JSON：{"data":{"audio":"SUQzBA…"}}\n像 base64 音频：改成「JSON 里的 base64」，字段路径 data.audio'}
          </Alert>
          <Alert id="m_ok" color="green" when={eq($.ui.testState, 'ok')}>连通了：试读一句，mp3，1.8 秒</Alert>
          <Group justify="flex-end" gap="xs">
            <Button id="m_test" variant="default">测试</Button>
            <Button id="m_save" disabled={neq($.ui.testState, 'ok')} disabledReason="先测试通过再保存">保存并使用</Button>
          </Group>
        </Stack>
      </Grid.Col>
    </Grid>
  </Modal>
);

/* ---------------- 播放器（看板与发布站共用骨架） ---------------- */

const Controls = (p: { id: string; site?: boolean }) => (
  <Group justify="space-between">
    <Group gap="xs">
      <Button id={`${p.id}_prev`} variant="default" unmodeled note="上一步：同“下一步”，当前声音立刻停">上一步</Button>
      <Button id={`${p.id}_play`}>{$.ui.playLabel}</Button>
      <Button id={`${p.id}_next`} variant="default" unmodeled={p.site} note="手动下一步：当前声音立刻停，读下一步">下一步</Button>
    </Group>
    <Group gap="xs">
      <Text size="xs" c="dimmed">{$.ui.stepText}</Text>
      {p.site
        ? (
          <Group gap="xs">
            <Badge id="s_hint" color="blue" variant="light" when={$.ui.siteHint}>这个演示有旁白 →</Badge>
            <ActionIcon id="s_voice" aria-label="开关声音" variant="default">{$.ui.voiceIcon}</ActionIcon>
          </Group>
        )
        : (
          <Menu opened={$.ui.voiceOpen} position="top-end">
            <Menu.Target><ActionIcon id="b_voice" aria-label="声音设置" variant="default">{$.ui.voiceIcon}</ActionIcon></Menu.Target>
            <Menu.Dropdown><VoicePanel /></Menu.Dropdown>
          </Menu>
        )}
    </Group>
  </Group>
);

const Board = () => (
  <Stack id="b_root" h="100%" gap="sm" p="md">
    <Group justify="space-between">
      <Breadcrumbs>
        <Anchor id="b_crumb" href="/voice" unmodeled>团队邀请</Anchor>
        <Text size="sm">邀请成员</Text>
        <Text size="sm" fw={600}>正常发出邀请</Text>
      </Breadcrumbs>
      <Badge variant="light">🎥 跟随导演</Badge>
    </Group>
    <Paper id="b_stage" withBorder radius="lg" p="lg" style={{ flex: 1, minHeight: 0 }}>
      <Prototype id="b_pc" />
    </Paper>
    <Subtitle id="b" />
    <Controls id="b" />
    <Profiles />
  </Stack>
);

const Site = () => (
  <Stack id="s_root" h="100%" gap="sm" p="md">
    <Group justify="space-between">
      <Text fw={600}>团队邀请 · 邀请成员</Text>
      <Text size="xs" c="dimmed">用 Joplo 制作</Text>
    </Group>
    <Paper id="s_stage" withBorder radius="lg" p="lg" style={{ flex: 1, minHeight: 0 }}>
      <Prototype id="s_pc" />
    </Paper>
    <Subtitle id="s" />
    <Controls id="s" site />
  </Stack>
);

/* ---------------- 节奏：一步里的两条时间线 ---------------- */

const Pace = () => (
  <Stack id="pace" p="xl" gap="lg" maw={880} mx="auto">
    <Title order={2}>第 2 步：字幕短，旁白长</Title>
    <KeyValue items={[{ label: '字幕', value: '输入阿杰的邮箱' }, { label: '旁白 narrate()', value: '她输入阿杰的邮箱，权限先给编辑者，以后随时能改' }]} />
    <Stack id="p_text" gap={4}>
      <Group justify="space-between"><Text fw={600}>画面停留（按字幕字数）</Text><Text c="dimmed">3.0 秒</Text></Group>
      <Progress value={$.ui.textPct} color="gray" size="lg" />
    </Stack>
    <Stack id="p_voice" gap={4}>
      <Group justify="space-between"><Text fw={600}>声音</Text><Text c="dimmed">5.2 秒</Text></Group>
      <Progress value={$.ui.voicePct} color="blue" size="lg" />
    </Stack>
    <StateFlow id="p_flow" value={$.ui.paceState} states={['reading', 'text_done', 'waiting', 'breath', 'next']}
      labels={{ reading: '边看边读', text_done: '画面停留结束', waiting: '等声音读完', breath: '换气 0.45 秒', next: '下一步' }} />
    <KeyValue id="p_sum" items={[{ label: '这一步实际停留', value: $.ui.dwellText }]} />
    <Text size="sm" c="dimmed">停留 = max(画面停留, 声音时长 + 0.45 秒)。暂停时两条一起停；手动上一步 / 下一步时声音立刻停。</Text>
  </Stack>
);

/* ---------------- 作者电脑：配置、narrate() / say()、终端 ---------------- */

const CONFIG = `// joplo.config.ts
export default config({
  name: '团队邀请',
  voice: {
    profile: '公司网关',    // 本机 profile 的名字；不写：浏览器朗读
    narrator: 'nova',       // 系统步骤、过渡卡
    roles: { lin: 'alloy' }, // 角色各用一个声音
  },                         // Key 不写在这里
});`;

const FLOW = `// features/invite/options/a-modal.tsx
.type('email', 'ajie@example.com', '输入阿杰的邮箱',
  narrate('她输入阿杰的邮箱，权限先给编辑者，以后随时能改'))
// 角色亲口说的话用 say()，用角色的声音读
.click('can_go', '阿杰回复：我能去', say('周六我能去！'))`;

const Author = () => (
  <Grid h="100%" p="md" gutter="md">
    <Grid.Col span={6}>
      <Stack h="100%" gap="sm">
        <Code id="a_config" block>{CONFIG}</Code>
        <Code id="a_flow" block>{FLOW}</Code>
        <Text size="sm" c="dimmed">字幕给眼睛看；narrate() 是旁白，say() 是角色台词，都和字幕分开存。</Text>
      </Stack>
    </Grid.Col>
    <Grid.Col span={6}>
      <Terminal id="t_term" title="终端 · examples/invite" h="100%">
        <Terminal.Command when={$.ui.tShare}>npx joplo share</Terminal.Command>
        <Terminal.Output when={$.ui.tShare}>构建：1 个功能 · 3 段声音（186 KB）</Terminal.Output>
        <Terminal.Output id="t_stale" when={$.ui.tShare} tone="warn">第 2 段声音过期（字幕改过），观众端这一步用浏览器朗读；想补上：在看板点「生成」</Terminal.Output>
        <Terminal.Output id="t_upload" when={$.ui.tShared} tone="ok">{'上传 4 个新文件（含 2 段声音），其余已在云端；Key 不上传\nhttps://joplo.app/s/k3x9q（1 小时有效）'}</Terminal.Output>
        <Terminal.Command when={$.ui.tCheck}>npx joplo check</Terminal.Command>
        <Terminal.Output when={$.ui.tCheck} tone="warn">{'a-modal.tsx:24  warning  VOICE_FAILED  第 2 步的声音没生成（供应商限流 429），\n播放时改用浏览器朗读；重试：npx joplo voice --retry'}</Terminal.Output>
        <Terminal.Input id="t_in" placeholder="输入命令" />
      </Terminal>
    </Grid.Col>
  </Grid>
);

/* ---------------- 背后：声音从哪里来 ---------------- */

const Arch = () => (
  <Box p="md" h="100%">
    <Diagram id="arch" h="100%" direction="right">
      <Diagram.Group id="g_local" label="作者电脑" icon="lock" tone="orange">
        <Diagram.Node id="key" label="Key" kind="storage" description="~/.joplo，只在本机" />
        <Diagram.Node id="gen" label="生成器" kind="service" description="看板按钮 / joplo voice" />
      </Diagram.Group>
      <Diagram.Group id="g_ext" label="外部供应商" icon="external" tone="purple">
        <Diagram.Node id="prov" label="TTS 供应商" kind="external" description="OpenAI · ElevenLabs · AiHubMix · 自定义" />
      </Diagram.Group>
      <Diagram.Group id="g_src" label="声音来源" icon="storage" tone="green">
        <Diagram.Node id="files" label="音频文件" kind="storage" description="按文字 + 音色缓存，发布时带上" />
        <Diagram.Node id="web" label="浏览器朗读" kind="tool" description="观众电脑的声音" />
      </Diagram.Group>
      <Diagram.Group id="g_cloud" label="joplo.app 分享" icon="cloud" tone="teal">
        <Diagram.Node id="r2" label="分享里的音频" kind="storage" description="和页面一起上传，按内容去重" />
      </Diagram.Group>
      <Diagram.Group id="g_play" label="看板 / 发布站" icon="client" tone="blue">
        <Diagram.Node id="narr" label="朗读调度" kind="service" description="读完 + 换气才放行" />
        <Diagram.Node id="player" label="播放器" kind="client" description="按步骤推进" />
      </Diagram.Group>
      <Diagram.Edge from="key" to="gen" label="Key" />
      <Diagram.Edge from="gen" to="prov" label="文字 + 音色" />
      <Diagram.Edge from="prov" to="files" label="音频（写进缓存）" />
      <Diagram.Edge from="files" to="r2" label="joplo share（不含 Key）" />
      <Diagram.Edge from="player" to="narr" label="这一步的旁白" />
      <Diagram.Edge from="narr" to="files" label="看板：有音频时" />
      <Diagram.Edge from="narr" to="r2" label="分享页：有音频时" />
      <Diagram.Edge from="narr" to="web" label="没有音频时" />
    </Diagram>
  </Box>
);

export const layers = () => ({
  board: layer('林舟的看板', <Board />, { role: 'lin', icon: 'window' }),
  pace: layer('这一步的节奏', <Pace />, { icon: 'flow' }),
  author: layer('作者电脑', <Author />, { role: 'lin', icon: 'terminal' }),
  arch: layer('声音从哪里来', <Arch />, { icon: 'server' }),
  site: layer('发布站', <Site />, { role: 'zhou', icon: 'browser' }),
});

/** 初始状态：声音没开，停在第 0 步。 */
export const initialUi = () => ({
  dlg: false, email: '', sent: false,
  caption: '团队邀请：把同事拉进空间', speaker: '封面', stepText: '第 0 / 3 步',
  voiceOpen: false, engine: 'browser', voice: 'off', voiceName: BROWSER_VOICE, voicePct: 0, voiceIcon: '🔇',
  playLabel: '▶ 播放',
  generating: false, genPct: 0, genStatus: '还没有生成（这个场景 3 段）', genButton: '生成这个场景的声音',
  textPct: 0, paceState: 'reading', dwellText: '—',
  tShare: false, tShared: false, tCheck: false,
  profilesOpen: false, editing: false, testState: 'none', jsonPath: false,
  siteHint: false,
});
