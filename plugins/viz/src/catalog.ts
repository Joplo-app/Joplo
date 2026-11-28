import type { PluginInspectField } from '@joplo-app/kit/plugin';

export const COMPONENT_TYPES = [
  'DeltaBar',
  'BarChart',
  'RatioBar',
  'LineChart',
  'TimeLanes',
  'ScatterPlot',
  'Heatmap',
  'Sankey',
  'Waterfall',
  'Radar',
] as const;

export type VizComponentName = (typeof COMPONENT_TYPES)[number];

export const COMPONENT_DOCS: Record<VizComponentName, string> = {
  DeltaBar:
    'items: [{ id?, label, sub?, baseline?, value, deltaLabel?, note?, color?, lowerIsBetter? }], variant="ghost"|"paired", domain?, unit?="%", lowerIsBetter?, ticks?, title?, subtitle?. Before-vs-after metric comparison with ghost baseline outline, curtain-uncover retract animation, and direct delta pills. Supports pinBaseline() and focusDatum().',
  BarChart:
    'data: [{ id?, [dataKey], [series], locked?, lockedLabel?, deltaBadge?, note?, color? }], dataKey, series: [{ name, label?, color? }], orientation="vertical"|"horizontal", layout="grouped"|"stacked", scale="linear"|"log", unit?, referenceLine?, directLabels?=true, withLegend?, h?. Zero-stretch labels and invariant lock pins.',
  RatioBar:
    'total, left, optional right or segments: [{ id?, label?, value, color? }], threshold?, labels?, remainderLabel?, thresholdLabel?, colors?, unit?, height?, showDenominator?=false. Part-of-a-whole ratio and threshold bar; clean single-value formatting by default.',
  LineChart:
    'data: [{ id?, [dataKey], [series] }], dataKey, series: [{ name, label?, color?, area?, dashed? }], unit?, yDomain?, curve="linear"|"monotone", referenceLine?, referenceBand?, revealTo?, directLabels?=true, withLegend?, h?. Crisp SVG paths with zero-stretch HTML labels, progressive revealTo(), and addressable points.',
  TimeLanes:
    'domain: [min, max], spans: [{ id, lane, start, end, label?, shortLabel?, rangeLabel?, status?, color? }], unit?="ms", ticks?, cursor?, cursorLabel?, spanIds?, compact?. Full tick gridlines, animated playhead via setCursor(), focusDatum() lane dimming, and automatic external labels for narrow bars.',
  ScatterPlot:
    'points: [{ id?, label, x, y, r?, group?, tier?, color?, valueLabel? }], xLabel?, yLabel?, xUnit?, yUnit?, xDomain?, yDomain?, pareto?="top-left"|"top-right"|"bottom-left"|"bottom-right"|false, quadrant?, h?. 2D trade-off scatter plot with automatic Pareto frontier polyline and addressable points.',
  Heatmap:
    'rows: string[], cols: string[], values: number[][], domain?, colorScale="indigo"|"emerald"|"amber"|"crimson"|"diverging", format="fixed2"|"percent"|"int", cornerLabel?, showScale?=true, cellAnchors?. High-contrast matrix with automatic dark-cell white text and row/col/cell focusDatum().',
  Sankey:
    'nodes: [{ id, label, sub?, valueLabel?, color?, tone? }], links: [{ id?, source, target, value, label?, color? }], unit?, nodeWidth?, nodePadding?, h?. Proportional d3-sankey layout with cubic-Bezier curved ribbons and single-path focusDatum().',
  Waterfall:
    'steps: [{ id?, label, value, kind?="start"|"delta"|"subtotal"|"total", deltaLabel?, color? }], unit?, lowerIsBetter?, h?. Cumulative positive/negative attribution staircase with dashed connectors and revealTo().',
  Radar:
    'axes: [{ key, label, max?, deltaLabel? }], series: [{ id?, name, values, color?, dashed? }], levels?=3, max?=100, showTicks?=true, h?. Multi-axis polygonal spiderweb profile with direct axis/delta labels.',
};

export const COMPONENT_EXAMPLES: Record<VizComponentName, string> = {
  DeltaBar: `<DeltaBar
  id="payoff"
  title="单请求实测资源与延迟"
  unit="%"
  lowerIsBetter
  items={[
    { id: 'delta_cpu', label: '单请求 CPU', baseline: 100, value: $.ui.cpuRust, deltaLabel: '−70%' },
    { id: 'delta_mem', label: '单请求内存', baseline: 100, value: $.ui.memRust, deltaLabel: '−80%+' },
    { id: 'delta_ttft', label: '中位 TTFT', baseline: 100, value: $.ui.ttftRust, deltaLabel: '−20%' },
  ]}
/>`,
  BarChart: `<BarChart
  id="kv_scale"
  title="单词 KV 缓存维度"
  dataKey="arch"
  layout="stacked"
  data={[
    { id: 'bar_mha', arch: '标准 MHA', semantic: 32768, pos: 0 },
    { id: 'bar_mla', arch: 'MLA', semantic: 512, pos: 64, deltaBadge: '−93.3%' },
  ]}
  series={[
    { name: 'semantic', label: '语义核', color: 'indigo' },
    { name: 'pos', label: '位置签', color: 'orange' },
  ]}
/>`,
  RatioBar: `<RatioBar
  id="prod_match"
  total={100}
  left={$.ui.prodMatch}
  threshold={99}
  labels={['真实线上一致']}
  remainderLabel="存在差异"
  thresholdLabel="上线门槛"
  unit="%"
  colors={['indigo', 'red']}
/>`,
  LineChart: `<LineChart
  id="trend"
  title="线上影子差异率收敛"
  dataKey="month"
  unit="%"
  data={[
    { id: 'pt_apr', month: '4 月', diff: 75 },
    { id: 'pt_june', month: '6 月', diff: 12 },
    { id: 'pt_sep', month: '9 月', diff: 0.02 },
  ]}
  series={[{ name: 'diff', label: '差异率', color: 'indigo', area: true }]}
  referenceLine={{ value: 0.1, label: '上线门槛 < 0.1%', color: 'green' }}
/>`,
  TimeLanes: `<TimeLanes
  id="leverage"
  title="工程师精力逐步外移"
  domain={[4, 9]}
  unit="月"
  spans={[
    { id: 'sp_inner', lane: '内环排障', start: 4, end: 5.4, label: '亲自查差异', status: 'warn' },
    { id: 'sp_cutover', lane: '线上切流', start: 8.1, end: 9, label: '公开流量切入 Rust', shortLabel: '零停服切流', status: 'ok' },
  ]}
/>`,
  ScatterPlot: `<ScatterPlot
  id="pareto"
  title="模型成本 vs 准确率"
  xLabel="$/1M tok"
  yLabel="准确率"
  yUnit="%"
  pareto="top-left"
  points={[
    { id: 'sc_mini', label: 'Mini', x: 0.8, y: 68 },
    { id: 'sc_new', label: 'Loop×2', x: 4.4, y: 90.5, tier: 'highlight' },
    { id: 'sc_pro', label: 'Ultra', x: 18, y: 91 },
  ]}
/>`,
  Heatmap: `<Heatmap
  id="attn"
  title="注意力权重矩阵"
  rows={['系统', '代码', 'Rust']}
  cols={['系统', '代码', 'Rust']}
  values={[[0.64, 0.24, 0.12], [0.12, 0.56, 0.32], [0.08, 0.58, 0.34]]}
  cellAnchors={{ '2:1': 'cell_rust_code' }}
/>`,
  Sankey: `<Sankey
  id="flow"
  title="首周镜像流量去向"
  unit="%"
  nodes={[
    { id: 'all', label: '总流量', tone: 'accent' },
    { id: 'ok', label: '一致放行', tone: 'ok' },
    { id: 'diff', label: '差异指纹', tone: 'warn' },
  ]}
  links={[
    { source: 'all', target: 'ok', value: 25 },
    { source: 'all', target: 'diff', value: 75 },
  ]}
/>`,
  Waterfall: `<Waterfall
  id="cpu_breakdown"
  title="CPU 节省归因拆解"
  unit="%"
  lowerIsBetter
  steps={[
    { id: 'wf_base', label: 'Python 基线', value: 100, kind: 'start' },
    { id: 'wf_gil', label: '去 GIL', value: -34 },
    { id: 'wf_json', label: '零拷贝 SSE', value: -22 },
    { id: 'wf_async', label: '异步调度', value: -14 },
    { id: 'wf_end', label: 'Rust 实测', value: 30, kind: 'total' },
  ]}
/>`,
  Radar: `<Radar
  id="profile"
  title="五维能力轮廓对比"
  axes={[
    { key: 'cpu', label: 'CPU 效率', deltaLabel: '34 → 94' },
    { key: 'mem', label: '内存效率', deltaLabel: '24 → 96' },
    { key: 'ttft', label: 'TTFT 延迟', deltaLabel: '68 → 88' },
  ]}
  series={[
    { id: 's_py', name: 'Python', values: { cpu: 34, mem: 24, ttft: 68 }, color: 'gray' },
    { id: 's_rs', name: 'Rust', values: { cpu: 94, mem: 96, ttft: 88 }, color: 'indigo' },
  ]}
/>`,
};

export const TEXT_PROPS: Record<VizComponentName, string[]> = {
  DeltaBar: ['title', 'subtitle', 'unit', 'baselineLabel', 'afterLabel'],
  BarChart: ['title', 'subtitle', 'unit'],
  RatioBar: ['title', 'labels', 'remainderLabel', 'thresholdLabel', 'unit'],
  LineChart: ['title', 'subtitle', 'unit'],
  TimeLanes: ['title', 'subtitle', 'unit', 'cursorLabel'],
  ScatterPlot: ['title', 'subtitle', 'xLabel', 'yLabel', 'xUnit', 'yUnit'],
  Heatmap: ['title', 'subtitle', 'cornerLabel', 'rows', 'cols'],
  Sankey: ['title', 'subtitle', 'unit'],
  Waterfall: ['title', 'subtitle', 'unit'],
  Radar: ['title', 'subtitle'],
};

export const TEXT_PATHS: Partial<Record<VizComponentName, string[][]>> = {
  DeltaBar: [['items', '*', 'label'], ['items', '*', 'sub'], ['items', '*', 'deltaLabel'], ['items', '*', 'note']],
  BarChart: [['series', '*', 'label'], ['referenceLine', 'label']],
  RatioBar: [['segments', '*', 'label']],
  LineChart: [['series', '*', 'label'], ['referenceLine', 'label'], ['referenceBand', 'label']],
  TimeLanes: [['spans', '*', 'lane'], ['spans', '*', 'label'], ['spans', '*', 'shortLabel'], ['spans', '*', 'rangeLabel']],
  ScatterPlot: [['points', '*', 'label'], ['quadrant', 'label']],
  Sankey: [['nodes', '*', 'label'], ['nodes', '*', 'sub'], ['links', '*', 'label']],
  Waterfall: [['steps', '*', 'label'], ['steps', '*', 'deltaLabel']],
  Radar: [['axes', '*', 'label'], ['axes', '*', 'deltaLabel'], ['series', '*', 'name']],
};

export const INSPECT_FIELDS: Partial<Record<VizComponentName, PluginInspectField[]>> = {
  DeltaBar: [{ label: { en: 'Variant', 'zh-CN': '样式' }, props: ['variant'], fallback: 'ghost' }],
  BarChart: [
    { label: { en: 'Layout', 'zh-CN': '排布' }, props: ['orientation', 'layout'], join: ' · ', fallback: 'vertical · grouped' },
  ],
  TimeLanes: [{ label: { en: 'Unit', 'zh-CN': '单位' }, props: ['unit'], fallback: 'ms' }],
  ScatterPlot: [{ label: { en: 'Pareto', 'zh-CN': '帕累托' }, props: ['pareto'], fallback: 'none' }],
  Heatmap: [{ label: { en: 'Scale', 'zh-CN': '色阶' }, props: ['colorScale'], fallback: 'indigo' }],
};
