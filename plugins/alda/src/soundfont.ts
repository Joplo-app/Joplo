import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
const BASE = 'https://raw.githubusercontent.com/LibreScore/sf3/3a6eda823dac2ec3e134d38544ca839217358f08';
export const SOUNDFONT = {
  name: 'FluidR3Mono GM 2.312',
  url: `${BASE}/FluidR3Mono_GM.sf3.wasm`,
  sha256: 'cfcd66d89e8386823400eca64934b14fbea7bf48ba1f00d21189af1262794ec2',
  licenseUrl: `${BASE}/FluidR3Mono_License.md`,
  licenseSha256: 'c21ed6be2fea862673953977c616befc28d1b20dfa60349e4461b97c759db6ca',
};
export const credit = `${SOUNDFONT.name} (MIT). Original SoundFont © 2000–2002, 2008 Frank Wen; mono version © 2014–2016 Michael Cowgill; Temple Blocks © 2002 Ethan Winer; Drumline Percussion © 2016 Michael Schorsch. Source and license: ${SOUNDFONT.licenseUrl}`;
export const sha256 = (data: Uint8Array | string) => createHash('sha256').update(data).digest('hex');
export async function soundfont(home = process.env.JOPLO_HOME || path.join(os.homedir(), '.joplo')) {
  const directory = path.join(home, 'soundfonts', SOUNDFONT.sha256);
  await fs.mkdir(directory, { recursive: true });
  const load = async (name: string, url: string, hash: string, maxBytes: number) => {
    const file = path.join(directory, name);
    try { const data = await fs.readFile(file); if (sha256(data) === hash) return data; } catch { /* first use */ }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
      if (!response.ok || Number(response.headers.get('content-length')) > maxBytes) throw new Error(`HTTP ${response.status}`);
      const chunks: Uint8Array[] = []; let length = 0;
      for await (const chunk of response.body!) { length += chunk.length; if (length > maxBytes) throw new Error('Download exceeds size limit'); chunks.push(chunk); }
      const data = Buffer.concat(chunks);
      if (sha256(data) !== hash) throw new Error('SHA-256 mismatch');
      const tmp = `${file}.${randomUUID()}.tmp`;
      await fs.writeFile(tmp, data); await fs.rename(tmp, file);
      return data;
    } catch (e) { throw new Error(`SoundFont cache missing or invalid; download failed (${(e as Error).message}). Connect to the internet and run: node --input-type=module -e "import('@joplo-app/plugin-alda/local').then(m=>m.installSoundfont())". For offline use, copy the verified soundfonts/${SOUNDFONT.sha256}/ directory into JOPLO_HOME on this machine.`); }
  };
  // Keep the exact license beside the bank; no bank is usable without its verified license.
  await load('LICENSE.md', SOUNDFONT.licenseUrl, SOUNDFONT.licenseSha256, 64 * 1024);
  return load('FluidR3Mono_GM.sf3', SOUNDFONT.url, SOUNDFONT.sha256, 16 * 1024 * 1024);
}
