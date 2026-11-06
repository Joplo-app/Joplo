import { useMemo } from 'react';
import { useI18n } from '../context';
import { boardDictionary } from './dictionaries';
export { boardEnglish, type BoardMessages } from './dictionaries';
export function useBoardI18n() {
  const shared = useI18n();
  const t = useMemo(() => ({ ...shared.t, ...boardDictionary(shared.locale) }), [shared.t, shared.locale]);
  return { ...shared, t };
}
