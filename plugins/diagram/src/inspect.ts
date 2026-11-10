/**
 * 看板检查抽屉里图表元素的专属信息（清单声明，宿主照着显示，不认识图表）：说明、连线两端、当前状态。
 * 文字随看板界面语言；没有对应语言时退回 en。
 */
import type { PluginInspectField, PluginText } from '@joplo-app/kit/plugin';
import labels from './labels.json' with { type: 'json' };

const note: PluginInspectField = { label: {"en": "Note", "zh-CN": "说明", "zh-TW": "說明", "ja": "補足", "ko": "설명", "de": "Anmerkung", "fr": "Note", "es": "Nota", "pt-BR": "Nota", "ru": "Примечание"}, props: ['description'] };
const edge: PluginInspectField = { label: {"en": "Edge", "zh-CN": "连线", "zh-TW": "連線", "ja": "エッジ", "ko": "연결선", "de": "Kante", "fr": "Arête", "es": "Arista", "pt-BR": "Aresta", "ru": "Ребро"}, props: ['from', 'to'], join: ' → ', flags: { async: {"en": "(Async)", "zh-CN": "（异步）", "zh-TW": "（非同步）", "ja": "（非同期）", "ko": "(비동기)", "de": "(Asynchron)", "fr": "(Asynchrone)", "es": "(Asíncrono)", "pt-BR": "(Assíncrono)", "ru": "(Асинхронно)"} } };
const state: PluginInspectField = {
  label: {"en": "State", "zh-CN": "状态", "zh-TW": "狀態", "ja": "状態", "ko": "상태", "de": "Zustand", "fr": "État", "es": "Estado", "pt-BR": "Estado", "ru": "Состояние"}, props: ['state'], fallback: 'idle',
  values: { idle: {"en": "Idle (idle)", "zh-CN": "空闲（idle）", "zh-TW": "閒置（idle）", "ja": "待機（idle）", "ko": "대기(idle)", "de": "Inaktiv (idle)", "fr": "Inactif (idle)", "es": "Inactivo (idle)", "pt-BR": "Inativo (idle)", "ru": "Ожидание (idle)"}, active: {"en": "Running (active)", "zh-CN": "调用中（active）", "zh-TW": "執行中（active）", "ja": "実行中（active）", "ko": "실행 중(active)", "de": "Läuft (active)", "fr": "En cours (active)", "es": "En ejecución (active)", "pt-BR": "Em execução (active)", "ru": "Выполняется (active)"}, ok: {"en": "Success (ok)", "zh-CN": "成功（ok）", "zh-TW": "成功（ok）", "ja": "成功（ok）", "ko": "성공(ok)", "de": "Erfolgreich (ok)", "fr": "Succès (ok)", "es": "Correcto (ok)", "pt-BR": "Sucesso (ok)", "ru": "Успех (ok)"}, error: {"en": "Error (error)", "zh-CN": "出错（error）", "zh-TW": "錯誤（error）", "ja": "エラー（error）", "ko": "오류(error)", "de": "Fehler (error)", "fr": "Erreur (error)", "es": "Error (error)", "pt-BR": "Erro (error)", "ru": "Ошибка (error)"}, dim: {"en": "Dimmed (dim)", "zh-CN": "淡出（dim）", "zh-TW": "淡化（dim）", "ja": "薄く表示（dim）", "ko": "흐리게(dim)", "de": "Gedimmt (dim)", "fr": "Estompé (dim)", "es": "Atenuado (dim)", "pt-BR": "Esmaecido (dim)", "ru": "Приглушено (dim)"} },
};

export const componentLabels = labels as Record<string, PluginText>;
/** 组件名 → 检查抽屉的信息行。 */
export const inspectFields: Record<string, PluginInspectField[]> = {
  'Diagram.Node': [note, state],
  'Diagram.Edge': [note, edge, state],
  'Diagram.Group': [note],
};
