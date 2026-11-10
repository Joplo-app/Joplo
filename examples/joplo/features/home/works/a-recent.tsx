import { withDesignRecord } from '../../../shared/design/record.ts';
import { designRecords } from '../../../shared/design/records.ts';
import { $, done, eq, flow, not, work, set, toast, uses } from '@joplo-app/kit';
import { Alert, Badge, Button, Center, Code, Divider, Group, NavLink, Paper, Stack, Text, Title } from '@joplo-app/plugin-ui';

/** 一行功能：名称、目标、方案数、选定方案、缺口，右侧「查看」。 */
const FeatureRow = (p: { id: string; name: string; goal: string; options: string; pick: string; gaps: string; unmodeled?: boolean }) => (
  <Paper withBorder p="md" radius="md">
    <Group justify="space-between" wrap="nowrap">
      <Stack gap={2}>
        <Text fw={600}>{p.name}</Text>
        <Text size="sm" c="dimmed">{p.goal}</Text>
        <Group gap="xs">
          <Badge variant="default">{p.options}</Badge>
          <Badge variant="light">{p.pick}</Badge>
          <Badge color="red" variant="light" when={not($.ui.publish)}>{p.gaps}</Badge>
        </Group>
      </Stack>
      <Button id={p.id} variant="default" unmodeled={p.unmodeled}>查看</Button>
    </Group>
  </Paper>
);

export default withDesignRecord(work({
  title: 'A · 记住打开过的项目',
  summary: '每次 joplo dev 都把项目记进 ~/.joplo/projects.json；首页左栏按最近打开列出，右侧列出所选项目的功能',
  focus: '项目从哪里来：自动记住，不需要配置文件',
  tradeoffs: ['不用写任何配置，打开过一次就在列表里', '目录移动后记录会失效，需要“找不到目录”状态', '列表是本机私有的，不进 Git'],

  on: {
    '/board': {
      nav: [
        <Stack gap={4} when={not($.ui.publish)}>
          <Text size="xs" c="dimmed">最近打开</Text>
          <NavLink id="h_invite" label="团队邀请功能" description="~/work/joplo/examples/invite" active={eq($.ui.project, 'invite')} />
          <NavLink id="h_dist" label="Joplo 分发：npm 包与 Agent 用法" description="~/work/joplo/examples/joplo-dist" active={eq($.ui.project, 'dist')} />
          <NavLink id="h_shop" when={$.ui.shopAdded} label="网店结算" description="2 个错误 · ~/work/shop" active={eq($.ui.project, 'shop')} />
          <NavLink id="h_old" when={not($.ui.oldGone)} label="旧原型" description="找不到目录 · ~/work/old-demo" active={eq($.ui.project, 'old')} />
          <Divider my="sm" />
          <Text size="xs" c="dimmed">在任意项目目录运行 npx joplo dev，它就会出现在这里。</Text>
        </Stack>,
        <Stack gap={4} when={$.ui.publish}>
          <Text size="xs" c="dimmed">团队邀请功能</Text>
          <NavLink id="h_pub_invite" label="团队成员邀请" active unmodeled />
        </Stack>,
      ],
      main: [
        <Center id="h_empty" when={$.ui.noProjects} h={480}>
          <Stack gap="sm" align="center">
            <Title order={3}>还没有打开过项目</Title>
            <Text c="dimmed">在一个空目录里运行：</Text>
            <Code block>{'npx joplo init my-demo\ncd my-demo && npm install\nnpx joplo dev'}</Code>
            <Text size="sm" c="dimmed">打开过的项目会记在 ~/.joplo/projects.json，下次直接出现在左栏。</Text>
          </Stack>
        </Center>,
        <Stack id="h_invite_main" gap="md" when={eq($.ui.project, 'invite')}>
          <Stack gap={2}>
            <Title order={2}>团队邀请功能</Title>
            <Text c="dimmed">空间管理员邀请成员加入空间，并指定其协作权限。</Text>
          </Stack>
          <Group justify="space-between">
            <Title order={4}>功能</Title>
            <Text size="sm" c="dimmed" when={not($.ui.publish)}>http://127.0.0.1:4790 · 已选定 1 / 1</Text>
          </Group>
          <FeatureRow id="h_view_invite" name="团队成员邀请" goal="空间管理员邀请成员加入空间，并指定其协作权限" options="2 个方案" pick="已选 A · 单人邮件邀请弹窗" gaps="缺失 3 · 待决定 1" />
        </Stack>,
        <Stack id="h_dist_main" gap="md" when={eq($.ui.project, 'dist')}>
          <Title order={2}>Joplo 分发：npm 包与 Agent 用法</Title>
          <Title order={4}>功能</Title>
          <FeatureRow id="h_view_npm" name="npm 包发布" goal="仓库外的用户用一条 npx 命令就能开始" options="2 个方案" pick="已选 B · 作用域包" gaps="缺失 0" unmodeled />
          <FeatureRow id="h_view_skill" name="Agent 用法：npx joplo skill" goal="编码 Agent 按需拿到正确写法" options="3 个方案" pick="已选 B · 指针 skill" gaps="缺失 0" unmodeled />
        </Stack>,
        <Alert id="h_shop_err" color="red" title="网店结算：编译失败，修复后自动刷新" when={eq($.ui.project, 'shop')}>
          <Code block>{'features/cart/feature.ts:12:3  error  UNKNOWN_PICK  pick「c-fast」不是 options/ 下的方案\nfeatures/cart/options/a.tsx:40:7  error  MISSING_ID  可操作元素 Button 缺少 id'}</Code>
        </Alert>,
        <Alert id="h_old_err" color="gray" title="找不到项目目录" when={eq($.ui.project, 'old')}>
          <Stack gap="sm">
            <Text size="sm">~/work/old-demo 已不存在。目录移动过的话，在新位置运行 npx joplo dev 就会重新加入。</Text>
            <Group>
              <Button id="h_remove" variant="default" size="xs">从列表移除</Button>
            </Group>
          </Stack>
        </Alert>,
      ],
    },
  },

  state: { ui: { project: 'invite', publish: false, noProjects: false, shopAdded: false, oldGone: false } },

  scenarios: {
    recent: flow('在首页切换项目并进入功能', { cases: ['recent'], start: '/board', expected: '左栏切项目，右侧换成该项目的功能' })
      .click('h_dist', '左栏点「Joplo 分发」，右侧换成它的两个功能', set($.ui.project, 'dist'), uses('remember'))
      .click('h_invite', '切回「团队邀请功能」', set($.ui.project, 'invite'))
      .click('h_view_invite', '点「查看」进入这个功能的演示页', done('进入演示页（见功能「演示页」）')),

    first_open: flow('第一次运行，没有项目', { cases: ['first_open'], start: '/board', state: { ui: { noProjects: true, project: '' } }, mock: '模拟 ~/.joplo/projects.json 为空' })
      .system('首次打开看板', '空状态直接给出三条开始命令', done('用户知道下一步运行什么')),

    second_dev: flow('另一个终端再运行 joplo dev', { cases: ['second_dev', 'compile_error'], start: '/board', mock: '模拟 ~/work/shop 有 2 个编译错误' })
      .system('另一个终端：cd ~/work/shop && npx joplo dev', '已有看板在运行：只注册项目，不再起进程',
        set($.ui.shopAdded, true), set($.ui.project, 'shop'), toast.info('已加入正在运行的看板：网店结算'), uses('one_process'))
      .click('h_invite', '其他项目不受影响，照常可看', set($.ui.project, 'invite'))
      .click('h_shop', '点回「网店结算」：错误还在，修好源文件后自动刷新', set($.ui.project, 'shop'), done('一个进程，多个项目')),

    stale: flow('记住的目录不见了', { cases: ['stale'], start: '/board', mock: '模拟 ~/work/old-demo 被删除' })
      .click('h_old', '点「旧原型」：说明目录不存在，给出两种做法', set($.ui.project, 'old'))
      .click('h_remove', '从列表移除这条记录', set($.ui.oldGone, true), set($.ui.project, 'invite'), toast('已从列表移除「旧原型」'), done('列表恢复干净')),

    publish_home: flow('观众打开发布站首页', { cases: ['publish_home'], start: '/board', state: { ui: { publish: true } }, mock: '发布站视图' })
      .click('h_view_invite', '观众只看到功能列表，点「查看」看演示', uses('no_local_info_on_site'), done('观众进入演示')),
  },
}), designRecords.home);
