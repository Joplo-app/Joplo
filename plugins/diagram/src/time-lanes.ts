import { z } from 'zod';

const time = z.number().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER);
const name = z.string().min(1).refine(value => !!value.trim(), 'must contain text');
const span = z.object({
  id: name, lane: name, start: time, end: time, label: z.string().optional(), status: z.enum(['ok', 'warn', 'fail']).optional(),
});
const chart = z.object({
  domain: z.tuple([time, time]), spans: z.array(span), unit: z.string().default('ms'),
}).superRefine(({ domain: [min, max], spans }, ctx) => {
  if (max <= min) ctx.addIssue({ code: 'custom', path: ['domain'], message: 'domain[1] must be greater than domain[0]' });
  const ids = new Set<string>();
  for (const [index, item] of spans.entries()) {
    const path = ['spans', index];
    if (ids.has(item.id)) ctx.addIssue({ code: 'custom', path: [...path, 'id'], message: `duplicate id "${item.id}"` });
    ids.add(item.id);
    if (item.end < item.start) ctx.addIssue({ code: 'custom', path, message: `"${item.id}" needs end >= start` });
    if (item.start < min || item.end > max) ctx.addIssue({ code: 'custom', path, message: `"${item.id}" must lie inside domain [${min}, ${max}]` });
  }
});

export type TimeSpan = z.infer<typeof span>;

export function readTimeLanes(props: Record<string, unknown>) {
  const result = chart.safeParse(props);
  return result.success ? { data: result.data } : { error: result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('. ') };
}

/** Lane order follows the author. Within a lane overlapping intervals occupy different rows. */
export function layoutTimeLanes(spans: TimeSpan[]) {
  const grouped = new Map<string, TimeSpan[]>();
  for (const span of spans) {
    let group = grouped.get(span.lane);
    if (!group) grouped.set(span.lane, group = []);
    group.push(span);
  }
  return Array.from(grouped, ([lane, group]) => {
    const last: TimeSpan[] = [];
    const bars = group.sort((a, b) => a.start - b.start || a.end - b.end).map(span => {
      let row = last.findIndex(prev => prev.end < span.start || prev.end === span.start && prev.start < prev.end);
      if (row < 0) row = last.length;
      // A zero-duration event still occupies its instant on screen.
      last[row] = span;
      return { span, row };
    });
    return { lane, bars, rows: last.length };
  });
}
