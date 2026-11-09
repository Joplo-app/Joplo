/** Board password input → guarded PUT → local 0600 store → Node-only Tripo compiler.
 * GET exposes presence only. The key never enters project state, IR or public output.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
export class TripoKeyStore {
  readonly file: string;
  constructor(home: string, private env: Record<string,string|undefined> = process.env) { this.file=path.join(home,'tripo.json'); }
  private saved(): string | undefined { try { const key=JSON.parse(fs.readFileSync(this.file,'utf8')).key; return typeof key==='string' ? key : undefined; } catch { return undefined; } }
  key() { return this.env.TRIPO_API_KEY?.trim() || this.saved(); }
  status() { return {saved:!!this.saved(),envSet:!!this.env.TRIPO_API_KEY?.trim(),env:'TRIPO_API_KEY',file:this.file.startsWith(os.homedir()+path.sep) ? '~'+this.file.slice(os.homedir().length) : this.file}; }
  save(key: unknown) {
    if(key!==null && (typeof key!=='string' || !key.trim() || key.length>4096 || /[\r\n]/.test(key))) throw new Error('Invalid API key');
    if(key===null) fs.rmSync(this.file,{force:true});
    else { fs.mkdirSync(path.dirname(this.file),{recursive:true,mode:0o700}); const temp=`${this.file}.${crypto.randomUUID()}.tmp`; fs.writeFileSync(temp,JSON.stringify({key:key.trim()})+'\n',{mode:0o600}); fs.chmodSync(temp,0o600); fs.renameSync(temp,this.file); }
    return this.status();
  }
}
