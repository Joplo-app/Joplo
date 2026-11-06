/**
 * 舞台外观（D55）：配色（主题名）、字体、线条。字体与线条为 null 时用主题自己的值。
 * 消费者：Stage 根节点（data-theme / data-stroke / data-font，字体用 --jp-font 覆盖）、字幕区与手机外框（.jtheme）、
 * 渲染路由（导出图片、视频与 renderStep 的 URL 参数 font / stroke）。只读 --jp-*，不涉及看板 Token。
 * 只用本机字体：手写体是已打包的 Excalifont + 霞鹜漫黑（缺字用小赖），楷体是已打包的霞鹜文楷，其余都是系统字体栈。
 */
import { isAppearanceFont, isAppearanceStroke, type AppearanceFont, type AppearanceStroke } from '@joplo-app/core';
import { strokeOfTheme, type StrokeMode } from './themes';

export type { AppearanceFont, AppearanceStroke } from '@joplo-app/core';
/** 一套外观：theme 必有；font / stroke 为 null = 跟随主题。 */
export type Look = { theme: string; font: AppearanceFont | null; stroke: AppearanceStroke | null };

export const FONT_STACKS: Record<AppearanceFont, string> = {
  hand: '"Joplo Excalifont", "Joplo Marker Gothic", "Joplo Xiaolai", "PingFang SC", sans-serif',
  sans: 'system-ui, -apple-system, "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", "Microsoft YaHei", sans-serif',
  serif: '"Songti SC", STSong, "Noto Serif SC", "Source Han Serif SC", SimSun, "Times New Roman", serif',
  kai: '"Joplo Excalifont", "Joplo WenKai", "Kaiti SC", STKaiti, KaiTi, BiauKai, serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, "Joplo Marker Gothic", monospace',
};

/** 字体名 → CSS 字体栈；null 或未知值 = 不覆盖（跟随主题）。 */
export function fontStack(font: AppearanceFont | null | undefined): string | null {
  return isAppearanceFont(font) ? FONT_STACKS[font] : null;
}

/** 消费者实际用的值：线条落到 rough / clean，字体覆盖写成内联的 --jp-font（优先于主题 CSS）。 */
export function resolveLook(look: Look, authorThemes: Record<string, string> = {}): { theme: string; stroke: StrokeMode; font: AppearanceFont | null; style: Record<string, string> } {
  const stack = fontStack(look.font);
  return {
    theme: look.theme,
    stroke: isAppearanceStroke(look.stroke) ? look.stroke : strokeOfTheme(look.theme, authorThemes),
    font: stack ? look.font : null,
    style: stack ? { '--jp-font': stack } : {},
  };
}

/** 渲染路由（导出、renderStep）读 URL 参数 font / stroke；未知值忽略。 */
export function appearanceFromParams(params: URLSearchParams): { font: AppearanceFont | null; stroke: AppearanceStroke | null } {
  const font = params.get('font');
  const stroke = params.get('stroke');
  return { font: isAppearanceFont(font) ? font : null, stroke: isAppearanceStroke(stroke) ? stroke : null };
}

/** 字体覆盖的内联样式（.jtheme 部件与舞台根节点用）。 */
export const fontStyle = (font: AppearanceFont | null | undefined): Record<string, string> | undefined => {
  const s = fontStack(font);
  return s ? { '--jp-font': s } : undefined;
};
