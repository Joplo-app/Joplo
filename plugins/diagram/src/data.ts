import type { SceneNode, Step } from '../../../packages/core/src/schema.ts';
import type { DiagramLayout, GraphStructure, SequenceStructure } from './model.ts';
import type { Trace } from './schema.ts';
import type { DiagramStates } from './state.ts';
export type NodeData = { layout: DiagramLayout; structure: GraphStructure | SequenceStructure };
export type Frame = { traces: Trace[]; states: DiagramStates; now: string[]; machines: Record<string, { current: string | null; states: DiagramStates }> };
export const nodeData = (node: SceneNode) => node.ext?.diagram as NodeData | undefined;
export const frameData = (step: Pick<Step, 'ext'>) => step.ext?.diagram as Frame | undefined;
