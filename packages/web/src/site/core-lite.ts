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
// 阅读节奏（D67 从 web 搬到 core 的纯函数，只有常量与算术）
export * from '../../../core/src/pace.ts';
export * from '../../../core/src/focus.ts';
/** 朗读（D74）：读什么、谁来读、音频片段的键，纯函数。 */
export * from '../../../core/src/voice.ts';
/** 作者内容多语言（D84）：把 IR 换成内容语言、内容语言的退回，纯函数（只引用 schema 的类型）。 */
export * from '../../../core/src/content-i18n.ts';

export { autoCaptionMessages } from '../../../core/src/auto-caption.ts';
export * from '../../../core/src/themes.ts';

export * from "../../../core/src/playground.ts";

export * from "../../../core/src/media.ts";
