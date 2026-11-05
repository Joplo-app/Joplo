import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SelectionSchema, loadProjectFile, writeFileAtomic } from '../src/serve.ts';

const EXAMPLE = path.resolve(import.meta.dirname, '../../../examples/invite/project.joplo.json');
const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-srv-'));

describe('loadProjectFile', () => {
  it('合法项目返回修订号与解析后的项目', () => {
    const dir = tmpDir();
    fs.copyFileSync(EXAMPLE, path.join(dir, 'project.joplo.json'));
    const r = loadProjectFile(dir);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.revision).toBe(1);
  });
  it('缺文件 / 坏 JSON / 不符合 schema 分别给出可读错误', () => {
    const dir = tmpDir();
    expect(loadProjectFile(dir)).toMatchObject({ ok: false, status: 404, error: { code: 'NOT_FOUND' } });
    fs.writeFileSync(path.join(dir, 'project.joplo.json'), '{ nope');
    expect(loadProjectFile(dir)).toMatchObject({ ok: false, status: 422, error: { code: 'INVALID_SCHEMA' } });
    fs.writeFileSync(path.join(dir, 'project.joplo.json'), JSON.stringify({ schemaVersion: 1 }));
    const r = loadProjectFile(dir);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.issues?.length).toBeGreaterThan(0);
  });
});

describe('SelectionSchema', () => {
  const base = { optionId: 'opt_a', scenarioId: 'sc_a_success', position: 0, stepId: null, sceneId: 'scene_a_members', nodeId: 'btn_invite', at: '2026-11-05T00:00:00.000Z' };
  it('接受合法选中（元素或仅步骤）', () => {
    expect(SelectionSchema.safeParse(base).success).toBe(true);
    expect(SelectionSchema.safeParse({ ...base, nodeId: null, stepId: 'a_s1_open', position: 1 }).success).toBe(true);
  });
  it('拒绝非法 ID、多余字段与负位置', () => {
    expect(SelectionSchema.safeParse({ ...base, nodeId: '../x' }).success).toBe(false);
    expect(SelectionSchema.safeParse({ ...base, extra: 1 }).success).toBe(false);
    expect(SelectionSchema.safeParse({ ...base, position: -1 }).success).toBe(false);
  });
});

describe('writeFileAtomic', () => {
  it('创建目录并整体替换文件，不留临时文件', () => {
    const dir = tmpDir();
    const f = path.join(dir, '.joplo', 'selection.json');
    writeFileAtomic(f, 'a');
    writeFileAtomic(f, 'b');
    expect(fs.readFileSync(f, 'utf8')).toBe('b');
    expect(fs.readdirSync(path.dirname(f))).toEqual(['selection.json']);
  });
});
