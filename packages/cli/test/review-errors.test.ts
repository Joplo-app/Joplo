import { expect, test } from 'vitest';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { failure } from '../src/common.ts';
function cli(args: string[]) {
  return new Promise<any>((res, rej) => {
    const p = spawn(process.execPath, [
      '--import',
      'tsx',
      resolve('packages/cli/src/bin.ts'),
      ...args,
    ]);
    let out = '';
    p.stdout.on('data', (x) => (out += x));
    p.stderr.resume();
    p.on('error', rej);
    p.on('close', (code) => res({ code, result: JSON.parse(out) }));
  });
}
test.each(
  [
    ['get', '/missing-joplo-review', '--scope', 'project'],
    ['apply', 'examples/invite', '--patch', '/missing-joplo-patch.json'],
  ].map((args) => [args]),
)('R8 不存在路径返回 NOT_FOUND %j', async (args) => {
  const r = await cli(args);
  expect(r.code).toBe(1);
  expect(r.result.error.code).toBe('NOT_FOUND');
});
test('R8 restore 与 get 非法修订均为 USAGE/2', async () => {
  for (const args of [
    [
      'restore',
      'examples/invite',
      '--revision',
      'abc',
      '--expect-revision',
      '1',
      '--idempotency-key',
      'bad',
    ],
    ['get', 'examples/invite', '--scope', 'project', '--revision', 'abc'],
  ]) {
    const r = await cli(args);
    expect(r.code).toBe(2);
    expect(r.result.error.code).toBe('USAGE');
  }
});
test('R8 未知内部异常不伪装成 schema 错误', () => {
  expect(failure(new Error('未知内部故障')).error.code).not.toBe(
    'INVALID_SCHEMA',
  );
});
