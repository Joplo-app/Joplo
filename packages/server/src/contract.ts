/**
 * v2 接口（ADR-0002）：CLI 只依赖这里导出的三个函数。由 T-board 实现，届时 index.ts 改为导出它们。
 */
import type { AppearanceFont, AppearanceStroke, Diagnostic } from '@joplo-app/core';

export type DevOptions = {
  projectDir: string;
  /** 缺省 4790；被占用时报错，不静默换端口。 */
  port?: number;
  open?: boolean;
  log?: (line: string) => void;
};
/** 单进程：同一个 JOPLO_HOME 下只有一个看板进程，同时服务多个项目（编译、热更新、选中、导出）。 */
/**
 * url：项目在看板中的链接。attached = true 表示本机已有存活的看板，项目只是注册进去（没有启动第二个进程，close 不做事）。
 */
export type DevHandle = { url: string; attached?: boolean; close(): Promise<void> };
export declare function startDev(opts: DevOptions): Promise<DevHandle>;

export type BuildOptions = {
  projectDir: string;
  /** 缺省 `<projectDir>/dist`。 */
  outDir?: string;
  /** 目标目录非空时，必须显式允许才清空重建。 */
  overwrite?: boolean;
};
/** 静态发布站：只含选定方案（compile 的 publish 模式），离线可打开，可直接 `wrangler deploy`。 */
export type BuildResult = { outDir: string; files: string[]; routes: string[]; scenarios: string[]; diagnostics: Diagnostic[] };
export declare function buildSite(opts: BuildOptions): Promise<BuildResult>;

export type RenderOptions = {
  projectDir: string;
  scenarioId: string;
  /** 渲染该步骤执行之后的状态；缺省为初始状态。 */
  stepId?: string;
  /** 主题名（D51）：内置主题或项目 themes/<name>.css；缺省用项目配置的主题。 */
  theme?: string;
  /** UI language for the standalone render route. Unsupported values are ignored. */
  locale?: string;
  /** 字体（D55）：hand / sans / serif / kai / mono；缺省跟随主题。 */
  font?: AppearanceFont | null;
  /** 线条（D55）：rough / clean；缺省跟随主题。 */
  stroke?: AppearanceStroke | null;
  out: string;
  overwrite?: boolean;
  /** 截图尺寸（D44）：舞台宽度仍是页面自己的 viewport，按比例放进这个尺寸。缺省为舞台尺寸。 */
  viewport?: { width: number; height: number };
  scale?: number;
};
export type RenderedElement = { id: string; type: string; label: string; visible: boolean; disabled: boolean; at: string | null; box: { x: number; y: number; width: number; height: number } };
export type RenderResult = { path: string; sceneId: string; position: number; scale: number; elements: RenderedElement[]; warnings: string[] };
export declare function renderStep(opts: RenderOptions): Promise<RenderResult>;
