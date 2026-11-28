import { $, eq } from '@joplo-app/kit';
import { Canvas, ItemTrack, Split } from '@joplo-app/plugin-content';
import {
  ArchNode,
  ArrayCell,
  ArrayStrip,
  BoardZone,
  Callout,
  ClusterBox,
  Database,
  FlowEdge,
  FlowNode,
  QueuePipe,
  Sequence,
  StickFigure,
} from '@joplo-app/plugin-diagram';
import {
  Alert,
  Badge,
  Card,
  ChatMessage,
  Code,
  Compare,
  DataCard,
  RingProgress,
  Stat,
  StateFlow,
  Terminal,
  ToolCall,
} from '@joplo-app/plugin-ui';
import { DeltaBar, TimeLanes } from '@joplo-app/plugin-viz';

export type MigrationUiState = {
  /** Ch1 */
  showProdReality: boolean;
  showEmojiDiff: boolean;
  /** Ch2 */
  shadowMode: 'naive' | 'replay';
  badEdgeTone: string;
  badEdgeLabel: string;
  billEdgeTone: string;
  billEdgeLabel: string;
  /** Ch3 */
  cpCheck: string;
  cpPy2: string;
  cpRs2: string;
  cpRs3: string;
  cpPtrPy: string;
  cpPtrRs2: string;
  cpPtrRs3: string;
  /** Ch4 */
  bugState: string;
  showSlackReject: boolean;
  showMemoryAlert: boolean;
  /** Ch5 */
  shipView: 'legacy' | 'parallel';
  cpuPct: number;
  memPct: number;
  ttftPct: number;
  cpuLabel: string;
  memLabel: string;
  ttftLabel: string;
  hudChapter: string;
};

export type BugTrackItem = { id: string; label: string; accent: string };

export const INITIAL_UI: MigrationUiState = {
  showProdReality: false,
  showEmojiDiff: false,
  shadowMode: 'naive',
  badEdgeTone: 'danger',
  badEdgeLabel: '再跑一次→回复不同',
  billEdgeTone: 'danger',
  billEdgeLabel: '风险：重复扣费',
  cpCheck: 'idle',
  cpPy2: 'idle',
  cpRs2: 'idle',
  cpRs3: 'idle',
  cpPtrPy: '',
  cpPtrRs2: '',
  cpPtrRs3: '',
  bugState: 'queued',
  showSlackReject: false,
  showMemoryAlert: false,
  shipView: 'legacy',
  cpuPct: 100,
  memPct: 100,
  ttftPct: 100,
  cpuLabel: '100（基线）',
  memLabel: '100（基线）',
  ttftLabel: '100（基线）',
  hudChapter: 'Anthropic Messages API · 从 Python 迁到 Rust 怎么验真',
};

export const INITIAL_FP = {
  step: '拼装 Prompt',
  piece: '第 2 段',
  firstDiff: '第 17 字节',
  python: '190 B',
  rust: '190 B（不含原文）',
};

export const INITIAL_BUGS: BugTrackItem[] = [
  { id: 'bug_a', label: '差异 A · 第 17 字节（挡住后面）', accent: '#dc2626' },
];

export const UNMASKED_BUGS: BugTrackItem[] = [
  { id: 'bug_b', label: '差异 B · 第 64 字节（新露出来）', accent: '#d97706' },
  { id: 'bug_c', label: '差异 C · 第 118 字节（新露出来）', accent: '#2231dd' },
];

const LEVERAGE_SPANS = [
  { id: 'sp_inner', lane: '亲自排障', start: 4, end: 5.4, label: '工程师亲自带着 Claude 查差异', status: 'warn' as const },
  { id: 'sp_seam', lane: '人工审 PR', start: 5.2, end: 7.6, label: '在 Slack 审 PR · 拦住临时捷径', status: 'info' as const },
  { id: 'sp_rules', lane: '沉淀规矩', start: 6.4, end: 9, label: 'CLAUDE.md 规范 · 改 Python 必改 Rust 检查', status: 'accent' as const },
  { id: 'sp_cutover', lane: '切流上线', start: 8.1, end: 9, label: '9 月公开流量全量切入 Rust', shortLabel: '零停服切流', status: 'ok' as const },
];

export function RustMigrationWorld() {
  return (
    <Canvas
      w={4960}
      h={3240}
      view={[1440, 900]}
      safe={[58, 28, 76, 28]}
      drift={{ zoom: 1.018, ms: 16000 }}
    >
      {/* Top-right subtle chapter indicator (stays clear of host top-left step badge) */}
      <div
        screen
        style={{
          position: 'absolute',
          right: 24,
          top: 14,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '5px 12px',
          borderRadius: 999,
          background: 'rgba(255,255,255,0.9)',
          border: '1px solid rgba(23,24,26,0.1)',
          fontSize: 12,
          fontWeight: 600,
          color: '#3f444d',
        }}
      >
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#2231dd' }} />
        <span>{$.ui.hudChapter}</span>
      </div>

      {/* ===================================================================
          ISLAND 1 · CH1: 测试全绿，线上却只对得上四分之一
          =================================================================== */}
      <BoardZone
        id="zone_1"
        x={120}
        y={110}
        w={1180}
        h={700}
        eyebrow="第一章 · 难的不是写，是验证"
        title="七百条测试过了九成八，为什么一接真实流量就翻车？"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Kinetic headline + key scale stats */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20 }}>
            <div style={{ fontSize: 22, fontWeight: 750, letterSpacing: '-0.02em', color: '#17181a' }}>
              <Split text="代码一周就写完了，难的是敢不敢切流量" enter="rise" />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <Badge color="blue" variant="light" size="lg">API 流量 2 年涨 1,800×</Badge>
              <Badge color="gray" variant="outline" size="lg">Claude 1 周重写核心路径</Badge>
            </div>
          </div>

          {/* Center: Dual RingProgress contrast + Stat anchors */}
          <div id="z1_rings" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.15fr', gap: 18, alignItems: 'stretch' }}>
            <Card id="card_test_ring" padding="md" withBorder>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <RingProgress
                  id="ring_tests"
                  size={128}
                  thickness={13}
                  sections={[{ value: 98, color: 'green' }]}
                  label="98%"
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <Badge color="green" variant="light">2026 年 4 月</Badge>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>集成测试通过率</div>
                  <div style={{ fontSize: 12.5, color: '#686c75' }}>约 700 条测试几乎全绿</div>
                </div>
              </div>
            </Card>

            <Card id="card_prod_ring" when={$.ui.showProdReality} enter="rise" padding="md" withBorder>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <RingProgress
                  id="ring_prod"
                  size={128}
                  thickness={13}
                  sections={[{ value: 25, color: 'red' }]}
                  label="25%"
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <Badge color="red" variant="light">真实线上流量</Badge>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>输入完全一致率</div>
                  <div style={{ fontSize: 12.5, color: '#686c75' }}>四分之三请求存在偏差</div>
                </div>
              </div>
            </Card>

            <div when={$.ui.showProdReality} enter="rise" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Stat
                id="stat_weak"
                label="审计查出被放宽的测试检查"
                value="> 100 条"
                diff="-不可信"
                color="red"
                description="测试跟实现一起改松，通过不代表真一致"
              />
              <Stat
                id="stat_combo"
                label="仅 20 个开关的组合数量"
                value="> 100 万"
                color="orange"
                description="每秒测 1 条也要跑 12 天，根本测不完"
              />
            </div>
          </div>

          {/* Bottom: Real concrete Emoji escape bug using native ui:Code */}
          <div id="z1_emoji_box" when={$.ui.showEmojiDiff} enter="rise" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Card id="code_py" padding="sm" withBorder>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>Python 线上输出（转义 Emoji）</span>
                <Badge color="blue" variant="light">以它为准</Badge>
              </div>
              <Code block color="blue">{`{"tool": "send_note", "text": "ship \\ud83d\\ude80"}`}</Code>
            </Card>
            <Card id="code_rs" padding="sm" withBorder>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>Rust 影子输出（原样 UTF-8）</span>
                <Badge color="red" variant="light">悄悄差几字节</Badge>
              </div>
              <Code block color="red">{`{"tool": "send_note", "text": "ship 🚀"}`}</Code>
            </Card>
          </div>
        </div>
      </BoardZone>

      {/* ===================================================================
          ISLAND 2A · CH2: 影子流量架构图（为什么必须「模型只跑一次」）
          =================================================================== */}
      <BoardZone
        id="zone_2_arch"
        x={1740}
        y={110}
        w={1340}
        h={700}
        eyebrow="第二章 · 让线上旧系统直接当裁判"
        title="影子流量：为什么必须「模型只跑一次」？"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', minHeight: 42 }}>
            <Callout
              id="z2_warn"
              when={eq($.ui.shadowMode, 'naive')}
              kind="warning"
              label="各跑各的模型行不通"
              detail="大模型每次回答本来就不完全一样，而且绝不能把客户额度扣两遍"
            />
            <Callout
              id="z2_ok"
              when={eq($.ui.shadowMode, 'replay')}
              kind="stamp"
              label="模型只跑一次 · 结果原样重放"
              detail="Python 调一次模型，把同一份 Token 流喂给 Rust，同时关掉 Rust 的扣费写入"
            />
          </div>

          <div
            id="z2_board"
            style={{
              position: 'relative',
              display: 'grid',
              gridTemplateColumns: '126px 1fr 224px',
              columnGap: 72,
              alignItems: 'center',
              minHeight: 490,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <StickFigure id="z2_user" pose="coding" label="客户请求" role="POST /messages" />
            </div>

            <div id="z2_center" style={{ display: 'flex', flexDirection: 'column', gap: 76 }}>
              <ClusterBox id="z2_prod_box" label="Python 线上主路（以它为准）" cloud="kubernetes" tone="info" badge="LIVE">
                <div style={{ display: 'flex', alignItems: 'center', gap: 74 }}>
                  <ArchNode id="z2_py_in" label="Python 输入处理" sub="校验 · Prompt · 分词 · 安全" icon="python" />
                  <ArchNode id="z2_claude" label="Claude 模型" sub="每次回复略有不同" kind="worker" fill="solid" metric="只跑 1 次" />
                  <ArchNode id="z2_py_out" label="Python 输出解析" sub="文本 · 思考 · 工具流" icon="python" />
                </div>
              </ClusterBox>

              <ClusterBox id="z2_shadow_box" label="Rust 影子比对路（用户无感知）" cloud="docker" tone="accent" badge="SHADOW">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 160, width: '100%' }}>
                  <ArchNode id="z2_rs_in" label="Rust 输入处理" sub="独立拼装 Prompt 对比" icon="rust" />
                  <ArchNode id="z2_rs_out" label="Rust 输出解析" sub="吃同一份 Token 流对比" icon="rust" />
                </div>
              </ClusterBox>
            </div>

            <Database
              id="z2_ledger"
              label="计费与限流账本"
              engine="postgres"
              role="primary"
              storage="严格只记 1 次"
            />

            <FlowEdge id="e_u_py" from="z2_user" to="z2_py_in" fromSide="right" toSide="left" route="ortho" label="主请求" />
            <FlowEdge id="e_u_rs" from="z2_user" to="z2_rs_in" fromSide="right" toSide="left" route="ortho" dashed label="镜像副本" />
            <FlowEdge id="e_py_model" from="z2_py_in" to="z2_claude" fromSide="right" toSide="left" route="straight" label="Prompt" />
            <FlowEdge id="e_model_py" from="z2_claude" to="z2_py_out" fromSide="right" toSide="left" route="straight" label="Token 流" />
            <FlowEdge
              id="e_rs_model_bad"
              from="z2_rs_in"
              to="z2_claude"
              fromSide="top"
              toSide="bottom"
              route="ortho"
              dashed
              label={$.ui.badEdgeLabel}
              tone={$.ui.badEdgeTone}
            />
            <FlowEdge id="e_replay" from="z2_claude" to="z2_rs_out" fromSide="bottom" toSide="top" route="ortho" label="原样重放 Token" tone="ok" />
            <FlowEdge id="e_py_bill" from="z2_py_out" to="z2_ledger" fromSide="right" toSide="left" route="ortho" label="记账 ×1" />
            <FlowEdge
              id="e_rs_bill"
              from="z2_rs_out"
              to="z2_ledger"
              fromSide="right"
              toSide="left"
              route="ortho"
              dashed
              label={$.ui.billEdgeLabel}
              tone={$.ui.billEdgeTone}
            />
          </div>
        </div>
      </BoardZone>

      {/* ===================================================================
          ISLAND 2B · CH2: 单次推理重放的精确时序（native <Sequence>）
          =================================================================== */}
      <BoardZone
        id="zone_2_seq"
        x={3540}
        y={110}
        w={1180}
        h={700}
        eyebrow="第二章 · 逐步时序"
        title="一次请求里，输入各自比、输出吃同一份 Token 流"
      >
        <Card padding="md" withBorder>
          <Sequence id="seq_replay" h={480}>
            <Sequence.Actor id="a_client" label="客户请求" kind="client" />
            <Sequence.Actor id="a_py" label="Python 主路" kind="service" />
            <Sequence.Actor id="a_model" label="Claude 模型" kind="model" />
            <Sequence.Actor id="a_rs" label="Rust 影子" kind="service" />
            <Sequence.Actor id="a_bill" label="计费账本" kind="database" />
            <Sequence.Message id="m_req" from="a_client" to="a_py" label="1. POST /v1/messages" />
            <Sequence.Message id="m_mirror" from="a_client" to="a_rs" label="2. 异步复制一份（比输入）" async />
            <Sequence.Message id="m_infer" from="a_py" to="a_model" label="3. 只跑这一次模型" />
            <Sequence.Message id="m_tok" from="a_model" to="a_py" label="4. 返回 Token 流" reply />
            <Sequence.Message id="m_replay" from="a_model" to="a_rs" label="5. 原样重放给 Rust（比输出）" async />
            <Sequence.Message id="m_bill" from="a_py" to="a_bill" label="6. 只由主路记账一次" />
          </Sequence>
        </Card>
      </BoardZone>

      {/* ===================================================================
          ISLAND 3 · CH3: 不看客户原文，如何捉出 Bug？
          =================================================================== */}
      <BoardZone
        id="zone_3"
        x={120}
        y={1180}
        w={1240}
        h={740}
        eyebrow="第三章 · 不看原文怎么查错"
        title="不读客户半个字，怎么精准定位并给 Bug 分类？"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 0.85fr', gap: 22, alignItems: 'start' }}>
            {/* Left: Dual checkpoint rails + masking reveal track */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <ArrayStrip id="rail_py" label="Python 检查点（标准答案）" meta="逐段比对">
                <ArrayCell value="校验" index="0" state={$.ui.cpCheck} />
                <ArrayCell value="配置" index="1" state={$.ui.cpCheck} />
                <ArrayCell id="cell_py_2" value="Prompt 第 2 段" index="2" pointer={$.ui.cpPtrPy} state={$.ui.cpPy2} />
                <ArrayCell value="分词" index="3" state="idle" />
                <ArrayCell value="安全" index="4" state="idle" />
              </ArrayStrip>

              <ArrayStrip id="rail_rs" label="Rust 检查点（遇第一处不同就停）" meta="定位代码位置">
                <ArrayCell value="校验" index="0" state={$.ui.cpCheck} />
                <ArrayCell value="配置" index="1" state={$.ui.cpCheck} />
                <ArrayCell id="cell_rs_2" value="Prompt 第 2 段" index="2" pointer={$.ui.cpPtrRs2} state={$.ui.cpRs2} />
                <ArrayCell id="cell_rs_3" value="分词" index="3" pointer={$.ui.cpPtrRs3} state={$.ui.cpRs3} />
                <ArrayCell value="安全" index="4" state="idle" />
              </ArrayStrip>

              <Card id="z3_track_box" padding="sm" withBorder>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 12.5, fontWeight: 650, color: '#525866' }}>
                  <span>一次只报第一处：修掉前面的 A，后面的 B、C 才露出来</span>
                  <Badge color="blue" variant="light">几十万条日志自动归成一类</Badge>
                </div>
                <ItemTrack
                  id="fp_track"
                  capacity={3}
                  items={$.data.activeBugs}
                  keyField="id"
                  labelField="label"
                  accentField="accent"
                  emptyLabel="待排查"
                />
              </Card>
            </div>

            {/* Right: Native DataCard + Terminal */}
            <div id="fp_bundle" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <DataCard
                id="fp_card"
                title="日志只记这 5 项特征（不含任何客户原文）"
                value={$.data.fp}
                fields={[
                  { key: 'step', label: '哪一步开始不同' },
                  { key: 'piece', label: 'Prompt 哪一段' },
                  { key: 'firstDiff', label: '第几个字节分叉' },
                  { key: 'python', label: 'Python 输出长度' },
                  { key: 'rust', label: 'Rust 输出长度' },
                ]}
              />
              <Terminal id="fp_term" title="shadow-diff-collector">
                <Terminal.Command>grep "piece:2 byte:17" shadow.log | wc -l</Terminal.Command>
                <Terminal.Output tone="warn">142,810 条同类差异 → 归并为 1 个排查任务（不含客户文本）</Terminal.Output>
              </Terminal>
            </div>
          </div>
        </div>
      </BoardZone>

      {/* ===================================================================
          ISLAND 4A · CH4: 三层校验闭环（程序化正交走线 + 菱形决策门 + StateFlow）
          =================================================================== */}
      <BoardZone
        id="zone_4_loops"
        x={1740}
        y={1180}
        w={1440}
        h={800}
        eyebrow="第四章 · 三层校验闭环"
        title="沙盒秒级试错 → 人工审 PR 把关 → 线上验真 → 沉淀规矩"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <StateFlow
            id="bug_lifecycle"
            value={$.ui.bugState}
            states={['queued', 'sandbox', 'pr_gate', 'shadow', 'memory']}
            labels={{
              queued: '差异归类',
              sandbox: '沙盒试错',
              pr_gate: '人工审 PR',
              shadow: '线上验真',
              memory: '沉淀规矩',
            }}
          />

          <div
            id="z4_board"
            style={{
              position: 'relative',
              display: 'grid',
              gridTemplateColumns: '270px 1fr 220px',
              gridTemplateRows: 'auto auto',
              columnGap: 84,
              rowGap: 92,
              alignItems: 'center',
            }}
          >
            {/* Col 1 Row 1: Queue + Coordinator */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <QueuePipe id="z4_queue" label="每 10–30 分钟归类差异" engine="kafka" partitions={4} messages={['#A17', '#WS0', '#B64']} />
              <ArchNode id="z4_coord" label="调度 Claude" sub="只给新差异派单并建 Slack 讨论串" icon="github" />
            </div>

            {/* Col 2 Row 1: Inner Sandbox Loop */}
            <ClusterBox id="z4_inner_box" label="内环 · 云端沙盒（不到 1 秒试错）" cloud="docker" tone="accent" badge="SECONDS">
              <div style={{ display: 'flex', alignItems: 'center', gap: 108, padding: '18px 4px' }}>
                <ArchNode id="z4_worker" label="修 Bug 的 Claude" sub="按特征猜原因 · 自己造复现用例" icon="rust" />
                <ArchNode id="z4_local" label="本地双版本校验" sub="免调模型测输入 · 假模型测输出" icon="python" metric="< 1s" fill="solid" />
              </div>
            </ClusterBox>

            {/* Col 3 Row 1: Human PR Gate Diamond */}
            <div id="z4_gate_col" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <StickFigure id="z4_eng" pose="admin" label="工程师审 PR" size={50} />
              <FlowNode id="d_pr" shape="decision" label="改得靠谱吗？" sub="人工 PR 把关" tone="warn" />
            </div>

            {/* Col 1-2 Row 2: Memory Loop */}
            <div style={{ gridColumn: '1 / 3' }}>
              <ClusterBox id="z4_mem_box" label="经验沉淀 · 每次人工纠偏都变成永久规矩" tone="ok" badge="COMPOUNDING">
                <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
                  <ArchNode id="z4_rules" label="CLAUDE.md 规范" sub="把 ~60 条评审意见整理成规矩" icon="git" fill="solid" />
                  <ArchNode id="z4_sweep" label="全库反查 + 同步检查" sub="查出 7 处同类遗漏 · 改 Python 必改 Rust" icon="github-actions" />
                </div>
              </ClusterBox>
            </div>

            {/* Col 3 Row 2: Outer Shadow Diamond + Node */}
            <div id="z4_outer_col" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <FlowNode id="d_zero" shape="decision" label="线上差异清零？" sub="拿同类真实流量对比" tone="info" />
              <ArchNode id="z4_shadow" label="线上影子灰度" sub="带修复 vs 未带修复" icon="prometheus" />
            </div>

            {/* Programmatically routed FlowEdges: clean corridor ortho tracks + auto-separated opposing curves */}
            <FlowEdge id="e_q_coord" from="z4_queue" to="z4_coord" fromSide="bottom" toSide="top" route="straight" label="新差异" />
            <FlowEdge id="e_coord_w" from="z4_coord" to="z4_worker" fromSide="right" toSide="left" route="ortho" label="派单" />
            <FlowEdge id="e_in_try" from="z4_worker" to="z4_local" fromSide="right" toSide="left" route="curve" label="自造请求" />
            <FlowEdge id="e_in_fb" from="z4_local" to="z4_worker" fromSide="left" toSide="right" route="curve" dashed label="秒级反馈" />
            <FlowEdge id="e_to_pr" from="z4_local" to="d_pr" fromSide="right" toSide="left" route="ortho" label="提交 PR" />
            <FlowEdge id="e_pr_out" from="d_pr" to="d_zero" fromSide="bottom" toSide="top" route="straight" label="批准上线对比" tone="ok" />
            <FlowEdge id="e_out_back" from="d_zero" to="z4_worker" fromSide="left" toSide="bottom" route="ortho" dashed label="还有差异→打回" tone="warn" />
            <FlowEdge id="e_pr_mem" from="d_pr" to="z4_rules" fromSide="left" toSide="top" route="ortho" label="驳回/纠偏→写规矩" tone="ok" />
            <FlowEdge id="e_mem_w" from="z4_rules" to="z4_worker" fromSide="top" toSide="bottom" route="ortho" dashed label="后续任务必读" tone="ok" />
          </div>
        </div>
      </BoardZone>

      {/* ===================================================================
          ISLAND 4B · CH4: 真实案例 — Slack PR 闸门驳回 Web Search 捷径（Figure 12）
          =================================================================== */}
      <BoardZone
        id="zone_4_slack"
        x={3540}
        y={1180}
        w={980}
        h={740}
        eyebrow="第四章 · 真实审 PR 案例"
        title="为什么沙盒 100% 通过了，工程师还要驳回它？"
      >
        <Card id="slack_thread" padding="lg" withBorder>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 14, fontWeight: 750 }}>#rust-migration-triage · web_search 工具说明缺失</span>
              <Badge color="orange" variant="light">5 月中旬真实案例</Badge>
            </div>

            <ChatMessage from="assistant" name="修 Bug 的 Claude">
              找到原因了：Python 会去内部服务拉取 web_search 的工具说明，Rust 还没接这个接口。我先把说明文案拷贝进本地静态文件，Prompt 已经完全一致。
            </ChatMessage>

            <ToolCall title="local_dual_check · 沙盒双版本校验（0.6s）" state="done">
              Python vs Rust Prompt diff: 0 bytes · 回归测试全部通过
            </ToolCall>

            <div when={$.ui.showSlackReject} enter="rise">
              <ChatMessage from="user" name="工程师 · 审 PR">
                驳回。校验器只看结果一不一样，不管代码能不能上线。正式发布前 Rust 必须真正去调那个内部服务，这种硬拷贝的临时捷径早晚要扔，不能合。
              </ChatMessage>
            </div>

            <Alert
              id="alert_mem_saved"
              when={$.ui.showMemoryAlert}
              enter="rise"
              color="green"
              title="这条驳回立刻写进团队规范"
            >
              记下正确做法（接内部服务）后，之后同类差异再冒出来，新任务会自动认出这是已知问题并关联原工单，不再重复写临时捷径。
            </Alert>
          </div>
        </Card>
      </BoardZone>

      {/* ===================================================================
          ISLAND 5A · CH5: 旧路 vs 新路（可交互 Compare）
          =================================================================== */}
      <BoardZone
        id="zone_5_ship"
        x={120}
        y={2280}
        w={1160}
        h={640}
        eyebrow="第五章 · 不停服换新系统"
        title="不是一边航行一边拆木板，而是并行造出一艘一模一样的新船"
      >
        <Card padding="lg" withBorder>
          <Compare id="z5_cmp" value={$.ui.shipView} mode="toggle">
            <Compare.Side value="legacy" label="旧做法：一点点局部重写">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, paddingTop: 8 }}>
                <Stat label="每个 Token 跨语言来回折腾" value="3 次" diff="-开销大" color="red" description="Python 和 Rust 之间反复来回传对象" />
                <Stat label="实测 CPU 省下来的比例" value="8% – 10%" color="orange" description="省下的算力远抵不上维护两套混写的成本" />
              </div>
            </Compare.Side>
            <Compare.Side value="parallel" label="新做法：拿线上旧系统实时对照，并行重写">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, paddingTop: 8 }}>
                <Stat label="业务停服与需求冻结" value="0 天" diff="+照常迭代" color="green" description="旧系统照常上新模型，AI 自动帮新系统跟齐" />
                <Stat label="线上全量切流时间" value="2026 年 9 月" diff="+验证通过" color="blue" description="分批切真实流量，用户全程无感" />
              </div>
            </Compare.Side>
          </Compare>
        </Card>
      </BoardZone>

      {/* ===================================================================
          ISLAND 5B · CH5: 实测性能红利（@joplo-app/plugin-viz <DeltaBar> + 3 <Stat>）
          =================================================================== */}
      <BoardZone
        id="zone_5_metrics"
        x={1740}
        y={2280}
        w={1280}
        h={680}
        eyebrow="第五章 · 实测生产收益"
        title="切到 Rust 后，资源消耗与响应延迟同步大幅下降（Python 线上基线 = 100%）"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <Card id="card_chart" padding="lg" withBorder>
            <DeltaBar
              id="perf_chart"
              unit="%"
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              lowerIsBetter
              baselineLabel="Python 基准"
              items={[
                { id: 'delta_cpu', label: '单请求 CPU', sub: '单区域 7 日均值', baseline: 100, value: $.ui.cpuPct as unknown as number, deltaLabel: '−70%', note: 'Python 100% → Rust 30%' },
                { id: 'delta_mem', label: '单请求内存', sub: '全生产环境均值', baseline: 100, value: $.ui.memPct as unknown as number, deltaLabel: '−80%+', note: 'Python 100% → Rust <20%' },
                { id: 'delta_ttft', label: '中位首字延迟 TTFT', sub: 'Claude Code 线上请求', baseline: 100, value: $.ui.ttftPct as unknown as number, deltaLabel: '−20%', note: 'Python 100% → Rust 80%' },
              ]}
            />
          </Card>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 14 }}>
            <Stat id="st_cpu" label="单请求 CPU" value={$.ui.cpuLabel} diff="-70%" color="blue" description="单区域 7 日均值" />
            <Stat id="st_mem" label="单请求内存" value={$.ui.memLabel} diff="-80%+" color="green" description="全生产环境均值" />
            <Stat id="st_ttft" label="中位首字延迟 TTFT" value={$.ui.ttftLabel} diff="-20%" color="teal" description="Claude Code 线上请求" />
          </div>
        </div>
      </BoardZone>

      {/* ===================================================================
          ISLAND 5C · CH5: 工程师分工变化（@joplo-app/plugin-viz <TimeLanes>）
          =================================================================== */}
      <BoardZone
        id="zone_5_timeline"
        x={3460}
        y={2280}
        w={1240}
        h={640}
        eyebrow="第五章 · 工程师角色的变化"
        title="2026 年 4–9 月：工程师从亲自改代码，转向写规矩和审 PR"
      >
        <Card padding="lg" withBorder>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#17181a' }}>从「亲自帮 Claude 修差异」→「写清规矩、把关 PR」</span>
              <Badge color="green" variant="light">人负责定什么叫「对」</Badge>
            </div>
            <TimeLanes id="z5_lanes" domain={[4, 9]} unit="月" ticks={[4, 5, 6, 7, 8, 9]} spans={LEVERAGE_SPANS} />
          </div>
        </Card>
      </BoardZone>
    </Canvas>
  );
}
