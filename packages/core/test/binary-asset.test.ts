import { it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { asset } from '@joplo-app/kit';
it('embeds binary GLB and audio without machine paths', () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'binary-asset-'));
  const b=Buffer.alloc(24); b.write('glTF'); b.writeUInt32LE(2,4); b.writeUInt32LE(24,8); b.writeUInt32LE(4,12); b.writeUInt32LE(0x4e4f534a,16); b.write('{}  ',20);
  fs.writeFileSync(path.join(dir,'a.glb'),b); fs.writeFileSync(path.join(dir,'a.mp3'),Buffer.from([1,2,3]));
  expect(asset('./a.glb',path.join(dir,'index.ts'))).toBe(`data:model/gltf-binary;base64,${b.toString('base64')}`);
  expect(asset('./a.mp3',path.join(dir,'index.ts'))).toBe('data:audio/mpeg;base64,AQID');
});
