import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Project } from '@joplo/core';
import { SelectionBody, SelectionSchema, checkSelection, isJsonContentType, loadProjectFile, writeFileAtomic } from '../src/serve.ts';

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

describe('checkSelection（对照当前项目）', () => {
  const project = Project.parse(JSON.parse(fs.readFileSync(EXAMPLE, 'utf8')));
  const base = { optionId: 'opt_a', scenarioId: 'sc_a_success', position: 1, stepId: 'a_s1_open', sceneId: 'scene_a_members', nodeId: 'sel_role', at: 'x' };
  it('合法选中通过', () => {
    expect(checkSelection(project, base)).toBeNull();
    expect(checkSelection(project, { ...base, position: 0, stepId: null, nodeId: 'btn_invite' })).toBeNull();
  });
  it('方案、场景、位置、stepId、画面、元素不符都被拒绝', () => {
    expect(checkSelection(project, { ...base, optionId: 'opt_x' })).toMatch(/方案/);
    expect(checkSelection(project, { ...base, scenarioId: 'nope' })).toMatch(/场景/);
    expect(checkSelection(project, { ...base, position: 6 })).toMatch(/超出/);
    expect(checkSelection(project, { ...base, stepId: null })).toMatch(/stepId/);
    expect(checkSelection(project, { ...base, sceneId: 'scene_x' })).toMatch(/画面/);
    expect(checkSelection(project, { ...base, nodeId: 'nope' })).toMatch(/不在画面/);
  });
  it('请求体允许 null（取消选中）', () => {
    expect(SelectionBody.safeParse(null).success).toBe(true);
  });
});

describe('isJsonContentType', () => {
  it('只接受 application/json，可带 charset=utf-8', () => {
    expect(isJsonContentType('application/json')).toBe(true);
    expect(isJsonContentType('Application/JSON; charset=UTF-8')).toBe(true);
    expect(isJsonContentType('application/jsonx')).toBe(false);
    expect(isJsonContentType('application/json; boundary=x')).toBe(false);
    expect(isJsonContentType('text/plain')).toBe(false);
    expect(isJsonContentType(undefined)).toBe(false);
  });
});
