import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
const dir = process.argv[2]!;
const mode = process.argv[3]!;
if (mode === 'steal' || mode === 'compromise') {
  const rename = fs.rename;
  let calls = 0;
  fs.rename = async (from, to) => {
    if (calls++ === 1) {
      process.stdout.write('READY\n');
      if (mode === 'steal')
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 12500);
      else {
        await fs.utimes(dir + '/.joplo/lock', new Date(0), new Date(0));
        await new Promise((r) => setTimeout(r, 2300));
      }
    }
    return rename(from, to);
  };
  syncBuiltinESMExports();
}
const { applyPatch } = await import('../../src/store.ts');
if (mode === 'active') {
  const { withProjectLock } = await import('../../src/lock.ts');
  await withProjectLock(dir, async () => {
    process.stdout.write('READY\n');
    await new Promise((r) => setTimeout(r, 11500));
  });
  process.stdout.write(JSON.stringify({ ok: true }) + '\n');
} else
  try {
    const r = await applyPatch(dir, {
      expectRevision: 1,
      idempotencyKey: mode,
      summary: mode,
      operations: [
        {
          op: 'updateNode',
          sceneId: 'scene_a_members',
          nodeId: 'btn_invite',
          patch: { note: mode },
        },
      ],
    });
    process.stdout.write(JSON.stringify(r) + '\n');
  } catch (e: any) {
    process.stdout.write(
      JSON.stringify({
        ok: false,
        error: { code: e.code, details: e.details },
      }) + '\n',
    );
  }
