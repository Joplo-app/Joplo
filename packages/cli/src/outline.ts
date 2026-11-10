import { entriesOf, entryOf, outline, type Entry, type Diagnostic, type Outline, type OutlineScenario } from '@joplo-app/core';
import { resolveWorkId } from './work.ts';
import { checkWithProject } from './check.ts';
import { oneLine } from './common.ts';

/** `joplo outline`（D67）：大纲 + 本次 check 的诊断数量（按代码）。编译失败时 outline 为 null。 */
export async function readOutline(dir: string, workId?: string): Promise<{ name: string; entries: Entry[]; works: Record<string, Entry>; outline: Outline | null; diagnostics: Diagnostic[]; summary: Record<'error' | 'warning' | 'info', number> }> {
  const report = await checkWithProject(dir, workId);
  const selected = workId && report.project ? resolveWorkId(report.project, workId) : undefined;
  // 指定未选方案时，同样从条目投影读取它的章节能力。
  const projected = report.project && selected ? { ...report.project, features: Object.fromEntries(Object.entries(report.project.features).map(([id, f]) => [id, f.workIds.includes(selected) ? { ...f, pick: selected } : f])) } : report.project;
  const works: Record<string, Entry> = {};
  if (report.project) for (const entry of entriesOf(report.project)) {
    if (entry.featureId === null) { if (entry.workId) works[entry.workId] = entry; continue; }
    const feature = report.project.features[entry.featureId]!;
    for (const workId of feature.workIds) works[workId] = entryOf({ ...report.project, features: { ...report.project.features, [feature.id]: { ...feature, pick: workId } } }, feature.id)!;
  }
  const data = report.project ? outline(report.project, { workId: selected }) : null;
  if (data && selected) for (const f of data.entries) f.sequencing = works[selected]!.sequencing;
  return { name: report.name, works, entries: projected ? entriesOf(projected) : [], outline: data, diagnostics: report.diagnostics, summary: report.summary };
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
  const scenarios = o.entries.flatMap((f) => f.works.flatMap((x) => x.scenarios));
  const total = scenarios.reduce((n, s) => n + s.ms, 0);
  const independent = o.entries.some(f => r.entries.find(e => e.id === f.id)?.featureId === null);
  if (independent) out.push(`${o.name} · ${o.entries.length} work(s), ${scenarios.length} slice(s), ${approx(total)} at 1×`);
  else out.push(`${o.name} · ${o.entries.length} feature(s), ${o.entries.reduce((n, f) => n + f.works.length, 0)} option(s), ${scenarios.length} scenario(s), ${approx(total)} at 1×`);
  for (const f of o.entries) {
    const entry = r.entries.find(e => e.id === f.id)!;
    const chapters = entry.sequencing === 'linear';
    if (entry.featureId === null) {
      out.push('', `## ${entry.id} · ${oneLine(entry.title)}${entry.draft ? ' (draft)' : ''}`);
      out.push(`${oneLine(entry.title)} · ${entry.slices.length} ${chapters ? 'chapters' : 'scenarios'} · about ${approx(entry.ms).replace('≈ ', '')}`);
      for (const [i, slice] of entry.slices.entries()) out.push(`    ${chapters ? `${String(i + 1).padStart(2, '0')}  ` : ''}${slice.key}  ${oneLine(slice.title)}  ${slice.steps} step${slice.steps === 1 ? '' : 's'} ${approx(slice.ms)}`);
      continue;
    }
    out.push('', `## ${f.id} · ${oneLine(f.title)}${f.pick ? `   picked: ${f.pick.slice(f.id.length + 1)}` : '   no picked option'}`);
    out.push(`Goal: ${oneLine(f.summary)}`);
    out.push(`Roles: ${f.roles.length ? f.roles.map(oneLine).join(', ') : '(none declared; who is this for?)'}`);
    const caseKeys = new Map(f.cases.map((c) => [c.id, c.key]));
    if (f.cases.length) {
      const kw = Math.max(...f.cases.map((c) => displayWidth(c.key))) + 2;
      out.push(`Cases (${f.works.map((x, i) => letter(i)).join(' ')}: ✓ shown ✗ missing ? undecided – not applicable ⊘ excluded):`);
      for (const c of f.cases) {
        const marks = f.works.map((x) => STATUS[c.coverage[x.id] ?? ''] ?? ' ').join(' ');
        out.push(`  ${pad(c.key, kw)}${pad(c.dimension, 12)}${pad(c.priority, 7)}${marks}  ${oneLine(c.title)} → ${c.expected.trim() ? oneLine(c.expected) : '(expected result not written)'}`);
      }
    } else out.push('Cases: (none; see npx joplo skill cases)');
    f.works.forEach((x, i) => {
      const work = r.works[x.id]!;
      const chapters = work.sequencing === 'linear';
      const slices = chapters ? work.slices.flatMap(slice => x.scenarios.filter(s => s.id === slice.id)) : x.scenarios;
      out.push(`${letter(i)} · ${x.key} · ${oneLine(x.title)}${x.picked ? ' (picked)' : ''}: ${x.scenarios.length} ${chapters ? 'chapters' : 'scenario(s)'} ${approx(x.ms)}${x.missing || x.undecided ? ` · missing ${x.missing} · undecided ${x.undecided}` : ''}`);
      const kw = Math.max(0, ...x.scenarios.map((s) => displayWidth(s.key))) + 2;
      const nw = Math.min(40, Math.max(0, ...x.scenarios.map((s) => displayWidth(oneLine(s.name)))) + 2);
      for (const [index, s] of slices.entries()) out.push(scenarioLine({ ...s, key: chapters ? `${String(index + 1).padStart(2, '0')}  ${s.key}` : s.key }, caseKeys, kw + (chapters ? 4 : 0), nw));
    });
  }
  const byCode = new Map<string, number>();
  for (const d of r.diagnostics) byCode.set(`${d.severity} ${d.code}`, (byCode.get(`${d.severity} ${d.code}`) ?? 0) + 1);
  out.push('', `check: ${r.summary.error} error, ${r.summary.warning} warning, ${r.summary.info} info${byCode.size ? ` (${[...byCode].map(([k, n]) => `${k} ×${n}`).join(', ')})` : ''}. Run npx joplo check for file:line.`);
  return out;
}
