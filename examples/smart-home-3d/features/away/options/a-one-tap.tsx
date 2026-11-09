import { music } from '@joplo-app/plugin-alda';
import { $, done, explain, flow, option, set, spotlight, toast, undecided, uses } from '@joplo-app/kit';
import { Alert, Badge, Button, Divider, Group, Loader, Stack, Switch, Text, Title } from '@joplo-app/plugin-ui';

import { Home } from '../../../shared/home.tsx';

/** 离家后的设备状态：灯、空调、电视关闭，门上锁。 */
const allOff = [set($.data.lamp, false), set($.data.ac, false), set($.data.tv, false), set($.data.speaker, false)];
const locked = [set($.data.doorLabel, '入户门 · 已上锁'), set($.data.doorText, '已上锁'), set($.ui.leaving, false), set($.ui.away, true)];

export default option({
  name: 'A · 一键离家 + 3D 定位',
  idea: 'App 上一个「一键离家」按钮；离家前先检查门窗，没关好的在 3D 画面里定位，点它就能关上',
  focus: '异常怎么定位：用 3D 画面告诉住户“是哪一扇”',
  tradeoffs: ['一眼看到是哪扇窗没关，比列表里的名字更直观', '需要先建好家里的 3D 布局'],

  on: {
    '/': {
      scene: <Home />,
      panel: (
        <Stack gap="md" h="100%">
          <Stack gap={2}>
            <Title order={3}>我的家</Title>
            <Text size="sm" c="dimmed">客厅 · 玄关</Text>
          </Stack>
          <Divider />
          <Switch id="sw_lamp" label="落地灯" checked={$.data.lamp} unmodeled note="在 3D 画面里点灯演示了同一件事" />
          <Switch id="sw_ac" label="空调" description="26°C · 制冷" checked={$.data.ac} />
          <Switch id="sw_tv" label="电视" checked={$.data.tv} unmodeled />
          <Group justify="space-between">
            <Text>客厅窗</Text>
            <Badge color={$.data.windowColor} variant="light">{$.data.windowText}</Badge>
          </Group>
          <Group justify="space-between">
            <Text>入户门</Text>
            <Badge color="gray" variant="light">{$.data.doorText}</Badge>
          </Group>
          <Divider />
          <Alert id="alert_window" color="orange" title="客厅窗还开着" when={$.ui.windowAlert}>
            关好后才能离家。可以直接点 3D 画面里的窗户把它关上。
          </Alert>
          <Group id="spin_away" gap="xs" when={$.ui.leaving}>
            <Loader size="sm" />
            <Text size="sm">正在离家：关闭设备…</Text>
          </Group>
          <Alert id="alert_away" color="green" title="已离家" when={$.ui.away}>
            灯、空调、电视已关闭，入户门已上锁。
          </Alert>
          <Button id="btn_away" size="lg" fullWidth disabled={$.ui.away} disabledReason="已经是离家状态">一键离家</Button>
        </Stack>
      ),
    },
  },

  state: {
    ui: { focus: null, windowAlert: false, leaving: false, away: false },
    data: { lamp: true, ac: true, tv: true, speaker: true, windowOpen: false, windowText: '已关', windowColor: 'green', doorLabel: '入户门 · 未上锁', doorText: '未上锁' },
  },

  coverage: {
    offline: undecided('设备离线时是否仍然允许离家、怎样提示，尚未决定'),
  },

  scenarios: {
    leave: flow('门窗关好，一键离家', { cases: ['happy'], expected: '灯、空调、电视依次关闭，入户门上锁' })
      .system('轻柔配乐开始', music.play('theme', { fadeMs: 900, loop: true, volume: .45 }))
      .click('btn_away', '出门前点「一键离家」：先检查门窗，都关好了', set($.ui.leaving, true), uses('check_first'))
      .system('关闭落地灯', '落地灯关闭', set($.data.lamp, false), set($.ui.focus, 'lamp'))
      .system('关闭空调', '空调关闭', set($.data.ac, false), set($.ui.focus, 'ac'))
      .system('关闭电视和音箱', '电视和音箱关闭', set($.data.tv, false), set($.data.speaker, false), set($.ui.focus, 'tv'))
      .system('入户门上锁', '入户门上锁，离家完成', ...locked, set($.ui.focus, 'door'), toast.success('已离家'))
      .system('回到全景', '全屋设备都已关闭', set($.ui.focus, null), music.stop({ fadeMs: 1000 }), done('出门只需要点一下')),

    window_open: flow('客厅窗没关，先在 3D 里关上', {
      cases: ['window_open'], mock: '模拟客厅窗开着',
      state: { data: { windowOpen: true, windowText: '未关', windowColor: 'orange' } },
      expected: '不直接离家：3D 画面推近到开着的窗，关好后再离家成功',
    })
      .system('轻柔配乐开始', music.play('theme', { fadeMs: 900, loop: true, volume: .45 }))
      .click('btn_away', '点「一键离家」：检查发现客厅窗还开着', set($.ui.windowAlert, true), set($.ui.focus, 'window'), uses('check_first'))
      .click('window', '直接点 3D 画面里的窗户，把它关上', set($.data.windowOpen, false), set($.data.windowText, '已关'), set($.data.windowColor, 'green'), set($.ui.windowAlert, false),
        explain('3D 画面里点的是同一个“窗户”元素：步骤、镜头、提示都按它定位'))
      .click('btn_away', '再点「一键离家」', set($.ui.leaving, true), set($.ui.focus, null))
      .system('关闭设备并上锁', '设备关闭，入户门上锁', ...allOff, ...locked, toast.success('已离家'), music.stop({ fadeMs: 1000 }), done('没关好的窗被找到并关上，然后顺利离家')),

    manual: flow('在 3D 画面和 App 里控制设备', { cases: ['manual'], expected: '两边任一处操作，另一边同步变化', start: '/' })
      .system('轻柔配乐开始', music.play('theme', { fadeMs: 900, loop: true, volume: .45 }))
      .click('lamp', '点 3D 画面里的落地灯关掉它，App 开关同步关闭', set($.data.lamp, false), set($.ui.focus, 'lamp'), uses('in_sync'), spotlight('sw_lamp'))
      .click('sw_ac', '反过来，在 App 里关掉空调：3D 画面里的空调同步熄灭', set($.data.ac, false), set($.ui.focus, 'ac'), uses('in_sync'))
      .system('回到全景', '两边始终是同一份设备状态', set($.ui.focus, null), music.stop({ fadeMs: 1000 }), done('App 和 3D 画面显示同一份状态')),
  },
});
