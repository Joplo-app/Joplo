/** Browser renderer services supplied by the host, shared by React content packages. */
import type { CSSProperties, ReactNode, ComponentType } from 'react';
import type { PluginIRNode, PluginState } from './plugin.ts';
export type NodeProps = { node: PluginIRNode; p: Record<string, unknown>; disabled: boolean; children: ReactNode };
export type RendererContext = { scene: { id: string }; state: PluginState; width: number; animate: boolean; selectedId: string | null; focus?: string[] | null; ext?: Readonly<Record<string, unknown>> };
export type RendererServices = {
  useCtx(): RendererContext;
  useI18n(): { t: { stage: Record<string, unknown> } };
  useR(p: Record<string, unknown>): (key: string) => unknown;
  useRoot(n: PluginIRNode, p: Record<string, unknown>, options?: { disabled?: boolean; className?: string; style?: CSSProperties }): Record<string, any>;
  useRootAttrs(n: PluginIRNode, disabled?: boolean): Record<string, any>;
  useStroke(): 'rough' | 'clean';
  RenderNode: ComponentType<{ node: PluginIRNode }>;
  Rough: ComponentType<any>;
  RoughPath: ComponentType<any>;
  roundRectPath(x: number, y: number, w: number, h: number, radius: number): string;
  rectOf(el: Element): { x: number; y: number; left: number; top: number; width: number; height: number; right: number; bottom: number };
  resolveProps(n: PluginIRNode, state: PluginState): Record<string, unknown>;
  isSelfVisible(n: PluginIRNode, state: PluginState, width?: number): boolean;
  walkNodes(n: PluginIRNode, visit: (node: PluginIRNode) => void): void;
};
const KEY = Symbol.for('joplo.renderer.services.v2');
const global = globalThis as typeof globalThis & { [KEY]?: RendererServices };
export function registerRendererServices(services: RendererServices): void { global[KEY] = Object.freeze(services); }
const host = (): RendererServices => { if (!global[KEY]) throw new Error('Joplo renderer services are not initialized'); return global[KEY]; };
export const useCtx = () => host().useCtx();
export const useI18n = <Messages extends Record<string, unknown>>() => host().useI18n() as { t: { stage: Messages } };
export const useR: RendererServices['useR'] = (...args) => host().useR(...args);
export const useRoot: RendererServices['useRoot'] = (...args) => host().useRoot(...args);
export const useRootAttrs: RendererServices['useRootAttrs'] = (...args) => host().useRootAttrs(...args);
export const useStroke = () => host().useStroke();
// Function components delegate to the host's identical React context, adding no DOM wrapper.
export const RenderNode = (p: { node: PluginIRNode }): ReactNode => (host().RenderNode as (p: { node: PluginIRNode }) => ReactNode)(p);
export const Rough = (p: any): ReactNode => (host().Rough as (p: any) => ReactNode)(p);
export const RoughPath = (p: any): ReactNode => (host().RoughPath as (p: any) => ReactNode)(p);
export const roundRectPath: RendererServices['roundRectPath'] = (...args) => host().roundRectPath(...args);
export const rectOf: RendererServices['rectOf'] = (...args) => host().rectOf(...args);
export const resolveProps: RendererServices['resolveProps'] = (...args) => host().resolveProps(...args);
export const isSelfVisible: RendererServices['isSelfVisible'] = (...args) => host().isSelfVisible(...args);
export const walkNodes: RendererServices['walkNodes'] = (...args) => host().walkNodes(...args);
