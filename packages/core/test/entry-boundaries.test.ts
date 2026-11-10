/** 外围只能读取条目能力；不读取内部容器的桥接字段。 */
import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import ts from 'typescript';
import { expect, it } from 'vitest';
import * as kit from '@joplo-app/kit';

it('创作入口不保留退役别名', () => {
  expect(kit).not.toHaveProperty('film');
  expect(kit).not.toHaveProperty('option');
  expect(kit).toHaveProperty('work');
});

it('web 与 CLI 不直接读取 Work.featureId 或 Work.sequencing', () => {
  const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : []);
  const paths = ['packages/web/src', 'packages/cli/src'].flatMap(files).map(p => resolve(p));
  const config = ts.readConfigFile('packages/web/tsconfig.json', ts.sys.readFile);
  const compilerOptions = ts.parseJsonConfigFileContent(config.config, ts.sys, resolve('packages/web')).options;
  const program = ts.createProgram(paths, compilerOptions);
  const checker = program.getTypeChecker();
  const hits: string[] = [];
  for (const file of paths) {
    const source = program.getSourceFile(file)!;
    const visit = (node: ts.Node) => {
      if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
        const key = ts.isPropertyAccessExpression(node) ? node.name.text : node.argumentExpression && ts.isStringLiteral(node.argumentExpression) ? node.argumentExpression.text : '';
        const receiver = checker.getNonNullableType(checker.getTypeAtLocation(node.expression));
        if (['featureId', 'sequencing'].includes(key) && receiver.getProperty('key') && receiver.getProperty('layers') && receiver.getProperty('summary')) {
          const at = source.getLineAndCharacterOfPosition(node.getStart(source));
          hits.push(`${file}:${at.line + 1} ${node.getText(source)}`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  expect(hits).toEqual([]);
// 要为 web 与 CLI 的全部源码建类型检查器，CI 上超过默认的 5 秒。
}, 60_000);

it('三个引擎入口提供相同的条目与角色出口，不提供退役出口', async () => {
  const surfaces = await Promise.all([import('../src/index.ts'), import('../src/runtime.ts'), import('../../web/src/site/core-lite.ts')]);
  for (const surface of surfaces) {
    for (const name of ['entriesOf','entryOf','rolesOf','sliceKey','scenariosOf','playSequence','visibleRoutes','featuresOf'])
      expect(surface).toHaveProperty(name);
    expect(surface).not.toHaveProperty('orderedFeatures');
    expect(surface).not.toHaveProperty('Option');
  }
});
