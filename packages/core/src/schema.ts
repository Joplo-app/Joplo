/**
 * Joplo 项目格式（schemaVersion 1）。这是所有入口（CLI、MCP、浏览器）共享的唯一契约。
 * project.joplo.json 是唯一权威源；对象以 id 为键归一化存放。
 */
import { z } from 'zod';
import { COMPONENT_TYPES } from './catalog.ts';

export const SCHEMA_VERSION = 1 as const;

export const Id = z
  .string()
  .regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/, 'ID 只能包含字母、数字、下划线和连字符，并以字母开头');

/** 元素引用：`<sceneId>#<nodeId>` */
export const ElementRef = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]*#[A-Za-z][A-Za-z0-9_-]*$/);

const Json: z.ZodType<unknown> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(Json), z.record(z.string(), Json)]),
);

// ---------- 受控条件（不允许任意表达式） ----------
/** 状态路径，根只能是 ui / data / inputs，例如 `ui.inviteOpen`、`inputs.in_email`。 */
export const StatePath = z.string().regex(/^(ui|data|inputs)(\.[A-Za-z0-9_-]+)*$/, '路径根必须是 ui、data 或 inputs');

export type Condition =
  | { truthy: string }
  | { falsy: string }
  | { empty: string }
  | { notEmpty: string }
  | { eq: [string, unknown] }
  | { neq: [string, unknown] }
  | { in: [string, unknown[]] }
  | { and: Condition[] }
  | { or: Condition[] }
  | { not: Condition };

export const Condition: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    z.strictObject({ truthy: StatePath }),
    z.strictObject({ falsy: StatePath }),
    z.strictObject({ empty: StatePath }),
    z.strictObject({ notEmpty: StatePath }),
    z.strictObject({ eq: z.tuple([StatePath, Json]) }),
    z.strictObject({ neq: z.tuple([StatePath, Json]) }),
    z.strictObject({ in: z.tuple([StatePath, z.array(Json)]) }),
    z.strictObject({ and: z.array(Condition) }),
    z.strictObject({ or: z.array(Condition) }),
    z.strictObject({ not: Condition }),
  ]),
) as z.ZodType<Condition>;

// ---------- 画面与元素 ----------
export type SceneNode = {
  id: string;
  type: (typeof COMPONENT_TYPES)[number];
  /** 属性值可以是字面量，或 `$ui.x` / `$data.x` / `$inputs.x` 形式的整值绑定。 */
  props?: Record<string, unknown>;
  children?: SceneNode[];
  /** 可见条件；缺省为可见。 */
  when?: Condition;
  /** 禁用：布尔或条件。禁用时必须给 disabledReason。 */
  disabled?: boolean | Condition;
  disabledReason?: string;
  /** 明确标记“当前演示未建模”的可操作元素。 */
  unmodeled?: boolean;
  /** 给人看的设计说明。 */
  note?: string;
};

export const SceneNode: z.ZodType<SceneNode> = z.lazy(() =>
  z.strictObject({
    id: Id,
    type: z.enum(COMPONENT_TYPES),
    props: z.record(z.string(), Json).optional(),
    children: z.array(SceneNode).optional(),
    when: Condition.optional(),
    disabled: z.union([z.boolean(), Condition]).optional(),
    disabledReason: z.string().optional(),
    unmodeled: z.boolean().optional(),
    note: z.string().optional(),
  }),
) as z.ZodType<SceneNode>;

export const Scene = z.strictObject({
  id: Id,
  optionId: Id,
  name: z.string().min(1),
  /** current = 已有产品的“现状”页面；proposed = 本方案的设计。 */
  kind: z.enum(['current', 'proposed']).default('proposed'),
  viewport: z.enum(['desktop', 'mobile']).default('desktop'),
  root: SceneNode,
});

// ---------- 步骤与场景 ----------
export const Action = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('click'), target: Id }),
  z.strictObject({ type: z.literal('type'), target: Id, value: z.string() }),
  z.strictObject({ type: z.literal('select'), target: Id, value: z.string() }),
  z.strictObject({ type: z.literal('toggle'), target: Id, value: z.boolean() }),
  z.strictObject({ type: z.literal('back') }),
  /** 预定义的系统事件，例如“请求返回失败”；不需要目标元素。 */
  z.strictObject({ type: z.literal('event'), name: z.string().min(1) }),
]);

export const Effect = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('set'), path: StatePath, value: Json }),
  z.strictObject({ type: z.literal('append'), path: StatePath, value: Json }),
  z.strictObject({ type: z.literal('toast'), text: z.string().min(1), tone: z.enum(['success', 'error', 'info']).default('info') }),
  z.strictObject({ type: z.literal('navigate'), sceneId: Id }),
  z.strictObject({ type: z.literal('complete'), text: z.string().min(1), outcome: z.enum(['success', 'failure', 'cancelled']) }),
]);

export const Step = z.strictObject({
  id: Id,
  /** user = 用户动作；system = 系统事件（如请求返回）。用于分别计数。 */
  kind: z.enum(['user', 'system']),
  action: Action,
  /** 步骤字幕：说明这一步发生了什么。 */
  caption: z.string().min(1),
  effects: z.array(Effect).default([]),
  ruleIds: z.array(Id).default([]),
});

export const Scenario = z.strictObject({
  id: Id,
  optionId: Id,
  name: z.string().min(1),
  description: z.string().default(''),
  caseIds: z.array(Id).default([]),
  /** 模拟结果标签，界面上会明确显示“模拟成功 / 模拟失败”等。 */
  mock: z.strictObject({ label: z.string().min(1), outcome: z.enum(['success', 'failure', 'denied', 'other']) }),
  initial: z.strictObject({
    sceneId: Id,
    ui: z.record(z.string(), Json).default({}),
    data: z.record(z.string(), Json).default({}),
    inputs: z.record(z.string(), Json).default({}),
  }),
  steps: z.array(Step).default([]),
  expected: z.string().default(''),
});

// ---------- 功能设计 ----------
export const CASE_DIMENSIONS = ['main', 'input', 'permission', 'lifecycle', 'async', 'interrupt', 'conflict', 'consistency'] as const;

export const Feature = z.strictObject({
  id: Id,
  name: z.string().min(1),
  goal: z.string().min(1),
  roles: z.array(z.string()).default([]),
  constraints: z.array(z.strictObject({ id: Id, text: z.string().min(1), hard: z.boolean().default(false) })).default([]),
  caseIds: z.array(Id).default([]),
  optionIds: z.array(Id).default([]),
  /** 依赖的其他功能（产品地图连线）。 */
  dependsOn: z.array(Id).default([]),
});

export const Case = z.strictObject({
  id: Id,
  featureId: Id,
  title: z.string().min(1),
  dimension: z.enum(CASE_DIMENSIONS),
  expected: z.string().default(''),
  priority: z.enum(['high', 'medium', 'low']).default('medium'),
});

export const COVERAGE_STATUSES = ['expressed', 'undecided', 'missing', 'not_applicable', 'excluded'] as const;
export const Coverage = z.strictObject({
  status: z.enum(COVERAGE_STATUSES),
  scenarioIds: z.array(Id).default([]),
  reason: z.string().optional(),
});

export const Option = z.strictObject({
  id: Id,
  featureId: Id,
  name: z.string().min(1),
  /** 核心思路 */
  idea: z.string().min(1),
  /** 这个方案主要改变了哪项设计决策（入口、步骤组织、权限方式……） */
  decisionFocus: z.string().default(''),
  tradeoffs: z.array(z.string()).default([]),
  derivedFrom: z.array(Id).default([]),
  archived: z.boolean().default(false),
  coverage: z.record(Id, Coverage).default({}),
});

export const RULE_ORIGINS = ['user', 'project_material', 'ai_assumption', 'code_observed', 'feedback'] as const;
export const RULE_CONFIRMATIONS = ['pending', 'confirmed', 'conflict', 'out_of_scope'] as const;

export const Rule = z.strictObject({
  id: Id,
  featureId: Id,
  /** 缺省表示功能级共享规则。 */
  optionId: Id.optional(),
  text: z.string().min(1),
  origin: z.enum(RULE_ORIGINS),
  confirmation: z.enum(RULE_CONFIRMATIONS).default('pending'),
  caseIds: z.array(Id).default([]),
  elementRefs: z.array(ElementRef).default([]),
  stepIds: z.array(Id).default([]),
});

// ---------- 反馈、问题、决策 ----------
export const CommentTarget = z.strictObject({
  kind: z.enum(['feature', 'option', 'case', 'scene', 'scenario', 'step', 'element']),
  /** element 用 `<sceneId>#<nodeId>`，其余用对象 ID。 */
  id: z.string().min(1),
  optionId: Id.optional(),
  scenarioId: Id.optional(),
  stepId: Id.optional(),
});

export const Comment = z.strictObject({
  id: Id,
  target: CommentTarget,
  text: z.string().min(1),
  author: z.enum(['user', 'agent']),
  status: z.enum(['open', 'in_progress', 'awaiting_user', 'resolved']).default('open'),
  /** 评论创建时的项目修订号。 */
  revision: z.number().int().nonnegative(),
  createdAt: z.string(),
  replies: z.array(z.strictObject({ author: z.enum(['user', 'agent']), text: z.string().min(1), at: z.string() })).default([]),
});

export const Issue = z.strictObject({
  id: Id,
  featureId: Id,
  optionId: Id.optional(),
  text: z.string().min(1),
  severity: z.enum(['blocker', 'major', 'minor']),
  source: z.enum(['ai', 'user', 'validator']),
  status: z.enum(['open', 'resolved', 'accepted']).default('open'),
  refs: z.array(z.string()).default([]),
});

/** 只能由本地 UI 的人工确认产生；受控写入接口不能创建。 */
export const Decision = z.strictObject({
  id: Id,
  featureId: Id,
  optionId: Id,
  revision: z.number().int().nonnegative(),
  rationale: z.string().default(''),
  acceptedExceptions: z.array(z.string()).default([]),
  confirmedBy: z.string().min(1),
  confirmedAt: z.string(),
});

// ---------- 项目 ----------
export const Project = z.strictObject({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: Id,
  name: z.string().min(1),
  description: z.string().default(''),
  revision: z.number().int().nonnegative(),
  updatedAt: z.string(),
  features: z.record(Id, Feature).default({}),
  cases: z.record(Id, Case).default({}),
  options: z.record(Id, Option).default({}),
  rules: z.record(Id, Rule).default({}),
  scenes: z.record(Id, Scene).default({}),
  scenarios: z.record(Id, Scenario).default({}),
  comments: z.record(Id, Comment).default({}),
  issues: z.record(Id, Issue).default({}),
  decisions: z.record(Id, Decision).default({}),
});

export type Project = z.infer<typeof Project>;
export type Feature = z.infer<typeof Feature>;
export type Case = z.infer<typeof Case>;
export type Option = z.infer<typeof Option>;
export type Coverage = z.infer<typeof Coverage>;
export type Rule = z.infer<typeof Rule>;
export type Scene = z.infer<typeof Scene>;
export type Scenario = z.infer<typeof Scenario>;
export type Step = z.infer<typeof Step>;
export type Action = z.infer<typeof Action>;
export type Effect = z.infer<typeof Effect>;
export type Comment = z.infer<typeof Comment>;
export type Issue = z.infer<typeof Issue>;
export type Decision = z.infer<typeof Decision>;

/** 修订号的人类可读形式。CLI/MCP 同时接受 `rev_12` 与 `12`。 */
export const revisionLabel = (n: number): string => `rev_${n}`;
export function parseRevision(v: string | number): number | null {
  if (typeof v === 'number') return Number.isInteger(v) && v >= 0 ? v : null;
  const m = /^(?:rev_)?(\d+)$/.exec(v.trim());
  return m ? Number(m[1]) : null;
}
