/**
 * 作者内容多语言（D84）的画面：
 * - board：林舟的本地看板，被演示的是“团队邀请”原型；顶栏右侧多了「内容语言」菜单，字幕下方是朗读状态；
 * - author：作者电脑（joplo.config.ts、locales/ja.json、源文件改动、终端）；
 * - site：观众打开的分享页（地址栏、浏览器语言、语言菜单、退回提示）；
 * - arch：观众的语言怎么定、内容和声音从哪里来。
 * 被演示原型的文字、播放器的界面文字都放在状态里，由 content() / chrome() 按语言整体换掉。
 */
import { $, and, eq, layer, neq, not, set, type Bind, type EffectDef } from '@joplo-app/kit';
import {
  ActionIcon, Alert, Anchor, Avatar, Badge, Box, Breadcrumbs, Button, Code, Diagram, Grid, Group, Menu, Paper, Progress, Stack, Terminal, Text, TextInput, Title,
} from '@joplo-app/kit/ui';

const ui = $.ui as unknown as Record<string, Bind>;

/* ---------------- 被演示原型的文字（作者内容） ---------------- */

type Content = { project: string; feature: string; scenario: string; title: string; invite: string; dlg: string; email: string; role: string; sent: string; caps: [string, string, string] };

/** 作者内容：zh 是源文件里的原文，其余来自 locales/<语言>.json。pt 不在项目里。 */
const CONTENT: Record<'zh' | 'en' | 'ja', Content> = {
  zh: { project: '团队邀请', feature: '邀请成员', scenario: '正常发出邀请', title: '成员', invite: '邀请成员', dlg: '邀请成员', email: '邮箱', role: '权限：编辑者', sent: '✓ 已向 ajie@example.com 发送邀请', caps: ['管理员打开「邀请成员」', '输入阿杰的邮箱', '邀请发出，阿杰会收到邮件'] },
  en: { project: 'Team invites', feature: 'Invite members', scenario: 'Send an invite', title: 'Members', invite: 'Invite member', dlg: 'Invite member', email: 'Email', role: 'Role: Editor', sent: '✓ Invite sent to ajie@example.com', caps: ['The admin opens Invite member', "She enters Ajie's email", 'Sent. Ajie gets an email'] },
  ja: { project: 'チーム招待', feature: 'メンバー招待', scenario: '招待を送る', title: 'メンバー', invite: 'メンバーを招待', dlg: 'メンバーを招待', email: 'メールアドレス', role: '権限：編集者', sent: '✓ ajie@example.com に招待を送信しました', caps: ['管理者が「メンバーを招待」を開く', 'アジエのメールアドレスを入力', '送信完了、アジエにメールが届く'] },
};

/** 把被演示原型的文字整体换成某种语言（字幕跟着当前步骤走，见 step）。 */
export const content = (lang: keyof typeof CONTENT): EffectDef[] => {
  const c = CONTENT[lang];
  return [set(ui.cLang, lang), set(ui.cProject, c.project), set(ui.cFeature, c.feature), set(ui.cScenario, c.scenario), set(ui.cTitle, c.title), set(ui.cInvite, c.invite), set(ui.cDlg, c.dlg), set(ui.cEmail, c.email), set(ui.cRole, c.role), set(ui.cSent, c.sent)];
};

/* ---------------- 播放器的界面文字（D57 的界面词典，跟随观众） ---------------- */

type Chrome = { voiceOff: string; voiceReady: string; play: string; pause: string; replay: string; prev: string; next: string; step: (n: number) => string; made: string; menuHas: string };

const CHROME: Record<'zh' | 'en' | 'ja' | 'pt', Chrome> = {
  zh: { voiceOff: '没开声音，只看字幕', voiceReady: '有旁白，播放时朗读', play: '▶ 播放', pause: '⏸ 暂停', replay: '↻ 重播', prev: '上一步', next: '下一步', step: (n) => `第 ${n} / 3 步`, made: '用 Joplo 制作', menuHas: '✓ = 有作者内容' },
  en: { voiceOff: 'Sound off · captions only', voiceReady: 'Narrated · plays with sound', play: '▶ Play', pause: '⏸ Pause', replay: '↻ Replay', prev: 'Back', next: 'Next', step: (n) => `Step ${n} of 3`, made: 'Made with Joplo', menuHas: '✓ = has author content' },
  ja: { voiceOff: '音声オフ · 字幕のみ', voiceReady: 'ナレーション付き · 再生で読み上げ', play: '▶ 再生', pause: '⏸ 一時停止', replay: '↻ もう一度', prev: '前へ', next: '次へ', step: (n) => `ステップ ${n} / 3`, made: 'Joplo で作成', menuHas: '✓ = 作者のコンテンツあり' },
  pt: { voiceOff: 'Som desligado · só legendas', voiceReady: 'Com narração · toca com som', play: '▶ Reproduzir', pause: '⏸ Pausar', replay: '↻ Repetir', prev: 'Anterior', next: 'Próximo', step: (n) => `Etapa ${n} de 3`, made: 'Feito com Joplo', menuHas: '✓ = com conteúdo do autor' },
};

/** 换播放器的界面语言。 */
export const chrome = (lang: keyof typeof CHROME): EffectDef[] => {
  const c = CHROME[lang];
  return [set(ui.uLang, lang), set(ui.voiceOffText, c.voiceOff), set(ui.voiceReadyText, c.voiceReady), set(ui.uPlay, c.play), set(ui.uPrev, c.prev), set(ui.uNext, c.next), set(ui.uMade, c.made), set(ui.uMenuHas, c.menuHas), set(ui.stepText, c.step(0)), set(ui.playLabel, c.play)];
};

/** 被演示原型的第 n 步（1–3）：改画面、字幕、步数，播放键变成暂停。 */
export const step = (n: 1 | 2 | 3, lang: keyof typeof CONTENT, uiLang: keyof typeof CHROME = lang): EffectDef[] => [
  set(ui.dlg, true),
  ...(n >= 2 ? [set(ui.email, 'ajie@example.com')] : []),
  ...(n >= 3 ? [set(ui.sent, true)] : []),
  set(ui.caption, CONTENT[lang].caps[n - 1]),
  set(ui.stepText, CHROME[uiLang].step(n)),
  set(ui.playLabel, n === 3 ? CHROME[uiLang].replay : CHROME[uiLang].pause),
];

/** 读这一步：朗读状态 + 进度 + 用的哪个声音。 */
export const speak = (pct: number, name?: string): EffectDef[] => [set(ui.voice, 'speaking'), set(ui.voicePct, pct), ...(name ? [set(ui.voiceName, name)] : [])];

/* ---------------- 被演示的原型 ---------------- */

const members = [
  { name: '林舟', role: 'Admin' },
  { name: '陈晨', role: 'Editor' },
  { name: 'Ajie', role: 'Viewer' },
];

const Prototype = (p: { id: string; stale?: boolean }) => (
  <Stack gap="sm" h="100%">
    <Group justify="space-between">
      <Title order={3}>{$.ui.cTitle}</Title>
      <Group gap="xs">
        {p.stale ? <Badge id={`${p.id}_stalemark`} color="orange" variant="dot" when={$.ui.staleShown}>过期 · 显示原文</Badge> : null}
        <Button id={`${p.id}_invite`} unmodeled note="被演示原型里的按钮：这里只演示语言，不演示邀请本身">{$.ui.cInvite}</Button>
      </Group>
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
            <Text fw={600}>{$.ui.cDlg}</Text>
            <TextInput id={`${p.id}_email`} label={$.ui.cEmail} value={$.ui.email} unmodeled note="由被演示的场景填入" />
            <Text size="sm">{$.ui.cRole}</Text>
            <Text size="sm" c="green" when={$.ui.sent}>{$.ui.cSent}</Text>
          </Stack>
        </Paper>
      </Grid.Col>
    </Grid>
  </Stack>
);

/* ---------------- 字幕区：字幕 + 朗读状态 ---------------- */

const VoiceState = (p: { id: string }) => (
  <Group id={`${p.id}_vstate`} gap="xs" mih={26}>
    <Badge when={eq($.ui.voice, 'off')} variant="default">🔇 {$.ui.voiceOffText}</Badge>
    <Badge id={`${p.id}_vready`} when={eq($.ui.voice, 'ready')} color="blue" variant="light">🔊 {$.ui.voiceReadyText}</Badge>
    <Badge id={`${p.id}_vspeaking`} when={eq($.ui.voice, 'speaking')} color="blue" variant="dot">{$.ui.voiceName}</Badge>
    <Badge id={`${p.id}_vbrowser`} when={eq($.ui.voice, 'browser')} color="yellow" variant="dot">{$.ui.voiceName}</Badge>
    <Progress w={160} value={$.ui.voicePct} when={and(neq($.ui.voice, 'off'), neq($.ui.voice, 'ready'))} />
  </Group>
);

const Subtitle = (p: { id: string }) => (
  <Paper id={`${p.id}_sub`} withBorder radius="md" p="md">
    <Stack gap={6} align="center">
      <Text size="xl" fw={600}>{$.ui.caption}</Text>
      <VoiceState id={p.id} />
    </Stack>
  </Paper>
);

/* ---------------- 看板：顶栏的「内容语言」菜单 ---------------- */

const BoardLang = () => (
  <Menu opened={$.ui.langOpen} position="bottom-end">
    <Menu.Target>
      <Button id="b_lang" variant="default" leftSection="文A">{$.ui.bLangLabel}</Button>
    </Menu.Target>
    <Menu.Dropdown>
      <Menu.Label>内容语言 · 只换原型、字幕和旁白</Menu.Label>
      <Menu.Item id="b_m_zh" rightSection="原文" unmodeled note="切回默认语言：显示源文件里的原文">中文（默认）</Menu.Item>
      <Menu.Item id="b_m_en" rightSection={$.ui.enStatus} unmodeled note="切到英文预览，和日本語一样">English</Menu.Item>
      <Menu.Item id="b_m_ja" rightSection={$.ui.jaStatus} color={$.ui.jaColor}>日本語</Menu.Item>
      <Menu.Divider />
      <Menu.Label>加语言：让 Agent 运行 npx joplo i18n add &lt;语言&gt;</Menu.Label>
    </Menu.Dropdown>
  </Menu>
);

const Board = () => (
  <Stack id="b_root" h="100%" gap="sm" p="md">
    <Group justify="space-between">
      <Breadcrumbs>
        <Anchor id="b_crumb" href="/i18n" unmodeled>{$.ui.cProject}</Anchor>
        <Text size="sm">{$.ui.cFeature}</Text>
        <Text size="sm" fw={600}>{$.ui.cScenario}</Text>
      </Breadcrumbs>
      <Group gap="xs">
        <BoardLang />
        <Badge variant="light">界面：中文</Badge>
      </Group>
    </Group>
    <Paper id="b_stage" withBorder radius="lg" p="lg" style={{ flex: 1, minHeight: 0 }}>
      <Prototype id="b_pc" stale />
    </Paper>
    <Subtitle id="b" />
    <Group justify="space-between">
      <Group gap="xs">
        <Button id="b_prev" variant="default" unmodeled note="这里只演示语言">上一步</Button>
        <Button id="b_play">{$.ui.playLabel}</Button>
        <Button id="b_next" variant="default" unmodeled note="这里只演示语言">下一步</Button>
      </Group>
      <Text size="xs" c="dimmed">{$.ui.stepText}</Text>
    </Group>
  </Stack>
);

/* ---------------- 观众的分享页 ---------------- */

const SiteLang = () => (
  <Menu opened={$.ui.sLangOpen} position="bottom-end">
    <Menu.Target>
      <ActionIcon id="s_lang" aria-label="Language" variant="default">文A</ActionIcon>
    </Menu.Target>
    <Menu.Dropdown>
      <Menu.Label id="s_m_has">{$.ui.uMenuHas}</Menu.Label>
      <Menu.Item id="s_m_en" rightSection="✓">English</Menu.Item>
      <Menu.Item id="s_m_zh" rightSection="✓" unmodeled note="切到简体中文：界面和内容都是中文">简体中文</Menu.Item>
      <Menu.Item id="s_m_tw" unmodeled note="只有界面文字，内容退回默认语言">繁體中文</Menu.Item>
      <Menu.Item id="s_m_ja" rightSection="✓" unmodeled note="切到日语：界面和内容都是日语">日本語</Menu.Item>
      <Menu.Item id="s_m_ko" unmodeled note="只有界面文字，内容退回默认语言">한국어</Menu.Item>
      <Menu.Item id="s_m_es" unmodeled note="只有界面文字，内容退回默认语言">Español</Menu.Item>
      <Menu.Item id="s_m_fr" unmodeled note="只有界面文字，内容退回默认语言">Français</Menu.Item>
      <Menu.Item id="s_m_de" unmodeled note="只有界面文字，内容退回默认语言">Deutsch</Menu.Item>
      <Menu.Item id="s_m_pt" unmodeled note="当前：界面是葡萄牙语，内容退回默认语言" rightSection="•">Português (Brasil)</Menu.Item>
      <Menu.Item id="s_m_ru" unmodeled note="只有界面文字，内容退回默认语言">Русский</Menu.Item>
    </Menu.Dropdown>
  </Menu>
);

const Site = () => (
  <Stack id="s_root" h="100%" gap="sm" p="md">
    <Group id="s_url" justify="space-between" px="sm" py={6} style={{ border: '1px solid var(--jp-line)', borderRadius: 999 }}>
      <Text size="sm" ff="monospace">{$.ui.siteUrl}</Text>
      <Badge variant="light" color="gray">{$.ui.browserLang}</Badge>
    </Group>
    <Group justify="space-between">
      <Text fw={600}>{$.ui.cProject} · {$.ui.cInvite}</Text>
      <Group gap="xs">
        <Text size="xs" c="dimmed">{$.ui.uMade}</Text>
        <SiteLang />
      </Group>
    </Group>
    <Alert id="s_fallback" color="blue" when={$.ui.fallbackShown}>{$.ui.fallbackText}</Alert>
    <Paper id="s_stage" withBorder radius="lg" p="lg" style={{ flex: 1, minHeight: 0 }}>
      <Prototype id="s_pc" />
    </Paper>
    <Subtitle id="s" />
    <Group justify="space-between">
      <Group gap="xs">
        <Button id="s_prev" variant="default" unmodeled note="这里只演示语言">{$.ui.uPrev}</Button>
        <Button id="s_play">{$.ui.playLabel}</Button>
        <Button id="s_next" variant="default" unmodeled note="这里只演示语言">{$.ui.uNext}</Button>
      </Group>
      <Group gap="xs">
        <Text size="xs" c="dimmed">{$.ui.stepText}</Text>
        <ActionIcon id="s_voice" aria-label="Sound" variant="default">{$.ui.voiceIcon}</ActionIcon>
      </Group>
    </Group>
  </Stack>
);

/* ---------------- 作者电脑：config、locales、源文件、终端 ---------------- */

const CONFIG = `// joplo.config.ts
export default config({
  name: '团队邀请',
  locales: ['zh-CN', 'en', 'ja'], // 第一个是默认语言（原文）
  voice: {
    narrator: 'nova',              // 默认语言的旁白
    // 其他语言不写：自动选同语言的母语音色
    // locales: { ja: { narrator: '…' } } 想换再写
  },
});`;

const JSON_TODO = `// locales/ja.json · 原文 → 译文（32 条待翻译）
{
  "邀请成员": "",
  "邮箱": "",
  "管理员打开「邀请成员」": "",
  "输入阿杰的邮箱": "",
  …
}`;

const JSON_DONE = `// locales/ja.json · 原文 → 译文（32 / 32）
{
  "邀请成员": "メンバーを招待",
  "邮箱": "メールアドレス",
  "管理员打开「邀请成员」": "管理者が「メンバーを招待」を開く",
  "输入阿杰的邮箱": "アジエのメールアドレスを入力",
  …
}`;

const JSON_UPDATED = `// locales/ja.json · 按 check 给的旧条目更新
{
  "邀请同事": "同僚を招待",          // 原来是「邀请成员」
  "管理员打开「邀请同事」": "管理者が「同僚を招待」を開く",
  "邮箱": "メールアドレス",
  …
}`;

const SRC_OLD = `// features/invite/options/a-modal.tsx
<Button id="btn_invite">邀请成员</Button>`;

const SRC_NEW = `// features/invite/options/a-modal.tsx
<Button id="btn_invite">邀请同事</Button>   // 只改了中文`;

const Author = () => (
  <Grid h="100%" p="md" gutter="md">
    <Grid.Col span={6}>
      <Stack h="100%" gap="sm">
        <Code id="a_config" block>{CONFIG}</Code>
        <Box id="a_json">
          <Code block when={eq($.ui.jsonState, 'none')}>{'// locales/ 还没有日语'}</Code>
          <Code block when={eq($.ui.jsonState, 'todo')}>{JSON_TODO}</Code>
          <Code block when={eq($.ui.jsonState, 'done')}>{JSON_DONE}</Code>
          <Code block when={eq($.ui.jsonState, 'updated')}>{JSON_UPDATED}</Code>
        </Box>
        <Box id="a_src">
          <Code block when={not($.ui.srcEdited)}>{SRC_OLD}</Code>
          <Code block when={$.ui.srcEdited}>{SRC_NEW}</Code>
        </Box>
      </Stack>
    </Grid.Col>
    <Grid.Col span={6}>
      <Terminal id="t_term" title={$.ui.termTitle} h="100%">
        <Terminal.Command when={$.ui.tAdd}>npx joplo i18n add ja</Terminal.Command>
        <Terminal.Output id="t_add" when={$.ui.tAdd} tone="ok">{'config 的 locales 加上 ja\n写入 locales/ja.json：32 条待翻译（原文 → ""）\n请把每条译成日语；改完运行 npx joplo check'}</Terminal.Output>
        <Terminal.Output id="t_fill" when={$.ui.tFill}>Agent 填好 32 条译文（相同的句子只翻一次）</Terminal.Output>
        <Terminal.Command when={$.ui.tCheck1}>npx joplo check</Terminal.Command>
        <Terminal.Output when={$.ui.tCheck1} tone="ok">{'0 errors · 内容语言：zh-CN（原文）、en 32/32、ja 32/32'}</Terminal.Output>

        <Terminal.Command when={$.ui.tShare}>npx joplo share --private --no-review</Terminal.Command>
        <Terminal.Output when={$.ui.tShare}>{'构建：1 个功能 · 3 种语言 · 9 段声音（各语言 3 段）'}</Terminal.Output>
        <Terminal.Output id="t_links" when={$.ui.tShare} tone="ok">{'https://joplo.app/s/k3x9q（7 天有效）\n观众自动看到自己的语言；想指定语言：…/s/k3x9q?lang=ja'}</Terminal.Output>

        <Terminal.Command when={$.ui.tStaleCheck}>npx joplo check</Terminal.Command>
        <Terminal.Output id="t_stale" when={$.ui.tStaleCheck} tone="warn">{'locales/ja.json  warning  I18N_STALE  缺「邀请同事」，最接近的旧条目：\n"邀请成员": "メンバーを招待"（原文改过）\nlocales/en.json  warning  I18N_STALE  同上，共 2 条'}</Terminal.Output>
        <Terminal.Command when={$.ui.tStaleShare}>npx joplo share --private --no-review</Terminal.Command>
        <Terminal.Output id="t_staleshare" when={$.ui.tStaleShare} tone="warn">{'提醒：en、ja 各 1 条过期，观众会看到这一句的中文原文；照常发布'}</Terminal.Output>
        <Terminal.Command when={$.ui.tFixed}>npx joplo check</Terminal.Command>
        <Terminal.Output when={$.ui.tFixed} tone="ok">{'0 errors · en 32/32、ja 32/32'}</Terminal.Output>

        <Terminal.Command when={$.ui.tCache}>npx joplo share --private --no-review</Terminal.Command>
        <Terminal.Output when={$.ui.tCache}>{'本机：没有语音供应商，也没有生成过的音频'}</Terminal.Output>
        <Terminal.Output id="t_cache" when={$.ui.tCache} tone="ok">{'声音：9 段都在这个分享里（缓存键相同），沿用，不生成也不上传'}</Terminal.Output>
        <Terminal.Output id="t_cachedone" when={$.ui.tCacheDone} tone="ok">{'上传 2 个改过的文件\nhttps://joplo.app/s/k3x9q 已更新，链接不变'}</Terminal.Output>
        <Terminal.Input id="t_in" placeholder="输入命令" />
      </Terminal>
    </Grid.Col>
  </Grid>
);

/* ---------------- 背后：语言怎么定，内容和声音从哪里来 ---------------- */

const Arch = () => (
  <Box p="md" h="100%">
    <Diagram id="arch" h="100%" direction="right">
      <Diagram.Group id="g_local" label="作者电脑" icon="lock" tone="orange">
        <Diagram.Node id="local" label="本机音频" kind="storage" description="作者自己管理" />
        <Diagram.Node id="cli" label="joplo share --private --no-review" kind="service" description="打包内容和声音" />
      </Diagram.Group>
      <Diagram.Group id="g_share" label="分享里的作品（云上只有这些）" icon="cloud" tone="green">
        <Diagram.Node id="loc" label="原型 + 译文" kind="storage" description="原文 → 译文" />
        <Diagram.Node id="share_audio" label="各语言音频" kind="storage" description="重新发布时沿用" />
      </Diagram.Group>
      <Diagram.Group id="g_viewer" label="观众" icon="user" tone="blue">
        <Diagram.Node id="url" label="链接 ?lang=" kind="client" description="作者指定，优先" />
        <Diagram.Node id="browser" label="浏览器语言" kind="client" description="没指定时用" />
      </Diagram.Group>
      <Diagram.Group id="g_play" label="分享页" icon="client" tone="teal">
        <Diagram.Node id="pick" label="选语言" kind="service" description="?lang > 手动 > 浏览器 > 退回" />
        <Diagram.Node id="web" label="浏览器朗读" kind="tool" description="这种语言没有音频时" />
      </Diagram.Group>
      <Diagram.Edge from="local" to="cli" label="已生成的音频" />
      <Diagram.Edge from="cli" to="loc" label="原型和译文" />
      <Diagram.Edge from="cli" to="share_audio" label="上传新的；已有的沿用" />
      <Diagram.Edge from="loc" to="pick" label="匹配语言的内容" />
      <Diagram.Edge from="share_audio" to="pick" label="有音频时" />
      <Diagram.Edge from="url" to="pick" label="lang=ja" />
      <Diagram.Edge from="browser" to="pick" label="pt-BR" />
      <Diagram.Edge from="pick" to="web" label="没有音频时" />
    </Diagram>
  </Box>
);

export const layers = () => ({
  board: layer('林舟的看板', <Board />, { role: 'lin', icon: 'window' }),
  author: layer('作者电脑', <Author />, { role: 'lin', icon: 'terminal' }),
  site: layer('观众的分享页', <Site />, { icon: 'browser' }),
  arch: layer('语言和声音从哪里来', <Arch />, { icon: 'server' }),
});

/** 初始状态：项目只有中文，看板停在第 0 步。 */
export const initialUi = () => ({
  dlg: false, email: '', sent: false,
  cLang: 'zh', cProject: CONTENT.zh.project, cFeature: CONTENT.zh.feature, cScenario: CONTENT.zh.scenario, cTitle: CONTENT.zh.title, cInvite: CONTENT.zh.invite, cDlg: CONTENT.zh.dlg, cEmail: CONTENT.zh.email, cRole: CONTENT.zh.role, cSent: CONTENT.zh.sent,
  uLang: 'zh', uPlay: CHROME.zh.play, uPrev: CHROME.zh.prev, uNext: CHROME.zh.next, uMade: CHROME.zh.made, uMenuHas: CHROME.zh.menuHas,
  caption: '团队邀请：把同事拉进空间', stepText: CHROME.zh.step(0), playLabel: CHROME.zh.play,
  voice: 'off', voiceName: '', voicePct: 0, voiceIcon: '🔊', voiceOffText: CHROME.zh.voiceOff, voiceReadyText: CHROME.zh.voiceReady,
  langOpen: false, bLangLabel: '中文', enStatus: '32/32', jaStatus: '未添加', jaColor: 'gray',
  staleShown: false,
  sLangOpen: false, siteUrl: 'joplo.app/s/k3x9q', browserLang: '浏览器语言：日本語', fallbackShown: false, fallbackText: '',
  jsonState: 'none', srcEdited: false, termTitle: '终端 · examples/invite',
  tAdd: false, tFill: false, tCheck1: false, tShare: false, tStaleCheck: false, tStaleShare: false, tFixed: false, tCache: false, tCacheDone: false,
});
