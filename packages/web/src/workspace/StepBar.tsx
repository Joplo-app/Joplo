import { ChevronLeft, ChevronRight, Cpu, MousePointerClick, Pause, Play, RotateCcw } from 'lucide-react';
import type { Scenario } from '@joplo/core';
import type { Snapshot } from '../runtime/demo';
import { cn } from '@/lib/utils';
import { ACTION_LABEL, MOCK_CLS, OUTCOME_LABEL } from './labels';

export function StepBar({
  snap,
  scenario,
  onReset,
  onPrev,
  onNext,
  onPlay,
  onChip,
}: {
  snap: Snapshot;
  scenario: Scenario;
  onReset: () => void;
  onPrev: () => void;
  onNext: () => void;
  onPlay: () => void;
  onChip: (index: number) => void;
}) {
  const st = snap.state;
  const pos = st?.position ?? 0;
  const total = scenario.steps.length;
  const active = snap.activeStep;
  const shown = active !== null ? scenario.steps[active] : pos > 0 ? scenario.steps[pos - 1] : null;
  const next = st && !st.completed ? scenario.steps[pos] : undefined;
  const playLabel = !snap.playing ? '自动播放' : snap.paused ? '继续' : '暂停';
  const selectedStep = snap.mode === 'review' && snap.selection && !snap.selection.nodeId ? snap.selection.stepId : null;

  return (
    <div className="shrink-0 border-t bg-white" data-testid="step-bar">
      {st?.completed ? (
        <div
          className={cn('flex items-center gap-3 border-b px-4 py-2 text-[14px]', st.completed.outcome === 'success' ? 'bg-[#effaf1] text-[#1f6e30]' : st.completed.outcome === 'failure' ? 'bg-[#fff0f0] text-[#a51d1d]' : 'bg-[#f4f4f4] text-[#3a3a3a]')}
          data-testid="complete-banner"
          role="status"
        >
          <span className="rounded bg-current/10 px-2 py-0.5 font-semibold">场景完成 · {OUTCOME_LABEL[st.completed.outcome]}</span>
          <span>{st.completed.text}</span>
          <span className="ml-auto text-[12px] opacity-80">这是{scenario.mock.label}的演示结果，不代表真实服务的返回</span>
        </div>
      ) : null}
      <div className="flex items-center gap-3 px-4 pb-1 pt-2.5">
        <div className="flex items-center gap-1" role="toolbar" aria-label="播放控制">
          <CtlButton label="重置" onClick={onReset} testid="ctl-reset">
            <RotateCcw className="size-4" />
          </CtlButton>
          <CtlButton label="上一步" onClick={onPrev} testid="ctl-prev" disabled={pos === 0 && !snap.busy}>
            <ChevronLeft className="size-4" />
          </CtlButton>
          <button
            type="button"
            data-testid="ctl-play"
            aria-label={playLabel}
            onClick={onPlay}
            disabled={total === 0}
            className="flex h-9 items-center gap-1.5 rounded-md bg-[#1e1e1e] px-3.5 text-[14px] font-medium text-white hover:bg-[#333] disabled:opacity-40"
          >
            {snap.playing && !snap.paused ? <Pause className="size-4" /> : <Play className="size-4" />}
            {playLabel}
          </button>
          <CtlButton label="下一步" onClick={onNext} testid="ctl-next" disabled={total === 0}>
            <ChevronRight className="size-4" />
          </CtlButton>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[14px]" data-testid="caption">
            <span className="shrink-0 font-mono text-[12px] text-[#6b6b6b]">
              {total === 0 ? '0 步' : `第 ${active !== null ? active + 1 : pos} / ${total} 步`}
            </span>
            {shown ? (
              <>
                {shown.kind === 'system' ? <span className="shrink-0 rounded bg-[#1c5fb8] px-1.5 py-px text-[11px] font-semibold text-white">系统事件</span> : null}
                <span className="truncate font-medium">{shown.caption}</span>
              </>
            ) : (
              <span className="truncate text-[#5a5a5a]">初始状态{scenario.description ? `：${scenario.description}` : ''}</span>
            )}
            <span className={cn('ml-auto shrink-0 rounded border px-1.5 py-px text-[12px]', MOCK_CLS[scenario.mock.outcome])} data-testid="mock-label">
              {scenario.mock.label}
            </span>
          </div>
          <div className="truncate text-[12px] text-[#6b6b6b]" data-testid="next-hint">
            {total === 0 ? `这个场景没有步骤，只展示初始状态。${scenario.expected ? `预期：${scenario.expected}` : ''}` : next ? `下一步：${next.caption}` : st?.completed ? '场景已结束' : '已到最后一步'}
          </div>
        </div>
      </div>
      <ol className="flex items-center gap-1.5 overflow-x-auto px-4 pb-2.5 pt-1" aria-label="步骤">
        <li className="shrink-0">
          <button type="button" onClick={() => onChip(-1)} className={cn('h-7 shrink-0 whitespace-nowrap rounded-full border px-2.5 text-[12px]', pos === 0 ? 'border-[#1e1e1e] bg-[#1e1e1e] text-white' : 'border-[#d0d0d0] text-[#5a5a5a] hover:bg-black/5')} data-testid="chip-initial">
            初始
          </button>
        </li>
        {scenario.steps.map((s, i) => {
          const done = i < pos;
          const current = i === pos - 1;
          const isNext = i === pos && !st?.completed;
          const animating = active === i;
          const sys = s.kind === 'system';
          return (
            <li key={s.id} className="flex shrink-0 items-center gap-1.5">
              <span className="h-px w-3 bg-[#c8c8c8]" aria-hidden />
              <button
                type="button"
                data-testid={`chip-${s.id}`}
                data-step-kind={s.kind}
                data-state={current ? 'current' : done ? 'done' : isNext ? 'next' : 'todo'}
                onClick={() => onChip(i)}
                title={s.caption}
                className={cn(
                  'flex h-7 max-w-[220px] shrink-0 items-center gap-1 border px-2 text-[12px]',
                  sys ? 'rounded-md border-dashed' : 'rounded-full',
                  current ? 'border-[#1e1e1e] bg-[#1e1e1e] text-white' : done ? 'border-[#5a5a5a] bg-[#ececec] text-[#1e1e1e]' : isNext ? 'border-[var(--focus)] text-[#c2410c]' : 'border-[#d0d0d0] text-[#6b6b6b]',
                  animating && 'ring-2 ring-[var(--focus)] ring-offset-1',
                  selectedStep === s.id && 'outline-2 outline-offset-2 outline-[var(--sel)]',
                )}
              >
                {sys ? <Cpu className="size-3.5 shrink-0" /> : <MousePointerClick className="size-3.5 shrink-0" />}
                <span className="shrink-0 font-mono">{i + 1}</span>
                <span className="truncate">{sys ? '系统事件' : ACTION_LABEL[s.action.type]}</span>
                {!sys && 'target' in s.action ? <span className="truncate opacity-70">· {s.action.target}</span> : null}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function CtlButton({ label, onClick, children, testid, disabled }: { label: string; onClick: () => void; children: React.ReactNode; testid: string; disabled?: boolean }) {
  return (
    <button type="button" aria-label={label} title={label} data-testid={testid} onClick={onClick} disabled={disabled} className="flex h-9 items-center gap-1 rounded-md border px-2.5 text-[13px] hover:bg-black/5 disabled:opacity-40">
      {children}
      <span>{label}</span>
    </button>
  );
}
