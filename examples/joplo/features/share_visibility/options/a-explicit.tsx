import { $, done, eq, flow, layer, not, option, set } from '@joplo-app/kit';
import { Alert, Anchor, Badge, Button, Group, Paper, Stack, Text, Title } from '@joplo-app/kit/ui';
import { withDesignRecord } from '../../../shared/design/record.ts';
import { designRecords } from '../../../shared/design/records.ts';
const initial = { visibility: 'public', review: false, scoped: false, result: false };
const panel = <Stack p="xl" gap="lg" maw={760} mx="auto">
  <Title order={2}>发布到 Joplo Cloud</Title>
  <Text c="dimmed">已用 38 MB / 100 MB · 链接永久有效</Text>
  <Paper withBorder p="lg"><Stack gap="md">
    <Text fw={600}>可见性</Text>
    <Group when={not($.ui.scoped)}>
      <Button id="vis_public" variant="light" color="blue">公开</Button>
      <Button id="vis_private" variant="light">私密</Button>
      <Badge>{$.ui.visibility}</Badge>
    </Group>
    <Text when={eq($.ui.visibility, 'public')}>公开：进入作品集 show.joplo.app/@用户名，并被搜索引擎收录。</Text>
    <Text when={eq($.ui.visibility, 'private')}>私密：只有拿到链接的人能看。</Text>
    <Alert color="blue" when={$.ui.scoped}>当前场景 · 公开不可选：保密范围分享始终私密。</Alert>
    <Button id="vis_review" variant="subtle">同时发评审版</Button>
    <Text when={$.ui.review}>✓ 包含所有方案，可评论；评审链接始终私密。</Text>
    <Button id="vis_publish" color="blue">发布</Button>
  </Stack></Paper>
  <Paper id="vis_result" withBorder p="lg" when={$.ui.result}><Stack gap="sm">
    <Text fw={700} c="green">✓ 已发布 · {$.ui.visibility}</Text>
    <Text>主分享：joplo.app/s/作品链接/</Text>
    <Text when={$.ui.review}>独立私密评审版：joplo.app/s/评审链接/</Text>
    <Anchor id="vis_portfolio" when={eq($.ui.visibility, 'public')} href="https://show.joplo.app/@demo" unmodeled>查看作品集 ↗</Anchor>
    <Text when={eq($.ui.visibility, 'public')}>分享播放器：创作者 · 更多作品 ↗</Text>
  </Stack></Paper>
</Stack>;
export default withDesignRecord(option({
  name: '明确可见性，分开主分享与评审链接',
  idea: '在发布动作旁写出公开的传播范围，保密范围直接禁用公开；两个链接在结果里分开标明',
  layers: { publish: layer('发布浮层', panel) },
  state: { ui: initial },
  scenarios: {
    public: flow('公开整个项目', { start: '/', cases: ['public'], expected: '作品进入作品集，观众能找到作者其他作品' })
      .click('vis_public', '整个项目选择公开，发布前就知道会被搜索引擎收录', set($.ui.visibility, 'public'))
      .click('vis_publish', '公开发布后给出作品入口', set($.ui.result, true), done('公开作品已发布')),
    review: flow('私密与独立评审版', { start: '/', cases: ['review'], expected: '结果是两条链接，评审链接独立且私密' })
      .click('vis_private', '只有拿到链接的人能看', set($.ui.visibility, 'private'))
      .click('vis_review', '另外给评审者全部方案', set($.ui.review, true))
      .click('vis_publish', '主分享与评审版分别发布，两条链接都私密', set($.ui.result, true), done('主分享与评审版已发布')),
    scoped: flow('保密范围不允许公开', { start: '/', cases: ['scoped'], state: { ui: { ...initial, visibility: 'private', scoped: true } }, expected: '没有公开入口，只发布当前场景' })
      .click('vis_publish', '只发布当前场景，其他内容在构建时裁掉', set($.ui.result, true), done('保密范围已私密发布')),
    update: flow('沿用已有链接的私密状态', { start: '/', cases: ['update'], state: { ui: { ...initial, visibility: 'private' } }, expected: '保持私密，更新同一个链接' })
      .click('vis_private', '已有链接默认沿用私密，创作者可以明确修改', set($.ui.visibility, 'private'))
      .click('vis_publish', '更新原链接，仍然只有持有链接的人能看', set($.ui.result, true), done('已更新，保持私密')),
  },
}), designRecords.share_visibility);
