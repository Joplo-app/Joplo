/**
 * 资源元数据提示（D101）只是优化：带提示的编译结果必须等于不带提示的两遍流程的结果。
 * 回归（D101 评审 P1）：本机入口更新后元数据变了，旧提示让第一遍编译报错——以前会跳过检查，
 * 第二遍不带任何元数据却“成功”，插件拿默认值输出了错误的媒体偏移。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, expect, it } from 'vitest';
import { chapter, config, work } from '@joplo-app/kit';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { definePlugin, pluginEffect } from '@joplo-app/kit/plugin';
import ui, { Text } from '@joplo-app/plugin-ui';
import type { ViteDevServer } from 'vite';
import { compileProject } from '../src/project.ts';

const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-resource-hints-')));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

it('a stale hint never changes the result: metadata is re-checked, and a hint that breaks the first pass falls back to the plain two-pass compile', async () => {
  fs.mkdirSync(path.join(dir, 'works'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'plugin'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'joplo.config.ts'), '');
  fs.writeFileSync(path.join(dir, 'works/demo.tsx'), '');
  const local = path.join(dir, 'plugin/local.mjs');
  const runtime = path.join(dir, 'plugin/runtime.mjs');
  fs.writeFileSync(runtime, 'export default {}');
  // 写入后把修改时间往后拨，保证资源宿主的签名（路径、修改时间、大小）一定变化
  let tick = 0;
  const update = (markers: Record<string, number>) => {
    fs.writeFileSync(local, `export default {compilers:{audio:{version:'1',mime:'audio/mpeg',inspect:async()=>(${JSON.stringify({ durationMs: 10000, markers })}),compile:async()=>new Uint8Array([1,2,3])}}}\n${'//'.padEnd(2 + ++tick, ' ')}`);
  };
  let selected = 'old';
  let effects = 0;
  // 和配乐插件的 marker 处理一样：有元数据但没有这个 marker 时报错；还没有元数据时先按 0 编译
  const probe = definePlugin({
    id: 'probe', title: 'Probe', components: {}, runtime, local,
    compile: {
      effect(_effect, ctx) {
        effects++;
        const resource = ctx.resource({ compiler: 'audio', input: 'unchanged' });
        const info = ctx.resourceInfo(resource);
        if (info && !Object.hasOwn(info.markers ?? {}, selected)) { ctx.report('MARKER_MISSING', `Missing ${selected}`, ctx.source, 'error'); return; }
        return { media: [{ track: 'bgm', action: 'play', resource, offsetMs: info?.markers?.[selected] ?? 0 }] };
      },
    },
  });
  const server = { ssrLoadModule: async (file: string) => ({ default: file.endsWith('joplo.config.ts')
    ? config({ name: 'Test', plugins: [ui, probe] })
    : work({ title: 'Demo', summary: 'Summary', stage: jsx(Text, { children: 'Public' }), scenarios: { one: chapter('Chapter').system('Play', pluginEffect('probe', 'play', {})) } }) }) } as unknown as ViteDevServer;
  const run = async () => {
    effects = 0;
    const r = await compileProject(server, dir, 'dev');
    return { offset: r.project?.scenarios['demo.main.one']?.steps[0]?.media?.['probe:bgm']?.offsetMs, effects, errors: r.diagnostics.filter((d) => d.severity === 'error').map((d) => d.code) };
  };

  update({ old: 1000 });
  // 冷启动：两遍（发现资源 → 带元数据）
  expect(await run()).toEqual({ offset: 1000, effects: 2, errors: [] });
  // 提示命中且重新检查一致：一遍
  expect(await run()).toEqual({ offset: 1000, effects: 1, errors: [] });
  // 元数据变了、提示仍能编译：发现不一致，退回两遍，结果是新值
  update({ old: 1500 });
  expect((await run()).offset).toBe(1500);
  // 元数据变了、旧提示让第一遍报错：必须得到新值，不能是默认的 0，也不能带着旧提示的报错
  selected = 'new';
  update({ new: 2000 });
  expect(await run()).toMatchObject({ offset: 2000, errors: [] });
  // 真正的作者错误（现在的元数据里确实没有这个 marker）照常报出来
  selected = 'missing';
  const broken = await run();
  expect(broken.errors).toContain('MARKER_MISSING');
  expect(broken.offset).toBeUndefined();
}, 120_000);
