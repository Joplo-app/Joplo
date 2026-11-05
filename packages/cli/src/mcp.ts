import { z } from 'zod';
import { realpath } from 'node:fs/promises';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import {
  get,
  GetInput,
  Patch,
  applyPatch,
  readProject,
  validate,
  result,
  JoploError,
} from '@joplo/core';
import {
  DomainOutput,
  GetOutput,
  ApplyOutput,
  ValidateOutput,
  RenderOutput,
  domain,
  failure,
} from './common.ts';
import { RenderInput, renderImage } from './render.ts';
export const ValidateInput = z.strictObject({
  optionId: z.string().min(1).optional(),
  mode: z.enum(['structure', 'replay', 'all']).default('all'),
});
export const ApplyInput = z.strictObject({
  patch: Patch,
  dryRun: z.boolean().optional(),
});
export async function startMcp(projectDir: string) {
  const dir = await realpath(projectDir);
  await readProject(dir);
  const server = new Server(
    { name: 'joplo', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );
  const defs = [
    [
      'joplo_get',
      '读取绑定项目、范围对象、当前选择或 schema',
      GetInput,
      GetOutput,
    ],
    [
      'joplo_apply',
      '原子提交受控变更；不可执行人工确认',
      ApplyInput,
      ApplyOutput,
    ],
    [
      'joplo_validate',
      '检查结构或模拟回放，不证明业务正确',
      ValidateInput,
      ValidateOutput,
    ],
    [
      'joplo_render',
      '返回指定模拟状态的 PNG 和元素索引',
      RenderInput,
      RenderOutput,
    ],
  ] as const;
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: defs.map(([name, description, schema, output]) => ({
      name,
      description,
      inputSchema: { ...z.toJSONSchema(schema), type: 'object' as const },
      outputSchema: { ...z.toJSONSchema(output), type: 'object' as const },
    })),
  }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    let image: string | undefined;
    const r = await domain(async () => {
      switch (name) {
        case 'joplo_get':
          return get(dir, args as z.input<typeof GetInput>);
        case 'joplo_apply': {
          // 内核负责 patch 校验与错误分类，保持 CLI/MCP 一致。
          const a = z
            .strictObject({
              patch: z.unknown(),
              dryRun: z.boolean().optional(),
            })
            .safeParse(args);
          if (!a.success)
            throw new JoploError('INVALID_SCHEMA', 'apply 参数无效', {
              details: a.error.issues,
            });
          return applyPatch(dir, a.data.patch, { dryRun: a.data.dryRun });
        }
        case 'joplo_validate': {
          const a = ValidateInput.safeParse(args);
          if (!a.success)
            throw new JoploError('USAGE', 'validate 参数无效', {
              details: a.error.issues,
            });
          const p = await readProject(dir);
          const report = validate(p, a.data);
          return result(p, '结构与回放校验完成', report, {
            diagnostics: report.diagnostics,
          });
        }
        case 'joplo_render': {
          try {
            const rendered = await renderImage(
              dir,
              args as z.input<typeof RenderInput>,
            );
            image = rendered.image;
            return rendered.result;
          } catch (e) {
            if (e instanceof JoploError) throw e;
            throw new JoploError(
              'RENDER_FAILED',
              e instanceof Error ? e.message : String(e),
            );
          }
        }
        default:
          throw new JoploError('UNSUPPORTED_ACTION', `未知工具：${name}`);
      }
    });
    // JSON 传输清除 undefined，结果在发出前按同一 schema 验证。
    const cleaned = JSON.parse(JSON.stringify(r));
    const output = defs.find(([tool]) => tool === name)?.[3] ?? DomainOutput;
    const checked = output.safeParse(cleaned);
    const payload = checked.success
      ? cleaned
      : failure(new JoploError('INVALID_SCHEMA', '工具返回格式无效'));
    return {
      structuredContent: payload,
      content: [
        {
          type: 'text' as const,
          text: payload.ok
            ? `${payload.summary}（rev_${payload.revision}）`
            : `${payload.error.code}: ${payload.error.message}`,
        },
        ...(image
          ? [{ type: 'image' as const, data: image, mimeType: 'image/png' }]
          : []),
      ],
      ...(!payload.ok ? { isError: true } : {}),
    };
  });
  await server.connect(new StdioServerTransport());
  return server;
}
