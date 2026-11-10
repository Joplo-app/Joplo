import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { auditLayout, createLayoutAuditSession, layoutAuditOptions } from '../src/layout-audit.ts';
import { launch } from '../src/render.ts';
import { compile } from '@joplo-app/core';
import { config, work, chapter } from '@joplo-app/kit';
import ui, { Text } from '@joplo-app/plugin-ui';
import { jsx } from '@joplo-app/kit/jsx-runtime';
let browser: Browser, page: Page, output: string;
beforeAll(async () => { browser = await launch({ chromium }); page = await browser.newPage({ viewport: { width: 900, height: 1000 } }); output = fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-layout-audit-')); });
afterAll(async () => { await browser?.close(); if (output) fs.rmSync(output, { recursive: true, force: true }); });
const fontFile = path.resolve(import.meta.dirname, '../../web/src/fonts/MarkerGothic/MarkerGothic-fbddfabfa4d2f998.woff2');
const fontData = fs.readFileSync(fontFile).toString('base64');
const surface = async (width = 800, height = 450, scale = 1) => {
  await page.setContent(`<style>@font-face{font-family:AuditFont;src:url(data:font/woff2;base64,${fontData})}body{margin:0}*{box-sizing:border-box}#root{position:relative;width:${width}px;height:${height}px;overflow:hidden;transform-origin:0 0;transform:scale(${scale})}.text{font:24px AuditFont,serif;line-height:1.2}</style><div id="root" data-jrender><div data-jid="clip" data-jat="works/film.tsx:12:5" style="position:absolute;left:10px;top:10px;width:110px;height:32px;overflow:hidden;border:3px solid"><span class="text" style="white-space:nowrap">Long rendered bilingual text 署名来源</span></div><div data-jid="quote" data-jat="works/film.tsx:20:5" class="text" style="position:absolute;left:20px;top:${height - 60}px;width:180px;height:50px">Important quote</div><div data-jid="badge" class="text" style="position:absolute;left:70px;top:${height - 55}px;width:130px;height:40px">Overlap</div><div data-jid="decoration" class="text" style="position:absolute;left:${width - 10}px;top:50px;white-space:nowrap">Intentional decorative stamp</div><div data-jid="masked" class="text" style="clip-path:circle(10%);position:absolute;top:180px">Masked words</div><div data-jid="hidden" style="display:none">Hidden</div></div>`);
  await page.evaluate(async () => { await document.fonts.ready; await document.fonts.load('24px AuditFont'); });
};
it.each([[800,450,1],[360,640,.5]])('uses actual line rectangles and scaled clipping/safe areas at %sx%s scale%s', async (width, height, scale) => {
  await surface(width, height, scale);
  const result = await auditLayout(page, { important: ['[data-jid="quote"]','[data-jid="badge"]','[data-jid="hidden"]'], exclude: ['[data-jid="decoration"]'], safeAreas: [{ x: 0, y: (height - 70) * scale, width: width * scale, height: 70 * scale }] });
  expect(result.fonts.status).toBe('loaded');
  expect(result.fonts.families.some(f => f.includes('AuditFont'))).toBe(true);
  expect(await page.evaluate(()=>document.fonts.check('24px AuditFont'))).toBe(true);
  expect(result.findings).toContainEqual(expect.objectContaining({ code: 'TEXT_CLIPPED', elementId: 'clip', source: 'works/film.tsx:12:5' }));
  expect(result.findings.some(f => f.code === 'IMPORTANT_IN_SAFE_AREA' && f.elementId === 'quote')).toBe(true);
  expect(result.findings.some(f => f.code === 'POSSIBLE_OCCLUSION')).toBe(true);
  expect(result.findings.every(f => f.elementId !== 'decoration')).toBe(true);
  expect(result.unknowns.some(u => u.elementId === 'masked')).toBe(true);
  expect(result.unknowns.some(u => u.elementId === 'hidden')).toBe(true);
  const line = result.textBoxes.find(t => t.elementId === 'clip')!;
  expect(line.box.width).toBeGreaterThan(110 * scale); // real font shaping, not a character-count estimate
});
it('does not diagnose intentional overlays and a corrected layout as collisions', async () => {
  await surface();
  await page.evaluate(() => { document.querySelector('[data-jid="clip"]')!.setAttribute('style','position:absolute;left:10px;top:10px;width:700px;height:60px;overflow:hidden'); document.querySelector('[data-jid="quote"]')!.setAttribute('style','position:absolute;left:20px;top:100px;width:500px;height:80px'); });
  const result = await auditLayout(page, { important: ['[data-jid="quote"]'], exclude: ['[data-jid="decoration"]','[data-jid="masked"]'], safeAreas: [{ x: 0, y: 400, width: 800, height: 50 }] });
  expect(result.findings).toEqual([]);
});
it('records real browser commit/entry/drift milestones and evidence using supplied engine sample times', async () => {
  await surface();
  await page.clock.install({ time: 0 }); await page.clock.pauseAt(1000);
  await page.evaluate(async () => {
    const root = document.querySelector('#root')!;
    root.setAttribute('data-joplo-audit-phases', JSON.stringify({ clockMs: 0, phases: [{ phase: 'drift-mid', atMs: 200 }, { phase: 'drift-end', atMs: 400 }] }));
    const animation = document.querySelector('[data-jid="quote"]')!.animate([{ transform:'translateX(0px)' },{ transform:'translateX(80px)' }],{ duration:100, fill:'forwards' }); animation.id='jenter';
    // Match bindEngineAnimations: WAAPI does not advance from Playwright's JS clock.
    // Freeze before leaving this task so slow CI/compilation/screenshots cannot finish it.
    animation.pause(); animation.currentTime=0; await animation.ready;
  });
  await new Promise(resolve => setTimeout(resolve,150)); // longer than the entrance, while its engine time remains zero
  expect(await page.evaluate(() => document.querySelector('[data-jid="quote"]')!.getAnimations().find(a=>a.id==='jenter')?.currentTime)).toBe(0);
  const project = compile({ root: '/fixture', config: { ...config({ name: 'Audit', plugins: [ui] }), file: 'joplo.config.ts' }, features: {}, routes: {}, layouts: {}, works: { film: { ...work({ title: 'Film', summary: 'Audit', stage: jsx(Text, { children: 'Stage' }), scenarios: { one: chapter('One').system('Commit') } }), file: 'works/film.tsx' } } }, 'dev').project!;
  const session = createLayoutAuditSession({ out: path.join(output,'film.png'), project, options: { everyMs:1000, important:['[data-jid="quote"]'] }, sampleMs:50 });
  for (const atMs of [0,50,100,150,200,250,300,350,400,450]) {
    if (atMs) await page.clock.runFor(50);
    await page.evaluate(time => {
      for (const animation of document.querySelector('[data-jid="quote"]')!.getAnimations()) if (animation.id==='jenter') { animation.pause(); animation.currentTime=time; }
      document.querySelector('#root')!.setAttribute('data-joplo-audit-phases',JSON.stringify({clockMs:time,phases:[{phase:'drift-mid',atMs:200},{phase:'drift-end',atMs:400}]})); },atMs);
    const jpg=(await page.screenshot({type:'jpeg'})).toString('base64');
    await session.sample(page,{atMs,scenarioId:'film.one',position:1,jpg});
  }
  const result = session.finish(), report=JSON.parse(fs.readFileSync(result.path,'utf8'));
  expect(report.samples.flatMap((s: {phases:string[]})=>s.phases)).toEqual(expect.arrayContaining(['post-commit','enter-end','drift-mid','drift-end']));
  expect(report.samples.every((s: {stepId:string;atMs:number;evidence:string})=>s.stepId==='film.one#1' && Number.isFinite(s.atMs) && fs.existsSync(s.evidence))).toBe(true);
  expect(report.samples.filter((s: {phases:string[]})=>s.phases.includes('enter-end')).map((s: {atMs:number})=>s.atMs)).toEqual([100]);
  expect(report.sampleToleranceMs).toBe(50);
});
it('rejects malformed options and ambiguous/outside content selectors explicitly', async () => {
  expect(()=>layoutAuditOptions({everyMs:NaN})).toThrow(); expect(()=>layoutAuditOptions({safeAreas:[{x:0,y:0,width:-1,height:20}]})).toThrow();
  await surface(); await expect(auditLayout(page,{content:'[data-jid]'})).rejects.toThrow('exactly one');
});
