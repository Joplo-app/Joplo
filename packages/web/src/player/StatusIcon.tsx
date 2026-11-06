import { useI18n } from '../i18n/context';
/** 覆盖状态图标（D55 不变量 7）：图标 + 文字，或只有图标时 aria-label / 悬停提示写全称。映射见 status.ts。 */
import { CircleCheck, CircleDashed, CircleMinus, CircleX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { coverageMark, type CoverageStatus, type MarkTone } from './status';

const ICON = { 'circle-check': CircleCheck, 'circle-x': CircleX, 'circle-dashed': CircleDashed, 'circle-minus': CircleMinus } as const;
export const TONE_TEXT: Record<MarkTone, string> = { ok: 'text-jb-ok', danger: 'text-jb-danger', pending: 'text-jb-pending', na: 'text-jb-na' };

export function StatusIcon({ status, size = 16, withLabel = false, className, labelPrefix = '' }: { status: CoverageStatus | null | undefined; size?: number; withLabel?: boolean; className?: string; labelPrefix?: string }) {
  const { t: i18n } = useI18n();

  const m = coverageMark(status, i18n);
  const Icon = ICON[m.icon];
  if (!withLabel) return <Icon role="img" aria-label={`${labelPrefix}${m.label}`} className={cn('shrink-0', TONE_TEXT[m.tone], className)} style={{ width: size, height: size }} strokeWidth={2} data-status-icon={m.icon} />;
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap font-semibold', TONE_TEXT[m.tone], className)} data-status-icon={m.icon}>
      <Icon aria-hidden style={{ width: size, height: size }} strokeWidth={2} />
      {labelPrefix}
      {m.label}
    </span>
  );
}
