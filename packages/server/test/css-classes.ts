/** 发布样式回归用：解析选择器并反转义，不靠任意值类名的 CSS 拼写猜测。 */
import { createRequire } from 'node:module';

/** PostCSS 取真实选择器，反转 CSSOM 转义：\:、\[、\' 及 \32 等十六进制。 */
export function cssClasses(css: string): Set<string> {
  const require = createRequire(import.meta.resolve('vite'));
  const postcss = require('postcss');
  const out = new Set<string>();
  postcss.parse(css).walkRules((rule: { selector: string }) => {
    for (const m of rule.selector.matchAll(/(?<!\\)\.((?:\\(?:[\da-fA-F]{1,6}\s?|[^\n])|[-\w\u0080-\uffff])+)/g)) {
      out.add(m[1]!.replace(/\\([\da-fA-F]{1,6})(?:\r\n|[\t\n\f\r ])?|\\([^\n])/g, (_, hex, char) => hex ? String.fromCodePoint(parseInt(hex, 16)) : char));
    }
  });
  return out;
}

/** 初始状态、步骤效果与 className 均可能含类名，取全部公开字符串中的完整 token。 */
export function publicClassTokens(payload: unknown, available: ReadonlySet<string>): Set<string> {
  const used = new Set<string>();
  const visit = (value: unknown): void => {
    if (typeof value === 'string') for (const token of value.split(/\s+/)) { if (available.has(token)) used.add(token); }
    else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') Object.values(value).forEach(visit);
  };
  visit(payload);
  return used;
}
