/** A real tarball probe: source-only type checks cannot detect static JS overwriting emitted JS. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';
const root = path.resolve(import.meta.dirname, '../../..');
it('builds and packs audit named exports with a separately named browser source', () => {
  const out=fs.mkdtempSync(path.join(os.tmpdir(),'joplo-layout-pack-'));
  try {
    execFileSync('pnpm',['--filter','@joplo-app/server','build'],{cwd:root,stdio:'pipe'});
    execFileSync('pnpm',['--filter','@joplo-app/server','pack','--pack-destination',out],{cwd:root,stdio:'pipe'});
    const tarball=path.join(out,fs.readdirSync(out).find(f=>f.endsWith('.tgz'))!);
    execFileSync('tar',['-xzf',tarball,'-C',out],{stdio:'pipe'});
    fs.symlinkSync(path.join(root,'packages/server/node_modules'),path.join(out,'package/node_modules'));
    const module=path.join(out,'package/dist/layout-audit.js');
    expect(fs.existsSync(path.join(out,'package/dist/layout-audit-browser.js'))).toBe(true);
    const probe=`const m=await import(${JSON.stringify(module)}); for(const name of ['auditLayout','createLayoutAuditSession','layoutAuditOptions']) if(typeof m[name]!=='function')throw new Error('Missing packaged export '+name);`;
    expect(()=>execFileSync(process.execPath,['--import', 'tsx','--input-type=module','-e',probe],{cwd:root,stdio:'pipe'})).not.toThrow();
  } finally { fs.rmSync(out,{recursive:true,force:true}); }
},30000);
it('rejects a future static-JS/TypeScript basename collision before copying assets', () => {
  const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'joplo-build-collision-'));
  try {
    fs.mkdirSync(path.join(fixture,'src'));
    fs.writeFileSync(path.join(fixture,'package.json'),'{"name":"fixture-collision","version":"1.0.0","type":"module"}');
    fs.writeFileSync(path.join(fixture,'tsconfig.build.json'),'{"compilerOptions":{"target":"ES2022","module":"NodeNext","moduleResolution":"NodeNext","rootDir":"src","outDir":"dist","skipLibCheck":true,"types":[]},"include":["src/*.ts"]}');
    fs.writeFileSync(path.join(fixture,'src/probe.ts'),'export const value=1;');
    fs.writeFileSync(path.join(fixture,'src/probe.js'),'() => 2');
    let error:unknown;
    try { execFileSync(process.execPath,[path.join(root,'scripts/build-package.mjs')],{cwd:fixture,stdio:'pipe'}); } catch(e) { error=e; }
    expect(String(error)).toContain('会覆盖编译导出');
  } finally { fs.rmSync(fixture,{recursive:true,force:true}); }
},10000);
