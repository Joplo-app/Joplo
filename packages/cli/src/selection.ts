import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { JoploError, type Selection } from '@tokenroll/joplo-core';

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
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new JoploError('INVALID_SCHEMA', 'selection.json 应为 Selection 或 null');
  const selection = raw as Selection;
  if (selection.at == null) return { selection, lines: [], note: '该选中对象没有源位置' };
  const match = typeof selection.at === 'string' && /^(.*):(\d+):(\d+)$/.exec(selection.at);
  if (!match || Number(match[2]) < 1 || Number(match[3]) < 1) throw new JoploError('INVALID_SCHEMA', 'selection.at 必须为 文件:行:列');
  const file = resolve(root, match[1]!);
  const rel = relative(root, file);
  if (isAbsolute(match[1]!) || rel === '..' || rel.startsWith(`..${sep}`)) throw new JoploError('INVALID_SCHEMA', 'selection.at 必须指向项目内的相对路径');
  try {
    const lines = (await readFile(file, 'utf8')).split(/\r?\n/);
    const line = Number(match[2]);
    if (line > lines.length) return { selection, lines: [], note: '源文件已变化，该行不存在' };
    return { selection, lines: lines.slice(Math.max(0, line - 4), line + 3).map((text, i) => ({ number: Math.max(1, line - 3) + i, text })) };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { selection, lines: [], note: '源文件已不存在' };
    throw e;
  }
}
