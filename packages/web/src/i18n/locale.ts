export const locales = ['en', 'zh-CN', 'zh-TW', 'ja', 'ko', 'es', 'fr', 'de', 'pt-BR', 'ru'] as const;
export type Locale = typeof locales[number];
export const localeNames: Record<Locale, string> = { en: 'English', 'zh-CN': '简体中文', 'zh-TW': '繁體中文', ja: '日本語', ko: '한국어', es: 'Español', fr: 'Français', de: 'Deutsch', 'pt-BR': 'Português (Brasil)', ru: 'Русский' };
export const LOCALE_KEY = 'joplo.locale';
export const isLocale = (v: unknown): v is Locale => typeof v === 'string' && (locales as readonly string[]).includes(v);
export function matchLocale(tag: string): Locale | null {
  const value = tag.toLowerCase();
  if (/^zh(?:-|$)/.test(value)) return /^zh-(?:hant|tw|hk|mo)(?:-|$)/.test(value) ? 'zh-TW' : 'zh-CN';
  if (/^pt(?:-|$)/.test(value)) return 'pt-BR';
  return locales.find((l) => l.toLowerCase() === value) ?? locales.find((l) => l === value.split('-')[0]) ?? null;
}
export function resolveLocale({ explicit, saved, languages }: { explicit?: unknown; saved?: unknown; languages?: readonly string[] } = {}): Locale {
  if (isLocale(explicit)) return explicit;
  if (isLocale(saved)) return saved;
  for (const tag of languages ?? []) { const match = typeof tag === 'string' ? matchLocale(tag) : null; if (match) return match; }
  return 'en';
}
type StorageAccess = () => Pick<Storage, 'getItem' | 'setItem'>;
export function readLocale(storage: StorageAccess = () => localStorage): string | null {
  try { return storage().getItem(LOCALE_KEY); } catch { return null; }
}
export function saveLocale(locale: Locale, storage: StorageAccess = () => localStorage): void {
  try { storage().setItem(LOCALE_KEY, locale); } catch { /* file:// may deny storage; the in-memory choice still applies. */ }
}
export function initialLocale(explicit?: unknown): Locale {
  return resolveLocale({ explicit, saved: readLocale(), languages: typeof navigator === 'undefined' ? [] : navigator.languages });
}
