import { afterEach, expect, test } from 'vitest';
import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtemp, cp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const dirs: string[] = [];
const clients: Client[] = [];
afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.close()));
  await Promise.all(
    dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })),
  );
});
async function fixture() {
  const d = await mkdtemp(join(tmpdir(), 'joplo-cli-'));
  dirs.push(d);
  await cp('examples/invite/project.joplo.json', join(d, 'project.joplo.json'));
  return d;
}
function cli(args: string[], stdin?: string) {
  return new Promise<{
    code: number | null;
    stdout: string;
    stderr: string;
    result: any;
  }>((res, rej) => {
    const p = spawn(process.execPath, [
      '--import',
      'tsx',
      resolve('packages/cli/src/bin.ts'),
      ...args,
    ]);
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (x) => (stdout += x));
    p.stderr.on('data', (x) => (stderr += x));
    p.on('error', rej);
    p.stdin.end(stdin);
    p.on('close', (code) => {
      try {
        res({
          code,
          stdout,
          stderr,
          result: stdout ? JSON.parse(stdout) : undefined,
        });
      } catch (e) {
        rej(new Error(`${e}: ${stdout} ${stderr}`));
      }
    });
  });
}
async function connect(dir: string) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      '--import',
      resolve('node_modules/tsx/dist/loader.mjs'),
      resolve('packages/cli/src/bin.ts'),
      'mcp',
      '--project',
      dir,
      '--transport',
      'stdio',
    ],
    stderr: 'pipe',
    cwd: dir,
  });
  let raw = '';
  let stderr = '';
  const errors: Error[] = [];
  const start = transport.start.bind(transport);
  transport.start = async () => {
    await start();
    const process = (
      transport as unknown as { _process: ChildProcessWithoutNullStreams }
    )._process;
    process.stdout.on('data', (x) => (raw += x));
  };
  transport.stderr?.on('data', (x) => (stderr += x));
  const client = new Client(
    { name: 'joplo-integration-test', version: '1.0.0' },
    { capabilities: {} },
  );
  clients.push(client);
  client.onerror = (e) => errors.push(e);
  await client.connect(transport);
  return { client, output: () => ({ raw, stderr, errors }) };
}
test('CLI/MCP 同 patch、修订、changedIds 和错误码一致；stdout 只有协议', async () => {
  const a = await fixture();
  const b = await fixture();
  const patch = JSON.parse(
    await readFile('examples/invite/patches/01-invite-label.json', 'utf8'),
  );
  const m = await connect(b);
  const tools = await m.client.listTools();
  expect(tools.tools.map((t) => t.name)).toEqual([
    'joplo_get',
    'joplo_apply',
    'joplo_validate',
    'joplo_render',
  ]);
  for (const t of tools.tools) {
    expect(t.inputSchema.type).toBe('object');
    expect(t.outputSchema?.type).toBe('object');
  }
  const c = await cli(['apply', a, '--patch', '-'], JSON.stringify(patch));
  expect(c.code).toBe(0);
  expect(c.stderr).toBe('');
  const r = (
    await m.client.callTool({ name: 'joplo_apply', arguments: { patch } })
  ).structuredContent as any;
  expect(r.changedIds).toEqual(c.result.changedIds);
  expect(r.revision).toBe(c.result.revision);
  expect(
    JSON.parse(await readFile(join(a, 'project.joplo.json'), 'utf8')).scenes,
  ).toEqual(
    JSON.parse(await readFile(join(b, 'project.joplo.json'), 'utf8')).scenes,
  );
  for (const bad of [
    { ...patch, idempotencyKey: 'conflict' },
    { ...patch, summary: '重复键不同内容' },
    { ...patch, operations: [] },
    {
      ...patch,
      operations: [{ op: 'setCommentStatus', id: 'x', status: 'resolved' }],
    },
  ]) {
    const cr = await cli(['apply', a, '--patch', '-'], JSON.stringify(bad));
    const mr = (
      await m.client.callTool({
        name: 'joplo_apply',
        arguments: { patch: bad },
      })
    ).structuredContent as any;
    expect(cr.code).toBe(1);
    expect(mr.error.code).toBe(cr.result.error.code);
  }
  const got = (
    await m.client.callTool({
      name: 'joplo_get',
      arguments: { scope: 'selection' },
    })
  ).structuredContent as any;
  expect(got.revision).toBe(2);
  const validated = (
    await m.client.callTool({
      name: 'joplo_validate',
      arguments: { mode: 'all' },
    })
  ).structuredContent as any;
  expect(validated.data.summary.error).toBe(0);
  const rendered = (
    await m.client.callTool({
      name: 'joplo_render',
      arguments: { scenarioId: 'scenario_missing' },
    })
  ).structuredContent as any;
  expect(rendered.error.code).toBe('RENDER_FAILED');
  const captured = m.output();
  expect(captured.stderr).toBe('');
  expect(captured.errors).toEqual([]);
  const messages = captured.raw
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  expect(messages.length).toBeGreaterThan(8);
  expect(
    messages.find((msg) => msg.result?.protocolVersion)?.result.protocolVersion,
  ).toBe('2025-11-25');
  expect(messages.every((msg) => msg.jsonrpc === '2.0')).toBe(true);
}, 20000);
test('CLI 用法错误退出 2，领域错误退出 1，stdout 是单一领域 JSON', async () => {
  for (const args of [
    ['get'],
    ['unknown'],
    ['get', 'x', '--scope', 'bad'],
    ['serve', 'x', '--port', 'no'],
  ]) {
    const r = await cli(args);
    expect(r.code).toBe(2);
    expect(r.result.error.code).toBe('USAGE');
    expect(r.stdout.trim().split('\n')).toHaveLength(1);
  }
  const d = await fixture();
  for (const cmd of [
    [
      'render',
      d,
      '--scenario-id',
      'scenario_missing',
      '--out',
      '/tmp/joplo-cli-stub.png',
    ],
  ]) {
    const r = await cli(cmd);
    expect(r.code).toBe(1);
    expect(r.result.error.code).toBe('RENDER_FAILED');
  }
  expect(
    (await cli(['apply', d, '--patch', '-'], 'null')).result.error.code,
  ).toBe('INVALID_SCHEMA');
}, 15000);
test('CLI get/dry-run/validate 与参数覆盖', async () => {
  const d = await fixture();
  expect(
    (await cli(['get', d, '--scope', 'option', '--id', 'opt_a'])).result
      .revision,
  ).toBe(1);
  const r = await cli([
    'apply',
    d,
    '--patch',
    'examples/invite/patches/01-invite-label.json',
    '--expect-revision',
    'rev_1',
    '--idempotency-key',
    'k1',
    '--dry-run',
  ]);
  expect(r.code).toBe(0);
  expect(r.result.revision).toBe(2);
  expect(
    JSON.parse(await readFile(join(d, 'project.joplo.json'), 'utf8')).revision,
  ).toBe(1);
  expect(
    (await cli(['validate', d, '--mode', 'all'])).result.data.summary.error,
  ).toBe(0);
}, 15000);
