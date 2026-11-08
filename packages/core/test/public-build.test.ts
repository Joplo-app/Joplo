import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { expect, it } from 'vitest';
it('checks the publishing rootDir/declaration contracts, not only the workspace tsconfig', () => {
  const root = path.resolve(import.meta.dirname, '../../..');
  const tsc = createRequire(path.join(root, 'package.json')).resolve('typescript/bin/tsc');
  for (const pkg of ['kit', 'core', 'server', 'plugin-diagram']) {
    expect(() => execFileSync(process.execPath, [tsc, '-p', `${pkg === 'plugin-diagram' ? 'plugins/diagram' : `packages/${pkg}`}/tsconfig.build.json`, '--noEmit'], { cwd: root, stdio: 'pipe' })).not.toThrow();
  }
}, 30000);
