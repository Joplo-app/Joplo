import { useI18n } from './context';
import { translate, type Text } from './messages';
/** This element stores a message reference in React state and translates on every locale change. */
export function LocalText({ value }: { value: Text }) {
  const { t } = useI18n();
  return <>{translate(value,t)}</>;
}
