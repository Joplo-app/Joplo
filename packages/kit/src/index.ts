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
export { asset } from './asset.ts';
import type { PluginDef } from './plugin.ts';
export type { PluginDef } from './plugin.ts';

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
export type StateInit = { ui?: Record<string, Json>; data?: Record<string, Json>; inputs?: Record<string, Json> };

// ---------- 项目、布局、页面 ----------
/** theme：默认主题名——内置主题（sketch、clean、blueprint、nord、dracula、solarized-light、terminal、kraft、contrast）或项目 themes/<name>.css（D51）。 */
/**
 * autoFocus（D70）：默认焦点行为（结果揭晓：本步新出现或变化的元素轻轻脉冲一次；进入新的一层时先全景再推近）。
 * 缺省开启；写 false 整体关掉，演示只按作者写的 shot / trace / spotlight 等呈现。
 */
/**
 * 朗读（D74）：自动播放时把每一步读出来。都可以不写：不写时看板里选哪个声音来源就用哪个，旁白用它的默认音色。
 * - profile：本机声音供应商 profile 的名字或 id（看板「声音 → 管理供应商」里保存的，例如 'OpenAI'）；写了就优先于看板里的选择。Key 不写在这里。
 * - narrator：旁白（系统步骤、过渡卡）的音色，例如 'nova'；
 * - roles：角色的音色，键是 feature.roles 的键，例如 { xiaoyu: 'shimmer' }；没写的角色用旁白的音色。
 */
export type VoiceConfig = {
  profile?: string;
  narrator?: string;
  roles?: Record<string, string>;
  /** 按内容语言覆盖旁白与角色的音色（D84），例如 { ja: { narrator: 'Sarah' } }；不写时自动选同语言的预设音色。 */
  locales?: Record<string, { narrator?: string; roles?: Record<string, string> }>;
};
/**
 * locales（D84）：内容语言，第一个是源文件的语言（默认语言），其余的译文在 locales/<语言>.json（原文 → 译文）。
 * 可选：en、zh-CN、zh-TW、ja、ko、es、fr、de、pt-BR、ru。加一种语言：npx joplo i18n add <语言>。
 */
/** plugins（D86）：启用的插件（npm 包的默认导出，`import scene3d from 'joplo-plugin-scene3d'`）；用法见 npx joplo skill <插件 id>。 */
export type ConfigDef = { kind: 'config'; name: string; description?: string; theme?: string; layout?: string; home?: string; autoFocus?: boolean; voice?: VoiceConfig; locales?: string[]; plugins?: PluginDef[]; source?: string };
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
  /** 演示顺序：有限数字从小到大，未写的在后；同值按功能文件夹名自然排序。名字里不用手写编号。 */
  order?: number;
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
  | { kind: 'effect'; type: 'mark'; target: string; kindOf: 'circle' | 'underline' | 'box' | 'arrow'; note?: string }
  | { kind: 'effect'; type: 'cue'; cue: 'spotlight' | 'highlight' | 'number'; targets: string[] }
  | { kind: 'effect'; type: 'callout'; target: string; text: string; side?: CalloutSide }
  | { kind: 'effect'; type: 'hold'; seconds: number }
  | { kind: 'effect'; type: 'say'; text: string }
  | { kind: 'effect'; type: 'narrate'; text: string }
  | { kind: 'effect'; type: 'camera'; targets: string[]; pad?: number; zoom?: number; ms?: number };

/** 标注气泡放在目标的哪一侧；不写时自动选画面里放得下的一侧（右、左、下、上）。 */
export type CalloutSide = 'top' | 'right' | 'bottom' | 'left';

const pathOf = (b: Bind | string): string => (isBind(b) ? bindPath(b) : b);
export const set = (target: Bind, value: Json): EffectDef => ({ kind: 'effect', type: 'set', path: pathOf(target), value });
/**
 * 一次改多处：patch($.data, { cam: 'chat', score: 3 }) 等于对每个键各写一个 set()。
 * 嵌套对象整体替换（与 set 相同）；步骤参数里直接展开数组即可：.system('…', patch($.data, {…}), hold(3))。
 */
export const patch = (target: Bind | Record<string, unknown>, values: Record<string, Json>): EffectDef[] =>
  Object.entries(values).map(([k, v]) => ({ kind: 'effect', type: 'set', path: `${pathOf(target as Bind)}.${k}`, value: v }));
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

/** camera() 的选项：pad 取景留白（设计像素，默认 48）；zoom 最大放大倍数（默认 3）；ms 镜头运动时长（默认 1200）。 */
export type CameraOpts = { pad?: number; zoom?: number; ms?: number };
/**
 * 画布镜头：<Canvas> 里的镜头对准这些元素（取它们合起来的范围，按画布的设计尺寸等比放进画面），平滑推、拉、摇，不画焦点框。
 * 镜头位置会保留到下一次 camera()；camera() 不带元素 = 回到整张画布。导演会切到目标所在的层。
 *   .system('读入', camera('tape', 'machine'))
 *   .system('全景', camera({ ms: 2000 }))
 */
export const camera = (...args: (string | CameraOpts)[]): EffectDef => {
  const targets = args.filter((a): a is string => typeof a === 'string');
  const o = Object.assign({}, ...args.filter((a) => typeof a === 'object' && a !== null)) as CameraOpts;
  return { kind: 'effect', type: 'camera', targets, ...(o.pad !== undefined ? { pad: o.pad } : {}), ...(o.zoom !== undefined ? { zoom: o.zoom } : {}), ...(o.ms !== undefined ? { ms: o.ms } : {}) };
};

/**
 * 解说：这一步补充的一句话，显示在画面下方字幕区的第二行（说明下方、小一号）；建议不超过 48 个字（check 会提示）。
 * 自动播放时这一步停留的时长也按说明加解说的字数计算。不改变状态。
 *   .system('额度预检', '调用模型之前先预检额度', shot('billing'), explain('额度不足时在这里就拦下，不会产生模型费用'))
 */
export const explain = (text: string): EffectDef => ({ kind: 'effect', type: 'explain', text });

/**
 * 旁白（D74）：讲解人用旁白的声音说的话，像在给同事介绍功能，不是把字幕念出来。和字幕分开存。
 * 朗读的优先级：narrate() > say()（角色台词）> 字幕（过渡卡读标题和副标题）；explain 不读。字幕兜底时也用旁白的声音。
 * 自动播放会等它读完再进下一步。
 *
 * 写法（详见 npx joplo skill story 第 6 节）：
 * - 一句只做一件事：交代、指点、承接或收束；说字幕说不出的意图、原因、结果，不重复字幕；
 * - 短：一两句，大多 3–8 秒；能删的字都删掉，画面已经看得到的不用再说；
 * - 口语：主语在前，用逗号句号断气，不写括号、斜杠、箭头；数字按口语写（“四百六十块”“第二版”）；
 * - 换人、跳时间、收尾也要一句，告诉观众为什么切过去；平实具体，不用比喻和口号。
 *   .click('share', '小雨把行程单分享给阿杰', narrate('行程用链接发给阿杰，他不用装 App。'))
 *   .card('现在是阿杰', { role: 'ajie' }, narrate('换到阿杰这边，他只收到一条消息。'))
 */
export const narrate = (text: string): EffectDef => ({ kind: 'effect', type: 'narrate', text });

/**
 * 角色台词（D74）：这一步里角色亲口说的话，用这个角色的声音读（feature.roles 与层级的 role；没有角色时用旁白的声音）。
 * 写第一人称、像真人说话：.click('can_go', '阿杰回复：我能去', say('我能去！'))。
 * 同一步写了 narrate() 时只读旁白。讲解、过渡、总结请用 narrate()。
 */
export const say = (text: string): EffectDef => ({ kind: 'effect', type: 'say', text });

// ---------- 焦点与呈现形式（D70）：这一步观众看哪里、用什么形式看 ----------
// 镜头（shot）负责“取景”：推近、跟随。下面这些只负责“强调”：都不推近镜头；目标不在当前镜头里时，镜头先退回整层。
// 都只作用于这一步（下一步消失），跳到任意一步、前后翻、回放结果一致。

/**
 * 聚光：这一步只照亮这些元素，画面其余部分压暗（不遮挡、不拦截点击，下一步要点的元素也保持明亮）。
 * 用于“这一屏信息很多，此刻只看这一块”。
 *   .system('额度不足', '额度不足，先拦下', spotlight('quota_alert'))
 */
export const spotlight = (...targets: string[]): EffectDef => ({ kind: 'effect', type: 'cue', cue: 'spotlight', targets });
/**
 * 强调：给元素加一圈强调框并脉冲一次，画面其他部分不变。比 spotlight 轻，适合“注意这里变了 / 这里是关键”。
 *   .system('席位更新', '席位变成 12 / 15', highlight('seat_card'))
 */
export const highlight = (...targets: string[]): EffectDef => ({ kind: 'effect', type: 'cue', cue: 'highlight', targets });
/**
 * 编号：按参数顺序给元素标 1、2、3…，讲“这一屏由几部分组成 / 先后顺序”。建议一步不超过 5 个。
 *   .system('页面结构', '先看三块：输入、预览、发送', numbered('in_emails', 'mail_preview', 'btn_send'))
 */
export const numbered = (...targets: string[]): EffectDef => ({ kind: 'effect', type: 'cue', cue: 'number', targets });
/**
 * 标注气泡：指向元素的一句话（便签式说明），建议和字幕一样不超过 24 个字。字幕讲“发生了什么”，气泡讲“为什么在这里”。
 *   .system('行程单完成', '行程单生成完毕', callout('share', '生成完才能分享'))
 *   callout('btn_pay', '按比例只收 18 天', { side: 'left' })
 */
export const callout = (target: string, text: string, opts: { side?: CalloutSide } = {}): EffectDef => ({ kind: 'effect', type: 'callout', target, text, ...(opts.side ? { side: opts.side } : {}) });
/**
 * 停留：自动播放时这一步至少停 seconds 秒（0.5–30，按播放速度缩放），给观众时间看画面（图表、对比、一大段结果）。
 * 不写时按字幕字数自动计算。
 *   .system('对比两种结果', '左边是旧流程，右边是新流程', hold(5))
 */
export const hold = (seconds: number): EffectDef => ({ kind: 'effect', type: 'hold', seconds });

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
/** 层级标签的预设图标（与 core 的 LAYER_ICONS 一致）。不写时：手机视口 mobile，其余 window。 */
export type LayerIcon = 'window' | 'browser' | 'mobile' | 'desktop' | 'terminal' | 'chat' | 'agent' | 'server' | 'data' | 'email' | 'doc' | 'flow';
export type LayerDef = { kind: 'layer'; title: string; tree: JNode | JNode[]; viewport?: 'desktop' | 'mobile'; role?: string; icon?: LayerIcon; source?: string };
/** opts.role：这一层是谁的画面（feature.roles 的键，D56）；画面角落显示这个人的名牌，层级标签带上头像。 */
export const layer = (title: string, tree: JNode | JNode[], opts: { viewport?: 'desktop' | 'mobile'; role?: string; icon?: LayerIcon } = {}): LayerDef => ({ kind: 'layer', title, tree, ...opts, source: callsite() });

/** 步骤参数：字符串是字幕（可省略，省略时自动生成），其余是效果。 */
/** 步骤参数：字幕、效果，或一组效果（patch() 返回数组，直接传入即可）。 */
export type StepArg = string | EffectDef | readonly EffectDef[];

/**
 * 过渡卡（D56）的内容：整屏一句大字，用于开场、收尾、时间跳跃（「3 天后」）和换人。
 * sub：小一号的补充；points：收尾时列几条要点；role：换到哪个人（feature.roles 的键），卡片显示这个人，
 * 卡片之后导演切到这个人的层级。
 */
export type CardOpts = { sub?: string; points?: string[]; role?: string };

export type StepDef = {
  /** Stable identity within this scenario; independent of the playback position. */
  key?: string;
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
  /**
   * 接着另一个场景演（同一方案的场景键）：初始状态 = 那个场景最后一步之后的状态（路径、ui / data / inputs、画布镜头、导演层），
   * 再叠上这里的 state。讲解片的章节、长流程的分段都用它，每一段从上一段结尾的画面开始，不用手抄状态。
   */
  from?: string;
  /** 从哪一层开始（layers 的键）；缺省为第一层，写了 from 时为那个场景结尾的导演层。 */
  layer?: string;
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
    const flat = args.flat() as (string | EffectDef)[];
    const caption = flat.find((a): a is string => typeof a === 'string');
    const effects = flat.filter((a): a is EffectDef => typeof a !== 'string');
    this.steps.push({ kind, action, ...(caption ? { caption } : {}), effects, source: callsite(4) });
    return this;
  }
  /** Give the preceding step a stable key. Keep it when editing or moving the same action. */
  key(key: string): this {
    const step = this.steps.at(-1);
    if (!step) throw new Error('flow.key() must follow a step');
    if (step.key !== undefined) throw new Error('This step already has a key');
    step.key = key;
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
  card(title: string, ...rest: (CardOpts | EffectDef | readonly EffectDef[])[]): this {
    const args = rest.flat() as (CardOpts | EffectDef)[];
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
