/**
 * @joplo-app/kit：Agent 创作 Joplo 项目时调用的 SDK。
 *
 *   joplo.config.ts            config({...})
 *   layouts/<id>.tsx           layout(<div>…<Outlet/>…</div>)
 *   routes/<path>/page.tsx     page({ title }, <…/>)        文件夹路径 = 页面路径
 *   features/<f>/feature.ts    feature({ name, goal, cases, rules, pick })
 *   features/<f>/options/<o>.tsx  option({ name, idea, on, routes, state, scenarios })
 *
 * 所有函数只返回数据；画板不会执行这些代码，只消费编译出的 IR。
 */
import { bindPath, callsite, isBind, type Bind, type CondExpr, type JNode } from './node.ts';

export { $, and, empty, eq, Fragment, neq, not, notEmpty, oneOf, or, Outlet, Slot } from './node.ts';
export type { Bind, CondExpr, JNode } from './node.ts';

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
export type StateInit = { ui?: Record<string, Json>; data?: Record<string, Json>; inputs?: Record<string, Json> };

// ---------- 项目、布局、页面 ----------
/** theme：默认主题名——内置主题（sketch、clean、blueprint、nord、dracula、solarized-light、terminal、kraft、contrast）或项目 themes/<name>.css（D51）。 */
export type ConfigDef = { kind: 'config'; name: string; description?: string; theme?: string; layout?: string; home?: string; source?: string };
export const config = (c: Omit<ConfigDef, 'kind' | 'source'>): ConfigDef => ({ kind: 'config', ...c, source: callsite() });

export type LayoutDef = { kind: 'layout'; tree: JNode; source?: string };
export const layout = (tree: JNode): LayoutDef => ({ kind: 'layout', tree, source: callsite() });

export type PageDef = { kind: 'page'; title: string; layout?: string | false; viewport?: 'desktop' | 'mobile'; tree: JNode; source?: string };
export const page = (meta: { title: string; layout?: string | false; viewport?: 'desktop' | 'mobile' }, tree: JNode): PageDef => ({
  kind: 'page',
  ...meta,
  tree,
  source: callsite(),
});

// ---------- 功能设计 ----------
export type Dimension = 'main' | 'input' | 'permission' | 'lifecycle' | 'async' | 'interrupt' | 'conflict' | 'consistency';
export type CaseDef = string | { title: string; dimension?: Dimension; expected?: string; priority?: 'high' | 'medium' | 'low' };
export type Origin = 'user' | 'project_material' | 'ai_assumption' | 'code_observed' | 'feedback';

export type RuleDef = {
  kind: 'rule';
  text: string;
  origin: Origin;
  status: 'pending' | 'confirmed' | 'conflict' | 'out_of_scope';
  cases: string[];
  elements: string[];
  source?: string;
};
/** 规则。默认 origin 为 ai_assumption、status 为 pending：AI 补的规则不能自称已确认。 */
export const rule = (
  text: string,
  opts: { origin?: Origin; status?: RuleDef['status']; cases?: string[]; elements?: string[] } = {},
): RuleDef => ({
  kind: 'rule',
  text,
  origin: opts.origin ?? 'ai_assumption',
  status: opts.status ?? 'pending',
  cases: opts.cases ?? [],
  elements: opts.elements ?? [],
  source: callsite(),
});

export type QuestionDef = { kind: 'question'; text: string; severity: 'blocker' | 'major' | 'minor'; refs: string[]; source?: string };
/** 待决问题。 */
export const question = (text: string, opts: { severity?: QuestionDef['severity']; refs?: string[] } = {}): QuestionDef => ({
  kind: 'question',
  text,
  severity: opts.severity ?? 'major',
  refs: opts.refs ?? [],
  source: callsite(),
});

/**
 * 角色（D56）：故事里的一个人。在 feature.roles 里用键声明，层级用 layer(…, { role: '键' }) 标明这是谁的画面，
 * 过渡卡用 .card('…', { role: '键' }) 切到这个人。color 缺省按声明顺序自动分配。
 *   roles: { xiaoyu: role('小雨', { desc: '发起露营的人' }), ajie: role('阿杰', { desc: '被拉进来的朋友' }) }
 */
export type RoleDef = { kind: 'role'; name: string; desc?: string; color?: string; source?: string };
export const role = (name: string, opts: { desc?: string; color?: string } = {}): RoleDef => ({ kind: 'role', name, ...opts, source: callsite() });

export type FeatureDef = {
  kind: 'feature';
  name: string;
  goal: string;
  /** 角色：旧写法是名字数组（只作说明）；写成 { 键: role('名字') } 才能被层级和过渡卡引用。 */
  roles?: string[] | Record<string, RoleDef>;
  constraints?: Record<string, string | { text: string; hard?: boolean }>;
  cases: Record<string, CaseDef>;
  rules?: Record<string, RuleDef>;
  questions?: Record<string, QuestionDef>;
  /** 选定的方案（options/ 下的文件名）；build 只发布它。 */
  pick?: string | null;
  source?: string;
};
export const feature = (f: Omit<FeatureDef, 'kind' | 'source'>): FeatureDef => ({ kind: 'feature', ...f, source: callsite() });

// ---------- 情况覆盖声明（没有场景的情况才需要写） ----------
export type CoverageDecl = { kind: 'coverage'; status: 'undecided' | 'missing' | 'not_applicable' | 'excluded'; reason?: string };
export const undecided = (reason: string): CoverageDecl => ({ kind: 'coverage', status: 'undecided', reason });
export const missing = (reason?: string): CoverageDecl => ({ kind: 'coverage', status: 'missing', ...(reason ? { reason } : {}) });
export const notApplicable = (reason: string): CoverageDecl => ({ kind: 'coverage', status: 'not_applicable', reason });
export const excluded = (reason: string): CoverageDecl => ({ kind: 'coverage', status: 'excluded', reason });

// ---------- 步骤效果 ----------
export type EffectDef =
  | { kind: 'effect'; type: 'set'; path: string; value: Json }
  | { kind: 'effect'; type: 'append'; path: string; value: Json }
  | { kind: 'effect'; type: 'toast'; text: string; tone: 'success' | 'error' | 'info' }
  | { kind: 'effect'; type: 'go'; route: string }
  | { kind: 'effect'; type: 'complete'; text: string; outcome: 'success' | 'failure' | 'cancelled' }
  | { kind: 'effect'; type: 'uses'; rules: string[] }
  | { kind: 'effect'; type: 'shot'; targets: string[] }
  | { kind: 'effect'; type: 'explain'; text: string }
  | { kind: 'effect'; type: 'trace'; ids: string[]; mode: 'ok' | 'fail' | 'skip' }
  | { kind: 'effect'; type: 'stream'; path: string; value: string }
  | { kind: 'effect'; type: 'fork'; label: string; scenario: string }
  | { kind: 'effect'; type: 'mark'; target: string; kindOf: 'circle' | 'underline' | 'box' | 'arrow'; note?: string };

const pathOf = (b: Bind | string): string => (isBind(b) ? bindPath(b) : b);
export const set = (target: Bind, value: Json): EffectDef => ({ kind: 'effect', type: 'set', path: pathOf(target), value });
export const push = (target: Bind, value: Json): EffectDef => ({ kind: 'effect', type: 'append', path: pathOf(target), value });
/** 与 sonner 一致：toast('…')、toast.success('…')、toast.error('…')。 */
export const toast = Object.assign((text: string): EffectDef => ({ kind: 'effect', type: 'toast', text, tone: 'info' }), {
  success: (text: string): EffectDef => ({ kind: 'effect', type: 'toast', text, tone: 'success' }),
  error: (text: string): EffectDef => ({ kind: 'effect', type: 'toast', text, tone: 'error' }),
  info: (text: string): EffectDef => ({ kind: 'effect', type: 'toast', text, tone: 'info' }),
});
/**
 * 流式输出（D56）：和 set 一样把文字写进状态，播放到这一步时绑定它的文字逐字出现（像模型在输出）。
 * 跳到这一步、截图、发布站静态查看时直接显示全文。自动播放会等输出完再进下一步。
 *   .system('助手回复', stream($.ui.reply, '周六晴，推荐去白河营地……'))
 */
export const stream = (target: Bind, text: string): EffectDef => ({ kind: 'effect', type: 'stream', path: pathOf(target), value: text });
/** 本步的另一条故事路线；目标是同一方案的场景键，自动播放仍走主线。 */
export const fork = (label: string, scenario: string): EffectDef => ({ kind: 'effect', type: 'fork', label, scenario });
/** 本步手绘标注（下一步消失）；目标隐藏或不在当前层时不画。 */
export const mark = (target: string, opts: { kind?: 'circle' | 'underline' | 'box' | 'arrow'; note?: string } = {}): EffectDef => ({ kind: 'effect', type: 'mark', target, kindOf: opts.kind ?? 'circle', ...(opts.note?.trim() ? { note: opts.note.trim() } : {}) });
/** 跳转到另一个路径。 */
export const go = (route: string): EffectDef => ({ kind: 'effect', type: 'go', route });
/** 场景结束。 */
export const done = (text: string, outcome: 'success' | 'failure' | 'cancelled' = 'success'): EffectDef => ({ kind: 'effect', type: 'complete', text, outcome });
/** 这一步依据哪些规则（option 或 feature 中的规则键）。 */
export const uses = (...rules: string[]): EffectDef => ({ kind: 'effect', type: 'uses', rules });

/**
 * 镜头（D43）：这一步要看哪些元素。每个 id 在包含它的层级里解析（多层都有同名 id 时各层都生效），只影响那些层级的镜头；
 * 一步里的第一个 shot 决定导演切到哪一层。shot() 不带参数 = 导演所在层回到整体（不推近）。
 * 没有声明 layers 的方案：shot 在路径页面里聚焦。
 */
export const shot = (...targets: string[]): EffectDef => ({ kind: 'effect', type: 'shot', targets });

/**
 * 解说：这一步补充的一句话，显示在画面下方字幕区的第二行（说明下方、小一号）；建议不超过 48 个字（check 会提示）。
 * 自动播放时这一步停留的时长也按说明加解说的字数计算。不改变状态。
 *   .system('额度预检', '调用模型之前先预检额度', shot('billing'), explain('额度不足时在这里就拦下，不会产生模型费用'))
 */
export const explain = (text: string): EffectDef => ({ kind: 'effect', type: 'explain', text });

/**
 * 调用链（D48）：这一步沿 Diagram 的连线走了哪条路径。节点与连线的 state 由每一步的 trace 自动推算，不用再手写 set / state 绑定：
 * 本步 trace 到的是 active，之前 trace 过、本步没再 trace 的是 ok，trace.fail 的是 error（保持到之后又被 trace 成功），
 * trace.skip 的是 dim，从未涉及的是 idle；节点或连线上显式写的 state 优先。
 * 参数是节点 id 或连线 id：trace('brain', 'biz', 'local') 是 brain→biz、biz→local 两段；每段要有对应的连线，
 * 方向 from→to 或 to→from 都算（反向时流动的小点逆向走）；同一方向有多条连线时写连线 id：trace('e_brain_biz')。
 * trace 同时相当于一个 shot（节点作为镜头目标，顺序有意义）；同一步再写 shot 时两者合并。
 */
export const trace = Object.assign((...ids: string[]): EffectDef => ({ kind: 'effect', type: 'trace', ids, mode: 'ok' }), {
  /** 这段失败：连线和终点节点标为 error（保持到场景结束，除非之后又被 trace 成功）。 */
  fail: (...ids: string[]): EffectDef => ({ kind: 'effect', type: 'trace', ids, mode: 'fail' }),
  /** 这次没被调用：节点（以及它们之间的连线）标为 dim；不移动镜头。 */
  skip: (...ids: string[]): EffectDef => ({ kind: 'effect', type: 'trace', ids, mode: 'skip' }),
});

/**
 * 层级（视角，D43 / T-layers）：一个完全独立的画面，有自己的 JSX 树，单独渲染、按自己的布局占满舞台。
 * 各层共享同一份场景状态（ui / data / inputs），切层时步骤不变。需要全景就自己声明一个 overview 层。
 *   layers: { client: layer('客户端视角', <ClientView />), backend: layer('后端流转', <Arch />) }
 */
export type LayerDef = { kind: 'layer'; title: string; tree: JNode | JNode[]; viewport?: 'desktop' | 'mobile'; role?: string; source?: string };
/** opts.role：这一层是谁的画面（feature.roles 的键，D56）；画面角落显示这个人的名牌，层级标签带上头像。 */
export const layer = (title: string, tree: JNode | JNode[], opts: { viewport?: 'desktop' | 'mobile'; role?: string } = {}): LayerDef => ({ kind: 'layer', title, tree, ...opts, source: callsite() });

/** 步骤参数：字符串是字幕（可省略，省略时自动生成），其余是效果。 */
export type StepArg = string | EffectDef;

/**
 * 过渡卡（D56）的内容：整屏一句大字，用于开场、收尾、时间跳跃（「3 天后」）和换人。
 * sub：小一号的补充；points：收尾时列几条要点；role：换到哪个人（feature.roles 的键），卡片显示这个人，
 * 卡片之后导演切到这个人的层级。
 */
export type CardOpts = { sub?: string; points?: string[]; role?: string };

export type StepDef = {
  kind: 'user' | 'system' | 'card';
  action:
    | { type: 'click'; target: string }
    | { type: 'type'; target: string; value: string }
    | { type: 'select'; target: string; value: string }
    | { type: 'toggle'; target: string; value: boolean }
    | { type: 'press'; keys: string }
    | { type: 'back' }
    | { type: 'event'; name: string }
    | ({ type: 'card'; title: string } & CardOpts);
  caption?: string;
  effects: EffectDef[];
  source?: string;
};

export type FlowOpts = {
  /** 覆盖的情况（feature.cases 的键）。 */
  cases?: string[];
  /** 模拟结果标签，例如“模拟失败”。缺省按 outcome 生成。 */
  mock?: string;
  outcome?: 'success' | 'failure' | 'denied' | 'other';
  /** 起始路径；缺省为方案 on/routes 中的第一个路径。 */
  start?: string;
  /** 在 option.state 之上覆盖的初始状态。 */
  state?: StateInit;
  description?: string;
  expected?: string;
};

export class Flow {
  readonly kind = 'flow';
  readonly steps: StepDef[] = [];
  readonly source: string | undefined;
  constructor(
    readonly name: string,
    readonly opts: FlowOpts,
  ) {
    this.source = callsite(4);
  }
  private add(kind: StepDef['kind'], action: StepDef['action'], args: StepArg[]): this {
    const caption = args.find((a): a is string => typeof a === 'string');
    const effects = args.filter((a): a is EffectDef => typeof a !== 'string');
    this.steps.push({ kind, action, ...(caption ? { caption } : {}), effects, source: callsite(4) });
    return this;
  }
  click(target: string, ...args: StepArg[]): this {
    return this.add('user', { type: 'click', target }, args);
  }
  type(target: string, value: string, ...args: StepArg[]): this {
    return this.add('user', { type: 'type', target, value }, args);
  }
  select(target: string, value: string, ...args: StepArg[]): this {
    return this.add('user', { type: 'select', target, value }, args);
  }
  toggle(target: string, value: boolean, ...args: StepArg[]): this {
    return this.add('user', { type: 'toggle', target, value }, args);
  }
  /** 无目标的键盘操作，例如 .press('⌘K')、.press('Enter', set(...))。 */
  press(keys: string, ...args: StepArg[]): this {
    return this.add('user', { type: 'press', keys }, args);
  }
  back(...args: StepArg[]): this {
    return this.add('user', { type: 'back' }, args);
  }
  /**
   * 过渡卡（D56）：整屏一句大字，可以带效果（例如时间跳跃时 set 状态）。
   *   .card('周末一起去露营', { sub: '用营地助手规划一次两个人的露营' })
   *   .card('现在是阿杰', { role: 'ajie' })
   *   .card('出发前一天', set($.data.weather, 'rain'))
   *   .card('这个方案确认了', { points: ['行程单可以分享', '天气变了会主动提醒'] })
   */
  card(title: string, ...args: (CardOpts | EffectDef)[]): this {
    const effects = args.filter((a): a is EffectDef => (a as EffectDef).kind === 'effect');
    const opts = Object.assign({}, ...args.filter((a) => (a as EffectDef).kind !== 'effect')) as CardOpts;
    const { sub, points, role } = opts;
    const action = { type: 'card' as const, title, ...(sub ? { sub } : {}), ...(points?.length ? { points } : {}), ...(role ? { role } : {}) };
    this.steps.push({ kind: 'card', action, effects, source: callsite(3) });
    return this;
  }
  /** 系统事件，例如“请求成功（模拟）”。 */
  system(name: string, ...args: StepArg[]): this {
    return this.add('system', { type: 'event', name }, args);
  }
}

/** 一条演示路径。 */
export const flow = (name: string, opts: FlowOpts = {}): Flow => new Flow(name, opts);

export type OptionDef = {
  kind: 'option';
  name: string;
  idea: string;
  /** 这个方案主要改变了哪项设计决策。 */
  focus?: string;
  tradeoffs?: string[];
  /** 堆叠到已有路径：{ '/members': { 'header.actions': <Button/>, overlay: <Dialog/> } } */
  on?: Record<string, Record<string, JNode | JNode[]>>;
  /** 本方案新增的路径。 */
  routes?: Record<string, PageDef>;
  state?: StateInit;
  rules?: Record<string, RuleDef>;
  questions?: Record<string, QuestionDef>;
  coverage?: Record<string, CoverageDecl>;
  /** 层级（视角）：每层一个独立画面 { client: layer('客户端视角', <ClientView />), backend: layer('后端流转', <Arch />) }。 */
  layers?: Record<string, LayerDef>;
  scenarios: Record<string, Flow>;
  source?: string;
};
export const option = (o: Omit<OptionDef, 'kind' | 'source'>): OptionDef => ({ kind: 'option', ...o, source: callsite() });

export type { CondExpr as Condition };
