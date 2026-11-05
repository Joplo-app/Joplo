/**
 * 覆盖状态的标记（D55 不变量 7：颜色不单独表意）：每种状态 = 图标 + 中文名；左栏只放图标时，名字写在悬停提示和 aria-label 里。
 * 已表达 ✓ circle-check / 缺失 ✕ circle-x / 待决定 circle-dashed / 不适用 circle-minus。
 */
import type { Coverage } from '@joplo-app/core';

export type CoverageStatus = Coverage['status'] | 'none';
export type MarkTone = 'ok' | 'danger' | 'pending' | 'na';
export type CoverageMark = { icon: 'circle-check' | 'circle-x' | 'circle-dashed' | 'circle-minus'; tone: MarkTone; label: string };

export const COVERAGE_MARK: Record<Coverage['status'], CoverageMark> = {
  expressed: { icon: 'circle-check', tone: 'ok', label: '已表达' },
  missing: { icon: 'circle-x', tone: 'danger', label: '缺失' },
  undecided: { icon: 'circle-dashed', tone: 'pending', label: '待决定' },
  not_applicable: { icon: 'circle-minus', tone: 'na', label: '不适用' },
  excluded: { icon: 'circle-minus', tone: 'na', label: '已排除' },
};

/** 没有覆盖记录（none）或未知值都按“缺失”。 */
export function coverageMark(status: CoverageStatus | null | undefined): CoverageMark {
  return (status && status !== 'none' && Object.hasOwn(COVERAGE_MARK, status) ? COVERAGE_MARK[status as Coverage['status']] : null) ?? COVERAGE_MARK.missing;
}
