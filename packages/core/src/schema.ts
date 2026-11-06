/**
 * Joplo IR（schemaVersion 2）：由 TSX 源文件编译得到的中间表示，不是作者直接编辑的格式。
 * 权威源是项目文件夹里的 TSX/TS 文件（ADR-0002）；渲染器、播放器、校验器、构建只消费这里的 IR。
 *
 * 带 `source` 的对象记录其来源 `相对路径:行:列`，用于选中元素、诊断定位，让 Agent 只读写那一处。
 */
import { z } from 'zod';
import { COMPONENT_TYPES } from './catalog.ts';

export const SCHEMA_VERSION = 2 as const;

/** 作者可写的 ID（对象键、元素 id）。 */
export const Id = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/, 'ID 只能包含字母、数字、下划线和连字符，并以字母开头');
/** 编译器生成的限定 ID，例如 `invite.happy`、`invite.a-modal@/members`。 */
export const Qid = z.string().min(1).max(256);
export const Source = z.string().optional();

const Json: z.ZodType<unknown> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(Json), z.record(z.string(), Json)]),
);

// ---------- 受控条件 ----------
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
  /** 可操作元素必须由作者给出；其余由编译器按位置生成（以 `_` 开头）。 */
  id: string;
  type: (typeof COMPONENT_TYPES)[number];
  /** Mantine 属性原样保留（可含响应式对象 { base, md }）；值可以是字面量或 `$ui.x` / `$data.x` / `$inputs.x` 整值绑定。 */
  props?: Record<string, unknown>;
  children?: SceneNode[];
  when?: Condition;
  disabled?: boolean | Condition;
  disabledReason?: string;
  unmodeled?: boolean;
  note?: string;
  /** 来自哪个功能方案（堆叠到路径上的元素）；页面和布局自身的元素没有此字段。 */
  from?: string;
  source?: string;
};

export const SceneNode: z.ZodType<SceneNode> = z.lazy(() =>
  z.strictObject({
    id: z.string().min(1),
    type: z.enum(COMPONENT_TYPES),
    props: z.record(z.string(), Json).optional(),
    children: z.array(SceneNode).optional(),
    when: Condition.optional(),
    disabled: z.union([z.boolean(), Condition]).optional(),
    disabledReason: z.string().optional(),
    unmodeled: z.boolean().optional(),
    note: z.string().optional(),
    from: z.string().optional(),
    source: Source,
  }),
) as z.ZodType<SceneNode>;

/** 一个画面 = 某个方案上下文中的一个路径：布局 + 页面 + 堆叠进来的功能元素。 */
export const Scene = z.strictObject({
  id: Qid,
  /** 方案上下文；`null` 表示发布视图（所有功能都取选定方案）。 */
  optionId: Qid.nullable(),
  route: z.string().regex(/^\/[^\s]*$/),
  name: z.string().min(1),
  viewport: z.enum(['desktop', 'mobile']).default('desktop'),
  root: SceneNode,
  /** 层级画面（T-layers）：所属层级的键；路径页面没有。 */
  layer: z.string().optional(),
});

// ---------- 步骤与场景 ----------
export const Action = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('click'), target: Id }),
  z.strictObject({ type: z.literal('type'), target: Id, value: z.string() }),
  z.strictObject({ type: z.literal('select'), target: Id, value: z.string() }),
  z.strictObject({ type: z.literal('toggle'), target: Id, value: z.boolean() }),
  z.strictObject({ type: z.literal('back') }),
  z.strictObject({ type: z.literal('press'), keys: z.string() }),
  z.strictObject({ type: z.literal('event'), name: z.string().min(1) }),
  /** 过渡卡（D56）：整屏一句大字；role = 换到这个人（feature.roles 的键）。 */
  z.strictObject({ type: z.literal('card'), title: z.string().min(1), sub: z.string().min(1).optional(), points: z.array(z.string().min(1)).optional(), role: Id.optional() }),
]);

export const Effect = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('set'), path: StatePath, value: Json }),
  z.strictObject({ type: z.literal('append'), path: StatePath, value: Json }),
  z.strictObject({ type: z.literal('toast'), text: z.string().min(1), tone: z.enum(['success', 'error', 'info']).default('info') }),
  z.strictObject({ type: z.literal('navigate'), sceneId: Qid }),
  z.strictObject({ type: z.literal('complete'), text: z.string().min(1), outcome: z.enum(['success', 'failure', 'cancelled']) }),
  /** 流式输出（D56）：状态上等同 set；播放到这一步时绑定它的文字逐字出现。 */
  z.strictObject({ type: z.literal('stream'), path: StatePath, value: z.string() }),
]);

/**
 * 调用链（D48）：这一步 trace 的一条路径。nodes 按路径顺序；edges 是路径上的连线，reverse = 沿连线的 to→from 方向走。
 * mode：ok = 正常调用（本步 active，之后 ok）；fail = 失败（连线与终点节点 error）；skip = 没被调用（dim）。
 */
export const Trace = z.strictObject({
  mode: z.enum(['ok', 'fail', 'skip']),
  nodes: z.array(z.string().min(1)),
  edges: z.array(z.strictObject({ id: z.string().min(1), reverse: z.boolean().default(false) })),
});

/** 镜头（D43）：这一步在某个层级里对准哪些元素；targets 为空 = 这一层的整体。 */
export const Shot = z.strictObject({ layer: z.string().min(1), targets: z.array(z.string().min(1)) });

export const Fork = z.strictObject({ label: z.string().min(1), scenarioId: Qid, at: z.number().int().nonnegative() });
export const Mark = z.strictObject({ target: z.string().min(1), kind: z.enum(['circle', 'underline', 'box', 'arrow']), note: z.string().min(1).optional() });

export const Step = z.strictObject({
  id: Qid,
  kind: z.enum(['user', 'system', 'card']),
  action: Action,
  caption: z.string().min(1),
  effects: z.array(Effect).default([]),
  ruleIds: z.array(Qid).default([]),
  /** 这一步的镜头（来自 shot()，按层级归类）。没有 shot 的步骤为空，镜头沿用上一步。 */
  shots: z.array(Shot).default([]),
  /** 这一步导演切到哪一层（第一个 shot 决定；没有 shot 的操作步骤取操作目标所在层）；null = 沿用上一步。 */
  directorLayer: z.string().nullable().default(null),
  /** 较长的解说（来自 explain()，多个按换行连接）：字幕区第二行显示（说明下方、小一号）；发布站保留。 */
  explain: z.string().min(1).optional(),
  /** 这一步的调用链（来自 trace()）：Diagram 节点与连线的 state 由 diagramStateAt 从它推算；发布站保留。 */
  traces: z.array(Trace).default([]),
  /** 分叉是演示信息，发布保留；at 在编译时比较动作与业务效果的公共前缀。 */
  forks: z.array(Fork).default([]),
  /** 本步标注，不累积，不参与状态转换。 */
  marks: z.array(Mark).default([]),
  source: Source,
});

export const Scenario = z.strictObject({
  id: Qid,
  optionId: Qid,
  name: z.string().min(1),
  description: z.string().default(''),
  caseIds: z.array(Qid).default([]),
  mock: z.strictObject({ label: z.string().min(1), outcome: z.enum(['success', 'failure', 'denied', 'other']) }),
  initial: z.strictObject({
    sceneId: Qid,
    ui: z.record(z.string(), Json).default({}),
    data: z.record(z.string(), Json).default({}),
    inputs: z.record(z.string(), Json).default({}),
  }),
  steps: z.array(Step).default([]),
  expected: z.string().default(''),
  source: Source,
});

// ---------- 功能设计 ----------
export const CASE_DIMENSIONS = ['main', 'input', 'permission', 'lifecycle', 'async', 'interrupt', 'conflict', 'consistency'] as const;

export const Route = z.strictObject({
  path: z.string().regex(/^\/[^\s]*$/),
  title: z.string().min(1),
  layout: z.string().nullable(),
  /** 由哪个方案新增；缺省表示 routes/ 下的基础页面。 */
  addedBy: Qid.optional(),
  /** 布局与页面中声明的插槽名，供方案堆叠。 */
  slots: z.array(z.string()).default([]),
  source: Source,
});

export const Feature = z.strictObject({
  id: Id,
  name: z.string().min(1),
  goal: z.string().min(1),
  /** 角色（D56）：id 来自 { 键: role('名字') } 写法，可被层级和过渡卡引用；旧的名字数组没有 id。color 已按顺序补齐。 */
  roles: z.array(z.strictObject({ id: Id.optional(), name: z.string().min(1), desc: z.string().default(''), color: z.string().min(1) })).default([]),
  constraints: z.array(z.strictObject({ id: Id, text: z.string().min(1), hard: z.boolean().default(false) })).default([]),
  caseIds: z.array(Qid).default([]),
  optionIds: z.array(Qid).default([]),
  /** 选定的方案；build 只发布它。 */
  pick: Qid.nullable().default(null),
  source: Source,
});

export const Case = z.strictObject({
  id: Qid,
  featureId: Id,
  title: z.string().min(1),
  dimension: z.enum(CASE_DIMENSIONS),
  expected: z.string().default(''),
  priority: z.enum(['high', 'medium', 'low']).default('medium'),
  source: Source,
});

export const COVERAGE_STATUSES = ['expressed', 'undecided', 'missing', 'not_applicable', 'excluded'] as const;
export const Coverage = z.strictObject({
  status: z.enum(COVERAGE_STATUSES),
  scenarioIds: z.array(Qid).default([]),
  reason: z.string().optional(),
  /** derived = 编译器根据场景推导；declared = 作者在源文件中声明。 */
  basis: z.enum(['derived', 'declared']).default('declared'),
});

export const Option = z.strictObject({
  id: Qid,
  featureId: Id,
  /** 文件名，例如 `a-modal`。 */
  key: Id,
  name: z.string().min(1),
  idea: z.string().min(1),
  decisionFocus: z.string().default(''),
  tradeoffs: z.array(z.string()).default([]),
  /** 该方案触及的路径（堆叠或新增）。 */
  routes: z.array(z.string()).default([]),
  coverage: z.record(Qid, Coverage).default({}),
  /** 层级（视角）：键 → 标题与这一层自己的画面（完全独立的页面）。演示信息，发布站保留。 */
  layers: z.record(Id, z.strictObject({ title: z.string().min(1), sceneId: Qid, role: Id.optional() })).default({}),
  source: Source,
});

export const RULE_ORIGINS = ['user', 'project_material', 'ai_assumption', 'code_observed', 'feedback'] as const;
export const RULE_CONFIRMATIONS = ['pending', 'confirmed', 'conflict', 'out_of_scope'] as const;

export const Rule = z.strictObject({
  id: Qid,
  featureId: Id,
  optionId: Qid.optional(),
  text: z.string().min(1),
  origin: z.enum(RULE_ORIGINS),
  confirmation: z.enum(RULE_CONFIRMATIONS).default('pending'),
  caseIds: z.array(Qid).default([]),
  /** 关联的元素 id（在该方案的任意画面中）。 */
  elementIds: z.array(Id).default([]),
  source: Source,
});

/** 待决问题。 */
export const Issue = z.strictObject({
  id: Qid,
  featureId: Id,
  optionId: Qid.optional(),
  text: z.string().min(1),
  severity: z.enum(['blocker', 'major', 'minor']).default('major'),
  refs: z.array(z.string()).default([]),
  source: Source,
});

export const Project = z.strictObject({
  schemaVersion: z.literal(SCHEMA_VERSION),
  name: z.string().min(1),
  description: z.string().default(''),
  /** 默认主题名（D51）：内置主题或 themes 里的作者主题。 */
  theme: z.string().min(1).default('sketch'),
  /** 作者主题（D51）：主题名 → CSS 原文（themes/<name>.css）；渲染时自动限定在舞台范围内。发布站同样打包。 */
  themes: z.record(z.string(), z.string()).default({}),
  /** dev = 含全部方案（本地看板）；publish = 只含选定方案，且去掉创作侧信息（D33）。 */
  mode: z.enum(['dev', 'publish']),
  routes: z.record(z.string(), Route).default({}),
  features: z.record(Id, Feature).default({}),
  cases: z.record(Qid, Case).default({}),
  options: z.record(Qid, Option).default({}),
  rules: z.record(Qid, Rule).default({}),
  scenes: z.record(Qid, Scene).default({}),
  scenarios: z.record(Qid, Scenario).default({}),
  issues: z.record(Qid, Issue).default({}),
});

export type Project = z.infer<typeof Project>;
export type Route = z.infer<typeof Route>;
export type Feature = z.infer<typeof Feature>;
export type Case = z.infer<typeof Case>;
export type Option = z.infer<typeof Option>;
export type Coverage = z.infer<typeof Coverage>;
export type Rule = z.infer<typeof Rule>;
export type Issue = z.infer<typeof Issue>;
export type Scene = z.infer<typeof Scene>;
export type Scenario = z.infer<typeof Scenario>;
export type Step = z.infer<typeof Step>;
export type Action = z.infer<typeof Action>;
export type Effect = z.infer<typeof Effect>;
export type Trace = z.infer<typeof Trace>;
export type Shot = z.infer<typeof Shot>;

export type Fork = z.infer<typeof Fork>;
export type Mark = z.infer<typeof Mark>;
