/**
 * 画板“当前选中”（D15）：`joplo dev` 写入 `<项目>/.joplo/selection.json`，`joplo selection` 读取。
 * Agent 拿到 `at`（文件:行:列）后只打开那一处修改，这是省 token 的主路径（D25）。
 * 文件内容为 Selection 或 null（已取消选中）。不进入 Git（.joplo/ 应被忽略）。
 */
export type Selection = {
  featureId: string | null;
  workId: string | null;
  scenarioId: string | null;
  /** 0 = 初始状态，k = 已执行 k 步。 */
  position: number;
  stepId: string | null;
  sceneId: string;
  route: string;
  /** 选中的元素；只选中步骤时为 null。 */
  nodeId: string | null;
  /** 元素（或步骤）的源位置 `相对路径:行:列`。 */
  at: string | null;
  /** 元素的人类可读标签。 */
  label: string | null;
  /** 选中时的 ISO 时间。 */
  selectedAt: string;
};
