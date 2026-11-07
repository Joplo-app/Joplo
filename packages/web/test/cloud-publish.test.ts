/**
 * 看板直接发布到云端（D76）的纯模型：范围 → 请求体、进度行 → 阶段、结果说明、是否需要登录。
 */
import { describe, expect, it } from 'vitest';
import { cloudNotes, cloudRequest, cloudStage, defaultChoice, needsLogin } from '../src/board/cloud-model';
import type { CloudJob } from '../src/runtime/dev-client';

const ctx = { featureId: 'invite', scenarioId: 'invite.a.happy' };

describe('cloud-model', () => {
  it('范围：当前场景 / 当前功能 / 整个项目；没有当前场景时退回当前功能', () => {
    expect(cloudRequest('scenario', ctx)).toEqual({ scenarios: ['invite.a.happy'] });
    expect(cloudRequest('feature', ctx)).toEqual({ features: ['invite'] });
    expect(cloudRequest('project', ctx)).toEqual({});
    expect(cloudRequest('scenario', { featureId: 'invite', scenarioId: null })).toEqual({ features: ['invite'] });
    expect(defaultChoice(ctx)).toBe('scenario');
    expect(defaultChoice({ featureId: 'invite', scenarioId: null })).toBe('feature');
  });

  it('阶段：出现过的最后一个阶段，其他行不影响', () => {
    expect(cloudStage([])).toBe('checking');
    expect(cloudStage(['Checking the project...', 'Validation passed. Building the published site...'])).toBe('building');
    expect(cloudStage(['Checking the project...', 'Validation passed. Building...', 'Skipped the preview image (x).', 'Built 12 files (100 bytes). Uploading 3 new objects...'])).toBe('uploading');
    expect(cloudStage(['Upload complete. Finalizing publication...', 'Checking the project...'])).toBe('finalizing');
  });

  it('说明：去掉阶段行和借用行，保留预览图、朗读等提示', () => {
    expect(cloudNotes(['Checking the project...', 'Borrowed from another feature: Billing › element "seat"', 'Skipped the preview image (no export component).', 'Built 1 files (2 bytes). Uploading 1 new objects...'])).toEqual(['Skipped the preview image (no export component).']);
  });

  it('需要登录：失败且 code 是 AUTH_REQUIRED / AUTH_EXPIRED 并带登录命令', () => {
    const job = (error: CloudJob['error'], state: CloudJob['state'] = 'failed'): CloudJob => ({ id: 'c1', state, request: {}, startedAt: 0, lines: [], ...(error ? { error } : {}) });
    expect(needsLogin(job({ code: 'AUTH_REQUIRED', message: 'x', loginCommand: 'npx joplo login' }))).toBe(true);
    expect(needsLogin(job({ code: 'AUTH_EXPIRED', message: 'x', loginCommand: 'npx joplo login' }))).toBe(true);
    expect(needsLogin(job({ code: 'NETWORK', message: 'x' }))).toBe(false);
    expect(needsLogin(job(undefined, 'running'))).toBe(false);
    expect(needsLogin(null)).toBe(false);
  });
});
