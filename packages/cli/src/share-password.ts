/** 密码仅存在本次发布的内存中；环境变量只有显式 --password 才读取。 */
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { JoploError } from '@joplo-app/core';
import type { CloudClient } from './cloud.ts';
import type { ShareOptions } from './cloud-share.ts';

/** readline 的所有回显（含粘贴、重绘）进入黑洞；提示单独写 stderr。 */
export async function hiddenPassword(question: string): Promise<string> {
  const output = new Writable({ write(_chunk, _encoding, done) { done(); } });
  const input = createInterface({ input: process.stdin, output, terminal: true, historySize: 0 });
  const abort = new AbortController();
  input.once('SIGINT', () => abort.abort());
  const closed = new Promise<never>((_, reject) => input.once('close', () => reject(new JoploError('USAGE', 'Password input cancelled; nothing published'))));
  process.stderr.write(question);
  try { return await Promise.race([input.question('', { signal: abort.signal }), closed]); }
  catch { throw new JoploError('USAGE', 'Password input cancelled; nothing published'); }
  finally { input.close(); output.end(); process.stderr.write('\n'); }
}

export async function sharePassword(client: CloudClient, opts: ShareOptions, visibility: 'public' | 'private'): Promise<string | null | undefined> {
  if (opts.password === undefined) return undefined;
  if (typeof opts.password === 'string') client.rememberSecret(opts.password);
  if (visibility !== 'private') throw new JoploError('USAGE', '--password / --no-password require --private');
  if (opts.pr !== undefined) throw new JoploError('USAGE', 'PR previews cannot use --password / --no-password');
  if (opts.password === false || opts.password === null) return null;
  let password: string;
  if (typeof opts.password === 'string') password = opts.password;
  else if (client.interactive && client.env.CI === undefined) {
    const read = client.deps.readPassword ?? hiddenPassword;
    password = await read('Access password (8–128 characters): ');
    if (password) client.rememberSecret(password);
    const confirm = await read('Confirm access password: ');
    if (confirm) client.rememberSecret(confirm);
    if (confirm !== password) throw new JoploError('USAGE', 'Passwords do not match; nothing published');
  } else {
    const value = client.env.JOPLO_SHARE_PASSWORD;
    if (value === undefined) throw new JoploError('USAGE', '--password needs JOPLO_SHARE_PASSWORD or an explicit value in non-interactive mode');
    password = value;
  }
  if (password) client.rememberSecret(password);
  const length = Array.from(password).length;
  if (length < 8 || length > 128) throw new JoploError('USAGE', 'Access password must contain 8–128 characters');
  return password;
}
