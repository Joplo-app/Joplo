/** Trusted workflow metadata only: GitHub reads and git objects, never authoring modules. */
import { execFileSync } from 'node:child_process';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHA = /^[a-f0-9]{40}$/;
const REPO = /^[a-z0-9][a-z0-9-]*\/[a-z0-9_.-]+$/i;
const MAIN = 'refs/heads/main';
const integer = value => Number.isSafeInteger(value) && value > 0;
const sha = value => typeof value === 'string' && SHA.test(value);
const sameRepo = (a, b) => typeof a === 'string' && a.toLowerCase() === b.toLowerCase();
const skip = reason => ({ version: 1, enabled: false, reason });
const requireRepo = value => {
  if (typeof value !== 'string' || !REPO.test(value) || ['.', '..'].includes(value.split('/')[1])) throw new Error('Invalid repository');
  return value.toLowerCase();
};
const validRun = (run, repo, workflowId) => integer(run?.id) && run.workflow_id === workflowId && run.name === 'CI' && run.status === 'completed' && run.conclusion === 'success' && sha(run.head_sha) && sameRepo(run.repository?.full_name, repo) && sameRepo(run.head_repository?.full_name, repo);
const validPr = (pr, repo, number, head) => pr?.number === number && pr.state === 'open' && sameRepo(pr.head?.repo?.full_name, repo) && sameRepo(pr.base?.repo?.full_name, repo) && pr.head.sha === head && sha(pr.base.sha);

export function gitMergeBase(directory, head, target) {
  if (!sha(head) || !sha(target)) throw new Error('Invalid comparison SHAs');
  let result;
  try { result = execFileSync('git', ['merge-base', head, target], { cwd: directory, encoding: 'utf8', timeout: 15_000, stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
  catch { throw new Error('Cannot resolve the PR merge-base from repository history; update the branch and retry'); }
  if (!sha(result)) throw new Error('Invalid git merge-base');
  return result;
}

/** API adapter uses one fixed origin; errors never include response bodies or tokens. */
export function githubClient(repository, token, fetcher = fetch) {
  const repo = requireRepo(repository);
  if (!token) throw new Error('GH_TOKEN is required for metadata verification');
  const get = async (path, missing = false) => {
    const response = await fetcher(`https://api.github.com/repos/${repo}/${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      signal: AbortSignal.timeout(15_000), redirect: 'error',
    });
    if (missing && response.status === 404) return null;
    if (!response.ok) throw new Error(`GitHub metadata request failed (HTTP ${response.status})`);
    return response.json();
  };
  return {
    workflowId: async () => {
      const data = await get('actions/workflows/ci.yml');
      if (!integer(data?.id) || data.path !== '.github/workflows/ci.yml' || data.state !== 'active') throw new Error('The trusted CI workflow is unavailable');
      return data.id;
    },
    run: id => { if (!integer(id)) throw new Error('Invalid CI run ID'); return get(`actions/runs/${id}`); },
    pull: number => { if (!integer(number) || number > 2147483647) throw new Error('Invalid PR number'); return get(`pulls/${number}`); },
    mainHead: async () => {
      const data = await get('git/ref/heads/main');
      if (!sha(data?.object?.sha) || data.ref !== MAIN) throw new Error('Invalid main branch response');
      return data.object.sha;
    },
    runs: async (head, workflowId) => {
      if (!sha(head) || !integer(workflowId)) throw new Error('Invalid CI lookup');
      const data = await get(`actions/workflows/${workflowId}/runs?head_sha=${head}&branch=main&per_page=100`);
      if (!Array.isArray(data?.workflow_runs)) throw new Error('Invalid CI runs response');
      return data.workflow_runs;
    },
    projectExists: async ref => {
      if (!sha(ref)) throw new Error('Invalid project commit');
      const data = await get(`contents/examples/joplo/joplo.config.ts?ref=${ref}`, true);
      return data?.type === 'file' && data.path === 'examples/joplo/joplo.config.ts';
    },
  };
}

export async function planSelfDesign(context, { github, mergeBase }) {
  const repo = requireRepo(context.repository);
  if (context.ref !== MAIN) return skip('The publisher workflow must run from main');
  if (!sha(context.workflowSha)) throw new Error('Invalid trusted workflow SHA');
  if (!sameRepo(context.event?.repository?.full_name, repo)) return skip('The event belongs to a different repository');
  if (!['workflow_run', 'workflow_dispatch'].includes(context.eventName)) return skip('Unsupported publisher event');
  const workflowId = await github.workflowId();
  let run;
  if (context.eventName === 'workflow_run') {
    const eventRun = context.event.workflow_run;
    if (!integer(eventRun?.id) || eventRun.conclusion !== 'success' || eventRun.name !== 'CI') return skip('Only a successful CI run can publish');
    run = await github.run(eventRun.id);
    if (run.id !== eventRun.id || !validRun(run, repo, workflowId)) return skip('CI identity, repository or result did not match');
  } else {
    const head = await github.mainHead();
    // Require the newest matching CI to pass, including reruns. An older success
    // must not hide a newer failure or a run that is still in progress.
    const runs = (await github.runs(head, workflowId))
      .filter(item => item?.workflow_id === workflowId && item.head_sha === head && item.head_branch === 'main' && ['push', 'workflow_dispatch'].includes(item.event))
      .sort((a, b) => b.id - a.id);
    run = runs[0];
    if (!validRun(run, repo, workflowId)) return skip('The current main head has no successful latest CI run');
  }
  const common = { version: 1, enabled: true, repo, head: run.head_sha, toolSha: context.workflowSha, ciRunId: run.id, ciWorkflowId: workflowId };
  if (run.event === 'pull_request' && context.eventName === 'workflow_run') {
    if (!Array.isArray(run.pull_requests) || run.pull_requests.length !== 1) return skip('The CI run must identify exactly one PR');
    const number = run.pull_requests[0]?.number;
    if (!integer(number) || number > 2147483647) return skip('Invalid PR number');
    const pr = await github.pull(number);
    if (!validPr(pr, repo, number, common.head)) return skip('Skip a closed, forked or superseded PR head');
    const base = await mergeBase(common.head, pr.base.sha);
    if (!sha(base)) throw new Error('Invalid candidate baseline');
    if (!(await github.projectExists(base))) return skip('The PR merge-base has no examples/joplo; update the branch before requesting a feature preview');
    if (!(await github.projectExists(common.head))) return skip('The PR head has no unified design project');
    return { ...common, mode: 'pr', base, number };
  }
  if (['push', 'workflow_dispatch'].includes(run.event) && run.head_branch === 'main') {
    if (common.head !== await github.mainHead()) return skip('Skip a superseded main head');
    if (!(await github.projectExists(common.head))) return skip('The main head has no unified design project');
    return { ...common, mode: 'main', base: '', number: '' };
  }
  return skip('Only same-repository PRs and main can publish');
}

export function readPlan(value) {
  if (value?.version !== 1 || value.enabled !== true || !['main', 'pr'].includes(value.mode) || !sha(value.head) || !sha(value.toolSha) || !integer(value.ciRunId) || !integer(value.ciWorkflowId)) throw new Error('Invalid trusted publication plan');
  requireRepo(value.repo);
  if (value.mode === 'pr' && (!sha(value.base) || !integer(value.number) || value.number > 2147483647)) throw new Error('Invalid PR publication plan');
  if (value.mode === 'main' && (value.base !== '' || value.number !== '')) throw new Error('Invalid main publication plan');
  return value;
}

export async function assertPlanCurrent(value, github) {
  const plan = readPlan(value);
  const workflowId = await github.workflowId();
  const run = await github.run(plan.ciRunId);
  if (workflowId !== plan.ciWorkflowId || !validRun(run, plan.repo, workflowId) || run.head_sha !== plan.head) throw new Error('The planned CI run is no longer successful');
  if (plan.mode === 'pr') {
    if (run.event !== 'pull_request' || !validPr(await github.pull(plan.number), plan.repo, plan.number, plan.head)) throw new Error('The planned PR is closed, forked or no longer current');
  } else if (!['push', 'workflow_dispatch'].includes(run.event) || run.head_branch !== 'main' || await github.mainHead() !== plan.head) throw new Error('The planned main head is no longer current');
  return plan;
}

export function preparedOutputs(receipt, value) {
  const plan = readPlan(value);
  const prepared = receipt?.prepared;
  if (plan.mode !== 'pr' || receipt?.formatVersion !== 1 || receipt.pr?.provider !== 'github' || !sameRepo(receipt.pr.repo, plan.repo) || receipt.pr.number !== plan.number || receipt.pr.headSha !== plan.head || prepared?.headSha !== plan.head || !sha(prepared?.baseSha)) throw new Error('Prepare receipt does not match the trusted PR plan');
  // Cloud may return an older pinned baseline; never substitute the candidate.
  return { base: prepared.baseSha, head: prepared.headSha };
}

export function actionOutputs(plan) {
  const fields = plan.enabled ? { enabled: 'true', mode: plan.mode, repo: plan.repo, head: plan.head, base: plan.base, number: String(plan.number) } : { enabled: 'false' };
  return Object.entries(fields).map(([key, value]) => `${key}=${value}\n`).join('');
}

async function main(args = process.argv.slice(2), env = process.env) {
  const flag = name => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
  const known = new Set(['--out', '--verify-plan', '--receipt', '--plan']);
  if (args.length % 2 || args.some((arg, i) => i % 2 === 0 && !known.has(arg))) throw new Error('Use --out <plan>, --verify-plan <plan>, or --receipt <receipt> --plan <plan>');
  const github = githubClient(env.GITHUB_REPOSITORY, env.GH_TOKEN);
  const readJson = async file => JSON.parse(await readFile(file, 'utf8'));
  if (flag('--verify-plan')) {
    const plan = await assertPlanCurrent(await readJson(flag('--verify-plan')), github);
    if (!sameRepo(plan.repo, env.GITHUB_REPOSITORY) || plan.toolSha !== env.TRUSTED_WORKFLOW_SHA) throw new Error('Plan was issued for another repository or trusted tool version');
    process.stdout.write(`Verified current ${plan.mode} design publication plan.\n`);
    return;
  }
  if (flag('--receipt') && flag('--plan')) {
    const plan = readPlan(await readJson(flag('--plan')));
    const outputs = preparedOutputs(await readJson(flag('--receipt')), plan);
    if (!(await github.projectExists(outputs.base))) throw new Error('The pinned baseline predates examples/joplo; use a new PR comparison or a supported coordinator reset, not an empty baseline');
    if (env.GITHUB_OUTPUT) await appendFile(env.GITHUB_OUTPUT, Object.entries(outputs).map(([key, value]) => `${key}=${value}\n`).join(''));
    return;
  }
  const out = flag('--out');
  if (!out || !env.GITHUB_EVENT_PATH) throw new Error('A plan output and GitHub event file are required');
  const plan = await planSelfDesign({ eventName: env.GITHUB_EVENT_NAME, event: await readJson(env.GITHUB_EVENT_PATH), repository: env.GITHUB_REPOSITORY, ref: env.GITHUB_REF, workflowSha: env.TRUSTED_WORKFLOW_SHA }, { github, mergeBase: (head, target) => gitMergeBase(process.cwd(), head, target) });
  await writeFile(out, JSON.stringify(plan, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  if (env.GITHUB_OUTPUT) await appendFile(env.GITHUB_OUTPUT, actionOutputs(plan));
  const summary = plan.enabled ? `Self-design publication: ${plan.mode}, commit ${plan.head}.` : `Self-design publication skipped: ${plan.reason}.`;
  process.stdout.write(summary + '\n');
  if (env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY, summary + '\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { process.stderr.write('Self-design metadata verification failed. Check the trusted workflow, current CI/head and repository history.\n'); process.exitCode = 1; });
}
