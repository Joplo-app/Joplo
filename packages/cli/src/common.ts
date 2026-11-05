import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ERROR_CODES, JoploError } from '@joplo/core';
import type { DomainFailure, DomainResult } from '@joplo/core';
export function failure(e: unknown): DomainFailure {
  const systemCode = (e as NodeJS.ErrnoException | null)?.code;
  const message = e instanceof Error ? e.message : String(e);
  const error =
    e instanceof JoploError
      ? e
      : ['ENOENT', 'ENOTDIR'].includes(systemCode ?? '')
        ? new JoploError('NOT_FOUND', message)
        : ['EACCES', 'EPERM'].includes(systemCode ?? '')
          ? new JoploError('PERMISSION_DENIED', message)
          : systemCode === 'ELOCKED'
            ? new JoploError('REVISION_CONFLICT', message, {
                details: { reason: 'LOCK_BUSY' },
              })
            : e instanceof SyntaxError || e instanceof z.ZodError
              ? new JoploError('INVALID_SCHEMA', message)
              : new JoploError('UNSUPPORTED_ACTION', message, {
                  details: {
                    reason: 'INTERNAL_ERROR',
                    ...(systemCode ? { systemCode } : {}),
                  },
                });
  return {
    ok: false,
    requestId: randomUUID(),
    error: {
      code: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    },
    diagnostics: error.diagnostics,
  };
}
export async function domain(
  run: () => Promise<DomainResult> | DomainResult,
): Promise<DomainResult | DomainFailure> {
  try {
    return await run();
  } catch (e) {
    return failure(e);
  }
}
const ref = z.object({
  kind: z.string(),
  id: z.string(),
  optionId: z.string().optional(),
  scenarioId: z.string().optional(),
  stepId: z.string().optional(),
  path: z.string().optional(),
});
const diagnostic = z.object({
  severity: z.enum(['error', 'warning', 'info']),
  code: z.string(),
  message: z.string(),
  source: z.enum(['schema', 'reference', 'structure', 'replay', 'render']),
  ref: ref.optional(),
});
export const DomainOutput = z.union([
  z.object({
    ok: z.literal(true),
    projectId: z.string(),
    revision: z.number().int().nonnegative(),
    requestId: z.string(),
    summary: z.string(),
    changedIds: z.array(z.string()),
    diagnostics: z.array(diagnostic),
    artifacts: z.array(
      z.object({
        kind: z.string(),
        path: z.string().optional(),
        mimeType: z.string().optional(),
        description: z.string().optional(),
      }),
    ),
    data: z.json().optional(),
  }),
  z.object({
    ok: z.literal(false),
    requestId: z.string(),
    error: z.object({
      code: z.enum(ERROR_CODES),
      message: z.string(),
      details: z.json().optional(),
    }),
    diagnostics: z.array(diagnostic),
  }),
]);

export function domainOutput(data: z.ZodType) {
  return z.union([
    DomainOutput.options[0].extend({ data }),
    DomainOutput.options[1],
  ]);
}
export const GetOutput = domainOutput(
  z.object({
    content: z.json(),
    pendingQuestions: z.object({
      issues: z.number().int().nonnegative(),
      aiAssumptions: z.number().int().nonnegative(),
    }),
  }),
);
export const ApplyOutput = domainOutput(
  z.object({
    dryRun: z.boolean(),
    replayedReceipt: z.boolean().optional(),
    unchanged: z.boolean().optional(),
  }),
);
export const ValidateOutput = domainOutput(
  z.object({
    diagnostics: z.array(diagnostic),
    summary: z.object({
      error: z.number().int().nonnegative(),
      warning: z.number().int().nonnegative(),
      info: z.number().int().nonnegative(),
    }),
    verification: z.record(
      z.string(),
      z.enum(['unchecked', 'structure_ok', 'replay_ok']),
    ),
  }),
);
export const RenderOutput = domainOutput(
  z.object({
    sceneId: z.string(),
    position: z.number().int().nonnegative(),
    elements: z.array(
      z.object({
        id: z.string(),
        type: z.string(),
        label: z.string(),
        visible: z.boolean(),
        disabled: z.boolean(),
        box: z.object({
          x: z.number(),
          y: z.number(),
          width: z.number(),
          height: z.number(),
        }),
      }),
    ),
    warnings: z.array(z.string()),
  }),
);
