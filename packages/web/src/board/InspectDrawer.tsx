import { LocalText } from '../i18n/LocalText';
import { selectionLabel } from '../i18n/step-caption';
import { translate } from '../i18n/messages';
import { useBoardI18n } from '../i18n/board/context';
import { boardEnglish, type BoardMessages } from '../i18n/board/dictionaries';
/**
 * 检查抽屉（看板，D39 / D55「检查抽屉：给 Agent 指路」）：检查模式下单击、或 ⌥+单击画面元素后在右侧浮出（e1，没有遮罩，
 * 可以接着点别的元素）；Esc 或 × 关闭。标题是元素名，第一块就是 文件:行（复制、在编辑器中打开）；规则区分“已确认”和
 * “AI 假设”（虚线框）；底部是同步状态。
 * 显示：元素名与类型、关联规则（来源与确认状态）、覆盖的情况、`文件:行`（可复制、可在编辑器中打开）、
 * 写入状态，以及“Agent 运行 npx joplo selection”的提示。选中本身由控制器写入 `.joplo/selection.json`
 * （服务端计算 at / label，409 时清空并提示）。
 */
import { useEffect, useState } from 'react';
import { Check, Copy, ExternalLink, X } from 'lucide-react';
import { findNode, resolveProps, type PlayState, type Project, type Rule, type Selection } from '@joplo-app/core';
import type { SelectionSync } from '../runtime/demo';
import { optionOfNode, scenariosOf, shortName } from '../runtime/views';
import { cn } from '@/lib/utils';
import { CONFIRM_LABEL, ORIGIN_LABEL, typeLabel } from './labels';

function Chip({ cls, children }: { cls: string; children: React.ReactNode }) {
  return <span className={cn('inline-block shrink-0 rounded-[4px] border px-1.5 py-px text-[11px] leading-[16px]', cls)}>{children}</span>;
}

function RuleItem({ rule }: { rule: Rule }) {
  const { t: i18n, locale } = useBoardI18n();

  const o = ORIGIN_LABEL(i18n)[rule.origin];
  const c = CONFIRM_LABEL(i18n)[rule.confirmation];
  return (
    <li className={cn('rounded-[8px] border px-2.5 py-2', rule.origin === 'ai_assumption' ? 'border-[1.5px] border-dashed border-jb-ink bg-jb-subtle' : 'border-jb-line bg-jb-surface')} data-testid={`rule-${rule.id}`} data-origin={rule.origin}>
      <div className="mb-1 flex flex-wrap items-center gap-1">
        <Chip cls={o.cls}>{o.text}</Chip>
        <Chip cls={c.cls}>{c.text}</Chip>
      </div>
      <div className="text-[13px] leading-snug">{rule.text}</div>
    </li>
  );
}

const H = ({ children }: { children: React.ReactNode }) => <h3 className="mb-1.5 mt-4 text-[12px] font-semibold tracking-[1px] text-jb-muted first:mt-0">{children}</h3>;

const DIAGRAM_STATE = (i18n: BoardMessages = boardEnglish): Record<string, string> => ({ idle: i18n.board.idleIdle, active: i18n.board.runningActive, ok: i18n.board.successOk, error: i18n.board.errorError, dim: i18n.board.dimmedDim });

export function InspectDrawer({
  project,
  state,
  selection,
  sync,
  onClose,
  onClear,
  onOpenEditor,
}: {
  project: Project;
  /** 当前画面状态：架构图节点 / 连线的 state 绑定按它解析。 */
  state: PlayState | null;
  selection: Selection;
  sync: SelectionSync;
  onClose: () => void;
  onClear: () => void;
  onOpenEditor: (at: string) => void;
}) {
  const { t: i18n, locale } = useBoardI18n();

  const [copied, setCopied] = useState(false);
  const scene = project.scenes[selection.sceneId];
  const node = scene && selection.nodeId ? (findNode(scene, selection.nodeId)?.node ?? null) : null;
  const rules = node ? Object.values(project.rules).filter((r) => r.elementIds.includes(node.id) && (!selection.featureId || r.featureId === selection.featureId) && (!r.optionId || r.optionId === selection.optionId)) : [];
  // 覆盖的情况：本方案里有步骤操作这个元素的场景所覆盖的情况；没有这样的场景时取当前场景的情况
  const scs = scenariosOf(project, selection.optionId);
  const targeting = node ? scs.filter((sc) => sc.steps.some((s) => 'target' in s.action && s.action.target === node.id)) : [];
  const caseIds = [...new Set((targeting.length ? targeting : scs.filter((s) => s.id === selection.scenarioId)).flatMap((s) => s.caseIds))];
  const from = node ? optionOfNode(project, node) : null;
  const at = selection.at;
  // 当前场景里以它为目标的第一步（“第 1 步的目标”）
  const curSteps = selection.scenarioId ? (project.scenarios[selection.scenarioId]?.steps ?? []) : [];
  const stepIdx = node ? curSteps.findIndex((s) => 'target' in s.action && s.action.target === node.id) : -1;
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && !(e.target as HTMLElement).closest?.('[data-jb-pop]:not([data-testid="inspect-drawer"])') && onClose();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  return (
    <div data-testid="inspect-drawer-root">
      <aside role="dialog" aria-label={i18n.board.inspect2} data-jb-pop="" className="jb-pop fixed bottom-3 right-3 top-[64px] z-40 flex w-[360px] max-w-[92vw] flex-col overflow-y-auto p-4 text-[13px]" data-testid="inspect-drawer">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-[17px] font-bold" data-testid="sel-label">
              <LocalText value={selectionLabel(project, selection)} />
            </div>
            {node ? (
              <div className="mt-0.5 text-[12px] text-jb-muted" data-testid="sel-type">
                {typeLabel(node.type, i18n, locale)} · {from ? i18n.board.optionLabel(shortName(from.name)) : node.source?.startsWith('layouts/') ? i18n.board.layout : node.source?.startsWith('routes/') ? i18n.board.page : '—'}
                {stepIdx >= 0 ? i18n.board.targetOfStep(stepIdx + 1) : ''}
              </div>
            ) : null}
          </div>
          <button type="button" onClick={onClose} aria-label={i18n.board.close} data-testid="drawer-close" className="jb-focus flex size-7 items-center justify-center rounded-[6px] text-jb-muted hover:bg-jb-hover hover:text-jb-fg">
            <X className="size-4" />
          </button>
        </div>
        {at ? (
          <div className="mb-1 flex items-center gap-1 rounded-[6px] bg-jb-sunken px-2 py-1">
            <code className="min-w-0 flex-1 break-all font-jb-mono text-[12px]" data-testid="sel-at">
              {at}
            </code>
            <button
              type="button"
              className="jb-focus shrink-0 rounded-[4px] p-1 hover:bg-jb-press"
              aria-label={i18n.board.copyLocation}
              title={i18n.board.copyFileLineColumn}
              data-testid="copy-at"
              onClick={() =>
                void navigator.clipboard?.writeText(at).then(
                  () => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  },
                  () => undefined,
                )
              }
            >
              {copied ? <Check className="size-3.5 text-jb-ok" /> : <Copy className="size-3.5" />}
            </button>
            <button type="button" className="jb-focus shrink-0 rounded-[4px] p-1 hover:bg-jb-press" aria-label={i18n.board.openInEditor} title={i18n.board.openInEditor} data-testid="open-at" onClick={() => onOpenEditor(at)}>
              <ExternalLink className="size-3.5" />
            </button>
          </div>
        ) : (
          <p className="mb-1 text-[12px] text-jb-faint">{i18n.board.thisElementHasNoSourceLocation}</p>
        )}

        {node && node.type.startsWith('Diagram.') ? (
          <dl className="mb-2 grid grid-cols-[64px_1fr] gap-x-2 gap-y-1 rounded-[8px] bg-jb-subtle px-3 py-2 text-[13px]" data-testid="sel-diagram">
            {(() => {
              const p = state && state.sceneId === selection.sceneId ? resolveProps(node, state) : (node.props ?? {});
              const st = typeof p.state === 'string' ? p.state : 'idle';
              return (
                <>
                  {typeof p.description === 'string' && p.description ? (
                    <>
                      <dt className="text-jb-muted">{i18n.board.note}</dt>
                      <dd data-testid="sel-description">{p.description}</dd>
                    </>
                  ) : null}
                  {node.type === 'Diagram.Edge' ? (
                    <>
                      <dt className="text-jb-muted">{i18n.board.edge}</dt>
                      <dd data-testid="sel-endpoints">
                        {String(p.from)} → {String(p.to)}
                        {p.async === true ? i18n.board.async : ''}
                      </dd>
                    </>
                  ) : null}
                  {node.type !== 'Diagram.Group' ? (
                    <>
                      <dt className="text-jb-muted">{i18n.board.state}</dt>
                      <dd data-testid="sel-state" data-state={st}>
                        {DIAGRAM_STATE(i18n)[st] ?? st}
                        {typeof node.props?.state === 'string' && node.props.state.startsWith('$') ? <span className="ml-1 font-mono text-[11px] text-jb-faint">{node.props.state}</span> : null}
                      </dd>
                    </>
                  ) : null}
                </>
              );
            })()}
          </dl>
        ) : null}
        {node?.note ? (
          <p className="rounded bg-jb-selected px-2 py-1 text-[13px]" data-testid="sel-note">
            <span className="text-jb-fg font-semibold">{i18n.board.designNote}</span>
            {node.note}
          </p>
        ) : null}
        {node?.disabledReason ? (
          <p className="mt-2 rounded bg-jb-sunken px-2 py-1 text-[13px]">
            <span className="text-jb-muted">{i18n.board.disabledReason}</span>
            {node.disabledReason}
          </p>
        ) : null}

        <H>{i18n.board.ruleCount(rules.length)}</H>
        {rules.length === 0 ? <p className="text-[13px] text-jb-muted">{i18n.board.noRulesDirectlyReferenceThisElement}</p> : null}
        <ul className="flex flex-col gap-1.5" data-testid="sel-rules">
          {rules.map((r) => (
            <RuleItem key={r.id} rule={r} />
          ))}
        </ul>

        <H>{i18n.board.coveredCaseCount(caseIds.length)}</H>
        <div className="flex flex-wrap gap-1.5" data-testid="sel-cases">
          {caseIds.length === 0 ? <span className="text-[13px] text-jb-muted">{i18n.board.noLinkedCases}</span> : null}
          {caseIds.map((c) => (
            <span key={c} className="rounded-full bg-jb-sunken px-2.5 py-0.5 text-[12px] text-jb-fg">
              {project.cases[c]?.title ?? c}
            </span>
          ))}
        </div>

        <p className={cn('mt-4 flex items-start gap-1.5 text-[12px] leading-relaxed', sync.status === 'error' ? 'text-jb-danger' : 'text-jb-muted')} data-testid="selection-sync" data-status={sync.status}>
          <span aria-hidden className={cn('mt-[5px] size-2 shrink-0 rounded-full', sync.status === 'error' ? 'bg-jb-danger' : sync.status === 'pending' ? 'bg-jb-accent-press' : 'bg-jb-ok')} />
          {sync.status === 'error'
            ? i18n.board.couldNotWrite(translate(sync.message, i18n))
            : sync.status === 'pending'
              ? i18n.board.writingJoploSelectionJson
              : i18n.board.savedJoploSelectionJsonAgentCanReadItWith}
        </p>

        <div className="mt-auto flex justify-between pt-5">
          <button type="button" onClick={onClear} className="jb-focus h-8 rounded-[6px] border border-jb-line bg-jb-surface px-3 text-[13px] hover:bg-jb-hover" data-testid="clear-selection">
            {i18n.board.clearSelection}</button>
          <button type="button" onClick={onClose} className="jb-focus h-8 rounded-[6px] bg-jb-inverse px-3 text-[13px] text-jb-on-inverse hover:bg-jb-inverse-hover">
            {i18n.board.resumeDemo}</button>
        </div>
      </aside>
    </div>
  );
}
