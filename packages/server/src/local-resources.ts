/** Node-only resource host. Work runs in a disposable process, never the browser. */
import fs from 'node:fs';
import { PluginKeyStore, compilerEnvironment } from './plugin-keys.ts';
import { joploHome } from './home.ts';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { build } from 'vite';
import type { ResourceRequest, PluginKey, LocalResourceInfo, AudioRegion } from '@joplo-app/kit/plugin';
import { AudioRegionSchema, nodeResourceIds as referencedResources, mediaResourceIds, type Project, type Diagnostic } from '@joplo-app/core';

type Result = { url?: string; audio?:AudioRegion; credit?:string; license?:string; bytes?:number; diagnostic?: Diagnostic };
const inflight = new Map<string, Promise<Result>>();
const digest = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const LIMIT = 50 * 1024 * 1024;
/** Serialize separate board/build processes too; crashed owners do not poison the cache. */
async function resourceLease(directory: string, timeoutMs = 65000): Promise<() => void> {
  const token = crypto.randomUUID(), started = Date.now();
  while (true) {
    try {
      fs.mkdirSync(directory);
      fs.writeFileSync(path.join(directory, 'owner.json'), JSON.stringify({ pid: process.pid, token }));
      return () => {
        try { if (JSON.parse(fs.readFileSync(path.join(directory, 'owner.json'), 'utf8')).token === token) fs.rmSync(directory, { recursive: true, force: true }); } catch { /* already removed */ }
      };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      try {
        const owner = JSON.parse(fs.readFileSync(path.join(directory, 'owner.json'), 'utf8'));
        try { process.kill(owner.pid, 0); } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ESRCH') { fs.rmSync(directory, { recursive: true, force: true }); continue; } }
      } catch { if (Date.now() - (fs.statSync(directory, { throwIfNoEntry: false })?.mtimeMs ?? 0) > 65000) { fs.rmSync(directory, { recursive: true, force: true }); continue; } }
      if (Date.now() - started > timeoutMs) throw Object.assign(new Error('Timed out waiting for resource compiler'), { code: 'LOCAL_RESOURCE_TIMEOUT' });
      await new Promise(r => setTimeout(r, 25));
    }
  }
}
export class LocalResources {
  private bundles = new Map<string, Promise<string>>();
  private descriptions = new Map<string, Promise<{persistent:boolean;credits?:number;timeoutMs?:number;inspect?:boolean;requiresAttribution?:boolean}>>();
  constructor(readonly directory: string, private entries: Record<string, string>, readonly keys: Record<string, readonly PluginKey[]> = {}) {}
  private bundle(plugin: string): Promise<string> {
    if (!this.bundles.has(plugin)) this.bundles.set(plugin, (async () => {
      const entry = this.entries[plugin];
      if (!entry || !fs.existsSync(entry)) throw new Error(`Plugin ${plugin}: local entry missing; reinstall the plugin`);
      const result = await build({ configFile: false, envDir: false, root: this.directory, logLevel: 'silent', ssr: { noExternal: true }, build: { ssr: entry, write: false, minify: false, sourcemap: false, rolldownOptions: { output: { format: 'es', codeSplitting: false, banner: "import {fileURLToPath as __joploFile} from 'node:url'; import {dirname as __joploDir} from 'node:path'; const __filename=__joploFile(import.meta.url), __dirname=__joploDir(__filename);" } } } });
      const output = Array.isArray(result) ? result[0] : result;
      if (!output || !('output' in output)) throw new Error('Local entry could not be bundled');
      return output.output.filter(x => x.type === 'chunk').map(x => x.code).join('\n');
    })());
    // 宿主在热更新之间复用：失败的结果不留在缓存里，下一次编译重试
    const pending = this.bundles.get(plugin)!;
    pending.catch(() => { if (this.bundles.get(plugin) === pending) this.bundles.delete(plugin); });
    return pending;
  }
  async describe(request: ResourceRequest): Promise<{ persistent: boolean; credits?: number; timeoutMs?: number; inspect?: boolean; requiresAttribution?:boolean }> {
    const code = await this.bundle(request.plugin), dir = path.join(this.directory, '.joplo', 'resources');
    fs.mkdirSync(dir, { recursive: true });
    const entry = path.join(dir, `${digest(code)}.mjs`);
    if (!fs.existsSync(entry)) { const tmp = `${entry}.${crypto.randomUUID()}.tmp`; fs.writeFileSync(tmp,code); fs.renameSync(tmp,entry); }
    const key = JSON.stringify([entry,request.compiler,request.input]);
    if (!this.descriptions.has(key)) this.descriptions.set(key, new Promise((resolve,reject) => {
      // Even metadata is evaluated in a bounded child: plugin top-level code never runs in the host.
      const script = `import {pathToFileURL} from 'node:url';
        let input='';for await(const chunk of process.stdin)input+=chunk;const r=JSON.parse(input);
        try {const c=(await import(pathToFileURL(r.entry).href)).default?.compilers?.[r.compiler];
          if(!c)throw new Error();const estimate=c.estimate?.(r.input);
          if(estimate && (!Number.isFinite(estimate.credits)||estimate.credits<0))throw new Error();
          process.stdout.write(JSON.stringify({requiresAttribution:c.requiresAttribution===true,persistent:c.persistent===true,inspect:typeof c.inspect==='function',timeoutMs:Math.max(1000,Math.min(180000,c.timeoutMs??30000)),...(estimate?{credits:estimate.credits}:{})}));
        }catch{process.exitCode=1;}`;
      const child = spawn(process.execPath,['--input-type=module','-e',script],{stdio:['pipe','pipe','ignore'],env:compilerEnvironment()});
      let output='', settled=false;
      const finish = (ok:boolean) => {if(settled)return;settled=true;clearTimeout(timer);child.kill('SIGKILL');if(ok){try{resolve(JSON.parse(output));return;}catch{}}reject(new Error('Invalid local resource declaration or estimate'));};
      const timer=setTimeout(()=>finish(false),5000);
      child.stdout.on('data',b=>{output+=b;if(output.length>4096)finish(false);});
      child.on('error',()=>finish(false));child.on('close',status=>finish(status===0));
      child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify({entry,compiler:request.compiler,input:request.input}));
    }));
    const pending = this.descriptions.get(key)!;
    pending.catch(() => { if (this.descriptions.get(key) === pending) this.descriptions.delete(key); });
    return pending;
  }
  /** Lightweight author-only metadata. No rendering, bank download or provider spend. */
  async inspect(request: ResourceRequest): Promise<{ info?: LocalResourceInfo; diagnostic?: Diagnostic }> {
    try {
      if (!(await this.describe(request)).inspect) return {};
      const code = await this.bundle(request.plugin), dir = path.join(this.directory, '.joplo', 'resources');
      const key = digest(JSON.stringify([code, request.compiler, request.input]));
      const cache = path.join(dir, `${key}.info.json`);
      try { return { info: JSON.parse(fs.readFileSync(cache, 'utf8')) }; } catch { /* no successful inspection cached */ }
      const job = fs.mkdtempSync(path.join(dir, 'inspect-'));
      try {
        const entry = path.join(dir, `${digest(code)}.mjs`);
        const info = await new Promise<LocalResourceInfo>((resolve, reject) => {
          const script = `import {pathToFileURL} from 'node:url';
            let s=''; for await(const c of process.stdin)s+=c; const r=JSON.parse(s);
            try { const c=(await import(pathToFileURL(r.entry).href)).default.compilers[r.compiler];
              process.stdout.write(JSON.stringify({info:await c.inspect(r.input,{directory:r.directory})}));
            }catch(e){process.stdout.write(JSON.stringify({error:String(e.message)}));process.exitCode=1;}`;
          const child = spawn(process.execPath, ['--input-type=module', '-e', script], { cwd: job, stdio: ['pipe', 'pipe', 'ignore'], detached: process.platform !== 'win32' });
          let output = '', settled = false;
          const finish = (error?: Error, value?: LocalResourceInfo) => {
            if (settled) return; settled = true; clearTimeout(timer);
            try { if (process.platform !== 'win32') process.kill(-child.pid!, 'SIGKILL'); else child.kill('SIGKILL'); } catch { /* exited */ }
            if (error) reject(error); else resolve(value!);
          };
          const timer = setTimeout(() => finish(new Error('Local resource inspection timed out (30s)')), 30000);
          child.stdout.on('data', b => { output += b; if (output.length > 128 * 1024) finish(new Error('Local resource metadata exceeds 128 KiB')); });
          child.on('error', e => finish(e));
          child.on('close', status => { try { const r = JSON.parse(output); if (status || !r.info || typeof r.info !== 'object') throw new Error(r.error || 'Invalid resource metadata'); finish(undefined, r.info); } catch(e) { finish(e as Error); } });
          child.stdin.on('error', () => {}); child.stdin.end(JSON.stringify({ entry, compiler: request.compiler, input: request.input, directory: job }));
        });
        const tmp = `${cache}.${crypto.randomUUID()}.tmp`; fs.writeFileSync(tmp, JSON.stringify(info)); fs.renameSync(tmp, cache);
        return { info };
      } finally { fs.rmSync(job, { recursive: true, force: true }); }
    } catch (e) { return { diagnostic: { severity: 'warning', source: 'structure', code: 'LOCAL_RESOURCE_INSPECTION_FAILED', message: `${request.plugin}/${request.compiler}: ${(e as Error).message}`, at: request.source?.replace(this.directory + path.sep, '') ?? 'joplo.config.ts:1:1' } }; }
  }
  async ensure(request: ResourceRequest, limits: { timeoutMs?: number; maxBytes?: number; allowSpend?: boolean; home?: string } = {}): Promise<Result> {
    const warning = (code: string, message: string): Result => ({ diagnostic: { severity: code==='LOCAL_RESOURCE_ATTRIBUTION_MISSING'?'error':'warning', source: 'structure', code, message: `${request.plugin}/${request.compiler}: ${message}`, at: request.source ? request.source.replace(this.directory + path.sep, '') : 'joplo.config.ts:1:1' } });
    try {
      const secrets = limits.allowSpend ? new PluginKeyStore(limits.home ?? joploHome()).resolve(request.plugin, this.keys[request.plugin] ?? []) : {};
      const redact = (text: string) => Object.values(secrets).reduce((out, key) => out.split(key).join('[REDACTED]'), text);
      const code = await this.bundle(request.plugin);
      const description = await this.describe(request);
      // Compiler version is part of the bundled declaration; code changes also invalidate.
      const key = digest(JSON.stringify([request.plugin, request.compiler, code, request.input]));
      const dir = path.join(this.directory, '.joplo', 'resources');
      const cache = path.join(dir, `${key}.json`);
      const maxBytes = Math.min(LIMIT, limits.maxBytes ?? LIMIT);
      const cached = (): Result | undefined => {
        if (description.persistent) return undefined;
        try {
          const saved = JSON.parse(fs.readFileSync(cache, 'utf8'));
          if (typeof saved.url !== 'string' || !Number.isInteger(saved.bytes) || saved.bytes < 0 || saved.bytes > maxBytes || saved.url.length > maxBytes * 1.4 + 256) return undefined;
          if (saved.audio) saved.audio = AudioRegionSchema.parse(saved.audio);
          if (description.requiresAttribution && (!saved.credit || !saved.license)) return warning('LOCAL_RESOURCE_ATTRIBUTION_MISSING', 'Cached audio has no attribution/license; restore the complete artifact cache or render it again');
          return saved;
        } catch { return undefined; }
      };
      const hit = cached(); if (hit) return hit;
      const lock = `${cache}:${maxBytes}:${!!limits.allowSpend}:${limits.timeoutMs ?? 30000}`;
      const existing = inflight.get(lock);
      if (existing) { const r = await existing; return r.diagnostic ? warning(r.diagnostic.code, r.diagnostic.message) : r; }
      const work = (async (): Promise<Result> => {
        fs.mkdirSync(dir, { recursive: true });
        const release = description.persistent ? () => {} : await resourceLease(`${cache}.lock`, (description.timeoutMs ?? 30000) + 5000);
        try {
        const hit = cached(); if (hit) return hit;
        const entry = path.join(dir, `${digest(code)}.mjs`);
        if (!fs.existsSync(entry)) { const tmp = `${entry}.${crypto.randomUUID()}.tmp`; fs.writeFileSync(tmp, code); fs.renameSync(tmp, entry); }
        const jobDir = fs.mkdtempSync(path.join(dir, 'job-'));
        try {
          const result = await new Promise<{ mime: string; data: string; bytes: number; audio?:AudioRegion; credit?:string; license?:string }>((resolve, reject) => {
            const script = `import {pathToFileURL} from 'node:url';
              const alive=setInterval(()=>{},1000); let input=''; for await (const chunk of process.stdin) input+=chunk;
              const r=JSON.parse(input); const m=await import(pathToFileURL(r.entry).href);
              const c=m.default?.compilers?.[r.compiler];
              try {
                if(!c || typeof c.version!=='string' || !/^[a-z]+\\/[a-z0-9.+-]+$/.test(c.mime)) throw new Error('Invalid local compiler declaration');
                const artifact=await c.compile(r.input,{directory:r.directory,projectDir:r.projectDir,cacheDir:r.cacheDir,keys:r.keys,allowSpend:r.allowSpend,maxBytes:r.maxBytes});
                const bytes=artifact instanceof Uint8Array?artifact:artifact?.bytes;
                if(!(bytes instanceof Uint8Array)) throw new Error('Compiler must return bytes');
                if(c.requiresAttribution&&(!artifact.credit||!artifact.license))throw Object.assign(new Error('Audio attribution/license missing'),{code:'LOCAL_RESOURCE_ATTRIBUTION_MISSING'});
                if(bytes.byteLength>r.maxBytes) throw Object.assign(new Error('Resource exceeds size limit'),{code:'LOCAL_RESOURCE_TOO_LARGE'});
                process.stdout.write(JSON.stringify({mime:c.mime,data:Buffer.from(bytes).toString('base64'),bytes:bytes.byteLength,...(artifact.audio?{audio:artifact.audio}:{}),...(artifact.credit?{credit:artifact.credit}:{}),...(artifact.license?{license:artifact.license}:{})}));
              } catch(e) { process.stdout.write(JSON.stringify({error:String(e.message),code:e.code})); process.exitCode=1; } finally { clearInterval(alive); }`;
            const child = spawn(process.execPath, ['--input-type=module', '-e', script], { cwd: jobDir, stdio: ['pipe', 'pipe', 'pipe'], env: compilerEnvironment(), detached: process.platform !== 'win32' });
            let stdout = '', stderr = '', settled = false;
            const kill = () => { try { if (process.platform !== 'win32') process.kill(-child.pid!, 'SIGKILL'); else child.kill('SIGKILL'); } catch { /* exited */ } };
            const finish = (error?: Error, value?: { mime: string; data: string; bytes: number; audio?:AudioRegion; credit?:string; license?:string }) => { if (settled) return; settled = true; clearTimeout(timer); kill(); if (error) reject(error); else resolve(value!); };
            const timer = setTimeout(() => finish(Object.assign(new Error('Compilation timed out'), { code: 'LOCAL_RESOURCE_TIMEOUT' })), (limits.allowSpend ? 21 * 60 * 1000 : Math.min(180000, limits.timeoutMs ?? description.timeoutMs ?? 30000)));
            child.stdout.on('data', b => { stdout += b; if (stdout.length > maxBytes * 1.4 + 16384) finish(Object.assign(new Error('Resource exceeds size limit'), { code: 'LOCAL_RESOURCE_TOO_LARGE' })); });
            child.stderr.on('data', b => { if (stderr.length < 4000) stderr += b; });
            child.on('error', e => finish(e));
            child.on('close', status => { try { const value = JSON.parse(stdout); if (status || value.error) finish(Object.assign(new Error(value.error ?? stderr), { code: value.code })); else finish(undefined, value); } catch { finish(new Error(stderr || 'Compiler exited without a resource')); } });
            child.stdin.on('error', () => {});
            child.stdin.end(JSON.stringify({ entry, compiler: request.compiler, input: request.input, directory: jobDir, projectDir: this.directory, cacheDir: path.join(limits.home ?? joploHome(), 'plugins', request.plugin, 'cache'), keys: secrets, allowSpend: limits.allowSpend === true, maxBytes }));
          });
          if (Object.values(secrets).some(key => result.mime.includes(key) || Buffer.from(result.data, 'base64').includes(Buffer.from(key)))) throw new Error('Compiler output contains a local credential');
          if(result.audio)result.audio=AudioRegionSchema.parse(result.audio);
          const url = `data:${result.mime};base64,${result.data}`;
          const tmp = `${cache}.${crypto.randomUUID()}.tmp`;
          if (!description.persistent) { fs.writeFileSync(tmp, JSON.stringify({ url, bytes: result.bytes, audio:result.audio,credit:result.credit,license:result.license })); fs.renameSync(tmp, cache); }
          return { url,bytes:result.bytes,audio:result.audio,credit:result.credit,license:result.license };
        } catch (e) {
          const err = e as Error & { code?: string };
          const safeCode = redact(err.code ?? '');
          return warning(/^LOCAL_RESOURCE_[A-Z0-9_]+$/.test(safeCode) ? safeCode : 'LOCAL_RESOURCE_FAILED', redact(err.message).slice(0, 2000));
        } finally { fs.rmSync(jobDir, { recursive: true, force: true }); }
        } finally { release(); }
      })();
      inflight.set(lock, work);
      try { return await work; } finally { inflight.delete(lock); }
    } catch (e) { return warning('LOCAL_RESOURCE_FAILED', e instanceof Error ? e.message : String(e)); }
  }
}
export async function inlineResources(project: Project, requests: ResourceRequest[], host: LocalResources) {
  const used = mediaResourceIds(project);
  for (const id of referencedResources(project)) used.add(id);
  const assets: Record<string, string> = {}, diagnostics: Diagnostic[] = [], credits = new Set<string>(), licenses=new Set<string>(), audioInfo:Record<string,AudioRegion>={};
  let rawBytes=0,embeddedBytes=0;
  for (const request of requests) if (used.has(request.id)) {
    const r = await host.ensure(request);
    if (r.url) {
      assets[request.id] = r.url;
      const inspected = await host.inspect(request);
      if(inspected.diagnostic)diagnostics.push(inspected.diagnostic);
      if (r.credit) credits.add(r.credit);if(r.license)licenses.add(r.license);
      if(r.audio)audioInfo[request.id]=r.audio;
      if (r.url.startsWith('data:audio/')) {
        const bytes = Buffer.from(r.url.slice(r.url.indexOf(',') + 1), 'base64');
        // Native FLAC STREAMINFO stores the precise PCM length, including a non-looping tail.
        rawBytes+=bytes.length;embeddedBytes+=r.url.length;
        const durationMs = r.audio ? r.audio.contentFrames/r.audio.sourceSampleRate*1000 : bytes.toString('ascii', 0, 4) === 'fLaC' && bytes.length >= 42
          ? Number(bytes.readBigUInt64BE(18) & 0xfffffffffn) * 1000 / (bytes.readUInt32BE(18) >>> 12)
          : inspected.info?.durationMs;
        diagnostics.push({ severity: 'info', source: 'structure', code: 'MEDIA_ASSET', at: request.source, message: `${request.plugin}/${request.id}: ${bytes.length} bytes${durationMs ? `, ${(durationMs / 1000).toFixed(3)} s` : ''}` });
        // 96 kbps is 0.72 MB/min; 0.75 allows framing, while short probes may still warn.
        if (bytes.length > 2 * 1024 * 1024 || durationMs && bytes.length / durationMs * 60000 > 750000)
          diagnostics.push({ severity: 'warning', source: 'structure', code: 'MEDIA_ASSET_LARGE', at: request.source, message: `${request.plugin}/${request.id}: audio exceeds 2 MiB per track or 0.75 MB/min (including MP3 context/padding); shorten or split the score (short loops also pay fixed context overhead)` });
      }
    }
    if (r.diagnostic) diagnostics.push(r.diagnostic);
  }
  if(rawBytes)diagnostics.push({severity:'info',source:'structure',code:'MEDIA_BUDGET',message:`All audio: ${rawBytes} raw bytes, ${embeddedBytes} embedded base64/data-URI bytes`});
  return { assets, audioInfo, diagnostics, credits: [...credits], licenses:[...licenses],rawBytes,embeddedBytes };
}

export { nodeResourceIds as referencedResources, resolveResourceProps } from '@joplo-app/core';
