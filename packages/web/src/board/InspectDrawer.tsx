/**
 * 检查抽屉（看板，D39）：⌥+单击画面元素后从右侧弹出，取代原来的审阅模式与右栏。
 * 显示：元素名与类型、关联规则（来源与确认状态）、覆盖的情况、`文件:行`（可复制、可在编辑器中打开）、
 * 写入状态，以及“Agent 运行 npx joplo selection”的提示。选中本身由控制器写入 `.joplo/selection.json`
 * （服务端计算 at / label，409 时清空并提示）。
 */
import { useState } from 'react';
import { Check, Copy, ExternalLink, X } from 'lucide-react';
import { findNode, type Project, type Rule, type Selection } from '@tokenroll/joplo-core';
import type { SelectionSync } from '../runtime/demo';
import { optionOfNode, scenariosOf, shortName } from '../runtime/views';
import { cn } from '@/lib/utils';
import { CONFIRM_LABEL, ORIGIN_LABEL, typeLabel } from './labels';

function Chip({ cls, children }: { cls: string; children: React.ReactNode }) {
  return <span className={cn('inline-block shrink-0 rounded border px-1.5 py-px text-[11px] leading-[16px]', cls)}>{children}</span>;
}

function RuleItem({ rule }: { rule: Rule }) {
  const o = ORIGIN_LABEL[rule.origin];
  const c = CONFIRM_LABEL[rule.confirmation];
  return (
    <li className={cn('rounded-md border px-2.5 py-2', rule.origin === 'ai_assumption' ? 'border-dashed border-[#d9a35f] bg-[#fffaf2]' : 'border-[#e4e4e4]')} data-testid={`rule-${rule.id}`} data-origin={rule.origin}>
      <div className="mb-1 flex flex-wrap items-center gap-1">
        <Chip cls={o.cls}>{o.text}</Chip>
        <Chip cls={c.cls}>{c.text}</Chip>
      </div>
      <div className="text-[13px] leading-snug">{rule.text}</div>
    </li>
  );
}

const H = ({ children }: { children: React.ReactNode }) => <h3 className="mb-1.5 mt-5 text-[13px] font-semibold text-[#3a3a3a] first:mt-0">{children}</h3>;

export function InspectDrawer({
  project,
  selection,
  sync,
  onClose,
  onClear,
  onOpenEditor,
}: {
  project: Project;
  selection: Selection;
  sync: SelectionSync;
  onClose: () => void;
  onClear: () => void;
  onOpenEditor: (at: string) => void;
}) {
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
  return (
    <div className="fixed inset-0 z-40 flex justify-end" data-testid="inspect-drawer-root">
      <button type="button" aria-label="关闭抽屉" className="absolute inset-0 bg-black/10" onClick={onClose} />
      <aside role="dialog" aria-label="检查元素" className="relative flex h-full w-[380px] max-w-[92vw] flex-col overflow-y-auto border-l bg-white p-5 shadow-xl" data-testid="inspect-drawer">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[12px] text-[#6b6b6b]">检查</div>
            <div className="truncate text-[18px] font-semibold" data-testid="sel-label">
              {selection.label ?? selection.nodeId}
            </div>
            {node ? (
              <div className="mt-0.5 text-[12px] text-[#6b6b6b]" data-testid="sel-type">
                {typeLabel(node.type)} · {from ? `方案 ${shortName(from.name)}` : node.source?.startsWith('layouts/') ? '布局' : node.source?.startsWith('routes/') ? '页面' : '—'}
              </div>
            ) : null}
          </div>
          <button type="button" onClick={onClose} aria-label="关闭" data-testid="drawer-close" className="rounded p-1 hover:bg-black/5">
            <X className="size-4" />
          </button>
        </div>

        {node?.note ? (
          <p className="rounded bg-[#fff8ee] px-2 py-1 text-[13px]" data-testid="sel-note">
            <span className="text-[#8a4700]">设计说明：</span>
            {node.note}
          </p>
        ) : null}
        {node?.disabledReason ? (
          <p className="mt-2 rounded bg-[#f4f4f4] px-2 py-1 text-[13px]">
            <span className="text-[#6b6b6b]">禁用原因：</span>
            {node.disabledReason}
          </p>
        ) : null}

        <H>规则（{rules.length}）</H>
        {rules.length === 0 ? <p className="text-[13px] text-[#6b6b6b]">没有规则直接关联它。</p> : null}
        <ul className="flex flex-col gap-1.5" data-testid="sel-rules">
          {rules.map((r) => (
            <RuleItem key={r.id} rule={r} />
          ))}
        </ul>

        <H>覆盖的情况（{caseIds.length}）</H>
        <div className="flex flex-wrap gap-1.5" data-testid="sel-cases">
          {caseIds.length === 0 ? <span className="text-[13px] text-[#6b6b6b]">没有关联的情况。</span> : null}
          {caseIds.map((c) => (
            <span key={c} className="rounded-full bg-[#e7f0ff] px-2.5 py-0.5 text-[12px] text-[#1c5fb8]">
              {project.cases[c]?.title ?? c}
            </span>
          ))}
        </div>

        <H>源码</H>
        {at ? (
          <div className="flex items-center gap-1 rounded-md border bg-[#fafafa] px-2 py-1">
            <code className="min-w-0 flex-1 break-all font-mono text-[12px]" data-testid="sel-at">
              {at}
            </code>
            <button
              type="button"
              className="shrink-0 rounded p-1 hover:bg-black/5"
              aria-label="复制位置"
              title="复制 文件:行:列"
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
              {copied ? <Check className="size-3.5 text-[#2b8a3e]" /> : <Copy className="size-3.5" />}
            </button>
            <button type="button" className="shrink-0 rounded p-1 hover:bg-black/5" aria-label="在编辑器中打开" title="在编辑器中打开" data-testid="open-at" onClick={() => onOpenEditor(at)}>
              <ExternalLink className="size-3.5" />
            </button>
          </div>
        ) : (
          <p className="text-[12px] text-[#8a8a8a]">（这个元素没有源位置）</p>
        )}
        <p className={cn('mt-2 text-[12px] leading-relaxed', sync.status === 'error' ? 'text-[#c92a2a]' : 'text-[#6b6b6b]')} data-testid="selection-sync" data-status={sync.status}>
          {sync.status === 'error'
            ? `写入失败：${sync.message}`
            : sync.status === 'pending'
              ? '正在写入 .joplo/selection.json…'
              : '已写入 .joplo/selection.json：在 Agent 会话里说要改什么，Agent 运行 npx joplo selection 就只改这一处。'}
        </p>

        <div className="mt-auto flex justify-between pt-6">
          <button type="button" onClick={onClear} className="rounded-md border px-3 py-1.5 text-[13px] hover:bg-black/5" data-testid="clear-selection">
            取消选中
          </button>
          <button type="button" onClick={onClose} className="rounded-md bg-[#1e1e1e] px-3 py-1.5 text-[13px] text-white">
            继续演示
          </button>
        </div>
      </aside>
    </div>
  );
}
