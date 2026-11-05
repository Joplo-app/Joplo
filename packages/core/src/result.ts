/** 所有入口共享的领域结果、诊断与错误分类（PRD 12.5）。 */

export const ERROR_CODES = [
  'INVALID_SCHEMA',
  'NOT_FOUND',
  'REVISION_CONFLICT',
  'INVALID_REFERENCE',
  'UNSUPPORTED_ACTION',
  'PLAYBACK_FAILED',
  'RENDER_FAILED',
  'EXPORT_FAILED',
  'UNSUPPORTED_SCHEMA_VERSION',
  'PERMISSION_DENIED',
  'IDEMPOTENCY_MISMATCH',
  'USAGE',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export type Severity = 'error' | 'warning' | 'info';
export type DiagnosticSource = 'schema' | 'reference' | 'structure' | 'replay' | 'render';

export type Diagnostic = {
  severity: Severity;
  /** 稳定的机器可读代码，例如 UNBOUND_INTERACTIVE、MISSING_TARGET。 */
  code: string;
  message: string;
  source: DiagnosticSource;
  /** 定位：对象类别、ID，以及可选的场景/步骤/元素上下文。 */
  ref?: { kind: string; id: string; optionId?: string; scenarioId?: string; stepId?: string; path?: string };
  /** 源文件位置 `相对路径:行:列`，Agent 据此只打开那一处。 */
  at?: string;
};

export class JoploError extends Error {
  readonly code: ErrorCode;
  readonly details: unknown;
  readonly diagnostics: Diagnostic[];
  constructor(code: ErrorCode, message: string, opts: { details?: unknown; diagnostics?: Diagnostic[] } = {}) {
    super(message);
    this.name = 'JoploError';
    this.code = code;
    this.details = opts.details;
    this.diagnostics = opts.diagnostics ?? [];
  }
}

export type DomainResult<T = unknown> = {
  ok: true;
  projectId: string;
  revision: number;
  requestId: string;
  summary: string;
  changedIds: string[];
  diagnostics: Diagnostic[];
  artifacts: { kind: string; path?: string; mimeType?: string; description?: string }[];
  data?: T;
};

export type DomainFailure = {
  ok: false;
  requestId: string;
  error: { code: ErrorCode; message: string; details?: unknown };
  diagnostics: Diagnostic[];
};
