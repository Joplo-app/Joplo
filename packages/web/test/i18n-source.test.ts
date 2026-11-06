import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { expect, it } from 'vitest';
const root = path.resolve(import.meta.dirname, '../src');
// The code-point width heuristic accepts author-provided CJK text; it uses numeric ranges, so no literal exception is needed.
const allowlist: Record<string, string> = {};
function scan(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? scan(path.join(dir,e.name)) : /\.(tsx?|css)$/.test(e.name) ? [path.join(dir,e.name)] : []);
}
it('contains no CJK outside comments and locale dictionaries', () => {
  const errors: string[] = [];
  for (const file of scan(root)) {
    if (/\/i18n\/(?:board\/)?(?:zh-CN|zh-TW|ja|ko|es|fr|de|pt-BR|ru)\.ts$/.test(file)) continue;
    // Required native language names are identifiers in the switcher, not interface copy.
    if (file.endsWith('/i18n/native-names.ts')) continue;
    const source = readFileSync(file,'utf8');
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    // Comment ranges are obtained from the parser at every token boundary; strings/JSX are preserved.
    const comments = new Map<number,number>();
    function visit(node: ts.Node) {
      if (ts.isJsxExpression(node) && !node.expression) comments.set(node.getStart(ast)+1,node.end-1);
      for (const p of [node.pos, node.end]) for (const r of [...(ts.getLeadingCommentRanges(source,p) ?? []), ...(ts.getTrailingCommentRanges(source,p) ?? [])]) comments.set(r.pos,r.end);
      for (const child of node.getChildren(ast)) visit(child);
    }
    visit(ast);
    let clean = source;
    for (const [a,b] of [...comments].sort((a,b)=>b[0]-a[0])) clean = clean.slice(0,a) + clean.slice(a,b).replace(/[^\n]/g,' ') + clean.slice(b);
    if (file.endsWith('.css')) clean = clean.replace(/\/\*[\s\S]*?\*\//g, (s) => s.replace(/[^\n]/g,' '));
    clean.split('\n').forEach((line,i) => {
      if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(line)) {
        const key = `${path.relative(root,file)}:${i+1}`;
        if (!allowlist[key]) errors.push(`${key}: ${line.trim()}`);
      }
    });
  }
  expect(errors).toEqual([]);
});
