import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getHeapCodeStatistics, writeHeapSnapshot } from 'node:v8';
import { expect, it } from 'vitest';
import { localReviewStatus } from '@joplo-app/core';
import { listLocalReviews } from '@joplo-app/core/node';
import { createDev } from '../src/dev.ts';

it('measures repeated failed project compilation alongside a healthy project', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-board-stability-'));
  const first = path.join(root, 'healthy'), second = path.join(root, 'failing');
  fs.cpSync(path.resolve('examples/invite'), first, { recursive: true });
  fs.cpSync(path.resolve('examples/invite'), second, { recursive: true });
  const lengths: number[] = [];
  const iterations = Number(process.env.JOPLO_STABILITY_ITERATIONS ?? 120);
  const gcPasses = Number(process.env.JOPLO_STABILITY_GC_PASSES ?? 2);
  expect(Number.isInteger(gcPasses) && gcPasses >= 1 && gcPasses <= 5).toBe(true);
  expect(Number.isInteger(iterations) && iterations >= 4 && iterations % 4 === 0).toBe(true);
  const setSourceMaps = process.setSourceMapsEnabled;
  const nativeMaps = process.sourceMapsEnabled;
  if (process.env.JOPLO_STABILITY_NATIVE_MAPS === 'off') {
    process.setSourceMapsEnabled = () => setSourceMaps(false);
    setSourceMaps(false);
  }
  const h = await createDev({ projectDir: first, port: 0, log: s => lengths.push(s.length) });
  try {
    const slot = h.hub.addProject(fs.realpathSync(second)).slot!;
    await slot.ready;
    await new Promise(r => setTimeout(r, 300));
    const source = path.join(second, 'features/invite/works/a-modal.tsx');
    const original = fs.readFileSync(source, 'utf8');
    const memory: number[] = [];
    const modules: number[] = [];
    const codeStats: ReturnType<typeof getHeapCodeStatistics>[] = [];
    for (let i = 0; i < iterations; i++) {
      const before = slot.payload.version;
      const mode = Math.floor(i / (iterations / 4));
      fs.writeFileSync(path.join(second, 'failure.ts'), `const x: any = undefined; x.missing; // ${i}`);
      const code = mode === 0 ? `throw new Error('repeated failure ${i}');\n${original}`
        : mode === 1 ? `import { asset } from '@joplo-app/kit'; asset('./missing-${i}.png');\n${original}`
        : mode === 2 ? `import '../../../failure.ts';\n${original}`
        : original.replace('<Button id=', `<Button style={{ width: NaN }} id=`) + `\n// ${i}`;
      fs.writeFileSync(source, code);
      const deadline = Date.now() + 15000;
      while (slot.payload.version === before || slot.compiling) {
        if (Date.now() > deadline) throw new Error(`compile timeout at iteration ${i}; version=${slot.payload.version}; compiling=${slot.compiling}`);
        await new Promise(r => setTimeout(r, 20));
      }
      expect(slot.payload.ok).toBe(false);
      const response = await fetch(`${h.url}__joplo/p/${h.projectId}/ir`);
      expect(response.status).toBe(200);
      expect((await response.json() as { ok: boolean }).ok).toBe(true);
      expect(h.payload().ok).toBe(true);
      if (mode === 3) expect(slot.payload.diagnostics.length).toBeGreaterThan(0);
      if (global.gc) {
        for (let pass = 0; pass < gcPasses; pass++) {
          if (pass) await new Promise<void>(r => setImmediate(r));
          global.gc();
        }
      }
      if (process.env.JOPLO_STABILITY_SNAPSHOT_DIR && (i === 0 || i === iterations - 1)) {
        fs.mkdirSync(process.env.JOPLO_STABILITY_SNAPSHOT_DIR, { recursive: true });
        writeHeapSnapshot(path.join(process.env.JOPLO_STABILITY_SNAPSHOT_DIR, `iteration-${i}.heapsnapshot`));
      }
      memory.push(process.memoryUsage().heapUsed);
      modules.push(slot.loader!.environments.ssr.moduleGraph.idToModuleMap.size);
      if (i % (iterations / 4) === 0 || i === iterations - 1) codeStats.push(getHeapCodeStatistics());
    }
    console.log('BOARD_STABILITY ' + JSON.stringify({ iterations: memory.length, heapBytes: memory, heapMiB: memory.map(n => Math.round(n / 1048576)), nativeMaps: process.sourceMapsEnabled, maxLogBytes: Math.max(...lengths), modules, forcedGc: !!global.gc, gcPasses, codeStats }));
    expect(Math.max(...lengths)).toBeLessThan(100000);
    expect(Math.max(...modules) - Math.min(...modules)).toBeLessThan(10);
    if (global.gc && process.env.JOPLO_STABILITY_HEAP_GROWTH_MB)
      expect(memory.at(-1)! - memory[Math.floor(iterations / 4)]!).toBeLessThan(Number(process.env.JOPLO_STABILITY_HEAP_GROWTH_MB) * 1048576);
  } finally { await h.close(); global.gc?.(); console.log('BOARD_AFTER_CLOSE ' + JSON.stringify({ heapBytes: process.memoryUsage().heapUsed, code: getHeapCodeStatistics() })); process.setSourceMapsEnabled = setSourceMaps; setSourceMaps(nativeMaps); fs.rmSync(root, { recursive: true, force: true }); }
}, 300000);


it('keeps unvisited review registration open while idle', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-board-idle-'));
  fs.cpSync(path.resolve('examples/invite'), root, { recursive: true });
  const h = await createDev({ projectDir: root, port: 0, log: () => {} });
  try {
    const before = listLocalReviews(root).filter(s => localReviewStatus(s) === 'open').map(s => s.id).sort();
    expect(before.length).toBeGreaterThan(0);
    const idleMs = Number(process.env.JOPLO_STABILITY_IDLE_MS ?? 500);
    await new Promise(r => setTimeout(r, idleMs));
    expect(listLocalReviews(root).filter(s => localReviewStatus(s) === 'open').map(s => s.id).sort()).toEqual(before);
    console.log(`BOARD_IDLE ${idleMs}ms: ${before.length} unvisited rounds remain open`);
  } finally { await h.close(); fs.rmSync(root, { recursive: true, force: true }); }
}, 240000);
