import { outline, type Diagnostic, type Outline, type OutlineScenario } from '@joplo-app/core';
import { checkWithProject } from './check.ts';
import { oneLine } from './common.ts';

/** `joplo outline`（D67）：大纲 + 本次 check 的诊断数量（按代码）。编译失败时 outline 为 null。 */
export async function readOutline(dir: string, optionId?: string): Promise<{ name: string; outline: Outline | null; diagnostics: Diagnostic[]; summary: Record<'error' | 'warning' | 'info', number> }> {
  const report = await checkWithProject(dir, optionId);
  return { name: report.name, outline: report.project ? outline(report.project, { optionId }) : null, diagnostics: report.diagnostics, summary: report.summary };
}

const STATUS: Record<string, string> = { expressed: '✓', missing: '✗', undecided: '?', not_applicable: '–', excluded: '⊘' };
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const letter = (i: number) => LETTERS[i] ?? String(i + 1);

/** 约多久：一分钟以内写秒，再长写“m min s s”。 */
export function approx(ms: number): string {
  const s = Math.round(Math.max(0, ms) / 1000);
  if (s < 60) return `≈ ${s} s`;
  return `≈ ${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ''}`;
}

/** 终端里的显示宽度：中日韩等全角字符占两格。 */
export const displayWidth = (s: string) => [...s].reduce((n, ch) => n + ((ch.codePointAt(0) ?? 0) > 0x2e80 ? 2 : 1), 0);
const pad = (s: string, n: number) => { const w = displayWidth(s); return w >= n ? `${s} ` : s + ' '.repeat(n - w); };

function scenarioLine(s: OutlineScenario, caseKeys: Map<string, string>, width: number, nameWidth: number): string {
  const shape = s.steps === 0 ? 'initial state only' : `${s.steps} step${s.steps === 1 ? '' : 's'} ${approx(s.ms)}`;
  const frame = [s.opening ? 'opens with a card' : '', s.ending ? 'ends with a card' : ''].filter(Boolean).join(', ');
  const cases = s.caseIds.map((c) => caseKeys.get(c) ?? c).join(', ');
  return `    ${pad(s.key, width)}${pad(oneLine(s.name), nameWidth)}${pad(shape, 19)}${s.outcome}${frame ? ` · ${frame}` : ''}${cases ? ` · cases: ${cases}` : ''}`;
}

/** 文字版大纲：每个功能一节，先“给谁、解决什么、验收条件”，再按方案列场景与节奏。 */
export function outlineText(r: Awaited<ReturnType<typeof readOutline>>): string[] {
  const out: string[] = [];
  if (!r.outline) {
    out.push(`${r.name}: the project did not compile (${r.summary.error} error). Run npx joplo check for file:line.`);
    return out;
  }
  const o = r.outline;
  const scenarios = o.features.flatMap((f) => f.options.flatMap((x) => x.scenarios));
  const total = scenarios.reduce((n, s) => n + s.ms, 0);
  out.push(`${o.name} · ${o.features.length} feature(s), ${o.features.reduce((n, f) => n + f.options.length, 0)} option(s), ${scenarios.length} scenario(s), ${approx(total)} at 1×`);
  for (const f of o.features) {
    out.push('', `## ${f.id} · ${oneLine(f.name)}${f.pick ? `   picked: ${f.pick.slice(f.id.length + 1)}` : '   no picked option'}`);
    out.push(`Goal: ${oneLine(f.goal)}`);
    out.push(`Roles: ${f.roles.length ? f.roles.map(oneLine).join(', ') : '(none declared; who is this for?)'}`);
    const caseKeys = new Map(f.cases.map((c) => [c.id, c.key]));
    if (f.cases.length) {
      const kw = Math.max(...f.cases.map((c) => displayWidth(c.key))) + 2;
      out.push(`Cases (${f.options.map((x, i) => letter(i)).join(' ')}: ✓ shown ✗ missing ? undecided – not applicable ⊘ excluded):`);
      for (const c of f.cases) {
        const marks = f.options.map((x) => STATUS[c.coverage[x.id] ?? ''] ?? ' ').join(' ');
        out.push(`  ${pad(c.key, kw)}${pad(c.dimension, 12)}${pad(c.priority, 7)}${marks}  ${oneLine(c.title)} → ${c.expected.trim() ? oneLine(c.expected) : '(expected result not written)'}`);
      }
    } else out.push('Cases: (none; see npx joplo skill cases)');
    f.options.forEach((x, i) => {
      out.push(`${letter(i)} · ${x.key} · ${oneLine(x.name)}${x.picked ? ' (picked)' : ''}: ${x.scenarios.length} scenario(s) ${approx(x.ms)}${x.missing || x.undecided ? ` · missing ${x.missing} · undecided ${x.undecided}` : ''}`);
      const kw = Math.max(0, ...x.scenarios.map((s) => displayWidth(s.key))) + 2;
      const nw = Math.min(40, Math.max(0, ...x.scenarios.map((s) => displayWidth(oneLine(s.name)))) + 2);
      for (const s of x.scenarios) out.push(scenarioLine(s, caseKeys, kw, nw));
    });
  }
  const byCode = new Map<string, number>();
  for (const d of r.diagnostics) byCode.set(`${d.severity} ${d.code}`, (byCode.get(`${d.severity} ${d.code}`) ?? 0) + 1);
  out.push('', `check: ${r.summary.error} error, ${r.summary.warning} warning, ${r.summary.info} info${byCode.size ? ` (${[...byCode].map(([k, n]) => `${k} ×${n}`).join(', ')})` : ''}. Run npx joplo check for file:line.`);
  return out;
}
