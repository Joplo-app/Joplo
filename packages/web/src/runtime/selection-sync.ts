/**
 * 选中同步（审阅）：看板里选中的元素 / 步骤写回 .joplo/selection.json，供 Agent 读取。
 * 从演示控制器里拆出来——它和播放调度无关，只经 SelectionHost 读写控制器的快照。
 *
 * 不变量：每次写接口返回后，界面显示的选中 = 文件内容。写入被拒绝时以服务端返回的 current（被拒绝时为 null）为准并明确提示；
 * 网络失败时回滚到上一次确认的选中。写入串行，只有最后一次请求的结果反映到界面上。
 */
import { findNode, nodeLabel, type Scenario, type Selection } from '@joplo-app/core/runtime';
import { en } from '../i18n/en';
import { reference } from '../i18n/messages';
import type { Text } from '../i18n/messages';
import type { BoardDictionary } from '../i18n/board/en';
import { selectionLabel, stepCaption } from '../i18n/step-caption';
import { browseState } from './views';
import type { SelectionInput, SelectionWriteResult, SelectionWriter, Snapshot } from './demo';

const boardRef = reference<BoardDictionary>();

/** 选中同步能对控制器做的事。 */
export type SelectionHost = {
  snapshot(): Snapshot;
  patch(patch: Partial<Snapshot>): void;
  /** 用户正在看的画面（有层级时是某一层的画面）。 */
  shownSceneId(): string | null;
  scenario(): Scenario | null;
  setScenario(scenarioId: string, position: number): void;
  stop(): void;
  /** 过一会儿自动收起当前提示。 */
  clearNoticeLater(ms?: number): void;
};

export class SelectionWriteback {
  private syncSeq = 0;
  private syncChain: Promise<void> = Promise.resolve();
  /** 最近一次服务端确认的选中（写入失败时回滚到它）。 */
  private confirmed: Selection | null = null;
  constructor(private readonly writer: SelectionWriter | null, private readonly host: SelectionHost) {}

  /** 热更新后：选中的元素仍在当前画面则保留（位置变化时重新写入）；否则取消选中并说明。 */
  revalidate() {
    const sel = this.host.snapshot().selection;
    const p = this.host.snapshot().project;
    const st = this.host.snapshot().state;
    if (!sel || !p || !st) return;
    const shown = this.host.shownSceneId() ?? st.sceneId;
    const scene = p.scenes[sel.sceneId];
    const hit = sel.nodeId && scene && (sel.sceneId === shown || sel.sceneId === st.sceneId) ? findNode(scene, sel.nodeId) : null;
    const stepOk = !sel.nodeId && sel.stepId && sel.scenarioId && p.scenarios[sel.scenarioId]?.steps.some((s) => s.id === sel.stepId);
    if (hit || stepOk) {
      const at = hit ? (hit.node.source ?? null) : (p.scenarios[sel.scenarioId!]!.steps.find((s) => s.id === sel.stepId)?.source ?? null);
      if (at !== sel.at || (hit && scene && nodeLabel(hit.node) !== sel.label)) void this.writeSelection(this.inputOf(sel), boardRef('board', 'selectedElementLocationUpdated'), boardRef('board', 'couldNotSyncSelectionToAgent'));
      return;
    }
    void this.writeSelection(null, boardRef('board', 'theSelectedElementIsNoLongerInThisStage'), boardRef('board', 'couldNotSyncClearedSelectionToAgent'), true);
  }

  /** 当前画面上下文中的选中请求。 */
  private currentInput(nodeId: string | null, stepId?: string | null): SelectionInput | null {
    const p = this.host.snapshot().project;
    const st = this.host.snapshot().state;
    if (!p || !st) return null;
    if (this.host.snapshot().view === 'stage') {
      const sc = this.host.scenario();
      if (!sc) return null;
      return { optionId: sc.optionId, scenarioId: sc.id, position: st.position, sceneId: this.host.shownSceneId() ?? st.sceneId, nodeId, ...(stepId ? { stepId } : {}) };
    }
    return { optionId: p.scenes[st.sceneId]?.optionId ?? null, scenarioId: null, position: 0, sceneId: st.sceneId, nodeId };
  }

  private inputOf(sel: Selection): SelectionInput {
    return { optionId: sel.optionId, scenarioId: sel.scenarioId, position: sel.position, sceneId: sel.sceneId, nodeId: sel.nodeId, ...(sel.nodeId ? {} : { stepId: sel.stepId }) };
  }

  /** 界面立即显示的选中（服务端确认后以服务端结果为准）。 */
  private localSelection(input: SelectionInput): Selection | null {
    const p = this.host.snapshot().project;
    if (!p) return null;
    const scene = p.scenes[input.sceneId];
    const hit = input.nodeId && scene ? findNode(scene, input.nodeId) : null;
    const step = !input.nodeId && input.stepId && input.scenarioId ? p.scenarios[input.scenarioId]?.steps.find((s) => s.id === input.stepId) : undefined;
    if (!hit && !step) return null;
    return {
      featureId: input.optionId ? (p.options[input.optionId]?.featureId ?? null) : null,
      optionId: input.optionId,
      scenarioId: input.scenarioId,
      position: input.position,
      stepId: input.stepId ?? (input.scenarioId ? (p.scenarios[input.scenarioId]?.steps[input.position - 1]?.id ?? null) : null),
      sceneId: input.sceneId,
      route: scene?.route ?? '',
      nodeId: input.nodeId,
      at: hit ? (hit.node.source ?? null) : (step?.source ?? null),
      label: hit ? nodeLabel(hit.node) : (step ? stepCaption(step, en) : null),
      selectedAt: new Date().toISOString(),
    };
  }

  async select(nodeId: string | null, stepId?: string | null) {
    const input = this.currentInput(nodeId, stepId);
    if (!input) return;
    const local = this.localSelection(input);
    if (!local) return;
    await this.writeSelection(input, boardRef('board', 'selectedTellAgentWhatYouWantToChange', selectionLabel(this.host.snapshot().project!, local)), boardRef('board', 'couldNotSyncSelectionToAgent'));
  }

  /** 取消选中，并同步给 Agent（selection.json 写为 null）。 */
  async clear() {
    await this.writeSelection(null, boardRef('board', 'selectionClearedAndSyncedToAgent'), boardRef('board', 'couldNotSyncClearedSelectionToAgent'));
  }

  /**
   * 串行写回选中；只有最后一次请求的结果会反映到界面上。
   * 不变量：返回后界面选中 = 文件内容。被拒绝时以服务端返回的 current 为准；网络失败回滚到上次确认的选中。
   */
  private writeSelection(input: SelectionInput | null, okText: Text, failText: Text, quietOk = false): Promise<void> {
    const seq = ++this.syncSeq;
    const optimistic = input ? this.localSelection(input) : null;
    this.host.patch({ selection: optimistic, selectionSync: { status: 'pending' } });
    const writer = this.writer;
    this.syncChain = this.syncChain.then(async () => {
      const r: SelectionWriteResult = writer ? await writer(input).catch((e: unknown) => ({ ok: false as const, message: e instanceof Error ? e.message : String(e) })) : { ok: false, message: boardRef('board', 'thisPageCannotWriteASelectionReadOnly') };
      if (r.ok) this.confirmed = r.selection;
      else if (r.current !== undefined) this.confirmed = r.current;
      if (seq !== this.syncSeq) return;
      if (r.ok) {
        this.host.patch({ selection: r.selection, selectionSync: { status: 'ok' }, notice: { kind: 'selected', text: okText } });
        this.host.clearNoticeLater(quietOk ? 3000 : 5000);
      } else {
        const rolledBack = this.confirmed;
        const project = this.host.snapshot().project;
        const tail = rolledBack ? boardRef('board', 'keepingThePreviousSelection', project ? selectionLabel(project, rolledBack) : rolledBack.label ?? rolledBack.nodeId ?? '') : boardRef('board', 'selectionCleared');
        this.host.patch({ selection: rolledBack, selectionSync: { status: 'error', message: r.message }, notice: { kind: 'error', text: boardRef('board', 'selectionSyncFailed', failText, r.message, tail) } });
      }
    });
    return this.syncChain;
  }

  /** 页面载入时恢复文件里的选中（与当前项目不符时清除）。 */
  async restore(sel: Selection | null) {
    const p = this.host.snapshot().project;
    if (!sel || !p) return;
    if (sel.scenarioId && p.scenarios[sel.scenarioId]) this.host.setScenario(sel.scenarioId, sel.position);
    else if (!sel.scenarioId && p.scenes[sel.sceneId]) {
      this.host.stop();
      this.host.patch({ view: 'browse', browseSceneId: sel.sceneId, state: browseState(p, sel.sceneId), epoch: this.host.snapshot().epoch + 1 });
    }
    this.host.patch({ notice: null });
    await this.writeSelection(this.inputOf(sel), boardRef('board', 'previousSelectionRestored'), boardRef('board', 'previousSelectionIsNoLongerValid'), true);
  }
}
