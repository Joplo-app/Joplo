import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addLocaleToConfig, i18nAdd } from '../src/i18n.ts';

const repo = resolve(import.meta.dirname, '../../..');
let dir: string;

beforeAll(async () => {
  // 放在仓库里（scratch/ 被忽略），这样项目能解析到工作区的 @joplo-app/kit
  await mkdir(join(repo, 'scratch'), { recursive: true });
  dir = await mkdtemp(join(repo, 'scratch', 'i18n-test-'));
  // 复制时去掉示例自带的 locales（D83），从没有多语言的项目开始
  await cp(join(repo, 'examples/invite'), dir, { recursive: true, filter: (p) => !p.includes('.joplo') && !p.includes('/locales') });
  const cfg = join(dir, 'joplo.config.ts');
  await writeFile(cfg, (await readFile(cfg, 'utf8')).replace(/^\s*locales:.*\n/m, ''));
}, 60_000);
afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

describe('joplo i18n add（D83）', () => {
  it('config 里追加或插入 locales', () => {
    expect(addLocaleToConfig("config({\n  name: 'x',\n  locales: ['zh-CN', 'en'],\n})", ['zh-CN', 'en', 'ja'], 'ja')).toContain("locales: ['zh-CN', 'en', 'ja']");
    expect(addLocaleToConfig("config({\n  name: 'x',\n  home: '/',\n})", ['zh-CN', 'ja'], 'ja')).toBe("config({\n  name: 'x',\n  locales: ['zh-CN', 'ja'],\n  home: '/',\n})");
    expect(addLocaleToConfig('config({ name: "x" })', ['zh-CN', 'ja'], 'ja')).toBeNull();
    expect(addLocaleToConfig("config({\n  name: 'x',\n  locales: [],\n})", ['zh-CN', 'ja'], 'ja')).toContain("locales: ['zh-CN', 'ja']");
  });

  it('第一次要说明源语言；之后补齐缺的条目，保留已有译文和旧条目', async () => {
    await expect(i18nAdd(dir, 'ja')).rejects.toThrow(/--source/);
    await expect(i18nAdd(dir, 'xx')).rejects.toThrow(/Unsupported/);
    const first = await i18nAdd(dir, 'ja', { source: 'zh-CN' });
    expect(first.config).toBe(true);
    expect(first.added).toBe(first.total);
    expect(await readFile(join(dir, 'joplo.config.ts'), 'utf8')).toContain("locales: ['zh-CN', 'ja']");
    const file = join(dir, 'locales/ja.json');
    const table = JSON.parse(await readFile(file, 'utf8'));
    expect(table['邀请成员']).toBe('');
    expect(Object.keys(table)).not.toContain('li.lei@example.com');
    await writeFile(file, JSON.stringify({ ...table, 邀请成员: 'メンバーを招待', 旧的句子: '古い' }));
    const again = await i18nAdd(dir, 'ja');
    expect(again.config).toBe(false);
    expect(again.added).toBe(0);
    expect(again.kept).toBe(1);
    expect(again.untranslated).toBe(again.total - 1);
    expect(JSON.parse(await readFile(file, 'utf8'))['邀请成员']).toBe('メンバーを招待');
    const pruned = await i18nAdd(dir, 'ja', { prune: true });
    expect(pruned.pruned).toBe(1);
    expect(JSON.parse(await readFile(file, 'utf8'))['旧的句子']).toBeUndefined();
    await expect(i18nAdd(dir, 'zh-CN')).rejects.toThrow(/source language/);
    // 编译失败（有没登记的译文文件）时 config 和译文文件都不动
    const cfg = await readFile(join(dir, 'joplo.config.ts'), 'utf8');
    await writeFile(join(dir, 'locales/fr.json'), '{}');
    await expect(i18nAdd(dir, 'en')).rejects.toThrow(/compile errors/);
    expect(await readFile(join(dir, 'joplo.config.ts'), 'utf8')).toBe(cfg);
    await rm(join(dir, 'locales/fr.json'));
  }, 60_000);
});
