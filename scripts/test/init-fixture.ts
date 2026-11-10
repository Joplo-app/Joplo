/** Offline inputs for init tests. These are smoke fixtures, not distributed product templates. */
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { pluginSkillFiles } from '../../packages/cli/src/skill.ts';
import ui from '../../plugins/ui/src/plugin.ts';
import diagram from '../../plugins/diagram/src/plugin.ts';
import content from '../../plugins/content/src/plugin.ts';
import alda from '../../plugins/alda/src/index.ts';

export const releaseFixture = (kind: 'feature' | 'standalone') => resolve(import.meta.dirname, '../fixtures/smoke', kind);
export function fixtureFiles(kind: 'feature' | 'standalone'): Record<string, string> {
  const files: Record<string, string> = {};
  const walk = (base: string) => {
    for (const item of readdirSync(join(releaseFixture(kind), base), { withFileTypes: true })) {
      const file = base ? `${base}/${item.name}` : item.name;
      if (item.isDirectory()) walk(file);
      else files[file] = readFileSync(join(releaseFixture(kind), file), 'utf8');
    }
  };
  walk('');
  return files;
}

// Construct raw archive headers so security tests can also represent unsafe names and link entries.
export function tar(entries: Record<string, string>, type = '0') {
  const parts: Buffer[] = [];
  for (const [name, body] of Object.entries(entries)) {
    const bytes = Buffer.from(body), header = Buffer.alloc(512);
    header.write(name, 0, 100); header.write('0000644\0', 100); header.write('0000000\0', 108); header.write('0000000\0', 116);
    header.write(bytes.length.toString(8).padStart(11, '0') + '\0', 124); header.write('00000000000\0', 136); header.fill(32, 148, 156); header.write(type, 156); header.write('ustar\0', 257); header.write('00', 263);
    header.write([...header].reduce((a, b) => a + b, 0).toString(8).padStart(6, '0') + '\0 ', 148);
    parts.push(header, bytes, Buffer.alloc((512 - bytes.length % 512) % 512));
  }
  return gzipSync(Buffer.concat([...parts, Buffer.alloc(1024)]));
}

export function fixtureArchive(name = 'starter', guides = true) {
  const files = fixtureFiles(name === 'work' ? 'standalone' : 'feature');
  if (guides) {
    const plugins = name === 'work' ? [ui] : [ui, diagram, content, alda({})];
    // Deliberately independent of the CLI version: init must preserve manually maintained guides.
    for (const f of pluginSkillFiles('0.0.1', plugins.map(p => ({ ...p, version: '0.0.1' })))) files[`.claude/skills/${f.path}`] = f.content.toString();
  }
  return tar(Object.fromEntries(Object.entries(files).map(([file, body]) => [`repo/${name}/${file}`, body])));
}
