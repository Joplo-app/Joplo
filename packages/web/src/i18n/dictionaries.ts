import { createEn, type Dictionary } from './en';
import { createZhCN } from './zh-CN';
import type { Locale } from './locale';
export const dictionary = (locale: Locale): Dictionary => locale === 'zh-CN' ? createZhCN() : createEn(locale);
// TODO(T3): zh-TW, ja, ko, es, fr, de, pt-BR, ru currently reuse the English source.
