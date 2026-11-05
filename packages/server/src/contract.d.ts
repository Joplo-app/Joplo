/**
 * v2 接口（ADR-0002）：CLI 只依赖这里导出的三个函数。由 T-board 实现，届时 index.ts 改为导出它们。
 */
import type { Diagnostic } from '@joplo/core';
export type DevOptions = {
    projectDir: string;
    /** 缺省 4790；被占用时报错，不静默换端口。 */
    port?: number;
    open?: boolean;
    log?: (line: string) => void;
};
/** 单进程：一个 Vite 开发服务同时提供看板、编译（ssrLoadModule + core.compile）与热更新。 */
export type DevHandle = {
    url: string;
    close(): Promise<void>;
};
export declare function startDev(opts: DevOptions): Promise<DevHandle>;
export type BuildOptions = {
    projectDir: string;
    /** 缺省 `<projectDir>/dist`。 */
    outDir?: string;
    /** 目标目录非空时，必须显式允许才清空重建。 */
    overwrite?: boolean;
};
/** 静态发布站：只含选定方案（compile 的 publish 模式），离线可打开，可直接 `wrangler deploy`。 */
export type BuildResult = {
    outDir: string;
    files: string[];
    routes: string[];
    scenarios: string[];
    diagnostics: Diagnostic[];
};
export declare function buildSite(opts: BuildOptions): Promise<BuildResult>;
export type RenderOptions = {
    projectDir: string;
    scenarioId: string;
    /** 渲染该步骤执行之后的状态；缺省为初始状态。 */
    stepId?: string;
    theme?: 'sketch' | 'clean';
    out: string;
    overwrite?: boolean;
    viewport?: {
        width: number;
        height: number;
    };
    scale?: number;
};
export type RenderedElement = {
    id: string;
    type: string;
    label: string;
    visible: boolean;
    disabled: boolean;
    at: string | null;
    box: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
};
export type RenderResult = {
    path: string;
    sceneId: string;
    position: number;
    scale: number;
    elements: RenderedElement[];
    warnings: string[];
};
export declare function renderStep(opts: RenderOptions): Promise<RenderResult>;
