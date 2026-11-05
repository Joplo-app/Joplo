/**
 * 审阅模式右栏（检查器）。
 * - 选中元素：标签、类型、at（可复制，Agent 据此只打开那一处）、来源方案、状态、关联规则（来源与确认状态）、以它为目标的步骤。
 * - 选中步骤：字幕、at、关联规则。
 * - 未选中：功能目标、约束、方案思路与取舍、规则、待决问题。
 */
import { useState } from 'react';
import { Check, Copy, X } from 'lucide-react';
import { findNode, isNodeDisabled, isNodeVisible, type PlayState, type Project, type Rule, type Selection } from '@joplo/core';
import type { SelectionSync } from '../runtime/demo';
import { optionOfNode, scenariosOf, shortName } from '../runtime/views';
import { cn } from '@/lib/utils';
import { CONFIRM_LABEL, ORIGIN_LABEL, SEVERITY_LABEL, typeLabel } from './labels';

export function Inspector({
  project,
  optionId,
  state,
  selection,
  sync,
  onClear,
  onJump,
}: {
  project: Project;
  optionId: string | null;
  state: PlayState | null;
  selection: Selection | null;
  sync: SelectionSync;
  onClear: () => void;
  onJump: (scenarioId: string, position: number) => void;
}) {
  return (
    <aside className="flex w-[330px] shrink-0 flex-col overflow-y-auto border-l bg-white" aria-label="检查器" data-testid="inspector">
      {selection ? <SelectionView project={project} state={state} selection={selection} sync={sync} onClear={onClear} onJump={onJump} /> : <OverviewView project={project} optionId={optionId} />}
    </aside>
  );
}

function H({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-1.5 mt-4 text-[12px] font-semibold text-[#6b6b6b] first:mt-0">{children}</h3>;
}

function Chip({ cls, children, title }: { cls: string; children: React.ReactNode; title?: string }) {
  return (
    <span className={cn('inline-block shrink-0 rounded border px-1.5 py-px text-[11px] leading-[16px]', cls)} title={title}>
      {children}
    </span>
  );
}

function RuleItem({ rule }: { rule: Rule }) {
  const o = ORIGIN_LABEL[rule.origin];
  const c = CONFIRM_LABEL[rule.confirmation];
  const ai = rule.origin === 'ai_assumption';
  return (
    <li className={cn('rounded-md border px-2.5 py-2', ai ? 'border-dashed border-[#d9a35f] bg-[#fffaf2]' : 'border-[#e4e4e4]')} data-testid={`rule-${rule.id}`} data-origin={rule.origin}>
      <div className="mb-1 flex flex-wrap items-center gap-1">
        <Chip cls={o.cls} title="来源">
          {ai ? '⚠ ' : ''}
          {o.text}
        </Chip>
        <Chip cls={c.cls} title="确认状态">
          {c.text}
        </Chip>
        <Chip cls="border-[#e0e0e0] text-[#6b6b6b]">{rule.optionId ? '本方案' : '功能共享'}</Chip>
      </div>
      <div className="text-[13px] leading-snug">{rule.text}</div>
      {rule.source ? <div className="mt-1 font-mono text-[11px] text-[#8a8a8a]">{rule.source}</div> : null}
    </li>
  );
}

function CopyAt({ at }: { at: string }) {
  const [copied, setCopied] = useState(false);
  return (
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
        onClick={() => {
          void navigator.clipboard?.writeText(at).then(
            () => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            },
            () => undefined,
          );
        }}
      >
        {copied ? <Check className="size-3.5 text-[#2b8a3e]" /> : <Copy className="size-3.5" />}
      </button>
    </div>
  );
}

function SyncLine({ sync }: { sync: SelectionSync }) {
  return (
    <p className={cn('mt-2 text-[12px]', sync.status === 'error' ? 'text-[#c92a2a]' : 'text-[#6b6b6b]')} data-testid="selection-sync" data-status={sync.status}>
      {sync.status === 'ok' ? '✓ 已写入 .joplo/selection.json，Agent 可用 joplo selection 读取' : sync.status === 'pending' ? '正在写入 .joplo/selection.json…' : sync.status === 'error' ? `写入失败：${sync.message}` : ''}
    </p>
  );
}

function SelectionView({ project, state, selection, sync, onClear, onJump }: { project: Project; state: PlayState | null; selection: Selection; sync: SelectionSync; onClear: () => void; onJump: (scenarioId: string, position: number) => void }) {
  const scene = project.scenes[selection.sceneId];
  const hit = scene && selection.nodeId ? findNode(scene, selection.nodeId) : null;
  const node = hit?.node ?? null;
  const featureRules = Object.values(project.rules).filter((r) => (!selection.featureId || r.featureId === selection.featureId) && (!r.optionId || r.optionId === selection.optionId));
  const scenarios = scenariosOf(project, selection.optionId);
  const step = !node && selection.scenarioId ? project.scenarios[selection.scenarioId]?.steps.find((s) => s.id === selection.stepId) : undefined;
  const rules = node ? featureRules.filter((r) => r.elementIds.includes(node.id)) : step ? step.ruleIds.map((id) => project.rules[id]).filter((r): r is Rule => !!r) : [];
  const targeting = node
    ? scenarios.flatMap((sc) => sc.steps.map((s, i) => ({ sc, s, i })).filter(({ s }) => 'target' in s.action && s.action.target === node.id))
    : [];
  const live = state && node && state.sceneId === selection.sceneId;
  const from = node ? optionOfNode(project, node) : null;

  return (
    <div className="p-4" data-testid="selection-view">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[12px] text-[#6b6b6b]">{node ? '已选中元素' : '已选中步骤'}</div>
          <div className="truncate text-[17px] font-semibold" data-testid="sel-label">
            {selection.label ?? selection.nodeId ?? selection.stepId}
          </div>
        </div>
        <button type="button" onClick={onClear} className="flex shrink-0 items-center gap-1 rounded border px-2 py-1 text-[12px] hover:bg-black/5" data-testid="clear-selection">
          <X className="size-3.5" />
          取消选中
        </button>
      </div>
      {selection.at ? <CopyAt at={selection.at} /> : <p className="text-[12px] text-[#8a8a8a]">（这个元素没有源位置）</p>}
      <SyncLine sync={sync} />

      {node ? (
        <>
          <H>元素</H>
          <dl className="grid grid-cols-[64px_1fr] gap-x-2 gap-y-1 text-[13px]">
            <dt className="text-[#6b6b6b]">类型</dt>
            <dd data-testid="sel-type">{typeLabel(node.type)}</dd>
            <dt className="text-[#6b6b6b]">id</dt>
            <dd className="font-mono text-[12px]">{node.id}</dd>
            <dt className="text-[#6b6b6b]">路径</dt>
            <dd className="font-mono text-[12px]">{selection.route}</dd>
            <dt className="text-[#6b6b6b]">来自</dt>
            <dd data-testid="sel-from">{from ? `方案 ${shortName(from.name)}${project.routes[selection.route]?.addedBy === from.id ? '（新增的页面）' : '（堆叠）'}` : node.source?.startsWith('layouts/') ? '布局' : node.source?.startsWith('routes/') ? '页面' : '—'}</dd>
            {live ? (
              <>
                <dt className="text-[#6b6b6b]">当前</dt>
                <dd>
                  {isNodeVisible(scene!, node.id, state!) ? '可见' : '隐藏'}
                  {isNodeDisabled(node, state!) ? ' · 禁用' : ''}
                  {node.unmodeled ? ' · 未建模' : ''}
                </dd>
              </>
            ) : null}
          </dl>
          {node.disabledReason ? (
            <p className="mt-2 rounded bg-[#f4f4f4] px-2 py-1 text-[13px]">
              <span className="text-[#6b6b6b]">禁用原因：</span>
              {node.disabledReason}
            </p>
          ) : null}
          {node.note ? (
            <p className="mt-2 rounded bg-[#fff8ee] px-2 py-1 text-[13px]" data-testid="sel-note">
              <span className="text-[#8a4700]">设计说明：</span>
              {node.note}
            </p>
          ) : null}
        </>
      ) : null}

      <H>关联规则（{rules.length}）</H>
      {rules.length === 0 ? <p className="text-[13px] text-[#6b6b6b]">没有规则直接关联它。</p> : null}
      <ul className="flex flex-col gap-1.5" data-testid="sel-rules">
        {rules.map((r) => (
          <RuleItem key={r.id} rule={r} />
        ))}
      </ul>

      {node ? (
        <>
          <H>以它为目标的步骤（{targeting.length}）</H>
          {targeting.length === 0 ? <p className="text-[13px] text-[#6b6b6b]">本方案没有步骤操作它。</p> : null}
          <ul className="flex flex-col gap-1" data-testid="sel-steps">
            {targeting.map(({ sc, s, i }) => (
              <li key={s.id}>
                <button type="button" className="w-full rounded border px-2 py-1 text-left text-[13px] hover:bg-black/5" onClick={() => onJump(sc.id, i)} title="跳到这一步之前">
                  <span className="text-[#6b6b6b]">
                    {sc.name} · 第 {i + 1} 步：
                  </span>
                  {s.caption}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : step ? (
        <>
          <H>步骤</H>
          <p className="text-[13px]">{step.caption}</p>
        </>
      ) : null}
    </div>
  );
}

function OverviewView({ project, optionId }: { project: Project; optionId: string | null }) {
  const option = optionId ? project.options[optionId] : null;
  const feature = option ? project.features[option.featureId] : null;
  if (!option || !feature) return <div className="p-4 text-[13px] text-[#6b6b6b]">没有选中方案。点画面上的元素可以查看它的源位置与规则。</div>;
  const rules = Object.values(project.rules).filter((r) => r.featureId === feature.id && (!r.optionId || r.optionId === option.id));
  const issues = Object.values(project.issues).filter((i) => i.featureId === feature.id && (!i.optionId || i.optionId === option.id));
  return (
    <div className="p-4" data-testid="overview">
      <p className="mb-3 rounded bg-[#f6f3ff] px-2 py-1.5 text-[12px] text-[#5f3dc4]">点画面上的元素即选中，Agent 会拿到它的 文件:行号。</p>
      <H>功能目标</H>
      <p className="text-[14px] leading-snug" data-testid="feature-goal">
        {feature.goal}
      </p>
      {feature.roles.length ? <p className="mt-1 text-[12px] text-[#6b6b6b]">角色：{feature.roles.join('、')}</p> : null}

      <H>约束（{feature.constraints.length}）</H>
      {feature.constraints.length === 0 ? <p className="text-[13px] text-[#6b6b6b]">未列出约束。</p> : null}
      <ul className="flex flex-col gap-1">
        {feature.constraints.map((c) => (
          <li key={c.id} className="flex gap-1.5 text-[13px]">
            <span className={c.hard ? 'text-[#c92a2a]' : 'text-[#9a9a9a]'}>■</span>
            {c.text}
          </li>
        ))}
      </ul>

      <H>方案：{option.name}</H>
      <p className="text-[14px] leading-snug" data-testid="option-idea">
        {option.idea}
      </p>
      {option.decisionFocus ? <p className="mt-1 text-[12px] text-[#6b6b6b]">决策焦点：{option.decisionFocus}</p> : null}
      {option.tradeoffs.length ? (
        <ul className="mt-1.5 flex flex-col gap-0.5">
          {option.tradeoffs.map((t, i) => (
            <li key={i} className="text-[13px] leading-snug">
              · {t}
            </li>
          ))}
        </ul>
      ) : null}

      <H>规则（{rules.length}）</H>
      <ul className="flex flex-col gap-1.5">
        {rules.map((r) => (
          <RuleItem key={r.id} rule={r} />
        ))}
      </ul>

      <H>待决问题（{issues.length}）</H>
      {issues.length === 0 ? <p className="text-[13px] text-[#6b6b6b]">没有待决问题。</p> : null}
      <ul className="flex flex-col gap-1.5">
        {issues.map((i) => (
          <li key={i.id} className="rounded-md border border-[#f0c4a0] bg-[#fffaf2] px-2.5 py-2 text-[13px]" data-testid={`issue-${i.id}`}>
            <Chip cls="border-[#b35c00] text-[#8a4700]">{SEVERITY_LABEL[i.severity] ?? i.severity}</Chip> {i.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
