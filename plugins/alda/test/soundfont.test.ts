import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { soundfont, SOUNDFONT } from '../src/soundfont.ts';
afterEach(()=>vi.unstubAllGlobals());
it('rejects unverified downloads, writes no bank, and gives offline recovery instructions',async()=>{
 const home=await fs.mkdtemp(path.join(os.tmpdir(),'music-bank-test-'));
 try {
  const fetch=vi.fn().mockResolvedValue(new Response('not the pinned license'));
  vi.stubGlobal('fetch',fetch);
  await expect(soundfont(home)).rejects.toThrow(/SHA-256 mismatch.*installSoundfont/s);
  expect(await fs.readdir(path.join(home,'soundfonts',SOUNDFONT.sha256))).toEqual([]);
  fetch.mockRejectedValue(new Error('offline'));
  await expect(soundfont(home)).rejects.toThrow(/offline.*JOPLO_HOME/s);
  expect(fetch.mock.calls.every(c=>c[0]===SOUNDFONT.licenseUrl)).toBe(true);
 }finally{await fs.rm(home,{recursive:true,force:true});}
});
