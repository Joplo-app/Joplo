import { PluginAction } from '../schema.ts';
import { ElementTraitsSchema, InheritSchema, PluginInspectFieldSchema, PluginTextSchema } from '../traits.ts';
import { advanceMedia } from '../media.ts';
import { commitGapMs } from '../step-plan.ts';
import type { MediaCommand, MediaSnapshot, ResourceRequest, LocalResourceInfo } from '@joplo-app/kit/plugin';
import { jsonData, snapshot, object, strings, syncResult, authoringData, materialize, errorMessage } from './data.ts';
/** Node-side plugin host. Callbacks never enter IR or the player. */
import { isNode, type JNode } from '@joplo-app/kit/node';
import { PLUGIN_API_VERSION, type PluginDef, type PluginEffectDef, type PluginReport } from '@joplo-app/kit/plugin';
import { initialState, applyStep, resolveProps, type PlayState } from '../player.ts';
import type { Scene, SceneNode, Project, Scenario } from '../schema.ts';
import type { PluginInfo } from '../catalog.ts';

export type CompileOptions = {
  onResource?: (request: ResourceRequest) => void;
  /** 本机资源的元数据，按这次编译里的资源 id。 */
  resourceInfo?: Record<string, LocalResourceInfo>;
  /** 按请求内容（插件、编译器、输入）查元数据：上一次编译已经检查过的资源第一遍就能用上，宿主不必为了它再编译一遍。resourceInfo 里有的优先。 */
  resourceInfoFor?: (request: { plugin: string; compiler: string; input: string }) => LocalResourceInfo | undefined;
  pluginOptions?: Record<string, Record<string, unknown>>;
};
export function enabledPlugins(configured: unknown): unknown[] {
  return Array.isArray(configured) ? configured : [];
}
function validMediaCommand(value: unknown, plugin: string, owners: ReadonlyMap<string, string>): boolean {
  if (!object(value) || typeof value.track !== 'string' || !/^[a-z][a-z0-9-]*$/.test(value.track)) return false;
  if (value.fadeMs !== undefined && (typeof value.fadeMs !== 'number' || value.fadeMs < 0 || value.fadeMs > 30000)) return false;
  if (value.action === 'stop') return Object.keys(value).every(k => ['track', 'action', 'fadeMs'].includes(k));
  if (value.action !== 'play' || typeof value.resource !== 'string' || owners.get(value.resource) !== plugin) return false;
  return Object.keys(value).every(k => ['track', 'action', 'resource', 'volume', 'loop', 'fadeMs', 'offsetMs'].includes(k))
    && (value.offsetMs === undefined || typeof value.offsetMs === 'number' && Number.isFinite(value.offsetMs) && value.offsetMs >= 0)
    && (value.volume === undefined || typeof value.volume === 'number' && value.volume >= 0 && value.volume <= 1)
    && (value.loop === undefined || typeof value.loop === 'boolean');
}

export class PluginCompiler {
  readonly intrinsic = new Map<string, string>();
  readonly inherits = new Map<string, { target: string; props: string[] }[]>();
  readonly themes: Record<string, string> = {};
  readonly properties = new Map<string, { plugin: PluginDef; spec: import('@joplo-app/kit/plugin').PluginPropertySpec }>();
  readonly mediaCommands = new Map<string, (MediaCommand & { plugin: string })[]>();
  private resourceIds = new Map<string, string>();
  private resourceOwners = new Map<string, string>();
  private resourceRequests = new Map<string, { plugin: string; compiler: string; input: string }>();
  /**
   * 钩子输入的只读副本，按画面根节点缓存：画面在派生（derive）之后不再变，同一棵树给每个效果、每一步、每个插件
   * 用同一份深冻结的副本，不为每次钩子调用整棵重拷。只在这一次编译内有效。
   */
  private frozenRoots = new WeakMap<object, SceneNode>();
  private frozenRoot(root: SceneNode): SceneNode {
    let hit = this.frozenRoots.get(root);
    if (!hit) this.frozenRoots.set(root, (hit = snapshot(root)));
    return hit;
  }
  private frozenScenes(scenes: readonly Pick<Scene, 'id' | 'root'>[]) {
    const list = scenes.map(s => Object.freeze({ id: s.id, root: this.frozenRoot(s.root) }));
    return { roots: Object.freeze(list.map(s => s.root)), scenes: Object.freeze(list) };
  }
  private infoOf(id: string): LocalResourceInfo | undefined {
    const request = this.resourceRequests.get(id);
    return this.options.resourceInfo?.[id] ?? (request ? this.options.resourceInfoFor?.(request) : undefined);
  }
  readonly defs = new Map<string, PluginDef>();
  readonly info: Record<string, PluginInfo> = {};
  constructor(configured: unknown, private report: PluginReport, source?: string, private options: CompileOptions = {}) {
    if (configured !== undefined && !Array.isArray(configured)) report('PLUGIN_INVALID', 'config({ plugins }) must be a list of plugins', source);
    for (const raw of enabledPlugins(configured)) {
      const p = raw as PluginDef | null;
      if (!p || typeof p !== 'object' || p.kind !== 'plugin' || typeof p.id !== 'string' || !p.components || typeof p.components !== 'object' || Array.isArray(p.components)) { report('PLUGIN_INVALID', 'config({ plugins }) entries must be made with definePlugin', source); continue; }
      if (this.defs.has(p.id)) { report('PLUGIN_DUPLICATE', `Plugin ${p.id} is enabled twice in config({ plugins })`, source); continue; }
      if (p.apiVersion !== PLUGIN_API_VERSION) { report('PLUGIN_INVALID', `Plugin ${p.id} targets API ${p.apiVersion}; supported: ${PLUGIN_API_VERSION}`, source); continue; }
      this.defs.set(p.id, p);
      const properties = this.envelope(p, p.properties ?? {}, source);
      // 清单不合格的插件整个不启用：不留下只注册了一半（有钩子、没有组件信息）的状态
      if (!object(properties)) { this.invalid(p, source); this.defs.delete(p.id); continue; }
      for (const [key, spec] of Object.entries(properties)) {
        if (!/^[A-Za-z][A-Za-z0-9]*$/.test(key) || ['id', 'children', 'style', 'className', 'when', 'disabled', 'redact', 'note'].includes(key)
          || !object(spec) || !['string', 'number', 'boolean'].includes(String(spec.type))
          || Object.keys(spec).some(k => !['type', 'attribute', 'min', 'max', 'nonempty', 'values'].includes(k))
          || spec.values !== undefined && (spec.type !== 'string' || !Array.isArray(spec.values) || !spec.values.length || spec.values.some(v => typeof v !== 'string' || !v))
          || spec.attribute !== undefined && (typeof spec.attribute !== 'string' || !spec.attribute.startsWith(`data-jp-${p.id}-`) || !/^data-jp-[a-z0-9-]+$/.test(spec.attribute))
          || ['min', 'max'].some(k => spec[k] !== undefined && (spec.type !== 'number' || typeof spec[k] !== 'number'))
          || spec.nonempty !== undefined && (spec.type !== 'string' || typeof spec.nonempty !== 'boolean')
          || typeof spec.min === 'number' && typeof spec.max === 'number' && spec.min > spec.max) {
          this.report('PLUGIN_PROPERTY_INVALID', `Plugin ${p.id}: invalid declaration for property ${key}`, source); continue;
        }
        if (this.properties.has(key) || spec.attribute && [...this.properties.values()].some(v => v.spec.attribute === spec.attribute)) {
          this.report('PLUGIN_PROPERTY_CONFLICT', `Plugin ${p.id}: property ${key} or its DOM attribute is already registered`, source); continue;
        }
        this.properties.set(key, { plugin: p, spec: spec as import('@joplo-app/kit/plugin').PluginPropertySpec });
      }
      const actions: NonNullable<PluginInfo['actions']> = {};
      const rawActions = this.envelope(p, p.actions ?? {}, source);
      if (!object(rawActions)) report('PLUGIN_ACTION_INVALID', `Plugin ${p.id}: actions must be a record`, source);
      else for (const [name, raw] of Object.entries(rawActions)) {
        const parsed = PluginAction.safeParse(raw);
        if (!/^[a-z][a-zA-Z0-9-]*$/.test(name) || !parsed.success) report('PLUGIN_ACTION_INVALID', `Plugin ${p.id}: invalid action ${name}`, source);
        else actions[name] = parsed.data;
      }
      const themes = this.envelope(p, p.themes ?? {}, source);
      if (!object(themes)) this.invalid(p, source);
      else for (const [name, css] of Object.entries(themes)) {
        if (!/^[a-z][a-z0-9-]*$/.test(name) || typeof css !== 'string') this.report('PLUGIN_THEME_INVALID', `Plugin ${p.id}: themes need lowercase names and CSS strings`, source);
        else this.themes[`${p.id}:${name}`] = css;
      }
      const checked: Record<string, import('@joplo-app/kit/plugin').ElementTraits> = {};
      const shown: Record<string, Pick<import('../catalog.ts').ComponentInfo, 'label' | 'inspect'>> = {};
      for (const [name, c] of Object.entries(p.components)) {
        const type = `${p.id}:${name}`;
        // 看板里给人看的名字与检查抽屉的信息行：纯数据，校验后进 dev IR（发布与评审版在编译末尾去掉）
        if (c.label !== undefined || c.inspect !== undefined) {
          const label = c.label === undefined ? undefined : PluginTextSchema.safeParse(this.envelope(p, c.label, source));
          const inspect = c.inspect === undefined ? undefined : PluginInspectFieldSchema.array().safeParse(this.envelope(p, c.inspect, source));
          if (label && !label.success || inspect && !inspect.success) report('PLUGIN_INVALID', `Plugin ${p.id}: invalid label or inspect declaration for ${name}`, source);
          else shown[name] = { ...(label?.success ? { label: label.data as import('@joplo-app/kit/plugin').PluginText } : {}), ...(inspect?.success ? { inspect: inspect.data as import('@joplo-app/kit/plugin').PluginInspectField[] } : {}) };
        }
        if (c.traits !== undefined) {
          const parsed = ElementTraitsSchema.safeParse(this.envelope(p, c.traits, source));
          if (!parsed.success) report('PLUGIN_TRAITS_INVALID', `Plugin ${p.id}: invalid traits for ${name}: ${parsed.error.message}`, source);
          else checked[name] = parsed.data;
        }
        if (c.inherit !== undefined) {
          const parsed = InheritSchema.safeParse(this.envelope(p, c.inherit, source));
          if (!parsed.success) report('PLUGIN_TRAITS_INVALID', `Plugin ${p.id}: invalid property inheritance for ${name}`, source);
          else this.inherits.set(type, parsed.data);
        }
        if (c.intrinsic !== undefined) {
          if (!/^[a-z][a-z0-9]*$/.test(c.intrinsic) || this.intrinsic.has(c.intrinsic)) report('PLUGIN_TRAITS_INVALID', `Plugin ${p.id}: invalid or duplicate intrinsic ${c.intrinsic}`, source);
          else this.intrinsic.set(c.intrinsic, type);
        }
      }
      this.info[p.id] = { ...(Object.keys(actions).length ? { actions } : {}), ...(object(themes) && Object.keys(themes).length ? { themes: themes as Record<string, string> } : {}), ...(Object.keys(properties).length ? { properties: properties as NonNullable<PluginInfo['properties']> } : {}), ...(p.data ? { data: this.envelope(p, p.data, source) as PluginInfo['data'] } : {}), id: p.id, title: p.title, ...(p.version ? { version: p.version } : {}), components: Object.fromEntries(Object.entries(p.components).map(([name, c]) => [name, { ...shown[name], ...(checked[name] ? {traits:checked[name]} : {}), ...(c?.interactive ? { interactive: true } : {}), ...(c?.parent ? { parent: c.parent } : {}), ...(c?.needsId ? { needsId: true } : {}), ...(c?.selfEvident ? { selfEvident: true } : {}) }])) };
    }
  }
  private run<T>(p: PluginDef, hook: string, at: string | undefined, fn: () => T): T | undefined {
    try { return fn(); } catch (e) { this.report('PLUGIN_HOOK_FAILED', `Plugin ${p.id} ${hook}: ${errorMessage(e)}`, at); return undefined; }
  }
  private output<T>(p: PluginDef, value: T, at?: string, authoring = false): T | undefined {
    const synchronous = syncResult(value);
    try { return materialize(synchronous, authoring ? 'authoring' : 'hook'); }
    catch (e) { this.report('PLUGIN_DATA_INVALID', `Plugin ${p.id}: ${errorMessage(e)}`, at); return undefined; }
  }
  private validateProperties(node: JNode): void {
    for (const [key, { plugin, spec }] of this.properties) {
      const value = node.props[key];
      if (value === undefined) continue;
      if (typeof value !== spec.type || typeof value === 'number' && (!Number.isFinite(value) || spec.min !== undefined && value < spec.min || spec.max !== undefined && value > spec.max)
        || spec.nonempty && typeof value === 'string' && !value.trim()
        || spec.values && !spec.values.includes(value as string))
        this.report('PLUGIN_PROPERTY_INVALID', `Plugin ${plugin.id}: ${key} requires a literal ${spec.type}${spec.min !== undefined ? ` >= ${spec.min}` : ''}${spec.max !== undefined ? ` <= ${spec.max}` : ''}${spec.nonempty ? ' (nonempty)' : ''}${spec.values ? ` (one of ${spec.values.join(', ')})` : ''}`, node.source);
    }
  }
  private resourceProps(value: unknown, source?: string): unknown {
    if (Array.isArray(value)) return value.map(v => this.resourceProps(v, source));
    if (!object(value)) return value;
    if (value.kind === 'local-resource') {
      const { plugin, compiler, input } = value;
      if (typeof plugin !== 'string' || !this.defs.get(plugin)?.local || typeof compiler !== 'string' || !/^[a-z][a-z0-9-]*$/.test(compiler) || typeof input !== 'string') {
        this.report('LOCAL_RESOURCE_INVALID', 'Enable the resource plugin in config.plugins and supply a compiler with text input', source); return '';
      }
      const key = JSON.stringify([plugin, compiler, input]);
      let id = this.resourceIds.get(key);
      if (!id) { id = `resource-${this.resourceIds.size}`; this.resourceIds.set(key, id); this.resourceOwners.set(id, plugin); this.resourceRequests.set(id, { plugin, compiler, input }); this.options.onResource?.({ id, plugin, compiler, input, source }); }
      return `joplo-resource:${id}`;
    }
    return { ...value, ...Object.fromEntries(Object.entries(value).map(([k,v]) => [k, this.resourceProps(v, source)])) };
  }
  node(node: JNode, ids: ReadonlyMap<string, string | undefined>): JNode {
    node = { ...node, props: this.resourceProps(node.props, node.source) as JNode['props'] };
    const p = this.defs.get(node.type.split(':')[0]!);
    if (!p) {
      this.validateProperties(node);
      return node;
    }
    const result = this.run(p, 'node', node.source, () => {
      const n = this.output(p, p.compile?.node?.(snapshot(node), { ids: new Map(ids), report: this.report }), node.source, true);
      if (n === undefined) return node;
      if (!isNode(n) || typeof n.type !== 'string' || !object(n.props)) {
        this.report('PLUGIN_DATA_INVALID', `Plugin ${p.id} node must return a node with string type and object props`, node.source); return node;
      }
      try { authoringData(n.props); } catch { this.invalid(p, node.source); return node; }
      // Only this node's type/props can be normalized; children already have checked identities.
      return { ...node, type: n.type, props: n.props };
    });
    const normalized = result ?? node;
    this.validateProperties(normalized);
    return normalized;
  }
  derive(scene: Scene): void {
    const visit = (node: SceneNode) => {
      const p = this.defs.get(node.type.split(':')[0]!);
      if (p?.compile?.derive) {
        this.run(p, 'derive', node.source, () => {
          const result = this.output(p, p.compile!.derive!(snapshot(node), { viewport: scene.viewport, report: this.report, options: snapshot(this.options.pluginOptions?.[p.id] ?? {}) }), node.source);
          if (result === undefined) return;
          if (!object(result) || Object.keys(result).some(k => k !== 'data' && k !== 'framing')) { this.invalid(p, node.source); return; }
          if (result.data !== undefined) {
            const data = this.checkData(p, 'node', result.data, node.source);
            if (data !== undefined) node.ext = { ...node.ext, [p.id]: data };
          }
          if (result.framing !== undefined) {
            const nodes = new Map<string, SceneNode>();
            const collect = (n: SceneNode) => { nodes.set(n.id, n); n.children?.forEach(collect); }; collect(node);
            const framing = this.envelope(p, result.framing, node.source);
            if (!object(framing) || Object.entries(framing).some(([id, f]) => !nodes.has(id) || !object(f) || Object.keys(f).some(k => k !== 'include' && k !== 'kind') || f.include !== undefined && !strings(f.include) || f.kind !== undefined && !['root', 'group', 'block', 'content', 'edge', 'row'].includes(String(f.kind)))) { this.invalid(p, node.source); return; }
            for (const [id, frame] of Object.entries(framing)) nodes.get(id)!.framing = frame as SceneNode['framing'];
          }
        });
      }
      for (const c of node.children ?? []) visit(c);
    };
    visit(scene.root);
    // Identities are stage-local and remain an invariant after every derivation pass.
    const ids = new Set<string>();
    const checkIdentity = (n: SceneNode) => {
      if (typeof n.id !== 'string' || !n.id) this.report('MISSING_ID', 'Derived node requires a nonempty id', n.source);
      else if (ids.has(n.id)) this.report('DUPLICATE_ID', `Duplicate id "${n.id}" after plugin derivation in ${scene.id}`, n.source);
      ids.add(n.id);
      for (const child of n.children ?? []) checkIdentity(child);
    };
    checkIdentity(scene.root);
  }
  effect(effect: PluginEffectDef, scenes: readonly Scene[], data: unknown, source?: string) {
    const p = this.defs.get(effect.plugin);
    if (!p?.compile?.effect) { this.report('PLUGIN_EFFECT_UNKNOWN', `Plugin ${effect.plugin} has no effect compiler for ${effect.name}`, source); return undefined; }
    return this.run(p, 'effect', source, () => {
      const frozen = this.frozenScenes(scenes);
      const result = this.output(p, p.compile!.effect!(snapshot(effect), { roots: frozen.roots, scenes: frozen.scenes, data: snapshot(data), source, report: this.report, resourceInfo: id => this.resourceOwners.get(id) === p.id ? snapshot(this.infoOf(id)) : undefined, resource: request => {
        request = materialize(request);
        if (!request || typeof request.compiler !== 'string' || !/^[a-z][a-z0-9-]*$/.test(request.compiler) || typeof request.input !== 'string' || Object.keys(request).some(k => k !== 'compiler' && k !== 'input')) throw new Error('resource requires compiler and text input');
        const key = JSON.stringify([p.id, request.compiler, request.input]);
        let id = this.resourceIds.get(key);
        if (!id) { id = `resource-${this.resourceIds.size}`; this.resourceIds.set(key, id); this.resourceOwners.set(id, p.id); this.resourceRequests.set(id, { plugin: p.id, compiler: request.compiler, input: request.input }); this.options.onResource?.({ id, plugin: p.id, compiler: request.compiler, input: request.input, ...(source ? { source } : {}) }); }
        return id;
      } }), source);
      if (result === undefined) return;
      if (!object(result) || Object.keys(result).some(k => !['data', 'targets', 'references', 'media', 'writes', 'directorTarget', 'holdMs'].includes(k)) || result.targets !== undefined && !strings(result.targets) || result.references !== undefined && !strings(result.references)) { this.invalid(p, source); return; }
      if (result.media !== undefined && (!Array.isArray(result.media) || result.media.some(c => !validMediaCommand(c, p.id, this.resourceOwners)))) {
        this.invalid(p, source); return;
      }
      if (result.writes !== undefined && (!Array.isArray(result.writes) || result.writes.some(w => !object(w) || Object.keys(w).some(k => k !== 'path' && k !== 'value') || !Object.hasOwn(w, 'value') || typeof w.path !== 'string' || !/^(ui|data|inputs)(\.[A-Za-z0-9_-]+)+$/.test(w.path) || w.path.split('.').some(k => ['__proto__', 'prototype', 'constructor'].includes(k))))) { this.invalid(p, source); return; }
      if (result.directorTarget !== undefined && (typeof result.directorTarget !== 'string' || !result.directorTarget)) { this.invalid(p, source); return; }
      // 效果时长（D98）：这一步至少停留多久（引擎毫秒，0–60000）
      if (result.holdMs !== undefined && (typeof result.holdMs !== 'number' || !Number.isFinite(result.holdMs) || result.holdMs < 0 || result.holdMs > 60_000)) { this.invalid(p, source); return; }
      const writes = result.writes === undefined ? undefined : this.envelope(p, result.writes, source) as typeof result.writes;
      if (result.writes !== undefined && writes === undefined) return;
      const media = result.media?.map(c => ({ ...c, plugin: p.id }));
      const value = result.data === undefined ? undefined : this.envelope(p, result.data, source);
      return { ...(writes ? { writes } : {}), ...(result.directorTarget ? { directorTarget: result.directorTarget } : {}), ...(result.holdMs ? { holdMs: Math.round(result.holdMs) } : {}), ...(media ? { media } : {}), ...(value !== undefined ? { data: value } : {}), ...(result.targets ? { targets: [...result.targets] } : {}), ...(result.references ? { references: [...result.references] } : {}) };
    });
  }
  frames(project: Project): void {
    // 接力（flow({ from })，D92）：先算被接力的一章，下一章第 0 步继承它结尾的配乐（推进它最后一步的停留估算）
    const ended = new Map<string, MediaSnapshot>();
    const order: Scenario[] = [];
    const visit = (sc: Scenario, seen = new Set<string>()) => {
      if (order.includes(sc) || seen.has(sc.id)) return;
      seen.add(sc.id);
      const prev = sc.from ? project.scenarios[sc.from] : undefined;
      if (prev) visit(prev, seen);
      order.push(sc);
    };
    for (const sc of Object.values(project.scenarios)) visit(sc);
    for (const sc of order) {
      const { roots, scenes } = this.frozenScenes(Object.values(project.scenes).filter(s => s.optionId === sc.optionId || s.optionId == null));
      const prev = sc.from ? project.scenarios[sc.from] : undefined;
      let media: MediaSnapshot = prev && ended.has(prev.id) ? advanceMedia(ended.get(prev.id)!, commitGapMs(project, prev.steps, prev.steps.length - 1)) : {};
      const hasMedia = Object.keys(media).length > 0 || sc.steps.some(step => this.mediaCommands.has(step.id));
      let previousState: PlayState | undefined;
      let state = initialState(project, sc.id);
      let previousData: Record<string, unknown> = {};
      for (let i = 0; i <= sc.steps.length; i++) {
        if (i) {
          try { state = applyStep(project, sc, state); }
          catch { /* Invalid author steps are diagnosed by replay/check; compilation must still return IR. */ }
        }
        const target = i ? sc.steps[i - 1]! : sc;
        const ext = { ...target.ext };
        if (i) {
          // 配乐锚点：上一次提交（i = 1 时是场景开始）到这一步提交之间的计划时长（stepPlan：停留 / 朗读估算 + 这一步的操作演示）
          media = advanceMedia(media, commitGapMs(project, sc.steps, i - 2));
          for (const c of this.mediaCommands.get(sc.steps[i - 1]!.id) ?? []) {
            const key = `${c.plugin}:${c.track}`;
            const current = media[key];
            if (c.action === 'play' && current?.resource === c.resource && c.offsetMs === undefined) {
              // 同一首再 play：继续播放（含取消正在进行的淡出），只更新音量与循环
              const { stopAfterMs: _fading, ...kept } = current;
              media[key] = { ...kept, volume: c.volume ?? 1, loop: c.loop ?? false };
            } else if (c.action === 'play') {
              // 换曲：有 fadeMs 时旧曲换到「轨道>旧资源」键上同时淡出，与新曲交叉，中间没有静音
              if (current && c.fadeMs) media[`${key}>${current.resource}`] = { ...current, stopAfterMs: Math.min(current.stopAfterMs ?? c.fadeMs, c.fadeMs) };
              media[key] = { plugin: c.plugin, resource: c.resource, offsetMs: c.offsetMs ?? 0, ...(c.offsetMs !== undefined ? { startOffsetMs: c.offsetMs } : {}), volume: c.volume ?? 1, loop: c.loop ?? false, fadeInMs: c.fadeMs ?? 0 };
            } else {
              for (const k of Object.keys(media)) if (k === key || k.startsWith(`${key}>`)) {
                if (c.fadeMs) media[k] = { ...media[k]!, stopAfterMs: Math.min(media[k]!.stopAfterMs ?? c.fadeMs, c.fadeMs) }; else delete media[k];
              }
            }
          }
        }
        if (hasMedia) target.media = structuredClone(media);
        // 这一步的状态冻结一次，所有插件的 frame 钩子共用（resolveProps 也读这一份，不为每次取值再拷状态）
        const frozenState = snapshot(state), frozenPrevious = snapshot(previousState);
        for (const p of this.defs.values()) {
          if (p.compile?.frame) {
            const value = this.run(p, 'frame', target.source, () => this.output(p, p.compile!.frame!({ roots, scenes, state: frozenState, previousState: frozenPrevious, resolveProps: (node, previous) => resolveProps(node, previous && frozenPrevious ? frozenPrevious : frozenState), data: snapshot(target.ext?.[p.id]), previousData: snapshot(previousData[p.id]), position: i, report: this.report }), target.source));
            if (value !== undefined) ext[p.id] = value;
          }
        }
        // Validate every final slot, including effect data left unchanged by an abstaining frame.
        const validated: Record<string, unknown> = {};
        for (const [id, value] of Object.entries(ext)) {
          const p = this.defs.get(id);
          if (!p) { this.report('PLUGIN_DATA_INVALID', `Unregistered plugin slot ${id}`, target.source); continue; }
          const data = this.checkData(p, 'step', value, target.source);
          if (data !== undefined) validated[id] = data;
        }
        if (Object.keys(validated).length) target.ext = validated;
        else delete target.ext;
        previousData = validated;
        previousState = state;
      }
      ended.set(sc.id, media);
    }
  }
  private invalid(p: PluginDef, at?: string) { this.report('PLUGIN_DATA_INVALID', `Plugin ${p.id}: invalid hook output envelope`, at); }
  private envelope(p: PluginDef, value: unknown, at?: string): unknown {
    try { return jsonData(value); } catch (e) { this.report('PLUGIN_DATA_INVALID', `Plugin ${p.id}: ${errorMessage(e)}`, at); return undefined; }
  }
  private checkData(p: PluginDef, slot: 'node' | 'step', value: unknown, at?: string): unknown {
    if (value === undefined) return;
    const data = this.envelope(p, value, at);
    if (data === undefined) return;
    return this.run(p, `${slot} schema`, at, () => {
      const schema = p.schemas?.[slot];
      if (!schema) { this.report('PLUGIN_DATA_INVALID', `Plugin ${p.id} writes ${slot} data without a schema`, at); return; }
      const r = syncResult(schema.safeParse(snapshot(data)));
      if (!r || r.success !== true) { this.report('PLUGIN_DATA_INVALID', `Plugin ${p.id} ${slot}: ${r?.error?.message ?? 'invalid data'}`, at); return; }
      return data;
    });
  }
}
