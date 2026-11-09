/** 外围只能读取条目能力；不读取内部容器的桥接字段。 */
import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import ts from 'typescript';
import { expect, it } from 'vitest';
import * as kit from '@joplo-app/kit';

it('创作入口不保留 film 别名', () => {
  expect(kit).not.toHaveProperty('film');
  expect(kit).toHaveProperty('work');
});

it('web 与 CLI 不直接读取 Feature.standalone 或 Option.sequencing', () => {
  const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : []);
  const paths = ['packages/web/src', 'packages/cli/src'].flatMap(files).map(p => resolve(p));
  const config = ts.readConfigFile('packages/web/tsconfig.json', ts.sys.readFile);
  const options = ts.parseJsonConfigFileContent(config.config, ts.sys, resolve('packages/web')).options;
  const program = ts.createProgram(paths, options);
  const checker = program.getTypeChecker();
  const hits: string[] = [];
  for (const file of paths) {
    const source = program.getSourceFile(file)!;
    const visit = (node: ts.Node) => {
      if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
        const key = ts.isPropertyAccessExpression(node) ? node.name.text : node.argumentExpression && ts.isStringLiteral(node.argumentExpression) ? node.argumentExpression.text : '';
        const receiver = checker.getNonNullableType(checker.getTypeAtLocation(node.expression));
        if (key === 'standalone' || key === 'sequencing' && receiver.getProperty('coverage')) {
          const at = source.getLineAndCharacterOfPosition(node.getStart(source));
          hits.push(`${file}:${at.line + 1} ${node.getText(source)}`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  expect(hits).toEqual([]);
});
