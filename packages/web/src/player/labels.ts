import { en, type Dictionary } from '../i18n/en';
/** 看板与发布站共用的中文标签与芯片样式。 */
export const OUTCOME_LABEL = (i18n: Dictionary = en): Record<'success' | 'failure' | 'cancelled', string> => ({ success: i18n.player.success, failure: i18n.player.failure, cancelled: i18n.player.cancelled });

export const MOCK_CLS: Record<'success' | 'failure' | 'denied' | 'other', string> = {
  success: 'border-[#2b8a3e] text-[#2b8a3e] bg-[#effaf1]',
  failure: 'border-[#c92a2a] text-[#c92a2a] bg-[#fff0f0]',
  denied: 'border-[#5a5a5a] text-[#3a3a3a] bg-[#f4f4f4]',
  other: 'border-[#5a5a5a] text-[#3a3a3a] bg-[#f4f4f4]',
};

export const ACTION_LABEL = (i18n: Dictionary = en): Record<string, string> => ({ click: i18n.player.click, type: i18n.player.type, select: i18n.player.select, toggle: i18n.player.toggle, back: i18n.player.back, event: i18n.player.systemEvent });
