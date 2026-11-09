import { z } from 'zod';
import type { DiagramLayout as DiagramLayoutT } from './model.ts';
const Num = z.number().finite();
const BoxS = z.strictObject({ x: Num, y: Num, w: Num, h: Num });
const PointS = z.strictObject({ x: Num, y: Num });
const Boxes = z.record(z.string(), BoxS);
export const DiagramLayoutSchema: z.ZodType<DiagramLayoutT> = z.union([
  z.strictObject({
    kind: z.literal('graph'),
    engine: z.enum(['elk', 'grid']),
    direction: z.enum(['right', 'down']).optional(),
    width: Num,
    height: Num,
    nodes: Boxes,
    groups: Boxes,
    titles: Boxes,
    edges: z.record(z.string(), z.strictObject({ points: z.array(PointS), label: BoxS.nullable() })),
    starts: Boxes.optional(),
  }),
  z.strictObject({
    kind: z.literal('sequence'),
    width: Num,
    height: Num,
    actors: Boxes,
    lifelines: z.record(z.string(), z.strictObject({ x: Num, y1: Num, y2: Num })),
    messages: z.record(z.string(), z.strictObject({ points: z.array(PointS), label: BoxS.nullable(), n: z.number().int(), self: z.boolean() })),
    groups: Boxes,
    titles: Boxes,
    blocks: Boxes,
    blockTitles: Boxes,
  }),
]) as z.ZodType<DiagramLayoutT>;

export const Trace = z.strictObject({
  mode: z.enum(['ok', 'fail', 'skip']),
  nodes: z.array(z.string().min(1)),
  edges: z.array(z.strictObject({ id: z.string().min(1), reverse: z.boolean().default(false) })),
  /** 路径经过的分组（节点所在的各级分组，D69）：fail 时 errorGroups 是终点所在的分组。没有分组时省略（IR 与旧版相同）。 */
  groups: z.array(z.string().min(1)).optional(),
  errorGroups: z.array(z.string().min(1)).optional(),
  /** 镜头目标：架构图 / 状态机是路径上的节点，时序图是消息（一行一行的）。旧 IR 没有，按 nodes 处理。 */
  targets: z.array(z.string().min(1)).optional(),
});

export type Trace = z.infer<typeof Trace>;
export const NodeData = z.strictObject({ layout: DiagramLayoutSchema, structure: z.record(z.string(), z.unknown()) });
const States = z.record(z.string(), z.strictObject({
  state: z.enum(['idle', 'active', 'ok', 'error', 'dim']),
  reverse: z.boolean().optional(),
}));
export const SceneFrame = z.strictObject({
  traces: z.array(Trace),
  states: States,
  now: z.array(z.string()),
  machines: z.record(z.string(), z.strictObject({ current: z.string().nullable(), states: States })),
});
export const FrameData = z.strictObject({
  scenes: z.record(z.string(), SceneFrame),
});
