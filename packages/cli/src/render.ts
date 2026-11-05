import { z } from 'zod';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderStep, startServer } from '@joplo/server';
import type { ServeOptions } from '@joplo/server';
import { readProject, result, JoploError } from '@joplo/core';
export const RenderInput = z.strictObject({
  optionId: z.string().min(1).optional(),
  scenarioId: z.string().min(1),
  stepId: z.string().min(1).optional(),
  theme: z.enum(['sketch', 'clean']).optional(),
  viewport: z
    .object({
      width: z.number().int().positive().max(8192),
      height: z.number().int().positive().max(8192),
    })
    .optional(),
});
export async function render(
  dir: string,
  raw: z.input<typeof RenderInput>,
  out: string,
) {
  const parsed = RenderInput.safeParse(raw);
  if (!parsed.success)
    throw new JoploError('USAGE', '渲染参数无效', {
      details: parsed.error.issues,
    });
  const p = await readProject(dir);
  try {
    const rendered = await renderStep({ projectDir: dir, ...parsed.data, out });
    return result(p, '画面已渲染', rendered, {
      artifacts: [
        { kind: 'image', path: rendered.path, mimeType: 'image/png' },
      ],
    });
  } catch (e) {
    throw new JoploError(
      'RENDER_FAILED',
      e instanceof Error ? e.message : String(e),
    );
  }
}
export async function renderImage(
  dir: string,
  raw: z.input<typeof RenderInput>,
) {
  const temp = await mkdtemp(join(tmpdir(), 'joplo-render-'));
  try {
    const r = await render(dir, raw, join(temp, 'frame.png'));
    const image = await readFile(r.data!.path);
    return {
      result: { ...r, artifacts: [], data: { ...r.data!, path: undefined } },
      image: image.toString('base64'),
    };
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
export async function serve(options: ServeOptions) {
  try {
    const p = await readProject(options.projectDir);
    const handle = await startServer(options);
    return result(p, '本地服务已启动', {
      url: handle.url,
      token: handle.token,
    });
  } catch (e) {
    throw new JoploError(
      'RENDER_FAILED',
      e instanceof Error ? e.message : String(e),
    );
  }
}
