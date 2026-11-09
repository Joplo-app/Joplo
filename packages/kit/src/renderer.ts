/**
 * 渲染服务（浏览器端，由宿主注入）——稳定层。
 *
 * 任何插件的运行时都可以依赖这里的导出：读渲染上下文与引擎时钟、给根元素加上引擎要的属性、渲染子节点、
 * 取属性的当前值、量元素位置。改动这里的签名要升插件接口版本（PLUGIN_API_VERSION）。
 *
 * 只给仓库内标准库（ui / diagram / content）用的服务（手绘描边、响应式取值、选项与分栏推导、外观）在
 * `@joplo-app/kit/renderer-internal`，不保证兼容，第三方与二方插件不要依赖。
 */
import type { CSSProperties, ReactNode, ComponentType } from 'react';
import type { ActionDispatch, EngineFrame, ActionPresentation, PluginIRNode, PluginState } from './plugin.ts';
export type NodeProps = { node: PluginIRNode; p: Record<string, unknown>; disabled: boolean; children: ReactNode };
export type RendererContext = { act?: ActionDispatch; hover?: (id: string | null) => void; interactive?: boolean; clock?: EngineFrame; gesture?: ActionPresentation | null; resetKey?: string; playground?: boolean; scene: { id: string; route: string }; state: PluginState; width: number; animate: boolean; selectedId: string | null; focus?: string[] | null; ext?: Readonly<Record<string, unknown>>;
  stage?: HTMLElement | null; dialogLayer: HTMLElement | null;
  preview: {nodeId:string;text:string}|null;
  mode: 'review'|'demo'|'render';
  changed?: readonly {path:string;before:unknown;after:unknown}[];
};
export type RendererServices = {
  motion: Record<keyof import('react').JSX.IntrinsicElements, ComponentType<any>>;
  RendererContextProvider: ComponentType<{value: Pick<RendererContext, 'width'|'dialogLayer'>; children?: ReactNode}>;
  useLook(): {theme:string;font:string|null;style: Record<string,string>|undefined};
  atWidth(value:unknown,width:number):unknown;
  childWidth(node:PluginIRNode,width:number,props?:Record<string,unknown>):number;
  choicesOf(node:PluginIRNode,state:PluginState): {value:string;label:string}[]|null;
  layoutRegions(node:PluginIRNode,state:PluginState,width:number):Record<string,{size:number;collapsed:boolean;mobile:boolean}|null>;
  resolveValue(value:unknown,state:PluginState):unknown;
  styleOf(props:Record<string,unknown>,width:number):CSSProperties;

  nodeLabel(node:PluginIRNode):string;
  useCtx(): RendererContext;
  /** Subscribe to every engine clock frame (D99). Only per-frame presenters need it; useCtx().clock changes only on run / pause / speed, with live time fields. */
  useEngineFrame(enabled?: boolean): EngineFrame | undefined;
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
/** 宿主注入的全部服务。插件不要直接用它：稳定层从本模块导入，内部层从 renderer-internal 导入。 */
export const rendererHost = (): RendererServices => { if (!global[KEY]) throw new Error('Joplo renderer services are not initialized'); return global[KEY]; };
const host = rendererHost;
export const useCtx = () => host().useCtx();
export const useEngineFrame = (enabled = true) => host().useEngineFrame(enabled);
export const useI18n = <Messages extends Record<string, unknown>>() => host().useI18n() as { t: { stage: Messages } };
export const useRoot: RendererServices['useRoot'] = (...args) => host().useRoot(...args);
export const useRootAttrs: RendererServices['useRootAttrs'] = (...args) => host().useRootAttrs(...args);
// Function components delegate to the host's identical React context, adding no DOM wrapper.
export const RenderNode = (p: { node: PluginIRNode }): ReactNode => (host().RenderNode as (p: { node: PluginIRNode }) => ReactNode)(p);
export const rectOf: RendererServices['rectOf'] = (...args) => host().rectOf(...args);
export const resolveProps: RendererServices['resolveProps'] = (...args) => host().resolveProps(...args);
export const isSelfVisible: RendererServices['isSelfVisible'] = (...args) => host().isSelfVisible(...args);
export const walkNodes: RendererServices['walkNodes'] = (...args) => host().walkNodes(...args);
export const nodeLabel: RendererServices['nodeLabel'] = (...args) => host().nodeLabel(...args);

/** Clocked drawing primitives provided by the host; no plugin animation timers. */
export const motion = new Proxy({} as Record<keyof import('react').JSX.IntrinsicElements, ComponentType<any>>, { get: (_target, key: string) => host().motion[key as keyof import('react').JSX.IntrinsicElements] });
