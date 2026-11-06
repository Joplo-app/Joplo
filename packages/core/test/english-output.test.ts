import { readdir, readFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { expect, test } from 'vitest';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '../../..');
const cjk = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\u3000-\u303f\uff00-\uffef]/u;
const whitelist = [
  // I2: mock labels become scenario descriptions in the board and published site.
  ['packages/core/src/compile.ts', "'模拟成功'", 'Mock success label in scenario descriptions'],
  ['packages/core/src/compile.ts', "'模拟失败'", 'Mock failure label in scenario descriptions'],
  ['packages/core/src/compile.ts', "'模拟无权限'", 'Mock permission label in scenario descriptions'],
  ['packages/core/src/compile.ts', "'模拟'", 'Default mock label in scenario descriptions'],
  // I2: derived coverage reasons appear in the board case list.
  ['packages/core/src/compile.ts', "'尚无场景，也没有说明'", 'Derived coverage reason shown on the board'],
  // I2: generated step captions appear below the stage in both views; T4 owns localization.
  ['packages/core/src/compile.ts', '`点击「${label}」`', 'Generated click caption'],
  ['packages/core/src/compile.ts', '`在「${label}」中输入“${a.value}”`', 'Generated input caption'],
  ['packages/core/src/compile.ts', '`在「${label}」中选择“${(choices && matchChoice(choices, a.value)?.label) ?? a.value}”`', 'Generated select caption'],
  ['packages/core/src/compile.ts', "'勾选'", 'Generated checkbox-on caption'],
  ['packages/core/src/compile.ts', "'取消勾选'", 'Generated checkbox-off caption'],
  ['packages/core/src/compile.ts', "'打开'", 'Generated toggle-on caption'],
  ['packages/core/src/compile.ts', "'关闭'", 'Generated toggle-off caption'],
  ['packages/core/src/compile.ts', '}「${label}」`', 'Generated toggle caption punctuation'],
  ['packages/core/src/compile.ts', "'返回上一页'", 'Generated back caption'],
  // I2: the player explains a disabled action directly in the board.
  ['packages/core/src/player.ts', "'该操作当前不可用（未说明原因）'", 'Default disabled-action explanation'],
  // I2: the browser tab title is part of the published site, not build diagnostics.
  ['packages/server/src/build.ts', "'<title>Joplo · 概念原型</title>'", 'Published site title replacement target'],
  ['packages/server/src/build.ts', '} · 概念原型</title>`', 'Published site browser tab title'],
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

test('CLI, core, server, and kit source output is English except explicit UI and CJK handling', async () => {
  const violations: string[] = [];
  const used = new Set<readonly string[]>();
  for (const pkg of ['cli', 'core', 'server', 'kit']) {
    for (const file of await sourceFiles(resolve(root, 'packages', pkg, 'src'))) {
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
