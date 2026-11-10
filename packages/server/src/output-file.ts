import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
/** Publish only complete files; exclusive link avoids an overwrite race between CLI processes. */
export async function commitOutput(temporary: string, destination: string, overwrite = false) {
  if (overwrite) await fs.rename(temporary,destination);
  else { await fs.link(temporary,destination); await fs.unlink(temporary); }
}
export async function writeOutput(destination: string, bytes: Uint8Array | string, overwrite = false) {
  await fs.mkdir(path.dirname(destination),{recursive:true});
  const temporary=path.join(path.dirname(destination),`.${path.basename(destination)}.${randomUUID()}.tmp`);
  try { await fs.writeFile(temporary,bytes,{flag:'wx'}); await commitOutput(temporary,destination,overwrite); }
  finally { await fs.rm(temporary,{force:true}); }
}
