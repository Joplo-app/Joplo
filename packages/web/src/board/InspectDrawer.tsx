import { LocalText } from '../i18n/LocalText';
import { selectionLabel } from '../i18n/step-caption';
import { translate } from '../i18n/messages';
import { useBoardI18n } from '../i18n/board/context';
/**
 * 检查抽屉（看板，D39 / D55 + Juice UI .j-inspect-prop-card / .j-copy-snippet / Badge / Button）：
 * 检查模式下单击、或 ⌥+单击画面元素后在右侧浮出（没有遮罩，可以接着点别的元素）；Esc 或 × 关闭。
 * 标题是元素名，第一块是 文件:行（复制、在编辑器中打开）；规则区分“已确认”和“AI 假设”（data-variant="dashed"）；底部是同步状态。
 */
import { Fragment, useEffect, useState } from 'react';
import { Check, Copy, ExternalLink, X } from 'lucide-react';
import { Badge, Button, IconButton } from '@tokenroll/juice/primitives';
import { disabledReasonOf, findNode, pluginSpec, resolveProps, type PlayState, type Project, type Rule, type Selection } from '@joplo-app/core/runtime';
import type { SelectionSync } from '../runtime/demo';
import { entryForWork, workOfNode, scenariosOf, shortName } from '../runtime/views';
import { cn } from '@/lib/utils';
import { CONFIRM_LABEL, ORIGIN_LABEL, pluginText, typeLabel } from './labels';

function Chip({ cls, children }: { cls: string; children: React.ReactNode }) {
  return <span className={cn('inline-block shrink-0 rounded-[5px] border px-1.5 py-px text-[11px] leading-[16px]', cls)}>{children}</span>;
}

function RuleItem({ rule }: { rule: Rule }) {
  const { t: i18n } = useBoardI18n();

  const o = ORIGIN_LABEL(i18n)[rule.origin];
  const c = CONFIRM_LABEL(i18n)[rule.confirmation];
  return (
    <li
      className="j-inspect-prop-card list-none"
      data-variant={rule.origin === 'ai_assumption' ? 'dashed' : undefined}
      data-testid={`rule-${rule.id}`}
      data-origin={rule.origin}
    >
      <div className="mb-0.5 flex flex-wrap items-center gap-1">
        <Chip cls={o.cls}>{o.text}</Chip>
        <Chip cls={c.cls}>{c.text}</Chip>
      </div>
      <div className="text-[13px] leading-snug">{rule.text}</div>
    </li>
  );
}

const H = ({ children }: { children: React.ReactNode }) => <h3 className="mb-1.5 mt-4 text-[12px] font-semibold tracking-[1px] text-jb-muted first:mt-0">{children}</h3>;

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
  const fields = node ? (pluginSpec(project.plugins, node.type)?.inspect ?? []) : [];
  // featureId 为 null 也可能是已选独立作品；只有未选作品/功能时才是全局浏览。
  const globalBrowse = selection.workId === null && selection.featureId === null;
  const featureId = selection.workId === null ? selection.featureId : entryForWork(project, selection.workId)?.featureId;
  const rules = node ? Object.values(project.rules).filter((r) => r.elementIds.includes(node.id) && (globalBrowse || r.featureId === featureId) && (!r.workId || r.workId === selection.workId)) : [];
  // 覆盖的情况：本方案里有步骤操作这个元素的场景所覆盖的情况；没有这样的场景时取当前场景的情况
  const scs = scenariosOf(project, selection.workId);
  const targeting = node ? scs.filter((sc) => sc.steps.some((s) => 'target' in s.action && s.action.target === node.id)) : [];
  const caseIds = [...new Set((targeting.length ? targeting : scs.filter((s) => s.id === selection.scenarioId)).flatMap((s) => s.caseIds))];
  const from = node ? workOfNode(project, node) : null;
  const at = selection.at;
  // 当前场景里以它为目标的第一步（“第 1 步的目标”）
  const curSteps = selection.scenarioId ? (project.scenarios[selection.scenarioId]?.steps ?? []) : [];
  const stepIdx = node ? curSteps.findIndex((s) => 'target' in s.action && s.action.target === node.id) : -1;
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && !(e.target as HTMLElement).closest?.('[data-jb-pop]:not([data-testid="inspect-drawer"]),[data-floating-popover]:not([data-testid="inspect-drawer"])') && onClose();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  return (
    <div data-testid="inspect-drawer-root">
      <aside role="dialog" aria-label={i18n.board.inspect2} data-jb-pop="" className="j-floating-pop jb-pop fixed bottom-3 right-3 top-[64px] z-40 flex w-[360px] max-w-[92vw] flex-col overflow-y-auto p-4 text-[13px]" data-testid="inspect-drawer">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-[17px] font-bold" data-testid="sel-label">
              <LocalText value={selectionLabel(project, selection)} />
            </div>
            {node ? (
              <div className="mt-0.5 text-[12px] text-jb-muted" data-testid="sel-type">
                {typeLabel(node.type, project.plugins, i18n, locale)} · {from ? i18n.board.optionLabel(shortName(from.title)) : node.source?.startsWith('layouts/') ? i18n.board.layout : node.source?.startsWith('routes/') ? i18n.board.page : '—'}
                {stepIdx >= 0 ? i18n.board.targetOfStep(stepIdx + 1) : ''}
              </div>
            ) : null}
          </div>
          <IconButton label={i18n.board.close} variant="ghost" size="xs" onClick={onClose} data-testid="drawer-close">
            <X className="size-4" />
          </IconButton>
        </div>
        {at ? (
          <div className="j-copy-snippet mb-1.5 gap-1 py-1.5 pl-2.5 pr-1">
            <code className="min-w-0 flex-1 break-all font-jb-mono text-[12px]" data-testid="sel-at">
              {at}
            </code>
            <IconButton
              label={i18n.board.copyLocation}
              title={i18n.board.copyFileLineColumn}
              variant="ghost"
              size="xs"
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
            </IconButton>
            <IconButton label={i18n.board.openInEditor} title={i18n.board.openInEditor} variant="ghost" size="xs" data-testid="open-at" onClick={() => onOpenEditor(at)}>
              <ExternalLink className="size-3.5" />
            </IconButton>
          </div>
        ) : (
          <p className="mb-1 text-[12px] text-jb-faint">{i18n.board.thisElementHasNoSourceLocation}</p>
        )}

        {node && fields.length ? (
          <dl className="mb-2 grid grid-cols-[64px_1fr] gap-x-2 gap-y-1 rounded-[11px] bg-[var(--juice-w6)] px-3 py-2 text-[13px]" data-testid="sel-fields">
            {(() => {
              // 插件清单声明的专属信息行（例如图表元素的说明、连线两端、状态）：看板只照着声明显示属性的当前值
              const p = state && state.sceneId === selection.sceneId ? resolveProps(node, state) : (node.props ?? {});
              return fields.map((field, i) => {
                const raw = field.props.map((key) => p[key] ?? (field.props.length === 1 ? field.fallback : undefined));
                if (raw.some((v) => v === undefined || v === null || v === '')) return null;
                const shown = raw.map((v) => pluginText(field.values?.[String(v)], locale) ?? String(v)).join(field.join ?? ' ');
                const flags = Object.entries(field.flags ?? {}).filter(([key]) => p[key] === true).map(([, text]) => pluginText(text, locale)).join('');
                // 属性绑定在状态上（$ui.x）时把绑定的路径也写出来
                const binding = field.props.length === 1 ? node.props?.[field.props[0]!] : undefined;
                return (
                  <Fragment key={i}>
                    <dt className="text-jb-muted">{pluginText(field.label, locale)}</dt>
                    <dd data-testid={`sel-${field.props.join('-')}`} data-value={raw.map(String).join(' ')}>
                      {shown}{flags}
                      {typeof binding === 'string' && binding.startsWith('$') ? <span className="ml-1 font-mono text-[11px] text-jb-faint">{binding}</span> : null}
                    </dd>
                  </Fragment>
                );
              });
            })()}
          </dl>
        ) : null}
        {node?.note ? (
          <p className="rounded-[8px] bg-jb-selected px-2.5 py-1.5 text-[13px]" data-testid="sel-note">
            <span className="font-semibold text-jb-fg">{i18n.board.designNote}</span>
            {node.note}
          </p>
        ) : null}
        {node?.disabledReason ? (
          <p className="mt-2 rounded-[8px] bg-[var(--juice-w6)] px-2.5 py-1.5 text-[13px]">
            <span className="text-jb-muted">{i18n.board.disabledReason}</span>
            {/* 绑定状态的原因（D65）：显示当前状态下的文字，后面附上绑定本身 */}
            {node.disabledReason.startsWith('$') ? (state ? disabledReasonOf(node, state) ?? '' : '') : node.disabledReason}
            {node.disabledReason.startsWith('$') ? <span className="ml-1 font-mono text-[11px] text-jb-faint">{node.disabledReason}</span> : null}
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
            <Badge key={c}>
              {project.cases[c]?.title ?? c}
            </Badge>
          ))}
        </div>

        <p className={cn('mt-4 flex items-start gap-2 text-[12px] leading-relaxed', sync.status === 'error' ? 'text-jb-danger' : 'text-jb-muted')} data-testid="selection-sync" data-status={sync.status}>
          <span aria-hidden className="j-status-dot mt-[5px]" data-tone={sync.status === 'error' ? undefined : sync.status === 'pending' ? 'warn' : 'ok'} data-pulse={sync.status === 'pending' ? 'true' : undefined} style={sync.status === 'error' ? { background: 'var(--jb-status-danger)' } : undefined} />
          {sync.status === 'error'
            ? i18n.board.couldNotWrite(translate(sync.message, i18n))
            : sync.status === 'pending'
              ? i18n.board.writingJoploSelectionJson
              : i18n.board.savedJoploSelectionJsonAgentCanReadItWith}
        </p>

        <div className="mt-auto flex justify-between pt-5">
          <Button variant="secondary" size="sm" onClick={onClear} data-testid="clear-selection">
            {i18n.board.clearSelection}</Button>
          <Button variant="primary" size="sm" onClick={onClose}>
            {i18n.board.resumeDemo}</Button>
        </div>
      </aside>
    </div>
  );
}
