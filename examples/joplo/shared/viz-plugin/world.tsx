import { $, eq, not, patch } from '@joplo-app/kit';
import { Canvas } from '@joplo-app/plugin-content';
import { ArchNode, Callout, ClusterBox, FlowEdge } from '@joplo-app/plugin-diagram';
import {
  BarChart,
  DeltaBar,
  Heatmap,
  LineChart,
  Radar,
  RatioBar,
  Sankey,
  ScatterPlot,
  TimeLanes,
  Waterfall,
} from '@joplo-app/plugin-viz';
import {
  DELTA_DROPPED_PATCH,
  FONT_MONO,
  FONT_SANS,
  HEAT_MATRIX,
  HEAT_TOKENS,
  LANE_PHASES,
  LANE_SPANS,
  LOOP_SPECS,
  MLA_BAR_DATA,
  RADAR_AXES,
  SANKEY_LINKS,
  SANKEY_NODES,
  TREND_DATA,
  VIZ_PALETTE as P,
  WATERFALL_STEPS,
  type DeltaViewMode,
  type LaneFocus,
  type LoopCount,
} from './data.ts';

const at = (x: number, y: number, w?: number, h?: number) => ({
  position: 'absolute' as const,
  left: x,
  top: y,
  ...(w !== undefined ? { width: w } : {}),
  ...(h !== undefined ? { height: h } : {}),
});

const pillStyle = () => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 12px',
  borderRadius: 999,
  fontSize: 12.5,
  fontWeight: 700,
  textDecoration: 'none',
  cursor: 'pointer',
  border: `1px solid ${P.lineStrong}`,
  background: P.surface,
  color: P.ink2,
  whiteSpace: 'nowrap' as const,
});

const cardStyle = {
  padding: '24px 28px',
  borderRadius: 16,
  background: P.surface,
  border: `1px solid ${P.line}`,
  boxSizing: 'border-box' as const,
};

const zoneEyebrow = (tag: string, title: string, right?: any) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 18 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
      <span
        style={{
          padding: '4px 10px',
          borderRadius: 999,
          background: P.accentSoft,
          color: P.accent,
          fontSize: 12,
          fontWeight: 800,
          letterSpacing: 0.3,
          whiteSpace: 'nowrap',
        }}
      >
        {tag}
      </span>
      <span style={{ fontSize: 21, fontWeight: 850, color: P.ink, letterSpacing: -0.3, whiteSpace: 'nowrap' }}>
        {title}
      </span>
    </div>
    {right}
  </div>
);

export function VizPluginWorld() {
  const setDeltaView = (mode: DeltaViewMode) =>
    patch($.ui, {
      deltaView: mode,
      deltaVariant: mode === 'paired' ? 'paired' : 'ghost',
    });
  const triggerDeltaDrop = () => patch($.ui, DELTA_DROPPED_PATCH);
  const setLoop = (k: LoopCount) =>
    patch($.ui, {
      loopCount: k,
      loopDepthVal: LOOP_SPECS[k].depthVal,
      loopAccVal: LOOP_SPECS[k].accVal,
    });
  const setLanePhase = (focus: LaneFocus) =>
    patch($.ui, {
      laneFocus: focus,
      laneCursor: LANE_PHASES[focus].cursor,
      laneCursorLabel: LANE_PHASES[focus].label,
    });

  return (
    <Canvas
      w={5160}
      h={3320}
      view={[1440, 900]}
      safe={[64, 34, 88, 34]}
      bg={P.paper}
      drift={{ zoom: 1.014, ms: 16000 }}
    >
      {/* 顶右极简阶段标尺 */}
      <div
        screen
        style={{
          position: 'absolute',
          right: 26,
          top: 14,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '5px 12px',
          borderRadius: 999,
          background: 'rgba(255,255,255,0.92)',
          border: `1px solid ${P.line}`,
          fontFamily: FONT_SANS,
          fontSize: 12,
          fontWeight: 650,
          color: P.ink2,
        }}
      >
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: P.accent }} />
        <span>{$.ui.hudNote}</span>
      </div>

      {/* =====================================================================
          ZONE 1（左上）· 真实 <DeltaBar> vs 旧 RatioBar 误用反例
          ===================================================================== */}
      <div id="zone_delta" style={{ ...at(140, 110, 1300, 710), fontFamily: FONT_SANS }}>
        {zoneEyebrow(
          '01 · DeltaBar',
          '替换旧 RatioBar：用幽灵基线与就地差值讲清性能收益',
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <a id="ctl_old" onClick={setDeltaView('old')} style={pillStyle()}>
              <span when={eq($.ui.deltaView, 'old')} style={{ color: P.danger }}>●</span>
              <span>旧 RatioBar 反例</span>
            </a>
            <a id="ctl_ghost" onClick={setDeltaView('ghost')} style={pillStyle()}>
              <span when={eq($.ui.deltaView, 'ghost')} style={{ color: P.accent }}>●</span>
              <span>新 · 幽灵轮廓</span>
            </a>
            <a id="ctl_paired" onClick={setDeltaView('paired')} style={pillStyle()}>
              <span when={eq($.ui.deltaView, 'paired')} style={{ color: P.accent }}>●</span>
              <span>备选 · 双条并列</span>
            </a>
            <a id="ctl_drop" onClick={triggerDeltaDrop()} style={{ ...pillStyle(), borderColor: P.okBorder, color: P.ok }}>
              <span>▶ 触发 Rust 切流</span>
            </a>
          </div>,
        )}

        {/* 旧版 RatioBar 误用反例（静态示意，说明为何要移出 ui 并引入 DeltaBar） */}
        <div
          id="panel_old_ratio"
          when={eq($.ui.deltaView, 'old')}
          enter="fade"
          style={{ ...cardStyle, border: `1.5px solid ${P.dangerSoft}`, display: 'flex', flexDirection: 'column', gap: 24 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: P.danger }}>历史痛点 · 曾用旧 RatioBar 硬套前后性能降幅</span>
            <span style={{ fontSize: 12.5, fontFamily: FONT_MONO, color: P.muted }}>baseline = 100 · left = 100（变化前这一帧）</span>
          </div>

          <div
            id="old_ratio_row"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: 20,
              padding: '22px 20px',
              borderRadius: 12,
              background: P.paper,
              border: `1px solid ${P.line}`,
            }}
          >
            {[
              { name: '单请求 CPU', spoil: '节省 ~70%' },
              { name: '单请求内存', spoil: '节省 80%+' },
              { name: '中位 TTFT', spoil: '降低 ~20%' },
            ].map((item) => (
              <div key={item.name} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ height: 18, borderRadius: 4, background: '#1c7ed6' }} />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 12.5, color: P.ink2, fontFamily: FONT_MONO }}>
                  <span>■ {item.name} 100% / 100%</span>
                  <span style={{ color: P.muted }}>■ {item.spoil} 0% / 100%</span>
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16 }}>
            {[
              { title: '① 语义错配', body: 'RatioBar 是“整体 100% 拆分”，拿来画“旧值→新值”强行出现重复的 100% / 100%' },
              { title: '② 基准态提前穿帮', body: '还没切流降下来，图例就写着「节省 ~70% 0% / 100%」，前后矛盾' },
              { title: '③ 3 槽色数组陷阱', body: '单值传 [blue, green] 时 remainder 在第 3 槽，绿色被吃成灰块' },
            ].map((item, idx) => (
              <div key={idx} style={{ padding: '14px 16px', borderRadius: 10, background: P.dangerSoft, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: P.danger }}>{item.title}</span>
                <span style={{ fontSize: 13, lineHeight: 1.5, color: P.ink2 }}>{item.body}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 真实 @joplo-app/plugin-viz <DeltaBar>（支持 ghost / paired 一键切换 + focusDatum） */}
        <div id="panel_new_delta" when={not(eq($.ui.deltaView, 'old'))} enter="fade" style={{ ...cardStyle, padding: '28px 34px 32px' }}>
          <DeltaBar
            id="viz_delta"
            title="单请求实测资源与延迟 · @joplo-app/plugin-viz"
            subtitle="共享零基线 · Python 线上基线 = 100%（单元素真实 width 收缩，零 FLIP 文字拉伸）"
            variant={$.ui.deltaVariant}
            unit="%"
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            lowerIsBetter
            baselineLabel="Python"
            afterLabel="Rust"
            items={[
              { id: 'delta_cpu', label: '单请求 CPU', sub: '核心计算时间', baseline: 100, value: $.ui.cpuVal as unknown as number, deltaLabel: '−70%', note: 'Python 100% → Rust 30%' },
              { id: 'delta_mem', label: '单请求内存', sub: '常驻堆内存峰值', baseline: 100, value: $.ui.memVal as unknown as number, deltaLabel: '−80%+', note: 'Python 100% → Rust <20%' },
              { id: 'delta_ttft', label: '中位 TTFT', sub: '首字响应延迟', baseline: 100, value: $.ui.ttftVal as unknown as number, deltaLabel: '−20%', note: 'Python 100% → Rust 80%' },
            ]}
          />
        </div>
      </div>

      {/* =====================================================================
          ZONE 2（中上）· 真实 <BarChart>（量级堆叠 + 锁定不变量）
          ===================================================================== */}
      <div id="zone_bar" style={{ ...at(1900, 110, 1320, 710), fontFamily: FONT_SANS }}>
        {zoneEyebrow('02 · BarChart', '量级对比、堆叠构成与“锁定不变量”')}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.08fr', gap: 26, alignItems: 'stretch' }}>
          <div id="bar_scale" style={{ ...cardStyle, minHeight: 500, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <BarChart
              id="viz_bar_scale"
              title="单词 KV 缓存维度对比"
              subtitle="对数刻度 + 双段堆叠 + 直标落差（DeepSeek MLA）"
              data={MLA_BAR_DATA}
              dataKey="name"
              layout="stacked"
              scale="log"
              h={390}
              withLegend={false}
              series={[
                { name: 'core', label: '潜核维度', color: 'accent' },
                { name: 'rope', label: '位置签', color: 'warn' },
              ]}
            />
          </div>

          <div id="bar_invariant" style={{ ...cardStyle, minHeight: 500, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 18 }}>
            <div style={{ display: 'flex', gap: 10 }}>
              {(['1', '2', '4'] as const).map((k) => (
                <a key={k} id={`loop_${k}`} onClick={setLoop(k)} style={pillStyle()}>
                  <span when={eq($.ui.loopCount, k)} style={{ color: P.accent }}>●</span>
                  <span>{LOOP_SPECS[k].label}</span>
                </a>
              ))}
            </div>

            <BarChart
              id="viz_bar_inv"
              title="不变量锁定（locked=true）"
              subtitle="权重显存锁死不动，计算深度与多步推理准确率平滑伸长"
              orientation="horizontal"
              dataKey="metric"
              series={[{ name: 'val', color: 'accent' }]}
              data={[
                { id: 'bar_weights', metric: '模型权重显存', val: 38, locked: true, lockedLabel: 'LOCKED · 不变量', note: '始终 1.0×（参数共享）', color: 'ok' },
                { id: 'bar_depth', metric: '单字等效计算深度', val: $.ui.loopDepthVal, color: 'accent' },
                { id: 'bar_acc', metric: '多步推理准确率（%）', val: $.ui.loopAccVal, color: 'warn' },
              ]}
            />

            <div style={{ padding: '10px 14px', borderRadius: 10, background: P.paper, border: `1px solid ${P.line}`, fontSize: 13, fontWeight: 700, color: P.ink2 }}>
              <span when={eq($.ui.loopCount, '1')}>{LOOP_SPECS['1'].caption}</span>
              <span when={eq($.ui.loopCount, '2')}>{LOOP_SPECS['2'].caption}</span>
              <span when={eq($.ui.loopCount, '4')}>{LOOP_SPECS['4'].caption}</span>
            </div>
          </div>
        </div>
      </div>

      {/* =====================================================================
          ZONE 3（右上）· 真实 <RatioBar> + 真实 <LineChart>（revealTo）
          ===================================================================== */}
      <div id="zone_ratio_line" style={{ ...at(3660, 110, 1240, 710), fontFamily: FONT_SANS }}>
        {zoneEyebrow('03 · RatioBar & LineChart', '占比条回归部分-整体，折线图按拍展开并直达拐点')}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div id="viz_ratio_box" style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 18 }}>
            <RatioBar
              id="ratio_test"
              total={100}
              left={98}
              labels={['集成测试通过率（700 条进程内 Mock）']}
              remainderLabel="未通过"
              colors={['ok', 'muted']}
              unit="%"
            />
            <div when={$.ui.showProdRatio} enter="rise">
              <RatioBar
                id="ratio_prod"
                total={100}
                left={25}
                threshold={99}
                labels={['真实线上流量 · 输入完全一致']}
                remainderLabel="存在静默或显式差异"
                thresholdLabel="上线门槛"
                colors={['accent', 'danger']}
                unit="%"
              />
            </div>
          </div>

          <div id="viz_line_box" style={cardStyle}>
            <LineChart
              id="viz_line"
              title="线上影子差异率收敛曲线（4–9 月）"
              subtitle="SVG 曲线 + HTML 文字零拉伸 · revealTo() 按拍展开 · 逐点 data-jid 可寻址"
              data={TREND_DATA}
              dataKey="month"
              unit="%"
              curve="monotone"
              h={235}
              yDomain={[0, 80]}
              referenceLine={{ value: 0.1, label: '上线门槛 < 0.1%', color: 'ok' }}
              series={[{ name: 'diff', label: '线上差异率', color: 'accent', area: true }]}
            />
          </div>
        </div>
      </div>

      {/* =====================================================================
          ZONE 4（左中）· 真实 <TimeLanes>（竖向刻度 + 推进游标 + 窄条自动外挂标签）
          ===================================================================== */}
      <div id="zone_lanes" style={{ ...at(140, 1180, 1340), fontFamily: FONT_SANS }}>
        {zoneEyebrow(
          '04 · TimeLanes',
          '从 diagram 迁入：补齐竖向刻度、推进游标与窄条外挂标签',
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <a id="lane_t1" onClick={setLanePhase('inner')} style={pillStyle()}>
              <span when={eq($.ui.laneFocus, 'inner')} style={{ color: P.warn }}>●</span>
              <span>4–5 月 · 内环</span>
            </a>
            <a id="lane_t2" onClick={setLanePhase('rules')} style={pillStyle()}>
              <span when={eq($.ui.laneFocus, 'rules')} style={{ color: P.accent }}>●</span>
              <span>6–7 月 · 规则</span>
            </a>
            <a id="lane_t3" onClick={setLanePhase('cutover')} style={pillStyle()}>
              <span when={eq($.ui.laneFocus, 'cutover')} style={{ color: P.ok }}>●</span>
              <span>8–9 月 · 切流</span>
            </a>
          </div>,
        )}

        <div style={{ ...cardStyle, padding: '32px 36px 38px' }}>
          <TimeLanes
            id="viz_lanes"
            title="2026 年 4–9 月 · 工程师高杠杆迁移节奏"
            subtitle="窄条自动外挂完整标签零裁切 · setCursor() 与 focusDatum() 联动推进"
            domain={[4, 9]}
            unit="月"
            ticks={[4, 5, 6, 7, 8, 9]}
            cursor={$.ui.laneCursor}
            cursorLabel={$.ui.laneCursorLabel}
            spans={LANE_SPANS}
          />
        </div>
      </div>

      {/* =====================================================================
          ZONE 5（中）· 真实 <ScatterPlot>（自动帕累托前沿）+ 真实 <Heatmap>
          ===================================================================== */}
      <div id="zone_pareto_heat" style={{ ...at(1900, 1180, 1340, 740), fontFamily: FONT_SANS }}>
        {zoneEyebrow('05 · ScatterPlot & Heatmap', '一次性补齐：成本 vs 精度帕累托前沿 + 注意力热力矩阵')}

        <div style={{ display: 'grid', gridTemplateColumns: '1.08fr 0.92fr', gap: 26, alignItems: 'stretch' }}>
          <div id="viz_scatter_box" style={cardStyle}>
            <ScatterPlot
              id="viz_scatter"
              title="ScatterPlot · 模型成本 vs 代码准确率"
              subtitle="左上角最优象限 + 自动计算帕累托前沿折线"
              points={$.data.scatterPoints}
              pointIds={['pt_pareto_new']}
              xUnit="$"
              yUnit="%"
              xDomain={[0, 20]}
              yDomain={[65, 96]}
              pareto="top-left"
              quadrant={{ x: 10, y: 80, label: '高性价比区' }}
              h={360}
            />
          </div>

          <div id="viz_heat_box" style={cardStyle}>
            <Heatmap
              id="viz_heat"
              title="Heatmap · 注意力权重热力矩阵"
              subtitle="连续明度色阶 · 深格自动反白 · focusDatum 行/列/单格聚焦"
              rows={HEAT_TOKENS}
              cols={HEAT_TOKENS}
              values={HEAT_MATRIX}
              domain={[0, 0.65]}
              cornerLabel="Q \ K"
              cellAnchors={{ '4:2': 'heat_cell_rust_code' }}
            />
          </div>
        </div>
      </div>

      {/* =====================================================================
          ZONE 6（右中）· 真实 <Sankey> + <Waterfall> + <Radar>
          ===================================================================== */}
      <div id="zone_flow_attr" style={{ ...at(3660, 1180, 1320, 780), fontFamily: FONT_SANS }}>
        {zoneEyebrow('06 · Sankey / Waterfall / Radar', '一次性补齐：流向拆解、瀑布归因与多维能力轮廓')}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
          <div id="viz_sankey_box" style={cardStyle}>
            <Sankey
              id="viz_sankey"
              title="Sankey · 首周 100% 镜像请求去向分流"
              subtitle="d3-sankey 比例布局 + 三次贝塞尔 S 型流带 · focusDatum 单路高亮"
              nodes={SANKEY_NODES}
              links={SANKEY_LINKS}
              unit="%"
              h={220}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.05fr 0.95fr', gap: 26, alignItems: 'stretch' }}>
            <div id="viz_waterfall_box" style={cardStyle}>
              <Waterfall
                id="viz_waterfall"
                title="Waterfall · CPU 降耗 70% 归因阶梯"
                subtitle="100% 基线逐级拆解到 30% · revealTo() 逐步推进"
                steps={WATERFALL_STEPS}
                unit="%"
                lowerIsBetter
                h={270}
              />
            </div>

            <div id="viz_radar_box" style={cardStyle}>
              <Radar
                id="viz_radar"
                title="Radar · 新旧系统五维轮廓叠加"
                subtitle="五边形蛛网 + 刻度标尺 + 轴端新旧分值直标"
                axes={RADAR_AXES}
                series={$.data.radarSeries}
                levels={3}
                h={270}
              />
            </div>
          </div>
        </div>
      </div>

      {/* =====================================================================
          ZONE 7（下中）· 插件边界与编译期确定性快照架构图（@joplo-app/plugin-diagram）
          ===================================================================== */}
      <div id="zone_arch" style={{ ...at(1700, 2340, 1680, 740), fontFamily: FONT_SANS }}>
        {zoneEyebrow('07 · 架构边界与数据流', '1A 彻底搬家 + 2A D3 纯数学 + 十类图型统一编译期快照')}

        <div
          id="arch_board"
          style={{
            position: 'relative',
            display: 'grid',
            gridTemplateColumns: '260px 1fr 228px 1fr',
            columnGap: 92,
            alignItems: 'center',
            padding: '28px 28px',
            borderRadius: 18,
            background: P.surface,
            border: `1px solid ${P.line}`,
            minHeight: 540,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
            <ArchNode id="arch_ui" label="@joplo-app/plugin-ui" sub="已移出旧图 · 保留 Compare 与 UI" icon="react" />
            <ArchNode id="arch_diag" label="@joplo-app/plugin-diagram" sub="已移出泳道 · 专注拓扑与白板" icon="git" />
            <Callout id="arch_rule_1a" kind="badge" tone="info" label="1A · 彻底搬家" detail="十类图型已统一收口到 plugin-viz" />
          </div>

          <ClusterBox id="arch_compile" label="Node 编译期 · @joplo-app/plugin-viz" tone="accent" badge="COMPILE-TIME">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 36, padding: '12px 4px' }}>
              <ArchNode id="arch_node" label="compile.node + effect" sub="Zod 校验 · 解析 focusDatum / revealTo" icon="typescript" />
              <ArchNode id="arch_frame" label="compile.frame 快照" sub="读 previousState 自动算基线与差值" icon="node" fill="solid" metric="确定性" />
            </div>
          </ClusterBox>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, alignItems: 'stretch' }}>
            <ArchNode id="arch_ir" label="step.ext.viz" sub="10 类图型共享不可变快照" metric="纯 JSON" />
            <Callout id="arch_ir_note" kind="stamp" label="ZERO DRIFT" detail="跳步、倒放、--sheet / --film 像素级一致" />
          </div>

          <ClusterBox id="arch_rt" label="浏览器运行时 · ~25 KB" tone="ok" badge="2A · LIGHTWEIGHT">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 36, padding: '12px 4px' }}>
              <ArchNode id="arch_d3" label="d3-scale / shape / sankey" sub="纯数学比例尺、路径与流带布局" icon="vite" />
              <ArchNode id="arch_dom" label="宿主 motion + data-jid" sub="SVG 几何 + HTML 文字 · 联动 camera/callout" icon="react" fill="solid" metric="可寻址" />
            </div>
          </ClusterBox>

          <FlowEdge id="fe_ui_node" from="arch_ui" to="arch_node" fromSide="right" toSide="left" route="curve" bend={-14} label="移出 3 类旧图" />
          <FlowEdge id="fe_diag_node" from="arch_diag" to="arch_node" fromSide="right" toSide="left" route="curve" bend={16} label="移出 TimeLanes" />
          <FlowEdge id="fe_node_frame" from="arch_node" to="arch_frame" fromSide="bottom" toSide="top" route="straight" label="校验后降级" />
          <FlowEdge id="fe_frame_ir" from="arch_frame" to="arch_ir" fromSide="right" toSide="left" route="straight" label="写入快照" tone="accent" />
          <FlowEdge id="fe_ir_d3" from="arch_ir" to="arch_d3" fromSide="right" toSide="left" route="curve" bend={-14} label="只读渲染" tone="ok" />
          <FlowEdge id="fe_d3_dom" from="arch_d3" to="arch_dom" fromSide="bottom" toSide="top" route="straight" label="坐标映射" tone="ok" />
        </div>
      </div>
    </Canvas>
  );
}
