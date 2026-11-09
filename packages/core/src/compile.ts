import { lowerWorks } from './authoring-works.ts';
import { resolveSlices } from './sequencing.ts';
import { validActionData, pluginActionSpec } from './actions.ts';
/**
 * 编译：作者的源文件（经 @joplo-app/kit 收集成数据）→ IR v2。组件词汇对齐 Mantine（D35），见 catalog.ts。
 *
 * 路径优先的堆叠（D28）：画面 = 布局 + 页面 + 各功能方案填入插槽的元素。
 * - dev 模式：每个方案在每个路径上各有一个画面 `<方案>@<路径>`，其中其他功能取选定方案，本功能取该方案；
 *   另有发布视图 `@<路径>`（全部取选定方案）。
 * - publish 模式：只有发布视图；只含选定方案的场景；去掉规则、情况、问题等创作侧信息（D33）。
 * - review 模式（评审版，D63）：画面与场景同 dev（所有功能的所有方案），创作侧信息按 publish 的规则去掉。
 */
import { createNode, isBind, isNode, bindPath, toCondition, type JNode, type JChild } from '@joplo-app/kit/node';
import type { ConfigDef, FeatureDef, LayoutDef, OptionDef, PageDef, StepDef, EffectDef, CaseDef, PluginDef, WorkDef } from '@joplo-app/kit';
import { BUILTIN_THEMES, COMPONENT_TYPES, DIRECTOR_LAYER, PAGE_LAYER, isInteractiveType, matchChoice, nodeLabel, pluginSpec, splitPluginType, type PluginInfo } from './catalog.ts';
import { HOLD_MAX_SECONDS, HOLD_MIN_SECONDS, inShotFrame } from './focus.ts';
import { cameraOf, choicesOf, commonPrefix, replayTo } from './player.ts';
import { Action, Effect, CALLOUT_SIDES, LAYER_ICONS, Project, SCHEMA_VERSION, type Callout, type Cue, type LayerIcon, type SceneNode, type Scene, type Scenario, type Step, type Coverage } from './schema.ts';
import type { Diagnostic } from './result.ts';
import { schemaDiagnostics } from './schema-issues.ts';
import { CONTENT_LOCALES, collectMessages, isContentLocale, nearestKey, pruneMessages } from './content-i18n.ts';
import { PluginCompiler, type CompileOptions } from './plugins/compiler.ts';
import { materialize, errorMessage } from './plugins/data.ts';
export type { CompileOptions } from './plugins/compiler.ts';

export type AuthoringProject = {
  /** 项目根目录绝对路径，用于把源位置改成相对路径。 */
  root: string;
  config: ConfigDef & { file: string };
  layouts: Record<string, LayoutDef & { file: string }>;
  routes: Record<string, PageDef & { file: string }>;
  features: Record<string, { def: FeatureDef & { file: string }; options: Record<string, OptionDef & { file: string }> }>;
  /** 独立作品文件名为条目键；可省略以保持既有项目的输入与 IR 不变。 */
  works?: Record<string, WorkDef & { file: string }>;
  /** 作者主题（D51）：themes/<name>.css 的原文。 */
  themes?: Record<string, string>;
  /** 作者内容译文（D84）：locales/<语言>.json 的内容（原文 → 译文）；语言 → 文件相对路径见 localeFiles。 */
  locales?: Record<string, Record<string, string>>;
  localeFiles?: Record<string, string>;
};

export type CompileResult = { project: Project | null; diagnostics: Diagnostic[] };

const KNOWN = new Set<string>(COMPONENT_TYPES);
const OVERLAY = 'overlay';
const MOCK_LABEL = { success: 'Mock success', failure: 'Mock failure', denied: 'Mock permission denied', other: 'Mock' } as const;

export type CompileMode = 'dev' | 'publish' | 'review';

export function compile(src: AuthoringProject, mode: CompileMode, opts: CompileOptions = {}): CompileResult {
  /** 所有方案都参与（dev、review）；创作侧信息要去掉（publish、review）。 */
  const allOpts = mode !== 'publish';
  const strip = mode !== 'dev';
  const diags: Diagnostic[] = [];
  const rel = (s?: string) => (s ? relSource(src.root, s) : undefined);
  const publicMessage = (message: string): string => {
    for (const key of Object.keys(src.works ?? {})) message = message.replaceAll(`Feature ${key}`, `Work ${key}`).replaceAll(`Option ${key}.main`, `Work ${key}`).replaceAll(`option ${key}.main`, `work ${key}`).replaceAll(`${key}.main`, key);
    return message;
  };
  const err = (code: string, message: string, at?: string, ref?: Diagnostic['ref']) =>
    diags.push({ severity: 'error', code, message: publicMessage(message), source: 'reference', ...(at ? { at: rel(at) } : {}), ...(ref ? { ref } : {}) });
  const warn = (code: string, message: string, at?: string, ref?: Diagnostic['ref']) =>
    diags.push({ severity: 'warning', code, message: publicMessage(message), source: 'structure', ...(at ? { at: rel(at) } : {}), ...(ref ? { ref } : {}) });
  /** 元素树里的诊断：同一份 JSX 展开到多个画面时，提示类（warning / info）只报一次。 */
  const seenHints = new Set<string>();
  const report: ErrFn = (code, message, at, severity = 'error') => {
    if (severity === 'error') return err(code, message, at);
    const key = `${code}|${at}|${message}`;
    if (seenHints.has(key)) return;
    seenHints.add(key);
    diags.push({ severity, code, message: publicMessage(message), source: 'structure', ...(at ? { at: rel(at) } : {}) });
  };

  const lowered = lowerWorks(src, mode, report);
  src = lowered.source;
  const works = lowered.works;
  const isolated = (fid: string) => works.has(fid) && works.get(fid)!.on === undefined && works.get(fid)!.routes === undefined;
  if (diags.some(d => d.severity === 'error')) return { project: null, diagnostics: diags };

  /** flow({ from }) 接力：所有场景编译完后，按回放结果替换初始状态（见文末）。 */
  const pendingFrom = new Map<string, { from: string; state: OptionDef['state']; layer: string | undefined; at: string | undefined }>();
  const out: Record<string, any> = {
    schemaVersion: SCHEMA_VERSION,
    name: src.config.name,
    description: src.config.description ?? '',
    theme: src.config.theme ?? 'sketch',
    // 默认焦点行为（D70）：只有作者写了才进 IR（缺省 = 开启），不用这个开关的项目 IR 不变
    ...(typeof src.config.autoFocus === 'boolean' ? { autoFocus: src.config.autoFocus } : {}),
    // 朗读配置（D74）：只有作者写了才进 IR；build 用它决定带哪些音频，写进站点前由 publishPayload 去掉
    ...(voiceConfigOf(src.config.voice) ? { voiceConfig: voiceConfigOf(src.config.voice) } : {}),
    themes: { ...(src.themes ?? {}) },
    mode,
    routes: {},
    features: {},
    featureIds: [],
    cases: {},
    options: {},
    rules: {},
    scenes: {},
    scenarios: {},
    issues: {},
  };

  // ---------- 0. 插件（D86）：只取清单里的组件声明，运行时代码不进 IR ----------
  const host = new PluginCompiler(src.config.plugins, report, src.config.source ?? `${src.config.file}:1:1`, opts);
  const plugins = host.info;
  if (Object.keys(plugins).length) out.plugins = plugins;
  const nodeCtx: NodeCtx = { plugins, host, report, rel };

  // ---------- 1. 选出参与的方案 ----------
  // 排序只在编译时决定；显式列表不依赖对象键的枚举顺序，发布模式也保留这份演示内容。
  for (const [fid, f] of Object.entries(src.features)) {
    if (f.def.order !== undefined && (typeof f.def.order !== 'number' || !Number.isFinite(f.def.order)))
      err('FEATURE_ORDER_INVALID', `Feature ${fid} order must be a finite number; omit it for folder-name order`, f.def.source ?? `${f.def.file}:1:1`, { kind: 'feature', id: fid });
  }
  if (diags.some(d => d.severity === 'error')) return { project: null, diagnostics: diags };
  const natural = new Intl.Collator('en', { numeric: true });
  const features = Object.entries(src.features).sort(([a, af], [b, bf]) => {
    const ao = af.def.order ?? Infinity, bo = bf.def.order ?? Infinity;
    return ao !== bo ? ao - bo : natural.compare(a, b);
  });
  const linearOptions = new Set<string>();
  type Opt = { fid: string; key: string; qid: string; def: OptionDef & { file: string } };
  const allOptions: Opt[] = [];
  const picked = new Map<string, Opt>(); // fid -> 选定方案
  for (const [fid, f] of features) {
    for (const [key, def] of sortedEntries(f.options)) {
      const qid = `${fid}.${key}`;
      const slices = resolveSlices(def.scenarios ?? {}, works.has(fid) ? `Work ${fid}` : `Option ${qid}`, err);
      if (slices.linear) linearOptions.add(qid);
      allOptions.push({ fid, key, qid, def: { ...def, scenarios: slices.scenarios } });
    }
    const pick = f.def.pick ?? null;
    if (pick) {
      const o = allOptions.find((x) => x.fid === fid && x.key === pick);
      if (o) picked.set(fid, o);
      else err('UNKNOWN_PICK', `Feature ${fid} pick "${pick}" is not an option under options/`, f.def.source);
    } else if (mode === 'publish') warn('NOT_PICKED', `Feature "${f.def.name}" has no picked option and will not be published`, f.def.source);
  }
  const included = allOpts ? allOptions : [...picked.values()];

  // ---------- 2. 路径表 ----------
  type RouteEntry = { path: string; page: PageDef & { file: string }; addedBy?: Opt };
  const baseRoutes = new Map<string, RouteEntry>();
  for (const [path, p] of sortedEntries(src.routes)) baseRoutes.set(path, { path, page: p });
  const addedRoutes = new Map<string, RouteEntry>(); // `${qid}|${path}`
  for (const o of allOptions) {
    for (const [path, p] of Object.entries(o.def.routes ?? {})) {
      if (!path.startsWith('/')) err('BAD_ROUTE', `Route must start with /: ${path}`, o.def.source);
      if (baseRoutes.has(path)) err('ROUTE_EXISTS', `Option ${o.qid} adds route ${path} which already exists in routes/; use on to add elements instead`, p.source ?? o.def.source);
      addedRoutes.set(`${o.qid}|${path}`, { path, page: { ...p, file: o.def.file }, addedBy: o });
    }
  }
  // 只使用 stage / layers 的独立作品从空白画面开始；写了 on / routes 就复用项目页面。
  const blankRoute: RouteEntry = { path: '/', page: { kind: 'page', title: 'Work stage', layout: false, tree: createNode('#fragment', {}), file: '' } };
  if (!baseRoutes.size && works.size) baseRoutes.set('/', blankRoute);
  /** 在给定方案上下文（null = 发布视图）中可见的路径。 */
  const routesIn = (ctx: Opt | null): RouteEntry[] => {
    if (ctx && isolated(ctx.fid)) return [blankRoute];
    const added = [...addedRoutes.values()].filter((r) => {
      const by = r.addedBy!;
      if (ctx && by.qid === ctx.qid) return true;
      if (ctx && by.fid === ctx.fid) return false; // 同功能的其他方案
      return picked.get(by.fid)?.qid === by.qid;
    });
    return [...baseRoutes.values(), ...added];
  };

  const layoutOf = (page: PageDef): string | null => (page.layout === false ? null : (page.layout ?? src.config.layout ?? null));
  for (const r of [...baseRoutes.values(), ...(works.size ? [blankRoute] : []), ...[...addedRoutes.values()].filter((r) => included.some((o) => o.qid === r.addedBy!.qid))]) {
    const lid = layoutOf(r.page);
    if (lid && !src.layouts[lid]) err('UNKNOWN_LAYOUT', `Page ${r.path} uses an unknown layout "${lid}"`, r.page.source);
    if (out.routes[r.path]) continue;
    const slots = new Set<string>();
    collectSlots(r.page.tree, slots);
    if (lid && src.layouts[lid]) collectSlots(src.layouts[lid]!.tree, slots);
    out.routes[r.path] = {
      path: r.path,
      title: r.page.title,
      layout: lid,
      ...(r.addedBy ? { addedBy: r.addedBy.qid } : {}),
      slots: [...slots].sort(),
      ...(r.page.source ? { source: rel(r.page.source) } : {}),
    };
  }

  // ---------- 3. 功能、情况、规则、问题 ----------
  for (const [fid, f] of features) {
    const fdef = f.def;
    if (mode === 'publish' && !picked.has(fid)) continue;
    out.featureIds.push(fid);
    const caseIds = Object.keys(fdef.cases ?? {}).map((k) => `${fid}.${k}`);
    out.features[fid] = {
      id: fid,
      ...(works.has(fid) ? { standalone: true, ...(works.get(fid)!.audience?.trim() ? { audience: works.get(fid)!.audience!.trim() } : {}), ...(mode === 'dev' && works.get(fid)!.draft === true ? { draft: true } : {}) } : {}),
      name: fdef.name,
      goal: fdef.goal,
      roles: rolesOf(fdef.roles),
      constraints: Object.entries(fdef.constraints ?? {}).map(([id, c]) => (typeof c === 'string' ? { id, text: c, hard: true } : { id, text: c.text, hard: c.hard ?? true })),
      caseIds: strip ? [] : caseIds,
      optionIds: included.filter((o) => o.fid === fid).map((o) => o.qid),
      pick: picked.get(fid)?.qid ?? null,
      ...(fdef.source ? { source: rel(fdef.source) } : {}),
    };
    if (strip) continue;
    for (const [k, c] of Object.entries(fdef.cases ?? {})) out.cases[`${fid}.${k}`] = caseOf(`${fid}.${k}`, fid, c, rel(fdef.source));
    for (const [k, r] of Object.entries(fdef.rules ?? {})) out.rules[`${fid}.${k}`] = ruleOf(`${fid}.${k}`, fid, undefined, r, rel);
    for (const [k, q] of Object.entries(fdef.questions ?? {})) out.issues[`${fid}.${k}`] = { id: `${fid}.${k}`, featureId: fid, text: q.text, severity: q.severity, refs: q.refs, ...(q.source ? { source: rel(q.source) } : {}) };
  }

  // ---------- 4. 画面合成 ----------
  const contributionsFor = (ctx: Opt | null): Opt[] => {
    if (ctx && isolated(ctx.fid)) return [ctx];
    const list = [...picked.values()].filter((o) => !ctx || o.fid !== ctx.fid);
    if (ctx) list.push(ctx);
    return list;
  };
  const composeScene = (route: RouteEntry, ctx: Opt | null): Scene => {
    const sceneId = ctx ? `${ctx.qid}@${route.path}` : `@${route.path}`;
    const page = route.page;
    const lid = layoutOf(page);
    const layoutTree = lid ? src.layouts[lid]?.tree : undefined;
    const contribs = new Map<string, { node: JNode; from: string }[]>();
    for (const o of contributionsFor(ctx)) {
      const slots = o.def.on?.[route.path];
      if (!slots) continue;
      for (const [slot, val] of Object.entries(slots)) {
        const list = contribs.get(slot) ?? [];
        for (const n of Array.isArray(val) ? val : [val]) list.push({ node: n, from: o.qid });
        contribs.set(slot, list);
      }
    }
    const used = new Set<string>();
    const fill = (name: string): JChild[] => {
      used.add(name);
      return (contribs.get(name) ?? []).map((c) => tagFrom(c.node, c.from));
    };
    const pageNode = expandSlots(page.tree, fill);
    const tree = layoutTree ? expandSlots(layoutTree, fill, pageNode) : pageNode;
    const overlays = used.has(OVERLAY) ? [] : fill(OVERLAY);
    for (const slot of contribs.keys()) {
      if (!used.has(slot)) {
        const from = contribs.get(slot)![0]!.from;
        const o = allOptions.find((x) => x.qid === from);
        err('UNKNOWN_SLOT', `Option ${from} adds elements to route ${route.path} slot "${slot}", but the page and layout have no <Slot name="${slot}" />`, o?.def.source, {
          kind: 'option',
          id: from,
        });
      }
    }
    const base = tree as JNode;
    const rootJ: JNode = { ...base, type: base.type, children: [...base.children, ...overlays] };
    const ids = new Map<string, string | undefined>();
    const root = toSceneNode(rootJ, 'root', ids, nodeCtx, null);
    const scene: Scene = { id: sceneId, optionId: ctx?.qid ?? null, route: route.path, name: `${page.title}${ctx ? ` · ${ctx.def.name}` : ''}`, viewport: page.viewport ?? 'desktop', root };
    if (!diags.some(d => d.severity === 'error')) host.derive(scene);
    return scene;
  };

  if (src.config.voice !== undefined && !voiceConfigOf(src.config.voice, true))
    err('VOICE_CONFIG_INVALID', `config({ voice }) must be { profile?: string, narrator?: string, roles?: { [roleKey]: string }, locales?: { [locale]: { narrator?: string, roles?: { [roleKey]: string } } } } with non-empty strings; got ${JSON.stringify(src.config.voice)}`, src.config.source ?? `${src.config.file}:1:1`);
  const i18nCfg = contentLocalesOf(src, err);
  if (i18nCfg) out.i18n = { default: i18nCfg[0]!, locales: i18nCfg, messages: Object.fromEntries(i18nCfg.slice(1).map((l) => [l, Object.fromEntries(Object.entries(src.locales?.[l] ?? {}).filter(([, v]) => typeof v === 'string' && v.trim()))])) };
  if (src.config.autoFocus !== undefined && typeof src.config.autoFocus !== 'boolean')
    err('AUTOFOCUS_INVALID', `config({ autoFocus }) must be true or false (default true); got ${JSON.stringify(src.config.autoFocus)}`, src.config.source ?? `${src.config.file}:1:1`);
  // 主题（D51）：config.theme 必须是内置主题或 themes/<name>.css
  {
    const t = src.config.theme ?? 'sketch';
    const authorThemes = [...Object.keys(out.themes), ...Object.keys(host.themes)];
    if (!(BUILTIN_THEMES as readonly string[]).includes(t) && !authorThemes.includes(t))
      err('THEME_UNKNOWN', `config({ theme: '${t}' }) is not a built-in theme (${BUILTIN_THEMES.join(', ')}), and the project has no themes/${t}.css${authorThemes.length ? ` (author themes: ${authorThemes.join(', ')})` : ''}`, src.config.source ?? `${src.config.file}:1:1`);
  }
  const sceneFor = new Map<string, Scene>();
  const addScene = (s: Scene) => {
    sceneFor.set(s.id, s);
    out.scenes[s.id] = s;
  };
  for (const r of routesIn(null)) addScene(composeScene(r, null));
  for (const o of included) if (allOpts || works.has(o.fid)) for (const r of routesIn(o)) addScene(composeScene(r, o));

  // ---------- 5. 方案、场景、覆盖 ----------
  for (const o of included) {
    const { def, fid, qid } = o;
    const fdef = src.features[fid]!.def;
    const isStandalone = out.features[fid]?.standalone === true;
    const isIsolated = isolated(fid);
    const ctxRoutes = new Set(routesIn(o).map((r) => r.path));
    const touched = [...Object.keys(def.on ?? {}), ...Object.keys(def.routes ?? {})];
    for (const p of Object.keys(def.on ?? {})) if (!ctxRoutes.has(p)) err('UNKNOWN_ROUTE', `Option ${qid} adds elements to an unknown route ${p}`, def.source);
    const sceneOf = (path: string) => (allOpts || isStandalone ? `${qid}@${path}` : `@${path}`);

    if (mode === 'dev') {
      for (const [k, r] of Object.entries(def.rules ?? {})) out.rules[`${qid}.${k}`] = ruleOf(`${qid}.${k}`, fid, qid, r, rel);
      for (const [k, q] of Object.entries(def.questions ?? {}))
        out.issues[`${qid}.${k}`] = { id: `${qid}.${k}`, featureId: fid, optionId: qid, text: q.text, severity: q.severity, refs: q.refs, ...(q.source ? { source: rel(q.source) } : {}) };
    }
    const ruleQid = (key: string, at?: string): string | null => {
      if (def.rules?.[key]) return `${qid}.${key}`;
      if (fdef.rules?.[key]) return `${fid}.${key}`;
      err('UNKNOWN_RULE', `uses("${key}") references an unknown rule (use a key from option.rules or feature.rules)`, at);
      return null;
    };

    /** 可被引用的角色键（D56）：feature.roles 写成 { 键: role('名字') } 时才有。 */
    const roleKeys = new Set(fdef.roles && !Array.isArray(fdef.roles) ? Object.keys(fdef.roles) : []);
    // ---------- 层级（T-layers）：每层一个完全独立的画面，单独编译、单独渲染 ----------
    const layers: Record<string, { title: string; sceneId: string; role?: string; icon?: LayerIcon }> = {};
    const layerScenes: { key: string; scene: Scene }[] = [];
    const layerRoute = isIsolated ? '/' : touched.find((r) => ctxRoutes.has(r)) ?? src.config.home ?? [...ctxRoutes][0] ?? '/';
    for (const [lk, ld] of Object.entries(def.layers ?? {})) {
      const at = ld.source ?? def.source;
      if (!/^[A-Za-z_][\w-]*$/.test(lk)) {
        err('LAYER_UNKNOWN', `Layer key "${lk}" must use letters, digits, underscores, and hyphens and must not start with @`, at);
        continue;
      }
      const tree = flatten(Array.isArray(ld.tree) ? ld.tree : [ld.tree]);
      const nodes = tree.filter(isNode);
      if (!nodes.length) {
        err('LAYER_UNKNOWN', `Layer "${ld.title}" has no content: layer(title, <Page />)`, at);
        continue;
      }
      const rootJ: JNode = nodes.length === 1 ? nodes[0]! : { ...nodes[0]!, type: '#fragment', props: {}, children: nodes };
      const ids = new Map<string, string | undefined>();
      const root = toSceneNode(rootJ, `layer_${lk}`, ids, nodeCtx, null);
      const sceneId = `${qid}~${lk}`;
      const scene: Scene = { id: sceneId, optionId: qid, route: layerRoute, name: `${ld.title} · ${def.name}`, viewport: ld.viewport ?? 'desktop', root, layer: lk };
      if (!diags.some(d => d.severity === 'error')) host.derive(scene);
      addScene(scene);
      layerScenes.push({ key: lk, scene });
      if (ld.role !== undefined && !roleKeys.has(ld.role))
        err('ROLE_UNKNOWN', `Layer "${ld.title}" role "${ld.role}" is not in feature.roles${roleKeys.size ? ` (available: ${[...roleKeys].join(', ')})` : ' (feature.roles must use { key: role(\'Name\') })'}`, at);
      const icon = ld.icon as string | undefined;
      const iconOk = icon !== undefined && (LAYER_ICONS as readonly string[]).includes(icon);
      if (icon !== undefined && !iconOk) err('ICON_UNKNOWN', `Layer "${ld.title}" icon "${icon}" is not a preset icon (available: ${LAYER_ICONS.join(', ')})`, at);
      layers[lk] = { title: ld.title, sceneId, ...(ld.role !== undefined && roleKeys.has(ld.role) ? { role: ld.role } : {}), ...(iconOk ? { icon: icon as LayerIcon } : {}) };
    }
    const hasLayers = layerScenes.length > 0;
    /** 元素在哪些层级里（多层都有同名 id 时都算）。 */
    const layersWith = (id: string): string[] => layerScenes.filter((l) => findIn(l.scene.root, id)).map((l) => l.key);
    const layerSceneWith = (id: string): Scene | undefined => layerScenes.find((l) => findIn(l.scene.root, id))?.scene;

    const effectRoots = [...layerScenes.map(l => l.scene), ...[...sceneFor.values()].filter(x => x.optionId === qid || !isIsolated && x.optionId == null)];

    const scenarioIds: Record<string, string[]> = {};
    // flow({ from }) 接力：按依赖顺序编译，被接的场景先编译，记下它结尾的路径与导演层；
    // 接力场景的逐步校验（页面里找目标、焦点提示、镜头、自动字幕）都从那里开始，而不是默认起点
    const scenarioDefs = def.scenarios ?? {};
    const orderedKeys: string[] = [];
    {
      const placed = new Set<string>();
      const place = (k: string, seen: Set<string>) => {
        if (placed.has(k) || seen.has(k)) return;
        seen.add(k);
        const dep = scenarioDefs[k]?.opts.from;
        if (dep !== undefined && dep !== k && Object.hasOwn(scenarioDefs, dep)) place(dep, seen);
        placed.add(k);
        orderedKeys.push(k);
      };
      for (const k of Object.keys(scenarioDefs)) place(k, new Set());
    }
    /** 每个场景编译完之后的结尾：路径（按 go / back 推算）与导演层。 */
    const scenarioEnd = new Map<string, { route: string; director: string }>();
    for (const skey of orderedKeys) {
      const fl = scenarioDefs[skey]!;
      const sid = `${qid}.${skey}`;
      const fromEnd = fl.opts.from !== undefined && fl.opts.from !== skey ? scenarioEnd.get(fl.opts.from) : undefined;
      if (fl.opts.from !== undefined && fl.opts.start !== undefined)
        err('FROM_WITH_START', `flow({ from: ${JSON.stringify(fl.opts.from)}, start: ${JSON.stringify(fl.opts.start)} }): a scenario that continues another starts where that one ended; remove start (or remove from to start fresh)`, fl.source);
      const start = fromEnd?.route ?? fl.opts.start ?? (isIsolated ? '/' : touched[0] ?? src.config.home ?? [...ctxRoutes][0]);
      if (!start || !ctxRoutes.has(start)) {
        err('UNKNOWN_ROUTE', `Scenario ${sid} starts at unknown route ${start ?? '(none)'}`, fl.source);
        continue;
      }
      for (const c of fl.opts.cases ?? []) {
        if (!fdef.cases?.[c]) err('UNKNOWN_CASE', `Scenario ${sid} covers case "${c}", which is not in feature.cases`, fl.source);
        else (scenarioIds[c] ??= []).push(sid);
      }
      // 镜头状态（与 player.cameraAt 同一规则，逐步累积）：判断焦点提示的目标在不在当前镜头里（D70）
      const frame = new Map<string, string[]>();
      let director = fromEnd?.director ?? (hasLayers ? Object.keys(layers)[0]! : PAGE_LAYER);
      if (fl.opts.layer !== undefined) {
        if (!hasLayers || !Object.hasOwn(layers, fl.opts.layer)) err('LAYER_UNKNOWN', `flow({ layer: ${JSON.stringify(fl.opts.layer)} }) is not a layer of option ${qid}${hasLayers ? ` (layers: ${Object.keys(layers).join(', ')})` : '; this option declares no layers'}`, fl.source);
        else director = fl.opts.layer;
      }
      if (fl.opts.from !== undefined) {
        if (!Object.hasOwn(def.scenarios ?? {}, fl.opts.from) || fl.opts.from === skey) err('FROM_UNKNOWN', isStandalone || linearOptions.has(qid) ? `${linearOptions.has(qid) ? `Chapter ${String(Object.keys(scenarioDefs).indexOf(skey) + 1).padStart(2, '0')}` : `Slice ${skey}`} of ${isStandalone ? `work ${fid}` : `option ${qid}`}: from ${JSON.stringify(fl.opts.from)} must name another slice key (available slices: ${Object.keys(scenarioDefs).join(', ') || 'none'})` : `flow({ from: ${JSON.stringify(fl.opts.from)} }) must name another scenario key of option ${qid} (available: ${Object.keys(def.scenarios ?? {}).filter((k) => k !== skey).join(', ') || 'none'})`, fl.source);
        else pendingFrom.set(sid, { from: `${qid}.${fl.opts.from}`, state: fl.opts.state, layer: fl.opts.layer, at: fl.source });
      }
      const stepKeys = new Set<string>();
      const stepContext: StepContext = { err, rel, strip, host, out, qid, def, ctxRoutes, sceneOf, sceneFor, ruleQid, roleKeys, hasLayers, layers, layerScenes, layersWith, layerSceneWith, effectRoots, skey, sid, fl, start, stepKeys, frame, director };
      const steps: Step[] = fl.steps.map((st: StepDef, i: number): Step => lowerStep(stepContext, st, i));
      director = stepContext.director;
      // 结局（D65）：flow 的 outcome 优先；没写时取 done(…, outcome) 的第二个参数（cancelled 记为 other）
      const doneOutcome = [...fl.steps].reverse().flatMap((st) => [...st.effects].reverse()).find((e): e is Extract<EffectDef, { type: 'complete' }> => e.type === 'complete')?.outcome;
      const fromDone = doneOutcome === undefined ? undefined : doneOutcome === 'cancelled' ? 'other' : doneOutcome;
      if (fl.opts.outcome !== undefined && fromDone !== undefined && fl.opts.outcome !== fromDone)
        warn('OUTCOME_MISMATCH', `Scenario ${sid} has flow outcome '${fl.opts.outcome}' but ends with done(…, '${doneOutcome}'); the board shows '${fl.opts.outcome}'. Make them agree: change done's second argument, or write flow(…, { outcome: '${fromDone}' })`, fl.source);
      const outcome = fl.opts.outcome ?? fromDone ?? 'success';
      const state = mergeState(def.state, fl.opts.state);
      const sc: Scenario = {
        ...(fl.opts.actionEntry !== undefined ? { actionEntry: fl.opts.actionEntry } : {}),
        id: sid,
        optionId: qid,
        name: fl.name,
        ...(fl.opts.autoplay !== undefined ? { autoplay: fl.opts.autoplay } : {}),
        description: fl.opts.description ?? '',
        caseIds: strip ? [] : (fl.opts.cases ?? []).filter((c) => fdef.cases?.[c]).map((c) => `${fid}.${c}`),
        mock: { label: fl.opts.mock ?? MOCK_LABEL[outcome], outcome, ...(fl.opts.mock === undefined ? { auto: true as const } : {}) },
        initial: { sceneId: sceneOf(start), ui: state.ui, data: state.data, inputs: state.inputs, ...(hasLayers && fl.opts.layer !== undefined && Object.hasOwn(layers, fl.opts.layer) ? { layer: fl.opts.layer } : {}) },
        steps,
        expected: fl.opts.expected ?? '',
        ...(fl.source ? { source: rel(fl.source) } : {}),
      };
      out.scenarios[sid] = sc;
      scenarioEnd.set(skey, { route: stepRouteBefore(fl.steps, fl.steps.length, start), director });
    }

    // 按依赖顺序编译后，恢复作者声明的顺序（发布站按它当章节播放，情况里的场景列表也按它排）
    {
      const declared = Object.keys(scenarioDefs).map((k) => `${qid}.${k}`);
      for (const id of declared) if (Object.hasOwn(out.scenarios, id)) { const v = out.scenarios[id]; delete out.scenarios[id]; out.scenarios[id] = v; }
      for (const list of Object.values(scenarioIds)) list.sort((a, b) => declared.indexOf(a) - declared.indexOf(b));
    }

    // 所有场景完成后再解析分叉（允许向后声明的场景），不把创作信息参与前缀比较。
    for (const sc of Object.values(out.scenarios) as Scenario[]) {
      if (sc.optionId !== qid) continue;
      for (const st of sc.steps) for (const f of st.forks) {
        const target = out.scenarios[f.scenarioId] as Scenario | undefined;
        if (target) f.at = commonPrefix(sc.steps, target.steps);
      }
    }

    const coverage: Record<string, Coverage> = {};
    if (mode === 'dev') {
      for (const ck of Object.keys(fdef.cases ?? {})) {
        const decl = def.coverage?.[ck];
        const sids = scenarioIds[ck] ?? [];
        if (decl) coverage[`${fid}.${ck}`] = { status: decl.status, scenarioIds: sids, ...(decl.reason ? { reason: decl.reason } : {}), basis: 'declared' };
        else if (sids.length) coverage[`${fid}.${ck}`] = { status: 'expressed', scenarioIds: sids, basis: 'derived' };
        else coverage[`${fid}.${ck}`] = { status: 'missing', scenarioIds: [], basis: 'derived' };
      }
      for (const ck of Object.keys(def.coverage ?? {})) if (!fdef.cases?.[ck]) err('UNKNOWN_CASE', `Option ${qid} coverage declares unknown case "${ck}"`, def.source);
    }
    const free: NonNullable<import('./schema.ts').Option['free']> = {};
    for (const [key, reaction] of Object.entries(def.free ?? {})) {
      const a = Action.safeParse(reaction.action);
      if (!a.success || !('target' in reaction.action)) { err('FREE_ACTION_INVALID', `Free reaction ${key} needs a targeted action`, reaction.source); continue; }
      const roots = effectRoots.filter(scene => scene.optionId === qid || mode === 'publish' && scene.optionId === null);
      const target = reaction.action.target;
      if (!roots.some(scene => findIn(scene.root, target))) err('FREE_TARGET_MISSING', `Free reaction ${key}: target ${reaction.action.target} is not in option ${qid}`, reaction.source);
      const targets = roots.map(scene => findIn(scene.root, target)).filter((n): n is SceneNode => !!n);
      if (reaction.action.type === 'click' && targets.length && !targets.some(n => isInteractiveType(n.type, out.plugins))) err('FREE_ACTION_INVALID', `Free reaction ${key}: ${target} is not interactive`, reaction.source);
      if (['type', 'toggle', 'select'].includes(reaction.action.type) && targets.length && !targets.some(n => n.traits?.input)) err('FREE_ACTION_INVALID', `Free reaction ${key}: ${target} cannot accept values`, reaction.source);
      validateNewAction(reaction.action, roots, out as Project, (code, message) => err(code, message, reaction.source));
      const effects: Step['effects'] = [];
      for (const effect of reaction.effects) {
        if (!['set', 'append', 'toast'].includes(effect.type)) { err('FREE_EFFECT_INVALID', `Free reaction ${key}: ${effect.type} is not local state. Use set, append or toast; navigation, completion and timeline animation belong in steps`, reaction.source); continue; }
        const { kind: _kind, ...raw } = effect;
        const parsed = Effect.safeParse(raw);
        if (!parsed.success || 'path' in raw && (!/^(ui|data|inputs)\.[A-Za-z0-9_.-]+$/.test(String(raw.path)) || String(raw.path).split('.').some(k => ['__proto__', 'constructor', 'prototype'].includes(k)))) err('FREE_EFFECT_INVALID', `Free reaction ${key}: invalid local effect`, reaction.source);
        else effects.push(parsed.data);
      }
      free[key] = { action: a.data, effects, ...(reaction.source ? {source:rel(reaction.source)} : {}) };
    }
    out.options[qid] = {
      ...(Object.keys(free).length ? { free } : {}),
      id: qid,
      ...(linearOptions.has(qid) ? { sequencing: 'linear' } : {}),
      featureId: fid,
      key: o.key,
      name: def.name,
      idea: def.idea,
      decisionFocus: strip ? '' : (def.focus ?? ''),
      tradeoffs: strip ? [] : (def.tradeoffs ?? []),
      routes: touched,
      coverage,
      layers,
      ...(def.source ? { source: rel(def.source) } : {}),
    };
  }

  // ---------- 6. 规则元素引用、AI 假设不能自称已确认 ----------
  if (mode === 'dev') {
    for (const r of Object.values(out.rules) as any[]) {
      if (r.origin === 'ai_assumption' && r.confirmation === 'confirmed')
        err('ASSUMPTION_CONFIRMED', `Rule "${r.text}" is an AI assumption and cannot be Confirmed; use pending, or set origin to user after user confirmation`, r.source);
      for (const c of r.caseIds) if (!out.cases[c]) err('UNKNOWN_CASE', `Rule "${r.text}" links unknown case ${c}`, r.source);
    }
  }

  // flow({ from }) 接力：初始状态 = 被接的场景最后一步之后的状态（路径、ui / data / inputs、导演层），再叠上本场景写的 state。
  // 链式接力按依赖顺序解析；成环或被接的场景回放失败时报错。
  if (pendingFrom.size) {
    const done = new Set<string>();
    const visiting = new Set<string>();
    const resolve = (sid: string): boolean => {
      const p = pendingFrom.get(sid);
      if (!p || done.has(sid)) return true;
      if (visiting.has(sid)) { err('FROM_CYCLE', `Scenario ${sid} continues from itself through flow({ from }); break the cycle`, p.at); return false; }
      visiting.add(sid);
      const ok = resolve(p.from);
      visiting.delete(sid);
      if (!ok) return false;
      const target = out.scenarios[sid];
      const prev = out.scenarios[p.from];
      if (!target || !prev) return false;
      try {
        const end = replayTo(out as Project, p.from, prev.steps.length);
        const hasLayers = Object.keys(out.options[target.optionId]?.layers ?? {}).length > 0;
        const layer = p.layer ?? (hasLayers ? cameraOf(out as Project, p.from, prev.steps.length).directorLayer : undefined);
        const merged = mergeState({ ui: end.ui as never, data: end.data as never, inputs: end.inputs as never }, p.state);
        target.initial = { sceneId: end.sceneId, ui: merged.ui, data: merged.data, inputs: merged.inputs, ...(layer ? { layer } : {}) };
        target.from = p.from;
      } catch (e) {
        err('FROM_FAILED', `Scenario ${sid} continues from ${p.from}, which does not replay: ${(e as Error).message}`, p.at);
        return false;
      }
      done.add(sid);
      return true;
    };
    for (const sid of pendingFrom.keys()) resolve(sid);
    if (diags.some((d) => d.severity === 'error')) return { project: null, diagnostics: diags };
  }

  // 逐步派生数据只在编译期计算，播放器读取快照。
  if (!diags.some(d => d.severity === 'error')) host.frames(out as Project);

  if (diags.some(d => d.severity === 'error')) return { project: null, diagnostics: diags };

  // ---------- 8. 发布视图与评审版：去掉设计备注与源位置 ----------
  if (strip) {
    // 组件的显示名与检查抽屉信息只给本地看板用
    for (const info of Object.values(plugins)) for (const c of Object.values(info.components)) { delete c.label; delete c.inspect; }
    for (const s of Object.values(out.scenes) as Scene[]) stripNotes(s.root);
    stripSources(out);
  }

  if (diags.some((d) => d.severity === 'error')) return { project: null, diagnostics: diags };
  const parsed = Project.safeParse(out);
  if (!parsed.success) {
    // 同一根因（共享的 JSX）在多个画面展开时合并成一条，定位到作者元素（schema-issues.ts）
    diags.push(...schemaDiagnostics(out, parsed.error.issues, { limit: 20, rel }).map(d => ({ ...d, message: publicMessage(d.message) })));
    return { project: null, diagnostics: diags };
  }
  let project = pruneMessages(parsed.data);
  if (mode === 'dev' && project.i18n) {
    const stale = localeDiagnostics(project, src, diags);
    project.i18n = { ...project.i18n, stale };
  }
  // A slot can fit on its own but exceed the public reader's limit once wrapped in
  // scenes/scenarios/steps/ext. Validate that final depth before reporting success.
  if (mode === 'publish') {
    try { project = materialize(project); }
    catch (e) {
      err('PLUGIN_DATA_INVALID', `Published IR is not readable JSON data: ${errorMessage(e)}`, src.config.source ?? `${src.config.file}:1:1`);
      return { project: null, diagnostics: diags };
    }
  }
  return { project, diagnostics: diags };
}

/** config.locales（D84）：非空、不重复、都是支持的语言；第一个是默认语言。没写时为 null。 */
function contentLocalesOf(src: AuthoringProject, err: (code: string, message: string, at?: string) => void): string[] | null {
  const v = src.config.locales;
  const at = src.config.source ?? `${src.config.file}:1:1`;
  if (v === undefined) {
    for (const [l, f] of Object.entries(src.localeFiles ?? {}))
      err('LOCALES_UNDECLARED', `${f} exists but joplo.config.ts has no locales; add locales: ['<source language>', '${l}'] (the first is the language the source files are written in)`, at);
    return null;
  }
  const bad = !Array.isArray(v) || !v.length ? 'must be a non-empty array' : v.find((x) => !isContentLocale(x)) !== undefined ? `contains "${String(v.find((x) => !isContentLocale(x)))}"` : new Set(v).size !== v.length ? 'lists a language twice' : null;
  if (bad) {
    err('LOCALES_INVALID', `config({ locales }) ${bad}. Write the source language first, for example locales: ['zh-CN', 'en', 'ja']; supported: ${CONTENT_LOCALES.join(', ')}`, at);
    return null;
  }
  for (const [l, f] of Object.entries(src.localeFiles ?? {}))
    if (!v.includes(l)) err('LOCALES_UNDECLARED', `${f} is not in config({ locales }); add '${l}' to locales or delete the file`, at);
  if (src.localeFiles?.[v[0]!]) err('LOCALES_UNDECLARED', `${src.localeFiles[v[0]!]} translates the default language ${v[0]}; the source files are already in ${v[0]}, so delete it (or put another language first in locales)`, at);
  return [...v];
}

/**
 * 译文的检查（D84，只在 dev）：每种语言一条 I18N_MISSING（缺多少、前几条）、原文改过的每条一条 I18N_STALE（附最接近的旧条目）、
 * 没人用的旧条目一条 I18N_UNUSED。返回每种语言的过期条数，给看板菜单显示。
 */
function localeDiagnostics(project: Project, src: AuthoringProject, diags: Diagnostic[]): Record<string, number> {
  const i18n = project.i18n!;
  const uses = collectMessages(project);
  const texts = new Set(uses.map((u) => u.text));
  const stale: Record<string, number> = {};
  const q = (s: string) => JSON.stringify(s.length > 40 ? `${s.slice(0, 40)}…` : s);
  for (const l of i18n.locales.slice(1)) {
    const file = src.localeFiles?.[l] ?? `locales/${l}.json`;
    const table = src.locales?.[l] ?? {};
    const unused = Object.keys(table).filter((k) => !texts.has(k) && typeof table[k] === 'string' && table[k]!.trim());
    const missing = uses.filter((u) => !(typeof table[u.text] === 'string' && table[u.text]!.trim()));
    const plain: typeof missing = [];
    const matched = new Set<string>();
    let n = 0;
    for (const m of missing) {
      const old = nearestKey(m.text, unused);
      if (old === null) { plain.push(m); continue; }
      matched.add(old);
      n++;
      diags.push({ severity: 'warning', code: 'I18N_STALE', message: `${file}: no translation for ${q(m.text)}; the closest old entry is ${q(old)}: ${q(table[old]!)} (the source text changed). Update the key and translation`, source: 'structure', ...(m.at ? { at: m.at } : {}) });
    }
    stale[l] = n;
    if (plain.length) {
      const first = plain.slice(0, 5).map((m) => q(m.text)).join(', ');
      const hint = src.localeFiles?.[l] ? `translate them in ${file}` : `run npx joplo i18n add ${l}, then translate ${file}`;
      diags.push({ severity: 'warning', code: 'I18N_MISSING', message: `${l}: ${plain.length} of ${uses.length} texts have no translation (${first}${plain.length > 5 ? `, +${plain.length - 5} more` : ''}); ${hint}. Viewers see the ${i18n.default} source text for them`, source: 'structure', at: `${file}:1:1` });
    }
    const leftover = unused.filter((k) => !matched.has(k));
    if (leftover.length)
      diags.push({ severity: 'info', code: 'I18N_UNUSED', message: `${file}: ${leftover.length} entries are not used by any text (${leftover.slice(0, 3).map(q).join(', ')}${leftover.length > 3 ? ', …' : ''}); delete them or run npx joplo i18n add ${l} --prune`, source: 'structure', at: `${file}:1:1` });
  }
  return stale;
}

// ---------- 帮助函数 ----------

/** 角色的颜色（D56）：没写 color 时按声明顺序取。 */
/** 单步降级需要的场景级上下文：由 compile() 在编译每个场景时准备，lowerStep 只读（导演层 director 除外，它随步骤推进）。 */
type StepContext = {
  /** 报错（定位到作者源位置）。 */
  err: (code: string, message: string, at?: string, ref?: Diagnostic['ref']) => unknown;
  rel: (s?: string) => string | undefined;
  /** 发布 / 评审版：去掉创作侧信息。 */
  strip: boolean;
  host: PluginCompiler;
  /** 正在生成的 IR（规则、场景等已编译的部分可查）。 */
  out: Record<string, any>;
  /** 方案：限定 id、定义、可见路径、路径 → 画面 id。 */
  qid: string;
  def: OptionDef & { file: string };
  ctxRoutes: Set<string>;
  sceneOf: (path: string) => string;
  sceneFor: Map<string, Scene>;
  ruleQid: (key: string, at?: string) => string | null;
  roleKeys: Set<string>;
  /** 层级（T-layers）：每层一个独立画面。 */
  hasLayers: boolean;
  layers: Record<string, { title: string; sceneId: string; role?: string; icon?: LayerIcon }>;
  layerScenes: { key: string; scene: Scene }[];
  layersWith: (id: string) => string[];
  layerSceneWith: (id: string) => Scene | undefined;
  /** 插件效果能看到的画面。 */
  effectRoots: Scene[];
  /** 场景：键、限定 id、定义、起始路径、已用过的步骤键、各层当前镜头。 */
  skey: string;
  sid: string;
  fl: NonNullable<OptionDef['scenarios']>[string];
  start: string;
  stepKeys: Set<string>;
  frame: Map<string, string[]>;
  /** 导演层：读入这一步之前的，写回这一步之后的。 */
  director: string;
};
/**
 * 把作者写的一步降级成 IR 的一步：效果归类（状态变化、朗读、镜头、焦点提示、标注、分叉、插件效果）、目标与引用校验、
 * 自动字幕、这一步的镜头与导演层。场景级的上下文（路径、层级、已累积的镜头）经 StepContext 传入；
 * 导演层随步骤推进，写回 c.director。
 */
function lowerStep(c: StepContext, st: StepDef, i: number): Step {
  const { err, rel, strip, host, out, qid, def, ctxRoutes, sceneOf, sceneFor, ruleQid, roleKeys, hasLayers, layers, layerScenes, layersWith, layerSceneWith, effectRoots, skey, sid, fl, start, stepKeys, frame } = c;
  let director = c.director;
    if (st.key !== undefined) {
      if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(st.key)) err('STEP_KEY_INVALID', 'Step key must start with a letter and contain at most 64 letters, digits, underscores or hyphens', st.source);
      if (stepKeys.has(st.key)) err('STEP_KEY_DUPLICATE', `Duplicate step key ${st.key} in ${sid}; use a distinct key for each action`, st.source);
      stepKeys.add(st.key);
    }
    const effects: Step['effects'] = [];
    const ruleIds: string[] = [];
    const explains: string[] = [];
    const says: string[] = [];
    let sayRole: string | null = null;
    const narrates: string[] = [];
    /** 插件效果声明的最短停留（D98）：同一步取最大值。 */
    let effectHoldMs = 0;
    const ext: Record<string, unknown> = {};
    const references: string[] = [];
    const pluginFocus: string[] = [];
    const directorTargets: string[] = [];
    const forks: Step['forks'] = [];
    const marks: Step['marks'] = [];
    /** 每个插件效果贡献的节点（作为镜头目标，与 shot 合并）。 */
    const pluginTargets = new Map<EffectDef, string[]>();
    for (const e of st.effects as EffectDef[]) {
      if (e.type === 'go') {
        if (!ctxRoutes.has(e.route)) err('UNKNOWN_ROUTE', `go("${e.route}") navigates to an unknown route`, st.source);
        effects.push({ type: 'navigate', sceneId: sceneOf(e.route) });
      } else if (e.type === 'uses') {
        for (const r of e.rules) {
          const q = ruleQid(r, st.source);
          if (q) ruleIds.push(q);
        }
      } else if (e.type === 'set' || e.type === 'append') effects.push({ type: e.type, path: e.path, value: e.value });
      else if (e.type === 'stream') {
        if (e.pace !== undefined && e.pace !== 'voice') err('STREAM_PACE_INVALID', `stream() pace must be 'voice' (got ${JSON.stringify(e.pace)}); omit it to stream at model-output speed`, st.source);
        effects.push({ type: 'stream', path: e.path, value: e.value, ...(e.pace === 'voice' ? { pace: 'voice' as const } : {}) });
      }
      else if (e.type === 'toast') effects.push({ type: 'toast', text: e.text, tone: e.tone });
      else if (e.type === 'shot' || e.type === 'mark' || e.type === 'fork' || e.type === 'cue' || e.type === 'callout' || e.type === 'hold') continue; // 镜头与焦点提示不是状态变化，下面单独归类
      else if (e.type === 'say') {
        if (e.role !== undefined) {
          if (typeof e.role !== 'string' || !roleKeys.has(e.role)) err('ROLE_UNKNOWN', `say() role "${String(e.role)}" is not in feature.roles${roleKeys.size ? ` (available: ${[...roleKeys].join(', ')})` : ' (feature.roles must use { key: role(\'Name\') })'}`, st.source);
          else if (sayRole !== null && sayRole !== e.role) err('SAY_ROLE_CONFLICT', `One step has say() lines from two roles ("${sayRole}" and "${e.role}"); split them into two steps`, st.source);
          else sayRole = e.role;
        }
        if (typeof e.text === 'string' && e.text.trim()) says.push(e.text.trim());
        else err('SAY_EMPTY', 'say() needs the line the character speaks, for example say(\'I can make it!\'). Remove it to read the caption instead', st.source);
      } else if (e.type === 'narrate') {
        if (typeof e.text === 'string' && e.text.trim()) narrates.push(e.text.trim());
        else err('NARRATE_EMPTY', 'narrate() needs the narrator\'s words, for example narrate(\'She sends Ajie the plan as a link, so he needs no app.\'). Remove it to read say() or the caption instead', st.source);
      } else if (e.type === 'explain') {
        if (e.text.trim()) explains.push(e.text.trim());
      } else if (e.type === 'plugin') {
        const lowered = host.effect(e, effectRoots.filter(scene => scene.layer || scene.id === sceneOf(stepRouteBefore(fl.steps, i + 1, start))), ext[e.plugin], st.source);
        if (lowered) {
          effects.push(...(lowered.writes ?? []).map(w => ({ type: 'set' as const, path: w.path, value: w.value })));
          if (lowered.directorTarget) directorTargets.push(lowered.directorTarget);
          if (lowered.holdMs) effectHoldMs = Math.max(effectHoldMs, lowered.holdMs);
          if (lowered.media?.length) { const key = `${sid}#${i + 1}`; host.mediaCommands.set(key, [...(host.mediaCommands.get(key) ?? []), ...lowered.media]); }
          if (lowered.data !== undefined) ext[e.plugin] = lowered.data;
          if (lowered.targets?.length) {
            pluginTargets.set(e, lowered.targets);
            pluginFocus.push(...lowered.targets);
          }
          references.push(...lowered.references ?? []);
        }
      }
      else if (e.type === 'complete') effects.push({ type: 'complete', text: e.text, outcome: e.outcome });
      else err('EFFECT_INVALID', 'Unknown step effect; use a documented effect helper instead of constructing effect objects', st.source);
    }
    const sceneBefore = sceneFor.get(sceneOf(stepRouteBefore(fl.steps, i, start)));
    const sceneAfter = sceneFor.get(sceneOf(stepRouteBefore(fl.steps, i + 1, start)));
    const actionTarget = 'target' in st.action ? st.action.target : null;
    validateNewAction(st.action, hasLayers ? layerScenes.map(l => l.scene) : sceneBefore ? [sceneBefore] : [], out as Project, (code, message) => err(code, message, st.source));
    for (const e of st.effects) {
      if (e.type === 'fork') {
        if (!Object.hasOwn(def.scenarios, e.scenario) || e.scenario === skey) err('FORK_UNKNOWN', `Fork target "${e.scenario}" must be another scenario key in the same option`, st.source);
        else if (e.label.trim()) forks.push({ label: e.label.trim(), scenarioId: `${qid}.${e.scenario}`, at: 0 });
      }
      if (e.type === 'mark') {
        const exists = hasLayers ? layersWith(e.target).length > 0 : !!sceneAfter && !!findIn(sceneAfter.root, e.target);
        if (!exists) err('MARK_UNKNOWN', `mark("${e.target}") target is not in ${hasLayers ? 'any layer' : 'the stage for this step'}`, st.source);
        else marks.push({ target: e.target, kind: e.kindOf, ...(e.note ? { note: e.note } : {}) });
      }
    }

    // 焦点提示（D70）：spotlight / highlight / numbered / callout / hold。目标与 mark 同样解析：有层级时在任一层，否则在这一步的路径页面
    const focusLayers = (id: string): string[] => (hasLayers ? layersWith(id) : sceneAfter && findIn(sceneAfter.root, id) ? [PAGE_LAYER] : []);
    const where = hasLayers ? 'any layer' : 'the stage for this step';
    const cueMap = new Map<Cue['kind'], string[]>();
    const callouts: Callout[] = [];
    /** 焦点提示的目标（按效果顺序）：决定导演层，并判断要不要退回整层镜头。 */
    const focusTargets: string[] = [];
    let holdMs: number | undefined;
    const CUE_FN = { spotlight: 'spotlight', highlight: 'highlight', number: 'numbered' } as const;
    for (const e of st.effects as EffectDef[]) {
      if (e.type === 'cue') {
        const fn = CUE_FN[e.cue] ?? e.cue;
        if (!e.targets.length) err('FOCUS_UNKNOWN', `${fn}() requires at least one element id, for example ${fn}('quota_alert')`, st.source);
        for (const id of e.targets) {
          if (!focusLayers(id).length) { err('FOCUS_UNKNOWN', `${fn}("${id}") target is not in ${where}`, st.source); continue; }
          const list = cueMap.get(e.cue) ?? [];
          if (!list.includes(id)) list.push(id);
          cueMap.set(e.cue, list);
          if (!focusTargets.includes(id)) focusTargets.push(id);
        }
      } else if (e.type === 'callout') {
        const text = typeof e.text === 'string' ? e.text.trim() : '';
        if (!focusLayers(e.target).length) err('FOCUS_UNKNOWN', `callout("${e.target}", …) target is not in ${where}`, st.source);
        else if (!text) err('CALLOUT_EMPTY', `callout("${e.target}", …) needs one short sentence, for example callout('${e.target}', 'Share after generation')`, st.source);
        else if (e.side !== undefined && !(CALLOUT_SIDES as readonly string[]).includes(e.side)) err('CALLOUT_SIDE_INVALID', `callout("${e.target}", …, { side: ${JSON.stringify(e.side)} }) must be one of ${CALLOUT_SIDES.join(', ')}, or omitted to pick automatically`, st.source);
        else {
          callouts.push({ target: e.target, text, ...(e.side ? { side: e.side } : {}) });
          if (!focusTargets.includes(e.target)) focusTargets.push(e.target);
        }
      } else if (e.type === 'hold') {
        const sec = e.seconds;
        if (typeof sec !== 'number' || !Number.isFinite(sec) || sec < HOLD_MIN_SECONDS || sec > HOLD_MAX_SECONDS)
          err('HOLD_INVALID', `hold(${String(sec)}) must be between ${HOLD_MIN_SECONDS} and ${HOLD_MAX_SECONDS} seconds`, st.source);
        else holdMs = Math.max(holdMs ?? 0, Math.round(sec * 1000));
      }
    }
    const cues: Cue[] = [...cueMap].map(([kind, targets]) => ({ kind, targets }));

    // 镜头：每个 id 在包含它的层级里解析；第一个 shot 的第一个元素所在层级就是这一步的导演层。
    // 没有声明 layers 的方案：在路径页面里聚焦（伪层级 @page）。
    const perLayer = new Map<string, string[]>();
    let directorLayer: string | null = null;
    for (const e of st.effects as EffectDef[]) {
      if (e.type !== 'shot' && !pluginTargets.has(e)) continue;
      const fromPlugin = e.type !== 'shot';
      const targets = e.type === 'shot' ? e.targets : pluginTargets.get(e)!;
      if (targets.length === 0) {
        // shot()：导演所在层回到整体（不推近）
        const lk = hasLayers ? DIRECTOR_LAYER : PAGE_LAYER;
        if (!perLayer.has(lk)) perLayer.set(lk, []);
      }
      for (const id of targets) {
        const where = hasLayers ? layersWith(id) : [sceneAfter, sceneBefore].some((sc) => sc && findIn(sc.root, id)) ? [PAGE_LAYER] : [];
        if (!where.length) {
          if (fromPlugin) continue; // 插件目标已经校验过；不在这一步的画面里时不移动镜头
          err('SHOT_UNKNOWN', hasLayers ? `shot("${id}") references an element absent from all layers (layers: ${Object.keys(layers).join(', ')})` : `shot("${id}") references an element absent from this step's stage (${sceneAfter?.route ?? sceneBefore?.route ?? '?'})`, st.source);
          continue;
        }
        for (const lk of where) {
          const list = perLayer.get(lk) ?? [];
          if (!list.includes(id)) list.push(id);
          perLayer.set(lk, list);
          directorLayer ??= lk;
        }
      }
    }
    // 插件的导演目标只选择层，不自动加入聚焦框或推进视角。
    if (hasLayers && !directorLayer && directorTargets.length) directorLayer = layersWith(directorTargets[0]!)[0] ?? null;
    // 没写 shot、写了焦点提示（D70）：导演切到第一个提示目标所在的层（提示要被看见）
    if (hasLayers && !directorLayer && focusTargets.length) directorLayer = layersWith(focusTargets[0]!)[0] ?? null;
    // 没写 shot 的操作步骤：导演切到操作目标所在的层（播放时观众看得到要点的东西）
    if (hasLayers && !directorLayer && actionTarget) directorLayer = layersWith(actionTarget)[0] ?? null;
    // 换人的过渡卡（D56）：卡片后面导演切到这个人的层级（卡片淡出时已经是 TA 的画面）
    if (st.action.type === 'card' && st.action.role !== undefined) {
      const r = st.action.role;
      if (!roleKeys.has(r)) err('ROLE_UNKNOWN', `card("${st.action.title}") role "${r}" is not in feature.roles${roleKeys.size ? ` (available: ${[...roleKeys].join(', ')})` : ''}`, st.source);
      else if (hasLayers && !directorLayer) directorLayer = Object.entries(layers).find(([, l]) => l.role === r)?.[0] ?? null;
    }
    // 焦点提示不推近镜头（D70）：目标不在这一层当前镜头里（inShotFrame：镜头目标本身、它的子元素，或 D69 取景一定带上的
    // 父分组 / 时序图两端参与者）时，这一步补一个整层镜头，
    // 免得提示落在画面外；这一步自己写了这一层的 shot 时以 shot 为准（目标在 shot 外由 check 的 FOCUS_CONFLICT 提示）
    const dirAfter = directorLayer ?? director;
    for (const id of focusTargets) {
      const ls = focusLayers(id);
      const lk = ls.includes(dirAfter) ? dirAfter : ls[0];
      if (!lk || perLayer.has(lk) || (perLayer.has(DIRECTOR_LAYER) && lk === dirAfter)) continue;
      const now = frame.get(lk) ?? [];
      const scene = hasLayers ? layerScenes.find((l) => l.key === lk)?.scene : sceneAfter;
      if (now.length && !(scene && inShotFrame(scene.root, id, now))) perLayer.set(lk, []);
    }
    const shots = [...perLayer].map(([layer, targets]) => ({ layer, targets }));
    if (directorLayer) director = directorLayer;
    for (const s of shots) frame.set(s.layer === DIRECTOR_LAYER ? director : s.layer, [...s.targets]);
    const generated = st.caption === undefined ? autoCaption(st, (hasLayers && actionTarget ? layerSceneWith(actionTarget) : undefined) ?? sceneBefore, out as Project) : null;
    c.director = director;
        return {
      id: `${sid}#${i + 1}`,
      ...(st.key !== undefined ? { key: st.key } : {}),
      kind: st.kind,
      action: st.action,
      caption: st.caption ?? generated!.caption,
      ...(generated?.captionAuto ? { captionAuto: generated.captionAuto } : {}),
      effects,
      ruleIds: strip ? [] : ruleIds,
      shots,
      directorLayer,
      ...(explains.length ? { explain: explains.join('\n') } : {}),
      ...(Object.keys(ext).length ? { ext } : {}),
      ...(references.length ? { references: [...new Set(references)] } : {}),
      ...(pluginFocus.length ? { focusTargets: [...new Set(pluginFocus)] } : {}),
      forks,
      marks,
      ...(cues.length ? { cues } : {}),
      ...(callouts.length ? { callouts } : {}),
      ...(holdMs !== undefined ? { hold: holdMs } : {}),
      ...(effectHoldMs > 0 ? { effectHold: effectHoldMs } : {}),
      ...(says.length ? { say: says.join(' ') } : {}),
      ...(says.length && sayRole ? { sayRole } : {}),
      ...(narrates.length ? { narrate: narrates.join(' ') } : {}),
      ...(st.source ? { source: rel(st.source) } : {}),
    };
}

export const ROLE_COLORS = ['#E8590C', '#1971C2', '#2F9E44', '#9C36B5', '#C2255C', '#0C8599'] as const;

function rolesOf(roles: FeatureDef['roles']): { id?: string; name: string; desc: string; color: string }[] {
  if (!roles) return [];
  const color = (i: number, c?: string) => c ?? ROLE_COLORS[i % ROLE_COLORS.length]!;
  if (Array.isArray(roles)) return roles.map((name, i) => ({ name, desc: '', color: color(i) }));
  return Object.entries(roles).map(([id, r], i) => ({ id, name: r.name, desc: r.desc ?? '', color: color(i, r.color) }));
}

function sortedEntries<T>(o: Record<string, T>): [string, T][] {
  return Object.entries(o).sort(([a], [b]) => a.localeCompare(b));
}

export function relSource(root: string, s: string): string {
  const r = root.endsWith('/') ? root : `${root}/`;
  return s.startsWith(r) ? s.slice(r.length) : s;
}

function caseOf(id: string, featureId: string, c: CaseDef, source?: string) {
  const o = typeof c === 'string' ? { title: c } : c;
  return { id, featureId, title: o.title, dimension: o.dimension ?? 'main', expected: o.expected ?? '', priority: o.priority ?? 'medium', ...(source ? { source } : {}) };
}

function ruleOf(id: string, featureId: string, optionId: string | undefined, r: { text: string; origin: string; status: string; cases: string[]; elements: string[]; source?: string }, rel: (s?: string) => string | undefined) {
  const caseIds = r.cases.map((c) => (c.includes('.') ? c : `${featureId}.${c}`));
  return {
    id,
    featureId,
    ...(optionId ? { optionId } : {}),
    text: r.text,
    origin: r.origin,
    confirmation: r.status,
    caseIds,
    elementIds: r.elements,
    ...(r.source ? { source: rel(r.source) } : {}),
  };
}

function mergeState(a: OptionDef['state'], b: OptionDef['state']) {
  const pick = (k: 'ui' | 'data' | 'inputs') => ({ ...structuredClone(a?.[k] ?? {}), ...structuredClone(b?.[k] ?? {}) });
  return { ui: pick('ui'), data: pick('data'), inputs: pick('inputs') };
}

function collectSlots(n: JChild, out: Set<string>): void {
  if (Array.isArray(n)) return n.forEach((c) => collectSlots(c, out));
  if (!isNode(n)) return;
  if (n.type === '#slot' && typeof n.props.name === 'string') out.add(n.props.name);
  n.children.forEach((c) => collectSlots(c, out));
}

/** 把 <Slot/> 替换为堆叠内容、<Outlet/> 替换为页面；返回新树。 */
function expandSlots(n: JNode, fill: (name: string) => JChild[], outlet?: JNode): JNode {
  const map = (c: JChild): JChild => {
    if (Array.isArray(c)) return c.map(map);
    if (!isNode(c)) return c;
    if (c.type === '#slot') return { ...c, type: '#fragment', children: fill(String(c.props.name)) };
    if (c.type === '#outlet') return outlet ?? { ...c, type: '#fragment', children: [] };
    return { ...c, children: c.children.map(map) };
  };
  return map(n) as JNode;
}

function tagFrom(n: JNode, from: string): JNode {
  return { ...n, props: { ...n.props, __from: from } };
}

type ErrFn = (code: string, message: string, at?: string, severity?: 'error' | 'warning' | 'info') => void;

/** JNode → IR 节点：展开 Fragment、文本变 #text、分离 Joplo 属性、生成非交互元素的 ID、检查 ID 唯一。 */
type NodeCtx = { host: PluginCompiler; plugins: Record<string, PluginInfo>; report: ErrFn; rel: (s?: string) => string | undefined };

function toSceneNode(n: JNode, fallbackId: string, ids: Map<string, string | undefined>, nc: NodeCtx, parentType: string | null): SceneNode {
  const { report: err, rel } = nc;
  n = { ...n, props: n.props ?? {}, children: n.children ?? [] };
  n = { ...n, type: nc.host.intrinsic.get(n.type) ?? n.type };
  n = inheritProps(n, nc.host.inherits.get(n.type) ?? []);
  const children: SceneNode[] = flatten(n.children).map((c, i) =>
    isNode(c) ? toSceneNode(c, `${fallbackId}_${i}`, ids, nc, n.type) : textNode(c, `${fallbackId}_${i}`),
  );

  n = nc.host.node(n, ids);
  const { id: rawId, when, disabled, disabledReason, unmodeled, note, redact, __from, ...rest } = n.props as Record<string, unknown>;
  const at = n.source;
  const plug = splitPluginType(n.type);
  if (plug) {
    const spec = pluginSpec(nc.plugins, n.type);
    if (!nc.plugins[plug.plugin]) err('UNKNOWN_PLUGIN', `<${n.type}> comes from plugin ${plug.plugin}, which is not enabled: ${n.packageName ? `install ${n.packageName}; import plugin from ${JSON.stringify(n.packageName)}; ` : `install its author package; `}add plugin to config({ plugins: [plugin] }) in joplo.config.ts (npx joplo skill plugins)`, at);
    else if (!spec) err('UNKNOWN_COMPONENT', `Plugin ${plug.plugin} has no component ${plug.name} (available: ${Object.keys(nc.plugins[plug.plugin]!.components).join(', ')}; npx joplo skill ${plug.plugin})`, at);
    else if (spec.parent && parentType !== `${plug.plugin}:${spec.parent}`)
      err('PLUGIN_PARENT', `<${n.type}> must be written directly inside <${plug.plugin}:${spec.parent}> (npx joplo skill ${plug.plugin})`, at);
  } else if (!KNOWN.has(n.type)) err('UNKNOWN_COMPONENT', `No enabled plugin declares <${n.type}>. Install a plugin that provides this element and list it in config.plugins; run joplo skill to discover the installed plugin guides`, at);
  const interactive = isInteractiveType(n.type, nc.plugins);
  if (interactive && typeof rawId !== 'string') err('MISSING_ID', `Interactive component <${n.type}> "${labelOf(n)}" requires an id for steps and selection`, at);
  const spec = pluginSpec(nc.plugins, n.type);
  if (spec?.needsId && typeof rawId !== 'string' && !interactive) err('MISSING_ID', `<${n.type}> "${labelOf(n)}" requires an id`, at);

  const id = typeof rawId === 'string' ? rawId : `_${fallbackId}`;
  if (ids.has(id)) err('DUPLICATE_ID', `Duplicate id "${id}" in the same stage (other location: ${rel(ids.get(id)) ?? 'unknown'})`, at);
  ids.set(id, at);

  const props: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rest)) {
    if (v === undefined) continue; // 写了属性但值是 undefined（如 description={cond ? '…' : undefined}）= 没写
    if (typeof v === 'function' && !isBind(v)) {
      err('FUNCTION_PROP', `<${n.type}> prop ${k} is a function. Put behavior in the option's flow steps instead of event callbacks`, at);
      continue;
    }
    if (isNode(v)) {
      err('ELEMENT_PROP', `<${n.type}> prop ${k} is an element. Props accept only strings, numbers, booleans, and objects; use characters for icons (for example leftSection="+") and children for content`, at);
      continue;
    }
    props[k] = toPropValue(v);
  }
  const node: SceneNode = { id, type: n.type };
  if (spec?.traits) {
    const { text: _text, textPaths: _paths, ...runtime } = spec.traits;
    if (Object.keys(runtime).length) node.traits = runtime;
  }
  if (Object.keys(props).length) node.props = props;
  if (children.length) node.children = children;
  if (when !== undefined) node.when = toCondition(when) as SceneNode['when'];
  if (disabled !== undefined) node.disabled = (typeof disabled === 'boolean' ? disabled : toCondition(disabled)) as SceneNode['disabled'];
  // disabledReason：字面量，或整值绑定（和 disabled 一样跟着状态变，D65）；其他值不会被显示，直接报错并给出写法
  if (typeof disabledReason === 'string') node.disabledReason = disabledReason;
  else if (isBind(disabledReason)) node.disabledReason = `$${bindPath(disabledReason)}`;
  else if (disabledReason !== undefined && disabledReason !== null)
    err('INVALID_DISABLED_REASON', `<${n.type}> "${labelOf(n)}" disabledReason must be a string or a state binding, got ${typeof disabledReason === 'object' ? 'an object' : typeof disabledReason}. Write disabledReason="Only admins can invite" or disabledReason={$.ui.sendHint}; for text that changes during the demo, set() it into state and bind it`, at);
  if (unmodeled === true) node.unmodeled = true;
  // 敏感信息（D70）：布尔或条件（和 disabled 一样），渲染时模糊；其他值报错并给出写法
  if (typeof redact === 'boolean') node.redact = redact;
  else if (isBind(redact) || (redact && typeof redact === 'object' && '$cond' in (redact as object))) node.redact = toCondition(redact) as SceneNode['redact'];
  else if (redact !== undefined && redact !== null)
    err('INVALID_REDACT', `<${n.type}> "${labelOf(n)}" redact must be true / false or a condition, for example redact or redact={not($.ui.revealed)}; got ${typeof redact}`, at);
  if (typeof note === 'string') node.note = note;
  if (typeof __from === 'string') node.from = __from;
  const s = rel(at);
  if (s) node.source = s;
  return node;
}

/** Forward declared properties before descending; nested owners establish their own scope. */
function inheritProps(owner: JNode, declarations: { target: string; props: string[] }[]): JNode {
  if (!declarations.length) return owner;
  const visit = (child: JChild): JChild => {
    if (Array.isArray(child)) return child.map(visit);
    if (!isNode(child) || child.type === owner.type) return child;
    const spec = declarations.find(d => d.target === child.type);
    if (spec) {
      const props = { ...child.props };
      for (const key of spec.props) if (props[key] === undefined && owner.props[key] !== undefined) props[key] = owner.props[key];
      return { ...child, props };
    }
    return { ...child, children: child.children.map(visit) };
  };
  return { ...owner, children: owner.children.map(visit) };
}

/** 展开数组与 Fragment（含插槽展开后的 Fragment），丢弃 null/布尔。 */
function flatten(cs: JChild[]): JChild[] {
  const out: JChild[] = [];
  const rec = (c: JChild) => {
    if (Array.isArray(c)) c.forEach(rec);
    else if (c === null || c === undefined || c === false || c === true) return;
    else if (isNode(c) && c.type === '#fragment') c.children.forEach(rec);
    else out.push(c);
  };
  cs.forEach(rec);
  return out;
}

function textNode(c: JChild, id: string): SceneNode {
  const text = isBind(c) ? `$${bindPath(c)}` : String(c);
  return { id: `_${id}`, type: '#text', props: { text } };
}

function toPropValue(v: unknown): unknown {
  if (isBind(v)) return `$${bindPath(v)}`;
  if (Array.isArray(v)) return v.map((x) => (x === undefined ? null : toPropValue(x)));
  if (v && typeof v === 'object' && !isNode(v)) return Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => [k, toPropValue(x)]));
  return v;
}

function labelOf(n: JNode): string {
  const p = n.props;
  for (const k of ['label', 'title', 'placeholder', 'aria-label']) if (typeof p[k] === 'string') return p[k] as string;
  const t = flatten(n.children).filter((c) => typeof c === 'string').join('');
  return t || n.type;
}

/**
 * 第 i 步执行之前所在的路径。与播放器（player.applyStep）同一个顺序：back 动作先回到上一页，
 * 再按效果顺序处理 go（当前页入栈）。0.2.6 之前忽略了 back，返回后的 mark / shot / 自动字幕都按返回前的页面解析。
 */
function stepRouteBefore(steps: StepDef[], i: number, start: string): string {
  let route = start;
  const stack: string[] = [];
  for (let k = 0; k < i; k++) {
    const st = steps[k]!;
    if (st.action.type === 'back') route = stack.pop() ?? route;
    for (const e of st.effects) if (e.type === 'go') { stack.push(route); route = e.route; }
  }
  return route;
}

/** id 是 frameId 本身或它的子孙（在同一棵树里）。 */
function findIn(node: SceneNode, id: string): SceneNode | null {
  if (node.id === id) return node;
  for (const c of node.children ?? []) {
    const f = findIn(c, id);
    if (f) return f;
  }
  return null;
}

const NO_STATE = { ui: {}, data: {}, inputs: {} };

/** 自动字幕：元素名取 Mantine 的 label 属性（其次 title / aria-label / placeholder / 文字）；select 显示选项的 label。 */
function autoCaption(st: StepDef, scene: Scene | undefined, project: Project): Pick<Step, 'caption' | 'captionAuto'> {
  const a = st.action;
  const node = 'target' in a && scene ? findIn(scene.root, a.target) : null;
  const label = node ? nodeLabel(node) : 'target' in a ? a.target : '';
  const result = (kind: NonNullable<Step['captionAuto']>['kind'], caption: string, extra: { value?: string; keys?: string } = {}) => ({ caption, captionAuto: { kind, label, ...extra } });
  switch (a.type) {
    case 'drag': return result('drag', `Drag “${label}” to ${typeof a.to === 'string' ? a.to : `${a.to.x}, ${a.to.y}`}`, {value: typeof a.to === 'string' ? (scene && findIn(scene.root, a.to) ? nodeLabel(findIn(scene.root, a.to)!) : a.to) : `${a.to.x}, ${a.to.y}`});
    case 'hover': return result('hover', `Hover over “${label}”`);
    case 'scroll': return result('scroll', `Scroll “${label}” to ${typeof a.to === 'string' ? a.to : `${a.to.x}, ${a.to.y}`}`, {value: typeof a.to === 'string' ? (scene && findIn(scene.root, a.to) ? nodeLabel(findIn(scene.root, a.to)!) : a.to) : `${a.to.x}, ${a.to.y}`});
    case 'plugin': return {caption: (pluginActionSpec(project, a.name)?.caption ?? a.name).replaceAll('{label}', label).replace(/\{data\.([A-Za-z0-9_-]+)\}/g, (_, k: string) => String(a.data[k] ?? ''))};
    case 'click': return result('click', `Click “${label}”`);
    case 'type': return result('type', `Type “${a.value}” in “${label}”`, { value: a.value });
    case 'select': {
      const choices = node ? choicesOf(node, NO_STATE) : null;
      const value = (choices && matchChoice(choices, a.value)?.label) ?? a.value;
      return result('select', `Select “${value}” in “${label}”`, { value });
    }
    case 'toggle': {
      const kind = node?.traits?.toggleCaption === 'check' ? (a.value ? 'check' : 'uncheck') : (a.value ? 'switch_on' : 'switch_off');
      const verb = { check: 'Check', uncheck: 'Uncheck', switch_on: 'Turn on', switch_off: 'Turn off' }[kind];
      return result(kind, `${verb} “${label}”`);
    }
    case 'press': return result('press', a.keys.trim() ? `Press ${a.keys}` : 'Press a key', { keys: a.keys });
    case 'back': return result('back', 'Go back');
    case 'event': return { caption: a.name };
    case 'card': return { caption: a.title };
  }
}

/** Validate extension actions while all scene anchors and enabled declarations are available. */
function validateNewAction(action: StepDef['action'], scenes: Scene[], project: Project, report: (code:string,message:string)=>void): void {
  if (!['drag', 'hover', 'scroll', 'plugin'].includes(action.type)) return;
  const parsed = Action.safeParse(action);
  if (!parsed.success) { report('ACTION_INVALID', `Invalid ${action.type} action: ${parsed.error.message}`); return; }
  if (!('target' in action)) return;
  const nodes = scenes.map(s => findIn(s.root, action.target)).filter((n): n is SceneNode => !!n);
  if (!nodes.length) report('MISSING_TARGET', `Action target ${action.target} is not in the current stage`);
  if (action.type === 'drag' || action.type === 'scroll') {
    if (typeof action.to === 'string' && !scenes.some(s => findIn(s.root, action.target) && findIn(s.root, action.to as string))) report('ACTION_DESTINATION_MISSING', `${action.type} destination ${action.to} must be in the same stage as ${action.target}`);
    else if (action.type === 'scroll' && typeof action.to === 'string' && !nodes.some(n => findIn(n, action.to as string))) report('ACTION_DESTINATION_INVALID', `Scroll destination ${action.to} must be inside ${action.target}`);
  }
  if (action.type === 'plugin') {
    const spec = pluginActionSpec(project, action.name);
    if (!spec) report('ACTION_UNKNOWN', `Plugin action ${action.name} is not declared by an enabled plugin`);
    else {
      if (!validActionData(spec, action.data)) report('ACTION_DATA_INVALID', `Plugin action ${action.name} payload does not match its declared fields`);
      if (spec.targets && nodes.some(n => !spec.targets!.includes(n.type))) report('ACTION_TARGET_INVALID', `Plugin action ${action.name} does not accept this target type`);
    }
  }
}

function stripSources(o: unknown): void {
  if (Array.isArray(o)) return o.forEach(stripSources);
  if (o && typeof o === 'object') {
    delete (o as Record<string, unknown>).source;
    // Plugin slots are already validated public data. Stripping their own fields would
    // invalidate the plugin schema after validation (e.g. a public provenance `source`).
    for (const [key, value] of Object.entries(o)) if (key !== 'ext') stripSources(value);
  }
}

function stripNotes(n: SceneNode): void {
  delete n.note;
  delete n.source;
  for (const c of n.children ?? []) stripNotes(c);
}

/**
 * config({ voice }) 规整（D74）：去掉空白，空对象视为没写。strict = true 时形状不对返回 null（报 VOICE_CONFIG_INVALID）。
 */
function voiceConfigOf(v: unknown, strict = false): { profile?: string; narrator?: string; roles?: Record<string, string>; locales?: Record<string, { narrator?: string; roles?: Record<string, string> }> } | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const str = (x: unknown) => (typeof x === 'string' && x.trim() ? x.trim() : null);
  for (const k of Object.keys(o)) if (!['profile', 'narrator', 'roles', 'locales'].includes(k)) return null;
  if (o.profile !== undefined && !str(o.profile)) return null;
  /** 旁白与角色（顶层，或某种语言下）；形状不对时返回 false。 */
  const voices = (x: Record<string, unknown>): { narrator?: string; roles?: Record<string, string> } | false => {
    if (x.narrator !== undefined && !str(x.narrator)) return false;
    let roles: Record<string, string> | undefined;
    if (x.roles !== undefined) {
      if (!x.roles || typeof x.roles !== 'object' || Array.isArray(x.roles)) return false;
      roles = {};
      for (const [k, val] of Object.entries(x.roles as Record<string, unknown>)) {
        const s = str(val);
        if (!s) return false;
        roles[k] = s;
      }
    }
    return { ...(str(x.narrator) ? { narrator: str(x.narrator)! } : {}), ...(roles && Object.keys(roles).length ? { roles } : {}) };
  };
  const top = voices(o);
  if (!top) return null;
  let locales: Record<string, { narrator?: string; roles?: Record<string, string> }> | undefined;
  if (o.locales !== undefined) {
    if (!o.locales || typeof o.locales !== 'object' || Array.isArray(o.locales)) return null;
    locales = {};
    for (const [l, x] of Object.entries(o.locales as Record<string, unknown>)) {
      if (!x || typeof x !== 'object' || Array.isArray(x) || Object.keys(x).some((k) => k !== 'narrator' && k !== 'roles')) return null;
      const vv = voices(x as Record<string, unknown>);
      if (!vv) return null;
      if (Object.keys(vv).length) locales[l] = vv;
    }
  }
  const out = { ...(str(o.profile) ? { profile: str(o.profile)! } : {}), ...top, ...(locales && Object.keys(locales).length ? { locales } : {}) };
  return Object.keys(out).length ? out : strict ? out : null;
}
