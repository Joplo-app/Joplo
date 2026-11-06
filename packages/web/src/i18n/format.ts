import type { Locale } from './locale';
export type Value = string | number;
export const number = (value: number, locale: Locale) => new Intl.NumberFormat(locale).format(value);
export const value = (v: Value, locale: Locale) => typeof v === 'number' ? number(v, locale) : v;
export const list = (items: readonly string[], locale: Locale) => new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(items);
/** Supply all six CLDR categories when needed (Russian uses one/few/many/other). */
export function plural(n: number, forms: Partial<Record<Intl.LDMLPluralRule, string>> & { other: string }, locale: Locale): string {
  return (forms[new Intl.PluralRules(locale).select(n)] ?? forms.other).replaceAll('#', number(n, locale));
}
