import { COMPONENT_DOCS, COMPONENT_EXAMPLES } from './catalog.ts';

export const skill = `# Narrative Data Visualization: viz

Use \`@joplo-app/plugin-viz\` for all quantitative comparisons, magnitudes, part-to-whole ratios, trends, timelines, Pareto trade-offs, matrices, flows, attributions, and multi-axis profiles. Install \`@joplo-app/plugin-viz\`, default-import \`viz\`, add \`viz\` to \`config.plugins\`, and run \`npx joplo skill install\`.

## Choose the right chart (never abuse RatioBar or hand-roll div bars)
- **Qualitative UI / prose A-vs-B switching** → stay in \`@joplo-app/plugin-ui\` (\`<Compare>\`).
- **Before → After metric gain / reduction** (e.g., CPU −70%, Memory −80%, latency drop) → **\`<DeltaBar>\`** (default \`variant="ghost"\` keeps a dashed ghost baseline in place and uncovers a tinted savings band as the bar retracts; \`variant="paired"\` renders stacked old/new bars). Never abuse \`<RatioBar>\` for before/after comparisons.
- **Category magnitude, stacked composition, or invariant locking** → **\`<BarChart>\`** (\`orientation="vertical"|"horizontal"\`, \`layout="grouped"|"stacked"\`, row \`locked: true\` pins an invariant bar while other bars scale).
- **Part-of-a-whole split or pass threshold** (e.g., 98% test pass vs 25% prod match against a 99% bar) → **\`<RatioBar>\`** (clean single-value display by default; set \`showDenominator\` only when explicit \`x / total\` is needed).
- **Trend over time / scaling curve / cliff inflection** → **\`<LineChart>\`** (zero-stretch HTML labels + crisp SVG curve + \`revealTo()\` progressive draw + \`referenceLine\` / \`referenceBand\`).
- **Time intervals / Gantt / concurrent waterfall** → **\`<TimeLanes>\`** (full tick gridlines, animated \`setCursor()\` playhead, \`focusDatum()\` lane dimming, and automatic external labels so narrow bars never clip text).
- **2D trade-off / cost-vs-accuracy Pareto frontier** → **\`<ScatterPlot pareto="top-left">\`** (auto-computes and strokes the Pareto frontier polyline, optional quadrant tint).
- **2D matrix density / attention weights / confusion matrix** → **\`<Heatmap>\`** (high-contrast auto-white text on dark cells, row/col/cell \`focusDatum()\`).
- **Proportional multi-stage flow / funnel conservation** → **\`<Sankey>\`** (\`d3-sankey\` curved cubic-Bezier ribbons tapering from wide to narrow, single-path \`focusDatum()\`).
- **Step-by-step positive/negative attribution** (how 100% dropped to 30%) → **\`<Waterfall>\`** (cumulative floating steps + dashed stair connectors + \`revealTo()\`).
- **Multi-dimension profile comparison** (4–7 axes) → **\`<Radar>\`** (polygonal spiderweb rings + translucent series overlays + direct axis/delta scores).

## Narrative step effects (deterministic compile-time snapshots)
Import \`focusDatum\`, \`revealTo\`, \`pinBaseline\`, and \`setCursor\` from \`@joplo-app/plugin-viz\`:
- \`focusDatum(chartId, targetId | targetIds | null)\`: dim unrelated bars/points/lanes/rows/nodes while spotlighting the active datum. For Heatmap, pass \`'row:<name>'\`, \`'col:<name>'\`, \`'cell:<r>:<c>'\`, or a \`cellAnchors\` id.
- \`revealTo(chartId, cutoff | null)\`: reveal a \`LineChart\` up to an X label or index, or a \`Waterfall\` up to a step id or index.
- \`pinBaseline(chartId)\`: lock the chart's current numeric values as the remembered baseline in \`step.ext.viz.baselines\`. (Step 0 values are also captured automatically when \`baseline\` is omitted.)
- \`setCursor(chartId, value | null, { label? })\`: slide a vertical playhead across \`TimeLanes\` or \`LineChart\`.

## Addressable anchors & silent observation windows
- Give every important item/point/span/node/step an \`id\` (or pass \`itemIds\` / \`spanIds\` / \`pointIds\` / \`cellAnchors\` when data comes from state bindings). Every registered id receives a DOM \`data-jid\` anchor so \`camera()\`, \`callout()\`, \`highlight()\`, \`spotlight()\`, and Alt-click review inspection land directly on the bar, point, or cell.
- Pair big quantitative transitions (e.g., \`DeltaBar\` retract, \`LineChart\` \`revealTo\`, \`TimeLanes\` \`setCursor\`) with a brief silent observation beat (\`narrate(false)\` + \`hold(2.0)\`) so viewers watch the motion without competing audio.

## Verify & pitfalls
- Run \`npx joplo check\`: fix \`VIZ_DATA_INVALID\`, \`VIZ_CHART_UNKNOWN\`, \`RATIO_BAR_INVALID\`, or \`TIME_LANES_INVALID\` before rendering.
- Never wrap charts inside redundant bordered cards with duplicate titles when \`title\` / \`subtitle\` props already live on the chart.
- Give narrow \`TimeLanes\` spans (\`< 24%\` of domain) a concise \`shortLabel\` so the bar carries the short pill while the full \`label\` floats cleanly beside the bar without clipping.
- Read \`npx joplo skill viz/components\` for full prop tables and \`npx joplo skill viz/recipes\` for animation and framing patterns.

Related topics: components, authoring, focus, check, plugins
`;

export const recipes = `# Narrative DataViz recipes and pitfalls

## 1. Before-vs-after payoff without spoiling the reveal (DeltaBar)
Start at the baseline step with \`value === baseline\` (so no savings badge spoils the twist early), then update the bound state in a silent observation beat:
\`\`\`tsx
<DeltaBar
  id="payoff"
  title="单请求实测资源与延迟"
  unit="%"
  lowerIsBetter
  items={[
    { id: 'delta_cpu', label: '单请求 CPU', baseline: 100, value: $.ui.cpuRust, deltaLabel: '−70%' },
    { id: 'delta_mem', label: '单请求内存', baseline: 100, value: $.ui.memRust, deltaLabel: '−80%+' },
    { id: 'delta_ttft', label: '中位 TTFT', baseline: 100, value: $.ui.ttftRust, deltaLabel: '−20%' },
  ]}
/>
\`\`\`
In the flow:
1. Show Python baseline (\`cpuRust: 100, memRust: 100, ttftRust: 100\`) — clean solid bars, zero premature savings text.
2. Drop values (\`cpuRust: 30, memRust: 20, ttftRust: 80\`) with \`narrate(false)\` + \`hold(2.2)\` — bars retract smoothly with row stagger, uncovering the dashed ghost baseline and emerald savings band.
3. Add \`focusDatum('payoff', 'delta_mem')\` + \`callout('delta_mem', '内存直降八成+')\` to spotlight one metric.

## 2. Invariant-locked comparison (BarChart)
Mark constant rows with \`locked: true\` (\`lockedLabel: 'LOCKED · 不变量'\`). When toggling a knob (like loop depth 1× → 2× → 4×), viewers immediately see which bar stays frozen while other bars grow.

## 3. Progressive trend & inflection callout (LineChart)
Use \`revealTo('trend', '5 月')\` to hold suspense on an early plateau, then \`revealTo('trend', '9 月')\` in a silent observation step, followed by \`callout('pt_june', '6 月规则沉淀 → 断崖收敛')\` anchored directly on the point id.

## 4. Narrow bars in TimeLanes
If a span occupies less than ~24% of \`domain\`, pass \`shortLabel\` (e.g., \`shortLabel: '零停服切流'\`, \`label: '公开流量分批切入 Rust'\`). \`TimeLanes\` centers \`shortLabel\` inside the bar and floats the full \`label\` into the adjacent open track so text is never truncated.

## 5. Single-path storytelling in Sankey & Heatmap
- \`Sankey\`: use \`focusDatum('flow', ['diff', 'gate'])\` to dim quiet baseline traffic while illuminating the anomalous cascade.
- \`Heatmap\`: pass \`cellAnchors={{ '4:2': 'cell_rust_code' }}\` and use \`focusDatum('attn', 'row:Rust')\` + \`callout('cell_rust_code', '最高权重 0.46')\` to walk viewers through one row at a time.
`;

export function componentGuide(): string {
  return [
    '# Data Visualization component catalog (@joplo-app/plugin-viz)',
    'Import these markers and effects (`focusDatum`, `revealTo`, `pinBaseline`, `setCursor`) from `@joplo-app/plugin-viz`; enable `viz` in `config.plugins`.',
    ...Object.entries(COMPONENT_DOCS).map(([name, doc]) =>
      ['## ' + name, doc, ...(COMPONENT_EXAMPLES[name as keyof typeof COMPONENT_EXAMPLES] ? ['', '```tsx', COMPONENT_EXAMPLES[name as keyof typeof COMPONENT_EXAMPLES], '```'] : [])].join('\n'),
    ),
  ].join('\n\n');
}
