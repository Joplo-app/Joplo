import { compileStage, renderStage } from '../../content/test/plugin-stage.tsx';
import { describe, expect, it } from 'vitest';
import { $, chapter, set, type WorkDef } from '@joplo-app/kit';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import type { Project } from '@joplo-app/core';
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
  focusDatum,
  revealTo,
  setCursor,
} from '../src/plugin.ts';

function buildStage(
  stage: ReturnType<typeof jsx>,
  script: WorkDef['scenarios'][string] = chapter('Demo').system('Show'),
  state?: WorkDef['state'],
) {
  return compileStage(viz, stage, state, script);
}

function renderAt(project: Project, position = 0) {
  return renderStage(project, position);
}

describe('all 10 @joplo-app/plugin-viz components render cleanly in Stage', () => {
  it('DeltaBar renders ghost baseline retract and paired mode with addressable rows', () => {
    const r = buildStage(
      jsx(DeltaBar, {
        id: 'delta',
        title: 'Rust Rewrite Impact',
        unit: '%',
        lowerIsBetter: true,
        items: [
          { id: 'd_cpu', label: 'CPU / req', value: $.ui.cpu as unknown as number, deltaLabel: '−70%' },
          { id: 'd_mem', label: 'Memory / req', value: $.ui.mem as unknown as number },
        ],
      }),
      chapter('Delta')
        .system('Baseline')
        .system('After', set($.ui.cpu, 30), set($.ui.mem, 20), focusDatum('delta', 'd_cpu')),
      { ui: { cpu: 100, mem: 100 } },
    );
    expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const before = renderAt(r.project!, 0);
    expect(before).toContain('data-jid="d_cpu"');
    expect(before).toContain('100%');
    const after = renderAt(r.project!, 2);
    expect(after).toContain('−70%');
    expect(after).toContain('−80%');
    expect(after).toContain('opacity:0.26'); // dimmed d_mem

    const paired = buildStage(
      jsx(DeltaBar, {
        id: 'delta_p',
        variant: 'paired',
        unit: 'ms',
        lowerIsBetter: true,
        items: [{ id: 'p_ttft', label: 'TTFT', baseline: 100, value: 80 }],
      }),
    );
    const pairedHtml = renderAt(paired.project!, 0);
    expect(pairedHtml).toContain('−20%');
    expect(pairedHtml).toContain('80ms');
  });

  it('RatioBar formats single-value cleanly by default, supports showDenominator, smart 2-color mapping & segments', () => {
    const single = buildStage(
      jsx(RatioBar, {
        id: 'rb_single',
        total: 100,
        left: 98,
        threshold: 99,
        labels: ['Parity'],
        remainderLabel: 'Gap',
        colors: ['warn', 'danger'],
        unit: '%',
      }),
    );
    const outSingle = renderAt(single.project!, 0);
    expect(outSingle).toContain('98%');
    expect(outSingle).not.toContain('98% / 100%');
    expect(outSingle).toContain('2% Gap');
    expect(outSingle).toContain('--jp-warn');
    expect(outSingle).toContain('--jp-danger');

    const withDenom = buildStage(
      jsx(RatioBar, {
        id: 'rb_denom',
        total: 200,
        left: 35,
        right: 25,
        threshold: 80,
        labels: ['Used', 'Reserved'],
        remainderLabel: 'Available',
        colors: ['danger', 'info', 'ok'],
        unit: 'GB',
        showDenominator: true,
      }),
    );
    const outDenom = renderAt(withDenom.project!, 0);
    for (const token of ['Used 35GB / 200GB', 'Reserved 25GB / 200GB', 'Available 140GB / 200GB', 'Threshold 80GB']) {
      expect(outDenom).toContain(token);
    }

    const segs = buildStage(
      jsx(RatioBar, {
        id: 'rb_segs',
        total: 100,
        unit: '%',
        segments: [
          { id: 'seg_a', label: 'Compute', value: 45, color: 'accent' },
          { id: 'seg_b', label: 'I/O', value: 30, color: 'ok' },
        ],
      }),
    );
    const outSegs = renderAt(segs.project!, 0);
    expect(outSegs).toContain('data-jid="seg_a"');
    expect(outSegs).toContain('Compute');
    expect(outSegs).toContain('45%');
  });

  it('BarChart renders vertical stacked/grouped & horizontal locked invariant bars', () => {
    const r = buildStage(
      jsx(BarChart, {
        id: 'bc',
        title: 'Context Cost',
        dataKey: 'stage',
        layout: 'stacked',
        unit: 'K',
        series: [
          { name: 'base', label: 'Base', color: 'accent' },
          { name: 'delta', label: 'Delta', color: 'warn' },
        ],
        data: [
          { id: 'b1', stage: 'Cold', base: 40, delta: 20 },
          { id: 'b2', stage: 'Warm', base: 40, delta: 5, deltaBadge: '−25%' },
        ],
      }),
    );
    const out = renderAt(r.project!, 0);
    expect(out).toContain('data-jid="b1"');
    expect(out).toContain('−25%');
    expect(out).toContain('60K');

    const horiz = buildStage(
      jsx(BarChart, {
        id: 'bc_h',
        orientation: 'horizontal',
        dataKey: 'metric',
        series: [{ name: 'v', color: 'ok' }],
        data: [{ id: 'h1', metric: 'Quality', v: 92, locked: true, lockedLabel: 'LOCKED' }],
      }),
    );
    const outH = renderAt(horiz.project!, 0);
    expect(outH).toContain('LOCKED');
    expect(outH).toContain('data-jid="h1"');
  });

  it('LineChart renders SVG path, reference line, and revealTo width clip', () => {
    const r = buildStage(
      jsx(LineChart, {
        id: 'lc',
        dataKey: 'step',
        unit: '%',
        series: [{ name: 'pass', label: 'Pass Rate', color: 'ok', area: true }],
        referenceLine: { value: 99, label: 'Target 99%' },
        data: [
          { id: 'p1', step: 'Apr', pass: 72 },
          { id: 'p2', step: 'Jun', pass: 94 },
          { id: 'p3', step: 'Sep', pass: 99.6 },
        ],
      }),
      chapter('Trend').system('Mid', revealTo('lc', 2)),
    );
    const out = renderAt(r.project!, 1);
    expect(out).toContain('<svg');
    expect(out).toContain('Target 99%');
    expect(out).toContain('data-jid="p1"');
    expect(out).toContain('data-jid="p2"');
    expect(out).not.toContain('data-jid="p3"');
  });

  it('TimeLanes renders narrow-bar external label, vertical ticks, and animated cursor', () => {
    const r = buildStage(
      jsx(TimeLanes, {
        id: 'tl',
        domain: [4, 9],
        unit: '月',
        spans: [
          { id: 'inner', lane: 'Inner Loop', start: 4, end: 5.5, label: 'Debug with Claude', status: 'warn' },
          {
            id: 'cutover',
            lane: 'Cutover',
            start: 8.1,
            end: 9,
            label: 'Public Traffic to Rust (Zero Downtime)',
            shortLabel: 'Zero-Downtime',
            status: 'ok',
          },
        ],
      }),
      chapter('Rollout').system('Cutover', setCursor('tl', 8.5, '8.5 月'), focusDatum('tl', 'cutover')),
    );
    const out = renderAt(r.project!, 1);
    expect(out).toContain('data-jid="cutover"');
    expect(out).toContain('Zero-Downtime');
    expect(out).toContain('Public Traffic to Rust (Zero Downtime)');
    expect(out).toContain('8.5 月');
  });

  it('ScatterPlot auto-draws Pareto frontier polyline and addressable points', () => {
    const r = buildStage(
      jsx(ScatterPlot, {
        id: 'sp',
        title: 'Cost vs Accuracy',
        xUnit: '$',
        yUnit: '%',
        pareto: 'top-left',
        quadrant: { x: 10, y: 80, label: 'Sweet Spot' },
        points: [
          { id: 'pt_mini', label: 'Mini-8B', x: 0.8, y: 71 },
          { id: 'pt_new', label: 'Loopx2', x: 4.4, y: 90.5, tier: 'highlight' },
          { id: 'pt_old', label: 'Old-A', x: 8.5, y: 78, tier: 'dominated' },
          { id: 'pt_ultra', label: 'Ultra', x: 18, y: 90.8 },
        ],
      }),
    );
    const out = renderAt(r.project!, 0);
    expect(out).toContain('data-jpareto="frontier"');
    expect(out).toContain('data-jid="pt_new"');
    expect(out).toContain('Sweet Spot');
  });

  it('Heatmap renders high-contrast matrix cells and row focus dimming', () => {
    const r = buildStage(
      jsx(Heatmap, {
        id: 'hm',
        rows: ['System', 'Rust'],
        cols: ['System', 'Rust'],
        values: [
          [0.64, 0.12],
          [0.05, 0.88],
        ],
        cellAnchors: { '1:1': 'cell_rust_rust' },
      }),
      chapter('Attn').system('Focus Rust', focusDatum('hm', 'row:Rust')),
    );
    const out = renderAt(r.project!, 1);
    expect(out).toContain('data-jid="cell_rust_rust"');
    expect(out).toContain('0.88');
    expect(out).toContain('color:#ffffff'); // auto white text on deep indigo cell
    expect(out).toContain('opacity:0.2'); // dimmed non-Rust row
  });

  it('Sankey renders d3-sankey curved cubic-Bezier ribbons and node focus', () => {
    const r = buildStage(
      jsx(Sankey, {
        id: 'sk',
        unit: '%',
        nodes: [
          { id: 'n_in', label: 'Input' },
          { id: 'n_fast', label: 'Fast Path', tone: 'ok' },
          { id: 'n_slow', label: 'Fallback', tone: 'warn' },
        ],
        links: [
          { id: 'l_fast', source: 'n_in', target: 'n_fast', value: 78, label: '78%' },
          { id: 'l_slow', source: 'n_in', target: 'n_slow', value: 22, label: '22%' },
        ],
      }),
      chapter('Flow').system('Trace Fast', focusDatum('sk', 'l_fast')),
    );
    const out = renderAt(r.project!, 1);
    expect(out).toContain('data-jsankey-ribbon="l_fast"');
    expect(out).toContain('data-jid="n_fast"');
    expect(out).toContain('C '); // cubic Bezier curve command in path d
    expect(out).toContain('78%');
  });

  it('Waterfall renders cumulative steps, stair connectors, and revealTo', () => {
    const r = buildStage(
      jsx(Waterfall, {
        id: 'wf',
        unit: 'ms',
        lowerIsBetter: true,
        steps: [
          { id: 'w0', label: 'Python', value: 100, kind: 'start' },
          { id: 'w1', label: 'Rust Parser', value: -45 },
          { id: 'w2', label: 'Zero-Copy', value: -25 },
          { id: 'w3', label: 'Final', value: 30, kind: 'total' },
        ],
      }),
      chapter('Perf').system('Step 2', revealTo('wf', 2)),
    );
    const out = renderAt(r.project!, 1);
    expect(out).toContain('data-jid="w0"');
    expect(out).toContain('−45ms');
    expect(out).toContain('opacity:0.12'); // unrevealed future steps dimmed
  });

  it('Radar renders polygonal spiderweb rings, scale ticks, and series polygons', () => {
    const r = buildStage(
      jsx(Radar, {
        id: 'rd',
        axes: [
          { key: 'cpu', label: 'CPU Eff', deltaLabel: '30 → 95' },
          { key: 'mem', label: 'Memory' },
          { key: 'lat', label: 'Latency' },
          { key: 'safe', label: 'Safety' },
          { key: 'ops', label: 'Zero-Downtime' },
        ],
        series: [
          { id: 's_py', name: 'Python', values: { cpu: 30, mem: 25, lat: 70, safe: 60, ops: 85 }, dashed: true },
          { id: 's_rs', name: 'Rust', values: { cpu: 95, mem: 92, lat: 90, safe: 96, ops: 98 }, color: 'ok' },
        ],
      }),
    );
    const out = renderAt(r.project!, 0);
    expect(out).toContain('data-jring="3"');
    expect(out).toContain('<polygon');
    expect(out).toContain('data-jid="s_rs"');
    expect(out).toContain('30 → 95');
  });
});
