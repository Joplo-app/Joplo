import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import type { PluginLocal } from '@joplo-app/kit/plugin';
export default { compilers: { midi: {
  version: 'alda-2.4.8-midi-1', mime: 'audio/midi',
  async compile(input, ctx) {
    const source = path.join(ctx.directory, 'score.alda'), output = path.join(ctx.directory, 'score.mid');
    await fs.writeFile(source, input);
    await new Promise<void>((resolve, reject) => {
      execFile('alda', ['export', '-f', source, '-o', output], { cwd: ctx.directory, timeout: 25000, maxBuffer: 128 * 1024 }, (error, stdout, stderr) => {
        if (error?.killed || error?.code === 'ETIMEDOUT') { reject(Object.assign(new Error('Alda export timed out after 25 seconds; shorten the score and retry.'), { code: 'LOCAL_RESOURCE_TIMEOUT' })); return; }
        if (error) reject(new Error(error.code === 'ENOENT' ? 'Alda is not installed or not on PATH. Install Alda 2.4.8, then retry playback/build.' : `Alda export failed: ${(stderr || stdout || error.message).replaceAll(ctx.directory, '<temporary>').slice(0, 1500)}`)); else resolve();
      });
    });
    const stat = await fs.stat(output);
    if (stat.size > ctx.maxBytes) throw Object.assign(new Error('MIDI exceeds resource size limit'), { code: 'LOCAL_RESOURCE_TOO_LARGE' });
    return new Uint8Array(await fs.readFile(output));
  },
} } } satisfies PluginLocal;
