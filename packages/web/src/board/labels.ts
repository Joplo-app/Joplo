import type { Locale } from '../i18n/locale';
import { boardEnglish, type BoardMessages } from '../i18n/board/dictionaries';
/** 看板（创作侧）专用的中文标签与芯片样式。不进入发布站。 */
import { pluginSpec, type Coverage, type PluginTable, type Rule } from '@joplo-app/core/runtime';

export const COVERAGE_LABEL = (i18n: BoardMessages = boardEnglish): Record<Coverage['status'], { text: string; cls: string; hint: string }> => ({
  expressed: { text: i18n.board.covered, cls: 'border-[#1c5fb8] bg-[#eef4ff] text-[#1c5fb8]', hint: i18n.board.aDemoScenarioCoversThisCaseThisDoesNot },
  undecided: { text: i18n.board.undecided, cls: 'border-[#b35c00] bg-[#fff4e0] text-[#8a4700] font-semibold', hint: i18n.board.howToHandleThisCaseIsUndecided },
  missing: { text: i18n.board.missing, cls: 'border-[#c92a2a] bg-[#fff0f0] text-[#c92a2a] font-semibold', hint: i18n.board.thisOptionDoesNotCoverThisCaseYet },
  not_applicable: { text: i18n.board.notApplicable, cls: 'border-[#9a9a9a] bg-[#f4f4f4] text-[#5a5a5a]', hint: i18n.board.thisCaseDoesNotApplyToThisOption },
  excluded: { text: i18n.board.excluded, cls: 'border-[#9a9a9a] bg-white text-[#6b6b6b] line-through decoration-1', hint: i18n.board.explicitlyExcludedFromThisScope },
});

/** 规则来源与确认状态的芯片（D55：看板 Token；AI 假设用虚线，颜色不单独表意）。 */
export const ORIGIN_LABEL = (i18n: BoardMessages = boardEnglish): Record<Rule['origin'], { text: string; cls: string }> => ({
  user: { text: i18n.board.user, cls: 'border-jb-ink bg-jb-surface text-jb-fg' },
  ai_assumption: { text: i18n.board.aiAssumption, cls: 'border-dashed border-jb-ink bg-jb-selected text-jb-fg font-semibold' },
  project_material: { text: i18n.board.projectMaterial, cls: 'border-jb-line bg-jb-sunken text-jb-fg' },
  code_observed: { text: i18n.board.observedInCode, cls: 'border-jb-line bg-jb-sunken text-jb-fg' },
  feedback: { text: i18n.board.feedback, cls: 'border-jb-line bg-jb-surface text-jb-fg' },
});

export const CONFIRM_LABEL = (i18n: BoardMessages = boardEnglish): Record<Rule['confirmation'], { text: string; cls: string }> => ({
  confirmed: { text: i18n.board.confirmed, cls: 'border-jb-ok bg-jb-ok-bg text-jb-ok' },
  pending: { text: i18n.board.pending, cls: 'border-jb-line bg-jb-surface text-jb-muted' },
  conflict: { text: i18n.board.conflict, cls: 'border-jb-danger bg-jb-danger-bg text-jb-danger font-semibold' },
  out_of_scope: { text: i18n.board.outOfScope, cls: 'border-jb-line bg-jb-surface text-jb-faint' },
});

export const DIMENSION_LABEL = (i18n: BoardMessages = boardEnglish): Record<string, string> => ({
  main: i18n.board.mainFlow,
  input: i18n.board.input,
  permission: i18n.board.permission,
  lifecycle: i18n.board.lifecycle,
  async: i18n.board.async2,
  interrupt: i18n.board.interruption,
  conflict: i18n.board.conflict,
  consistency: i18n.board.consistency,
});

export const SEVERITY_LABEL = (i18n: BoardMessages = boardEnglish): Record<string, string> => ({ blocker: i18n.board.blocker, major: i18n.board.major, minor: i18n.board.minor });

/** 检查器里的类型名：Mantine 名称原样显示，附中文说明。 */
type Text = string | Record<string, string>;
/** 插件清单里给人看的文字，按看板界面语言取；没有这种语言时退回 en。 */
export const pluginText = (text: Text | undefined, locale: Locale = 'en'): string | undefined => (text === undefined ? undefined : typeof text === 'string' ? text : (text[locale] ?? text.en));

/**
 * 组件类型在看板里的显示名：类型名之后带上当前语言的名字（例如「ui:Button（按钮）」）。
 * 名字来自插件清单的 label（IR 的 project.plugins），看板不认识任何具体组件；只有文本节点是引擎自己的类型。
 */
export const typeLabel = (t: string, plugins: PluginTable = undefined, i18n: BoardMessages = boardEnglish, locale: Locale = 'en') => {
  if (locale === 'en') return t;
  const label = t === '#text' ? i18n.board.text2 : pluginText(pluginSpec(plugins, t)?.label, locale);
  return label ? i18n.board.componentTypeName(t, label) : t;
};
