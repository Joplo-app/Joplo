import { Languages } from 'lucide-react';
import { useI18n } from '../i18n/context';
import { useContent } from '../i18n/content-context';
import type { ContentInfo } from '../i18n/content';
import { locales, localeNames } from '../i18n/locale';
import { MenuButton, type MenuEntry, type MenuItem } from './controls';

/** 有作者内容的语言的标签（D84）：默认语言标“原文”，其他标“译文”；看板里过期条数用橙色写在标签前。 */
function ContentTag({ text, stale }: { text: string; stale?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-jb">
      {stale ? <span className="text-[11px] text-[#B45309]" data-testid="content-stale">{stale}</span> : null}
      <span className="rounded-[4px] border border-jb-cloud/30 bg-[var(--jb-cloud-bg)] px-1.5 py-px text-[11px] font-medium leading-4 text-jb-cloud">{text}</span>
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
