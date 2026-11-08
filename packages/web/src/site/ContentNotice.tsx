import { Languages } from 'lucide-react';
import { useI18n } from '../i18n/context';
import { useContent } from '../i18n/content-context';
import { isLocale, localeNames } from '../i18n/locale';
import { cn } from '@/lib/utils';

/** 内容退回默认语言时的一行说明（D83）：观众的界面语言项目里没有，看到的是作者原文。没有退回时不渲染。 */
export function ContentFallbackNotice({ variant = 'bar' }: { variant?: 'bar' | 'cover' }) {
  const content = useContent();
  const { t, locale } = useI18n();
  if (!content?.fallback) return null;
  const source = isLocale(content.default) ? localeNames[content.default] : content.default;
  const text = t.site.contentFallback(localeNames[locale], source);
  if (variant === 'cover') return <span className="max-w-full truncate text-[12px] opacity-85" data-testid="content-fallback">{text}</span>;
  return (
    <div role="note" className={cn('flex shrink-0 items-center gap-2 rounded-[8px] border border-jb-line bg-jb-surface px-3 py-1.5 font-jb text-[13px] text-jb-muted')} data-testid="content-fallback">
      <Languages className="size-4 shrink-0" aria-hidden />
      <span className="min-w-0 truncate">{text}</span>
    </div>
  );
}
