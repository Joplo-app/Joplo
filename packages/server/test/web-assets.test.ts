/**
 * 发布形态：看板与发布站资源来自 @joplo-app/web 的预构建 dist；作者的 @joplo-app/kit 优先取项目里安装的那份；
 * 导出组件（Playwright + Chromium，D66）是可选的，缺失时只影响导出与 render。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { JoploError } from '@joplo-app/core';
import { kitAliases, locateWebAssets, readWebDist, type WebAssets } from '../src/web-assets.ts';
import { loadPlaywright, launchHint } from '../src/render.ts';
import { fakeManaged } from './runtime-fixtures.ts';

const dirs: string[] = [];
const temp = () => {
  const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-assets-')));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function fakeWebPackage(withManifest = true) {
  const web = temp();
  fs.writeFileSync(path.join(web, 'package.json'), JSON.stringify({ name: '@joplo-app/web', version: '9.9.9' }));
  fs.mkdirSync(path.join(web, 'dist/app/assets'), { recursive: true });
  fs.writeFileSync(path.join(web, 'dist/app/index.html'), '<html></html>');
  fs.writeFileSync(path.join(web, 'dist/app/site.html'), '<html></html>');
  fs.writeFileSync(path.join(web, 'dist/project.css'), '@import "tailwindcss" source(none);');
  fs.writeFileSync(path.join(web, 'dist/site-files.json'), JSON.stringify(['site.html', 'assets/a.css']));
  if (withManifest)
    fs.writeFileSync(path.join(web, 'dist/manifest.json'), JSON.stringify({ name: '@joplo-app/web', version: '9.9.9', format: 1, board: 'app/index.html', site: 'app/site.html', siteFiles: 'site-files.json', projectCss: 'project.css' }));
  return web;
}

describe('locateWebAssets / readWebDist', () => {
  it('仓库内从源码运行时使用 packages/web 源码（开发体验不变）', () => {
    const web = locateWebAssets({});
    expect(web.mode).toBe('source');
    expect(web.webDir).toBe(path.resolve(import.meta.dirname, '../../web'));
  });

  it('读取预构建清单：看板目录、发布站文件清单、作者 className 的 CSS 入口', () => {
    const web = fakeWebPackage();
    const d = readWebDist(web);
    expect(d).toMatchObject({ mode: 'dist', webDir: web, appDir: path.join(web, 'dist/app'), projectCss: path.join(web, 'dist/project.css'), version: '9.9.9' });
    expect(d.siteFiles).toEqual(['site.html', 'assets/a.css']);
  });

  it('缺少预构建资源时明确失败，并说明怎么修复', () => {
    const web = fakeWebPackage(false);
    expect(() => readWebDist(web)).toThrow(JoploError);
    expect(() => readWebDist(web)).toThrow(/prebuilt assets.*Reinstall/);
  });

  it('清单里的文件缺失、或清单路径越出包目录时拒绝', () => {
    const web = fakeWebPackage();
    fs.rmSync(path.join(web, 'dist/project.css'));
    expect(() => readWebDist(web)).toThrow(/project\.css/);
    const web2 = fakeWebPackage();
    fs.writeFileSync(path.join(web2, 'dist/site-files.json'), JSON.stringify(['../../etc/passwd']));
    expect(() => readWebDist(web2)).toThrow(/site-files/);
  });
});

describe('kitAliases', () => {
  const dist = (): WebAssets => ({ ...readWebDist(fakeWebPackage()) });

  it('源码模式：@joplo-app/kit 指向仓库里的 kit 源码', () => {
    const a = kitAliases(locateWebAssets({}), temp());
    const kit = a.find((x) => String(x.find) === String(/^@joplo-app\/kit$/));
    expect(kit?.replacement).toBe(path.resolve(import.meta.dirname, '../../kit/src/index.ts'));
  });

  it('发布形态：项目装了 @joplo-app/kit 就不加别名（按项目依赖解析，与 check 一致）', () => {
    const project = temp();
    fs.mkdirSync(path.join(project, 'node_modules/@joplo-app/kit'), { recursive: true });
    fs.writeFileSync(path.join(project, 'node_modules/@joplo-app/kit/package.json'), JSON.stringify({ name: '@joplo-app/kit', version: '0.1.0' }));
    expect(kitAliases(dist(), project)).toEqual([]);
  });

  it('发布形态：项目没装 @joplo-app/kit 时退回 CLI 自带的 kit，且不出现 @/ 源码别名', () => {
    const a = kitAliases(dist(), temp());
    expect(a.map((x) => String(x.find))).toEqual([String(/^@joplo-app\/kit$/), String(/^@joplo-app\/kit\/(node|plugin|jsx-runtime|jsx-dev-runtime)$/)]);
    for (const x of a) expect(path.isAbsolute(String(x.replacement).replace('$1', 'ui'))).toBe(true);
  });
});

describe('导出组件可选（D66）', () => {
  it('没有导出组件：EXPORT_COMPONENT_MISSING，给出 npx joplo setup export，说明其他命令不需要它', async () => {
    const home = temp();
    const e = await loadPlaywright({ home, projectDir: temp() }).catch((x) => x);
    expect(e).toBeInstanceOf(JoploError);
    expect(e.code).toBe('EXPORT_COMPONENT_MISSING');
    expect(e.message).toContain('npx joplo setup export');
    expect(e.message).toContain('Writing demos, dev, check, build, and share do not need it');
    expect(e.message).not.toContain('npm i -D playwright');
  });

  it('托管运行时载入时的其他错误原样抛出（不误报为“未安装”）', async () => {
    const home = temp();
    fakeManaged(home);
    const e = await loadPlaywright({ home, importFile: async () => { throw new Error('boom'); } }).catch((x) => x);
    expect(e.message).toBe('boom');
  });

  it('浏览器启动失败的提示给出重装导出组件的命令', () => {
    const m = launchHint(new Error("Executable doesn't exist at /x/chrome\nmore"));
    expect(m).toContain('npx joplo setup export --force');
    expect(m).toContain('Writing demos, dev, check, build, and share do not need it');
    expect(m).not.toContain('\n');
  });
});
