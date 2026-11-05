import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Project, explainClick, replay, stateAt, initialState, applyStep, getScenario } from '../src/index.ts';

const raw = JSON.parse(readFileSync(new URL('../../../examples/invite/project.joplo.json', import.meta.url), 'utf8'));
const project = Project.parse(raw);

describe('邀请示例', () => {
  it('通过 schema 校验', () => {
    expect(project.scenarios.sc_a_success?.steps.length).toBe(5);
  });

  it('所有场景都能完整回放', () => {
    for (const id of Object.keys(project.scenarios)) {
      const r = replay(project, id);
      expect(r.diagnostics, id).toEqual([]);
    }
  });

  it('成功场景：弹窗关闭、出现 Toast、待接受列表增加', () => {
    const s = stateAt(project, 'sc_a_success', 5);
    expect(s.ui.inviteOpen).toBe(false);
    expect(s.toasts[0]?.tone).toBe('success');
    expect((s.data.pending as unknown[]).length).toBe(2);
    expect(s.completed?.outcome).toBe('success');
  });

  it('失败场景保留输入并显示错误', () => {
    const s = stateAt(project, 'sc_a_failure', 5);
    expect(s.inputs.in_email).toBe('li.lei@example.com');
    expect(s.ui.error).toContain('发送失败');
    expect(s.ui.inviteOpen).toBe(true);
  });

  it('上一步通过重放恢复业务状态，且不污染初始数据', () => {
    const after = stateAt(project, 'sc_a_success', 5);
    const back = stateAt(project, 'sc_a_success', 4);
    expect(back.toasts).toEqual([]);
    expect(back.ui.sending).toBe(true);
    expect((after.data.pending as unknown[]).length).toBe(2);
    expect((initialState(project, 'sc_a_success').data.pending as unknown[]).length).toBe(1);
  });

  it('同一输入重放结果确定', () => {
    expect(stateAt(project, 'sc_a_failure', 7)).toEqual(stateAt(project, 'sc_a_failure', 7));
  });

  it('解释点击：当前目标推进、禁用说明原因、未建模如实提示', () => {
    const s0 = initialState(project, 'sc_a_success');
    expect(explainClick(project, s0, 'btn_invite').kind).toBe('advance');
    expect(explainClick(project, s0, 'nav_settings').kind).toBe('unmodeled');
    expect(explainClick(project, s0, 'tbl_members').kind).toBe('static');
    const d0 = initialState(project, 'sc_a_denied');
    expect(explainClick(project, d0, 'btn_invite')).toEqual({ kind: 'disabled', reason: '只有空间管理员可以邀请成员' });
  });

  it('弹窗未打开时不能操作弹窗内元素', () => {
    const sc = getScenario(project, 'sc_a_success');
    const bad = { ...sc, steps: [sc.steps[1]!] };
    expect(() => applyStep(project, bad, initialState(project, 'sc_a_success'))).toThrow(/不可见/);
  });
});
