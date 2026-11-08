/**
 * 功能差异查看器「看不清」问题的两个候选方案（B 并排可放大、C 单画面切换）共用的画面。
 * 被比较的是一个示例邀请页：新版在「发送」前插入了预览，发送后的结果状态也变了。
 * 尺寸 sm / md / lg 模拟播放器舞台被缩放后的实际字号：栏越窄，字越小。
 */
import { $, eq, not, type Bind, type JNode } from '@joplo-app/kit';
import { ActionIcon, Badge, Box, Button, Group, Kbd, NavLink, Paper, SegmentedControl, SimpleGrid, Stack, Text } from '@joplo-app/kit/ui';

const ui = $.ui as unknown as Record<string, Bind>;
type Side = 'old' | 'new';
type Size = 'sm' | 'md' | 'lg';

const SIZE = {
  sm: { title: 12, text: 9, pad: 8, gap: 6 },
  md: { title: 18, text: 13, pad: 14, gap: 10 },
  lg: { title: 30, text: 19, pad: 28, gap: 18 },
} as const;

const LINE = '1px solid var(--jp-line)';

const Field = (p: { label: string; value: string; size: Size }) => {
  const s = SIZE[p.size];
  return <Stack gap={2}>
    <Text style={{ fontSize: s.text * 0.85 }} c="dimmed">{p.label}</Text>
    <Paper withBorder px={s.pad * 0.6} py={s.pad * 0.3}><Text style={{ fontSize: s.text }}>{p.value}</Text></Paper>
  </Stack>;
};

/** 被比较的示例页面：邀请成员。ids 以 prefix 区分，同一层里可以放多份。 */
export const InviteScreen = (p: { prefix: string; side: Side; size: Size }) => {
  const s = SIZE[p.size];
  const id = (x: string) => `${p.prefix}_${p.side}_${p.size}_${x}`;
  const old = p.side === 'old';
  return <Stack gap={s.gap} p={s.pad} h="100%" bg="var(--jp-surface)">
    <Group justify="space-between" wrap="nowrap">
      <Text fw={700} style={{ fontSize: s.title }}>邀请成员加入「设计组」</Text>
      <Badge variant="light" style={{ fontSize: s.text * 0.8 }}>团队 · 8 人</Badge>
    </Group>
    <Field label="邮箱" value="lin@example.com" size={p.size} />
    <Field label="角色" value="编辑者" size={p.size} />
    {!old && <Paper id={id('preview')} withBorder p={s.pad * 0.7} bg="#fffbea">
      <Text c="dimmed" style={{ fontSize: s.text * 0.85 }}>邀请预览</Text>
      <Text style={{ fontSize: s.text }}>小周邀请你以「编辑者」身份加入设计组。</Text>
    </Paper>}
    <Group><Button id={id('send')} unmodeled style={{ fontSize: s.text }}>发送邀请</Button></Group>
    <Paper id={id('status')} withBorder p={s.pad * 0.7} bg={old ? '#e8f6ee' : '#fff4d6'}>
      <Text fw={700} style={{ fontSize: s.text }}>{old ? '✓ 邀请已发出' : '… 正在发送'}</Text>
      <Text c="dimmed" style={{ fontSize: s.text * 0.85 }}>{old ? '已发送到 lin@example.com' : '发送完成后会通知你'}</Text>
    </Paper>
  </Stack>;
};

/** 播放器舞台下方原样保留的字幕行（对比时隐藏播放器自带控制条）。 */
const Caption = (p: { side: Side }) => (
  <Group justify="space-between" px="sm" py={4} style={{ borderTop: LINE }}>
    <Text size="sm">● 发送</Text>
    <Text size="xs" c="dimmed">{p.side === 'old' ? '旧版第 2 / 3 步' : '新版第 3 / 4 步'}</Text>
  </Group>
);

const SideTag = (p: { side: Side }) => (
  <Group gap={6} wrap="nowrap">
    <Text fw={700}>{p.side === 'old' ? '旧版' : '新版'}</Text>
    <Text size="xs" c="dimmed">{p.side === 'old' ? '1111111' : '2222222'}</Text>
  </Group>
);

export const TopBar = (p: { right: JNode }) => (
  <Group justify="space-between" px="md" py={8} style={{ borderBottom: LINE }} wrap="nowrap">
    <Group gap="sm" wrap="nowrap">
      <Text fw={800}>Joplo 功能差异</Text>
      <Badge variant="outline">1111111 → 2222222</Badge>
      <Badge color="green" variant="light">1 新增</Badge>
      <Badge color="yellow" variant="light">3 修改</Badge>
      <Badge color="red" variant="light">1 删除</Badge>
    </Group>
    {p.right}
  </Group>
);

export const ChangeList = (p: { prefix: string }) => (
  <Stack gap={4}>
    <Text size="xs" c="dimmed">邀请</Text>
    <NavLink id={`${p.prefix}_nav_single`} label="单人邀请" rightSection="2 处" active unmodeled>
      <NavLink id={`${p.prefix}_nav_preview`} label="预览" description="新增 · 新 2" unmodeled />
      <NavLink id={`${p.prefix}_nav_send`} label="发送" description="修改 · 旧 2 → 新 3" active unmodeled />
    </NavLink>
    <NavLink id={`${p.prefix}_nav_initial`} label="初始状态" rightSection="1 处" unmodeled />
    <NavLink id={`${p.prefix}_nav_retry`} label="重复重试" rightSection="不确定" unmodeled />
    <NavLink id={`${p.prefix}_nav_batch`} label="批量邀请" rightSection="新增" unmodeled />
    <NavLink id={`${p.prefix}_nav_legacy`} label="旧版邀请" rightSection="删除" unmodeled />
  </Stack>
);

/** 一行变化条：哪一处、哪一步、改了什么（含结果的前后值）。 */
export const ChangeStrip = (p: { prefix: string }) => (
  <Paper id={`${p.prefix}_strip`} withBorder px="md" py={8}>
    <Group justify="space-between" wrap="nowrap">
      <Group gap="sm" wrap="nowrap">
        <Badge color="yellow">修改</Badge>
        <Text size="sm" c="dimmed">变化 2 / 2</Text>
        <Text fw={700}>发送</Text>
        <Text size="sm" c="dimmed">旧 2 → 新 3</Text>
        <Text id={`${p.prefix}_delta`} size="sm">结果：<strong>邀请已发出</strong> → <strong>正在发送</strong></Text>
      </Group>
      <Group gap={6} wrap="nowrap">
        <ActionIcon id={`${p.prefix}_prev`} aria-label="上一处" variant="default" unmodeled>‹</ActionIcon>
        <Button id={`${p.prefix}_play`} size="xs" color="yellow" unmodeled>▶ 播放变化</Button>
        <ActionIcon id={`${p.prefix}_next`} aria-label="下一处" variant="default" disabled disabledReason="已经是最后一处变化">›</ActionIcon>
      </Group>
    </Group>
  </Paper>
);

const Screens = (p: { prefix: string; side: Side; sizes: Size[] }) => <>
  {p.sizes.map((size) => <Box key={size} when={eq(ui.size, size)} style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
    <InviteScreen prefix={p.prefix} side={p.side} size={size} />
  </Box>)}
</>;

/* ───────────── B · 并排，可收起列表、单侧放大 ───────────── */

const SplitPane = (p: { side: Side }) => (
  <Paper id={`fb_pane_${p.side}`} withBorder h="100%" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', borderColor: '#e0a800' }}>
    <Group justify="space-between" px="sm" py={6} bg="#fffbea" style={{ borderBottom: LINE }} wrap="nowrap">
      <SideTag side={p.side} />
      <Button id={`fb_zoom_${p.side}`} size="xs" variant="subtle" leftSection="⤢" {...(p.side === 'old' ? { unmodeled: true } : {})}>放大</Button>
    </Group>
    <Screens prefix="fb" side={p.side} sizes={['sm', 'md']} />
    <Caption side={p.side} />
  </Paper>
);

const ZoomPane = (p: { side: Side }) => (
  <Box when={eq(ui.mode, p.side)} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
    <Screens prefix="fb" side={p.side} sizes={['lg']} />
    <Caption side={p.side} />
  </Box>
);

export const FocusViewer = () => (
  <Stack id="fb_viewer" h="100%" gap={0}>
    <TopBar right={<Button id="fb_nav" size="xs" variant="default" leftSection="☰">{ui.navLabel}</Button>} />
    <Group align="stretch" gap={0} wrap="nowrap" style={{ flex: 1, minHeight: 0 }}>
      <Box id="fb_list" when={ui.nav} w={250} p="sm" style={{ borderRight: LINE, flexShrink: 0 }}><ChangeList prefix="fb" /></Box>
      <Stack gap="sm" p="sm" style={{ flex: 1, minWidth: 0 }}>
        <ChangeStrip prefix="fb" />
        <SimpleGrid id="fb_split" cols={2} spacing="sm" when={eq(ui.mode, 'split')} style={{ flex: 1, minHeight: 0 }}>
          <SplitPane side="old" />
          <SplitPane side="new" />
        </SimpleGrid>
        <Paper id="fb_zoom" withBorder when={not(eq(ui.mode, 'split'))} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderColor: '#e0a800' }}>
          <Group justify="space-between" px="sm" py={6} bg="#fffbea" style={{ borderBottom: LINE }} wrap="nowrap">
            <SegmentedControl id="fb_side" value={ui.mode} data={[{ value: 'old', label: '旧版 · 第 2 / 3 步' }, { value: 'new', label: '新版 · 第 3 / 4 步' }]} />
            <Group gap="xs" wrap="nowrap">
              <Text size="xs" c="dimmed">两版同步停在这一步</Text>
              <Button id="fb_unzoom" size="xs" variant="default" leftSection="⤡">回到并排</Button>
            </Group>
          </Group>
          <ZoomPane side="old" />
          <ZoomPane side="new" />
        </Paper>
      </Stack>
    </Group>
  </Stack>
);

export const focusInitial = () => ({ nav: true, navLabel: '收起列表', mode: 'split', size: 'sm' });

/* ───────────── C · 一个大画面，旧版 / 新版来回切换 ───────────── */

export const FlipViewer = () => (
  <Stack id="fc_viewer" h="100%" gap={0}>
    <TopBar right={<SegmentedControl id="fc_layout" value={ui.layout} data={[{ value: 'single', label: '单画面' }, { value: 'split', label: '并排' }]} />} />
    <Group align="stretch" gap={0} wrap="nowrap" style={{ flex: 1, minHeight: 0 }}>
      <Box id="fc_list" w={210} p="sm" style={{ borderRight: LINE, flexShrink: 0 }}><ChangeList prefix="fc" /></Box>
      <Stack gap="sm" p="sm" style={{ flex: 1, minWidth: 0 }}>
        <ChangeStrip prefix="fc" />
        <Paper id="fc_stage" withBorder when={eq(ui.layout, 'single')} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderColor: '#e0a800' }}>
          <Group justify="space-between" px="sm" py={6} bg="#fffbea" style={{ borderBottom: LINE }} wrap="nowrap">
            <SegmentedControl id="fc_side" value={ui.side} data={[{ value: 'old', label: '旧版 · 第 2 / 3 步' }, { value: 'new', label: '新版 · 第 3 / 4 步' }]} />
            <Group gap={6} wrap="nowrap"><Text size="xs" c="dimmed">按</Text><Kbd>空格</Kbd><Text size="xs" c="dimmed">在两版之间来回切，差异会“跳”出来</Text></Group>
          </Group>
          {(['old', 'new'] as const).map((side) => <Box key={side} when={eq(ui.side, side)} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <Box style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}><InviteScreen prefix="fc" side={side} size="lg" /></Box>
            <Caption side={side} />
          </Box>)}
        </Paper>
        <SimpleGrid id="fc_split" cols={2} spacing="sm" when={eq(ui.layout, 'split')} style={{ flex: 1, minHeight: 0 }}>
          {(['old', 'new'] as const).map((side) => <Paper key={side} withBorder style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', borderColor: '#e0a800' }}>
            <Group justify="space-between" px="sm" py={6} bg="#fffbea" style={{ borderBottom: LINE }} wrap="nowrap">
              <SideTag side={side} />
              <Button id={`fc_zoom_${side}`} size="xs" variant="subtle" leftSection="⤢" {...(side === 'new' ? { unmodeled: true } : {})}>只看这一版</Button>
            </Group>
            <Box style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}><InviteScreen prefix="fc" side={side} size="md" /></Box>
            <Caption side={side} />
          </Paper>)}
        </SimpleGrid>
      </Stack>
    </Group>
  </Stack>
);

export const flipInitial = () => ({ layout: 'single', side: 'new' });
