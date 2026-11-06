import { useI18n } from '../i18n/context';
/**
 * 把所有主题（内置 + 当前项目的作者主题）限定作用范围后注入页面（D51）。每个应用根（看板、发布站、渲染路由）放一个。
 * 主题只作用于 .jstage[data-theme=名字] 与 .jtheme[data-theme=名字]，不影响看板本身。
 */
import { useMemo } from 'react';
import { allThemesCss } from './themes';

export function ThemeStyles({ themes }: { themes?: Record<string, string> | null }) {
  const { t: i18n } = useI18n();

  const key = JSON.stringify(themes ?? {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const css = useMemo(() => allThemesCss(themes ?? {}, i18n), [key, i18n]);
  return <style data-joplo-themes="">{css}</style>;
}
