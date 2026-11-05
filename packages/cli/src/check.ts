import { existsSync } from 'node:fs';
import { realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tsImport } from 'tsx/esm/api';
import { compile, validate, type Diagnostic, type ValidationReport } from '@joplo/core';
import { loadAuthoring } from '@joplo/core/node';

export async function check(dir: string, optionId?: string): Promise<ValidationReport & { name: string }> {
  const root = await realpath(resolve(dir));
  const tsconfig = join(root, 'tsconfig.json');
  const loaded = await loadAuthoring(root, p => tsImport(p, { parentURL: import.meta.url, tsconfig: existsSync(tsconfig) ? tsconfig : false }));
  const compiled = loaded.authoring ? compile(loaded.authoring, 'dev') : null;
  const validated = compiled?.project ? validate(compiled.project, { optionId, mode: 'all' }) : null;
  // 编译器也会为同一布局的每份画面输出相同诊断；在 CLI 边界统一去重。
  const seen = new Set<string>();
  const diagnostics: Diagnostic[] = [...loaded.diagnostics, ...(compiled?.diagnostics ?? []), ...(validated?.diagnostics ?? [])].map(d => ({ ...d, at: d.at ?? 'joplo.config.ts:1:1' })).filter(d => {
    const key = JSON.stringify([d.at, d.code, d.message, d.severity]);
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
  return {
    name: compiled?.project?.name ?? loaded.authoring?.config.name ?? root,
    diagnostics,
    summary: { error: diagnostics.filter(d => d.severity === 'error').length, warning: diagnostics.filter(d => d.severity === 'warning').length, info: diagnostics.filter(d => d.severity === 'info').length },
    verification: validated?.verification ?? {},
  };
}
