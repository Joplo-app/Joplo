/**
 * 主题（D51）：config.theme 是内置主题或 themes/<name>.css，否则 THEME_UNKNOWN（带 at）；作者主题写进 IR，发布模式保留；
 * 加载器读取 themes/*.css 并参与 dev 监听。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { config } from '@tokenroll/joplo-kit';
import { BUILTIN_THEMES, compile, type AuthoringProject } from '../src/index.ts';
import { discoverFiles, loadThemes } from '../src/load.ts';

const F = (file: string) => ({ file: `/p/${file}`, source: `/p/${file}:1:1` });
const project = (theme: string | undefined, themes?: Record<string, string>): AuthoringProject => ({
  root: '/p',
  config: { ...config({ name: 'T', ...(theme ? { theme } : {}) }), ...F('joplo.config.ts') },
  layouts: {},
  routes: {},
  features: {},
  ...(themes ? { themes } : {}),
});

describe('config.theme 与作者主题', () => {
  it('内置主题都可以用；缺省是 sketch', () => {
    for (const t of BUILTIN_THEMES) expect(compile(project(t), 'dev').diagnostics.filter((d) => d.code === 'THEME_UNKNOWN')).toEqual([]);
    expect(compile(project(undefined), 'dev').project!.theme).toBe('sketch');
  });
  it('作者主题 themes/<name>.css：写进 IR（发布模式也保留）；与内置同名也可以', () => {
    const css = ':root { --jp-accent: #f0f; }';
    for (const mode of ['dev', 'publish'] as const) {
      const r = compile(project('brand', { brand: css, nord: ':root{}' }), mode);
      expect(r.diagnostics.filter((d) => d.code === 'THEME_UNKNOWN')).toEqual([]);
      expect(r.project!.theme).toBe('brand');
      expect(r.project!.themes).toEqual({ brand: css, nord: ':root{}' });
    }
  });
  it('不存在的主题：THEME_UNKNOWN（error，带 at，列出内置与作者主题）', () => {
    const d = compile(project('neon', { brand: '' }), 'dev').diagnostics.find((x) => x.code === 'THEME_UNKNOWN')!;
    expect(d.severity).toBe('error');
    expect(d.at).toMatch(/joplo\.config\.ts:\d+:\d+/);
    expect(d.message).toContain('themes/neon.css');
    expect(d.message).toContain('brand');
  });
  it('加载器：themes/*.css 按文件名成为主题；不合法的文件名忽略；参与 dev 监听', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-themes-'));
    fs.writeFileSync(path.join(dir, 'joplo.config.ts'), '');
    fs.mkdirSync(path.join(dir, 'themes'));
    fs.writeFileSync(path.join(dir, 'themes', 'brand.css'), ':root { --jp-ink: #123; }');
    fs.writeFileSync(path.join(dir, 'themes', '1bad.css'), '');
    fs.writeFileSync(path.join(dir, 'themes', 'notes.txt'), '');
    expect(loadThemes(dir)).toEqual({ brand: ':root { --jp-ink: #123; }' });
    expect(discoverFiles(dir).some((f) => f.endsWith(path.join('themes', 'brand.css')))).toBe(true);
  });
});
