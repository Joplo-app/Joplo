import { describe, expect, test, vi } from 'vitest';
import {
  actionOutputs, assertPlanCurrent, githubClient, planSelfDesign, preparedOutputs, readPlan,
} from '../ci/self-design-event.mjs';

const repo = 'Joplo-app/Joplo';
const head = 'a'.repeat(40);
const base = 'b'.repeat(40);
const target = 'c'.repeat(40);
const toolSha = 'd'.repeat(40);
const repository = { full_name: repo };

function fixture(eventName = 'workflow_run') {
  const run = {
    id: 100, workflow_id: 10, name: 'CI', status: 'completed', conclusion: 'success',
    head_sha: head, head_branch: 'feature', event: 'pull_request',
    repository, head_repository: repository, pull_requests: [{ number: 12 }],
  };
  const pr = {
    number: 12, state: 'open', head: { sha: head, repo: repository },
    base: { sha: target, repo: repository },
  };
  const context = {
    repository: repo, ref: 'refs/heads/main', workflowSha: toolSha, eventName,
    event: { repository, workflow_run: { id: 100, name: 'CI', conclusion: 'success' } },
  };
  const github = {
    workflowId: vi.fn(async () => 10), run: vi.fn(async () => run),
    pull: vi.fn(async () => pr), mainHead: vi.fn(async () => head),
    runs: vi.fn(async () => [run]), projectExists: vi.fn(async () => true),
  };
  const mergeBase = vi.fn(async () => base);
  return { run, pr, context, github, mergeBase };
}

const prPlan = {
  version: 1, enabled: true, repo: repo.toLowerCase(), head, toolSha,
  ciRunId: 100, ciWorkflowId: 10, mode: 'pr', base, number: 12,
};
const mainPlan = { ...prPlan, mode: 'main', base: '', number: '' };
const receipt = {
  formatVersion: 1, pr: { provider: 'github', repo, number: 12, headSha: head },
  prepared: { headSha: head, baseSha: target },
};

describe('self-design trusted CI planning', () => {
  test('pins a real merge-base after authoritative CI and same-repository PR verification', async () => {
    const f = fixture();
    expect(await planSelfDesign(f.context, f)).toEqual(prPlan);
    expect(f.github.run).toHaveBeenCalledWith(100);
    expect(f.github.pull).toHaveBeenCalledWith(12);
    expect(f.mergeBase).toHaveBeenCalledWith(head, target);
    expect(f.github.projectExists.mock.calls).toEqual([[base], [head]]);
  });

  test.each([
    ['non-main workflow', { ref: 'refs/heads/feature' }],
    ['other repository event', { event: { repository: { full_name: 'other/repo' } } }],
    ['unsupported event', { eventName: 'pull_request_target' }],
  ])('skips %s before API access', async (_name, change) => {
    const f = fixture();
    expect(await planSelfDesign({ ...f.context, ...change }, f)).toMatchObject({ enabled: false });
    expect(f.github.workflowId).not.toHaveBeenCalled();
  });

  test.each([
    ['failure', { conclusion: 'failure' }], ['unfinished', { status: 'in_progress' }],
    ['wrong name', { name: 'untrusted CI' }], ['wrong workflow ID', { workflow_id: 11 }],
    ['different run', { id: 101 }], ['fork', { head_repository: { full_name: 'fork/Joplo' } }],
    ['other repository', { repository: { full_name: 'other/Joplo' } }], ['malformed head', { head_sha: 'main' }],
  ])('does not trust event claims when fetched CI has %s', async (_name, change) => {
    const f = fixture();
    Object.assign(f.run, change);
    expect(await planSelfDesign(f.context, f)).toMatchObject({ enabled: false });
    expect(f.github.pull).not.toHaveBeenCalled();
  });

  test.each([
    ['closed', { state: 'closed' }],
    ['forked', { head: { sha: head, repo: { full_name: 'fork/Joplo' } } }],
    ['superseded', { head: { sha: target, repo: repository } }],
    ['other base repo', { base: { sha: target, repo: { full_name: 'other/Joplo' } } }],
    ['wrong number', { number: 13 }],
  ])('skips a %s PR without computing a baseline', async (_name, change) => {
    const f = fixture();
    Object.assign(f.pr, change);
    expect(await planSelfDesign(f.context, f)).toMatchObject({ enabled: false });
    expect(f.mergeBase).not.toHaveBeenCalled();
  });

  test.each([[], [{ number: 12 }, { number: 13 }], [{ number: -1 }]])('rejects ambiguous/invalid PR association %j', async pull_requests => {
    const f = fixture();
    f.run.pull_requests = pull_requests;
    expect(await planSelfDesign(f.context, f)).toMatchObject({ enabled: false });
    expect(f.github.pull).not.toHaveBeenCalled();
  });

  test('skips a missing candidate project, never creating an empty baseline', async () => {
    const f = fixture();
    f.github.projectExists.mockResolvedValueOnce(false);
    expect(await planSelfDesign(f.context, f)).toMatchObject({ enabled: false, reason: expect.stringContaining('merge-base') });
    expect(f.github.projectExists).toHaveBeenCalledTimes(1);
  });

  test('skips missing head authoring and fails closed on unresolved history', async () => {
    const f = fixture();
    f.github.projectExists.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect(await planSelfDesign(f.context, f)).toMatchObject({ enabled: false });
    f.mergeBase.mockRejectedValueOnce(new Error('missing history'));
    await expect(planSelfDesign(f.context, f)).rejects.toThrow('missing history');
  });

  test('publishes only the current main commit after push CI', async () => {
    const f = fixture();
    Object.assign(f.run, { event: 'push', head_branch: 'main' });
    expect(await planSelfDesign(f.context, f)).toEqual(mainPlan);
    f.github.mainHead.mockResolvedValueOnce(target);
    expect(await planSelfDesign(f.context, f)).toMatchObject({ enabled: false, reason: expect.stringContaining('superseded') });
    expect(f.mergeBase).not.toHaveBeenCalled();
  });

  test('manual recovery selects the newest matching current-main CI', async () => {
    const f = fixture('workflow_dispatch');
    Object.assign(f.run, { event: 'push', head_branch: 'main' });
    f.github.runs.mockResolvedValueOnce([{ ...f.run, id: 98 }, f.run, { ...f.run, id: 999, head_sha: target }]);
    expect(await planSelfDesign(f.context, f)).toEqual(mainPlan);
    expect(f.github.runs).toHaveBeenCalledWith(head, 10);
  });

  test.each(['failure', 'cancelled', null])('manual recovery rejects a newer %s CI despite older success', async conclusion => {
    const f = fixture('workflow_dispatch');
    Object.assign(f.run, { event: 'push', head_branch: 'main' });
    f.github.runs.mockResolvedValueOnce([f.run, { ...f.run, id: 101, conclusion }]);
    expect(await planSelfDesign(f.context, f)).toMatchObject({ enabled: false });
  });

  test('manual recovery cannot publish from an empty CI history', async () => {
    const f = fixture('workflow_dispatch');
    f.github.runs.mockResolvedValueOnce([]);
    expect(await planSelfDesign(f.context, f)).toMatchObject({ enabled: false });
  });
});

describe('plan recheck and prepare receipt', () => {
  test('rechecks CI and PR immediately before publishing', async () => {
    const f = fixture();
    expect(await assertPlanCurrent(prPlan, f.github)).toEqual(prPlan);
    f.pr.head.sha = target;
    await expect(assertPlanCurrent(prPlan, f.github)).rejects.toThrow('no longer current');
  });

  test('rejects revoked CI success and changed main', async () => {
    const f = fixture();
    f.run.conclusion = 'failure';
    await expect(assertPlanCurrent(prPlan, f.github)).rejects.toThrow('no longer successful');
    Object.assign(f.run, { event: 'push', head_branch: 'main', conclusion: 'success' });
    f.github.mainHead.mockResolvedValueOnce(target);
    await expect(assertPlanCurrent(mainPlan, f.github)).rejects.toThrow('no longer current');
  });

  test('uses the Cloud-pinned baseline, even when different from candidate merge-base', () => {
    expect(preparedOutputs(receipt, prPlan)).toEqual({ base: target, head });
  });

  test.each([
    { formatVersion: 2 },
    { pr: { ...receipt.pr, provider: 'gitlab' } },
    { pr: { ...receipt.pr, repo: 'other/repo' } },
    { pr: { ...receipt.pr, number: 13 } },
    { pr: { ...receipt.pr, headSha: target } },
    { prepared: { ...receipt.prepared, headSha: target } },
    { prepared: { ...receipt.prepared, baseSha: 'main\nenabled=true' } },
  ])('rejects a mismatched or unsafe receipt %j', change => {
    expect(() => preparedOutputs({ ...receipt, ...change }, prPlan)).toThrow('does not match');
  });

  test.each([
    { enabled: false }, { toolSha: 'main' }, { repo: 'owner/..' },
    { head: 'a\nenabled=true' }, { number: 0 }, { ciRunId: -1 }, { base: '' },
  ])('rejects malformed trusted plans %j', change => {
    expect(() => readPlan({ ...prPlan, ...change })).toThrow();
  });

  test('main has no PR coordinates and skip outputs cannot carry untrusted reasons', () => {
    expect(() => readPlan({ ...mainPlan, number: 12 })).toThrow('Invalid main');
    expect(() => preparedOutputs(receipt, mainPlan)).toThrow();
    expect(actionOutputs({ enabled: false, reason: '\nenabled=true' })).toBe('enabled=false\n');
    expect(actionOutputs(prPlan)).toContain(`base=${base}\nnumber=12\n`);
  });
});

describe('GitHub metadata adapter', () => {
  test('pins origin, refuses redirects, and does not expose response bodies', async () => {
    const fetcher = vi.fn(async () => new Response('secret backend data', { status: 403 }));
    const github = githubClient(repo, 'test-only-token', fetcher);
    await expect(github.run(100)).rejects.toThrow('GitHub metadata request failed (HTTP 403)');
    expect(fetcher).toHaveBeenCalledWith('https://api.github.com/repos/joplo-app/joplo/actions/runs/100', expect.objectContaining({ redirect: 'error' }));
  });

  test('distinguishes a missing project from network/authorization failure', async () => {
    const fetcher = vi.fn(async () => new Response('', { status: 404 }));
    expect(await githubClient(repo, 'test-only-token', fetcher).projectExists(base)).toBe(false);
    await expect(githubClient(repo, 'test-only-token', fetcher).workflowId()).rejects.toThrow('HTTP 404');
  });

  test('validates identifiers before requesting external metadata', () => {
    const fetcher = vi.fn();
    expect(() => githubClient('https://evil.test/x', 'test-only-token', fetcher)).toThrow('Invalid repository');
    expect(() => githubClient(repo, '', fetcher)).toThrow('GH_TOKEN');
    const github = githubClient(repo, 'test-only-token', fetcher);
    expect(() => github.run(-1)).toThrow('Invalid CI run ID');
    expect(() => github.pull(2147483648)).toThrow('Invalid PR number');
    expect(fetcher).not.toHaveBeenCalled();
  });
});
