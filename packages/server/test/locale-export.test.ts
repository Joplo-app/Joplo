import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type http from 'node:http';
import { expect, it, vi } from 'vitest';
import { Project } from '@joplo-app/core';
import { ExportHub } from '../src/export.ts';
import { renderQuery } from '../src/render.ts';

const locales = ['en', 'zh-CN', 'zh-TW', 'ja', 'ko', 'es', 'fr', 'de', 'pt-BR', 'ru'];
const project = Project.parse({schemaVersion:2,mode:'dev',name:'Test',scenes:{s:{id:'s',optionId:'f.a',route:'/',name:'Stage',root:{id:'root',type:'Stack'}}},scenarios:{s:{id:'s',optionId:'f.a',name:'Demo',mock:{label:'Mock success',outcome:'success'},initial:{sceneId:'s'},steps:[]}}});

for (const locale of [...locales, undefined, 'xx', 'ja-JP', null, 3, {}, ['en']]) {
  it(`validates locale ${JSON.stringify(locale)} through image and video URLs`, async () => {
    const urls: string[] = [];
    const page = { goto: async (url: string) => { urls.push(url); }, waitForFunction: async () => {}, evaluate: async () => null, locator: () => ({screenshot: async () => Buffer.from('png')}) };
    const hub = new ExportHub({baseUrl:()=> 'http://localhost:1234/',log:()=>{},deps:{loadPlaywright:async()=>({chromium:{launch:async()=>({newPage:async()=>page,close:async()=>{}})}}) as never,recordVideo:async({url,out})=>{ urls.push(url); fs.writeFileSync(out,'video'); }}});
    const dir = fs.mkdtempSync(path.join(os.tmpdir(),'joplo-locale-'));
    try {
      const body = {scenarioId:'s',position:0,locale};
      const res = {writeHead:vi.fn(),end:vi.fn(),headersSent:false} as unknown as http.ServerResponse;
      const ctx = {projectId:'p',dir,project,guardWrite:()=>true,jsonBody:async()=>({ok:true as const,body}),fail:(e:unknown)=>{throw e;}};
      for (const sub of ['image','video']) await hub.handle(sub,{method:'POST'} as http.IncomingMessage,res,ctx);
      expect(urls).toHaveLength(2);
      for (const url of urls) expect(new URL(url).searchParams.get('locale')).toBe(typeof locale === 'string' && locales.includes(locale) ? locale : null);
    } finally { await hub.close(); fs.rmSync(dir,{recursive:true,force:true}); }
  });
  it(`forwards validated locale ${JSON.stringify(locale)} in standalone renderQuery`, () => {
    const q = new URLSearchParams(renderQuery({projectId:'p',scenarioId:'s',position:0,theme:'sketch',locale} as never));
    expect(q.get('locale')).toBe(typeof locale === 'string' && locales.includes(locale) ? locale : null);
  });
}
