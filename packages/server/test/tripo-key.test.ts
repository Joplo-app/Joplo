import { it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TripoKeyStore } from '../src/tripo-key.ts';
it('saves local key with 0600, exposes presence only and prefers env', () => {
  const home=fs.mkdtempSync(path.join(os.tmpdir(),'tripo-key-'));
  const store=new TripoKeyStore(home,{}); store.save('secret-local');
  expect(fs.statSync(store.file).mode & 0o777).toBe(0o600); expect(JSON.stringify(store.status())).not.toContain('secret-local');
  expect(new TripoKeyStore(home,{TRIPO_API_KEY:'secret-env'}).key()).toBe('secret-env');
  store.save(null); expect(store.status().saved).toBe(false);
});
