/** 自动字幕的唯一文案来源：网页显示与服务端音频有效性校验共用，参数必须先按内容语言本地化。 */
import { isContentLocale, type ContentLocale } from './content-i18n.ts';
import type { Step } from './schema.ts';

type AutoCaptionMessages = {
    autoDrag: (label: string, value: string) => string;
    autoHover: (label: string) => string;
    autoScroll: (label: string, value: string) => string;
    autoClick: (label: string) => string;
    autoType: (label: string, text: string) => string;
    autoSelect: (label: string, text: string) => string;
    autoCheck: (label: string) => string;
    autoUncheck: (label: string) => string;
    autoSwitchOn: (label: string) => string;
    autoSwitchOff: (label: string) => string;
    autoBack: string;
    autoPress: (keys: string) => string;
};
const messages: Record<ContentLocale, AutoCaptionMessages> = {
  'en': {
    autoDrag: (label: string, value: string) => `Drag “${label}” to ${value}`,
    autoHover: (label: string) => `Hover over “${label}”`,
    autoScroll: (label: string, value: string) => `Scroll “${label}” to ${value}`,
    autoClick: (label: string) => `Click “${label}”`,
    autoType: (label: string, text: string) => `Type “${text}” in “${label}”`,
    autoSelect: (label: string, text: string) => `Select “${text}” in “${label}”`,
    autoCheck: (label: string) => `Check “${label}”`,
    autoUncheck: (label: string) => `Uncheck “${label}”`,
    autoSwitchOn: (label: string) => `Turn on “${label}”`,
    autoSwitchOff: (label: string) => `Turn off “${label}”`,
    autoBack: 'Go back',
    autoPress: (keys: string) => keys.trim() ? `Press ${keys}` : 'Press a key',
  },
  'zh-CN': {
    autoDrag: (label: string, value: string) => `拖动「${label}」到 ${value}`,
    autoHover: (label: string) => `悬停在「${label}」`,
    autoScroll: (label: string, value: string) => `滚动「${label}」到 ${value}`,
    autoClick: (label: string) => `\u70b9\u51fb\u300c${label}\u300d`,
    autoType: (label: string, text: string) => `\u5728\u300c${label}\u300d\u4e2d\u8f93\u5165“${text}”`,
    autoSelect: (label: string, text: string) => `\u5728\u300c${label}\u300d\u4e2d\u9009\u62e9“${text}”`,
    autoCheck: (label: string) => `\u52fe\u9009\u300c${label}\u300d`,
    autoUncheck: (label: string) => `\u53d6\u6d88\u52fe\u9009\u300c${label}\u300d`,
    autoSwitchOn: (label: string) => `\u6253\u5f00\u300c${label}\u300d`,
    autoSwitchOff: (label: string) => `\u5173\u95ed\u300c${label}\u300d`,
    autoBack: '\u8fd4\u56de\u4e0a\u4e00\u9875',
    autoPress: (keys: string) => keys.trim() ? `\u6309\u4e0b ${keys}` : '\u6309\u4e0b\u6309\u952e',
  },
  'zh-TW': {
    autoDrag: (label: string, value: string) => `拖曳「${label}」到 ${value}`,
    autoHover: (label: string) => `停留在「${label}」上`,
    autoScroll: (label: string, value: string) => `捲動「${label}」到 ${value}`,
    autoClick: (label: string) => `\u9ede\u9078\u300c${label}\u300d`,
    autoType: (label: string, text: string) => `\u5728\u300c${label}\u300d\u8f38\u5165\u300c${text}\u300d`,
    autoSelect: (label: string, text: string) => `\u5728\u300c${label}\u300d\u9078\u64c7\u300c${text}\u300d`,
    autoCheck: (label: string) => `\u52fe\u9078\u300c${label}\u300d`,
    autoUncheck: (label: string) => `\u53d6\u6d88\u52fe\u9078\u300c${label}\u300d`,
    autoSwitchOn: (label: string) => `\u958b\u555f\u300c${label}\u300d`,
    autoSwitchOff: (label: string) => `\u95dc\u9589\u300c${label}\u300d`,
    autoBack: "\u8fd4\u56de\u4e0a\u4e00\u9801",
    autoPress: (keys: string) => keys.trim() ? `\u6309\u4e0b ${keys}` : "\u6309\u4e0b\u6309\u9375",
  },
  'ja': {
    autoDrag: (label: string, value: string) => `「${label}」を ${value} にドラッグ`,
    autoHover: (label: string) => `「${label}」にポインターを合わせる`,
    autoScroll: (label: string, value: string) => `「${label}」を ${value} までスクロール`,
    autoClick: (label: string) => `\u300c${label}\u300d\u3092\u30af\u30ea\u30c3\u30af`,
    autoType: (label: string, text: string) => `\u300c${label}\u300d\u306b\u300c${text}\u300d\u3092\u5165\u529b`,
    autoSelect: (label: string, text: string) => `\u300c${label}\u300d\u3067\u300c${text}\u300d\u3092\u9078\u629e`,
    autoCheck: (label: string) => `\u300c${label}\u300d\u306b\u30c1\u30a7\u30c3\u30af\u3092\u5165\u308c\u308b`,
    autoUncheck: (label: string) => `\u300c${label}\u300d\u306e\u30c1\u30a7\u30c3\u30af\u3092\u5916\u3059`,
    autoSwitchOn: (label: string) => `\u300c${label}\u300d\u3092\u30aa\u30f3\u306b\u3059\u308b`,
    autoSwitchOff: (label: string) => `\u300c${label}\u300d\u3092\u30aa\u30d5\u306b\u3059\u308b`,
    autoBack: "\u524d\u306e\u30da\u30fc\u30b8\u306b\u623b\u308b",
    autoPress: (keys: string) => keys.trim() ? `${keys} \u3092\u62bc\u3059` : "\u30ad\u30fc\u3092\u62bc\u3059",
  },
  'ko': {
    autoDrag: (label: string, value: string) => `“${label}”을(를) ${value}(으)로 드래그`,
    autoHover: (label: string) => `“${label}” 위에 포인터 놓기`,
    autoScroll: (label: string, value: string) => `“${label}”을(를) ${value}까지 스크롤`,
    autoClick: (label: string) => `“${label}” \ud074\ub9ad`,
    autoType: (label: string, text: string) => `“${label}”\uc5d0 “${text}” \uc785\ub825`,
    autoSelect: (label: string, text: string) => `“${label}”\uc5d0\uc11c “${text}” \uc120\ud0dd`,
    autoCheck: (label: string) => `“${label}” \uccb4\ud06c`,
    autoUncheck: (label: string) => `“${label}” \uccb4\ud06c \ud574\uc81c`,
    autoSwitchOn: (label: string) => `“${label}” \ucf1c\uae30`,
    autoSwitchOff: (label: string) => `“${label}” \ub044\uae30`,
    autoBack: "\uc774\uc804 \ud398\uc774\uc9c0\ub85c",
    autoPress: (keys: string) => keys.trim() ? `${keys} \ub204\ub974\uae30` : "\ud0a4 \ub204\ub974\uae30",
  },
  'es': {
    autoDrag: (label: string, value: string) => `Arrastra «${label}» a ${value}`,
    autoHover: (label: string) => `Mantén el puntero sobre «${label}»`,
    autoScroll: (label: string, value: string) => `Desplaza «${label}» hasta ${value}`,
    autoClick: (label: string) => `Haz clic en «${label}»`,
    autoType: (label: string, text: string) => `Escribe «${text}» en «${label}»`,
    autoSelect: (label: string, text: string) => `Elige «${text}» en «${label}»`,
    autoCheck: (label: string) => `Marca «${label}»`,
    autoUncheck: (label: string) => `Desmarca «${label}»`,
    autoSwitchOn: (label: string) => `Activa «${label}»`,
    autoSwitchOff: (label: string) => `Desactiva «${label}»`,
    autoBack: "Vuelve atrás",
    autoPress: (keys: string) => keys.trim() ? `Pulsa ${keys}` : "Pulsa una tecla",
  },
  'fr': {
    autoDrag: (label: string, value: string) => `Glisser « ${label} » vers ${value}`,
    autoHover: (label: string) => `Survoler « ${label} »`,
    autoScroll: (label: string, value: string) => `Faire défiler « ${label} » jusqu’à ${value}`,
    autoClick: (label: string) => `Cliquer sur « ${label} »`,
    autoType: (label: string, text: string) => `Saisir « ${text} » dans « ${label} »`,
    autoSelect: (label: string, text: string) => `Choisir « ${text} » dans « ${label} »`,
    autoCheck: (label: string) => `Cocher « ${label} »`,
    autoUncheck: (label: string) => `Décocher « ${label} »`,
    autoSwitchOn: (label: string) => `Activer « ${label} »`,
    autoSwitchOff: (label: string) => `Désactiver « ${label} »`,
    autoBack: "Revenir en arrière",
    autoPress: (keys: string) => keys.trim() ? `Appuyer sur ${keys}` : "Appuyer sur une touche",
  },
  'de': {
    autoDrag: (label: string, value: string) => `„${label}“ nach ${value} ziehen`,
    autoHover: (label: string) => `Zeiger auf „${label}“ halten`,
    autoScroll: (label: string, value: string) => `„${label}“ bis ${value} scrollen`,
    autoClick: (label: string) => `„${label}“ anklicken`,
    autoType: (label: string, text: string) => `„${text}“ in „${label}“ eingeben`,
    autoSelect: (label: string, text: string) => `„${text}“ in „${label}“ wählen`,
    autoCheck: (label: string) => `„${label}“ aktivieren`,
    autoUncheck: (label: string) => `„${label}“ deaktivieren`,
    autoSwitchOn: (label: string) => `„${label}“ einschalten`,
    autoSwitchOff: (label: string) => `„${label}“ ausschalten`,
    autoBack: "Zurückgehen",
    autoPress: (keys: string) => keys.trim() ? `${keys} drücken` : "Taste drücken",
  },
  'pt-BR': {
    autoDrag: (label: string, value: string) => `Arraste “${label}” para ${value}`,
    autoHover: (label: string) => `Mantenha o cursor sobre “${label}”`,
    autoScroll: (label: string, value: string) => `Role “${label}” até ${value}`,
    autoClick: (label: string) => `Clique em “${label}”`,
    autoType: (label: string, text: string) => `Digite “${text}” em “${label}”`,
    autoSelect: (label: string, text: string) => `Selecione “${text}” em “${label}”`,
    autoCheck: (label: string) => `Marque “${label}”`,
    autoUncheck: (label: string) => `Desmarque “${label}”`,
    autoSwitchOn: (label: string) => `Ative “${label}”`,
    autoSwitchOff: (label: string) => `Desative “${label}”`,
    autoBack: "Volte",
    autoPress: (keys: string) => keys.trim() ? `Pressione ${keys}` : "Pressione uma tecla",
  },
  'ru': {
    autoDrag: (label: string, value: string) => `Перетащить «${label}» к ${value}`,
    autoHover: (label: string) => `Навести указатель на «${label}»`,
    autoScroll: (label: string, value: string) => `Прокрутить «${label}» до ${value}`,
    autoClick: (label: string) => `Нажать «${label}»`,
    autoType: (label: string, text: string) => `Ввести «${text}» в «${label}»`,
    autoSelect: (label: string, text: string) => `Выбрать «${text}» в «${label}»`,
    autoCheck: (label: string) => `Отметить «${label}»`,
    autoUncheck: (label: string) => `Снять отметку «${label}»`,
    autoSwitchOn: (label: string) => `Включить «${label}»`,
    autoSwitchOff: (label: string) => `Выключить «${label}»`,
    autoBack: "Вернуться назад",
    autoPress: (keys: string) => keys.trim() ? `Нажать ${keys}` : "Нажать клавишу",
  },
};

/** 字典保持原来的 player.auto* 键及延迟翻译接口。 */
export const autoCaptionMessages = (locale: ContentLocale): AutoCaptionMessages => messages[locale];

/** 按当前参数与语言还原实际字幕；未知语言无法证明缓存有效，返回 null。 */
export function automaticCaption(auto: NonNullable<Step['captionAuto']>, locale: string): string | null {
  if (!isContentLocale(locale)) return null;
  const t = autoCaptionMessages(locale);
  switch (auto.kind) {
    case 'drag': return t.autoDrag(auto.label, auto.value ?? '');
    case 'hover': return t.autoHover(auto.label);
    case 'scroll': return t.autoScroll(auto.label, auto.value ?? '');
    case 'click': return t.autoClick(auto.label);
    case 'type': return t.autoType(auto.label, auto.value ?? '');
    case 'select': return t.autoSelect(auto.label, auto.value ?? '');
    case 'check': return t.autoCheck(auto.label);
    case 'uncheck': return t.autoUncheck(auto.label);
    case 'switch_on': return t.autoSwitchOn(auto.label);
    case 'switch_off': return t.autoSwitchOff(auto.label);
    case 'back': return t.autoBack;
    case 'press': return t.autoPress(auto.keys ?? '');
  }
}
