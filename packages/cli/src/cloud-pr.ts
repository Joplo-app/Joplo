/**
 * `joplo share --pr <number>`（云端契约 8.5）：请求体的 `pr: { provider: "github", repo, number, headSha, runUrl }`。
 *
 * - 在 GitHub Actions 里（GITHUB_ACTIONS=true）：repo 取 --repo 或 GITHUB_REPOSITORY；headSha 优先取事件 JSON（GITHUB_EVENT_PATH）里的
 *   pull_request.head.sha（pull_request 事件的 GITHUB_SHA 是合并提交，不是 PR 的头），没有时取 GITHUB_SHA；
 *   runUrl = GITHUB_SERVER_URL/GITHUB_REPOSITORY/actions/runs/GITHUB_RUN_ID[/attempts/N]，只在 github.com 上生成，否则为 null。
 * - 不在 Actions 里：必须 --repo owner/name；headSha 取 --sha，没有时取项目目录的 `git rev-parse HEAD`。
 * - 任何缺失或格式不对都在发请求之前以 USAGE 报错。
 */
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { JoploError } from '@joplo-app/core';
import { object } from './cloud.ts';

export type SharePr = { provider: 'github'; repo: string; number: number; headSha: string; runUrl: string | null };
/** 服务端在 finalize 响应里返回的 PR 评论结果；未知值原样保留为字符串。 */
export type PrCommentResult = { comment: string; reason: string | null; installUrl: string | null };

export const REPO_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9_.-]{1,100}$/;
const SHA = /^[0-9a-f]{40}$/i;
const RUN_URL = /^https:\/\/github\.com\/[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+\/actions\/runs\/\d+(?:\/attempts\/\d+)?$/;

const validRepo = (repo: string) => REPO_PATTERN.test(repo) && !['.', '..'].includes(repo.split('/')[1]!);

export type PrDependencies = { readFile?: (file: string) => Promise<string>; gitHead?: (dir: string) => Promise<string | null> };

function gitHead(dir: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile('git', ['rev-parse', 'HEAD'], { cwd: dir, timeout: 5000, windowsHide: true }, (error, stdout) => resolve(error ? null : String(stdout).trim()));
  });
}

export async function prContext(opts: { pr: number; repo?: string; sha?: string }, env: NodeJS.ProcessEnv, projectDir: string, deps: PrDependencies = {}): Promise<SharePr> {
  if (!Number.isSafeInteger(opts.pr) || opts.pr < 1 || opts.pr > 2147483647) throw new JoploError('USAGE', '--pr must be a pull request number (a positive integer)');
  const actions = env.GITHUB_ACTIONS === 'true';
  const repo = opts.repo?.trim() || (actions ? env.GITHUB_REPOSITORY?.trim() : undefined);
  if (!repo) throw new JoploError('USAGE', actions ? '--pr needs the repository: GITHUB_REPOSITORY is not set; pass --repo owner/name' : '--pr outside GitHub Actions needs --repo owner/name');
  if (!validRepo(repo)) throw new JoploError('USAGE', `--repo must look like owner/name, got "${repo.slice(0, 200)}"`);

  let headSha = opts.sha?.trim() || null;
  if (!headSha && actions) {
    if (env.GITHUB_EVENT_PATH?.trim()) {
      try {
        const event = object(JSON.parse(await (deps.readFile ?? ((f) => readFile(f, 'utf8')))(env.GITHUB_EVENT_PATH)));
        const sha = object(object(event.pull_request).head).sha;
        if (typeof sha === 'string' && SHA.test(sha)) headSha = sha;
      } catch {
        /* 读不到事件 JSON 时退回 GITHUB_SHA */
      }
    }
    headSha ??= env.GITHUB_SHA?.trim() || null;
  }
  if (!headSha && !actions) headSha = await (deps.gitHead ?? gitHead)(projectDir);
  if (!headSha) throw new JoploError('USAGE', actions ? '--pr could not find the commit: set GITHUB_SHA or pass --sha <commit>' : '--pr could not read the commit with git rev-parse HEAD; pass --sha <commit>');
  if (!SHA.test(headSha)) throw new JoploError('USAGE', '--sha must be a 40-character hexadecimal commit SHA');

  let runUrl: string | null = null;
  if (actions && env.GITHUB_RUN_ID?.trim() && env.GITHUB_REPOSITORY?.trim()) {
    const server = (env.GITHUB_SERVER_URL?.trim() || 'https://github.com').replace(/\/+$/, '');
    const attempt = env.GITHUB_RUN_ATTEMPT?.trim();
    const url = `${server}/${env.GITHUB_REPOSITORY.trim()}/actions/runs/${env.GITHUB_RUN_ID.trim()}${attempt && attempt !== '1' ? `/attempts/${attempt}` : ''}`;
    runUrl = RUN_URL.test(url) ? url : null;
  }
  return { provider: 'github', repo, number: opts.pr, headSha: headSha.toLowerCase(), runUrl };
}

/** 读 finalize（或 create）响应里的 `pr`；没有或结构不对时为 null。 */
export function readPrComment(value: unknown): PrCommentResult | null {
  const p = object(value);
  if (typeof p.comment !== 'string' || !/^[a-z_]{1,32}$/.test(p.comment)) return null;
  const reason = typeof p.reason === 'string' && /^[a-z_]{1,64}$/.test(p.reason) ? p.reason : null;
  let installUrl: string | null = null;
  if (typeof p.installUrl === 'string') {
    try {
      const u = new URL(p.installUrl);
      if (u.protocol === 'https:' && !u.username && !u.password && p.installUrl.length <= 2048) installUrl = u.href;
    } catch {
      /* 忽略 */
    }
  }
  return { comment: p.comment, reason, installUrl };
}

const REASONS: Record<string, string> = {
  app_not_installed: 'the Joplo GitHub App is not installed for this repository or not linked to your account',
  integration_not_configured: 'the server has no GitHub App configured',
};

/** 文本输出：评论被跳过时的一行原因 + 安装 App 的地址。 */
export function prCommentLine(pr: PrCommentResult, server: string): string | null {
  if (pr.comment === 'skipped') {
    const why = (pr.reason && REASONS[pr.reason]) ?? pr.reason ?? 'no reason given';
    return `PR comment skipped: ${why}. Install the Joplo GitHub App to comment on pull requests: ${pr.installUrl ?? `${server}/settings/github`}`;
  }
  if (pr.comment === 'failed') return 'PR comment failed; the share was published anyway';
  return null;
}
