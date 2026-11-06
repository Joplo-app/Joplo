/**
 * 发布站构建时把 `@joplo-app/core` 指向这里：只打包播放器与目录（纯函数），
 * 不带 zod schema、编译器等创作侧代码（它们包含 rules / cases 等字样，D33）。
 */
export * from '../../../core/src/catalog.ts';
export * from '../../../core/src/player.ts';
export * from '../../../core/src/result.ts';
export type * from '../../../core/src/schema.ts';
export type { Selection } from '../../../core/src/selection.ts';
export * from '../../../core/src/embed.ts';
export * from '../../../core/src/features.ts';
