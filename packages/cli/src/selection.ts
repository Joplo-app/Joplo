import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { JoploError, type Selection } from '@joplo-app/core';

export type SelectionView = { selection: Selection | null; lines: { number: number; text: string }[]; note?: string };
export async function readSelection(dir: string): Promise<SelectionView> {
  const root = resolve(dir);
  let raw: unknown;
  try { raw = JSON.parse(await readFile(resolve(root, '.joplo/selection.json'), 'utf8')); }
  catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { selection: null, lines: [] };
    throw e;
  }
  if (raw === null) return { selection: null, lines: [] };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new JoploError('INVALID_SCHEMA', 'selection.json must be a Selection or null');
  const selection = raw as Selection;
  if (selection.at == null) return { selection, lines: [], note: 'This selection has no source location' };
  const match = typeof selection.at === 'string' && /^(.*):(\d+):(\d+)$/.exec(selection.at);
  if (!match || Number(match[2]) < 1 || Number(match[3]) < 1) throw new JoploError('INVALID_SCHEMA', 'selection.at must be file:line:column');
  const file = resolve(root, match[1]!);
  const rel = relative(root, file);
  if (isAbsolute(match[1]!) || rel === '..' || rel.startsWith(`..${sep}`)) throw new JoploError('INVALID_SCHEMA', 'selection.at must be a relative path within the project');
  try {
    const lines = (await readFile(file, 'utf8')).split(/\r?\n/);
    const line = Number(match[2]);
    if (line > lines.length) return { selection, lines: [], note: 'The source file changed; this line no longer exists' };
    return { selection, lines: lines.slice(Math.max(0, line - 4), line + 3).map((text, i) => ({ number: Math.max(1, line - 3) + i, text })) };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { selection, lines: [], note: 'The source file no longer exists' };
    throw e;
  }
}
