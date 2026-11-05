export type ServeOptions = {
  projectDir: string;
  /** 缺省 4790；传 0 使用随机空闲端口。 */
  port?: number;
  host?: '127.0.0.1';
  open?: boolean;
  /** 不检查/构建网页产物（测试或已确认产物最新时使用）。 */
  skipBuild?: boolean;
  /** 日志输出（缺省写 stderr）。 */
  log?: (msg: string) => void;
  /**
   * 固定的项目快照：给出时 /api/project 始终返回它，不再读取文件（renderStep 用它保证
   * 截图与元素索引来自同一次读取）。
   */
  projectSnapshot?: unknown;
};
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
  /** 目标文件已存在时是否覆盖；缺省拒绝写入。 */
  overwrite?: boolean;
  /** 截图像素密度，缺省 1。 */
  scale?: number;
};
/** box 为 CSS 像素，相对舞台左上角；与截图像素的换算为 截图像素 = CSS 像素 × RenderResult.scale。 */
export type RenderedElement = { id: string; type: string; label: string; visible: boolean; disabled: boolean; box: { x: number; y: number; width: number; height: number } };
export type RenderResult = {
  path: string;
  sceneId: string;
  position: number;
  elements: RenderedElement[];
  warnings: string[];
  /** 截图像素密度（deviceScaleFactor）；elements[].box 不受它影响，始终是 CSS 像素。 */
  scale: number;
};
