import { afterEach, expect, test, vi } from 'vitest';
import { cp, mkdtemp, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { renderStep, startServer } from '@joplo/server';
import { render, renderImage, serve } from '../src/render.ts';
vi.mock('@joplo/server', () => ({ renderStep: vi.fn(), startServer: vi.fn() }));
const dirs: string[] = [];
afterEach(async () => {
  vi.resetAllMocks();
  await Promise.all(
    dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })),
  );
});
async function fixture() {
  const d = await mkdtemp(join(tmpdir(), 'joplo-render-test-'));
  dirs.push(d);
  await cp('examples/invite/project.joplo.json', join(d, 'project.joplo.json'));
  return d;
}
test('截图接线返回图像与元素索引，并清理 MCP 临时资源', async () => {
  const d = await fixture();
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j/GkAAAAASUVORK5CYII=',
    'base64',
  );
  let output = '';
  vi.mocked(renderStep).mockImplementation(async (opts) => {
    output = opts.out;
    await writeFile(opts.out, png);
    return {
      path: opts.out,
      sceneId: 'scene_a_members',
      position: 0,
      elements: [
        {
          id: 'btn_invite',
          type: 'Button',
          label: '邀请成员',
          visible: true,
          disabled: false,
          box: { x: 1, y: 2, width: 40, height: 20 },
        },
      ],
      warnings: [],
    };
  });
  const r = await renderImage(d, {
    scenarioId: 'sc_a_success',
    optionId: 'opt_a',
    theme: 'clean',
    viewport: { width: 800, height: 600 },
  });
  expect(Buffer.from(r.image, 'base64')).toEqual(png);
  expect(r.result.data!.elements[0]!.id).toBe('btn_invite');
  expect(r.result.artifacts).toEqual([]);
  await expect(access(dirname(output))).rejects.toMatchObject({
    code: 'ENOENT',
  });
  expect(renderStep).toHaveBeenCalledWith(
    expect.objectContaining({
      projectDir: d,
      scenarioId: 'sc_a_success',
      optionId: 'opt_a',
      theme: 'clean',
      viewport: { width: 800, height: 600 },
    }),
  );
});
test('server 错误映射 RENDER_FAILED，serve 参数原样传递', async () => {
  const d = await fixture();
  vi.mocked(renderStep).mockRejectedValue(new Error('截图失败'));
  vi.mocked(startServer).mockRejectedValue(new Error('启动失败'));
  await expect(
    render(d, { scenarioId: 'sc_a_success' }, join(d, 'x.png')),
  ).rejects.toMatchObject({ code: 'RENDER_FAILED' });
  await expect(
    serve({ projectDir: d, port: 4321, open: true }),
  ).rejects.toMatchObject({ code: 'RENDER_FAILED' });
  vi.mocked(startServer).mockResolvedValue({
    url: 'http://127.0.0.1:4321',
    token: 'local-token',
    close: async () => {},
  });
  expect(
    (await serve({ projectDir: d, port: 4321, open: true })).data!.url,
  ).toBe('http://127.0.0.1:4321');
  expect(startServer).toHaveBeenLastCalledWith({
    projectDir: d,
    port: 4321,
    open: true,
  });
});
