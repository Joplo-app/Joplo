import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generate, modelPath, estimate } from '../src/local.ts';
import { normalize } from '../src/request.ts';
const dir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tripo-test-'));
const glb = () => { const json = Buffer.from(JSON.stringify({asset:{version:'2.0'},scenes:[{nodes:[]}],scene:0}).padEnd(80, ' ')); const b=Buffer.alloc(20+json.length); b.write('glTF'); b.writeUInt32LE(2,4); b.writeUInt32LE(b.length,8); b.writeUInt32LE(json.length,12); b.writeUInt32LE(0x4e4f534a,16); json.copy(b,20); return b; };
const response = (data: unknown) => new Response(JSON.stringify({code:0,data}));
const request = normalize({prompt:'A red apple', smart_low_poly:true});
describe('Tripo local compiler', () => {
  it('validates descriptions and estimates before spending', () => {
    expect(() => normalize({prompt:' '})).toThrow(/description/i);
    expect(estimate(request)).toBe(30);
  });
  it('never networks for committed models, even without a key or permission', async () => {
    const root=dir(), file=modelPath(root, request); fs.mkdirSync(path.dirname(file),{recursive:true}); fs.writeFileSync(file,glb());
    const fetch=vi.fn(() => {throw new Error('network forbidden');});
    expect(await generate(request,{projectDir:root,fetch})).toEqual(glb()); expect(fetch).not.toHaveBeenCalled();
  });
  it('requires explicit spending permission before any network', async () => {
    const fetch=vi.fn(); await expect(generate(request,{projectDir:dir(),fetch,key:'secret'})).rejects.toMatchObject({code:'LOCAL_RESOURCE_SPEND_REQUIRED'}); expect(fetch).not.toHaveBeenCalled();
  });
  it('persists task, downloads without Authorization and stores no key or signed URL', async () => {
    const root=dir(); const fetch=vi.fn().mockResolvedValueOnce(response({task_id:'task-1'})).mockResolvedValueOnce(response({status:'success',output:{model_url:'https://cdn.example/model?signature=private'},credits_consumed:30})).mockResolvedValueOnce(new Response(glb()));
    await generate(request,{projectDir:root,fetch,key:'secret-key',allowSpend:true});
    expect(fetch.mock.calls[2][1]?.headers).toBeUndefined();
    const metadata=fs.readFileSync(modelPath(root,request).replace('.glb','.json'),'utf8'); expect(metadata).toContain('task-1'); expect(metadata).not.toMatch(/secret-key|signature/);
  });
  it('does not blindly recreate after a lost POST response', async () => {
    const root=dir(), fetch=vi.fn().mockRejectedValue(new Error('secret-key network failure'));
    await expect(generate(request,{projectDir:root,fetch,key:'secret-key',allowSpend:true})).rejects.toThrow(/unknown/i);
    await expect(generate(request,{projectDir:root,fetch,key:'secret-key',allowSpend:true})).rejects.toThrow(/unknown/i); expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('resumes recorded task after polling disconnect without another POST', async () => {
    const root=dir(), fetch=vi.fn().mockResolvedValueOnce(response({task_id:'task-2'})).mockRejectedValueOnce(new Error('offline'));
    await expect(generate(request,{projectDir:root,fetch,key:'secret',allowSpend:true})).rejects.toThrow();
    const resumed=vi.fn().mockResolvedValueOnce(response({status:'success',output:{model_url:'https://cdn.example/m.glb'},credits_consumed:30})).mockResolvedValueOnce(new Response(glb()));
    await generate(request,{projectDir:root,fetch:resumed,key:'secret',allowSpend:true}); expect(resumed.mock.calls[0][0]).toContain('/tasks/task-2');
  });
  it.each([[1002,'AUTH'],[2010,'BALANCE'],[2008,'MODERATION']])('maps %s without echoing provider secrets', async(code,label) => {
    const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({code,message:'secret-key'}),{status:400}));
    await expect(generate(request,{projectDir:dir(),fetch,key:'secret-key',allowSpend:true})).rejects.toMatchObject({code:`LOCAL_RESOURCE_TRIPO_${label}`});
  });
  it('rejects corrupt GLB instead of committing it', async () => {
    const root=dir(), fetch=vi.fn().mockResolvedValueOnce(response({task_id:'t'})).mockResolvedValueOnce(response({status:'success',output:{model_url:'https://cdn.example/a.glb'}})).mockResolvedValueOnce(new Response('bad'));
    await expect(generate(request,{projectDir:root,fetch,key:'secret',allowSpend:true})).rejects.toMatchObject({code:'LOCAL_RESOURCE_GLB_INVALID'}); expect(fs.existsSync(modelPath(root,request))).toBe(false);
  });
});
it('uploads a reference image through /v3/files and uses file_token', async () => {
  const r=normalize({prompt:'Own apple drawing',image:'data:image/png;base64,AQID'});
  const fetch=vi.fn().mockResolvedValueOnce(response({file_token:'file-ref'})).mockResolvedValueOnce(response({task_id:'image-1'})).mockResolvedValueOnce(response({status:'success',output:{model_url:'https://cdn.example/model.glb'}})).mockResolvedValueOnce(new Response(glb()));
  await generate(r,{projectDir:dir(),fetch,key:'secret',allowSpend:true});
  expect(fetch.mock.calls[0][0]).toContain('/v3/files'); expect(fetch.mock.calls[0][1].body).toBeInstanceOf(FormData);
  expect(fetch.mock.calls[1][0]).toContain('/image-to-model'); expect(JSON.parse(fetch.mock.calls[1][1].body).input).toBe('file-ref');
});
it('backs off explicit 429 before retrying creation', async () => {
  const fetch=vi.fn().mockResolvedValueOnce(new Response('',{status:429,headers:{'Retry-After':'2'}})).mockResolvedValueOnce(response({task_id:'t'})).mockResolvedValueOnce(response({status:'success',output:{model_url:'https://cdn.example/a.glb'}})).mockResolvedValueOnce(new Response(glb()));
  const sleep=vi.fn().mockResolvedValue(undefined); await generate(request,{projectDir:dir(),fetch,key:'key',allowSpend:true,sleep}); expect(sleep).toHaveBeenCalledWith(2000);
});
it('keeps failed task receipt and refund semantics without recreating', async () => {
  const root=dir(), fetch=vi.fn().mockResolvedValueOnce(response({task_id:'failed'})).mockResolvedValueOnce(response({status:'failed'}));
  await expect(generate(request,{projectDir:root,fetch,key:'key',allowSpend:true})).rejects.toThrow(/refunded/);
  await expect(generate(request,{projectDir:root,fetch,key:'key',allowSpend:true})).rejects.toThrow(/refund/); expect(fetch).toHaveBeenCalledTimes(2);
});
it('times out while retaining task id, and missing key sends no requests', async () => {
  const fetch=vi.fn().mockResolvedValueOnce(response({task_id:'slow'})).mockResolvedValue(response({status:'running'}));
  await expect(generate(request,{projectDir:dir(),fetch,key:'key',allowSpend:true,timeoutMs:5,sleep:()=>new Promise(r=>setTimeout(r,10))})).rejects.toMatchObject({code:'LOCAL_RESOURCE_TRIPO_TIMEOUT'});
  const noKey=vi.fn(); await expect(generate(request,{projectDir:dir(),home:dir(),fetch:noKey,key:'',allowSpend:true})).rejects.toMatchObject({code:'LOCAL_RESOURCE_TRIPO_NO_KEY'}); expect(noKey).not.toHaveBeenCalled();
});
it('keeps unknown journal for server errors too', async () => {
  const root=dir(),fetch=vi.fn().mockResolvedValue(new Response('error',{status:500}));
  await expect(generate(request,{projectDir:root,fetch,key:'key',allowSpend:true})).rejects.toThrow(/unknown/);
  await expect(generate(request,{projectDir:root,fetch,key:'key',allowSpend:true})).rejects.toThrow(/unknown/); expect(fetch).toHaveBeenCalledTimes(1);
});
