import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDev, type InternalDevHandle } from '../src/dev.ts';
import { fixtureConfigSource, installFixturePlugins } from '../../../scripts/test/fixtures.ts';

/** Only synthetic credentials and a temporary home; no provider requests. */
describe('credential request boundaries', () => {
  let root: string, home: string, dev: InternalDevHandle;
  const logs: string[] = [];
  const secret = 'REVIEW_SYNTHETIC_CREDENTIAL';
  beforeAll(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-credential-input-'));
    home = path.join(root, 'home');
    installFixturePlugins(root);
    fs.writeFileSync(path.join(root, 'runtime.ts'), `export default {id:'alpha',apiVersion:2,components:{}};`);
    fs.writeFileSync(path.join(root, 'joplo.config.ts'), fixtureConfigSource(`import {config} from '@joplo-app/kit';import {definePlugin} from ${JSON.stringify(path.resolve('packages/kit/src/plugin.ts'))};
      const alpha=definePlugin({id:'alpha',title:'Alpha',components:{},runtime:new URL('./runtime.ts',import.meta.url),keys:[{id:'api',title:'API',description:'Synthetic test key',url:'https://example.com/keys',env:'REVIEW_TEST_KEY'}]});
      export default config({name:'Credential boundary test',home:'/',plugins:[alpha]});`));
    fs.mkdirSync(path.join(root, 'routes'));
    fs.writeFileSync(path.join(root, 'routes/page.tsx'), `import {page} from '@joplo-app/kit';export default page({title:'Home'},<p>Public</p>);`);
    vi.spyOn(console, 'error').mockImplementation((...args) => logs.push(args.map(String).join(' ')));
    vi.spyOn(console, 'warn').mockImplementation((...args) => logs.push(args.map(String).join(' ')));
    dev = await createDev({projectDir:root,port:0,home,watch:false,log:message=>logs.push(message)});
  }, 30000);
  afterAll(async () => {
    await dev?.close();
    vi.restoreAllMocks();
    fs.rmSync(root, {recursive:true,force:true});
  });
  const request = (endpoint:string, method:string, body:string) => fetch(`${dev.url}__joplo/${endpoint.replace('$project',dev.projectId)}`, {
    method, headers:{'x-joplo-token':dev.token,'content-type':'application/json'}, body,
  });

  it.each([
    ['p/$project/plugin-keys/alpha/api', 'PUT'],
    ['voice/profiles/openai', 'PUT'],
    ['voice/test', 'POST'],
    // A non-credential caller uses the same fixed JSON error contract.
    ['p/$project/selection', 'PUT'],
  ])('never echoes malformed JSON in %s responses or logs', async (endpoint, method) => {
    for (const body of [`{"key":${secret}}`, `{"key":"${secret}",}`]) {
      const response = await request(endpoint, method, body);
      expect(response.status).toBe(400);
      const text = await response.text();
      expect(text).not.toContain(secret.slice(0, 6));
      expect(JSON.parse(text).error.message).not.toContain('{"key"');
      expect(JSON.parse(text)).toEqual({error:{code:'USAGE',message:'Request body is not valid JSON'}});
      expect(logs.join('\n')).not.toContain(secret.slice(0, 6));
      expect(logs.join('\n')).not.toContain(body);
    }
    expect(fs.existsSync(path.join(home, 'plugins'))).toBe(false);
    expect(fs.existsSync(path.join(home, 'voice/profiles.json'))).toBe(false);
  });

  it.each(['constructor', '__proto__', 'toString', 'valueOf', 'hasOwnProperty', 'unknown'])('returns 404 for undeclared identity %s without writing credentials', async identity => {
    for (const suffix of [`${identity}/api`, `alpha/${identity}`]) {
      const response = await request(`p/$project/plugin-keys/${suffix}`, 'PUT', JSON.stringify({key:secret}));
      expect(response.status).toBe(404);
      const body = await response.text();
      expect(JSON.parse(body).error.code).toBe('NOT_FOUND');
      expect(body).not.toContain(secret);
      expect(logs.join('\n')).not.toContain(secret);
      expect(fs.existsSync(path.join(home, 'plugins'))).toBe(false);
    }
  });
});
