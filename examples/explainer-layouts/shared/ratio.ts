/** Counts remain counts: the undecided segment is never silently renormalized away. */
export function ratioParts(left: number, right: number, total: number, threshold?: number) {
  if (![left,right,total].every(Number.isFinite) || left < 0 || right < 0 || total <= 0 || left + right > total) throw new Error('Counts must be finite, nonnegative and sum to at most total');
  if (threshold !== undefined && (!Number.isFinite(threshold) || threshold < 0 || threshold > total)) throw new Error('Threshold must be inside total');
  return { left: left / total * 100, right: right / total * 100, undecided: (total-left-right)/total*100, threshold: threshold === undefined ? undefined : threshold / total * 100 };
}
