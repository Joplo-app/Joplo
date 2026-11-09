/** 所有作品共用的章节接续解析；不修改作者对象，不在消费端重推默认值。 */
import { Flow, type Chapter, type FlowOpts } from '@joplo-app/kit';

export function resolveSlices(slices: Record<string, Flow | Chapter>, label: string, report: (code: string, message: string, at?: string) => void): { scenarios: Record<string, Flow>; linear: boolean } {
  const all = Object.values(slices);
  const linear = all.some(s => s.kind === 'chapter');
  if (!linear) return { scenarios: slices as Record<string, Flow>, linear: false };
  if (all.some(s => s.kind !== 'chapter')) report('WORK_SLICES_MIXED', `${label} mixes chapter() and flow(); use one slice style throughout the work`, all.find(s => s.kind !== 'chapter')?.source);
  const scenarios: Record<string, Flow> = {};
  let previous: string | undefined;
  for (const [key, slice] of Object.entries(slices)) {
    const raw = slice.kind === 'chapter' ? slice.chapterOptions : slice.opts;
    const from = raw.from === undefined ? previous : raw.from;
    const { from: _from, ...rest } = raw;
    const opts: FlowOpts = { ...rest, ...(from !== null && from !== undefined ? { from } : {}) };
    scenarios[key] = Object.assign(new Flow(slice.name, opts), { steps: slice.steps, source: slice.source });
    previous = key;
  }
  return { scenarios, linear };
}
