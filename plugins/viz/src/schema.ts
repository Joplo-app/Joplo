import { z } from 'zod';

// ---------- Step IR Schemas (step.ext.viz) ----------

const FiniteNum = z.number().finite();
const KeyOrNum = z.union([z.string().min(1), FiniteNum]);

export const VizOpS = z.union([
  z.strictObject({
    kind: z.literal('focus'),
    chart: z.string().min(1),
    targets: z.array(z.string().min(1)).nullable(),
  }),
  z.strictObject({
    kind: z.literal('reveal'),
    chart: z.string().min(1),
    cutoff: KeyOrNum.nullable(),
  }),
  z.strictObject({
    kind: z.literal('pinBaseline'),
    chart: z.string().min(1),
  }),
  z.strictObject({
    kind: z.literal('cursor'),
    chart: z.string().min(1),
    value: KeyOrNum.nullable(),
    label: z.string().optional(),
  }),
]);

export type VizOp = z.infer<typeof VizOpS>;

export const VizChartSnapshotS = z.strictObject({
  focus: z.array(z.string().min(1)).nullable().optional(),
  reveal: KeyOrNum.nullable().optional(),
  cursor: z
    .strictObject({
      value: KeyOrNum,
      label: z.string().optional(),
    })
    .nullable()
    .optional(),
  baselines: z.record(z.string(), FiniteNum).optional(),
});

export type VizChartSnapshot = z.infer<typeof VizChartSnapshotS>;

export const VizFrameS = z.strictObject({
  charts: z.record(z.string(), VizChartSnapshotS),
});

export type VizFrame = z.infer<typeof VizFrameS>;

/** Step slot accepts raw effect ops before frame() lowers them into deterministic per-chart snapshots. */
export const StepDataS = z.union([
  z.strictObject({ ops: z.array(VizOpS) }),
  VizFrameS,
]);

// ---------- Pure Validators & Math Helpers (shared by compile.node & browser runtime) ----------

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

// 1. RatioBar math & validation
export type RatioSegment = {
  id?: string;
  label?: string;
  value: number;
  color?: string;
};

export type RatioProps = {
  total?: unknown;
  left?: unknown;
  right?: unknown;
  threshold?: unknown;
  segments?: unknown;
};

export function ratioError(p: RatioProps, isBinding: (v: unknown) => boolean = () => false): string | undefined {
  if (p.segments !== undefined) {
    if (isBinding(p.segments)) return undefined;
    if (!Array.isArray(p.segments) || p.segments.length === 0) return 'segments must be a non-empty array';
    let sum = 0;
    for (const [i, seg] of p.segments.entries()) {
      if (!seg || typeof seg !== 'object') return `segments[${i}] must be an object`;
      const val = (seg as Record<string, unknown>).value;
      if (isBinding(val)) continue;
      if (!finite(val) || val < 0) return `segments[${i}].value must be a finite nonnegative number`;
      sum += val;
    }
    if (p.total !== undefined && !isBinding(p.total)) {
      if (!finite(p.total) || p.total <= 0) return 'total must be a finite positive number';
      if (sum - p.total > Number.EPSILON * p.total * 4) return 'sum of segments must be at most total';
    }
    if (p.threshold !== undefined && !isBinding(p.threshold)) {
      if (!finite(p.threshold) || p.threshold < 0) return 'threshold must be a finite nonnegative number';
      if (finite(p.total) && p.threshold > p.total) return 'threshold must be at most total';
    }
    return undefined;
  }

  for (const key of ['total', 'left', 'right', 'threshold'] as const) {
    const v = p[key];
    const optional = key === 'right' || key === 'threshold';
    if ((optional && v === undefined) || isBinding(v)) continue;
    if (!finite(v) || (key === 'total' ? v <= 0 : v < 0)) {
      return `${key} must be a finite ${key === 'total' ? 'positive' : 'nonnegative'} number`;
    }
  }
  if (!finite(p.total)) return undefined;
  if (finite(p.threshold) && p.threshold > p.total) return 'threshold must be at most total';
  const left = finite(p.left) ? p.left : 0;
  const right = finite(p.right) ? p.right : 0;
  if (Math.max(left, right) > p.total || left + right - p.total > Number.EPSILON * p.total) {
    return 'left + right must be at most total';
  }
  return undefined;
}

export function ratioParts(p: RatioProps) {
  if (ratioError(p)) return null;
  if (Array.isArray(p.segments)) {
    const segs = p.segments as RatioSegment[];
    const segSum = segs.reduce((acc, s) => acc + s.value, 0);
    const total = finite(p.total) ? p.total : Math.max(segSum, 1);
    const remainder = Math.max(0, total - segSum);
    return {
      mode: 'segments' as const,
      total,
      segments: segs,
      remainder,
      percentages: segs.map((s) => (s.value / total) * 100),
      remainderPct: (remainder / total) * 100,
      threshold: finite(p.threshold) ? (p.threshold / total) * 100 : undefined,
    };
  }
  const total = p.total as number;
  const left = p.left as number;
  const right = (p.right ?? 0) as number;
  const remainder = Math.max(0, total - (left + right));
  return {
    mode: 'pair' as const,
    total,
    counts: [left, right, remainder] as const,
    percentages: [left, right, remainder].map((n) => (n / total) * 100),
    threshold: finite(p.threshold) ? (p.threshold / total) * 100 : undefined,
  };
}

// 2. TimeLanes validation & lane packing (migrated & upgraded from plugin-diagram)
const TimeVal = z.number().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER);
const NonEmpty = z.string().min(1).refine((v) => !!v.trim(), 'must contain text');

export const TimeSpanS = z.object({
  id: NonEmpty,
  lane: NonEmpty,
  start: TimeVal,
  end: TimeVal,
  label: z.string().optional(),
  shortLabel: z.string().optional(),
  rangeLabel: z.string().optional(),
  status: z.enum(['ok', 'warn', 'fail', 'info', 'accent']).optional(),
  color: z.string().optional(),
});

export type TimeSpan = z.infer<typeof TimeSpanS>;

const TimeLanesChartS = z
  .object({
    domain: z.tuple([TimeVal, TimeVal]),
    spans: z.array(TimeSpanS),
    unit: z.string().default('ms'),
  })
  .superRefine(({ domain: [min, max], spans }, ctx) => {
    if (max <= min) {
      ctx.addIssue({ code: 'custom', path: ['domain'], message: 'domain[1] must be greater than domain[0]' });
    }
    const ids = new Set<string>();
    for (const [index, item] of spans.entries()) {
      const path = ['spans', index];
      if (ids.has(item.id)) ctx.addIssue({ code: 'custom', path: [...path, 'id'], message: `duplicate id "${item.id}"` });
      ids.add(item.id);
      if (item.end < item.start) ctx.addIssue({ code: 'custom', path, message: `"${item.id}" needs end >= start` });
      if (item.start < min || item.end > max) {
        ctx.addIssue({ code: 'custom', path, message: `"${item.id}" must lie inside domain [${min}, ${max}]` });
      }
    }
  });

export function readTimeLanes(props: Record<string, unknown>) {
  const result = TimeLanesChartS.safeParse(props);
  return result.success
    ? { data: result.data }
    : { error: result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('. ') };
}

/** Lane order follows the author. Within a lane overlapping intervals occupy separate sub-rows. */
export function layoutTimeLanes(spans: readonly TimeSpan[]) {
  const grouped = new Map<string, TimeSpan[]>();
  for (const span of spans) {
    let group = grouped.get(span.lane);
    if (!group) {
      group = [];
      grouped.set(span.lane, group);
    }
    group.push(span);
  }
  return Array.from(grouped, ([lane, group]) => {
    const last: TimeSpan[] = [];
    const bars = [...group]
      .sort((a, b) => a.start - b.start || a.end - b.end)
      .map((span) => {
        let row = last.findIndex((prev) => prev.end < span.start || (prev.end === span.start && prev.start < prev.end));
        if (row < 0) row = last.length;
        last[row] = span;
        return { span, row };
      });
    return { lane, bars, rows: Math.max(1, last.length) };
  });
}

// 3. Pareto frontier computation for ScatterPlot
export type ParetoCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export function computeParetoFrontier<T extends { x: number; y: number }>(
  points: readonly T[],
  corner: ParetoCorner,
): T[] {
  if (points.length === 0) return [];
  const wantMinX = corner === 'top-left' || corner === 'bottom-left';
  const wantMaxY = corner === 'top-left' || corner === 'top-right';
  const sorted = [...points].sort((a, b) => (wantMinX ? a.x - b.x : b.x - a.x) || (wantMaxY ? b.y - a.y : a.y - b.y));
  const frontier: T[] = [];
  let bestY = wantMaxY ? -Infinity : Infinity;
  for (const pt of sorted) {
    const improves = wantMaxY ? pt.y > bestY : pt.y < bestY;
    if (improves) {
      frontier.push(pt);
      bestY = pt.y;
    }
  }
  // Sort left-to-right by x for smooth polyline rendering
  return frontier.sort((a, b) => a.x - b.x);
}

// 4. Waterfall cumulative layout math
export type WaterfallStepInput = {
  id?: string;
  label: string;
  value: number;
  kind?: 'start' | 'delta' | 'subtotal' | 'total';
  deltaLabel?: string;
  color?: string;
};

export type WaterfallBar = WaterfallStepInput & {
  index: number;
  start: number;
  end: number;
  kind: 'start' | 'delta' | 'subtotal' | 'total';
};

export function computeWaterfall(steps: readonly WaterfallStepInput[]): WaterfallBar[] {
  let running = 0;
  return steps.map((step, index) => {
    const kind = step.kind ?? (index === 0 ? 'start' : 'delta');
    if (kind === 'start') {
      running = step.value;
      return { ...step, index, kind, start: 0, end: running };
    }
    if (kind === 'subtotal' || kind === 'total') {
      const target = finite(step.value) ? step.value : running;
      running = target;
      return { ...step, index, kind, start: 0, end: target };
    }
    const start = running;
    const end = running + step.value;
    running = end;
    return { ...step, index, kind, start, end };
  });
}

// 5. DeltaBar baseline / delta math
export type DeltaBarItemInput = {
  id?: string;
  label: string;
  sub?: string;
  baseline?: number;
  value: number;
  deltaLabel?: string;
  note?: string;
  color?: string;
  lowerIsBetter?: boolean;
};

export function formatDeltaPercent(baseline: number, current: number, customLabel?: string): string {
  if (customLabel) return customLabel;
  const diff = current - baseline;
  if (Math.abs(diff) < 1e-9) return '0%';
  if (Math.abs(baseline) < 1e-9) return `${diff > 0 ? '+' : '−'}${Math.abs(Math.round(diff * 10) / 10)}`;
  const pct = (diff / Math.abs(baseline)) * 100;
  const rounded = Math.abs(pct) >= 10 ? Math.round(pct) : Math.round(pct * 10) / 10;
  return `${rounded > 0 ? '+' : '−'}${Math.abs(rounded)}%`;
}

// 6. Chart model helper (kept compatible for BarChart / LineChart numeric series extraction)
export type ChartSeriesInput = {
  name: string;
  label?: string;
  color?: string;
  area?: boolean;
  dashed?: boolean;
};

export function validateChartArray(name: string, prop: string, val: unknown, isBinding: (v: unknown) => boolean): string | undefined {
  if (val === undefined) return `<${name}> requires ${prop}`;
  if (isBinding(val)) return undefined;
  if (!Array.isArray(val)) return `<${name} ${prop}> must be an array`;
  return undefined;
}
