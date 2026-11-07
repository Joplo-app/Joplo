/**
 * Joplo IR（schemaVersion 2）：由 TSX 源文件编译得到的中间表示，不是作者直接编辑的格式。
 * 权威源是项目文件夹里的 TSX/TS 文件（ADR-0002）；渲染器、播放器、校验器、构建只消费这里的 IR。
 *
 * 带 `source` 的对象记录其来源 `相对路径:行:列`，用于选中元素、诊断定位，让 Agent 只读写那一处。
 */
import { z } from 'zod';
import { COMPONENT_TYPES } from './catalog.ts';
import type { DiagramLayout as DiagramLayoutT } from './diagram/model.ts';

/** 层级标签的预设图标（标签压窄时靠它认出是哪一层）。不写时：手机视口 mobile，其余 window。 */
export const LAYER_ICONS = ['window', 'browser', 'mobile', 'desktop', 'terminal', 'chat', 'agent', 'server', 'data', 'email', 'doc', 'flow'] as const;
export type LayerIcon = (typeof LAYER_ICONS)[number];

export const SCHEMA_VERSION = 2 as const;

/** 作者可写的 ID（对象键、元素 id）。 */
export const Id = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/, 'ID must start with a letter and contain only letters, digits, underscores, and hyphens');
/** 编译器生成的限定 ID，例如 `invite.happy`、`invite.a-modal@/members`。 */
export const Qid = z.string().min(1).max(256);
export const Source = z.string().optional();

const Json: z.ZodType<unknown> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(Json), z.record(z.string(), Json)]),
);

// ---------- 受控条件 ----------
export const StatePath = z.string().regex(/^(ui|data|inputs)(\.[A-Za-z0-9_-]+)*$/, 'Path root must be ui, data, or inputs');

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

// ---------- 图表布局（D69）：编译期算好，渲染器只读 ----------
const Num = z.number().finite();
const BoxS = z.strictObject({ x: Num, y: Num, w: Num, h: Num });
const PointS = z.strictObject({ x: Num, y: Num });
const Boxes = z.record(z.string(), BoxS);
export const DiagramLayoutSchema: z.ZodType<DiagramLayoutT> = z.union([
  z.strictObject({
    kind: z.literal('graph'),
    engine: z.enum(['elk', 'grid']),
    direction: z.enum(['right', 'down']).optional(),
    width: Num,
    height: Num,
    nodes: Boxes,
    groups: Boxes,
    titles: Boxes,
    edges: z.record(z.string(), z.strictObject({ points: z.array(PointS), label: BoxS.nullable() })),
    starts: Boxes.optional(),
  }),
  z.strictObject({
    kind: z.literal('sequence'),
    width: Num,
    height: Num,
    actors: Boxes,
    lifelines: z.record(z.string(), z.strictObject({ x: Num, y1: Num, y2: Num })),
    messages: z.record(z.string(), z.strictObject({ points: z.array(PointS), label: BoxS.nullable(), n: z.number().int(), self: z.boolean() })),
    groups: Boxes,
    titles: Boxes,
    blocks: Boxes,
    blockTitles: Boxes,
  }),
]) as z.ZodType<DiagramLayoutT>;

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
  /** 敏感信息（D70）：内容模糊显示；可以是条件（为真时模糊）。演示内容，发布站保留。 */
  redact?: boolean | Condition;
  /** 来自哪个功能方案（堆叠到路径上的元素）；页面和布局自身的元素没有此字段。 */
  from?: string;
  /** 图表根节点（Diagram / StateMachine / Sequence）的布局，编译期算好（D69）；其他节点没有。 */
  layout?: DiagramLayoutT;
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
    redact: z.union([z.boolean(), Condition]).optional(),
    from: z.string().optional(),
    layout: DiagramLayoutSchema.optional(),
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
  /** 路径经过的分组（节点所在的各级分组，D69）：fail 时 errorGroups 是终点所在的分组。没有分组时省略（IR 与旧版相同）。 */
  groups: z.array(z.string().min(1)).optional(),
  errorGroups: z.array(z.string().min(1)).optional(),
  /** 镜头目标：架构图 / 状态机是路径上的节点，时序图是消息（一行一行的）。旧 IR 没有，按 nodes 处理。 */
  targets: z.array(z.string().min(1)).optional(),
});

/** 镜头（D43）：这一步在某个层级里对准哪些元素；targets 为空 = 这一层的整体。 */
export const Shot = z.strictObject({ layer: z.string().min(1), targets: z.array(z.string().min(1)) });

export const Fork = z.strictObject({ label: z.string().min(1), scenarioId: Qid, at: z.number().int().nonnegative() });
export const Mark = z.strictObject({ target: z.string().min(1), kind: z.enum(['circle', 'underline', 'box', 'arrow']), note: z.string().min(1).optional() });

/**
 * 焦点提示（D70）：这一步的强调形式，只作用于这一步。spotlight = 只照亮这些元素、其余压暗；highlight = 强调框并脉冲一次；
 * number = 按 targets 的顺序标 1、2、3。都不推近镜头（目标不在当前镜头里时，编译器给这一步补一个整层镜头）。
 */
export const CUE_KINDS = ['spotlight', 'highlight', 'number'] as const;
export const Cue = z.strictObject({ kind: z.enum(CUE_KINDS), targets: z.array(z.string().min(1)).min(1) });
/** 标注气泡（D70）：指向元素的一句话；side 不写时由渲染器选放得下的一侧。 */
export const CALLOUT_SIDES = ['top', 'right', 'bottom', 'left'] as const;
export const Callout = z.strictObject({ target: z.string().min(1), text: z.string().min(1), side: z.enum(CALLOUT_SIDES).optional() });

export const Step = z.strictObject({
  id: Qid,
  kind: z.enum(['user', 'system', 'card']),
  action: Action,
  caption: z.string().min(1),
  /** Generated caption metadata; caption remains the English fallback for tools. */
  captionAuto: z.strictObject({
    kind: z.enum(['click', 'type', 'select', 'check', 'uncheck', 'switch_on', 'switch_off', 'back', 'press']),
    label: z.string(),
    value: z.string().optional(),
    keys: z.string().optional(),
  }).optional(),
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
  /** 本步的焦点提示（D70，来自 spotlight / highlight / numbered）；没有时省略。演示内容，发布站保留。 */
  cues: z.array(Cue).optional(),
  /** 本步的标注气泡（D70，来自 callout）；没有时省略。 */
  callouts: z.array(Callout).optional(),
  /** 自动播放时这一步至少停留的毫秒数（D70，来自 hold；未按速度缩放）；没有时省略。 */
  hold: z.number().int().positive().max(30_000).optional(),
  /** 角色台词（D74，来自 say()，多个按空格连接）：用这一步角色的声音读；没有时省略。发布站保留。 */
  say: z.string().min(1).optional(),
  /** 旁白（D74，来自 narrate()）：用旁白的声音读，优先于台词和字幕；没有时省略。发布站保留。 */
  narrate: z.string().min(1).optional(),
  source: Source,
});

export const Scenario = z.strictObject({
  id: Qid,
  optionId: Qid,
  name: z.string().min(1),
  description: z.string().default(''),
  caseIds: z.array(Qid).default([]),
  mock: z.strictObject({ label: z.string().min(1), outcome: z.enum(['success', 'failure', 'denied', 'other']), auto: z.literal(true).optional() }),
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
  /** icon：作者显式选的预设图标（层级标签用）；不写时由 layersOf 按视口补默认。 */
  layers: z.record(Id, z.strictObject({ title: z.string().min(1), sceneId: Qid, role: Id.optional(), icon: z.enum(LAYER_ICONS).optional() })).default({}),
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

/** 朗读配置（D74，来自 config({ voice })）：只在 dev / review IR 里，发布站去掉。 */
export const VoiceConfig = z.strictObject({
  profile: z.string().min(1).optional(),
  narrator: z.string().min(1).optional(),
  roles: z.record(z.string(), z.string().min(1)).optional(),
});
/**
 * 发布站带上的朗读音频（D74，joplo build 写入）：voices 是每个声音的指纹（旁白与各角色），
 * clips 的键是 clipKey(指纹, 朗读文字)，值是相对站点根目录的音频路径。没有时观众端用浏览器朗读。
 */
export const VoiceIndex = z.strictObject({
  narrator: z.string().min(1).nullable(),
  roles: z.record(z.string(), z.string().min(1)).default({}),
  clips: z.record(z.string(), z.string().min(1)).default({}),
});

export const Project = z.strictObject({
  schemaVersion: z.literal(SCHEMA_VERSION),
  name: z.string().min(1),
  description: z.string().default(''),
  /** 默认主题名（D51）：内置主题或 themes 里的作者主题。 */
  theme: z.string().min(1).default('sketch'),
  /** 默认焦点行为（D70）：缺省 = 开启；false = 只按作者写的镜头与提示呈现（config({ autoFocus: false })）。发布站保留。 */
  autoFocus: z.boolean().optional(),
  voiceConfig: VoiceConfig.optional(),
  voiceIndex: VoiceIndex.optional(),
  /** 作者主题（D51）：主题名 → CSS 原文（themes/<name>.css）；渲染时自动限定在舞台范围内。发布站同样打包。 */
  themes: z.record(z.string(), z.string()).default({}),
  /** dev = 含全部方案（本地看板）；publish = 只含选定方案，且去掉创作侧信息（D33）；review = 评审版：全部方案，同样去掉创作侧信息（D63）。 */
  mode: z.enum(['dev', 'publish', 'review']),
  routes: z.record(z.string(), Route).default({}),
  features: z.record(Id, Feature).default({}),
  /** 编译器决定的演示顺序，发布时保留。旧 IR 可省略，读取时沿用其已有顺序。 */
  featureIds: z.array(Id).optional(),
  cases: z.record(Qid, Case).default({}),
  options: z.record(Qid, Option).default({}),
  rules: z.record(Qid, Rule).default({}),
  scenes: z.record(Qid, Scene).default({}),
  scenarios: z.record(Qid, Scenario).default({}),
  issues: z.record(Qid, Issue).default({}),
}).superRefine((p, ctx) => {
  if (!p.featureIds) return;
  const ids = new Set(p.featureIds);
  if (ids.size !== p.featureIds.length || ids.size !== Object.keys(p.features).length || p.featureIds.some(id => !p.features[id]))
    ctx.addIssue({ code: 'custom', path: ['featureIds'], message: 'featureIds must list every feature exactly once' });
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
export type Cue = z.infer<typeof Cue>;
export type Callout = z.infer<typeof Callout>;
export type VoiceConfig = z.infer<typeof VoiceConfig>;
export type VoiceIndex = z.infer<typeof VoiceIndex>;
