/** Browser geometry diagnostics. No Core layout rules, resource generation or automatic edits. */
import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright-core';
import { JoploError, type Project } from '@joplo-app/core';
import type { ExportCrop } from './contract.ts';
export type LayoutAuditOptions = { content?: ExportCrop; safeAreas?: ExportCrop[]; important?: string[]; exclude?: string[]; /** Interval between diagnostic probes in engine milliseconds, 20–1000 (default 250). */ everyMs?: number };
export type LayoutBox = { x: number; y: number; width: number; height: number };
export type LayoutFinding = { code: 'TEXT_OUTSIDE_CONTENT' | 'TEXT_CLIPPED' | 'IMPORTANT_IN_SAFE_AREA' | 'IMPORTANT_OUTSIDE_CONTENT' | 'POSSIBLE_OCCLUSION'; severity: 'warning'; elementId: string | null; source: string | null; tag: string; box: LayoutBox; relatedBox?: LayoutBox; detail: string };
type Identity = { elementId: string | null; source: string | null; tag?: string };
type Geometry = { coordinates: 'page-css-pixels'; root: LayoutBox; content: LayoutBox; safeAreas: LayoutBox[]; elements: (Identity & { box: LayoutBox })[]; textBoxes: (Identity & { box: LayoutBox; text: string })[]; findings: LayoutFinding[]; unknowns: (Identity & { reason: string })[]; phases: { phase: string; afterMs: number }[]; fonts: { status: string; families: string[] }; truncated: boolean };
export type LayoutAuditSample = Omit<Geometry, 'phases'> & { phaseHints?: Geometry['phases']; atMs: number | null; timeBasis: 'engine-clock' | 'static-final-state'; phases: string[]; scenarioId: string; position: number; stepId: string | null; workId: string | null; evidence: string | null };
export type LayoutAuditResult = { path: string; findings: number; samples: number };
const browserSource = fs.readFileSync(path.join(import.meta.dirname, 'layout-audit.js'), 'utf8').replace(/^\/\*[\s\S]*?\*\/\s*/, '');
function area(value: unknown): value is ExportCrop {
  if (typeof value === 'string') return value.trim().length > 0;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return Object.keys(v).every(k => ['x', 'y', 'width', 'height'].includes(k)) && ['x', 'y', 'width', 'height'].every(k => typeof v[k] === 'number' && Number.isFinite(v[k])) && (v.width as number) > 0 && (v.height as number) > 0;
}
export function layoutAuditOptions(value: boolean | LayoutAuditOptions): LayoutAuditOptions {
  const options = value === true ? {} : value;
  if (!options || typeof options !== 'object' || Array.isArray(options) || Object.keys(options).some(k => !['content', 'safeAreas', 'important', 'exclude', 'everyMs'].includes(k))) throw new JoploError('USAGE', 'Invalid layout audit options');
  if (options.content !== undefined && !area(options.content) || options.safeAreas !== undefined && (!Array.isArray(options.safeAreas) || !options.safeAreas.every(area))) throw new JoploError('USAGE', 'Layout content/safe areas must be CSS selectors or finite positive CSS rectangles');
  if (options.everyMs !== undefined && (!Number.isFinite(options.everyMs) || options.everyMs < 20 || options.everyMs > 1000)) throw new JoploError('USAGE', 'Layout audit everyMs must be 20–1000 engine milliseconds');
  for (const key of ['important', 'exclude'] as const) if (options[key] !== undefined && (!Array.isArray(options[key]) || !options[key]!.every(selector => typeof selector === 'string' && selector.trim()))) throw new JoploError('USAGE', `Layout audit ${key} must contain CSS selectors`);
  return options;
}
export async function auditLayout(page: Page, options: LayoutAuditOptions, crop?: ExportCrop): Promise<Geometry> {
  layoutAuditOptions(options);
  await page.evaluate(() => document.fonts.ready);
  try { return await page.evaluate(`(${browserSource})(${JSON.stringify({ ...options, crop })})`) as Geometry; }
  catch (error) { throw new JoploError('RENDER_FAILED', `Layout geometry audit failed: ${error instanceof Error ? error.message : String(error)}`); }
}
export function writeLayoutReport(file: string, samples: LayoutAuditSample[], overwrite = false, sampleToleranceMs: number | null = null): LayoutAuditResult {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const report = { schemaVersion: 1, kind: 'layout-audit', sampling: 'actual-rendered-css-geometry', sampleToleranceMs, findings: samples.reduce((n, s) => n + s.findings.length, 0), samples, limitations: [
    'Bounds are page CSS pixels after actual fonts and transforms. Evidence may be cropped/scaled; root/content bounds provide the coordinate origin. Static samples have no engine timestamp and do not verify motion.',
    'Importance is explicitly selected, never inferred from semantic meaning. Excluded decorations and intentional overlaps are not diagnosed. Geometry overlap is only a warning and does not prove paint occlusion.',
    'No contrast, screen-reader, reading-order or copyright assessment. Rotation, masks and nonrectangular clipping remain unknown. Transparent/hidden important elements are reported as unknown rather than guessed visible.',
    'Playback samples use the existing export engine clock. Commit and declared plugin/entry phase deadlines are observed on the export sample grid within sampleToleranceMs; phases interrupted by a later step or absent from plugin hints are not guaranteed. Unobserved intervals can contain additional problems.',
  ] };
  fs.writeFileSync(file, JSON.stringify(report, null, 2), overwrite ? undefined : { flag: 'wx' });
  return { path: file, findings: report.findings, samples: samples.length };
}
export function layoutReportPath(out: string) { return out.replace(/\.[^.]+$/, '') + '.layout.json'; }
export function createLayoutAuditSession(config: { out: string; project: Project; crop?: ExportCrop; options: boolean | LayoutAuditOptions; overwrite?: boolean; sampleMs: number }) {
  const options = layoutAuditOptions(config.options), reportPath = layoutReportPath(config.out), samples: LayoutAuditSample[] = [];
  if (config.sampleMs > 50) throw new JoploError('USAGE', 'Motion layout audit requires sampleMs <= 50 to observe commit and animation phases');
  if (fs.existsSync(reportPath) && !config.overwrite) throw new JoploError('USAGE', `Layout report already exists: ${reportPath}`);
  let nextInterval = 0, previous = '', pending: { atMs: number; phase: string; identity: string }[] = [];
  return {
    async sample(page: Page, frame: { atMs: number; scenarioId: string; position: number; jpg: string }) {
      const identity = `${frame.scenarioId}#${frame.position}`, changed = identity !== previous;
      if (changed) pending = [];
      const due = pending.filter(p => p.identity === identity && p.atMs <= frame.atMs + .01);
      pending = pending.filter(p => !due.includes(p));
      if (!changed && !due.length && frame.atMs < nextInterval) return;
      const measured = await auditLayout(page, options, config.crop);
      const phaseNames = [...new Set([...(changed ? [frame.position ? 'post-commit' : 'initial'] : []), ...due.map(p => p.phase), ...(!changed && !due.length ? ['interval'] : [])])];
      for (const hint of measured.phases) {
        const atMs = frame.atMs + hint.afterMs;
        if (hint.afterMs > .01 && !pending.some(p => p.identity === identity && p.phase === hint.phase && Math.abs(p.atMs - atMs) <= config.sampleMs)) pending.push({ atMs, phase: hint.phase, identity });
      }
      let evidence: string | null = null;
      if (measured.findings.length || measured.unknowns.length) {
        const directory = config.out.replace(/\.[^.]+$/, '') + '.layout-evidence';
        fs.mkdirSync(directory, { recursive: true }); evidence = path.join(directory, `${String(Math.round(frame.atMs)).padStart(8, '0')}.jpg`);
        fs.writeFileSync(evidence, Buffer.from(frame.jpg, 'base64'), config.overwrite ? undefined : { flag: 'wx' });
      }
      const scenario = config.project.scenarios[frame.scenarioId];
      samples.push({ ...measured, phaseHints: measured.phases, phases: phaseNames, atMs: frame.atMs, timeBasis: 'engine-clock', scenarioId: frame.scenarioId, position: frame.position, stepId: scenario?.steps[frame.position - 1]?.id ?? null, workId: scenario?.workId ?? null, evidence });
      previous = identity; nextInterval = frame.atMs + (options.everyMs ?? 250);
    },
    finish() { return writeLayoutReport(reportPath, samples, config.overwrite, config.sampleMs); },
  };
}
