/** Plugin declaration → project key cards → guarded save → local 0600 files → own local compiler.
 * Values are never project/IR data. Status contains metadata and presence only.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import type { PluginKey } from '@joplo-app/kit/plugin';
import { joploHome } from './home.ts';
const valid = (id: string) => {
  if (!/^[a-z][a-z0-9-]*$/.test(id)) throw new Error('Invalid plugin key identity');
  return id;
};
export class PluginKeyStore {
  constructor(private home = joploHome(), private env: Record<string, string | undefined> = process.env) {}
  file(plugin: string, id: string) {
    return path.join(this.home, 'plugins', valid(plugin), 'keys', `${valid(id)}.json`);
  }
  private saved(plugin: string, id: string): string | undefined {
    try {
      const key = JSON.parse(fs.readFileSync(this.file(plugin, id), 'utf8')).key;
      return typeof key === 'string' ? key : undefined;
    } catch { return undefined; }
  }
  resolve(plugin: string, declarations: readonly PluginKey[]): Record<string, string> {
    return Object.fromEntries(declarations.flatMap(d => {
      const key = this.env[d.env]?.trim() || this.saved(plugin, d.id);
      return key ? [[d.id, key]] : [];
    }));
  }
  status(plugin: string, d: PluginKey) {
    const file = this.file(plugin, d.id);
    return {
      ...d, plugin, saved: !!this.saved(plugin, d.id), envSet: !!this.env[d.env]?.trim(),
      file: file.startsWith(os.homedir() + path.sep) ? '~' + file.slice(os.homedir().length) : file,
    };
  }
  save(plugin: string, d: PluginKey, key: unknown) {
    const file = this.file(plugin, d.id);
    if (key !== null && (typeof key !== 'string' || !key.trim() || key.length > 4096 || /[\r\n]/.test(key))) throw new Error('Invalid API key');
    if (key === null) fs.rmSync(file, { force: true });
    else {
      fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
      const temp = `${file}.${crypto.randomUUID()}.tmp`;
      fs.writeFileSync(temp, JSON.stringify({ key: (key as string).trim() }) + '\n', { mode: 0o600 });
      fs.chmodSync(temp, 0o600);
      fs.renameSync(temp, file);
    }
    return this.status(plugin, d);
  }
}
/** Child processes inherit no account credentials; declared keys travel over stdin only. */
export function compilerEnvironment() {
  // HOME preserves local tool configuration (e.g. installed MIDI compilers), not credential values.
  return Object.fromEntries(['PATH', 'HOME', 'USERPROFILE', 'SystemRoot', 'WINDIR', 'TMPDIR', 'TEMP', 'TMP'].flatMap(k => process.env[k] ? [[k, process.env[k]!]] : []));
}
