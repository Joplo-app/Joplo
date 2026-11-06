import { createEn, type Dictionary } from './en';
import { createZhCN } from './zh-CN';
import type { Locale } from './locale';
import { createZhTW } from './zh-TW';
import { createJa } from './ja';
import { createKo } from './ko';
import { createEs } from './es';
import { createFr } from './fr';
import { createDe } from './de';
import { createPtBR } from './pt-BR';
import { createRu } from './ru';
const factories: Record<Locale, () => Dictionary> = {
  en: createEn,
  'zh-CN': createZhCN,
  'zh-TW': createZhTW,
  'ja': createJa,
  'ko': createKo,
  'es': createEs,
  'fr': createFr,
  'de': createDe,
  'pt-BR': createPtBR,
  'ru': createRu,
};
export const dictionary = (locale: Locale): Dictionary => factories[locale]();
