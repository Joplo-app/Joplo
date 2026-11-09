/**
 * “影片形态”的原型（D40：新功能先用 Joplo 画出来，确认后再实现）。四个独立画面：
 * 创作文件（作者写什么）、看板（审片时看到什么）、终端（check / outline / build 说什么）、发布站（观众看到什么）。
 * 两个方案只在看板里“章节放在哪”不同：variant = 'list'（左栏清单）或 'timeline'（画面下方的时间轴）。
 * 这里画的是提议中的界面与输出，不是已经实现的功能；示例影片借用 examples/midterms-2026 的章节。
 */
import { $, done, eq, explain, flow, highlight, layer, neq, not, set, shot, uses, type Flow } from '@joplo-app/kit';
import { Alert, Badge, Button, Code, Divider, Grid, Group, List, Menu, NavLink, Paper, Stack, Terminal, Text, Title } from '@joplo-app/plugin-ui';

export type Variant = 'list' | 'timeline';

/** 示例影片的五章：编号由看板自动加，作者不在标题里手写。 */
const CHAPTERS = [
  { n: 1, key: 'hook', title: '一夜之间，特朗普丢掉了整个国会', dur: '0:28', sec: 28, steps: 6 },
  { n: 2, key: 'basics', title: '中期选举，到底在选什么？', dur: '0:52', sec: 52, steps: 9 },
  { n: 3, key: 'results', title: '蓝色浪潮有多大？', dur: '1:05', sec: 65, steps: 11 },
  { n: 4, key: 'stakes', title: '他接下来会被怎样卡住？', dur: '1:35', sec: 95, steps: 12 },
  { n: 5, key: 'money', title: 'AI 和股市：你的钱会怎样？', dur: '0:40', sec: 40, steps: 8 },
] as const;
const TOTAL = '约 4 分 40 秒';
const no = (n: number) => String(n).padStart(2, '0');

export const filmInitial = () => ({
  form: 'before', kind: 'film', ch: 1, menu: false, recut: false, empty: false,
  term: 'check_before', site: 'home', playLabel: '▶ 播放',
  frame: '开票夜：国会由红变蓝', caption: '十一月三号晚上，结果比所有人预想的都快。', progress: '0:00 / 4:40',
});

// ---------- 创作文件 ----------
const BEFORE = `// routes/page.tsx —— 画面都在层级里，这一页只是占位
export default page({ title: '2026 美国中期选举', layout: false }, <Slot name="main" />)

// features/midterms/feature.ts —— 每一章写一遍（当作“情况”）
export default feature({
  name: '特朗普丢掉国会之后',
  goal: '五分钟看懂 2026 美国中期选举',
  pick: 'b-film',
  cases: {
    hook:   { title: '00 一夜之间…', dimension: 'main', priority: 'high', expected: '…' },
    basics: { title: '01 到底在选什么？', dimension: 'main', priority: 'high', expected: '…' },
    // …
  },
})

// features/midterms/options/b-film.tsx —— 每一章再写一遍（当作“场景”）
export default option({
  name: '一镜到底版', idea: '…',
  layers: { world: layer('世界', <World />) },
  scenarios: {
    hook:   flow('一夜之间…', { cases: ['hook'], start: '/' }).system(…),
    basics: flow('到底在选什么？', { cases: ['basics'], from: 'hook' }).system(…),
    // …
  },
})`;

const AFTER = `// films/midterms.tsx
export default film({
  title: '特朗普丢掉国会之后',
  summary: '五分钟看懂 2026 美国中期选举',
  audience: '关心时事、不熟悉美国选举制度的人',
  stage: <World />,                 // 一个画面；多个视角时写 layers
  state: { ui: { … } },
  chapters: {
    hook: chapter('一夜之间，特朗普丢掉了整个国会', { takeaway: '知道发生了什么，带着三个问题往下看' })
      .system('开票夜', camera('map'), narrate('十一月三号晚上……')),
    basics: chapter('中期选举，到底在选什么？')
      .system(…),                   // 接着上一章结尾的画面
    results: chapter('蓝色浪潮有多大？')
      .system(…),
    // …
  },
})`;

const RECUT = `// films/midterms-v1.tsx —— 旧版留着对比，不发布
export default film({
  title: '特朗普丢掉国会之后（讲解版）',
  draft: true,
  stage: <Boards />,
  chapters: { … },
})`;

const Row = (p: { name: string; note?: string; tone?: 'red' | 'green' }) => (
  <Group justify="space-between" gap="xs" wrap="nowrap">
    <Code>{p.name}</Code>
    {p.note ? <Text size="xs" c={p.tone ?? 'dimmed'}>{p.note}</Text> : null}
  </Group>
);

const FilmFiles = () => (
  <Stack id="ff_files" h="100%" p="lg" gap="md">
    <Group justify="space-between">
      <Stack gap={2}><Title order={2}>写一支影片，要写什么</Title><Text c="dimmed">提议中的创作方式 · 示例取自 examples/midterms-2026</Text></Stack>
      <Group gap="xs">
        <Button id="ff_before" variant="default" size="xs" unmodeled>现在的写法</Button>
        <Button id="ff_after" size="xs">film() 的写法</Button>
      </Group>
    </Group>
    <Grid gutter="lg" style={{ flex: 1, minHeight: 0 }}>
      <Grid.Col span={4}>
        <Stack gap="sm">
          <Paper id="ff_tree" withBorder p="md">
            <Stack gap="xs" when={eq($.ui.form, 'before')}>
              <Text fw={700}>现在：借功能演示的写法</Text>
              <Row name="joplo.config.ts" />
              <Row name="routes/page.tsx" note="占位" tone="red" />
              <Row name="features/midterms/feature.ts" note="每章写一遍" tone="red" />
              <Row name="features/midterms/options/b-film.tsx" note="每章再写一遍" tone="red" />
              <Row name="shared/film/world.tsx" />
            </Stack>
            <Stack gap="xs" when={eq($.ui.form, 'after')}>
              <Text fw={700}>提议：影片是一种形态</Text>
              <Row name="joplo.config.ts" />
              <Row name="films/midterms.tsx" note="影片、章节、步骤" tone="green" />
              <Row name="films/midterms-v1.tsx" note="旧版 · draft" />
              <Row name="shared/film/world.tsx" />
            </Stack>
          </Paper>
          <Paper id="ff_removed" withBorder p="md" when={eq($.ui.form, 'after')}>
            <Stack gap="xs">
              <Text fw={700}>不用再写</Text>
              <List size="sm">
                <List.Item>feature / option 两层外壳，pick、idea</List.Item>
                <List.Item>cases：每一章的 dimension、priority</List.Item>
                <List.Item>占位的 routes/page.tsx</List.Item>
                <List.Item>每一章手写的 from: '上一章'</List.Item>
                <List.Item>标题里手写的 00、01 编号</List.Item>
              </List>
              <Text size="xs" c="dimmed">步骤、状态、镜头、旁白、配乐、发布的写法都不变。</Text>
            </Stack>
          </Paper>
        </Stack>
      </Grid.Col>
      <Grid.Col span={8}>
        <Stack gap="sm">
          <Paper id="ff_code" withBorder p="md">
            <Code block when={eq($.ui.form, 'before')}>{BEFORE}</Code>
            <Code block when={eq($.ui.form, 'after')}>{AFTER}</Code>
          </Paper>
          <Paper id="ff_recut" withBorder p="md" when={$.ui.recut}>
            <Stack gap="xs">
              <Group gap="xs"><Badge variant="outline">草稿</Badge><Text fw={600}>重做一版时，旧版留在项目里</Text></Group>
              <Code block>{RECUT}</Code>
            </Stack>
          </Paper>
        </Stack>
      </Grid.Col>
    </Grid>
  </Stack>
);

// ---------- 看板 ----------
/** 功能演示项目的左栏：保持现在的样子（方案、情况、缺口）。 */
const FeatureRail = () => (
  <Stack id="ff_rail_feature" gap={4} when={eq($.ui.kind, 'feature')}>
    <Text fw={700}>订阅到期提醒</Text>
    <Text size="xs" c="dimmed">让用户在到期前知道并能一键续费 · 面向：订阅用户</Text>
    <Divider my="xs" label="方案 · 2" labelPosition="left" />
    <NavLink id="ff_opt_a" label="A · 站内横幅" description="✓ 已选定 · 缺失 1" active unmodeled />
    <NavLink id="ff_opt_b" label="B · 邮件 + 横幅" description="缺失 2 · 待决定 1" unmodeled />
    <Divider my="xs" label="情况 · 4" labelPosition="left" />
    <NavLink id="ff_case_1" label="到期前 7 天提醒" rightSection="✓" unmodeled />
    <NavLink id="ff_case_2" label="支付失败后重试" rightSection="✓" unmodeled />
    <NavLink id="ff_case_3" label="已退订的用户" rightSection="✗" unmodeled />
    <NavLink id="ff_case_4" label="多设备同时续费" rightSection="?" unmodeled />
  </Stack>
);

const FilmInfo = () => (
  <Stack gap={2}>
    <Group gap="xs"><Badge variant="light">影片</Badge><Text size="xs" c="dimmed">5 章 · {TOTAL}</Text></Group>
    <Text fw={700}>特朗普丢掉国会之后</Text>
    <Text size="xs" c="dimmed">五分钟看懂 2026 美国中期选举 · 给：关心时事、不熟悉美国选举制度的人</Text>
  </Stack>
);

const EmptyFilm = () => (
  <Alert id="ff_empty" color="blue" title="这支影片还没有章节" when={$.ui.empty}>
    <Stack gap="xs">
      <Text size="sm">在 films/midterms.tsx 的 chapters 里写第一章：</Text>
      <Code block>{"chapters: {\n  hook: chapter('开场').system('…'),\n}"}</Code>
    </Stack>
  </Alert>
);

/** 方案 A：左栏章节清单。 */
const ChapterList = () => (
  <Stack id="ff_rail" gap={4} when={eq($.ui.kind, 'film')}>
    <FilmInfo />
    <EmptyFilm />
    <Stack gap={4} when={not($.ui.empty)}>
      <Divider my="xs" label="章节" labelPosition="left" />
      {CHAPTERS.map((c) => (
        <NavLink key={c.key} id={`ff_ch${c.n}`} leftSection={no(c.n)} label={c.title} description={`${c.dur} · ${c.steps} 步`} active={eq($.ui.ch, c.n)} unmodeled={c.n !== 3} />
      ))}
      <Divider my="xs" label="审片" labelPosition="left" />
      <Text size="xs" c="dimmed">整支片子的胶片条（硬切与静止）：</Text>
      <Group gap="xs" wrap="nowrap"><Code>npx joplo render --film --chain</Code><Button id="ff_copy_film" size="xs" variant="default" unmodeled>复制</Button></Group>
    </Stack>
  </Stack>
);

/** 方案 B：画面下方按时长比例分段的章节时间轴；左栏只留影片信息。 */
const ChapterStrip = () => (
  <Paper id="ff_strip" withBorder p="sm" when={eq($.ui.kind, 'film')}>
    <Stack gap="xs">
      <Group justify="space-between"><Text size="sm" fw={600}>章节时间轴</Text><Text size="xs" c="dimmed">宽度按时长 · {TOTAL}</Text></Group>
      <EmptyFilm />
      <Group gap={4} wrap="nowrap" align="stretch" when={not($.ui.empty)}>
        {CHAPTERS.flatMap((c) => [
          <Button key={`${c.key}_off`} id={`ff_seg${c.n}`} variant="default" size="xs" style={{ flex: c.sec, minWidth: 0 }} when={neq($.ui.ch, c.n)} unmodeled={c.n !== 3}>{`${no(c.n)} · ${c.dur}`}</Button>,
          <Button key={`${c.key}_on`} id={`ff_seg${c.n}_on`} size="xs" style={{ flex: c.sec, minWidth: 0 }} when={eq($.ui.ch, c.n)} unmodeled>{`${no(c.n)} · ${c.dur}`}</Button>,
        ])}
      </Group>
      <Group justify="space-between" when={not($.ui.empty)}>
        <Text size="xs" c="dimmed">当前章的步骤在下面的步骤条里；点一段跳到那一章的开头</Text>
        <Group gap="xs" wrap="nowrap"><Code>npx joplo render --film --chain</Code><Button id="ff_copy_film" size="xs" variant="default" unmodeled>复制</Button></Group>
      </Group>
    </Stack>
  </Paper>
);

const FilmBoard = (p: { variant: Variant }) => (
  <Stack id="ff_board" h="100%" p="md" gap="sm">
    <Group justify="space-between">
      <Group gap="xs">
        <Text fw={700}>Joplo</Text>
        <Text size="sm" c="dimmed">2026 中期选举 ›</Text>
        <Menu opened={$.ui.menu} position="bottom-start">
          <Menu.Target>
            <Button id="ff_crumb" variant="default" size="xs" rightSection="▾">
              <Text span when={eq($.ui.kind, 'film')}>影片 · 特朗普丢掉国会之后</Text>
              <Text span when={eq($.ui.kind, 'feature')}>功能演示 · 订阅到期提醒</Text>
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Label>影片</Menu.Label>
            <Menu.Item id="ff_m_film" rightSection={`5 章 · 4:40`}>特朗普丢掉国会之后</Menu.Item>
            <Menu.Item id="ff_m_v1" rightSection="草稿 · 不发布" when={$.ui.recut} unmodeled>特朗普丢掉国会之后（讲解版）</Menu.Item>
            <Menu.Divider />
            <Menu.Label>功能演示</Menu.Label>
            <Menu.Item id="ff_m_feature" rightSection="2 个方案">订阅到期提醒</Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>
      <Group gap="xs">
        <Button id="ff_voice" variant="default" size="xs" unmodeled>声音</Button>
        <Button id="ff_export" variant="default" size="xs" unmodeled>导出视频</Button>
        <Button id="ff_publish" size="xs" unmodeled>发布</Button>
      </Group>
    </Group>
    <Grid gutter="md" style={{ flex: 1, minHeight: 0 }}>
      <Grid.Col span={p.variant === 'list' ? 4 : 3}>
        <Paper withBorder p="sm" h="100%">
          {p.variant === 'list' ? <ChapterList /> : <Stack gap="sm" when={eq($.ui.kind, 'film')}><FilmInfo /><Text size="xs" c="dimmed">章节在画面下方的时间轴上。</Text></Stack>}
          <FeatureRail />
        </Paper>
      </Grid.Col>
      <Grid.Col span={p.variant === 'list' ? 8 : 9}>
        <Stack gap="sm">
          <Paper id="ff_stage" withBorder radius="lg" p="xl" mih={p.variant === 'list' ? 330 : 250}>
            <Stack gap="sm" when={eq($.ui.kind, 'film')}>
              <Stack gap="sm" when={not($.ui.empty)}>
                <Badge variant="outline">画面</Badge>
                <Title order={3}>{$.ui.frame}</Title>
                <Text c="dimmed">{$.ui.caption}</Text>
              </Stack>
              <Text c="dimmed" when={$.ui.empty}>还没有画面。</Text>
            </Stack>
            <Stack gap="sm" when={eq($.ui.kind, 'feature')}>
              <Badge variant="outline">画面</Badge>
              <Title order={3}>你的订阅将在 7 天后到期</Title>
              <Text c="dimmed">功能演示的画面、左栏和检查都和现在一样。</Text>
            </Stack>
          </Paper>
          {p.variant === 'timeline' ? <ChapterStrip /> : null}
          <Group justify="space-between">
            <Group gap="xs">
              <Button id="ff_prev" variant="default" size="xs" unmodeled>上一步</Button>
              <Button id="ff_play" size="xs">{$.ui.playLabel}</Button>
              <Button id="ff_next" variant="default" size="xs" unmodeled>下一步</Button>
            </Group>
            <Text size="sm" c="dimmed" when={eq($.ui.kind, 'film')}>{$.ui.progress}</Text>
          </Group>
        </Stack>
      </Grid.Col>
    </Grid>
  </Stack>
);

// ---------- 终端 ----------
const OUT = {
  check_before: `features/midterms/feature.ts:7:16  info  HAPPY_PATH_ONLY  Feature "特朗普丢掉国会之后" only shows the happy path: every case is a main-flow case and every scenario succeeds. Ask the user about input, permission, async, and lifecycle cases
0 error, 0 warning, 1 info`,
  check_after: `films/midterms.tsx:85:12  info  CHAPTER_TOO_LONG  Chapter 4 "他接下来会被怎样卡住？" plays about 95 s at 1× (recommended: 45–90 s). Split it or trim the narration
0 error, 0 warning, 1 info`,
  outline: `特朗普丢掉国会之后 · film · 5 chapters · about 4 min 40 s
  1  hook     一夜之间，特朗普丢掉了整个国会    6 steps   0:28
  2  basics   中期选举，到底在选什么？          9 steps   0:52
  3  results  蓝色浪潮有多大？                 11 steps   1:05
  4  stakes   他接下来会被怎样卡住？            12 steps   1:35
  5  money    AI 和股市：你的钱会怎样？          8 steps   0:40`,
  error: `films/midterms.tsx:85:12  error  FROM_UNKNOWN  Chapter "stakes" continues "result", which is not a chapter of this film. Chapters: hook, basics, results, stakes, money
1 error, 0 warning, 0 info`,
  empty: `films/midterms.tsx:3:16  info  FILM_EMPTY  Film "特朗普丢掉国会之后" has no chapters yet. Add chapters: { hook: chapter('…').system('…') }
0 error, 0 warning, 1 info`,
  build: `Published 1 film: 特朗普丢掉国会之后 (5 chapters, about 4 min 40 s)
Skipped draft: midterms-v1`,
};

const FilmTerminal = () => (
  <Stack id="ff_cli" h="100%" p="lg" gap="md">
    <Stack gap={2}><Title order={2}>命令行说什么</Title><Text c="dimmed">提议中的输出：只说和影片有关的事</Text></Stack>
    <Terminal id="ff_term" title="终端 · midterms-2026" mah={420}>
      <Terminal.Command when={neq($.ui.term, 'outline')}>
        <Text span when={neq($.ui.term, 'build')}>npx joplo check</Text>
        <Text span when={eq($.ui.term, 'build')}>npx joplo build</Text>
      </Terminal.Command>
      <Terminal.Command when={eq($.ui.term, 'outline')}>npx joplo outline</Terminal.Command>
      <Terminal.Output tone="warn" when={eq($.ui.term, 'check_before')}>{OUT.check_before}</Terminal.Output>
      <Terminal.Output when={eq($.ui.term, 'check_after')}>{OUT.check_after}</Terminal.Output>
      <Terminal.Output when={eq($.ui.term, 'outline')}>{OUT.outline}</Terminal.Output>
      <Terminal.Output tone="error" when={eq($.ui.term, 'error')}>{OUT.error}</Terminal.Output>
      <Terminal.Output when={eq($.ui.term, 'empty')}>{OUT.empty}</Terminal.Output>
      <Terminal.Output tone="ok" when={eq($.ui.term, 'build')}>{OUT.build}</Terminal.Output>
    </Terminal>
    <Alert id="ff_term_note" color="yellow" title="现在的问题" when={eq($.ui.term, 'check_before')}>
      影片的每一章都是“主流程”、都“成功”，所以一定会收到这条提示；技能里只能写“忽略它”。
    </Alert>
    <Alert id="ff_term_fix" color="red" title="写错章节键" when={eq($.ui.term, 'error')}>
      第 4 章写了 from: 'result'（少了一个 s）。错误指到这一行，并列出这支影片里有哪些章节。
    </Alert>
  </Stack>
);

// ---------- 发布站 ----------
const FilmSite = () => (
  <Stack id="ff_site" h="100%" p="lg" gap="md">
    <Group justify="space-between">
      <Stack gap={2}><Title order={2}>观众看到的</Title><Text c="dimmed">发布站与作品集 · 电脑和手机用同一套词</Text></Stack>
      <Code>show.joplo.app/djj/midterms-2026</Code>
    </Group>
    <Paper id="ff_site_card" withBorder p="lg" when={eq($.ui.site, 'home')}>
      <Stack gap="sm">
        <Group gap="xs"><Badge variant="light">影片</Badge><Text size="sm" c="dimmed">5 章 · {TOTAL}</Text></Group>
        <Title order={3}>特朗普丢掉国会之后</Title>
        <Text>五分钟看懂 2026 美国中期选举</Text>
        <Group><Button id="ff_site_open">▶ 观看</Button></Group>
        <Text size="xs" c="dimmed">现在这张卡片写的是“功能 · 5 个场景”。</Text>
      </Stack>
    </Paper>
    <Grid gutter="md" when={eq($.ui.site, 'play')}>
      <Grid.Col span={4}>
        <Paper id="ff_site_nav" withBorder p="md">
          <Stack gap={4}>
            <Text fw={700}>特朗普丢掉国会之后</Text>
            <Divider my="xs" label="章节 · 5" labelPosition="left" />
            {CHAPTERS.map((c) => <Group key={c.key} justify="space-between" wrap="nowrap"><Text size="sm" truncate>{`${no(c.n)}  ${c.title}`}</Text><Text size="xs" c="dimmed">{c.dur}</Text></Group>)}
            <Text size="xs" c="dimmed">现在电脑上这一栏叫“场景”，手机上已经叫“章节”。</Text>
          </Stack>
        </Paper>
      </Grid.Col>
      <Grid.Col span={8}>
        <Paper withBorder radius="lg" p="xl" mih={300}>
          <Stack gap="sm"><Badge variant="outline">画面</Badge><Title order={3}>开票夜：国会由红变蓝</Title><Text c="dimmed">播完一章接着放下一章，和现在一样。</Text></Stack>
        </Paper>
      </Grid.Col>
    </Grid>
  </Stack>
);

export const filmLayers = (variant: Variant) => ({
  files: layer('创作文件', <FilmFiles />, { icon: 'doc' }),
  board: layer('看板', <FilmBoard variant={variant} />, { icon: 'window' }),
  cli: layer('终端', <FilmTerminal />, { icon: 'terminal' }),
  site: layer('发布站', <FilmSite />, { icon: 'browser' }),
});

/** 两个方案共用的场景；看板里“章节在哪”由 variant 决定。 */
export const filmScenarios = (variant: Variant): Record<string, Flow> => {
  const chapters = variant === 'list' ? 'ff_rail' : 'ff_strip';
  const third = variant === 'list' ? 'ff_ch3' : 'ff_seg3';
  return {
    write: flow('写一支影片：一个文件，只有影片、章节、步骤', { cases: ['write'], layer: 'files', description: '从借用功能演示的写法，到 film() 的写法', expected: '影片文件里不出现功能、方案、情况和占位页' })
      .system('现在：借功能演示的写法', '一支影片要写四个文件，每一章写两遍', highlight('ff_tree'))
      .click('ff_after', '换成 film()：一个文件', set($.ui.form, 'after'), shot('ff_code'), uses('form'))
      .system('章节接着上一章', '每一章默认从上一章结尾的画面开始', highlight('ff_code'), explain("要从干净的画面开始，才写 from: null；接别的章节写 from: '章节键'"), uses('continue_default'))
      .system('外壳都不用写了', '功能、方案、情况、占位页、手写编号都不用再写', shot('ff_removed'), uses('no_route', 'numbering'), done('影片文件里只有影片、章节、步骤')),

    board: flow('在看板里审片：章节和时长', { cases: ['board'], layer: 'board', description: '打开一个影片项目', expected: '看到每一章的时长和总时长；没有方案、情况和覆盖缺口' })
      .system('打开影片项目', variant === 'list' ? '左栏是章节清单：编号、步数、时长' : '画面下方是按时长比例的章节时间轴', shot(chapters), highlight(chapters), uses('form'))
      .click(third, '点第 3 章：跳到这一章的开头', shot('ff_board'), set($.ui.ch, 3), set($.ui.frame, '席位图：两院一起翻蓝'), set($.ui.caption, '众议院 218 席过半，民主党拿到了 231 席。'), set($.ui.progress, '1:20 / 4:40'))
      .click('ff_play', '播放：章节之间接着放', set($.ui.playLabel, '⏸ 暂停'), set($.ui.progress, '2:25 / 4:40'), explain('不出“下一章”卡片，画面和配乐不断开'))
      .system('进入第 4 章', '第 3 章播完，自动接第 4 章', set($.ui.ch, 4), set($.ui.frame, '白宫 vs 国会：否决、停摆、搁置'), set($.ui.caption, '接下来两年，每一项法案都要过对方的手。'), done('审片时看的是章节与时长')),

    check: flow('检查只说和影片有关的', { cases: ['check'], layer: 'cli', description: 'check 与 outline 的输出', expected: '不再提示“只有顺利路径”；章节过长这类提示保留' })
      .system('现在的 check', '影片一定会收到“只有顺利路径”', shot('ff_term', 'ff_term_note'), highlight('ff_term_note'))
      .system('改成影片之后', '换成和影片有关的提示：第 4 章太长', set($.ui.term, 'check_after'), highlight('ff_term'), uses('checks'))
      .system('outline 列章节', 'outline 按章节列出步数和时长', set($.ui.term, 'outline'), highlight('ff_term'), done('命令行只说影片的事')),

    bad_chapter: flow('章节的接续写错了', { cases: ['check'], outcome: 'failure', mock: '模拟写错章节键', layer: 'cli', state: { ui: { term: 'error' } }, description: '作者把 from 写成了不存在的章节', expected: '错误指到那一行，并列出可用的章节键' })
      .system('check 报错', 'check 报错：这一章接的章节不存在', shot('ff_term'), highlight('ff_term'))
      .system('怎么改', '提示里列出了这支影片的全部章节键', highlight('ff_term_fix'), done('知道错在哪一行、该写什么', 'failure')),

    mixed: flow('一个项目里既有影片也有功能演示', { cases: ['mixed'], layer: 'board', description: '看板按打开的是哪一种换左栏', expected: '影片看章节，功能演示看方案与情况，互不影响' })
      .click('ff_crumb', '顶栏的下拉分成“影片”和“功能演示”两组', set($.ui.menu, true), uses('mixed_project'))
      .click('ff_m_feature', '切到功能演示：左栏还是方案、情况和缺口', set($.ui.menu, false), set($.ui.kind, 'feature'), shot('ff_rail_feature'), highlight('ff_rail_feature'))
      .click('ff_crumb', '再打开下拉', shot('ff_board'), set($.ui.menu, true))
      .click('ff_m_film', '切回影片：换回章节', set($.ui.menu, false), set($.ui.kind, 'film'), shot(chapters), done('两种形态各用各的呈现')),

    recut: flow('重做一版，和旧版对比', { cases: ['recut'], layer: 'files', state: { ui: { form: 'after' } }, description: '旧版标成草稿留在项目里', expected: '两版都能在看板打开；发布只带没有标草稿的那一版' })
      .system('旧版标成草稿', '重做时新建另一支影片，旧的写 draft: true', set($.ui.recut, true), shot('ff_recut'), highlight('ff_recut'), uses('draft'))
      .click('ff_crumb', '看板里两版都能打开，草稿有标记', set($.ui.menu, true), shot('ff_board'))
      .system('发布跳过草稿', '发布和分享只带没有标草稿的那一版', set($.ui.menu, false), set($.ui.term, 'build'), shot('ff_term'), highlight('ff_term'), done('旧版留着对比，不会被发布出去')),

    publish: flow('观众看到的是一支有章节的影片', { cases: ['publish'], layer: 'site', description: '发布站与作品集', expected: '卡片写章节数和时长；电脑和手机都叫“章节”' })
      .system('影片卡片', '卡片写的是章节数和时长', shot('ff_site_card'), highlight('ff_site_card'), uses('wording'))
      .click('ff_site_open', '打开：左栏叫“章节”，带编号和时长', set($.ui.site, 'play'), shot('ff_site_nav'), highlight('ff_site_nav'), uses('numbering'), done('观众看到的词和手机端一致')),

    empty: flow('只写了标题，还没有章节', { cases: ['empty'], mock: '模拟刚开始写的影片', layer: 'board', state: { ui: { empty: true, term: 'empty' } }, description: '刚建好影片文件', expected: '看板和 check 都告诉作者下一步写什么，不报错' })
      .system('看板的空状态', '看板显示空状态和第一章怎么写', shot('ff_empty'), highlight('ff_empty'))
      .system('check 只是提示', 'check 给一条提示，不是错误', shot('ff_term'), highlight('ff_term'), done('知道下一步写什么')),
  };
};
