import { compileStage, renderStage } from '../../content/test/plugin-stage.tsx';
import { chapter } from '@joplo-app/kit';
import { jsx, jsxs } from '@joplo-app/kit/jsx-runtime';
import { describe, expect, it } from 'vitest';
import diagram, {
  ArchNode,
  ArrayCell,
  ArrayStrip,
  BoardZone,
  CacheNode,
  ClusterBox,
  Database,
  DeviceFrame,
  ERField,
  ERTable,
  FlowEdge,
  FlowNode,
  QueuePipe,
  StickFigure,
  StickyNote,
  TECH_ICONS,
  TechIcon,
  pulse,
  resolveTechIconId,
  setStatus,
} from '../src/plugin.ts';

describe('@joplo-app/plugin-diagram merged board & icon primitives', () => {
  it('registers 86 authentic tech icons, 5 stylized themes, and progressive domain skillTopics', () => {
    expect(TECH_ICONS).toHaveLength(86);
    for (const id of TECH_ICONS) {
      expect(resolveTechIconId(id)).toBe(id);
    }
    expect(resolveTechIconId('postgresql')).toBe('postgres');
    expect(resolveTechIconId('k8s')).toBe('kubernetes');
    expect(resolveTechIconId('lambda')).toBe('aws-lambda');
    expect(Object.keys(diagram.themes ?? {})).toEqual(
      expect.arrayContaining(['juice', 'sketch', 'juice-dark', 'riso', 'blueprint']),
    );
    expect(Object.keys(diagram.skillTopics ?? {})).toEqual(
      expect.arrayContaining(['patterns', 'icons', 'arch', 'whiteboard', 'dsa-flow']),
    );
  });

  it('compiles and renders manual architecture nodes, FlowEdge pulse, setStatus, icons, whiteboard, DSA, and ER primitives', () => {
    const stage = jsxs(BoardZone, {
      id: 'zone_1',
      eyebrow: 'SYSTEM DESIGN',
      title: 'Manual Checkout Architecture',
      children: [
        jsx(StickFigure, { id: 'u1', pose: 'coding', label: 'Dev' }),
        jsxs(ClusterBox, {
          id: 'vpc',
          label: 'AWS VPC',
          cloud: 'aws',
          children: [
            jsx(ArchNode, { id: 'gw', label: 'API Gateway', icon: 'aws-apigw', fill: 'solid' }),
            jsx(ArchNode, { id: 'svc', label: 'Order Service', icon: 'go', replicas: 6 }),
            jsx(CacheNode, { id: 'cache', label: 'Redis', engine: 'redis', hitRate: 96 }),
            jsx(QueuePipe, { id: 'mq', label: 'orders.events', engine: 'kafka' }),
            jsx(Database, { id: 'pg', label: 'Orders Primary', engine: 'postgres', storage: '2.4 TB' }),
          ],
        }),
        jsx(FlowEdge, { id: 'e_gw_svc', from: 'gw', to: 'svc', label: 'gRPC' }),
        jsx(TechIcon, { id: 'ic_cf', icon: 'cloudflare', variant: 'badge' }),
        jsx(StickyNote, { id: 'sn_1', title: 'SLO', text: 'p99 < 40ms', color: 'yellow' }),
        jsx(DeviceFrame, { id: 'dev_1', kind: 'terminal', title: 'zsh', children: jsx(TechIcon, { icon: 'kubernetes', variant: 'badge', label: 'kubectl ready' }) }),
        jsxs(ArrayStrip, { id: 'arr_1', label: 'Partition', children: [jsx(ArrayCell, { value: 42, index: 0, pointer: 'pivot', state: 'pivot' })] }),
        jsx(FlowNode, { id: 'fn_1', shape: 'decision', label: 'Valid?' }),
        jsxs(ERTable, { id: 'er_1', name: 'orders', children: [jsx(ERField, { name: 'id', type: 'uuid', pk: true })] }),
      ],
    });

    const script = chapter('Board')
      .system('Request', pulse('e_gw_svc', { label: 'POST /order', tone: 'accent' }))
      .system('Alert', setStatus('svc', 'hot'));

    const res = compileStage(diagram, stage, {}, script);
    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);

    const sid = res.project!.works.demo!.layers!.stage!.sceneId;
    const step1Ext = res.project!.scenarios['demo.show']!.steps[0]!.ext?.diagram as any;
    expect(step1Ext.scenes[sid].pulses.e_gw_svc).toMatchObject({ active: true, label: 'POST /order' });

    const step2Ext = res.project!.scenarios['demo.show']!.steps[1]!.ext?.diagram as any;
    expect(step2Ext.scenes[sid].nodeStates.svc).toBe('hot');
    expect(step2Ext.scenes[sid].pulses).toBeUndefined();

    const html = renderStage(res.project!, 2);
    expect(html).toContain('API Gateway');
    expect(html).toContain('data-bd-status="hot"');
    expect(html).toContain('data-bd-icon="cloudflare"');
    expect(html).toContain('Orders Primary');
    expect(html).toContain('Valid?');
  });

  it('reports diagnostics for invalid FlowEdge, unknown pulse target, and invalid setStatus', () => {
    const stage = jsxs(BoardZone, {
      id: 'zone_err',
      children: [
        jsx(ArchNode, { id: 'n1', label: 'Node' }),
        jsx(FlowEdge, { id: 'bad_edge', from: '', to: 'n1' }),
      ],
    });
    const script = chapter('Bad')
      .system('Bad pulse', pulse('missing_edge'))
      .system('Bad status', setStatus('missing_node', 'hot'));
    const res = compileStage(diagram, stage, {}, script);
    const codes = res.diagnostics.map((d) => d.code);
    expect(codes).toContain('DIAGRAM_EDGE_INVALID');
    expect(codes).toContain('DIAGRAM_EDGE_UNKNOWN');
    expect(codes).toContain('DIAGRAM_TARGET_UNKNOWN');
  });
});
