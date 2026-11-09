import type { Locale } from './locale';
export type Value = string | number;
export const number = (value: number, locale: Locale) => new Intl.NumberFormat(locale).format(value);
export const value = (v: Value, locale: Locale) => typeof v === 'number' ? number(v, locale) : v;
export function list(items: readonly string[], locale: Locale): string {
  const formatter = new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' });
  // Keep the original Chinese delimiter while using Intl to identify list boundaries.
  return locale === 'zh-CN' ? formatter.formatToParts(items).map((p) => p.type === 'literal' ? '\u3001' : p.value).join('') : formatter.format(items);
}
/** Supply all six CLDR categories when needed (Russian uses one/few/many/other). */
export function plural(n: number, forms: Partial<Record<Intl.LDMLPluralRule, string>> & { other: string }, locale: Locale): string {
  return (forms[new Intl.PluralRules(locale).select(n)] ?? forms.other).replaceAll('#', number(n, locale));
}
/** Two-digit ordinal for automatic chapter numbering (D102): 1 → 01. Latin digits in every supported locale. */
export const twoDigits = (n: number, locale: Locale) => new Intl.NumberFormat(locale, { minimumIntegerDigits: 2, useGrouping: false }).format(n);
/** Clock-style duration m:ss (D102 chapter lengths): 280000 ms → 4:40. Rounded to the second. */
export function clock(ms: number, locale: Locale): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${number(Math.floor(total / 60), locale)}:${twoDigits(total % 60, locale)}`;
}
