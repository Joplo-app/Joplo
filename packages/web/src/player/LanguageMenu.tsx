import { Languages } from 'lucide-react';
import { Badge } from '@tokenroll/juice/primitives';
import { useI18n } from '../i18n/context';
import { useContent } from '../i18n/content-context';
import type { ContentInfo } from '../i18n/content';
import { locales, localeNames } from '../i18n/locale';
import { MenuButton, type MenuEntry, type MenuItem } from './controls';

/** 有作者内容的语言的标签（D84）：使用 Juice Badge（signal / warn），默认语言标“原文”，其他标“译文”。 */
function ContentTag({ text, stale }: { text: string; stale?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-jb">
      {stale ? <Badge tone="warn" className="h-[18px] px-1.5 text-[10.5px]" data-testid="content-stale">{stale}</Badge> : null}
      <Badge tone="signal" className="h-[18px] px-1.5 text-[10.5px]">{text}</Badge>
    </span>
  );
}

/**
 * 语言菜单的项：全部 10 种界面语言，✓ 只表示当前选中。项目有作者内容的语言（D84）带“原文 / 译文”标签；
 * 看板另外给出翻译进度（description）和过期条数。
 */
export function languageItems(current: string, setLocale: (id: (typeof locales)[number]) => void, content: Pick<ContentInfo, 'locales' | 'default' | 'details'> | null, tags: { source: string; translated: string }): MenuItem[] {
  return locales.map((id) => {
    const has = !!content?.locales.includes(id);
    const d = content?.details?.[id];
    return {
      id: `language-${id}`,
      label: localeNames[id],
      lang: id,
      checked: id === current,
      highlight: true,
      radio: true,
      ...(has ? { hint: <ContentTag text={id === content!.default ? tags.source : tags.translated} stale={d?.stale} />, ...(d?.description ? { description: d.description } : {}) } : {}),
      onClick: () => setLocale(id),
    };
  });
}

/** Shared by board and published site; locale names remain readable in their own language. 一个菜单同时决定界面语言和作者内容的语言（D84）。 */
export function LanguageMenu({ iconOnly = false }: { iconOnly?: boolean }) {
  const { locale, t, setLocale } = useI18n();
  const content = useContent();
  const label = `${t.player.language} · Language`;
  return <MenuButton
    trigger={{ icon: <Languages className="size-4" aria-hidden />, label: localeNames[locale], iconOnly }}
    label={label}
    variant="ghost"
    testid="language"
    width={content?.details ? 280 : 240}
    chevron={<></>}
    items={[
      ...(content ? [{ id: 'language-content-note', custom: <div className="px-2.5 pb-1 pt-1.5 font-jb text-[12px] leading-[18px] text-jb-muted" data-testid="language-content-note">{t.site.contentMarkNote}</div> }] as MenuEntry[] : []),
      ...languageItems(locale, setLocale, content, { source: t.site.contentSourceTag, translated: t.site.contentTranslatedTag }),
      ...(content?.footer ? [{ id: 'language-divider', divider: true as const }, { id: 'language-content-add', custom: <div className="px-2.5 pb-1.5 pt-1 font-jb text-[12px] leading-[18px] text-jb-muted">{content.footer}</div> }] as MenuEntry[] : []),
    ]}
  />;
}
