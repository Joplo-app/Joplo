import { expect, test } from 'vitest';
import { COMPONENT_TYPES, INTERACTIVE_TYPES, VALUE_TYPES, GATED_CONTAINERS } from '../src/catalog.ts';
import { guide, skillIndex, skillTopic, SKILL_TOPICS } from '../src/guide.ts';

const topics = ['authoring', 'components', 'cases', 'check', 'selection', 'publish'] as const;
test('六个主题均少于 150 行，结尾的相关主题均存在', () => {
  expect(SKILL_TOPICS.map(t => t.name)).toEqual(topics);
  for (const topic of topics) {
    const body = skillTopic(topic);
    expect(body.startsWith('# ')).toBe(true);
    expect(body.trimEnd().split('\n').length, topic).toBeLessThan(150);
    const footer = body.trimEnd().split('\n').at(-1)!;
    expect(footer).toMatch(/^相关主题：/);
    const related = footer.replace('相关主题：', '').split('、');
    expect(related.length).toBeGreaterThan(0);
    for (const name of related) { expect(topics).toContain(name); expect(name).not.toBe(topic); }
  }
  expect(guide()).toBe(skillTopic('authoring'));
});
test('索引行数来自实际内容，版本由调用方提供', () => {
  const index = skillIndex('9.8.7');
  expect(index.split('\n')[0]).toBe('Joplo 9.8.7 · Agent 用法（按需读取）');
  for (const topic of topics) {
    const row = index.split('\n').find(line => line.trimStart().startsWith(`${topic} `));
    expect(row).toContain(`${skillTopic(topic).trimEnd().split('\n').length} 行`);
  }
});
test('components 取自真实目录与三种行为集合，未知 docs 不增加组件', () => {
  const output = skillTopic('components');
  for (const name of COMPONENT_TYPES.filter(name => !name.startsWith('#'))) expect(output).toContain(`- ${name}\n`);
  for (const set of [INTERACTIVE_TYPES, VALUE_TYPES, GATED_CONTAINERS]) for (const name of set) expect(output).toContain(name);
  const withDocs = skillTopic('components', { Button: 'variant / size\n下一行', Bogus: '不应输出' });
  expect(withDocs).toContain('- Button：variant / size 下一行');
  expect(withDocs).not.toContain('Bogus');
  expect(withDocs.trimEnd().split('\n').length).toBeLessThan(150);
});
test('情况清单覆盖全部八个维度，并引导提问而非擅自确认', () => {
  const body = skillTopic('cases');
  for (const dimension of ['main', 'input', 'permission', 'lifecycle', 'async', 'interrupt', 'conflict', 'consistency']) expect(body).toContain(`\`${dimension}\``);
  expect(body.match(/？/g)!.length).toBeGreaterThanOrEqual(8);
  expect(body).toContain('用户');
});
test('发布主题给出 assets 部署命令，创作主题通过引用分流详细内容', () => {
  expect(skillTopic('publish')).toContain('npx wrangler deploy --assets dist');
  expect(skillTopic('authoring')).not.toContain('- Button\n');
  expect(skillTopic('authoring')).not.toContain('npx wrangler deploy');
});

test('未知和 null 主题受控，缺省或 null 属性提示均不额外产生内容', () => {
  expect(() => skillTopic('absent')).toThrow('npx joplo skill');
  expect(() => skillTopic(null as unknown as string)).toThrow('没有主题');
  expect(skillTopic('components', null)).toBe(skillTopic('components'));
});
