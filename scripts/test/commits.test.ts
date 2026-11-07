/**
 * 发布说明与提交前缀（D73）：按 feat / fix / perf 分组、破坏性变更单列、其他类型不进说明；前缀检查。
 */
import { expect, test } from 'vitest';
// @ts-expect-error untyped ESM module
import { parseCommit, releaseNotes, invalidSubjects } from '../commits.mjs';

const c = (subject: string, body = '', hash = 'abcdef1234567') => ({ hash, subject, body });

test('parseCommit 识别类型、scope、! 与 BREAKING CHANGE；没有前缀返回 null', () => {
  expect(parseCommit(c('feat(web): 新增时间线'))).toMatchObject({ type: 'feat', scope: 'web', text: '新增时间线', breaking: false });
  expect(parseCommit(c('fix!: 删除旧参数'))).toMatchObject({ type: 'fix', scope: null, breaking: true });
  expect(parseCommit(c('feat: 新命令', 'BREAKING CHANGE: 去掉 --old'))).toMatchObject({ breaking: true });
  expect(parseCommit(c('Feat: 大写也算'))).toMatchObject({ type: 'feat' });
  expect(parseCommit(c('发布站回放检查脚本'))).toBeNull();
  expect(parseCommit(c('feat:没有空格'))).toBeNull();
});

test('releaseNotes 分组排序、去掉前缀、带短哈希；只有内部改动时说明这一点；附 compare 链接与手写概要', () => {
  const commits = [
    c('feat(cli): 新增 outline', '', '1111111aaaa'),
    c('fix: 修复跳转', '', '2222222bbbb'),
    c('docs: 更新文档', '', '3333333cccc'),
    c('perf: 构建更快', '', '4444444dddd'),
    c('feat!: 移除 v1 格式', '', '5555555eeee'),
    c('没有前缀的提交', '', '6666666ffff'),
  ];
  const notes = releaseNotes(commits, { tag: 'v0.2.10', prev: 'v0.2.9', repo: 'Joplo-app/Joplo', summary: '这一版主要改了看板。' });
  const order = ['这一版主要改了看板。', '### 破坏性变更', '- 移除 v1 格式（5555555）', '### 新功能', '- **cli**: 新增 outline（1111111）', '### 修复', '- 修复跳转（2222222）', '### 性能', '- 构建更快（4444444）', 'https://github.com/Joplo-app/Joplo/compare/v0.2.9...v0.2.10'].map(s => notes.indexOf(s));
  expect(order.every(i => i >= 0), notes).toBe(true);
  expect(order).toEqual([...order].sort((a, b) => a - b));
  expect(notes).not.toContain('更新文档');
  expect(notes).not.toContain('没有前缀的提交');
  // 破坏性变更只出现在一处
  expect(notes.split('移除 v1 格式').length).toBe(2);

  const internal = releaseNotes([c('ci: 调整'), c('test: 补测试')], { tag: 'v0.2.10', prev: 'v0.2.9', repo: 'Joplo-app/Joplo' });
  expect(internal).toContain('没有面向用户的新功能或修复');
  expect(internal).not.toContain('###');
  // 有手写概要时不再声称“没有面向用户的改动”，以免与概要矛盾
  const withSummary = releaseNotes([c('ci: 调整')], { tag: 'v0.2.10', prev: 'v0.2.9', repo: 'Joplo-app/Joplo', summary: '- 新增看板时间线' });
  expect(withSummary).toContain('新增看板时间线');
  expect(withSummary).not.toContain('没有面向用户的新功能或修复');
  // 第一个 tag：没有上一个 tag 时不放 compare 链接
  expect(releaseNotes([c('feat: 首版')], { tag: 'v0.1.0', prev: null, repo: 'Joplo-app/Joplo' })).not.toContain('/compare/');
});

test('invalidSubjects：列出没有约定前缀的标题；合并提交、revert、release 不算违规', () => {
  const bad = invalidSubjects(['feat: a', 'fix(core): b', 'release: 0.2.10', 'Merge branch \'x\'', 'Merge pull request #3 from a/b', 'Revert "feat: a"', '中文描述', 'feature: 拼错的类型', 'chore: c']);
  expect(bad).toEqual(['中文描述', 'feature: 拼错的类型']);
});
