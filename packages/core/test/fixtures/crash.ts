import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
const rename = fs.rename;
fs.rename = async (from, to) => {
  const project = String(to).endsWith('/project.joplo.json');
  if (project && process.argv[4] === 'before')
    process.kill(process.pid, 'SIGKILL');
  await rename(from, to);
  if (project && process.argv[4] === 'after')
    process.kill(process.pid, 'SIGKILL');
};
syncBuiltinESMExports();
const { applyPatch } = await import('../../src/store.ts');
await applyPatch(process.argv[2]!, JSON.parse(process.argv[3]!));
