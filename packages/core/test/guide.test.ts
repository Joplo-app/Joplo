import { expect, test } from 'vitest';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { skillIndex, skillTopic, SKILL_TOPICS } from '../src/guide.ts';
import { agentSkills, skillMarkdown } from '../src/agent-skill.ts';
import ui from '../../../plugins/ui/src/plugin.ts';
import diagram from '../../../plugins/diagram/src/plugin.ts';
import content from '../../../plugins/content/src/plugin.ts';
import scene3d from '../../../plugins/3d/src/index.ts';
import alda from '../../../plugins/alda/src/index.ts';
const topics=['authoring','story','demo','focus','cases','check','selection','review','diff','publish','plugins'];
test('engine topic routing contains no component topics and every reference resolves',()=>{
 expect(SKILL_TOPICS.map(t=>t.name)).toEqual(topics);
 for(const topic of topics){const text=skillTopic(topic);expect(text.length).toBeGreaterThan(100);for(const ref of text.trimEnd().split('Related topics: ').at(-1)!.split(', '))expect(topics).toContain(ref);}
 expect(skillIndex('1.2.3')).toContain('Joplo 1.2.3');
 expect(()=>skillTopic('components')).toThrow(/Unknown engine topic/);
 expect(()=>skillTopic(null as unknown as string)).toThrow(/Unknown engine topic/);
});
test('engine guides and skill entries contain no installed plugin component vocabulary',()=>{
 const plugins=[ui,diagram,content,alda({}),scene3d];
 const names=[...new Set(plugins.flatMap(p=>Object.keys(p.components)))].filter(n=>/^[A-Z]/.test(n));
 const escape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const vocabulary=new RegExp('(?<![\\w])(?:'+names.map(escape).join('|')+')(?![\\w])','g');
 const namespaces=new RegExp('\\b(?:'+plugins.map(p=>p.id).join('|')+'):[A-Za-z]','g');
 const docs=[...topics.map(t=>({name:t,body:skillTopic(t)})),...agentSkills().map(s=>({name:s.name,body:skillMarkdown(s)}))];
 for(const d of docs){expect([...d.body.matchAll(vocabulary)].map(m=>m[0]),d.name).toEqual([]);expect([...d.body.matchAll(namespaces)],d.name).toEqual([]);}
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
  const documented = new Set(skillTopic('check').match(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g));
  expect([...codes].filter(code => !documented.has(code)).sort()).toEqual([]);
});

test('cases 按产品类型给出可筛选的预设键、维度和来源示例', () => {
  const body = skillTopic('cases');
  const groups = [
    { example: 'examples/invite', cases: { no_permission: 'permission', invalid_input: 'input', revoked: 'lifecycle', expired: 'lifecycle', already_exists: 'conflict', duplicate_submit: 'conflict', request_failed: 'async' } },
    { example: 'examples/agent-arch', cases: { quota: 'permission', dangerous_tool: 'permission', hand_offline: 'async', local_data: 'main', tool_version: 'consistency', usage_retry: 'async', model_failed: 'async' } },
    { example: 'examples/joplo/features/npm', cases: { first_run: 'main', env_old: 'input', version_skew: 'consistency', optional_dep: 'async', dir_not_empty: 'conflict', typo: 'input', user_modified: 'conflict', offline: 'async' } },
    { example: 'examples/joplo/features/home', cases: { first_open: 'main', single_instance: 'conflict', stale_resource: 'lifecycle', one_broken: 'consistency', public_view: 'consistency', recent: 'main' } },
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
  for (const text of ['same layout', 'Layer', 'director', 'Fullscreen', 'F', 'spacebar', '←/→', 'Esc', 'export images', 'Video export is local only']) expect(body).toContain(text);
});

test('case presets remain questions rather than product decisions', () => {
  const presets = skillTopic('cases').split('\n').filter(line => /^- \w+ · \w+ · /.test(line));
  expect(presets).toHaveLength(28);
  for (const line of presets) expect(line).toMatch(/ · How should .+\?$/);
});

test('publish 说明评审版、feedback 与按决定改源码的规则、API Key 与 PR 预览', () => {
  const body = skillTopic('publish');
  for (const s of ['npx joplo share --private --review', 'npx joplo feedback --format json', 'feedback --applied', 'feature.pick', "origin: 'user', status: 'confirmed'", "status: 'conflict' and ask the user", 'delete the question', 'JOPLO_API_KEY', '--pr <number>', 'run npx joplo check']) expect(body, s).toContain(s);
});

test('story（D67）：先规划再动手、PM 视角对应现有字段、字幕写法，并指回 cases / demo / check / outline', () => {
  const story = skillTopic('story');
  for (const text of ['Plan the demo first', 'Audience', 'One to three points', 'Given', 'When', 'Then', 'roles', 'goal', 'expected', 'priority', 'rules', 'One scenario = one When and one Then', 'Splitting', 'out of order', 'INVEST', 'Opening', 'Ending', 'One idea per caption', 'explain', 'DESCRIPTION_TOO_LONG', 'npx joplo outline', 'npx joplo skill cases', 'npx joplo skill demo'])
    expect(story, text).toContain(text);
  // 不引入新的作者概念（用户 2026-11-06 更正）：没有 story() / acceptance 这类 API
  expect(story).not.toMatch(/\bstory\(|\bacceptance\s*:|\bcriteria\s*:\s*[{[]/);
  expect(skillTopic('authoring')).toContain('story');
  expect(skillTopic('cases')).toContain('expected is the visible result');
});

test('diff covers identity compatibility, conservative matching, isolated publication and explicit route limits', () => {
  const body = skillTopic('diff');
  for (const term of ['joplo-step-keys', 'uncertain', 'prepare', 'JOPLO_API_KEY', 'PR_STALE_GENERATION', 'Markdown/JSON', 'ALL preceding state']) expect(body).toContain(term);
});
