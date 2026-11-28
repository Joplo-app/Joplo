import { component, createNode, Custom, type Bind, type JNode } from '@joplo-app/kit/node';
import type { JoploProps } from '@joplo-app/kit/plugin';
import type {
  ChartSeriesInput,
  DeltaBarItemInput,
  ParetoCorner,
  RatioSegment,
  TimeSpan,
  WaterfallStepInput,
} from './schema.ts';

const c = (name: string) => component(`viz:${name}`, '@joplo-app/plugin-viz') as unknown as (props: JoploProps) => JNode;

function withAnchors(
  marker: (props: JoploProps) => JNode,
  props: JoploProps,
  ids: readonly (string | undefined)[],
): JNode {
  const unique = [...new Set(ids)].filter((id): id is string => typeof id === 'string' && !!id.trim());
  if (!unique.length) return createNode(marker, props);
  return createNode(marker, { ...props, children: unique.map((id) => createNode(Custom, { id })) });
}

const idsOf = (arr: unknown, explicit?: readonly string[]): readonly (string | undefined)[] => {
  const fromArray = Array.isArray(arr)
    ? arr.map((item) => (item && typeof item === 'object' ? (item as { id?: unknown }).id : undefined)).filter((x): x is string => typeof x === 'string')
    : [];
  return [...fromArray, ...(explicit ?? [])];
};

// ---------- 1. DeltaBar ----------
export type DeltaBarProps = JoploProps & {
  title?: string | Bind;
  subtitle?: string | Bind;
  items: readonly DeltaBarItemInput[] | Bind;
  itemIds?: readonly string[];
  variant?: 'ghost' | 'paired' | Bind;
  domain?: readonly [number, number] | Bind;
  unit?: string;
  lowerIsBetter?: boolean;
  ticks?: readonly number[];
  baselineLabel?: string;
  afterLabel?: string;
  showAxis?: boolean;
  w?: number | string;
  h?: number | string;
};
const deltaBar = c('DeltaBar');
export function DeltaBar(props: DeltaBarProps): JNode {
  return withAnchors(deltaBar, props, idsOf(props.items, props.itemIds));
}

// ---------- 2. BarChart ----------
export type BarChartRow = Record<string, unknown> & {
  id?: string;
  locked?: boolean;
  lockedLabel?: string;
  deltaBadge?: string;
  note?: string;
  color?: string;
};
export type BarChartProps = JoploProps & {
  title?: string | Bind;
  subtitle?: string | Bind;
  data: readonly BarChartRow[] | Bind;
  dataKey: string;
  series: readonly ChartSeriesInput[];
  orientation?: 'vertical' | 'horizontal';
  layout?: 'grouped' | 'stacked';
  scale?: 'linear' | 'log';
  unit?: string;
  referenceLine?: { value: number; label?: string; color?: string };
  directLabels?: boolean;
  withLegend?: boolean;
  itemIds?: readonly string[];
  w?: number | string;
  h?: number | string;
};
const barChart = c('BarChart');
export function BarChart(props: BarChartProps): JNode {
  return withAnchors(barChart, props, idsOf(props.data, props.itemIds));
}

// ---------- 3. RatioBar ----------
export type RatioBarProps = JoploProps & {
  title?: string | Bind;
  total?: number | Bind;
  left?: number | Bind;
  right?: number | Bind;
  segments?: readonly RatioSegment[] | Bind;
  threshold?: number | Bind;
  labels?: readonly string[];
  remainderLabel?: string;
  thresholdLabel?: string;
  colors?: readonly string[];
  unit?: string;
  height?: number | string;
  /** 单值占比默认不重复拼接 "/ 100%"；显式传 true 展示 "count / total"。 */
  showDenominator?: boolean;
  segmentIds?: readonly string[];
};
const ratioBar = c('RatioBar');
export function RatioBar(props: RatioBarProps): JNode {
  return withAnchors(ratioBar, props, idsOf(props.segments, props.segmentIds));
}

// ---------- 4. LineChart ----------
export type LineChartProps = JoploProps & {
  title?: string | Bind;
  subtitle?: string | Bind;
  data: readonly (Record<string, unknown> & { id?: string; label?: string })[] | Bind;
  dataKey: string;
  series: readonly ChartSeriesInput[];
  unit?: string;
  yDomain?: readonly [number, number];
  curve?: 'linear' | 'monotone';
  referenceLine?: { value: number; label?: string; color?: string };
  referenceBand?: { from: number; to: number; label?: string; color?: string };
  revealTo?: number | string | Bind;
  directLabels?: boolean;
  withLegend?: boolean;
  pointIds?: readonly string[];
  w?: number | string;
  h?: number | string;
};
const lineChart = c('LineChart');
export function LineChart(props: LineChartProps): JNode {
  return withAnchors(lineChart, props, idsOf(props.data, props.pointIds));
}

// ---------- 5. TimeLanes ----------
export type { TimeSpan } from './schema.ts';
export type TimeLanesProps = JoploProps & {
  title?: string | Bind;
  subtitle?: string | Bind;
  domain: readonly [number, number] | Bind;
  spans: readonly TimeSpan[] | Bind;
  unit?: string;
  ticks?: readonly number[];
  cursor?: number | Bind;
  cursorLabel?: string | Bind;
  spanIds?: readonly string[];
  compact?: boolean;
  w?: number | string;
  h?: number | string;
};
const timeLanes = c('TimeLanes');
export function TimeLanes(props: TimeLanesProps): JNode {
  return withAnchors(timeLanes, props, idsOf(props.spans, props.spanIds));
}

// ---------- 6. ScatterPlot ----------
export type ScatterPointInput = {
  id?: string;
  label: string;
  x: number;
  y: number;
  r?: number;
  group?: string;
  tier?: 'frontier' | 'dominated' | 'highlight';
  color?: string;
  valueLabel?: string;
  labelPos?: 'top' | 'bottom' | 'left' | 'right';
};
export type ScatterPlotProps = JoploProps & {
  title?: string | Bind;
  subtitle?: string | Bind;
  points: readonly ScatterPointInput[] | Bind;
  xLabel?: string;
  yLabel?: string;
  xUnit?: string;
  yUnit?: string;
  xDomain?: readonly [number, number];
  yDomain?: readonly [number, number];
  pareto?: ParetoCorner | false;
  quadrant?: { x: number; y: number; label?: string; corner?: ParetoCorner };
  pointIds?: readonly string[];
  w?: number | string;
  h?: number | string;
};
const scatterPlot = c('ScatterPlot');
export function ScatterPlot(props: ScatterPlotProps): JNode {
  return withAnchors(scatterPlot, props, idsOf(props.points, props.pointIds));
}

// ---------- 7. Heatmap ----------
export type HeatmapProps = JoploProps & {
  title?: string | Bind;
  subtitle?: string | Bind;
  rows: readonly string[] | Bind;
  cols: readonly string[] | Bind;
  values: readonly (readonly number[])[] | Bind;
  domain?: readonly [number, number];
  colorScale?: 'indigo' | 'emerald' | 'amber' | 'crimson' | 'diverging';
  format?: 'fixed2' | 'percent' | 'int';
  cornerLabel?: string;
  showScale?: boolean;
  /** Optional map of "rowIndex:colIndex" -> element id for callout/highlight anchors. */
  cellAnchors?: Record<string, string>;
  cellIds?: readonly string[];
  w?: number | string;
  h?: number | string;
};
const heatmap = c('Heatmap');
export function Heatmap(props: HeatmapProps): JNode {
  const fromMap = props.cellAnchors ? Object.values(props.cellAnchors) : [];
  return withAnchors(heatmap, props, [...fromMap, ...(props.cellIds ?? [])]);
}

// ---------- 8. Sankey ----------
export type SankeyNodeInput = {
  id: string;
  label: string;
  sub?: string;
  valueLabel?: string;
  color?: string;
  tone?: 'accent' | 'ok' | 'warn' | 'danger' | 'info' | 'muted';
};
export type SankeyLinkInput = {
  id?: string;
  source: string;
  target: string;
  value: number;
  label?: string;
  color?: string;
};
export type SankeyProps = JoploProps & {
  title?: string | Bind;
  subtitle?: string | Bind;
  nodes: readonly SankeyNodeInput[] | Bind;
  links: readonly SankeyLinkInput[] | Bind;
  unit?: string;
  nodeWidth?: number;
  nodePadding?: number;
  nodeIds?: readonly string[];
  w?: number | string;
  h?: number | string;
};
const sankey = c('Sankey');
export function Sankey(props: SankeyProps): JNode {
  return withAnchors(sankey, props, [...idsOf(props.nodes, props.nodeIds), ...idsOf(props.links)]);
}

// ---------- 9. Waterfall ----------
export type { WaterfallStepInput } from './schema.ts';
export type WaterfallProps = JoploProps & {
  title?: string | Bind;
  subtitle?: string | Bind;
  steps: readonly WaterfallStepInput[] | Bind;
  unit?: string;
  lowerIsBetter?: boolean;
  stepIds?: readonly string[];
  w?: number | string;
  h?: number | string;
};
const waterfall = c('Waterfall');
export function Waterfall(props: WaterfallProps): JNode {
  return withAnchors(waterfall, props, idsOf(props.steps, props.stepIds));
}

// ---------- 10. Radar ----------
export type RadarAxisInput = {
  key: string;
  label: string;
  max?: number;
  deltaLabel?: string;
};
export type RadarSeriesInput = {
  id?: string;
  name: string;
  values: Record<string, number> | readonly number[];
  color?: string;
  dashed?: boolean;
};
export type RadarProps = JoploProps & {
  title?: string | Bind;
  subtitle?: string | Bind;
  axes: readonly RadarAxisInput[] | Bind;
  series: readonly RadarSeriesInput[] | Bind;
  levels?: number;
  max?: number;
  showTicks?: boolean;
  seriesIds?: readonly string[];
  w?: number | string;
  h?: number | string;
};
const radar = c('Radar');
export function Radar(props: RadarProps): JNode {
  return withAnchors(radar, props, idsOf(props.series, props.seriesIds));
}
