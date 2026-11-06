import { en, type Dictionary } from '../en';
import { boardEn, createBoardEn, type BoardDictionary } from './en';
import { createBoardZhCN } from './zh-CN';
import type { Locale } from '../locale';
import { createBoardZhTW } from './zh-TW';
import { createBoardJa } from './ja';
import { createBoardKo } from './ko';
import { createBoardEs } from './es';
import { createBoardFr } from './fr';
import { createBoardDe } from './de';
import { createBoardPtBR } from './pt-BR';
import { createBoardRu } from './ru';
export type BoardMessages = Dictionary & BoardDictionary;
export const boardEnglish: BoardMessages = { ...en, ...boardEn };
const factories: Record<Locale, () => BoardDictionary> = {
  en: createBoardEn,
  'zh-CN': createBoardZhCN,
  'zh-TW': createBoardZhTW,
  'ja': createBoardJa,
  'ko': createBoardKo,
  'es': createBoardEs,
  'fr': createBoardFr,
  'de': createBoardDe,
  'pt-BR': createBoardPtBR,
  'ru': createBoardRu,
};
export const boardDictionary = (locale: Locale): BoardDictionary => factories[locale]();
