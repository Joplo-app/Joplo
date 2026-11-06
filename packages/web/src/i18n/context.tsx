import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { dictionary } from './dictionaries';
import { en, type Dictionary } from './en';
import { initialLocale, isLocale, saveLocale, type Locale } from './locale';
const Context = createContext<{ locale: Locale; t: Dictionary; setLocale: (locale: Locale) => void }>({ locale: 'en', t: en, setLocale: () => undefined });
export function I18nProvider({ children, explicit, extend }: { children: ReactNode; explicit?: unknown; extend?: (locale: Locale) => object }) {
  const [locale, update] = useState(() => initialLocale(explicit));
  const t = useMemo(() => ({ ...dictionary(locale), ...extend?.(locale) }), [locale, extend]);
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
  const setLocale = (next: Locale) => { if (isLocale(next)) { update(next); saveLocale(next); } };
  return <Context.Provider value={{ locale, t, setLocale }}>{children}</Context.Provider>;
}
export const useI18n = () => useContext(Context);
