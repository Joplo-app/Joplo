import { afterEach, expect, test } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
const dirs: string[] = [];
afterEach(async () => { for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true }); });
async function interruptAtReady(source: string, dir: string) {
  const script = join(dir, 'interrupt.mjs'); await writeFile(script, source);
  const child = spawn(process.execPath, ['--import', 'tsx', script], { env: { ...process.env, TMPDIR: dir }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '', error = '', interrupted = false;
  child.stdout.on('data', chunk => { output += chunk; if (!interrupted && output.includes('READY')) { interrupted = true; child.kill('SIGINT'); } });
  child.stderr.on('data', chunk => error += chunk);
  const timeout = setTimeout(() => child.kill('SIGKILL'), 10000);
  try {
    const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => { child.once('error', reject); child.once('close', (code, signal) => resolve({ code, signal })); });
    expect(interrupted, output + error).toBe(true); return result;
  } finally { clearTimeout(timeout); if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); }
}
const moduleUrl = (file: string) => JSON.stringify(pathToFileURL(resolve('packages/cli/src', file)).href);
test('R8 真 SIGINT 清理当前 share 临时目录并退出 130', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'joplo-signal-')); dirs.push(dir); const home = join(dir, 'home'); await mkdir(home);
  await writeFile(join(home, 'credentials.json'), JSON.stringify({ server: 'https://cloud.joplo.app', accessToken: 'test-secret', user: { id: '1', email: 'a@example.com' }, createdAt: new Date().toISOString() }), { mode: 0o600 });
  const result = await interruptAtReady(`
    import { runCli } from ${moduleUrl('cli.ts')};
    const keepAlive = setInterval(() => {}, 1000);
    await runCli(['share', ${JSON.stringify(dir)}], {
      cloud: { env: { JOPLO_HOME: ${JSON.stringify(home)} }, check: async () => ({name:'test',summary:{error:0},diagnostics:[]}) },
      loadServer: async () => ({ buildSite: async ({outDir}) => { process.stdout.write('READY\\n'); await new Promise(() => {}); } }),
    });
    clearInterval(keepAlive);
  `, dir);
  expect((await readdir(dir)).filter(name => name.startsWith('joplo-share-'))).toEqual([]); expect(result.code).toBe(130);
}, 15000);
test('R8 真 SIGINT 清理已写入未 rename 的凭证 tmp，保留旧凭证', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'joplo-signal-')); dirs.push(dir); const home = join(dir, 'home'); await mkdir(home);
  await writeFile(join(home, 'credentials.json'), 'old credentials', { mode: 0o600 });
  const result = await interruptAtReady(`
    import fs from 'node:fs/promises';
    import { syncBuiltinESMExports } from 'node:module';
    fs.rename = async () => { process.stdout.write('READY\\n'); await new Promise(() => {}); };
    syncBuiltinESMExports();
    const {writeCredentials} = await import(${moduleUrl('cloud.ts')});
    const keepAlive = setInterval(() => {}, 1000);
    await writeCredentials(${JSON.stringify(home)}, {server:'https://cloud.joplo.app',accessToken:'test-secret',user:{id:'1',email:'a@example.com'},createdAt:new Date().toISOString()});
    clearInterval(keepAlive);
  `, dir);
  expect(await readdir(home)).toEqual(['credentials.json']); expect(await readFile(join(home, 'credentials.json'), 'utf8')).toBe('old credentials'); expect(result.code).toBe(130);
}, 15000);

test.each(['EOF', 'SIGINT'])('F4 确认提示收到 %s 时取消登录，退出 2 而非 13', async mode => {
  const dir = await mkdtemp(join(tmpdir(), 'joplo-confirm-')); dirs.push(dir);
  const home = join(dir, 'home'); await mkdir(home);
  const credentials = JSON.stringify({ server: 'http://127.0.0.1:8', accessToken: 'old-test-token', user: { id: '1', email: 'a@example.com' }, createdAt: new Date().toISOString() });
  await writeFile(join(home, 'credentials.json'), credentials, { mode: 0o600 });
  const script = join(dir, 'confirm.mjs');
  await writeFile(script, `import { runCli } from ${moduleUrl('cli.ts')}; process.exitCode = await runCli(['login'], { cloud: { env: { JOPLO_HOME: ${JSON.stringify(home)}, JOPLO_CLOUD_URL: 'http://127.0.0.1:9' }, interactive: true } });`);
  const child = spawn(process.execPath, ['--import', 'tsx', script], { stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '', stderr = '', answered = false;
  child.stdout.on('data', chunk => stdout += chunk);
  child.stderr.on('data', chunk => {
    stderr += chunk;
    if (!answered && stderr.includes('Continue?')) { answered = true; if (mode === 'EOF') child.stdin.end(); else child.kill('SIGINT'); }
  });
  const timeout = setTimeout(() => child.kill('SIGKILL'), 5000);
  try {
    const code = await new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
    expect(answered, stderr).toBe(true); expect(code, stdout + stderr).toBe(2); expect(stdout).toContain('Login cancelled'); expect(stderr).not.toMatch(/unsettled top-level await/i);
    expect(await readFile(join(home, 'credentials.json'), 'utf8')).toBe(credentials);
  } finally { clearTimeout(timeout); if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); }
}, 10000);
