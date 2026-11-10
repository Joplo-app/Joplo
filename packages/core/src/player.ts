/**
 * 播放器的出口（为导入方保留一个名字），实现分三个模块：
 * - scene-query.ts：画面查询——查找元素、取属性的值、可见与禁用、选项与分栏、层级；
 * - playback.ts：回放——状态转换（applyStep）、时间线缓存（stateAt）、回放校验、解释一次点击；
 * - presentation.ts：演示投影——镜头、过渡卡、角色、流式输出、分叉、标注、状态变化。
 * 依赖方向：scene-query ← playback ← presentation。
 */
export * from './scene-query.ts';
export * from './playback.ts';
export * from './presentation.ts';
