import { en, type Dictionary } from '../i18n/en';
/**
 * 覆盖状态的标记（D55 不变量 7：颜色不单独表意）：每种状态 = 图标 + 中文名；左栏只放图标时，名字写在悬停提示和 aria-label 里。
 * 已表达 ✓ circle-check / 缺失 ✕ circle-x / 待决定 circle-dashed / 不适用 circle-minus。
 */
import type { Coverage } from '@joplo-app/core/runtime';

export type CoverageStatus = Coverage['status'] | 'none';
export type MarkTone = 'ok' | 'danger' | 'pending' | 'na';
export type CoverageMark = { icon: 'circle-check' | 'circle-x' | 'circle-dashed' | 'circle-minus'; tone: MarkTone; label: string };

export const COVERAGE_MARK = (i18n: Dictionary = en): Record<Coverage['status'], CoverageMark> => ({
  expressed: { icon: 'circle-check', tone: 'ok', label: i18n.player.covered },
  missing: { icon: 'circle-x', tone: 'danger', label: i18n.player.missing },
  undecided: { icon: 'circle-dashed', tone: 'pending', label: i18n.player.undecided },
  not_applicable: { icon: 'circle-minus', tone: 'na', label: i18n.player.notApplicable },
  excluded: { icon: 'circle-minus', tone: 'na', label: i18n.player.excluded },
});

/** 没有覆盖记录（none）或未知值都按“缺失”。 */
export function coverageMark(status: CoverageStatus | null | undefined, i18n: Dictionary = en): CoverageMark {
  return (status && status !== 'none' && Object.hasOwn(COVERAGE_MARK(i18n), status) ? COVERAGE_MARK(i18n)[status as Coverage['status']] : null) ?? COVERAGE_MARK(i18n).missing;
}
