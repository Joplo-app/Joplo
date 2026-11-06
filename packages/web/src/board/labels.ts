import type { Locale } from '../i18n/locale';
import { boardEnglish, type BoardMessages } from '../i18n/board/dictionaries';
/** 看板（创作侧）专用的中文标签与芯片样式。不进入发布站。 */
import type { Coverage, Rule } from '@joplo-app/core';

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
const TYPE_ZH = (i18n: BoardMessages = boardEnglish): Record<string, string> => ({
  AppShell: i18n.board.applicationShell,
  'AppShell.Header': i18n.board.header,
  'AppShell.Navbar': i18n.board.navigationSidebar,
  'AppShell.Main': i18n.board.mainContent,
  'AppShell.Aside': i18n.board.aside,
  'AppShell.Footer': i18n.board.footer,
  Stack: i18n.board.verticalStack,
  Group: i18n.board.horizontalGroup,
  SimpleGrid: i18n.board.simpleGrid,
  Grid: i18n.board.grid,
  Card: i18n.board.card,
  Paper: i18n.board.panel,
  Title: i18n.board.title,
  Text: i18n.board.text,
  Button: i18n.board.button,
  ActionIcon: i18n.board.iconButton,
  CloseButton: i18n.board.closeButton,
  Anchor: i18n.board.link,
  a: i18n.board.link,
  NavLink: i18n.board.navigationLink,
  Burger: i18n.board.navigationToggle,
  TextInput: i18n.board.textInput,
  PasswordInput: i18n.board.passwordInput,
  NumberInput: i18n.board.numberInput,
  Textarea: i18n.board.textArea,
  Select: i18n.board.select,
  MultiSelect: i18n.board.multipleSelect,
  Checkbox: i18n.board.checkbox,
  'Radio.Group': i18n.board.radioGroup,
  Radio: i18n.board.radio,
  Switch: i18n.board.switch,
  SegmentedControl: i18n.board.segmentedControl,
  FileInput: i18n.board.fileInput,
  Tabs: i18n.board.tabs,
  'Tabs.Tab': i18n.board.tab,
  'Accordion.Control': i18n.board.accordionHeading,
  Pagination: i18n.board.pagination,
  Modal: i18n.board.modal,
  Drawer: i18n.board.drawer,
  Alert: i18n.board.alert,
  Notification: i18n.board.notification,
  DataTable: i18n.board.dataTable,
  Table: i18n.board.table,
  Badge: i18n.board.badge,
  Loader: i18n.board.loader,
  ChatMessage: i18n.board.chatMessage,
  ToolCall: i18n.board.toolCall,
  Email: i18n.board.email,
  DataCard: i18n.board.dataCard,
  StateFlow: i18n.board.stateFlow,
  Thinking: i18n.board.thinking,
  Artifact: i18n.board.artifact,
  'Artifact.Ref': i18n.board.artifactRef,
  PromptInput: i18n.board.promptInput,
  Terminal: i18n.board.terminal,
  'Terminal.Command': i18n.board.terminalCommand,
  'Terminal.Output': i18n.board.terminalOutput,
  'Terminal.Input': i18n.board.terminalInput,
  Phone: i18n.board.phoneFrame,
  Diagram: i18n.board.diagram,
  'Diagram.Group': i18n.board.diagramGroup,
  'Diagram.Node': i18n.board.diagramNode,
  'Diagram.Edge': i18n.board.diagramEdge,
  Placeholder: i18n.board.placeholder,
  Custom: i18n.board.customComponent,
  '#text': i18n.board.text2,
});
export const typeLabel = (t: string, i18n: BoardMessages = boardEnglish, locale: Locale = 'en') => (locale !== 'en' && TYPE_ZH(i18n)[t] ? i18n.board.componentTypeName(t, TYPE_ZH(i18n)[t]!) : t);
