import { useState } from 'react';
import { Check, Copy, X } from 'lucide-react';
import { findNode, isNodeDisabled, isNodeVisible, nodeLabel, resolveProps, type PlayState, type Project, type Rule } from '@joplo/core';
import type { Selection } from '../api';
import { cn } from '@/lib/utils';
import { CONFIRM_LABEL, COVERAGE_LABEL, ORIGIN_LABEL, SEVERITY_LABEL, TYPE_LABEL } from './labels';

export function Inspector({ project, optionId, state, selection, onClear, onScenario }: { project: Project; optionId: string | null; state: PlayState | null; selection: Selection | null; onClear: () => void; onScenario: (id: string) => void }) {
  return (
    <aside className="flex w-[330px] shrink-0 flex-col overflow-y-auto border-l bg-white" aria-label="检查器" data-testid="inspector">
      {selection && (selection.nodeId || selection.stepId) ? (
        <SelectionView project={project} state={state} selection={selection} onClear={onClear} onScenario={onScenario} />
      ) : (
        <OverviewView project={project} optionId={optionId} />
      )}
    </aside>
  );
}

function H({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-1.5 mt-4 text-[12px] font-semibold uppercase tracking-wide text-[#6b6b6b] first:mt-0">{children}</h3>;
}

function Chip({ cls, children, title }: { cls: string; children: React.ReactNode; title?: string }) {
  return (
    <span className={cn('inline-block shrink-0 rounded border px-1.5 py-px text-[11px] leading-[16px]', cls)} title={title}>
      {children}
    </span>
  );
}

export function RuleItem({ rule }: { rule: Rule }) {
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
        {rule.optionId ? <Chip cls="border-[#e0e0e0] text-[#6b6b6b]">本方案</Chip> : <Chip cls="border-[#e0e0e0] text-[#6b6b6b]">功能共享</Chip>}
      </div>
      <div className="text-[13px] leading-snug">{rule.text}</div>
    </li>
  );
}

function OverviewView({ project, optionId }: { project: Project; optionId: string | null }) {
  const option = optionId ? project.options[optionId] : null;
  const feature = option ? project.features[option.featureId] : null;
  if (!option || !feature) return <div className="p-4 text-[13px] text-[#6b6b6b]">没有选中方案。</div>;
  const rules = Object.values(project.rules).filter((r) => r.featureId === feature.id && (!r.optionId || r.optionId === option.id));
  const issues = Object.values(project.issues).filter((i) => i.featureId === feature.id && (!i.optionId || i.optionId === option.id) && i.status === 'open');
  const hard = feature.constraints.filter((c) => c.hard);
  const aiCount = rules.filter((r) => r.origin === 'ai_assumption').length;
  return (
    <div className="p-4">
      <H>功能目标</H>
      <p className="text-[14px] leading-snug" data-testid="feature-goal">
        {feature.goal}
      </p>
      {feature.roles.length ? <p className="mt-1 text-[12px] text-[#6b6b6b]">角色：{feature.roles.join('、')}</p> : null}

      <H>硬约束（{hard.length}）</H>
      {hard.length === 0 ? <p className="text-[13px] text-[#6b6b6b]">未列出硬约束。</p> : null}
      <ul className="flex flex-col gap-1">
        {hard.map((c) => (
          <li key={c.id} className="flex gap-1.5 text-[13px]">
            <span className="text-[#c92a2a]">■</span>
            {c.text}
          </li>
        ))}
      </ul>

      <H>当前方案</H>
      <div className="rounded-md border border-[#e4e4e4] p-2.5">
        <div className="text-[14px] font-semibold">{option.name}</div>
        <div className="mt-1 text-[13px] leading-snug">{option.idea}</div>
        {option.decisionFocus ? <div className="mt-1.5 text-[12px] text-[#5a5a5a]">设计决策：{option.decisionFocus}</div> : null}
        {option.tradeoffs.length ? (
          <>
            <div className="mt-2 text-[12px] font-semibold text-[#5a5a5a]">取舍</div>
            <ul className="mt-0.5 flex list-disc flex-col gap-0.5 pl-4 text-[13px]">
              {option.tradeoffs.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </>
        ) : null}
      </div>

      <H>
        规则（{rules.length}
        {aiCount ? `，其中 AI 假设 ${aiCount}` : ''}）
      </H>
      <ul className="flex flex-col gap-1.5" data-testid="rule-list">
        {rules.map((r) => (
          <RuleItem key={r.id} rule={r} />
        ))}
      </ul>

      <H>未关闭的问题（{issues.length}）</H>
      {issues.length === 0 ? <p className="text-[13px] text-[#6b6b6b]">没有未关闭的问题。</p> : null}
      <ul className="flex flex-col gap-1.5" data-testid="issue-list">
        {issues.map((i) => (
          <li key={i.id} className="rounded-md border border-[#f0c9a0] bg-[#fffaf3] px-2.5 py-2 text-[13px]">
            <div className="mb-1 flex gap-1">
              <Chip cls="border-[#b35c00] text-[#8a4700]">{SEVERITY_LABEL[i.severity] ?? i.severity}</Chip>
              <Chip cls="border-[#d0d0d0] text-[#6b6b6b]">{i.source === 'ai' ? 'AI 提出' : i.source === 'user' ? '用户提出' : '校验器'}</Chip>
            </div>
            {i.text}
          </li>
        ))}
      </ul>
      <p className="mt-5 text-[12px] leading-snug text-[#8a8a8a]">切到“审阅”模式后点击画面中的元素，可以查看它的规则、步骤和情况，并把选中同步给 Agent。</p>
    </div>
  );
}

function SelectionView({ project, state, selection, onClear, onScenario }: { project: Project; state: PlayState | null; selection: Selection; onClear: () => void; onScenario: (id: string) => void }) {
  const [copied, setCopied] = useState(false);
  const scene = project.scenes[selection.sceneId];
  const hit = selection.nodeId && scene ? findNode(scene, selection.nodeId) : null;
  const ref = selection.nodeId ? `${selection.sceneId}#${selection.nodeId}` : null;
  const optionScenarios = Object.values(project.scenarios).filter((s) => s.optionId === selection.optionId);
  const step = selection.stepId ? project.scenarios[selection.scenarioId]?.steps.find((s) => s.id === selection.stepId) : null;

  const copy = async () => {
    if (!ref) return;
    try {
      await navigator.clipboard.writeText(ref);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = ref;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // 选中元素：只看引用该元素的规则；只选中步骤：看该步骤关联的规则。
  const rules = Object.values(project.rules).filter((r) => (ref ? r.elementRefs.includes(ref) : !!step && (r.stepIds.includes(step.id) || step.ruleIds.includes(r.id))));
  const targetingSteps = selection.nodeId
    ? optionScenarios.flatMap((sc) => sc.steps.map((s, i) => ({ sc, s, i })).filter(({ s }) => 'target' in s.action && s.action.target === selection.nodeId))
    : [];
  const caseIds = new Set<string>([...rules.flatMap((r) => r.caseIds), ...targetingSteps.flatMap(({ sc }) => sc.caseIds), ...(!ref && step ? (project.scenarios[selection.scenarioId]?.caseIds ?? []) : [])]);
  const option = project.options[selection.optionId];
  const node = hit?.node;
  const sameScene = state && state.sceneId === selection.sceneId;
  const p = node && state ? resolveProps(node, state) : (node?.props ?? {});

  return (
    <div className="p-4" data-testid="selection-view">
      <div className="mb-3 flex items-center justify-between">
        <span className="rounded bg-[var(--sel)] px-2 py-0.5 text-[12px] font-semibold text-white">已选中</span>
        <button type="button" className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[12px] text-[#6b6b6b] hover:bg-black/5" onClick={onClear} aria-label="取消选中">
          <X className="size-3.5" />
          取消选中
        </button>
      </div>
      {selection.nodeId && !node ? <p className="mb-2 rounded border border-[#c92a2a] bg-[#fff0f0] p-2 text-[13px] text-[#a51d1d]">选中的元素 {selection.nodeId} 在当前修订的画面中已不存在。</p> : null}
      {node ? (
        <>
          <div className="text-[17px] font-semibold" data-testid="sel-label">
            {nodeLabel({ type: node.type, props: p })}
          </div>
          <div className="mt-0.5 text-[13px] text-[#5a5a5a]">
            {TYPE_LABEL[node.type] ?? node.type} <span className="font-mono text-[12px] text-[#8a8a8a]">({node.type})</span>
          </div>
          <div className="mt-2 flex items-center gap-1 rounded border bg-[#fafafa] px-2 py-1">
            <code className="flex-1 truncate font-mono text-[12px]" data-testid="sel-ref">
              {ref}
            </code>
            <button type="button" onClick={copy} className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[12px] hover:bg-black/5" aria-label="复制元素引用" data-testid="copy-ref">
              {copied ? <Check className="size-3.5 text-[#2b8a3e]" /> : <Copy className="size-3.5" />}
              {copied ? '已复制' : '复制'}
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {sameScene && state ? (
              <>
                <Chip cls="border-[#d0d0d0] text-[#5a5a5a]">{isNodeVisible(scene!, node.id, state) ? '当前可见' : '当前隐藏'}</Chip>
                {isNodeDisabled(node, state) ? <Chip cls="border-[#5a5a5a] text-[#3a3a3a]">当前禁用</Chip> : null}
              </>
            ) : null}
            {node.unmodeled ? <Chip cls="border-[#b35c00] bg-[#fff4e0] text-[#8a4700]">当前演示未建模</Chip> : null}
          </div>
          {node.note ? (
            <>
              <H>设计说明</H>
              <p className="text-[13px] leading-snug">{node.note}</p>
            </>
          ) : null}
          {node.disabledReason ? (
            <>
              <H>禁用原因</H>
              <p className="text-[13px] leading-snug">{node.disabledReason}</p>
            </>
          ) : null}
        </>
      ) : null}
      {step ? (
        <>
          <H>{ref ? '选中时所在的步骤' : '选中的步骤'}</H>
          <p className="text-[13px] leading-snug">
            <span className="font-mono text-[12px] text-[#6b6b6b]">{step.id}</span> · {step.caption}
          </p>
        </>
      ) : (
        <p className="mt-3 text-[12px] text-[#6b6b6b]">选中时处于场景初始状态。</p>
      )}

      <H>关联规则（{rules.length}）</H>
      {rules.length === 0 ? <p className="text-[13px] text-[#6b6b6b]">没有规则引用它。</p> : null}
      <ul className="flex flex-col gap-1.5">
        {rules.map((r) => (
          <RuleItem key={r.id} rule={r} />
        ))}
      </ul>

      {selection.nodeId ? (
        <>
          <H>以它为目标的步骤（{targetingSteps.length}）</H>
          {targetingSteps.length === 0 ? <p className="text-[13px] text-[#6b6b6b]">没有步骤操作它。</p> : null}
          <ul className="flex flex-col gap-1">
            {targetingSteps.map(({ sc, s, i }) => (
              <li key={`${sc.id}:${s.id}`} className="text-[13px] leading-snug">
                <button type="button" className="text-left text-[#1c5fb8] hover:underline" onClick={() => onScenario(sc.id)}>
                  {sc.name}
                </button>{' '}
                · 第 {i + 1} 步：{s.caption}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <H>关联情况（{caseIds.size}）</H>
      {caseIds.size === 0 ? <p className="text-[13px] text-[#6b6b6b]">没有关联情况。</p> : null}
      <ul className="flex flex-col gap-1">
        {[...caseIds].map((cid) => {
          const cov = option?.coverage[cid];
          const lab = cov ? COVERAGE_LABEL[cov.status] : COVERAGE_LABEL.missing;
          return (
            <li key={cid} className="flex items-start gap-1.5 text-[13px]">
              <Chip cls={lab.cls}>{lab.text}</Chip>
              <span>{project.cases[cid]?.title ?? cid}</span>
            </li>
          );
        })}
      </ul>
      <p className="mt-5 rounded border border-dashed border-[var(--sel)] bg-[#f6f3ff] p-2 text-[12px] leading-snug text-[#5f3dc4]">选中已写入 .joplo/selection.json。在 Agent 会话里直接说要改什么，Agent 读取当前选中后只改这一处。</p>
    </div>
  );
}
