import { useMemo } from 'react';
import { useI18n } from '../context';
import { createBoardEn, boardEn, type BoardDictionary } from './en';
import { createBoardZhCN } from './zh-CN';
import { en, type Dictionary } from '../en';
export { boardEnglish, type BoardMessages } from './dictionaries';
export function useBoardI18n() {
  const shared = useI18n();
  // TODO(T3): zh-TW, ja, ko, es, fr, de, pt-BR, ru reuse the English board source.
  const t = useMemo(() => ({ ...shared.t, ...(shared.locale === 'zh-CN' ? createBoardZhCN() : createBoardEn(shared.locale)) }), [shared.t, shared.locale]);
  return { ...shared, t };
}
