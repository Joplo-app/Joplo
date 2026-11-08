import { useI18n } from '../i18n/context';
export type Author = { name: string; url: string };
/** 云端覆盖作者自带 meta 后注入。只在官方 HTTPS 分享路径读取 head；本地、导出和其他托管不认。 */
export function readAuthor(doc: Pick<Document, 'querySelector'> | undefined = typeof document === 'undefined' ? undefined : document, page: Pick<Location, 'origin' | 'pathname'> | undefined = typeof location === 'undefined' ? undefined : location): Author | null {
  if (page?.origin !== 'https://joplo.app' || !/^\/s\/[A-Za-z0-9]{10}(?:\/|$)/.test(page.pathname)) return null;
  const content = doc?.querySelector('head > meta[name="joplo-author"]')?.getAttribute('content');
  if (!content) return null;
  try {
    const a = JSON.parse(content);
    if (!a || typeof a.name !== 'string' || !a.name.trim() || typeof a.url !== 'string') return null;
    const url = new URL(a.url);
    if (url.origin !== 'https://show.joplo.app' || url.username || url.password) return null;
    return { name: a.name.trim(), url: url.href };
  } catch { return null; }
}
export function AuthorLink({ author }: { author: Author | null | undefined }) {
  const { t } = useI18n();
  if (!author) return null;
  return <a href={author.url} target="_blank" rel="noopener noreferrer" className="jb-focus inline-flex min-h-6 max-w-[220px] items-center rounded px-1 text-[12px] text-jb-muted hover:underline" data-testid="author-link"><span className="truncate">{t.site.authorMoreWorks(author.name)}</span></a>;
}
