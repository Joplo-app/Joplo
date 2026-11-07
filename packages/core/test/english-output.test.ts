import { readdir, readFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { expect, test } from 'vitest';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '../../..');
const cjk = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\u3000-\u303f\uff00-\uffef]/u;
const whitelist: readonly (readonly [string, string, string])[] = [
  ['packages/cli/src/cloud-embed.ts', "const LABEL = 'Joplo 演示';", 'Fixed label from the cloud embed contract, shared verbatim with the share Worker and console; it is embed content, not CLI interface text.'],
  ['packages/core/src/agent-skill.ts', "const ZH_JOPLO = '功能原型、可交互演示、方案对比、给产品 / 设计 / 评审看的演示';", 'Chinese trigger keywords inside the agent skill description (D64); agents match them against Chinese requests, they are not CLI interface text.'],
  ['packages/core/src/agent-skill.ts', "const ZH_FEEDBACK = '本地评审、监听反馈、确认方案、评审有结论了、按评审意见修改演示';", 'Chinese trigger keywords inside the joplo-feedback skill description (D64); matching text, not CLI interface text.'],
];

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

test('CLI, core, server, kit, and joplo entry output is English', async () => {
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
