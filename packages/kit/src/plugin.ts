/**
 * 插件（D87）：社区维护的 npm 包，给 Joplo 增加组件。引擎（步骤、状态、镜头、提示、朗读、导出、发布）不变，
 * 插件只负责“这个组件长什么样、观众怎么和它互动”。一个插件包有两部分：
 *
 * 1. 入口（Node 端载入，编译钩子只在编译期运行）：`definePlugin({...})` 的清单、组件标记、给 Agent 读的技能正文。
 *    作者在 joplo.config.ts 写 `plugins: [scene3d]` 启用；`npx joplo skill <插件 id>` 输出它的技能。
 * 2. 运行时（浏览器端）：`defineRuntime({...})`，看板、截图、导出视频与发布站载入，负责把组件画出来。
 *    运行时支持 mount 或 React 组件；React 共享宿主实例，其余依赖（例如 three）自行打包，发布站内联。
 *
 * 不变量（插件与引擎的契约）：
 * - 业务状态只由引擎的步骤推进；插件只读 ctx，不能改状态。观众在插件里点了什么，调用 ctx.click(id)，
 *   和点 DOM 元素一样交给引擎判断（这一步该不该点、点了发生什么）。
 * - 能被步骤、镜头、提示、圈注、检查引用的子元素，都要在 DOM 里放一个锚点，带上 node.attrs（data-jid 等）
 *   并摆在它在画面上的位置；引擎的光标、镜头、聚光、圈注、⌥+单击检查都按锚点定位。
 * - 同一个 ctx 画出的结果相同（截图、视频可复现）；frame.animate 为 false 时不播放过渡；
 *   资源没准备好时用 ctx.hold() 让截图等待。
 */
import { component, type JNode } from './node.ts';
import type { JoploProps } from './props.ts';
export type { JoploProps } from './props.ts';

/** 插件接口版本：v2 宿主同时兼容 v1 的 mount 运行时。 */
export const PLUGIN_API_VERSION = 2 as const;

const ID = /^[a-z][a-z0-9-]*$/;
const NAME = /^[A-Za-z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9]*)*$/;

/** Serializable element behavior. The compiler copies it to nodes; playback reads only IR. */
export type ElementTraits = {
  /** Native local value behavior; never writes timeline state. */
  native?: { action: 'type' | 'toggle' | 'select'; prop: string; deselect?: boolean };
  draggable?: boolean;
  hover?: boolean;
  /** Visibility of a panel selected by an ancestor value control. */
  selectionGate?: { owner: string; item?: string; value: string; fallbackFirst?: boolean };
  input?: 'single' | 'multiple';
  frame?: boolean;
  disabledPresentation?: boolean;
  /** First defined property controls visibility of this node and its descendants. */
  gate?: string[];
  choices?: { prop: string } | { descendants: string[]; value?: string; label?: string; labelChild?: string } | { range: string };
  toggleCaption?: 'check';
  selfEvident?: boolean;
  /** Region names are arbitrary plugin-owned properties on the layout node. */
  layout?: Record<string, { size: string; defaultSize: number; breakpoint?: boolean }>;
  region?: string;
  childWidth?: { value: number; when?: { prop: string; value: string | number | boolean; width: number } };
  /** Display properties; nested item values retain their identity semantics. */
  text?: string[];
  /** Exact nested display strings; * selects array items or object values. */
  textPaths?: string[][];
};

/** 插件组件的声明：编译、检查、技能都只读这里，不执行运行时代码。 */
export type PluginComponentSpec = {
  /** 一行用法（`npx joplo skill <插件>` 列出），例如 'focus, height; root of a 3D scene'。 */
  doc: string;
  example?: string;
  /** Condense compound parts into one family row in the components overview. */
  catalogFamily?: boolean;
  /** Direct JSX string tags mapped to this component by the compiler. */
  intrinsic?: string;
  traits?: ElementTraits;
  /** Compile-time property forwarding, stopping at a nested owner of the same type. */
  inherit?: { target: string; props: string[] }[];
  /** 可操作：必须有 id，并且要有演示步骤、禁用原因或 unmodeled（和 Button 一样）。 */
  interactive?: boolean;
  /** 必须具有作者 id（不要求可操作）。 */
  needsId?: boolean;
  /** 自己表现状态变化，不叠加自动 reveal。 */
  selfEvident?: boolean;
  /** 只能写在哪个组件里面（同一插件的组件名，例如 'Scene'）；写在别处时 check 报错。 */
  parent?: string;
};

/** 编译钩子只在 Node 端调用；传入的数据不是运行时对象。 */
export type PluginReport = (code: string, message: string, at?: string, severity?: 'error' | 'warning' | 'info') => void;
export type PluginIRNode = {
  id: string; type: string; props?: Record<string, unknown>; children?: PluginIRNode[]; source?: string;
  ext?: Record<string, unknown>;
  traits?: ElementTraits;
  framing?: { include?: string[]; kind?: 'root' | 'group' | 'block' | 'content' | 'edge' | 'row' };
};
export type PluginEffectDef = { kind: 'effect'; type: 'plugin'; plugin: string; name: string; payload: unknown };
export const pluginEffect = (plugin: string, name: string, payload: unknown): PluginEffectDef => ({ kind: 'effect', type: 'plugin', plugin, name, payload });
export type PluginState = { readonly ui: Readonly<Record<string, unknown>>; readonly data: Readonly<Record<string, unknown>>; readonly inputs: Readonly<Record<string, unknown>> };
export type PluginScene = { id: string; root: PluginIRNode };
export type PluginDerived = { data?: unknown; framing?: Record<string, NonNullable<PluginIRNode['framing']>> };
export type PluginCompileHooks = {
  /** 子节点转换完后调用；可校验根结构、提供默认 id 与规范化属性。 */
  node?: (node: Readonly<JNode>, ctx: { ids: ReadonlyMap<string, string | undefined>; report: PluginReport }) => JNode | void;
  /** 每个根节点的静态派生数据，错误由宿主隔离。 */
  derive?: (node: Readonly<PluginIRNode>, ctx: { viewport: 'desktop' | 'mobile'; report: PluginReport; options: Readonly<Record<string, unknown>> }) => PluginDerived | void;
  /** 一个作者效果降级为数据及内核原语。targets 贡献普通取景；directorTarget 只选择层。writes 按作者顺序生成 set；data 是同一步之前的降级结果。 */
  effect?: (effect: PluginEffectDef, ctx: { roots: readonly PluginIRNode[]; scenes: readonly PluginScene[]; data: unknown; report: PluginReport; source?: string; resource: (request: { compiler: string; input: string }) => string }) => { data?: unknown; targets?: string[]; references?: string[]; writes?: PluginWrite[]; directorTarget?: string; media?: MediaCommand[] } | void;
  /** 编译器回放基础效果后，计算第 0 步及每一步的完整绘制快照。 */
  frame?: (ctx: { roots: readonly PluginIRNode[]; scenes: readonly PluginScene[]; state: PluginState; previousState?: PluginState; resolveProps: (node: PluginIRNode, previous?: boolean) => Record<string, unknown>; data: unknown; previousData: unknown; position: number; report: PluginReport }) => unknown;
};
/** Author-only requests never enter IR. Local compilers run in a bounded Node process. */
export type ResourceRequest = { id: string; plugin: string; compiler: string; input: string; source?: string };
export const localResource = (plugin: string, compiler: string, input: string) => ({ kind: 'local-resource' as const, plugin, compiler, input });
export type LocalCompiler = { version: string; mime: string; persistent?: boolean; estimate?: (input: string) => { credits: number }; compile(input: string, ctx: { directory: string; projectDir?: string; keys: Readonly<Record<string, string>>; allowSpend?: boolean; maxBytes: number }): Promise<Uint8Array> | Uint8Array };
/** Local-only credential metadata. Never put secret values in this declaration. */
export type PluginKey = { id: string; title: string; description: string; url: string; env: string };
export type PluginLocal = { compilers: Record<string, LocalCompiler> };
export type MediaCommand = { track: string; action: 'play'; resource: string; volume?: number; loop?: boolean; fadeMs?: number } | { track: string; action: 'stop'; fadeMs?: number };
/** Full state at a step boundary; elapsed time is in unscaled engine milliseconds. */
export type MediaSnapshot = Record<string, { plugin: string; resource: string; offsetMs: number; volume: number; loop: boolean; fadeInMs: number; stopAfterMs?: number }>;
export type MediaDriver = { update(frame: { offsetMs: number; volume: number; loop: boolean; speed: number; playing: boolean }): void; destroy(): void };
export type MediaFactory = (ctx: { audio: AudioContext; destination: AudioNode; bytes: Uint8Array }) => MediaDriver | Promise<MediaDriver>;

export type PluginDataSchema = { safeParse(value: unknown): { success: boolean; error?: { message: string } } };

/** Paths are segment arrays; * visits array items/object values, never their keys. */
export type PluginScopeRule = {
  path: string[]; kind: 'map' | 'items' | 'values' | 'reference'; domain?: 'element' | 'scene';
  prefix?: string; references?: string[][]; children?: PluginScopeRule[];
};
export type PluginSlotSpec = { text?: string[][]; scope?: 'global' | PluginScopeRule[] };
export type PluginDataSpec = { node?: PluginSlotSpec; step?: PluginSlotSpec };

/** Literal properties on any author element; DOM names must belong to this plugin's data-jp-<id>- namespace. */
export type PluginPropertySpec = {
  type: 'string' | 'number' | 'boolean';
  attribute?: string;
  min?: number;
  max?: number;
  nonempty?: boolean;
  /** 字符串属性的可选值（预设名，D92）：作者写了别的值时 check 报 PLUGIN_PROPERTY_INVALID 并列出可选值。 */
  values?: string[];
};
export type PluginWrite = { path: string; value: unknown };

/** Data-only action contract. Payload fields are exact; numeric tolerance is used only for gestures. */
export type PluginActionSpec = {
  caption: string;
  durationMs: number;
  fields: Record<string, { type: 'string' | 'number' | 'boolean'; min?: number; max?: number; tolerance?: number; text?: boolean }>;
  targets?: string[];
};
export type PluginDef = {
  actions?: Record<string, PluginActionSpec>;
  /** Theme name → CSS source. Host publishes them as <plugin>:<name>. */
  themes?: Record<string, string>;
  /** Compile-time literal properties; copied to resolved DOM anchors by the host. */
  properties?: Record<string, PluginPropertySpec>;
  kind: 'plugin';
  data?: PluginDataSpec;
  compile?: PluginCompileHooks;
  schemas?: { node?: PluginDataSchema; step?: PluginDataSchema };
  /** 小写字母开头，组件类型名为 `<id>:<组件名>`，例如 scene3d:Scene。 */
  id: string;
  apiVersion: typeof PLUGIN_API_VERSION;
  title: string;
  description?: string;
  /** 插件包的版本（展示用）。 */
  version?: string;
  components: Record<string, PluginComponentSpec>;
  /** 给 Agent 读的用法（Markdown）：何时用、怎么写、和步骤怎样配合、常见的坑。 */
  skill?: string;
  /** Additional versioned agent guides, keyed by topic. No runtime/IR content. */
  skillTopics?: Record<string, { description: string; body: string }>;
  /** Published author package; used for discovery and missing-plugin recovery. */
  packageName?: string;
  /** 运行时入口的绝对路径（definePlugin 接受 `new URL('./runtime.js', import.meta.url)`）。 */
  runtime: string;
  /** Node-only entry; excluded from browser bundles and IR. */
  local?: string;
  /** Host resolves only these keys for this plugin’s local compiler, after spending permission. */
  keys?: readonly PluginKey[];
};

function fileOf(u: string | URL): string {
  const s = typeof u === 'string' ? u : u.href;
  if (!s.startsWith('file:')) return s;
  const p = decodeURIComponent(new URL(s).pathname);
  return /^\/[A-Za-z]:\//.test(p) ? p.slice(1) : p;
}

/** 插件入口：返回清单与编译钩子。id、组件名、接口版本不对时直接抛错（启用插件时就能看到）。 */
export function definePlugin(p: Omit<PluginDef, 'kind' | 'runtime' | 'apiVersion' | 'local'> & { apiVersion?: typeof PLUGIN_API_VERSION; runtime: string | URL; local?: string | URL }): PluginDef {
  if (!ID.test(p.id)) throw new Error(`Joplo plugin id "${p.id}" must be lowercase letters, digits, and -, starting with a letter`);
  if (p.apiVersion !== undefined && p.apiVersion !== PLUGIN_API_VERSION) throw new Error(`Joplo plugin ${p.id} targets plugin API ${p.apiVersion}; this Joplo supports ${PLUGIN_API_VERSION}`);
  if (p.keys) {
    const ids = new Set<string>();
    for (const key of p.keys) {
      if (!ID.test(key.id) || ids.has(key.id) || !key.title?.trim() || !key.description?.trim() || !/^[A-Z][A-Z0-9_]*$/.test(key.env) || !/^https:\/\//.test(key.url)) throw new Error(`Plugin ${p.id}: invalid key declaration`);
      ids.add(key.id);
    }
  }
  if (p.skillTopics) for (const [key, topic] of Object.entries(p.skillTopics)) {
    if (!/^[a-z][a-z0-9-]*$/.test(key) || !topic || typeof topic.description !== 'string' || !topic.description.trim() || typeof topic.body !== 'string' || !topic.body.trim()) throw new Error(`Plugin ${p.id}: invalid skill topic ${key}`);
  }
  if (p.packageName && !/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/.test(p.packageName)) throw new Error(`Plugin ${p.id}: invalid author package name`);
  for (const [name, spec] of Object.entries(p.components)) {
    if (!NAME.test(name) || /^[a-z]/.test(name) && spec.intrinsic !== name) throw new Error(`Joplo plugin ${p.id}: component name "${name}" must be PascalCase (dots for compound parts)`);
    if (spec.parent !== undefined && !p.components[spec.parent]) throw new Error(`Joplo plugin ${p.id}: ${name}.parent "${spec.parent}" is not a component of this plugin`);
  }
  return { ...p, kind: 'plugin', apiVersion: PLUGIN_API_VERSION, runtime: fileOf(p.runtime), local: p.local ? fileOf(p.local) : undefined };
}

export const isPluginDef = (v: unknown): v is PluginDef => typeof v === 'object' && v !== null && (v as PluginDef).kind === 'plugin' && typeof (v as PluginDef).id === 'string';

/** 组件类型名：`<插件 id>:<组件名>`。 */
export const pluginType = (pluginId: string, name: string) => `${pluginId}:${name}`;

type Marker = (props: JoploProps) => any;
/** 插件组件的 JSX 标记：`export const Scene3D = Object.assign(pluginComponent(plugin, 'Scene'), { Target: pluginComponent(plugin, 'Target') })`。 */
export function pluginComponent(plugin: PluginDef, name: string): Marker {
  if (!plugin.components[name]) throw new Error(`Joplo plugin ${plugin.id} has no component ${name}`);
  return component(pluginType(plugin.id, name), plugin.packageName) as unknown as Marker;
}

// ---------- 运行时（浏览器端）----------

/** 插件组件在画面里的一个元素（根或子元素），属性已按当前状态取值。 */
export type PluginNode = {
  id: string;
  /** 完整类型名，例如 scene3d:Target。 */
  type: string;
  /** 插件里的组件名，例如 Target。 */
  name: string;
  props: Record<string, unknown>;
  label: string;
  /** when 条件此刻是否成立（不成立的子元素也会给出，插件决定隐藏还是淡出）。 */
  visible: boolean;
  disabled: boolean;
  disabledReason: string | null;
  interactive: boolean;
  /** 放在代表这个元素的 DOM 锚点上（data-jid 等），引擎靠它定位与检查。 */
  attrs: Record<string, string>;
  children: PluginNode[];
  ext?: Record<string, unknown>;
};

/** Browser input carries data only. A recognizer reports intent; the engine decides what it means. */
export type ActionGesture =
  | { type: 'click' }
  | { type: 'type' | 'select'; value: string }
  | { type: 'toggle'; value: boolean }
  | { type: 'drag' | 'scroll'; to: string | {x:number;y:number} }
  | { type: 'hover'; ms: number }
  | { type: 'plugin'; name: string; data: Record<string, unknown> };
export type AudienceAction = ActionGesture & { target: string };
export type EngineFrame = Readonly<{ timeMs: number; elapsedMs: number; rawMs: number; running: boolean; speed: number; paused?: boolean }>;
export type ActionPresentation = { action: import('./index.ts').StepDef['action']; progress: number };
export type ActionDispatch = (id: string, action: ActionGesture, native?: AudienceAction) => void;

/** 演示此刻的情况：只读。 */
export type PluginFrame = {
  /** Only time source for demonstrations. Missing in old hosts; draw the final state then. */
  clock?: EngineFrame;
  gesture?: ActionPresentation | null;
  playground?: boolean;
  /** Changes when local view state must be discarded (play, jump, reset, scene change). */
  resetKey?: string;
  /** demo = 体验与播放；review = 审阅（点击用于检查元素）。 */
  mode: string;
  /** false：截图、导出、跳转，直接画到终点，不播放过渡。 */
  animate: boolean;
  scenarioId: string;
  /** Fully qualified stage identity; element ids are only unique inside this stage. */
  sceneId: string;
  /** 已经执行的步数。 */
  position: number;
  /** 镜头此刻对准的元素 id；null = 没有聚焦。 */
  focus: readonly string[] | null;
  /** 下一步要操作的元素 id（手动体验时可以提示观众）；null = 没有。 */
  nextTarget: string | null;
  selectedId: string | null;
  /** 当前主题名；主题变化时插件应重新读取 css() 的颜色。 */
  theme: string;
};

export type ComponentCtx = {
  node: PluginNode;
  /** 未解析的 IR 节点（几何与容器组合使用）。 */
  model: PluginIRNode;
  /** 当前步骤编译好的插件快照（第 0 步取 scenario.ext）。 */
  ext: Readonly<Record<string, unknown>>;
  /** React 容器可直接返回子节点；nodes 按 id 选择 model 子树（含文本节点）；传入 container 时由宿主 portal 渲染。 */
  renderChildren: (nodes?: readonly Pick<PluginNode, 'id'>[], container?: Element) => any;
  frame: PluginFrame;
  /** 读取主题变量，例如 css('--jp-ink')、css('--jp-accent')。 */
  css: (name: string) => string;
  /** 观众点了某个子元素（例如 3D 物体）：和点 DOM 元素一样交给引擎判断。坐标是视口坐标（MouseEvent.clientX/Y）；altKey 照抄指针事件（⌥+单击 = 检查元素）。 */
  act?: ActionDispatch;
  /** Report the pointer's raycast hit (null on leave). The host owns declared hover dwell and playback gating. */
  hover?: (id: string | null) => void;
  click: (id: string, at?: { clientX: number; clientY: number; altKey?: boolean }) => void;
  /** 截图、导出前要等待的工作（加载模型、首帧渲染）：返回一个 done 函数，完成后调用。 */
  hold: () => () => void;
};

export type ComponentInstance = { update(ctx: ComponentCtx): void; destroy(): void };
export type RuntimeComponent =
  | { mount(el: HTMLElement, ctx: ComponentCtx): ComponentInstance; react?: never }
  | { react: (props: { ctx: ComponentCtx }) => any; mount?: never };
/** Runs after the host commits a stage layout. Read-only drawing data, never state transitions. */
export type PluginObservation = { frame: PluginFrame; ext: Readonly<Record<string, unknown>> };
export type PluginObserver = { update(context: PluginObservation): void; destroy(): void };
export type PluginObserve = (root: HTMLElement, context: PluginObservation) => PluginObserver;
/** Browser-only viewport decoration; no playback state or authoring code. */
export type ViewportDecoration = {
  insets: {x:number;y:number};
  size(width:number,height:number):{width:number;height:number};
  react: import('react').ComponentType<{width:number;height:number;scale?:number;seed?:string;children?:import('react').ReactNode}>;
};
export type PluginRuntime = { id: string; apiVersion: typeof PLUGIN_API_VERSION; components: Record<string, RuntimeComponent>; viewports?: Record<string, ViewportDecoration>; media?: MediaFactory; observe?: PluginObserve };

/** 插件运行时：mount 适配框架无关渲染；react 接收 ctx，由宿主 React 树渲染。 */
export function defineRuntime(r: { id: string; apiVersion?: typeof PLUGIN_API_VERSION; components: Record<string, RuntimeComponent>; viewports?: Record<string, ViewportDecoration>; media?: MediaFactory; observe?: PluginObserve }): PluginRuntime {
  return { ...r, apiVersion: PLUGIN_API_VERSION };
}
