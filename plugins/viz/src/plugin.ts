import { isBind } from '@joplo-app/kit/node';
import {
  definePlugin,
  type PluginCompileHooks,
  type PluginComponentSpec,
  type PluginIRNode,
  type PluginText,
} from '@joplo-app/kit/plugin';
import packageInfo from './version.json' with { type: 'json' };
import labels from './labels.json' with { type: 'json' };
import {
  COMPONENT_DOCS,
  COMPONENT_EXAMPLES,
  COMPONENT_TYPES,
  INSPECT_FIELDS,
  TEXT_PATHS,
  TEXT_PROPS,
} from './catalog.ts';
import { componentGuide, recipes, skill } from './guide.ts';
import {
  ratioError,
  readTimeLanes,
  StepDataS,
  validateChartArray,
  type VizChartSnapshot,
  type VizFrame,
  type VizOp,
} from './schema.ts';

export * from './components.ts';
export * from './effects.ts';
export {
  computeParetoFrontier,
  computeWaterfall,
  formatDeltaPercent,
  layoutTimeLanes,
  ratioError,
  ratioParts,
  readTimeLanes,
} from './schema.ts';
export type {
  DeltaBarItemInput,
  ParetoCorner,
  RatioSegment,
  TimeSpan,
  VizChartSnapshot,
  VizFrame,
  VizOp,
  WaterfallBar,
  WaterfallStepInput,
} from './schema.ts';

const allNodes = (n: PluginIRNode): PluginIRNode[] => [n, ...(n.children ?? []).flatMap(allNodes)];
const isVizChart = (n: PluginIRNode): boolean => n.type.startsWith('viz:');
const vizChartsIn = (roots: readonly PluginIRNode[]): PluginIRNode[] => roots.flatMap(allNodes).filter(isVizChart);

function extractBaselineMap(node: PluginIRNode, resolvedProps: Record<string, unknown>): Record<string, number> | undefined {
  if (node.type === 'viz:DeltaBar' && Array.isArray(resolvedProps.items)) {
    const out: Record<string, number> = {};
    for (const [i, raw] of resolvedProps.items.entries()) {
      if (!raw || typeof raw !== 'object') continue;
      const item = raw as Record<string, unknown>;
      const key = typeof item.id === 'string' && item.id ? item.id : String(i);
      const val = typeof item.baseline === 'number' && Number.isFinite(item.baseline)
        ? item.baseline
        : typeof item.value === 'number' && Number.isFinite(item.value)
          ? item.value
          : undefined;
      if (val !== undefined) out[key] = val;
    }
    return Object.keys(out).length ? out : undefined;
  }
  return undefined;
}

function captureCurrentValues(node: PluginIRNode, resolvedProps: Record<string, unknown>): Record<string, number> | undefined {
  if (node.type === 'viz:DeltaBar' && Array.isArray(resolvedProps.items)) {
    const out: Record<string, number> = {};
    for (const [i, raw] of resolvedProps.items.entries()) {
      if (!raw || typeof raw !== 'object') continue;
      const item = raw as Record<string, unknown>;
      const key = typeof item.id === 'string' && item.id ? item.id : String(i);
      if (typeof item.value === 'number' && Number.isFinite(item.value)) out[key] = item.value;
    }
    return Object.keys(out).length ? out : undefined;
  }
  return undefined;
}

const hooks: PluginCompileHooks = {
  node(n, { report }) {
    const props = n.props ?? {};
    switch (n.type) {
      case 'viz:RatioBar': {
        const err = ratioError(props, isBind);
        if (err) report('RATIO_BAR_INVALID', `<RatioBar> ${err}`, n.source);
        return;
      }
      case 'viz:TimeLanes': {
        const { domain, spans, spanIds } = props;
        if (
          spanIds !== undefined &&
          !(Array.isArray(spanIds) && spanIds.every((id) => typeof id === 'string' && id.trim()) && new Set(spanIds).size === spanIds.length)
        ) {
          report('TIME_LANES_INVALID', '<TimeLanes spanIds> expects unique, nonempty target ids.', n.source);
        }
        const result = readTimeLanes({
          ...props,
          domain: isBind(domain) ? [-Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER] : domain,
          spans: isBind(spans) ? [] : spans,
        });
        if (result.error) report('TIME_LANES_INVALID', `<TimeLanes> ${result.error}`, n.source);
        return;
      }
      case 'viz:DeltaBar': {
        const err = validateChartArray('DeltaBar', 'items', props.items, isBind);
        if (err) report('VIZ_DATA_INVALID', err, n.source);
        if (props.variant !== undefined && !isBind(props.variant) && props.variant !== 'ghost' && props.variant !== 'paired') {
          report('VIZ_DATA_INVALID', '<DeltaBar variant> must be "ghost" or "paired"', n.source);
        }
        return;
      }
      case 'viz:BarChart': {
        const e1 = validateChartArray('BarChart', 'data', props.data, isBind);
        const e2 = validateChartArray('BarChart', 'series', props.series, isBind);
        if (e1) report('VIZ_DATA_INVALID', e1, n.source);
        if (e2) report('VIZ_DATA_INVALID', e2, n.source);
        if (typeof props.dataKey !== 'string' || !props.dataKey) {
          report('VIZ_DATA_INVALID', '<BarChart> requires a non-empty string dataKey', n.source);
        }
        return;
      }
      case 'viz:LineChart': {
        const e1 = validateChartArray('LineChart', 'data', props.data, isBind);
        const e2 = validateChartArray('LineChart', 'series', props.series, isBind);
        if (e1) report('VIZ_DATA_INVALID', e1, n.source);
        if (e2) report('VIZ_DATA_INVALID', e2, n.source);
        if (typeof props.dataKey !== 'string' || !props.dataKey) {
          report('VIZ_DATA_INVALID', '<LineChart> requires a non-empty string dataKey', n.source);
        }
        return;
      }
      case 'viz:ScatterPlot': {
        const err = validateChartArray('ScatterPlot', 'points', props.points, isBind);
        if (err) report('VIZ_DATA_INVALID', err, n.source);
        return;
      }
      case 'viz:Heatmap': {
        const e1 = validateChartArray('Heatmap', 'rows', props.rows, isBind);
        const e2 = validateChartArray('Heatmap', 'cols', props.cols, isBind);
        const e3 = validateChartArray('Heatmap', 'values', props.values, isBind);
        if (e1) report('VIZ_DATA_INVALID', e1, n.source);
        if (e2) report('VIZ_DATA_INVALID', e2, n.source);
        if (e3) report('VIZ_DATA_INVALID', e3, n.source);
        return;
      }
      case 'viz:Sankey': {
        const e1 = validateChartArray('Sankey', 'nodes', props.nodes, isBind);
        const e2 = validateChartArray('Sankey', 'links', props.links, isBind);
        if (e1) report('VIZ_DATA_INVALID', e1, n.source);
        if (e2) report('VIZ_DATA_INVALID', e2, n.source);
        return;
      }
      case 'viz:Waterfall': {
        const err = validateChartArray('Waterfall', 'steps', props.steps, isBind);
        if (err) report('VIZ_DATA_INVALID', err, n.source);
        return;
      }
      case 'viz:Radar': {
        const e1 = validateChartArray('Radar', 'axes', props.axes, isBind);
        const e2 = validateChartArray('Radar', 'series', props.series, isBind);
        if (e1) report('VIZ_DATA_INVALID', e1, n.source);
        if (e2) report('VIZ_DATA_INVALID', e2, n.source);
        return;
      }
    }
  },

  derive(node) {
    if (!isVizChart(node)) return;
    return {
      framing: Object.fromEntries(allNodes(node).map((child) => [child.id, { kind: child === node ? 'root' : 'content' }])),
    };
  },

  effect(effect, ctx) {
    const p = (effect.payload ?? {}) as Record<string, unknown>;
    const chart = typeof p.chart === 'string' ? p.chart : '';
    const charts = vizChartsIn(ctx.roots);
    const targetNode = charts.find((n) => n.id === chart);
    if (!targetNode) {
      ctx.report('VIZ_CHART_UNKNOWN', `${effect.name}("${chart}"): no viz chart with id="${chart}" on this step`, ctx.source);
      return;
    }

    const ops = [...((ctx.data as { ops?: VizOp[] } | undefined)?.ops ?? [])];
    const refs = new Set<string>([chart]);

    if (effect.name === 'focus') {
      const raw = p.targets;
      if (raw !== null && !(Array.isArray(raw) && raw.every((x) => typeof x === 'string' && x.trim()))) {
        ctx.report('VIZ_EFFECT_INVALID', 'focusDatum(chart, targets) expects a string, string[], or null', ctx.source);
        return;
      }
      const targets = raw === null ? null : (raw as string[]);
      ops.push({ kind: 'focus', chart, targets });
      if (targets) {
        const anchorIds = new Set((targetNode.children ?? []).map((c) => c.id));
        for (const t of targets) if (anchorIds.has(t)) refs.add(t);
      }
    } else if (effect.name === 'reveal') {
      const cutoff = p.cutoff;
      if (cutoff !== null && typeof cutoff !== 'string' && !(typeof cutoff === 'number' && Number.isFinite(cutoff))) {
        ctx.report('VIZ_EFFECT_INVALID', 'revealTo(chart, cutoff) expects a finite number, string, or null', ctx.source);
        return;
      }
      ops.push({ kind: 'reveal', chart, cutoff: cutoff as number | string | null });
    } else if (effect.name === 'pinBaseline') {
      ops.push({ kind: 'pinBaseline', chart });
    } else if (effect.name === 'cursor') {
      const val = p.value;
      if (val !== null && typeof val !== 'string' && !(typeof val === 'number' && Number.isFinite(val))) {
        ctx.report('VIZ_EFFECT_INVALID', 'setCursor(chart, value) expects a finite number, string, or null', ctx.source);
        return;
      }
      const label = typeof p.label === 'string' ? p.label : undefined;
      ops.push({ kind: 'cursor', chart, value: val as number | string | null, ...(label !== undefined ? { label } : {}) });
    } else {
      ctx.report('PLUGIN_EFFECT_UNKNOWN', `Unknown viz effect ${effect.name}`, ctx.source);
      return;
    }

    return { data: { ops }, references: [...refs] };
  },

  frame(ctx) {
    // Validate dynamically bound TimeLanes intervals and cross-element ID collisions at every step position.
    for (const scene of ctx.scenes) {
      const nodes = allNodes(scene.root);
      const bound = nodes.filter(
        (n) => n.type === 'viz:TimeLanes' && (typeof n.props?.spans === 'string' || typeof n.props?.domain === 'string'),
      );
      if (!bound.length) continue;
      const used = new Set(nodes.map((n) => n.id));
      for (const node of bound) {
        const chart = readTimeLanes(ctx.resolveProps(node));
        const at = `<TimeLanes id="${node.id}"> at position ${ctx.position}`;
        if (!chart.data) {
          ctx.report('TIME_LANES_INVALID', `${at}: ${chart.error}`, node.source);
          continue;
        }
        const declared = new Set(node.children?.map((child) => child.id));
        for (const { id } of chart.data.spans) {
          if (!declared.has(id) && used.has(id)) {
            ctx.report('TIME_LANES_INVALID', `${at}: span id "${id}" already belongs to another element on this stage.`, node.source);
          }
          used.add(id);
        }
      }
    }

    const charts = vizChartsIn(ctx.roots);
    if (!charts.length) return;
    const prev = (ctx.previousData as VizFrame | undefined)?.charts ?? {};
    const ops = (ctx.data as { ops?: VizOp[] } | undefined)?.ops ?? [];
    const out: Record<string, VizChartSnapshot> = {};

    for (const node of charts) {
      if (out[node.id]) continue;
      const resolved = ctx.resolveProps(node);
      const base: VizChartSnapshot = prev[node.id] ? { ...prev[node.id] } : {};

      // Auto-capture Step 0 baselines for DeltaBar so later steps know original footprints deterministically.
      if (!base.baselines) {
        const initial = extractBaselineMap(node, resolved);
        if (initial) base.baselines = initial;
      }

      const mine = ops.filter((op) => op.chart === node.id);
      for (const op of mine) {
        if (op.kind === 'focus') base.focus = op.targets;
        else if (op.kind === 'reveal') base.reveal = op.cutoff;
        else if (op.kind === 'cursor') {
          base.cursor = op.value === null ? null : { value: op.value, ...(op.label !== undefined ? { label: op.label } : {}) };
        } else if (op.kind === 'pinBaseline') {
          const captured = captureCurrentValues(node, resolved);
          if (captured) base.baselines = captured;
        }
      }

      out[node.id] = base;
    }

    return { charts: out } satisfies VizFrame;
  },
};

const components: Record<string, PluginComponentSpec> = Object.fromEntries(
  COMPONENT_TYPES.map((name) => [
    name,
    {
      ...((labels as Record<string, PluginText>)[name] ? { label: (labels as Record<string, PluginText>)[name] } : {}),
      ...(INSPECT_FIELDS[name] ? { inspect: INSPECT_FIELDS[name] } : {}),
      role: 'chart' as const,
      doc: COMPONENT_DOCS[name],
      example: COMPONENT_EXAMPLES[name],
      selfEvident: true,
      traits: {
        selfEvident: true,
        text: ['aria-label', ...TEXT_PROPS[name]],
        ...(TEXT_PATHS[name] ? { textPaths: TEXT_PATHS[name] } : {}),
      },
    },
  ]),
);

export default definePlugin({
  packageName: '@joplo-app/plugin-viz',
  id: 'viz',
  title: 'Narrative Data Visualization',
  version: packageInfo.version,
  bestFor: 'Narrative quantitative comparisons (DeltaBar), bars/ratios/trends, timelines with playhead cursor (TimeLanes), Pareto trade-offs (ScatterPlot), matrices (Heatmap), flow ribbons (Sankey), attribution bridges (Waterfall), and multi-axis profiles (Radar)',
  pairsWith: [
    { with: 'content', packageName: '@joplo-app/plugin-content', how: 'Place each chart in its own spacious content:Canvas zone and steer camera() across narrative chapters; use focusDatum()/revealTo()/setCursor() for deterministic step transitions.' },
    { with: 'ui', packageName: '@joplo-app/plugin-ui', how: 'Pair viz charts with ui KPI Stat cards, qualitative Compare panels, or Terminal logs inside the same dashboard or story.' },
    { with: 'diagram', packageName: '@joplo-app/plugin-diagram', how: 'Follow a diagram architecture or sequence explanation with a viz DeltaBar, TimeLanes, or Waterfall zone to back up structural claims with measurements.' },
  ],
  runtime: new URL(import.meta.url.endsWith('.ts') ? './runtime.tsx' : './runtime.js', import.meta.url),
  skill,
  skillTopics: {
    components: { description: 'Prop tables and author examples for all 10 viz components', body: componentGuide() },
    recipes: { description: 'Narrative data visualization patterns, transitions, and pitfalls', body: recipes },
  },
  components,
  schemas: { step: StepDataS },
  data: {
    step: {
      scope: [{ path: ['charts'], kind: 'map', domain: 'element' }],
    },
  },
  compile: hooks,
});
