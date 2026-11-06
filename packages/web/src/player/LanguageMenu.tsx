import { Languages } from 'lucide-react';
import { useI18n } from '../i18n/context';
import { locales, localeNames } from '../i18n/locale';
import { MenuButton } from './controls';
/** Shared by board and published site; locale names remain readable in their own language. */
export function LanguageMenu({ iconOnly = false }: { iconOnly?: boolean }) {
  const { locale, t, setLocale } = useI18n();
  const label = `${t.player.language} · Language`;
  return <MenuButton
    trigger={{ icon: <Languages className="size-4" aria-hidden />, label: localeNames[locale], iconOnly }}
    label={label}
    variant="ghost"
    testid="language"
    width={240}
    chevron={<></>}
    items={locales.map((id) => ({ id: `language-${id}`, label: localeNames[id], lang: id, checked: id === locale, highlight: true, radio: true, onClick: () => setLocale(id) }))}
  />;
}
