import { readdir, readFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { expect, test } from 'vitest';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '../../..');
const cjk = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\u3000-\u303f\uff00-\uffef]/u;
const whitelist = [
  // Functional CJK font probe, never displayed or returned as a message.
  ['packages/server/src/page-report.js', "'中文'", 'Probe Xiaolai glyph readiness when the stage is empty'],
] as const;

// Read leaf tokens from the parser: comments/JSDoc are omitted, while strings,
// templates, regular expressions, identifiers, and JSX text retain their positions.
function withoutComments(file: string, content: string): string {
  const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
  const chars: string[] = Array.from({ length: content.length }, (_, i) => content[i] === '\n' ? '\n' : ' ');
  const visit = (node: ts.Node) => {
    if (ts.isJSDoc(node)) return;
    const children = node.getChildren(source);
    if (children.length) children.forEach(visit);
    else for (let i = node.getStart(source); i < node.end; i++) chars[i] = content[i]!;
  };
  visit(source);
  return chars.join('');
}
async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => {
    const path = resolve(dir, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : /\.(?:[cm]?[jt]sx?)$/.test(path) ? [path] : [];
  }))).flat();
}

test('comment removal preserves executable CJK and source line numbers', () => {
  const content = '// 中文 comment\n/** 日本語 */\nconst text = `// 한국어`; /* 中文 */\nconst pattern = /[。]/u;';
  const stripped = withoutComments('fixture.ts', content);
  expect(stripped).not.toContain('中文');
  expect(stripped).not.toContain('日本語');
  expect(stripped.split('\n')[2]).toContain('한국어');
  expect(stripped.split('\n')[3]).toContain('/[。]/u');
  expect(cjk.test(stripped)).toBe(true);
});

test('CLI, core, server, kit, and joplo entry output is English except the functional font probe', async () => {
  const violations: string[] = [];
  const used = new Set<readonly string[]>();
  for (const dir of ['cli/src', 'core/src', 'server/src', 'kit/src', 'joplo/bin', 'joplo/lib']) {
    for (const file of await sourceFiles(resolve(root, 'packages', dir))) {
      const name = relative(root, file).replaceAll('\\', '/');
      let text = withoutComments(file, await readFile(file, 'utf8'));
      for (const entry of whitelist.filter(([path]) => path === name)) {
        const [, exact, reason] = entry;
        expect(reason.trim()).not.toBe('');
        if (text.includes(exact)) used.add(entry);
        text = text.replaceAll(exact, exact.replace(/[^\n]/g, ' '));
      }
      text.split('\n').forEach((line, index) => {
        if (cjk.test(line)) violations.push(`${name}:${index + 1} ${line.trim()}`);
      });
    }
  }
  expect(violations, violations.join('\n')).toEqual([]);
  expect(whitelist.filter(entry => !used.has(entry)), 'Remove obsolete whitelist entries').toEqual([]);
});
