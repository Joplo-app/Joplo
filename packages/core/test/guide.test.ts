import { expect, test } from 'vitest';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { COMPONENT_DOCS, COMPONENT_TYPES, INTERACTIVE_TYPES, VALUE_TYPES, GATED_CONTAINERS } from '../src/catalog.ts';
import { guide, skillIndex, skillTopic, SKILL_TOPICS } from '../src/guide.ts';

const topics = ['authoring', 'demo', 'focus', 'components', 'cases', 'check', 'selection', 'publish'] as const;
test('八个主题均少于 150 行，结尾的相关主题均存在', () => {
  expect(SKILL_TOPICS.map(t => t.name)).toEqual(topics);
  for (const topic of topics) {
    const body = skillTopic(topic);
    expect(body.startsWith('# ')).toBe(true);
    expect(body.trimEnd().split('\n').length, topic).toBeLessThan(150);
    const footer = body.trimEnd().split('\n').at(-1)!;
    expect(footer).toMatch(/^Related topics: /);
    const related = footer.replace('Related topics: ', '').split(', ');
    expect(related.length).toBeGreaterThan(0);
    for (const name of related) { expect(topics).toContain(name); expect(name).not.toBe(topic); }
  }
  expect(guide()).toBe(skillTopic('authoring'));
});
test('索引行数来自实际内容，版本由调用方提供', () => {
  const index = skillIndex('9.8.7');
  expect(index.split('\n')[0]).toBe('Joplo 9.8.7 · Agent usage (read on demand)');
  for (const topic of topics) {
    const row = index.split('\n').find(line => line.trimStart().startsWith(`${topic} `));
    expect(row).toContain(`${skillTopic(topic).trimEnd().split('\n').length} lines`);
  }
});
test('components 取自真实目录与三种行为集合，未知 docs 不增加组件', () => {
  const output = skillTopic('components');
  for (const name of COMPONENT_TYPES.filter(name => !name.startsWith('#'))) expect(output).toContain(`- ${name}\n`);
  for (const set of [INTERACTIVE_TYPES, VALUE_TYPES, GATED_CONTAINERS]) for (const name of set) expect(output).toContain(name);
  const withDocs = skillTopic('components', { Button: 'variant / size\n下一行', Bogus: '不应输出' });
  expect(withDocs).toContain('- Button: variant / size 下一行');
  expect(withDocs).not.toContain('Bogus');
  expect(withDocs.trimEnd().split('\n').length).toBeLessThan(150);
});
test('情况清单覆盖全部八个维度，并引导提问而非擅自确认', () => {
  const body = skillTopic('cases');
  for (const dimension of ['main', 'input', 'permission', 'lifecycle', 'async', 'interrupt', 'conflict', 'consistency']) expect(body).toContain(`\`${dimension}\``);
  expect(body.match(/\?/g)!.length).toBeGreaterThanOrEqual(8);
  expect(body).toContain('user');
});
test('发布主题给出 assets 部署命令，创作主题通过引用分流详细内容', () => {
  expect(skillTopic('publish')).toContain('npx wrangler deploy --assets dist');
  expect(skillTopic('authoring')).not.toContain('- Button\n');
  expect(skillTopic('authoring')).not.toContain('npx wrangler deploy');
});

test('未知和 null 主题受控，缺省或 null 属性提示均不额外产生内容', () => {
  expect(() => skillTopic('absent')).toThrow('npx joplo skill');
  expect(() => skillTopic(null as unknown as string)).toThrow('Unknown topic');
  expect(skillTopic('components', null)).toBe(skillTopic('components'));
});

test('demo 集中解释层级、镜头和调用链，authoring 只指向它', () => {
  const demo = skillTopic('demo');
  for (const text of ['layer(', 'layers:', 'shot(...ids)', 'shot()', 'director layer', 'trace(', 'trace.fail', 'trace.skip', 'when', '24', '48', 'explain(', 'explanation layer', 'examples/agent-arch', '390', 'Full-height layout', 'minHeight: 0', '.card(', 'role(', 'stream(', '<Thinking', '<Artifact', '<Artifact.Ref']) expect(demo).toContain(text);
  const snippets = [...demo.matchAll(/```tsx\n([\s\S]*?)\n```/g)];
  expect(snippets).toHaveLength(1);
  expect(snippets[0]![1]!.split('\n').length).toBeGreaterThanOrEqual(5);
  expect(snippets[0]![1]!.split('\n').length).toBeLessThanOrEqual(8);
  const authoring = skillTopic('authoring');
  expect(authoring).toContain('demo');
  for (const text of ['shot(', 'trace(', 'explain(', '<Diagram', 'CAPTION_TOO_LONG', 'Viewpoint layers and director shots']) expect(authoring).not.toContain(text);
});
test('check 覆盖 compile.ts / validate.ts / schema-issues.ts / focus-check.ts 中全部静态诊断代码，避免新增诊断未同步说明', async () => {
  const files = ['compile.ts', 'validate.ts', 'schema-issues.ts', 'focus-check.ts'];
  const codes = new Set<string>();
  for (const file of files) {
    const content = await readFile(new URL(`../src/${file}`, import.meta.url), 'utf8');
    const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node) => {
      let code: ts.Node | undefined;
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        if (['err', 'warn'].includes(node.expression.text)) code = node.arguments[0];
        else if (node.expression.text === 'emit') code = node.arguments[1];
      } else if (ts.isPropertyAssignment(node) && (ts.isIdentifier(node.name) || ts.isStringLiteralLike(node.name)) && node.name.text === 'code') code = node.initializer;
      else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'code') code = node.initializer;
      // const code = cond ? 'A' : 'B'：两个分支都算
      const literals = code && ts.isConditionalExpression(code) ? [code.whenTrue, code.whenFalse] : code ? [code] : [];
      for (const literal of literals) if (ts.isStringLiteralLike(literal) && /^[A-Z][A-Z0-9_]+$/.test(literal.text)) codes.add(literal.text);
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  expect(codes).toContain('SHOT_UNKNOWN');
  expect(codes).toContain('INVALID_SCHEMA');
  expect(codes).toContain('INVALID_CONDITION');
  expect(codes).toContain('CAPTION_TOO_LONG');
  const documented = new Set(skillTopic('check').match(/\b[A-Z]+(?:_[A-Z]+)+\b/g));
  expect([...codes].filter(code => !documented.has(code)).sort()).toEqual([]);
});
test('cases 按产品类型给出可筛选的预设键、维度和来源示例', () => {
  const body = skillTopic('cases');
  const groups = [
    { example: 'examples/invite', cases: { no_permission: 'permission', invalid_input: 'input', revoked: 'lifecycle', expired: 'lifecycle', already_exists: 'conflict', duplicate_submit: 'conflict', request_failed: 'async' } },
    { example: 'examples/agent-arch', cases: { quota: 'permission', dangerous_tool: 'permission', hand_offline: 'async', local_data: 'main', tool_version: 'consistency', usage_retry: 'async', model_failed: 'async' } },
    { example: 'examples/joplo-dist', cases: { first_run: 'main', env_old: 'input', version_skew: 'consistency', optional_dep: 'async', dir_not_empty: 'conflict', typo: 'input', user_modified: 'conflict', offline: 'async' } },
    { example: 'examples/joplo-board', cases: { first_open: 'main', single_instance: 'conflict', stale_resource: 'lifecycle', one_broken: 'consistency', public_view: 'consistency', recent: 'main' } },
  ];
  for (const group of groups) {
    expect(body).toContain(group.example);
    for (const [key, dimension] of Object.entries(group.cases)) expect(body).toMatch(new RegExp(`^- ${key} · ${dimension} · .+`, 'm'));
  }
  expect(body).toContain('Do not include every preset');
  expect(body.trimEnd().split('\n').at(-3)).toMatch(/No mobile example.*separate.*D44/);
});
test('publish 说明同布局、导演、发布端快捷键以及图片/视频边界', () => {
  const body = skillTopic('publish');
  for (const text of ['same layout', 'Layer', 'director', 'Fullscreen', 'F', 'Space', '←/→', 'Esc', 'export images', 'Video export is local only']) expect(body).toContain(text);
});

test('authoring guidance preserves prohibitions and prototype scope', () => {
  const demo = skillTopic('demo');
  expect(demo).toContain('Do not manually write node/edge state props or use set() to simulate calls; use trace()');
  expect(skillTopic('authoring')).toContain('Do not use fixed pixel heights for full-height layouts');
  expect(skillTopic('components')).toContain('unmodeled marks behavior not modeled by this prototype');
});
test('case presets remain questions rather than product decisions', () => {
  const presets = skillTopic('cases').split('\n').filter(line => /^- \w+ · \w+ · /.test(line));
  expect(presets).toHaveLength(28);
  for (const line of presets) expect(line).toMatch(/ · How should .+\?$/);
});
test('API status values use their actual spelling and trace paths are distinct from routes', () => {
  const cases = skillTopic('cases');
  for (const status of ['expressed', 'undecided', 'missing', 'not_applicable', 'excluded', 'confirmed', 'pending']) expect(cases).toContain(`\`${status}\``);
  expect(skillTopic('authoring')).toContain('Never mark an AI assumption `confirmed`');
  expect(skillTopic('check')).toContain('disconnected path');
  expect(skillTopic('check')).not.toContain('disconnected route');
});
test('component guidance describes navigation, automatic phone frames, and current UI labels', () => {
  const output = skillTopic('components', { Anchor: COMPONENT_DOCS.Anchor, Phone: COMPONENT_DOCS.Phone, Thinking: COMPONENT_DOCS.Thinking });
  expect(output).toContain('href is display-only; clicking never navigates; use go() in the step');
  expect(output).toContain('do not add Phone explicitly');
  expect(output).toContain('Thought for …');
  expect(skillTopic('demo')).toContain('Appearance');
  expect(skillTopic('demo')).toContain('Follow director');
  expect(skillTopic('demo')).not.toContain('Settings · Theme');
  expect(skillTopic('selection')).toContain('Open in editor');
});

test('P1 authoring rules, components, and annotation theme variable remain documented', () => {
  expect(skillTopic('authoring')).toContain(".press('⌘K'");
  const demo = skillTopic('demo');
  for (const text of ['fork(label, scenarioKey)', 'mark(id,', '<Email', '<StateFlow', '<DataCard', '--jp-annot', 'Empty labels are omitted; targets are still validated', 'Autoplay stays on the main flow']) expect(demo).toContain(text);
});

test('publish 说明评审版、feedback 与按决定改源码的规则、API Key 与 PR 预览', () => {
  const body = skillTopic('publish');
  for (const s of ['npx joplo share --review', 'npx joplo feedback --format json', 'feedback --applied', 'feature.pick', "origin: 'user', status: 'confirmed'", "status: 'conflict' and ask the user", 'delete the question', 'JOPLO_API_KEY', '--pr <number>', 'run npx joplo check']) expect(body, s).toContain(s);
});
