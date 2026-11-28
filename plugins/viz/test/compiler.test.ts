import { compile, type AuthoringProject } from '@joplo-app/core';
import { $, callout, chapter, config, highlight, set, shot, spotlight, work, type WorkDef } from '@joplo-app/kit';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { describe, expect, it } from 'vitest';
import viz, {
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
  computeParetoFrontier,
  computeWaterfall,
  focusDatum,
  formatDeltaPercent,
  pinBaseline,
  revealTo,
  setCursor,
  type VizFrame,
} from '../src/plugin.ts';

function compileViz(
  stage: ReturnType<typeof jsx>,
  script: WorkDef['scenarios'][string] = chapter('Demo').system('Show'),
  state?: WorkDef['state'],
) {
  const input: AuthoringProject = {
    root: '/p',
    layouts: {},
    routes: {},
    features: {},
    config: { ...config({ name: 'VizTest', plugins: [viz] }), file: '/p/joplo.config.ts' },
    works: {
      demo: {
        ...work({ title: 'Demo', summary: 'Viz compile test', stage, state, scenarios: { show: script } }),
        file: '/p/works/demo.tsx',
      },
    },
  };
  return compile(input, 'dev');
}

const errorsOf = (r: ReturnType<typeof compileViz>) =>
  r.diagnostics.filter((d) => d.severity === 'error').map((d) => d.code);

describe('pure math helpers', () => {
  it('computes Pareto frontier for all 4 corners', () => {
    const pts = [
      { id: 'mini', x: 0.8, y: 71 },
      { id: 'mid', x: 4.4, y: 90.5 },
      { id: 'dom', x: 8.5, y: 78 },
      { id: 'ultra', x: 18, y: 90.8 },
    ];
    expect(computeParetoFrontier(pts, 'top-left').map((p) => p.id)).toEqual(['mini', 'mid', 'ultra']);
    expect(computeParetoFrontier(pts, 'bottom-right').map((p) => p.id)).toEqual(['mini', 'dom', 'ultra']);
  });

  it('computes cumulative waterfall intervals', () => {
    const bars = computeWaterfall([
      { label: 'Start', value: 100, kind: 'start' },
      { label: 'Parse', value: -40 },
      { label: 'GC', value: -30 },
      { label: 'Net', value: 30, kind: 'total' },
    ]);
    expect(bars.map((b) => [b.start, b.end])).toEqual([
      [0, 100],
      [100, 60],
      [60, 30],
      [0, 30],
    ]);
  });

  it('formats delta percentages cleanly', () => {
    expect(formatDeltaPercent(100, 30)).toBe('−70%');
    expect(formatDeltaPercent(100, 115)).toBe('+15%');
    expect(formatDeltaPercent(100, 100)).toBe('0%');
    expect(formatDeltaPercent(100, 20, '−80%+')).toBe('−80%+');
  });
});

describe('compile.node validation', () => {
  it.each([
    { total: 0, left: 0 },
    { total: -1, left: 0 },
    { total: 1, left: -1 },
    { total: 10, left: 2, right: -1 },
    { total: 10, left: 9, right: 2 },
    { total: 10, left: 0, threshold: -1 },
    { total: 10, left: 0, threshold: 11 },
    { total: 10, left: $.ui.left, right: 11 },
    { total: 10, left: '5' },
    { total: 10 },
    { total: 100, left: Number.NaN },
    { segments: [] },
    { total: 100, segments: [{ value: 60 }, { value: 50 }] },
  ])('rejects invalid RatioBar props %o', (props) => {
    expect(errorsOf(compileViz(jsx(RatioBar, { id: 'rb', ...props })))).toContain('RATIO_BAR_INVALID');
  });

  it('defers RatioBar binding checks and accepts multi-segment bars', () => {
    expect(
      errorsOf(
        compileViz(jsx(RatioBar, { id: 'rb1', total: $.data.cap, left: $.ui.used, right: 2, threshold: $.data.lim })),
      ),
    ).toEqual([]);
    expect(
      errorsOf(
        compileViz(
          jsx(RatioBar, {
            id: 'rb2',
            total: 100,
            segments: [
              { id: 's1', label: 'A', value: 40 },
              { id: 's2', label: 'B', value: 35 },
            ],
          }),
        ),
      ),
    ).toEqual([]);
  });

  it.each([
    [{ domain: [0, 0], spans: [] }, 'greater'],
    [{ domain: [3, -3], spans: [] }, 'greater'],
    [{ domain: [0, 10], spans: [{ id: 'a', lane: 'L', start: 6, end: 2 }] }, 'end >= start'],
    [{ domain: [0, 10], spans: [{ id: 'a', lane: 'L', start: 0, end: 11 }] }, 'inside domain'],
    [{ domain: [0, 10], spans: [{ id: 'a', lane: 'L', start: 0, end: 5 }, { id: 'a', lane: 'L', start: 5, end: 8 }] }, 'duplicate id'],
    [{ domain: [0, 10], spans: [], spanIds: ['x', 'x'] }, 'spanIds'],
  ])('reports TIME_LANES_INVALID for %o', (props, msg) => {
    const r = compileViz(jsx(TimeLanes, { id: 'tl', ...props }));
    expect(r.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'TIME_LANES_INVALID', message: expect.stringContaining(msg) })]),
    );
  });

  it('validates bound TimeLanes intervals & ID collisions per step', () => {
    const auth = { id: 'auth', lane: 'GW', start: 0, end: 30 };
    const r = compileViz(
      jsx(TimeLanes, { id: 'tl', domain: [0, 100], spans: $.data.spans }),
      chapter('Timing')
        .system('Outside', set($.data.spans, [{ ...auth, end: 500 }]))
        .system('Collision', set($.data.spans, [{ ...auth, id: 'tl' }])),
      { data: { spans: [auth] } },
    );
    const msgs = r.diagnostics.filter((d) => d.code === 'TIME_LANES_INVALID').map((d) => d.message);
    expect(msgs.some((s) => /position 1.*inside domain/.test(s))).toBe(true);
    expect(msgs.some((s) => /position 2.*tl.*already belongs/.test(s))).toBe(true);
  });

  it('validates required array/key props on other viz components', () => {
    expect(errorsOf(compileViz(jsx(DeltaBar, { id: 'd', items: 'bad' as unknown as [] })))).toContain('VIZ_DATA_INVALID');
    expect(errorsOf(compileViz(jsx(BarChart, { id: 'b', data: [], dataKey: '', series: [] })))).toContain('VIZ_DATA_INVALID');
    expect(errorsOf(compileViz(jsx(LineChart, { id: 'l', data: [], dataKey: '', series: [] })))).toContain('VIZ_DATA_INVALID');
    expect(errorsOf(compileViz(jsx(ScatterPlot, { id: 's', points: null as unknown as [] })))).toContain('VIZ_DATA_INVALID');
    expect(errorsOf(compileViz(jsx(Heatmap, { id: 'h', rows: [], cols: [], values: 'x' as unknown as [] })))).toContain('VIZ_DATA_INVALID');
    expect(errorsOf(compileViz(jsx(Sankey, { id: 'k', nodes: [], links: 'x' as unknown as [] })))).toContain('VIZ_DATA_INVALID');
    expect(errorsOf(compileViz(jsx(Waterfall, { id: 'w', steps: 'x' as unknown as [] })))).toContain('VIZ_DATA_INVALID');
    expect(errorsOf(compileViz(jsx(Radar, { id: 'r', axes: [], series: 'x' as unknown as [] })))).toContain('VIZ_DATA_INVALID');
  });
});

describe('compile.effect, sub-anchors, and compile.frame deterministic snapshots', () => {
  it('registers sub-anchors for focus/callout/shot/spotlight and lowers viz effects into deterministic snapshots', () => {
    const r = compileViz(
      jsx(DeltaBar, {
        id: 'delta',
        unit: '%',
        items: [
          { id: 'delta_cpu', label: 'CPU', value: $.ui.cpu as unknown as number },
          { id: 'delta_mem', label: 'Memory', value: $.ui.mem as unknown as number },
        ],
      }),
      chapter('Migration')
        .system('Baseline')
        .system('Cutover', set($.ui.cpu, 30), set($.ui.mem, 20), focusDatum('delta', 'delta_cpu'), callout('delta_cpu', 'Saved 70%'))
        .system('Pin & Reset', pinBaseline('delta'), focusDatum('delta', null), highlight('delta_mem'), spotlight('delta_cpu'), shot('delta_cpu')),
      { ui: { cpu: 100, mem: 100 } },
    );

    expect(errorsOf(r)).toEqual([]);
    const project = r.project!;
    const sc = project.scenarios['demo.show']!;

    // Step 0 auto-captures initial baselines (100, 100) on scenario.ext.viz
    const s0 = sc.ext?.viz as VizFrame | undefined;
    expect(s0?.charts.delta?.baselines).toEqual({ delta_cpu: 100, delta_mem: 100 });
    expect(s0?.charts.delta?.focus).toBeUndefined();

    // Step 2 preserves Step 0 baselines while ui values drop to 30/20, and records focus
    const s2 = sc.steps[1]?.ext?.viz as VizFrame | undefined;
    expect(s2?.charts.delta?.baselines).toEqual({ delta_cpu: 100, delta_mem: 100 });
    expect(s2?.charts.delta?.focus).toEqual(['delta_cpu']);

    // Step 3 re-pins baseline to current values (30, 20) and clears focus
    const s3 = sc.steps[2]?.ext?.viz as VizFrame | undefined;
    expect(s3?.charts.delta?.baselines).toEqual({ delta_cpu: 30, delta_mem: 20 });
    expect(s3?.charts.delta?.focus).toBeNull();
  });

  it('lowers revealTo and setCursor into snapshots and reports unknown chart IDs', () => {
    const r = compileViz(
      jsx(TimeLanes, {
        id: 'tl',
        domain: [4, 9],
        unit: '月',
        spans: [{ id: 'cutover', lane: 'Cutover', start: 8, end: 9, label: 'Zero-downtime cutover' }],
      }),
      chapter('Plan')
        .system('Move cursor', setCursor('tl', 8.5, '8.5 月'), revealTo('tl', 1))
        .system('Clear cursor', setCursor('tl', null), revealTo('tl', null)),
    );
    expect(errorsOf(r)).toEqual([]);
    const sc = r.project!.scenarios['demo.show']!;
    const s1 = sc.steps[0]?.ext?.viz as VizFrame | undefined;
    expect(s1?.charts.tl?.cursor).toEqual({ value: 8.5, label: '8.5 月' });
    expect(s1?.charts.tl?.reveal).toBe(1);
    const s2 = sc.steps[1]?.ext?.viz as VizFrame | undefined;
    expect(s2?.charts.tl?.cursor).toBeNull();
    expect(s2?.charts.tl?.reveal).toBeNull();

    const bad = compileViz(
      jsx(TimeLanes, { id: 'tl', domain: [0, 10], spans: [] }),
      chapter('Bad').system('Unknown', focusDatum('missing_chart', 'x')),
    );
    expect(errorsOf(bad)).toContain('VIZ_CHART_UNKNOWN');
  });
});
