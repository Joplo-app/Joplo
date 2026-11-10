import { $, eq, flow, hold, layer, page, set, shot, type WorkDef } from '@joplo-app/kit';
import { Badge, Code, Group, Paper, Stack, Text, Title } from '@joplo-app/plugin-ui';
type Beat = { title: string; detail: string; code: string; status?: string };
const updates: Record<'voice' | 'film' | 'frames', { title: string; source: string; beats: Beat[] }> = {
  voice: { title: '只生成需要的声音，明确决定哪里安静', source: 'Issues #72 / #73 / #95 · 根据本轮源码整理', beats: [
    { title: '先预览作品或章节范围', detail: '作用域选择先列出待生成段落；章节接续依赖也计入范围。dry-run 不生成旁白，不证明已经有音频。', code: 'joplo voice --work <work-id> --dry-run\njoplo voice --scenario <scenario-id> --dry-run' },
    { title: '显式静音，不再意外回读字幕', detail: 'narrate(false) 阻止旁白、角色台词和字幕兜底；标题保留。空字符串仍是错误，不用它代表静音。', code: ".system('等待结果', narrate(false), hold(2))" },
    { title: '把提交前节奏与提交后停留分开', detail: 'systemLead 以秒控制系统步骤提交前等待；hold 只控制提交后停留，旁白仍可能延长整步。默认节奏继续兼容。', code: 'work({ pace: { systemLead: 0 }, … })\n// 默认提交前等待仍为 0.9 秒' },
  ] },
  frames: { title: '设计画幅与输出像素，分别声明', source: 'Issues #75 / #77 / #79 / #87 · 根据本轮源码整理', beats: [
    { title: '先声明真正的逻辑舞台', detail: '竖屏世界不再仅靠缩小横屏舞台。逻辑画幅统一布局、镜头与固定叠层；输出 width / height 只决定成片分辨率。', code: 'joplo render --scenario-id <id> --viewport 720x1280\n  --width 1080 --height 1920 --no-frame --out frame.png' },
    { title: '让 Canvas 持有自己的取景', detail: 'Diagram 的 trace 可只高亮，不额外推近宿主；scale 放大节点和字形，仍受容器约束。双画幅都为宿主角标和旁白条留空。', code: "trace('source', 'result', { focus: false })\n<Diagram scale={2} h=\"100%\">…</Diagram>" },
  ] },
  film: { title: '用实际播放证据审片，再决定是否发布', source: 'Issues #76–#84 / #86 / #93 / #94 · 根据本轮源码整理', beats: [
    { title: '时间轴来自实际提交与旁白事件', detail: '逐帧序列使用累计帧目标时间；timeline 同时保存章节、步骤、媒体与旁白事件。它与 outline 的估算时长不同。', code: 'joplo render --scenario-id <id> --frames-out frames\n  --fps 30 --timeline timeline.json' },
    { title: '长作品按章节保存可恢复检查点', detail: '首次导出不加 --resume。恢复时仍重放引擎以恢复状态，复用经验证的已完成分析；输入或取景条件变化应拒绝旧检查点，不把恢复说成任意逐帧跳入。', code: 'joplo render --scenario-id <id> --film --chain\n  --checkpoint film.checkpoint.json --resume --out film.png' },
    { title: '素材引用分成三种证据', detail: '源码引用、所选发布范围入包、采样画面实际可见并不等价。动态路径与未知可见性明确标未知；报告只读，不删除、不上传。', code: 'joplo assets --usage --scan assets\n  --work <work-id> --format json' },
    { title: '版面审查仍在实现，发布仍是独立步骤', detail: '实际几何采样的版面审查正在实现与验收，不冒称 check 已保证无溢出。Cloud reader 与 npm 尚未发布；本轮截图也不是生产验收。', code: '本轮：本地源码与测试证据\n待验收：版面审查\n未执行：Cloud 部署 / npm 发行', status: '实现中 / 未发布' },
  ] },
};
/** Curated source-derived workflow, not a fabricated approval or live CLI result. */
export function withProductionUpdate(definition: WorkDef, kind: keyof typeof updates): WorkDef {
  const update = updates[kind];
  const scenario = flow('本轮能力 · 根据源码整理', { ...(definition.layers ? { layer: 'source_update' } : { start: '/production-update' }), mock: '根据本轮 issue 与实现源码整理；命令只展示，不执行、不生成付费资源、不上传', expected: '区分本地已实现、实现中和未发布，不伪造人工批准' });
  for (const [i, beat] of update.beats.entries()) scenario.system(beat.title, set($.ui.sourceUpdate, i), shot('source-update-root'), hold(1)).key(`source-update-${kind}-${i + 1}`);
  const view = <Stack id="source-update-root" p={40} gap={20} style={{ paddingTop: 65, paddingBottom: 85, height: 700, boxSizing: 'border-box' }}>
      <Group gap="sm"><Badge color="blue">根据源码整理</Badge><Badge color="gray">本地已实现 ≠ 已上线</Badge></Group>
      <Title order={2}>{update.title}</Title><Text size="sm" c="dimmed">{update.source}</Text>
      {update.beats.map((beat, i) => <Paper key={i} when={eq($.ui.sourceUpdate, i)} withBorder p="xl" radius="lg">
        <Stack gap="md"><Group><Badge color={beat.status ? 'orange' : 'teal'}>{beat.status ?? '本地实现与测试'}</Badge><Text size="sm">{i + 1} / {update.beats.length}</Text></Group>
          <Title order={3}>{beat.title}</Title><Text size="xl">{beat.detail}</Text><Code block>{beat.code}</Code>
        </Stack>
      </Paper>)}
      <Text size="sm" c="dimmed">保留既有方案与待决问题。此整理稿不新增人工批准，也不代表已生成旁白、已上传或已发行。</Text>
    </Stack>;
  return { ...definition,
    state: { ...definition.state, ui: { ...definition.state?.ui, sourceUpdate: 0 } },
    ...(definition.layers ? { layers: { ...definition.layers, source_update: layer('本轮源码能力', view) } } : { routes: { ...definition.routes, '/production-update': page({ title: update.title, layout: false }, view) } }),
    scenarios: { ...definition.scenarios, source_update: scenario },
  };
}
