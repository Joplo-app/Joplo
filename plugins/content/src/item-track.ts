import type { Bind } from '@joplo-app/kit/node';
import type { JoploProps } from '@joplo-app/kit/plugin';
import { z } from 'zod';

export type ItemTrackProps = JoploProps & {
  capacity: number;
  items: readonly object[] | Bind;
  keyField?: string;
  labelField?: string;
  accentField?: string;
  direction?: 'row' | 'column';
  emptyLabel?: string;
};

const field = z.string().trim().min(1);
const options = z.object({
  capacity: z.number().int().min(1).max(4096),
  keyField: field.default('id'),
  labelField: field.default('label'),
  accentField: field.default('accent'),
  direction: z.enum(['row', 'column']).default('row'),
  emptyLabel: z.string().default('空槽'),
});

type Entry = { key: string; label: string; accent?: string };

/** Both the compiler and the player apply the same identity and capacity rules to a snapshot. */
export function readTrack(props: Record<string, unknown>) {
  const entries: Entry[] = [];
  const issues: string[] = [];
  const parsed = options.safeParse(props);
  const track = { capacity: 0, direction: 'row', emptyLabel: '空槽', ...parsed.data, entries, issues };
  if (!parsed.success) {
    for (const issue of parsed.error.issues) issues.push(`${issue.path.join('.')}: ${issue.message}`);
    return track;
  }
  if (!Array.isArray(props.items)) {
    issues.push('items must be an array of objects (initialize an empty track with []).');
    return track;
  }
  const { capacity, keyField, labelField, accentField } = parsed.data;
  if (props.items.length > capacity) issues.push(`items has ${props.items.length} entries for capacity ${capacity}. Remove entries or increase capacity.`);
  const seen = new Set<string>();
  for (const [index, item] of props.items.entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      issues.push(`items[${index}] must be an object with a stable ${keyField}.`);
      continue;
    }
    const raw = Object.hasOwn(item, keyField) ? item[keyField] : undefined;
    if (!(typeof raw === 'string' && raw.trim() || typeof raw === 'number' && Number.isFinite(raw))) {
      issues.push(`items[${index}].${keyField} must be a nonempty string or finite number.`);
      continue;
    }
    const key = String(raw);
    if (seen.has(key)) {
      issues.push(`items[${index}] repeats ${keyField} ${JSON.stringify(key)}. Give each object a unique, stable key.`);
      continue;
    }
    seen.add(key);
    if (entries.length < capacity) {
      const label = item[labelField];
      entries.push({ key, label: typeof label === 'string' || typeof label === 'number' ? String(label) : key, accent: typeof item[accentField] === 'string' ? item[accentField] : undefined });
    }
  }
  return track;
}
