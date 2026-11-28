import type {
  RadarAxisInput,
  RadarSeriesInput,
  SankeyLinkInput,
  SankeyNodeInput,
  ScatterPointInput,
  TimeSpan,
  WaterfallStepInput,
} from '@joplo-app/plugin-viz';

export type DeltaViewMode = 'old' | 'ghost' | 'paired';
export type LoopCount = '1' | '2' | '4';
export type LaneFocus = 'inner' | 'rules' | 'cutover';

export type VizProtoUiState = {
  /** Zone 1: DeltaBar live state */
  deltaView: DeltaViewMode;
  deltaVariant: 'ghost' | 'paired';
  deltaDropped: boolean;
  cpuVal: number;
  memVal: number;
  ttftVal: number;
  /** Zone 2: BarChart invariant-locked loop lab */
  loopCount: LoopCount;
  loopDepthVal: number;
  loopAccVal: number;
  /** Zone 3: RatioBar + LineChart */
  showProdRatio: boolean;
  /** Zone 4: TimeLanes cursor */
  laneFocus: LaneFocus;
  laneCursor: number;
  laneCursorLabel: string;
  /** Top-right quiet HUD pill */
  hudNote: string;
};

export const INITIAL_VIZ_UI: VizProtoUiState = {
  deltaView: 'old',
  deltaVariant: 'ghost',
  deltaDropped: false,
  cpuVal: 100,
  memVal: 100,
  ttftVal: 100,
  loopCount: '1',
  loopDepthVal: 24,
  loopAccVal: 42,
  showProdRatio: false,
  laneFocus: 'inner',
  laneCursor: 4.9,
  laneCursorLabel: '4.9 月 · 内环',
  hudNote: '@joplo-app/plugin-viz（十类叙事图表实装）',
};

export const DELTA_BASELINE_PATCH: Partial<VizProtoUiState> = {
  deltaDropped: false,
  cpuVal: 100,
  memVal: 100,
  ttftVal: 100,
};

export const DELTA_DROPPED_PATCH: Partial<VizProtoUiState> = {
  deltaDropped: true,
  cpuVal: 30,
  memVal: 20,
  ttftVal: 80,
};

export const VIZ_PALETTE = {
  paper: '#f7f7f4',
  surface: '#ffffff',
  subtle: '#f0f0ec',
  ink: '#17181a',
  ink2: '#4b515d',
  muted: '#7a818f',
  line: 'rgba(23, 24, 26, 0.09)',
  lineStrong: 'rgba(23, 24, 26, 0.22)',
  accent: '#2231dd',
  accentSoft: 'rgba(34, 49, 221, 0.10)',
  ok: '#0f9f6e',
  okSoft: 'rgba(15, 159, 110, 0.11)',
  okBorder: 'rgba(15, 159, 110, 0.32)',
  warn: '#d97706',
  warnSoft: 'rgba(217, 119, 6, 0.12)',
  danger: '#dc2626',
  dangerSoft: 'rgba(220, 38, 38, 0.10)',
} as const;

export const FONT_SANS = 'ui-sans-serif, -apple-system, BlinkMacSystemFont, "PingFang SC", "Noto Sans SC", sans-serif';
export const FONT_MONO = 'ui-monospace, "SF Mono", Menlo, Monaco, Consolas, monospace';

// ---------- Zone 2: BarChart ----------
export const MLA_BAR_DATA = [
  { id: 'col_mha', name: '标准 MHA', note: '128 头各自存', core: 32768, rope: 0, color: 'danger' },
  { id: 'col_gqa', name: 'GQA-8', note: '砍头换显存', core: 2048, rope: 0, color: 'warn' },
  { id: 'bar_mla', name: 'DeepSeek MLA', note: '512 核 + 64 位置签', core: 512, rope: 64, deltaBadge: '▼ −93.3%', color: 'accent' },
];

export type LoopSpec = { label: string; depthVal: number; accVal: number; caption: string };
export const LOOP_SPECS: Record<LoopCount, LoopSpec> = {
  '1': { label: '1 圈（基准）', depthVal: 24, accVal: 42, caption: '单遍前向：显存与计算都在起点（1.0× 深度 · 42%）' },
  '2': { label: '2 圈（主流）', depthVal: 50, accVal: 79, caption: '循环第 2 遍：权重显存锁死 1.0×，准确率跃升至 79%' },
  '4': { label: '4 圈（深思）', depthVal: 92, accVal: 91, caption: '继续加圈：共享权重纹丝不动，深度 4.0× 准确率 91%' },
};

// ---------- Zone 3: LineChart ----------
export const TREND_DATA = [
  { id: 'pt_apr', month: '4 月', diff: 75 },
  { id: 'pt_may', month: '5 月', diff: 46 },
  { id: 'pt_june', month: '6 月', diff: 12 },
  { id: 'pt_july', month: '7 月', diff: 2.4 },
  { id: 'pt_aug', month: '8 月', diff: 0.4 },
  { id: 'pt_sep', month: '9 月', diff: 0.02 },
];

// ---------- Zone 4: TimeLanes ----------
export const LANE_SPANS: readonly TimeSpan[] = [
  { id: 'span_inner', lane: '内环排障', start: 4.0, end: 5.4, label: '工程师亲自跑 Claude 查差异', rangeLabel: '4.0 – 5.4 月', status: 'warn' },
  { id: 'span_seam', lane: '环间接缝', start: 5.2, end: 7.6, label: 'Slack 审 PR · 拦截捷径代码', rangeLabel: '5.2 – 7.6 月', status: 'info' },
  { id: 'span_rules', lane: '外环规则', start: 6.5, end: 9.0, label: 'CLAUDE.md 60 条规则 · Lint · 双改门禁', rangeLabel: '6.5 – 9.0 月', status: 'accent' },
  { id: 'span_cutover', lane: '线上切流', start: 8.1, end: 9.0, label: '公开流量分批切入 Rust', shortLabel: '零停服切流', rangeLabel: '8.1 – 9.0 月', status: 'ok' },
];

export const LANE_PHASES: Record<LaneFocus, { cursor: number; label: string }> = {
  inner: { cursor: 4.9, label: '4.9 月 · 内环' },
  rules: { cursor: 6.9, label: '6.9 月 · 规则' },
  cutover: { cursor: 8.6, label: '8.6 月 · 切流' },
};

// ---------- Zone 5: ScatterPlot + Heatmap ----------
export const SCATTER_BASE_POINTS: readonly ScatterPointInput[] = [
  { id: 'sc_lite', label: 'Mini-8B', x: 0.8, y: 71, tier: 'frontier', valueLabel: '$0.8' },
  { id: 'sc_mid', label: 'Mid-70B', x: 5.2, y: 82, tier: 'frontier', valueLabel: '$5.2' },
  { id: 'sc_legacy_a', label: '旧旗舰 A', x: 8.5, y: 78, tier: 'dominated', valueLabel: '$8.5' },
  { id: 'sc_legacy_b', label: '旧旗舰 B', x: 14.2, y: 83, tier: 'dominated', valueLabel: '$14.2' },
  { id: 'sc_heavy', label: 'Ultra-Pro', x: 18.0, y: 90.8, tier: 'frontier', valueLabel: '$18.0', labelPos: 'bottom' },
];

export const SCATTER_WITH_NEW: readonly ScatterPointInput[] = [
  ...SCATTER_BASE_POINTS,
  { id: 'pt_pareto_new', label: 'Loop×2 新方案', x: 4.4, y: 90.5, tier: 'highlight', valueLabel: '$4.4 · 90.5%', labelPos: 'top' },
];

export const HEAT_TOKENS = ['系统', '把', '代码', '迁到', 'Rust'] as const;
export const HEAT_MATRIX: readonly (readonly number[])[] = [
  [0.64, 0.12, 0.14, 0.06, 0.04],
  [0.18, 0.42, 0.24, 0.10, 0.06],
  [0.10, 0.08, 0.56, 0.14, 0.12],
  [0.06, 0.05, 0.34, 0.36, 0.19],
  [0.05, 0.04, 0.46, 0.31, 0.14],
];

// ---------- Zone 6: Sankey + Waterfall + Radar ----------
export const SANKEY_NODES: readonly SankeyNodeInput[] = [
  { id: 'sn_in', label: '镜像流量', valueLabel: '100%', tone: 'accent' },
  { id: 'sn_match', label: '首周即一致', valueLabel: '25%', tone: 'ok' },
  { id: 'sn_diff', label: '指纹归并', valueLabel: '75%', tone: 'warn' },
  { id: 'sn_pass', label: '静默放行', valueLabel: '25%', tone: 'ok' },
  { id: 'sn_heal', label: '沙盒自愈', valueLabel: '54%', tone: 'accent' },
  { id: 'sn_unmask', label: '下游浮现', valueLabel: '15%', tone: 'info' },
  { id: 'sankey_human_gate', label: '人工 PR 闸门', valueLabel: '6%', tone: 'danger' },
];

export const SANKEY_LINKS: readonly SankeyLinkInput[] = [
  { id: 'lk_match1', source: 'sn_in', target: 'sn_match', value: 25, label: '25%' },
  { id: 'lk_diff1', source: 'sn_in', target: 'sn_diff', value: 75, label: '75% 差异' },
  { id: 'lk_pass', source: 'sn_match', target: 'sn_pass', value: 25 },
  { id: 'lk_heal', source: 'sn_diff', target: 'sn_heal', value: 54, label: '54%' },
  { id: 'lk_unmask', source: 'sn_diff', target: 'sn_unmask', value: 15, label: '15%' },
  { id: 'lk_gate', source: 'sn_diff', target: 'sankey_human_gate', value: 6, label: '6%' },
];

export const WATERFALL_STEPS: readonly WaterfallStepInput[] = [
  { id: 'wf_base', label: 'Python 基线', value: 100, kind: 'start' },
  { id: 'wf_gil', label: '去 GIL/解释器', value: -34 },
  { id: 'wf_json', label: '零拷贝 SSE', value: -22 },
  { id: 'wf_async', label: '原生异步调度', value: -14 },
  { id: 'wf_final', label: 'Rust 实测', value: 30, kind: 'total' },
];

export const RADAR_AXES: readonly RadarAxisInput[] = [
  { key: 'cpu', label: 'CPU 效率', deltaLabel: '34 → 94' },
  { key: 'mem', label: '内存效率', deltaLabel: '24 → 96' },
  { key: 'ttft', label: 'TTFT 延迟', deltaLabel: '68 → 88' },
  { key: 'parity', label: '线上一致', deltaLabel: '96 → 95' },
  { key: 'vel', label: '迭代速度', deltaLabel: '90 → 84' },
];

export const RADAR_SERIES_BASE: readonly RadarSeriesInput[] = [
  { id: 'rad_py', name: 'Python 旧主路', values: { cpu: 34, mem: 24, ttft: 68, parity: 96, vel: 90 }, color: '#64748b', dashed: true },
];

export const RADAR_SERIES_BOTH: readonly RadarSeriesInput[] = [
  ...RADAR_SERIES_BASE,
  { id: 'rad_rs', name: 'Rust 新船', values: { cpu: 94, mem: 96, ttft: 88, parity: 95, vel: 84 }, color: 'accent' },
];
