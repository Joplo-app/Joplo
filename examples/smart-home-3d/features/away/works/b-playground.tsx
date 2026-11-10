import { $, done, flow, free, work, set } from '@joplo-app/kit';
import { Accordion, Badge, Button, Group, Select, Stack, Switch, Text, TextInput, Title } from '@joplo-app/plugin-ui';
import base from './a-one-tap.tsx';
import { Home } from '../../../shared/home.tsx';

/** A remains the release baseline; B shows the new D88 audience interaction model. */
export default work({
  ...base,
  title: 'B · 像网页一样自由体验',
  summary: '先观看，拨动设备时暂停并生效；点窗户可进入对应场景；播放会恢复脚本。',
  state: { ...base.state, ui: { ...base.state?.ui, azimuth: 45, elevation: 32 } },
  on: { '/': { scene: <Home explore />, panel: <Stack gap="sm" h="100%">
    <Title order={3}>我的家</Title>
    <Text size="sm" c="dimmed">播放中第一次操作即暂停并生效，体验后按播放继续。</Text>
    <Switch id="sw_lamp" label="落地灯" checked={$.data.lamp} unmodeled />
    <Switch id="sw_ac" label="空调" checked={$.data.ac} />
    <Switch id="sw_tv" label="电视" checked={$.data.tv} unmodeled />
    <Switch id="sw_speaker" label="音箱" checked={$.data.speaker} unmodeled />
    <Group justify="space-between"><Text>客厅窗</Text><Badge color={$.data.windowColor}>{$.data.windowText}</Badge></Group>
    <Text size="sm" c="green" when={$.ui.away}>已离家 · 设备关闭，门已上锁</Text>
    <Button id="btn_away" disabled={$.ui.away} disabledReason="已经是离家状态">一键离家</Button>
    <Accordion id="details" unmodeled>
      <Accordion.Item value="room"><Accordion.Control id="details_toggle" unmodeled>房间设置 · 可以自由展开</Accordion.Control>
        <Accordion.Panel><Stack gap="sm">
          <TextInput id="room_name" label="房间名称" defaultValue="客厅" unmodeled />
          <Select id="room_mode" label="灯光模式" data={[{value:'cozy',label:'温馨'},{value:'bright',label:'明亮'}]} defaultValue="cozy" unmodeled />
          <Text size="xs" c="dimmed">这里的输入不会保留；按播放恢复演示。</Text>
        </Stack></Accordion.Panel>
      </Accordion.Item>
    </Accordion>
    <Text size="xs" c="dimmed">3D：拖动旋转，方向键也可旋转；点音箱体验关闭，点窗户试试切换场景。</Text>
  </Stack> } },
  free: { speaker: free.click('speaker', set($.data.speaker, false)) },
  scenarios: {
    ...base.scenarios,
    rotate: flow('从侧面观察，再自由探索', { cases: ['manual'], start: '/', expected: '旋转到指定角度；暂停后可探索，播放恢复脚本视角' })
      .act('scene3d:rotate', 'home', {azimuth:90,elevation:32}, '把视角转到侧面，看看设备的位置', set($.ui.azimuth,90), set($.ui.elevation,32))
      .system('观察全屋', done('暂停后自由体验；播放或重置会丢弃本机改动')),
  },
});
