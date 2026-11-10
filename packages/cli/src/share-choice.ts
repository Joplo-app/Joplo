/** D85：每次调用独立选择；必须在登录、检查、构建、网络之前完成。 */
import { createInterface } from 'node:readline/promises';
import { JoploError } from '@joplo-app/core';
import type { CloudClient } from './cloud.ts';
import type { ShareOptions } from './cloud-share.ts';

/** 回车必须由用户按下才确认高亮项；EOF / Ctrl-C 不能被当成同意。 */
async function choose(question: string, choices: readonly string[], initial: number): Promise<number> {
  const input = createInterface({ input: process.stdin, output: process.stderr, terminal: true });
  const abort = new AbortController();
  const cancel = () => abort.abort();
  input.once('SIGINT', cancel);
  const closed = new Promise<never>((_, reject) => input.once('close', () => reject(new JoploError('USAGE', 'Publication choice cancelled; nothing published'))));
  try {
    for (;;) {
      const answer = await Promise.race([input.question(`${question}\n${choices.map((c, i) => `${i === initial ? '❯' : ' '} ${i + 1}. ${c}`).join('\n')}\nChoose [${initial + 1}]: `, { signal: abort.signal }), closed]);
      const at = answer.trim() === '' ? initial : Number(answer.trim()) - 1;
      if (Number.isInteger(at) && at >= 0 && at < choices.length) return at;
    }
  } finally { input.close(); }
}

export async function shareChoices(client: CloudClient, opts: ShareOptions): Promise<{ visibility: 'public' | 'private'; review: boolean }> {
  if (opts.public && opts.private) throw new JoploError('USAGE', '--public and --private are mutually exclusive');
  const restricted = opts.pr !== undefined ? 'PR previews' : opts.scenarios?.length || opts.entryIds?.length ? 'scoped shares' : null;
  if (restricted && opts.public) throw new JoploError('USAGE', `${restricted} can only be private; remove --public`);
  // 不读取记录或配置。restricted 是模式约束，并非用户的可见性默认值。
  let visibility: 'public' | 'private' | undefined = restricted || opts.private ? 'private' : opts.public ? 'public' : undefined;
  let review = opts.review;
  const missing = [...(!visibility ? ['--public / --private'] : []), ...(review === undefined ? ['--review / --no-review'] : [])];
  if (missing.length && (!client.interactive || client.env.CI !== undefined)) throw new JoploError('USAGE', `Required choices: ${missing.join('; ')}. Choose explicitly for this invocation.`, { details: { code: 'CHOICE_REQUIRED', missing } });
  const ask = client.deps.choose ?? choose;
  if (!visibility) visibility = await ask('Public or private? Public enters your portfolio and search engines; private is visible only to people with the link.', ['Public', 'Private'], 0) === 0 ? 'public' : 'private';
  if (review === undefined) review = await ask('Also publish a review version? It contains all options, supports comments, and is always private.', ['Do not publish a review version', 'Also publish a review version'], 0) === 1;
  return { visibility, review };
}
