/**
 * 演示页里两个方案共用的部分：顶栏面包屑与设备切换、画面、播放控制、「…」菜单、步骤条、
 * 导出视频弹窗和检查抽屉。两个方案只在左栏的组织方式上不同。p 是元素 ID 前缀。
 */
import { $, done, eq, flow, not, set, toast, uses, type JNode } from '@joplo-app/kit';
import {
  ActionIcon, Alert, Anchor, Badge, Box, Breadcrumbs, Button, CloseButton, Code, DataTable, Drawer, Group, List, Modal,
  Paper, Progress, Select, Stack, Stepper, Switch, Text, Title,
} from '@joplo-app/kit/ui';

const members = [
  { name: '王芳', email: 'wang.fang@example.com', role: '管理员' },
  { name: '陈晨', email: 'chen.chen@example.com', role: '编辑者' },
  { name: '刘洋', email: 'liu.yang@example.com', role: '查看者' },
];

/** 被演示的原型（这里用邀请功能的成员页做样例）。 */
const Prototype = (p: { id: string; compact?: boolean }) => (
  <Stack gap="sm">
    <Group justify="space-between">
      <Title order={p.compact ? 4 : 3}>成员</Title>
      <Button id={`${p.id}_invite`} size={p.compact ? 'xs' : 'sm'} unmodeled={p.compact} note="被演示原型里的按钮：单击按场景操作，⌥ 单击检查">邀请成员</Button>
    </Group>
    <DataTable id={`${p.id}_tbl`} records={members} columns={[{ accessor: 'name', title: '姓名' }, { accessor: 'role', title: '权限' }]} />
    <Paper id={`${p.id}_dlg`} withBorder shadow="md" p="md" when={$.ui.dlg}>
      <Stack gap="xs">
        <Text fw={600}>邀请成员</Text>
        <Text size="sm">邮箱：{$.ui.email}</Text>
        <Text size="sm">权限：{$.ui.role}</Text>
        <Text size="sm" c="green" when={$.ui.sent}>✓ 已向 li.lei@example.com 发送邀请</Text>
      </Stack>
    </Paper>
  </Stack>
);

export const header = (p: string): JNode[] => [
  <Breadcrumbs id={`${p}_crumbs`}>
    <Anchor id={`${p}_crumb_project`} href="/board">团队邀请功能</Anchor>
    <Text size="sm">团队成员邀请</Text>
    <Text size="sm">{$.ui.optionName}</Text>
    <Text size="sm" fw={600}>{$.ui.scenarioName}</Text>
  </Breadcrumbs>,
];

export const main = (p: string): JNode => (
  <Stack gap="sm">
    <Paper withBorder radius="lg" p="lg" mih={440}>
      <Prototype id={`${p}_pc`} />
    </Paper>
    <Group justify="space-between">
      <Group gap="xs">
        <ActionIcon id={`${p}_reset`} aria-label="回到第 0 步" variant="default">⟲</ActionIcon>
        <Button id={`${p}_prev`} variant="default" disabled={eq($.ui.stepNo, 0)} disabledReason="已经是第 0 步">上一步</Button>
        <Button id={`${p}_play`}>{$.ui.playLabel}</Button>
        <Button id={`${p}_next`} variant="default">下一步</Button>
      </Group>
      <Stack gap={4} align="flex-end">
        <ActionIcon id={`${p}_more`} aria-label="更多操作" variant="default">…</ActionIcon>
        <Paper id={`${p}_menu`} withBorder shadow="md" p="xs" when={$.ui.menu}>
          <Stack gap={2}>
            <Button id={`${p}_m_image`} variant="subtle" justify="flex-start">导出图片（当前步骤）</Button>
            <Button id={`${p}_m_video`} variant="subtle" justify="flex-start" when={not($.ui.publish)}>导出视频（整个场景）</Button>
            <Button id={`${p}_m_theme`} variant="subtle" justify="flex-start" unmodeled>切换为线框风格</Button>
            <Button id={`${p}_m_link`} variant="subtle" justify="flex-start" unmodeled>复制当前步骤的链接</Button>
            <Button id={`${p}_m_editor`} variant="subtle" justify="flex-start" when={not($.ui.publish)} unmodeled>在编辑器中打开源文件</Button>
          </Stack>
        </Paper>
      </Stack>
    </Group>
    <Paper withBorder radius="md" p="md">
      <Stack gap="xs">
        <Stepper id={`${p}_steps`} active={$.ui.stepNo}>
          <Stepper.Step label="初始" />
          <Stepper.Step label="打开弹窗" />
          <Stepper.Step label="填写邮箱" />
          <Stepper.Step label="选择权限" />
          <Stepper.Step label="发送" />
          <Stepper.Step label="完成" />
        </Stepper>
        <Text fw={600}>第 {$.ui.stepNo} 步 · {$.ui.caption}</Text>
        <Text size="sm" c="dimmed">{$.ui.nextCaption}</Text>
      </Stack>
    </Paper>
  </Stack>
);

export const overlay = (p: string): JNode[] => [
  <Modal id={`${p}_video`} opened={$.ui.videoOpen} title="导出视频">
    <Stack gap="md">
      <Select id={`${p}_v_size`} label="尺寸" data={['电脑 1280×800', '手机 390×844']} />
      <Switch id={`${p}_v_cursor`} label="显示鼠标轨迹和点击" checked unmodeled />
      <Stack gap={4} when={$.ui.exporting}>
        <Progress value={$.ui.progress} />
        <Text size="sm" c="dimmed">{$.ui.progressText}</Text>
      </Stack>
      <Alert color="green" title="已导出" when={$.ui.exported}>
        invite-success.mp4（12 秒，2.1 MB），保存在项目的 exports/ 目录
      </Alert>
      <Alert color="red" title="还没有安装导出组件，无法录制" when={$.ui.exportErr}>
        <Code block>npx joplo setup export</Code>
      </Alert>
      <Group justify="flex-end">
        <Button id={`${p}_v_start`} disabled={$.ui.exporting} disabledReason="正在导出">{$.ui.videoButton}</Button>
      </Group>
    </Stack>
  </Modal>,
  <Drawer id={`${p}_inspect`} opened={$.ui.drawer} position="right" title="检查：「邀请成员」按钮" note="审阅信息不再占用独立模式，按需弹出">
    <Stack gap="md">
      <Stack gap={4}>
        <Text size="sm" fw={600}>规则</Text>
        <List size="sm">
          <List.Item>只有空间管理员可以发起邀请 · 用户已确认</List.Item>
        </List>
      </Stack>
      <Stack gap={4}>
        <Text size="sm" fw={600}>覆盖的情况</Text>
        <Group gap="xs"><Badge variant="light">非管理员尝试邀请</Badge><Badge variant="light">正常发出邀请</Badge></Group>
      </Stack>
      <Stack gap={4}>
        <Text size="sm" fw={600}>源码</Text>
        <Code>features/invite/options/a-modal.tsx:33:9</Code>
        <Text size="xs" c="dimmed">已写入 .joplo/selection.json：在 Agent 会话里说要改什么，Agent 运行 npx joplo selection 就只改这一处。</Text>
      </Stack>
      <Group justify="space-between">
        <Button id={`${p}_i_copy`} variant="default" size="xs" unmodeled>复制位置</Button>
        <CloseButton id={`${p}_i_close`} aria-label="关闭抽屉" />
      </Group>
    </Stack>
  </Drawer>,
];

export const playerState = (p: string) => ({
  ui: {
    optionName: 'A · 单人邮件邀请弹窗', scenarioName: '管理员成功发出邀请',
    stepNo: 0, caption: '初始状态', nextCaption: '下一步：管理员点击右上角「邀请成员」，打开邀请弹窗', playLabel: '▶ 播放',
    dlg: false, email: '', role: '', sent: false,
    menu: false, videoOpen: false, exporting: false, progress: 0, progressText: '', exported: false, exportErr: false, videoButton: '开始导出',
    drawer: false, publish: false,
  },
});

const stepTo = (n: number, caption: string, next: string, ...extra: ReturnType<typeof set>[]) => [
  set($.ui.stepNo, n), set($.ui.caption, caption), set($.ui.nextCaption, next), ...extra,
];

/** 共用场景：播放、手机、导出图片、导出视频（成功 / 失败）、检查元素、发布站。 */
export const sharedScenarios = (p: string) => ({
  play: flow('播放一个场景', { cases: ['play'], start: '/board/play', expected: '画面随步骤变化，步骤条与说明同步' })
    .click(`${p}_next`, '点「下一步」：画面打开邀请弹窗，步骤条走到第 1 步', ...stepTo(1, '打开邀请弹窗', '下一步：填写邮箱', set($.ui.dlg, true)), uses('header_minimal'))
    .click(`${p}_play`, '点「播放」：自动往下走', set($.ui.playLabel, '⏸ 暂停'))
    .system('自动播放：填写邮箱', ...stepTo(2, '填写邮箱', '下一步：选择权限', set($.ui.email, 'li.lei@example.com')))
    .system('自动播放：选择权限', ...stepTo(3, '选择权限', '下一步：发送邀请', set($.ui.role, '编辑者')))
    .system('自动播放：发送', ...stepTo(4, '发送邀请', '下一步：完成'))
    .system('自动播放：完成', ...stepTo(5, '邀请已发出', '场景结束', set($.ui.sent, true), set($.ui.playLabel, '▶ 重新播放')), done('播放完整个场景')),

  step_back: flow('逐步前进与后退', { cases: ['play'], start: '/board/play' })
    .click(`${p}_next`, ...stepTo(1, '打开邀请弹窗', '下一步：填写邮箱', set($.ui.dlg, true)))
    .click(`${p}_prev`, '「上一步」回到第 0 步', ...stepTo(0, '初始状态', '下一步：管理员点击右上角「邀请成员」，打开邀请弹窗', set($.ui.dlg, false)))
    .click(`${p}_reset`, '「⟲」随时回到开头', ...stepTo(0, '初始状态', '下一步：管理员点击右上角「邀请成员」，打开邀请弹窗'), done('前进、后退、回到开头')),

  export_image: flow('导出当前步骤的图片', { cases: ['export_image'], start: '/board/play' })
    .click(`${p}_more`, '点画面右下角「…」', set($.ui.menu, true))
    .click(`${p}_m_image`, '导出图片', set($.ui.menu, false), toast.success('已下载 invite.success-0.png'), done('得到当前步骤的截图')),

  export_video: flow('导出整个场景的视频', { cases: ['export_video'], start: '/board/play', expected: '能看到进度，完成后给出文件' })
    .click(`${p}_more`, '点「…」', set($.ui.menu, true))
    .click(`${p}_m_video`, '选「导出视频」，弹出选项', set($.ui.menu, false), set($.ui.videoOpen, true))
    .select(`${p}_v_size`, '电脑 1280×800', '选尺寸：电脑或手机')
    .click(`${p}_v_start`, '开始导出：本机后台录制整个场景', set($.ui.exporting, true), set($.ui.progress, 40), set($.ui.progressText, '正在录制第 2 / 5 步…'), uses('video_local'))
    .system('录制完成（模拟）', '完成后给出文件位置', set($.ui.exporting, false), set($.ui.progress, 100), set($.ui.exported, true), set($.ui.videoButton, '再导出一次'), done('得到 mp4 视频')),

  export_video_fail: flow('导出视频失败', { cases: ['export_video'], outcome: 'failure', start: '/board/play', mock: '模拟本机没有安装 Chromium' })
    .click(`${p}_more`, '点「…」', set($.ui.menu, true))
    .click(`${p}_m_video`, set($.ui.menu, false), set($.ui.videoOpen, true))
    .select(`${p}_v_size`, '手机 390×844')
    .click(`${p}_v_start`, '开始导出', set($.ui.exporting, true), set($.ui.progress, 5), set($.ui.progressText, '正在启动浏览器…'))
    .system('启动浏览器失败（模拟）', '说明原因和安装命令；装好后可以直接重试', set($.ui.exporting, false), set($.ui.exportErr, true), set($.ui.videoButton, '重试'), uses('video_local')),

  inspect: flow('检查一个元素', { cases: ['review'], start: '/board/play', description: '暂定手势：按住 ⌥ 单击（见待决问题）' })
    .click(`${p}_pc_invite`, '⌥+单击「邀请成员」：弹出检查抽屉', set($.ui.drawer, true), uses('review_in_drawer'))
    .click(`${p}_i_close`, '看完关闭抽屉，继续演示', set($.ui.drawer, false), done('看到规则、情况和源码位置')),

  publish_play: flow('观众在发布站上看', { cases: ['publish_play'], start: '/board/play', state: { ui: { publish: true } }, mock: '发布站视图' })
    .click(`${p}_more`, '「…」里只剩导出图片、线框风格和复制链接', set($.ui.menu, true), uses('same_layout'))
    .click(`${p}_m_image`, set($.ui.menu, false), toast.success('已下载 invite.success-0.png'))
    .click(`${p}_play`, '照常播放', set($.ui.playLabel, '⏸ 暂停'), ...stepTo(1, '打开邀请弹窗', '下一步：填写邮箱', set($.ui.dlg, true)), done('观众看到同样的演示')),
});
