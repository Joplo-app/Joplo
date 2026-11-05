/**
 * 本地预览服务与渲染截图（由 T-web 实现）。CLI 只依赖这里导出的两个函数。
 */
export type ServeOptions = { projectDir: string; port?: number; host?: '127.0.0.1'; open?: boolean };
export type ServeHandle = { url: string; token: string; close(): Promise<void> };

export type RenderOptions = {
  projectDir: string;
  optionId?: string;
  scenarioId: string;
  /** 渲染该步骤执行之后的状态；缺省为场景初始状态。 */
  stepId?: string;
  theme?: 'sketch' | 'clean';
  out: string;
  viewport?: { width: number; height: number };
};
export type RenderedElement = { id: string; type: string; label: string; visible: boolean; disabled: boolean; box: { x: number; y: number; width: number; height: number } };
export type RenderResult = { path: string; sceneId: string; position: number; elements: RenderedElement[]; warnings: string[] };

export async function startServer(_opts: ServeOptions): Promise<ServeHandle> {
  throw new Error('startServer 尚未实现');
}

export async function renderStep(_opts: RenderOptions): Promise<RenderResult> {
  throw new Error('renderStep 尚未实现');
}
