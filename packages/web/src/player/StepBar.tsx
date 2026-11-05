/**
 * 紧凑步骤条（一行）：重置、上一步、播放/暂停、下一步、字幕、步骤点、模拟标签。看板与发布站共用。
 */
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from 'lucide-react';
import type { Scenario } from '@tokenroll/joplo-core';
import type { Snapshot } from '../runtime/demo';
import { cn } from '@/lib/utils';
import { MOCK_CLS, OUTCOME_LABEL } from './labels';

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
  const done = st?.completed;

  return (
    <div className="flex h-[60px] shrink-0 items-center gap-3 border-t bg-white px-3" data-testid="step-bar">
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
          title={`${playLabel}（空格）`}
          onClick={onPlay}
          disabled={total === 0}
          className="flex h-9 items-center gap-1.5 rounded-md bg-[#1e1e1e] px-3 text-[14px] font-medium text-white hover:bg-[#333] disabled:opacity-40"
        >
          {snap.playing && !snap.paused ? <Pause className="size-4" /> : <Play className="size-4" />}
          {playLabel}
        </button>
        <CtlButton label="下一步" onClick={onNext} testid="ctl-next" disabled={total === 0}>
          <ChevronRight className="size-4" />
        </CtlButton>
      </div>

      <div className="min-w-0 flex-1" data-testid="caption">
        <div className="flex items-center gap-2 text-[15px]">
          <span className="shrink-0 font-mono text-[12px] text-[#6b6b6b]">{total === 0 ? '0 步' : `第 ${active !== null ? active + 1 : pos} / ${total} 步`}</span>
          {done && active === null ? (
            <span
              data-testid="complete-banner"
              role="status"
              className={cn('flex min-w-0 items-center gap-2 rounded px-2 py-0.5', done.outcome === 'success' ? 'bg-[#effaf1] text-[#1f6e30]' : done.outcome === 'failure' ? 'bg-[#fff0f0] text-[#a51d1d]' : 'bg-[#f4f4f4] text-[#3a3a3a]')}
            >
              <strong className="shrink-0">场景完成 · {OUTCOME_LABEL[done.outcome]}</strong>
              <span className="truncate">{done.text}</span>
            </span>
          ) : shown ? (
            <>
              {shown.kind === 'system' ? <span className="shrink-0 rounded bg-[#1c5fb8] px-1.5 py-px text-[11px] font-semibold text-white">系统事件</span> : null}
              <span className="truncate font-medium">{shown.caption}</span>
            </>
          ) : (
            <span className="truncate text-[#5a5a5a]">初始状态{scenario.description ? `：${scenario.description}` : ''}</span>
          )}
        </div>
        <div className="truncate text-[12px] text-[#6b6b6b]" data-testid="next-hint">
          {total === 0 ? `这个场景没有步骤，只展示初始状态。${scenario.expected ? `预期：${scenario.expected}` : ''}` : next ? `下一步：${next.caption}` : done ? `这是${scenario.mock.label}的演示结果，不代表真实服务的返回` : '已到最后一步'}
        </div>
      </div>

      <ol className="flex max-w-[34%] shrink-0 items-center gap-1 overflow-x-auto py-1" aria-label="步骤">
        <li>
          <button type="button" onClick={() => onChip(-1)} title="初始状态" data-testid="chip-initial" className={cn('flex size-6 items-center justify-center rounded-full border text-[11px]', pos === 0 ? 'border-[#1e1e1e] bg-[#1e1e1e] text-white' : 'border-[#c8c8c8] text-[#6b6b6b] hover:bg-black/5')}>
            0
          </button>
        </li>
        {scenario.steps.map((s, i) => {
          const isDone = i < pos;
          const current = i === pos - 1;
          const isNext = i === pos && !st?.completed;
          return (
            <li key={s.id} className="flex items-center gap-1">
              <span className="h-px w-1.5 bg-[#c8c8c8]" aria-hidden />
              <button
                type="button"
                data-testid={`chip-${s.id}`}
                data-step-kind={s.kind}
                data-state={current ? 'current' : isDone ? 'done' : isNext ? 'next' : 'todo'}
                onClick={() => onChip(i)}
                title={`${i + 1}. ${s.caption}`}
                aria-label={`第 ${i + 1} 步：${s.caption}`}
                className={cn(
                  'flex size-6 items-center justify-center border text-[11px]',
                  s.kind === 'system' ? 'rounded-[5px] border-dashed' : 'rounded-full',
                  current ? 'border-[#1e1e1e] bg-[#1e1e1e] text-white' : isDone ? 'border-[#5a5a5a] bg-[#ececec]' : isNext ? 'border-[var(--focus)] text-[#c2410c]' : 'border-[#c8c8c8] text-[#8a8a8a]',
                  active === i && 'ring-2 ring-[var(--focus)] ring-offset-1',
                  selectedStep === s.id && 'outline-2 outline-offset-2 outline-[var(--sel)]',
                )}
              >
                {i + 1}
              </button>
            </li>
          );
        })}
      </ol>

      <span className={cn('shrink-0 rounded border px-1.5 py-px text-[12px]', MOCK_CLS[scenario.mock.outcome])} data-testid="mock-label" title="演示中的结果是模拟的">
        {scenario.mock.label}
      </span>
    </div>
  );
}

function CtlButton({ label, onClick, children, testid, disabled }: { label: string; onClick: () => void; children: React.ReactNode; testid: string; disabled?: boolean }) {
  return (
    <button type="button" aria-label={label} title={label} data-testid={testid} onClick={onClick} disabled={disabled} className="flex h-9 items-center gap-1 rounded-md border px-2 text-[13px] hover:bg-black/5 disabled:opacity-40">
      {children}
      <span className="max-[1280px]:hidden">{label}</span>
    </button>
  );
}
