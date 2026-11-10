/**
 * 只从白名单与范围裁剪后的公开载荷生成 Tailwind 内容。
 * 原样保存每个字符串：JSON 的引号/反斜杠转义会破坏任意值类名，不能直接扫描 JSON.stringify 的结果。
 * 不限于 className：初始状态、步骤效果、free 反应和插件快照也可能提供运行时类名。
 */
export function publishCssContent(payload: unknown): string {
  const strings = new Set<string>();
  const visit = (value: unknown): void => {
    if (typeof value === 'string') strings.add(value);
    else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') Object.values(value).forEach(visit);
  };
  visit(payload);
  return [...strings].join('\n');
}
