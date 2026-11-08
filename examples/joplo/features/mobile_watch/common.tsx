/**
 * 「手机上像看视频一样看分享」的画面：
 * - portrait：竖着拿的手机。现状（舞台被挤成竖条）与改进后的播放页（16:10 画面 + 字幕 + 一行控制条 + 章节列表）；
 * - landscape：横着拿的手机。画面铺满，字幕叠在画面底部，点一下才出控件；
 * - rotated：iPhone 锁着竖屏点「横屏」：画面转 90° 铺满，提示把手机横过来。
 * 画面里的“演示”用一块深色画框代替（标题随章节变化），这里关心的是播放器，不是演示内容。
 */
import { $, eq, layer, not, oneOf, type Bind } from '@joplo-app/kit';
import { ActionIcon, Badge, Box, Button, Group, ListRow, Phone, Progress, Stack, Text } from '@joplo-app/kit/ui';

const ui = $.ui as unknown as Record<string, Bind>;

/** 示例分享里的四章（作者在功能里写的四个场景）。 */
export const CHAPTERS = [
  { n: 1, title: '01 开场：一夜之间发生了什么', dur: '0:40', cap: '一夜之间，局面变了' },
  { n: 2, title: '02 规则：三十秒讲清楚', dur: '0:55', cap: '先花三十秒，把规则讲清楚' },
  { n: 3, title: '03 结果：数字怎么变', dur: '1:10', cap: '开票后，数字一路越过中线' },
  { n: 4, title: '04 影响：和你有什么关系', dur: '0:50', cap: '最后，说说和你有关的部分' },
] as const;

export const initialUi = () => ({
  mode: 'now',
  playing: false,
  ch: 1,
  cap: '',
  prog: 0,
  frameTitle: '一夜之间',
  ctl: false,
  ended: false,
  nextHint: '',
  swipe: '',
  chapterTag: '第 1 章',
  chapterTitle: '01 开场：一夜之间发生了什么',
  rotateHint: false,
});

const DARK = '#0b1020';
const GOLD = '#f5b301';

/** 代表“演示画面”的深色画框：章节小标、大标题、几排“席位”。size 是标题字号。 */
function DemoFrame({ id, size }: { id: string; size: number }) {
  return (
    <Box id={id} style={{ position: 'absolute', inset: 0, background: `radial-gradient(120% 90% at 30% 0%, #1d2a4a 0%, ${DARK} 65%)`, color: '#fff', padding: size * 0.7, overflow: 'hidden' }}>
      <span style={{ background: GOLD, color: DARK, fontSize: size * 0.42, fontWeight: 800, padding: '1px 6px', borderRadius: 3 }}>{ui.chapterTag as never}</span>
      <div style={{ fontSize: size, fontWeight: 900, marginTop: size * 0.35, lineHeight: 1.2 }}>{ui.frameTitle as never}</div>
      <div style={{ position: 'absolute', right: size * 0.7, bottom: size * 0.7, display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: size * 0.12, width: '42%' }}>
        {Array.from({ length: 36 }, (_, i) => (
          <span key={i} style={{ aspectRatio: '1', borderRadius: '50%', background: i % 12 < 7 ? '#3b82f6' : '#ef4444', opacity: 0.85 }} />
        ))}
      </div>
    </Box>
  );
}

// ---------- 竖屏 ----------
function Header() {
  return (
    <Group justify="space-between" px="sm" py={8} gap="xs" style={{ borderBottom: '1px solid var(--jp-line)', flexShrink: 0 }}>
      <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
        <span style={{ width: 22, height: 22, borderRadius: 6, background: '#ffd43b', display: 'inline-block', flexShrink: 0 }} />
        <Text fw={700} size="sm" truncate>一看就懂：新功能发布</Text>
      </Group>
      <ActionIcon id="p_share" aria-label="复制链接" variant="subtle" unmodeled>⧉</ActionIcon>
    </Group>
  );
}

/** 现状：舞台按手机宽度重新排版，被挤成竖条；图层标签挤在一起；字幕被朗读标签盖住；控制条溢出。 */
function Broken() {
  return (
    <Stack id="p_broken" gap={6} p="xs" style={{ flex: 1, minHeight: 0 }}>
      <Group gap={2} wrap="nowrap" style={{ overflow: 'hidden' }}>
        <Badge variant="outline">开场</Badge>
        {Array.from({ length: 8 }, (_, i) => <span key={i} style={{ width: 10, height: 22, border: '1px solid var(--jp-line-strong)', borderRadius: 3, flexShrink: 0 }} />)}
        <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>Follow director</Text>
      </Group>
      <Box id="n_video" style={{ position: 'relative', flex: 1, minHeight: 0, borderRadius: 8, overflow: 'hidden' }}>
        <Box style={{ position: 'absolute', inset: 0, background: `linear-gradient(${DARK}, #2a1020)`, color: '#fff', padding: 14, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 900, lineHeight: 1.2 }}>一夜之间</div>
          <div style={{ fontSize: 14, opacity: 0.7, marginTop: 6 }}>{'标题被按 390 宽重新排版\n照片被拉成整屏'}</div>
        </Box>
      </Box>
      <Box style={{ position: 'relative', height: 40 }}>
        <Text size="md" c="dimmed" style={{ position: 'absolute', left: 70, right: 0, top: 8, whiteSpace: 'nowrap', overflow: 'hidden' }}>一夜之间，局面变了，接下…</Text>
        <Badge id="n_reading" style={{ position: 'absolute', left: 0, top: 8 }} color="yellow">正在朗读</Badge>
      </Box>
      <Group id="n_controls" gap={6} wrap="nowrap" style={{ overflow: 'hidden' }}>
        {['↺', '‹', '▶ 继续', '›', '1', '🔊', '1×', '⌄'].map((t, i) => <Badge key={i} variant="outline" size="lg" style={{ flexShrink: 0 }}>{t}</Badge>)}
      </Group>
    </Stack>
  );
}

function Video() {
  return (
    <Stack gap={0} style={{ flex: 1, minHeight: 0 }}>
      <Box id="p_video" style={{ position: 'relative', width: '100%', aspectRatio: '16 / 10', background: '#000', flexShrink: 0 }}>
        <DemoFrame id="p_frame" size={20} />
        <Box when={ui.ended as never} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.72)', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>看完了</div>
          <Group gap="xs">
            <Button id="p_replay" size="xs" variant="white">↺ 重看</Button>
            <Button id="p_copy" size="xs" variant="outline" color="#fff" unmodeled>复制链接</Button>
          </Group>
        </Box>
      </Box>
      <Text id="p_caption" px="sm" pt={10} size="md" fw={600} style={{ minHeight: 48 }}>{ui.cap}</Text>
      <Group id="p_controls" px="sm" py={6} gap={8} wrap="nowrap">
        <ActionIcon id="p_prev" aria-label="上一步" variant="subtle" unmodeled>‹</ActionIcon>
        <ActionIcon id="p_play" aria-label="播放" variant="filled" when={not(ui.playing) as never}>▶</ActionIcon>
        <ActionIcon id="p_pause" aria-label="暂停" variant="filled" when={ui.playing as never} unmodeled>❚❚</ActionIcon>
        <ActionIcon id="p_next" aria-label="下一步" variant="subtle" unmodeled>›</ActionIcon>
        <Progress value={ui.prog as never} size="sm" style={{ flex: 1 }} />
        <ActionIcon id="p_voice" aria-label="朗读" variant="subtle" unmodeled>🔊</ActionIcon>
        <Button id="p_land" size="xs" variant="light" leftSection="⤢">横屏</Button>
      </Group>
      <Stack id="p_chapters" gap={2} px="xs" pt={6} style={{ borderTop: '1px solid var(--jp-line)', overflow: 'auto', flex: 1, minHeight: 0 }}>
        <Text size="xs" c="dimmed" px={6} pt={4}>章节 · {CHAPTERS.length}</Text>
        {CHAPTERS.map((c) => (
          <ListRow key={c.n} id={`p_ch${c.n}`} title={c.title} description={c.dur} active={eq(ui.ch, c.n) as never}>
            <Badge when={eq(ui.ch, c.n) as never} variant="dot" color="yellow">播放中</Badge>
          </ListRow>
        ))}
      </Stack>
      <Box when={ui.nextHint as never} style={{ position: 'absolute', left: 12, right: 12, top: 210, background: 'rgba(11,16,32,.92)', color: '#fff', borderRadius: 8, padding: '8px 12px', fontSize: 13 }} id="p_nexthint">{ui.nextHint as never}</Box>
    </Stack>
  );
}

function Portrait() {
  return (
    <Stack align="center" justify="center" h="100%" p="md">
      <Phone id="phone_portrait">
        <Stack gap={0} h="100%" style={{ position: 'relative' }}>
          <Header />
          <Box when={eq(ui.mode, 'now') as never} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}><Broken /></Box>
          <Box when={eq(ui.mode, 'video') as never} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}><Video /></Box>
        </Stack>
      </Phone>
    </Stack>
  );
}

// ---------- 横屏 ----------
/** 横屏的画面：16:10 放进 772 × 358，左右留黑边；字幕叠在画面底部；控件只在 ctl 时浮出。 */
function LandscapeScreen({ prefix }: { prefix: string }) {
  return (
    <Box style={{ position: 'absolute', inset: 0, background: '#000' }}>
      <Box id={`${prefix}_stage`} style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', aspectRatio: '16 / 10', transform: 'translateX(-50%)' }}>
        <DemoFrame id={`${prefix}_frame`} size={30} />
        <Box id={`${prefix}_caption`} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '28px 16px 12px', background: 'linear-gradient(transparent, rgba(0,0,0,.75))', color: '#fff', textAlign: 'center', fontSize: 17, fontWeight: 700 }}>{ui.cap as never}</Box>
      </Box>
      <Box id={`${prefix}_controls`} when={ui.ctl as never} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.45)', color: '#fff' }}>
        <Group justify="space-between" px="md" pt={10} wrap="nowrap">
          <Group gap={8} wrap="nowrap">
            <ActionIcon id={`${prefix}_exit`} aria-label="退出横屏" variant="subtle" color="#fff" unmodeled>✕</ActionIcon>
            <Text c="#fff" fw={700} size="sm">{ui.chapterTitle as never}</Text>
          </Group>
          <Group gap={6}>
            <Badge variant="outline" color="#fff">🔊 朗读</Badge>
            <Badge variant="outline" color="#fff">1×</Badge>
          </Group>
        </Group>
        <Group justify="center" gap={36} style={{ position: 'absolute', left: 0, right: 0, top: '42%' }}>
          <ActionIcon id={`${prefix}_prev`} aria-label="上一步" size="xl" variant="subtle" color="#fff" unmodeled>⏮</ActionIcon>
          <ActionIcon id={`${prefix}_pause`} aria-label="暂停" size="xl" variant="white" unmodeled>❚❚</ActionIcon>
          <ActionIcon id={`${prefix}_next`} aria-label="下一步" size="xl" variant="subtle" color="#fff" unmodeled>⏭</ActionIcon>
        </Group>
        <Box style={{ position: 'absolute', left: 16, right: 16, bottom: 12 }}>
          <Progress value={ui.prog as never} size="sm" color="yellow" />
          <Group justify="space-between" mt={4}>
            {CHAPTERS.map((c) => <Text key={c.n} size="xs" c="#ddd">{`第 ${c.n} 章`}</Text>)}
          </Group>
        </Box>
      </Box>
      <Box id={`${prefix}_swipe`} when={ui.swipe as never} style={{ position: 'absolute', right: 24, top: '45%', background: 'rgba(255,255,255,.9)', color: DARK, borderRadius: 999, padding: '6px 14px', fontWeight: 700, fontSize: 14 }}>{ui.swipe as never}</Box>
    </Box>
  );
}

function Landscape() {
  return (
    <Stack align="center" justify="center" h="100%" p="md">
      <Phone id="phone_landscape" landscape>
        <LandscapeScreen prefix="l" />
      </Phone>
    </Stack>
  );
}

/** iPhone 锁着竖屏：横屏界面整体转 90° 放进竖着的屏幕；提示也跟着转。 */
function Rotated() {
  return (
    <Stack align="center" justify="center" h="100%" p="md">
      <Phone id="phone_rotated">
        <Box style={{ position: 'absolute', inset: 0, background: '#000' }}>
          <Box style={{ position: 'absolute', left: (390 - 800) / 2, top: (844 - 370) / 2, width: 800, height: 370, transform: 'rotate(90deg)' }}>
            <LandscapeScreen prefix="r" />
            <Box id="r_hint" when={ui.rotateHint as never} style={{ position: 'absolute', left: '50%', top: 16, transform: 'translateX(-50%)', background: GOLD, color: DARK, borderRadius: 999, padding: '6px 14px', fontWeight: 800, fontSize: 14, whiteSpace: 'nowrap' }}>把手机横过来看 ⟲</Box>
          </Box>
        </Box>
      </Phone>
    </Stack>
  );
}

export const layers = () => ({
  portrait: layer('竖着拿', <Portrait />, { icon: 'mobile', role: 'chen' }),
  landscape: layer('横过来', <Landscape />, { icon: 'mobile', role: 'chen' }),
  rotated: layer('iPhone 锁竖屏', <Rotated />, { icon: 'mobile', role: 'chen' }),
});

export const _cond = oneOf;
