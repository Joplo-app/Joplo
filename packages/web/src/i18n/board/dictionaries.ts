import { en, type Dictionary } from '../en';
import { boardEn, createBoardEn, type BoardDictionary } from './en';
import { createBoardZhCN } from './zh-CN';
import type { Locale } from '../locale';
export type BoardMessages = Dictionary & BoardDictionary;
export const boardEnglish: BoardMessages = { ...en, ...boardEn };
export const boardDictionary = (locale: Locale): BoardDictionary => locale === 'zh-CN' ? createBoardZhCN() : createBoardEn(locale);
// TODO(T3): register translated board dictionaries here for the remaining eight locales.
