import { it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { modelPath, generate } from '../src/local.ts';
import { apples } from '../../../examples/apple-journey/models.ts';
import { apple } from '../../../examples/smart-home-3d/shared/models.ts';

it('keeps all seven committed model identities after package and resource-plugin migration without network', async () => {
  const cases = [
    ['smart-home-3d', apple, '0d4da58fc5589ccecf3b4a0f3f01b230de809b730073dc118a0f6f904d4febec'],
    ['apple-journey', apples.wild, 'e3a30ecc94467a33d2960d2c641f6dd746b8846bbcbadda190e7adebdc6b7ae2'],
    ['apple-journey', apples.eden, '22636ecded192c03c00c5bdb46680e3dd8adc24dfe17b0b867322b20bcc7e7c9'],
    ['apple-journey', apples.newton, '4272d933180bfb17a0edcd77ce5905b64724c6fadf5b99d31b3601a7db47ab95'],
    ['apple-journey', apples.snow, '65aebd329ec312dcc9ccbe2727d2411c873c1474fc98a9a89743439404f34f02'],
    ['apple-journey', apples.modern, '90907827c37c70f9006b0f69cd8234d4d3cf7ef1dff4740642eadecc757ed6ba'],
    ['apple-journey', apples.future, '50910a611c6b8b14ea05f49d1bf0ba8c726127cd5fb0f4784198912cd213eff5'],
  ] as const;
  const fetch=vi.fn(()=>{throw new Error('NETWORK FORBIDDEN');});
  for(const [example, resource, hash] of cases) {
    expect(resource.plugin).toBe('scene3d');
    const root=path.resolve('examples',example), request=JSON.parse(resource.input), file=modelPath(root,request);
    expect(path.basename(file)).toBe(`${hash}.glb`);
    expect(fs.existsSync(file.replace('.glb','.json'))).toBe(true);
    expect(await generate(request,{projectDir:root,fetch})).toEqual(fs.readFileSync(file));
  }
  expect(fetch).not.toHaveBeenCalled();
});
