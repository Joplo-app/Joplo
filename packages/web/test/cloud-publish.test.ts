/**
 * 看板直接发布到云端（D76）的纯模型：范围 → 请求体、进度行 → 阶段、结果说明、是否需要登录。
 */
import { describe, expect, it } from 'vitest';
import { cloudNotes, cloudPicks, cloudRequest, cloudStage, cloudUnpicked, defaultChoice, formatStorage, needsLogin, storageFull, storageView } from '../src/board/cloud-model';
import type { CloudJob } from '../src/runtime/dev-client';

const ctx = { featureId: 'invite', scenarioId: 'invite.a.happy' };

describe('账号容量（C27，方案 B）', () => {
  const MB = 1024 * 1024, GB = 1024 * MB;
  it('格式化：MB 一位小数、整数去掉 .0、GB 以上用 GB、不足 1 MB 用 KB、0 是 0 MB', () => {
    expect(formatStorage(Math.round(47.2 * MB))).toBe('47.2 MB');
    expect(formatStorage(100 * MB)).toBe('100 MB');
    expect(formatStorage(5 * GB)).toBe('5 GB');
    expect(formatStorage(Math.round(1.25 * GB))).toBe('1.3 GB');
    expect(formatStorage(300 * 1024)).toBe('300 KB');
    expect(formatStorage(12)).toBe('1 KB');
    expect(formatStorage(0)).toBe('0 MB');
  });
  it('平时只有一行小字；用到 80% 起出现黄色用量条与提醒；满了是 over', () => {
    expect(storageView({ usedBytes: 38 * MB, quotaBytes: 100 * MB })).toEqual({ level: 'ok', pct: 38, used: '38 MB', quota: '100 MB' });
    expect(storageView({ usedBytes: 79.9 * MB, quotaBytes: 100 * MB }).level).toBe('ok');
    expect(storageView({ usedBytes: 80 * MB, quotaBytes: 100 * MB }).level).toBe('near');
    expect(storageView({ usedBytes: 100 * MB, quotaBytes: 100 * MB })).toMatchObject({ level: 'over', pct: 100 });
    // 已超额的老账号：百分比封顶 100
    expect(storageView({ usedBytes: 150 * MB, quotaBytes: 100 * MB })).toMatchObject({ level: 'over', pct: 100 });
    // 上限为 0 或缺失：不显示
    expect(storageView({ usedBytes: 1, quotaBytes: 0 })).toBeNull();
    expect(storageView(undefined)).toBeNull();
  });
  it('容量不足：新建写还差多少，更新写多占多少；数字缺了就只给通用说明', () => {
    const links = { manageUrl: 'https://c/shares', upgradeUrl: 'https://c/settings/billing' };
    expect(storageFull({ ...links, usedBytes: Math.round(95.9 * MB), quotaBytes: 100 * MB, shareBytes: Math.round(12.4 * MB), replacedBytes: 0 })).toEqual({ kind: 'need', size: '12.4 MB', left: '4.1 MB', short: '8.3 MB', ...links });
    expect(storageFull({ ...links, usedBytes: 100 * MB, quotaBytes: 100 * MB, shareBytes: 70 * MB, replacedBytes: 60 * MB })).toEqual({ kind: 'update', size: '10 MB', left: '0 MB', ...links });
    expect(storageFull({ ...links, usedBytes: 6 * GB, quotaBytes: 5 * GB, shareBytes: 2 * MB, replacedBytes: 0 })).toMatchObject({ kind: 'need', left: '0 MB', short: '2 MB' });
    expect(storageFull({ ...links })).toEqual({ kind: 'generic', ...links });
  });
});

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

  it('发布前检查：所选范围没有已确认的方案时，指出是哪一级没确认（发布只包含 feature.pick）', () => {
    const project = {
      features: { invite: { pick: 'invite.a' }, billing: { pick: null } },
      scenarios: { 'invite.a.happy': { optionId: 'invite.a' }, 'invite.b.happy': { optionId: 'invite.b' }, 'billing.a.pay': { optionId: 'billing.a' } },
    };
    const picks = (featureId: string, scenarioId: string | null) => cloudPicks(project, { featureId, scenarioId });
    // 当前场景属于已确认的方案：都可以发
    expect(cloudUnpicked('scenario', ctx, picks('invite', 'invite.a.happy'))).toBeNull();
    expect(cloudUnpicked('feature', ctx, picks('invite', 'invite.a.happy'))).toBeNull();
    // 场景属于没被确认的方案 B：场景不能发，功能可以（发的是 A）
    const b = { featureId: 'invite', scenarioId: 'invite.b.happy' };
    expect(cloudUnpicked('scenario', b, picks('invite', 'invite.b.happy'))).toBe('scenario');
    expect(cloudUnpicked('feature', b, picks('invite', 'invite.b.happy'))).toBeNull();
    // 功能没有 pick：场景、功能都不能发；整个项目里还有别的功能确认过，可以发
    const bill = { featureId: 'billing', scenarioId: 'billing.a.pay' };
    expect(cloudUnpicked('scenario', bill, picks('billing', 'billing.a.pay'))).toBe('scenario');
    expect(cloudUnpicked('feature', bill, picks('billing', 'billing.a.pay'))).toBe('feature');
    expect(cloudUnpicked('project', bill, picks('billing', 'billing.a.pay'))).toBeNull();
    // 没有当前场景时，场景范围退回功能（与 cloudRequest 一致）
    expect(cloudUnpicked('scenario', { featureId: 'billing', scenarioId: null }, picks('billing', null))).toBe('feature');
    // 整个项目一个确认的方案都没有
    const none = { features: { billing: { pick: null } }, scenarios: {} };
    expect(cloudUnpicked('project', bill, cloudPicks(none, bill))).toBe('project');
    // 未知 id：当作未确认，不抛错
    expect(cloudUnpicked('feature', { featureId: 'nope', scenarioId: null }, cloudPicks(none, { featureId: 'nope', scenarioId: null }))).toBe('feature');
  });
});
