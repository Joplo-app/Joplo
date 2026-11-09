/**
 * 渲染服务——第一方内部层：只给仓库内的标准库（ui / diagram / content）用，和引擎同版本发布，不保证兼容。
 * 这些是把标准组件原来写在引擎里的能力（手绘描边、响应式取值、选项与分栏推导、主题外观）交还给插件用的通道，
 * 形状跟着标准库的需要变。第三方与二方插件只用 `@joplo-app/kit/renderer`（稳定层）。
 */
import type { ReactNode } from 'react';
import { rendererHost as host, type RendererContext, type RendererServices } from './renderer.ts';

export const useR: RendererServices['useR'] = (...args) => host().useR(...args);
export const useStroke = () => host().useStroke();
export const useLook = () => host().useLook();
export const Rough = (p: any): ReactNode => (host().Rough as (p: any) => ReactNode)(p);
export const RoughPath = (p: any): ReactNode => (host().RoughPath as (p: any) => ReactNode)(p);
export const roundRectPath: RendererServices['roundRectPath'] = (...args) => host().roundRectPath(...args);
export const RendererContextProvider = (props: { value: Pick<RendererContext, 'width' | 'dialogLayer'>; children?: ReactNode }): ReactNode => (host().RendererContextProvider as (p: typeof props) => ReactNode)(props);
export const atWidth: RendererServices['atWidth'] = (...args) => host().atWidth(...args);
export const childWidth: RendererServices['childWidth'] = (...args) => host().childWidth(...args);
export const choicesOf: RendererServices['choicesOf'] = (...args) => host().choicesOf(...args);
export const layoutRegions: RendererServices['layoutRegions'] = (...args) => host().layoutRegions(...args);
export const resolveValue: RendererServices['resolveValue'] = (...args) => host().resolveValue(...args);
export const styleOf: RendererServices['styleOf'] = (...args) => host().styleOf(...args);
