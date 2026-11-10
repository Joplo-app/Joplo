import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { locateWebAssets } from './web-assets.ts';
const require = createRequire(import.meta.url);
/** Conservative content identity: safe false invalidations are preferable to reusing foreign pixels. */
export function contentIdentity(roots: readonly string[], excluded: readonly string[] = []): string {
  const hash = createHash('sha256'), visited = new Set<string>();
  const omit = excluded.map(p => path.resolve(p));
  const visit = (file: string) => {
    const abs = path.resolve(file);
    if (omit.some(p => abs === p || abs.startsWith(p + path.sep))) return;
    let real: string; try { real = fs.realpathSync(abs); } catch { hash.update(`missing:${abs}\0`); return; }
    if (visited.has(real)) return; visited.add(real);
    const stat = fs.statSync(real);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(real).sort()) {
        if (['node_modules','.git','scratch','output','coverage','.cache'].includes(name)||name.endsWith('.tmp')||name.endsWith('.lock')||/^(inspect|render|job)-/.test(name)) continue;
        if (name === '.joplo') { for (const cache of ['voice','binary','resources']) visit(path.join(real,name,cache)); continue; }
        visit(path.join(real,name));
      }
    } else if (stat.isFile()) { hash.update(real+'\0'); hash.update(fs.readFileSync(real)); hash.update('\0'); }
  };
  roots.forEach(visit); return hash.digest('hex');
}
export function exportRuntimeRoots(projectDir: string, plugins: Record<string,string>): string[] {
  const roots: string[] = [], web = locateWebAssets();
  for (const name of ['core','kit','server']) {
    const root = path.dirname(fs.realpathSync(require.resolve(`@joplo-app/${name}/package.json`)));
    roots.push(path.join(root,'package.json'),path.join(root,import.meta.filename.endsWith('.ts')?'src':'dist'));
  }
  roots.push(path.join(web.webDir,'package.json'),web.mode==='source'?path.join(web.webDir,'src'):path.join(web.webDir,'dist'));
  for (const url of Object.values(plugins)) if (url.startsWith('/@fs/')) {
    const file=decodeURIComponent(url.slice('/@fs'.length));
    if (file.startsWith(projectDir+path.sep)) {roots.push(file);continue;}
    let root=path.dirname(file);
    while(!fs.existsSync(path.join(root,'package.json'))&&path.dirname(root)!==root)root=path.dirname(root);
    roots.push(fs.existsSync(path.join(root,'package.json'))?root:file);
  }
  return roots;
}

export function checkpointCommitsMatch(saved: readonly {stepId:string;commitMs:number}[], current: readonly {stepId:string;commitMs:number}[], toleranceMs=50) {
  return saved.length===current.length&&current.every((c,i)=>c.stepId===saved[i]!.stepId&&Math.abs(c.commitMs-saved[i]!.commitMs)<=toleranceMs);
}
