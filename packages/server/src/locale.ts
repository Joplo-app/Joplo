/** Export URLs accept exact supported locale tags; invalid or absent values are omitted. */
export const exportLocales = ['en', 'zh-CN', 'zh-TW', 'ja', 'ko', 'es', 'fr', 'de', 'pt-BR', 'ru'] as const;
export type ExportLocale = typeof exportLocales[number];
export function exportLocale(value: unknown): ExportLocale | undefined {
  return typeof value === 'string' && (exportLocales as readonly string[]).includes(value) ? value as ExportLocale : undefined;
}
