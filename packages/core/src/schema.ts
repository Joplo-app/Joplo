import { LegacyTraceSchema } from './plugins/legacy.ts';
/**
 * Joplo IR（schemaVersion 2）：由 TSX 源文件编译得到的中间表示，不是作者直接编辑的格式。
 * 权威源是项目文件夹里的 TSX/TS 文件（ADR-0002）；渲染器、播放器、校验器、构建只消费这里的 IR。
 *
 * 带 `source` 的对象记录其来源 `相对路径:行:列`，用于选中元素、诊断定位，让 Agent 只读写那一处。
 */
import { z } from 'zod';
import { COMPONENT_TYPES, PLUGIN_TYPE, type PluginComponentType } from './catalog.ts';

/** 层级标签的预设图标（标签压窄时靠它认出是哪一层）。不写时：手机视口 mobile，其余 window。 */
export const LAYER_ICONS = ['window', 'browser', 'mobile', 'desktop', 'terminal', 'chat', 'agent', 'server', 'data', 'email', 'doc', 'flow'] as const;
export type LayerIcon = (typeof LAYER_ICONS)[number];

const DataPath = z.array(z.string().min(1));
const ScopeRule: z.ZodType<import('@joplo-app/kit/plugin').PluginScopeRule> = z.lazy(() => z.strictObject({
  path: DataPath, kind: z.enum(['map', 'items', 'values', 'reference']), domain: z.enum(['element', 'scene']).optional(),
  prefix: z.string().optional(), references: z.array(DataPath).optional(), children: z.array(ScopeRule).optional(),
}));
const SlotSpec = z.strictObject({ text: z.array(DataPath).optional(), scope: z.union([z.literal('global'), z.array(ScopeRule)]).optional() });
const DataSpec = z.strictObject({ node: SlotSpec.optional(), step: SlotSpec.optional() });

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
// ---------- 画面与元素 ----------
export type SceneNode = {
  /** 可操作元素必须由作者给出；其余由编译器按位置生成（以 `_` 开头）。 */
  id: string;
  /** 目录组件，或插件组件 `<插件 id>:<组件名>`（D86）。 */
  type: string;
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
  /** 命名空间插件派生数据；只允许 JSON。 */
  ext?: Record<string, unknown>;
  /** 取景关联由编译钩子给出，播放器只读取。 */
  framing?: { include?: string[]; kind?: 'root' | 'group' | 'block' | 'content' | 'edge' | 'row' };
  source?: string;
};

export const SceneNode: z.ZodType<SceneNode> = z.lazy(() =>
  z.strictObject({
    id: z.string().min(1),
    type: z.union([z.enum(COMPONENT_TYPES), z.string().regex(PLUGIN_TYPE) as unknown as z.ZodType<PluginComponentType>]),
    props: z.record(z.string(), Json).optional(),
    children: z.array(SceneNode).optional(),
    when: Condition.optional(),
    disabled: z.union([z.boolean(), Condition]).optional(),
    disabledReason: z.string().optional(),
    unmodeled: z.boolean().optional(),
    note: z.string().optional(),
    redact: z.union([z.boolean(), Condition]).optional(),
    from: z.string().optional(),
    ext: z.record(z.string(), Json).optional(),
    framing: z.strictObject({ include: z.array(z.string()).optional(), kind: z.enum(['root', 'group', 'block', 'content', 'edge', 'row']).optional() }).optional(),
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

export const MediaSnapshot = z.record(z.string(), z.strictObject({
  plugin: z.string().min(1), resource: z.string().min(1), offsetMs: z.number().nonnegative(),
  volume: z.number().min(0).max(1), loop: z.boolean(), fadeInMs: z.number().nonnegative(), stopAfterMs: z.number().nonnegative().optional(),
}));

export const Step = z.strictObject({
  media: MediaSnapshot.optional(),
  /** 历史 IR 兼容输入；当前编译器不生成。 */
  traces: z.array(LegacyTraceSchema).optional(),
  id: Qid,
  /** Author identity, unique within a scenario. id remains the legacy playback address. */
  key: Id.optional(),
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
  /** 插件效果降级后的逐步快照。 */
  ext: z.record(z.string(), Json).optional(),
  /** 插件效果贡献的显式焦点与引用（scope 校验）。 */
  focusTargets: z.array(z.string()).optional(),
  references: z.array(z.string()).optional(),
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
  media: MediaSnapshot.optional(),
  ext: z.record(z.string(), Json).optional(),
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
    /** 起始导演层（flow({ layer })，或 flow({ from }) 接力时那个场景结尾的导演层）；缺省为第一层。 */
    layer: z.string().optional(),
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

/** 作者内容多语言（D84）：default 是原文的语言，locales 第一个就是它。 */
export const ContentI18nSchema = z.strictObject({
  default: z.string().min(1),
  locales: z.array(z.string().min(1)).min(1),
  /** 语言 → 原文 → 译文（不含空译文）。 */
  messages: z.record(z.string(), z.record(z.string(), z.string().min(1))).default({}),
  /** 每种语言里原文改过、旧译文还在的条数（看板菜单显示“过期”）；只在 dev IR。 */
  stale: z.record(z.string(), z.number().int().nonnegative()).optional(),
});

/** 朗读配置（D74，来自 config({ voice })）：只在 dev / review IR 里，发布站去掉。locales（D84）：按内容语言覆盖旁白与角色的音色。 */
const VoiceVoices = z.strictObject({
  narrator: z.string().min(1).optional(),
  roles: z.record(z.string(), z.string().min(1)).optional(),
});
export const VoiceConfig = z.strictObject({
  profile: z.string().min(1).optional(),
  narrator: z.string().min(1).optional(),
  roles: z.record(z.string(), z.string().min(1)).optional(),
  locales: z.record(z.string(), VoiceVoices).optional(),
});
/**
 * 发布站带上的朗读音频（D74，joplo build 写入）：voices 是每个声音的指纹（旁白与各角色），
 * clips 的键是 clipKey(指纹, 朗读文字)，值是相对站点根目录的音频路径。没有时观众端用浏览器朗读。
 */
export const VoiceIndex = z.strictObject({
  narrator: z.string().min(1).nullable(),
  roles: z.record(z.string(), z.string().min(1)).default({}),
  clips: z.record(z.string(), z.string().min(1)).default({}),
  /** 混合来源更新：clipKey(角色 id 或空串, 文字) → 实际声音指纹；音频键仍使用真实指纹。 */
  overrides: z.record(z.string(), z.string().min(1)).optional(),
  /** 内容语言（D84）→ 这种语言的旁白与角色指纹；没有的语言用上面的默认声音。 */
  locales: z.record(z.string(), z.strictObject({ narrator: z.string().min(1).nullable(), roles: z.record(z.string(), z.string().min(1)).default({}), overrides: z.record(z.string(), z.string().min(1)).optional() })).optional(),
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
  mediaAssets: z.record(z.string(), z.string()).optional(),
  /** 作者内容多语言（D84）：只有 config 写了 locales 才有。messages 只含非默认语言、这份 IR 用得到的译文；stale 只在 dev IR。 */
  i18n: ContentI18nSchema.optional(),
  /** 启用的插件（D86）：插件 id → 名称、版本与组件声明（可操作、父组件）。运行时代码不在 IR 里，由看板 / 发布站另外载入。 */
  plugins: z.record(z.string(), z.strictObject({
    themes: z.record(z.string(), z.string()).optional(),
    properties: z.record(z.string(), z.strictObject({ type: z.enum(['string', 'number', 'boolean']), attribute: z.string().regex(/^data-jp-[a-z0-9-]+$/).optional(), min: z.number().optional(), max: z.number().optional(), nonempty: z.boolean().optional() })).optional(),
    data: DataSpec.optional(),
    id: z.string().min(1),
    title: z.string(),
    version: z.string().optional(),
    components: z.record(z.string(), z.strictObject({ interactive: z.boolean().optional(), parent: z.string().optional(), needsId: z.boolean().optional(), selfEvident: z.boolean().optional() })),
  })).optional(),
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
export type Shot = z.infer<typeof Shot>;

export type Fork = z.infer<typeof Fork>;
export type Mark = z.infer<typeof Mark>;
export type Cue = z.infer<typeof Cue>;
export type Callout = z.infer<typeof Callout>;
export type VoiceConfig = z.infer<typeof VoiceConfig>;
export type VoiceIndex = z.infer<typeof VoiceIndex>;
export type ContentI18nIR = z.infer<typeof ContentI18nSchema>;
