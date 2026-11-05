/**
 * 编译：作者的源文件（经 @tokenroll/joplo-kit 收集成数据）→ IR v2。组件词汇对齐 Mantine（D35），见 catalog.ts。
 *
 * 路径优先的堆叠（D28）：画面 = 布局 + 页面 + 各功能方案填入插槽的元素。
 * - dev 模式：每个方案在每个路径上各有一个画面 `<方案>@<路径>`，其中其他功能取选定方案，本功能取该方案；
 *   另有发布视图 `@<路径>`（全部取选定方案）。
 * - publish 模式：只有发布视图；只含选定方案的场景；去掉规则、情况、问题等创作侧信息（D33）。
 */
import { isBind, isNode, bindPath, toCondition, type JNode, type JChild } from '@tokenroll/joplo-kit/node';
import type { ConfigDef, FeatureDef, LayoutDef, OptionDef, PageDef, StepDef, EffectDef, CaseDef } from '@tokenroll/joplo-kit';
import { COMPONENT_TYPES, DIRECTOR_LAYER, INTERACTIVE_TYPES, PAGE_LAYER, matchChoice, nodeLabel } from './catalog.ts';
import { choicesOf } from './player.ts';
import { Project, SCHEMA_VERSION, type SceneNode, type Scene, type Scenario, type Step, type Coverage } from './schema.ts';
import type { Diagnostic } from './result.ts';

export type AuthoringProject = {
  /** 项目根目录绝对路径，用于把源位置改成相对路径。 */
  root: string;
  config: ConfigDef & { file: string };
  layouts: Record<string, LayoutDef & { file: string }>;
  routes: Record<string, PageDef & { file: string }>;
  features: Record<string, { def: FeatureDef & { file: string }; options: Record<string, OptionDef & { file: string }> }>;
};

export type CompileResult = { project: Project | null; diagnostics: Diagnostic[] };

const KNOWN = new Set<string>(COMPONENT_TYPES);
const OVERLAY = 'overlay';
const MOCK_LABEL = { success: '模拟成功', failure: '模拟失败', denied: '模拟无权限', other: '模拟' } as const;

export function compile(src: AuthoringProject, mode: 'dev' | 'publish'): CompileResult {
  const diags: Diagnostic[] = [];
  const rel = (s?: string) => (s ? relSource(src.root, s) : undefined);
  const err = (code: string, message: string, at?: string, ref?: Diagnostic['ref']) =>
    diags.push({ severity: 'error', code, message, source: 'reference', ...(at ? { at: rel(at) } : {}), ...(ref ? { ref } : {}) });
  const warn = (code: string, message: string, at?: string, ref?: Diagnostic['ref']) =>
    diags.push({ severity: 'warning', code, message, source: 'structure', ...(at ? { at: rel(at) } : {}), ...(ref ? { ref } : {}) });

  const out: Record<string, any> = {
    schemaVersion: SCHEMA_VERSION,
    name: src.config.name,
    description: src.config.description ?? '',
    theme: src.config.theme ?? 'sketch',
    mode,
    routes: {},
    features: {},
    cases: {},
    options: {},
    rules: {},
    scenes: {},
    scenarios: {},
    issues: {},
  };

  // ---------- 1. 选出参与的方案 ----------
  type Opt = { fid: string; key: string; qid: string; def: OptionDef & { file: string } };
  const allOptions: Opt[] = [];
  const picked = new Map<string, Opt>(); // fid -> 选定方案
  for (const [fid, f] of sortedEntries(src.features)) {
    for (const [key, def] of sortedEntries(f.options)) allOptions.push({ fid, key, qid: `${fid}.${key}`, def });
    const pick = f.def.pick ?? null;
    if (pick) {
      const o = allOptions.find((x) => x.fid === fid && x.key === pick);
      if (o) picked.set(fid, o);
      else err('UNKNOWN_PICK', `功能 ${fid} 的 pick「${pick}」不是 options/ 下的方案`, f.def.source);
    } else if (mode === 'publish') warn('NOT_PICKED', `功能「${f.def.name}」还没有选定方案，不会发布`, f.def.source);
  }
  const included = mode === 'dev' ? allOptions : [...picked.values()];

  // ---------- 2. 路径表 ----------
  type RouteEntry = { path: string; page: PageDef & { file: string }; addedBy?: Opt };
  const baseRoutes = new Map<string, RouteEntry>();
  for (const [path, p] of sortedEntries(src.routes)) baseRoutes.set(path, { path, page: p });
  const addedRoutes = new Map<string, RouteEntry>(); // `${qid}|${path}`
  for (const o of allOptions) {
    for (const [path, p] of Object.entries(o.def.routes ?? {})) {
      if (!path.startsWith('/')) err('BAD_ROUTE', `路径必须以 / 开头：${path}`, o.def.source);
      if (baseRoutes.has(path)) err('ROUTE_EXISTS', `方案 ${o.qid} 新增的路径 ${path} 已存在于 routes/，请改为堆叠（on）`, p.source ?? o.def.source);
      addedRoutes.set(`${o.qid}|${path}`, { path, page: { ...p, file: o.def.file }, addedBy: o });
    }
  }
  /** 在给定方案上下文（null = 发布视图）中可见的路径。 */
  const routesIn = (ctx: Opt | null): RouteEntry[] => {
    const added = [...addedRoutes.values()].filter((r) => {
      const by = r.addedBy!;
      if (ctx && by.qid === ctx.qid) return true;
      if (ctx && by.fid === ctx.fid) return false; // 同功能的其他方案
      return picked.get(by.fid)?.qid === by.qid;
    });
    return [...baseRoutes.values(), ...added];
  };

  const layoutOf = (page: PageDef): string | null => (page.layout === false ? null : (page.layout ?? src.config.layout ?? null));
  for (const r of [...baseRoutes.values(), ...[...addedRoutes.values()].filter((r) => included.some((o) => o.qid === r.addedBy!.qid))]) {
    const lid = layoutOf(r.page);
    if (lid && !src.layouts[lid]) err('UNKNOWN_LAYOUT', `页面 ${r.path} 使用了不存在的布局「${lid}」`, r.page.source);
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
  for (const [fid, f] of sortedEntries(src.features)) {
    const fdef = f.def;
    if (mode === 'publish' && !picked.has(fid)) continue;
    const caseIds = Object.keys(fdef.cases ?? {}).map((k) => `${fid}.${k}`);
    out.features[fid] = {
      id: fid,
      name: fdef.name,
      goal: fdef.goal,
      roles: fdef.roles ?? [],
      constraints: Object.entries(fdef.constraints ?? {}).map(([id, c]) => (typeof c === 'string' ? { id, text: c, hard: true } : { id, text: c.text, hard: c.hard ?? true })),
      caseIds: mode === 'publish' ? [] : caseIds,
      optionIds: included.filter((o) => o.fid === fid).map((o) => o.qid),
      pick: picked.get(fid)?.qid ?? null,
      ...(fdef.source ? { source: rel(fdef.source) } : {}),
    };
    if (mode === 'publish') continue;
    for (const [k, c] of Object.entries(fdef.cases ?? {})) out.cases[`${fid}.${k}`] = caseOf(`${fid}.${k}`, fid, c, rel(fdef.source));
    for (const [k, r] of Object.entries(fdef.rules ?? {})) out.rules[`${fid}.${k}`] = ruleOf(`${fid}.${k}`, fid, undefined, r, rel);
    for (const [k, q] of Object.entries(fdef.questions ?? {})) out.issues[`${fid}.${k}`] = { id: `${fid}.${k}`, featureId: fid, text: q.text, severity: q.severity, refs: q.refs, ...(q.source ? { source: rel(q.source) } : {}) };
  }

  // ---------- 4. 画面合成 ----------
  const contributionsFor = (ctx: Opt | null): Opt[] => {
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
        err('UNKNOWN_SLOT', `方案 ${from} 往路径 ${route.path} 的插槽「${slot}」堆叠元素，但该页面和布局中没有 <Slot name="${slot}" />`, o?.def.source, {
          kind: 'option',
          id: from,
        });
      }
    }
    const base = tree as JNode;
    const rootJ: JNode = { ...base, type: base.type === '#fragment' ? 'div' : base.type, children: [...base.children, ...overlays] };
    const ids = new Map<string, string | undefined>();
    const root = toSceneNode(rootJ, 'root', ids, (code, msg, at) => err(code, msg, at), rel);
    return { id: sceneId, optionId: ctx?.qid ?? null, route: route.path, name: `${page.title}${ctx ? ` · ${ctx.def.name}` : ''}`, viewport: page.viewport ?? 'desktop', root };
  };

  const sceneFor = new Map<string, Scene>();
  const addScene = (s: Scene) => {
    sceneFor.set(s.id, s);
    out.scenes[s.id] = s;
  };
  for (const r of routesIn(null)) addScene(composeScene(r, null));
  if (mode === 'dev') for (const o of included) for (const r of routesIn(o)) addScene(composeScene(r, o));

  // ---------- 5. 方案、场景、覆盖 ----------
  for (const o of included) {
    const { def, fid, qid } = o;
    const fdef = src.features[fid]!.def;
    const ctxRoutes = new Set(routesIn(o).map((r) => r.path));
    const touched = [...Object.keys(def.on ?? {}), ...Object.keys(def.routes ?? {})];
    for (const p of Object.keys(def.on ?? {})) if (!ctxRoutes.has(p)) err('UNKNOWN_ROUTE', `方案 ${qid} 堆叠到不存在的路径 ${p}`, def.source);
    const sceneOf = (path: string) => (mode === 'dev' ? `${qid}@${path}` : `@${path}`);

    if (mode === 'dev') {
      for (const [k, r] of Object.entries(def.rules ?? {})) out.rules[`${qid}.${k}`] = ruleOf(`${qid}.${k}`, fid, qid, r, rel);
      for (const [k, q] of Object.entries(def.questions ?? {}))
        out.issues[`${qid}.${k}`] = { id: `${qid}.${k}`, featureId: fid, optionId: qid, text: q.text, severity: q.severity, refs: q.refs, ...(q.source ? { source: rel(q.source) } : {}) };
    }
    const ruleQid = (key: string, at?: string): string | null => {
      if (def.rules?.[key]) return `${qid}.${key}`;
      if (fdef.rules?.[key]) return `${fid}.${key}`;
      err('UNKNOWN_RULE', `uses("${key}") 引用了不存在的规则（应为 option.rules 或 feature.rules 的键）`, at);
      return null;
    };

    // ---------- 层级（T-layers）：每层一个完全独立的画面，单独编译、单独渲染 ----------
    const layers: Record<string, { title: string; sceneId: string }> = {};
    const layerScenes: { key: string; scene: Scene }[] = [];
    const layerRoute = touched.find((r) => ctxRoutes.has(r)) ?? src.config.home ?? [...ctxRoutes][0] ?? '/';
    for (const [lk, ld] of Object.entries(def.layers ?? {})) {
      const at = ld.source ?? def.source;
      if (!/^[A-Za-z_][\w-]*$/.test(lk)) {
        err('LAYER_UNKNOWN', `层级键「${lk}」只能用字母、数字、下划线和连字符，且不能以 @ 开头`, at);
        continue;
      }
      const tree = flatten(Array.isArray(ld.tree) ? ld.tree : [ld.tree]);
      const nodes = tree.filter(isNode);
      if (!nodes.length) {
        err('LAYER_UNKNOWN', `层级「${ld.title}」没有内容：layer(title, <页面 JSX />)`, at);
        continue;
      }
      const rootJ: JNode = nodes.length === 1 ? nodes[0]! : { ...nodes[0]!, type: 'div', props: {}, children: nodes };
      const ids = new Map<string, string | undefined>();
      const root = toSceneNode(rootJ, `layer_${lk}`, ids, (code, msg, where) => err(code, msg, where), rel);
      const sceneId = `${qid}~${lk}`;
      const scene: Scene = { id: sceneId, optionId: qid, route: layerRoute, name: `${ld.title} · ${def.name}`, viewport: ld.viewport ?? 'desktop', root, layer: lk };
      addScene(scene);
      layerScenes.push({ key: lk, scene });
      layers[lk] = { title: ld.title, sceneId };
    }
    const hasLayers = layerScenes.length > 0;
    /** 元素在哪些层级里（多层都有同名 id 时都算）。 */
    const layersWith = (id: string): string[] => layerScenes.filter((l) => findIn(l.scene.root, id)).map((l) => l.key);
    const layerSceneWith = (id: string): Scene | undefined => layerScenes.find((l) => findIn(l.scene.root, id))?.scene;

    const scenarioIds: Record<string, string[]> = {};
    for (const [skey, fl] of Object.entries(def.scenarios ?? {})) {
      const sid = `${qid}.${skey}`;
      const start = fl.opts.start ?? touched[0] ?? src.config.home ?? [...ctxRoutes][0];
      if (!start || !ctxRoutes.has(start)) {
        err('UNKNOWN_ROUTE', `场景 ${sid} 的起始路径 ${start ?? '(无)'} 不存在`, fl.source);
        continue;
      }
      for (const c of fl.opts.cases ?? []) {
        if (!fdef.cases?.[c]) err('UNKNOWN_CASE', `场景 ${sid} 覆盖的情况「${c}」不在 feature.cases 中`, fl.source);
        else (scenarioIds[c] ??= []).push(sid);
      }
      const steps: Step[] = fl.steps.map((st: StepDef, i: number): Step => {
        const effects: Step['effects'] = [];
        const ruleIds: string[] = [];
        const explains: string[] = [];
        for (const e of st.effects as EffectDef[]) {
          if (e.type === 'go') {
            if (!ctxRoutes.has(e.route)) err('UNKNOWN_ROUTE', `go("${e.route}") 跳转到不存在的路径`, st.source);
            effects.push({ type: 'navigate', sceneId: sceneOf(e.route) });
          } else if (e.type === 'uses') {
            for (const r of e.rules) {
              const q = ruleQid(r, st.source);
              if (q) ruleIds.push(q);
            }
          } else if (e.type === 'set' || e.type === 'append') effects.push({ type: e.type, path: e.path, value: e.value });
          else if (e.type === 'toast') effects.push({ type: 'toast', text: e.text, tone: e.tone });
          else if (e.type === 'shot') continue; // 镜头不是状态变化，下面单独归类
          else if (e.type === 'explain') {
            if (e.text.trim()) explains.push(e.text.trim());
          }
          else effects.push({ type: 'complete', text: e.text, outcome: e.outcome });
        }
        const sceneBefore = sceneFor.get(sceneOf(stepRouteBefore(fl.steps, i, start)));
        const sceneAfter = sceneFor.get(sceneOf(stepRouteBefore(fl.steps, i + 1, start)));
        const actionTarget = 'target' in st.action ? st.action.target : null;
        // 镜头：每个 id 在包含它的层级里解析；第一个 shot 的第一个元素所在层级就是这一步的导演层。
        // 没有声明 layers 的方案：在路径页面里聚焦（伪层级 @page）。
        const perLayer = new Map<string, string[]>();
        let directorLayer: string | null = null;
        for (const e of st.effects as EffectDef[]) {
          if (e.type !== 'shot') continue;
          if (e.targets.length === 0) {
            // shot()：导演所在层回到整体（不推近）
            const lk = hasLayers ? DIRECTOR_LAYER : PAGE_LAYER;
            if (!perLayer.has(lk)) perLayer.set(lk, []);
          }
          for (const id of e.targets) {
            const where = hasLayers ? layersWith(id) : [sceneAfter, sceneBefore].some((sc) => sc && findIn(sc.root, id)) ? [PAGE_LAYER] : [];
            if (!where.length) {
              err('SHOT_UNKNOWN', hasLayers ? `shot("${id}") 引用的元素不在任何层级里（层级：${Object.keys(layers).join('、')}）` : `shot("${id}") 引用的元素不在这一步的画面里（${sceneAfter?.route ?? sceneBefore?.route ?? '?'}）`, st.source);
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
        // 没写 shot 的操作步骤：导演切到操作目标所在的层（播放时观众看得到要点的东西）
        if (hasLayers && !directorLayer && actionTarget) directorLayer = layersWith(actionTarget)[0] ?? null;
        const shots = [...perLayer].map(([layer, targets]) => ({ layer, targets }));
        return {
          id: `${sid}#${i + 1}`,
          kind: st.kind,
          action: st.action,
          caption: st.caption ?? autoCaption(st, (hasLayers && actionTarget ? layerSceneWith(actionTarget) : undefined) ?? sceneBefore),
          effects,
          ruleIds: mode === 'publish' ? [] : ruleIds,
          shots,
          directorLayer,
          ...(explains.length ? { explain: explains.join('\n') } : {}),
          ...(st.source ? { source: rel(st.source) } : {}),
        };
      });
      const outcome = fl.opts.outcome ?? 'success';
      const state = mergeState(def.state, fl.opts.state);
      const sc: Scenario = {
        id: sid,
        optionId: qid,
        name: fl.name,
        description: fl.opts.description ?? '',
        caseIds: mode === 'publish' ? [] : (fl.opts.cases ?? []).filter((c) => fdef.cases?.[c]).map((c) => `${fid}.${c}`),
        mock: { label: fl.opts.mock ?? MOCK_LABEL[outcome], outcome },
        initial: { sceneId: sceneOf(start), ui: state.ui, data: state.data, inputs: state.inputs },
        steps,
        expected: fl.opts.expected ?? '',
        ...(fl.source ? { source: rel(fl.source) } : {}),
      };
      out.scenarios[sid] = sc;
    }

    const coverage: Record<string, Coverage> = {};
    if (mode === 'dev') {
      for (const ck of Object.keys(fdef.cases ?? {})) {
        const decl = def.coverage?.[ck];
        const sids = scenarioIds[ck] ?? [];
        if (decl) coverage[`${fid}.${ck}`] = { status: decl.status, scenarioIds: sids, ...(decl.reason ? { reason: decl.reason } : {}), basis: 'declared' };
        else if (sids.length) coverage[`${fid}.${ck}`] = { status: 'expressed', scenarioIds: sids, basis: 'derived' };
        else coverage[`${fid}.${ck}`] = { status: 'missing', scenarioIds: [], reason: '尚无场景，也没有说明', basis: 'derived' };
      }
      for (const ck of Object.keys(def.coverage ?? {})) if (!fdef.cases?.[ck]) err('UNKNOWN_CASE', `方案 ${qid} 的 coverage 声明了不存在的情况「${ck}」`, def.source);
    }
    out.options[qid] = {
      id: qid,
      featureId: fid,
      key: o.key,
      name: def.name,
      idea: def.idea,
      decisionFocus: mode === 'publish' ? '' : (def.focus ?? ''),
      tradeoffs: mode === 'publish' ? [] : (def.tradeoffs ?? []),
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
        err('ASSUMPTION_CONFIRMED', `规则「${r.text}」是 AI 假设，不能标为已确认；请改为 pending，或在用户确认后把 origin 改为 user`, r.source);
      for (const c of r.caseIds) if (!out.cases[c]) err('UNKNOWN_CASE', `规则「${r.text}」关联了不存在的情况 ${c}`, r.source);
    }
  }

  // ---------- 7. 发布视图：去掉设计备注 ----------
  if (mode === 'publish') {
    for (const s of Object.values(out.scenes) as Scene[]) stripNotes(s.root);
    stripSources(out);
  }

  if (diags.some((d) => d.severity === 'error')) return { project: null, diagnostics: diags };
  const parsed = Project.safeParse(out);
  if (!parsed.success) {
    for (const issue of parsed.error.issues.slice(0, 20))
      diags.push({ severity: 'error', code: 'INVALID_SCHEMA', message: `${issue.path.join('.')}: ${issue.message}`, source: 'schema' });
    return { project: null, diagnostics: diags };
  }
  return { project: parsed.data, diagnostics: diags };
}

// ---------- 帮助函数 ----------

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

type ErrFn = (code: string, message: string, at?: string) => void;

/** JNode → IR 节点：展开 Fragment、文本变 #text、分离 Joplo 属性、生成非交互元素的 ID、检查 ID 唯一。 */
function toSceneNode(n: JNode, fallbackId: string, ids: Map<string, string | undefined>, err: ErrFn, rel: (s?: string) => string | undefined): SceneNode {
  const children: SceneNode[] = flatten(n.children).map((c, i) =>
    isNode(c) ? toSceneNode(c, `${fallbackId}_${i}`, ids, err, rel) : textNode(c, `${fallbackId}_${i}`),
  );

  const { id: rawId, when, disabled, disabledReason, unmodeled, note, __from, ...rest } = n.props as Record<string, unknown>;
  const at = n.source;
  if (!KNOWN.has(n.type)) err('UNKNOWN_COMPONENT', `组件 <${n.type}> 不在目录中（请使用 Mantine 同名组件，运行 joplo skill components 查看目录；目录没有的用 <Custom kind="…"> 占位）`, at);
  const interactive = INTERACTIVE_TYPES.has(n.type);
  if (interactive && typeof rawId !== 'string') err('MISSING_ID', `可操作组件 <${n.type}>「${labelOf(n)}」必须有 id，步骤和选中都靠它定位`, at);
  if (n.type === 'Diagram.Node' && typeof rawId !== 'string') err('MISSING_ID', `架构图节点 <Diagram.Node>「${labelOf(n)}」必须有 id，连线的 from / to 靠它`, at);
  if (n.type === 'Diagram') checkDiagram(n, err);
  // 连线没写 id 时用「from->to」：⌥+单击检查与 rules 的 elements 都能引用它
  const edgeId = n.type === 'Diagram.Edge' && typeof rest.from === 'string' && typeof rest.to === 'string' ? `${rest.from}->${rest.to}` : null;
  const id = typeof rawId === 'string' ? rawId : (edgeId ?? `_${fallbackId}`);
  if (ids.has(id)) err('DUPLICATE_ID', `同一画面中 id「${id}」重复（另一处：${rel(ids.get(id)) ?? '未知'}）`, at);
  ids.set(id, at);

  const props: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rest)) {
    if (v === undefined) continue; // 写了属性但值是 undefined（如 description={cond ? '…' : undefined}）= 没写
    if (typeof v === 'function' && !isBind(v)) {
      err('FUNCTION_PROP', `<${n.type}> 的属性 ${k} 是函数。行为请写在 option 的 flow 步骤里，而不是事件回调`, at);
      continue;
    }
    if (isNode(v)) {
      err('ELEMENT_PROP', `<${n.type}> 的属性 ${k} 是一个元素。属性只支持字符串、数字、布尔和对象；图标请写成字符（例如 leftSection="+"），内容请写成子节点`, at);
      continue;
    }
    props[k] = toPropValue(v);
  }
  const node: SceneNode = { id, type: n.type as SceneNode['type'] };
  if (Object.keys(props).length) node.props = props;
  if (children.length) node.children = children;
  if (when !== undefined) node.when = toCondition(when) as SceneNode['when'];
  if (disabled !== undefined) node.disabled = (typeof disabled === 'boolean' ? disabled : toCondition(disabled)) as SceneNode['disabled'];
  if (typeof disabledReason === 'string') node.disabledReason = disabledReason;
  if (unmodeled === true) node.unmodeled = true;
  if (typeof note === 'string') node.note = note;
  if (typeof __from === 'string') node.from = __from;
  const s = rel(at);
  if (s) node.source = s;
  return node;
}

/**
 * 架构图校验：Diagram.Edge 的 from / to 必须是同一个 Diagram 里（含嵌套分组）存在的 Diagram.Node id。
 * 嵌套的另一个 Diagram 自成一体，不参与本图的校验。
 */
function checkDiagram(d: JNode, err: ErrFn): void {
  const nodes = new Set<string>();
  const edges: JNode[] = [];
  const walk = (cs: JChild[]) => {
    for (const c of flatten(cs)) {
      if (!isNode(c) || c.type === 'Diagram') continue;
      if (c.type === 'Diagram.Node' && typeof c.props.id === 'string') nodes.add(c.props.id);
      if (c.type === 'Diagram.Edge') edges.push(c);
      walk(c.children);
    }
  };
  walk(d.children);
  const known = [...nodes].join('、') || '（没有节点）';
  for (const e of edges) {
    for (const k of ['from', 'to'] as const) {
      const v = e.props[k];
      if (typeof v !== 'string' || !nodes.has(v))
        err('UNKNOWN_DIAGRAM_NODE', `<Diagram.Edge> 的 ${k}「${typeof v === 'string' ? v : String(v)}」不是这个 Diagram 里的节点 id（可用：${known}）`, e.source);
    }
  }
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

function stepRouteBefore(steps: StepDef[], i: number, start: string): string {
  let route = start;
  for (let k = 0; k < i; k++) for (const e of steps[k]!.effects) if (e.type === 'go') route = e.route;
  return route;
}

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
function autoCaption(st: StepDef, scene: Scene | undefined): string {
  const a = st.action;
  const node = 'target' in a && scene ? findIn(scene.root, a.target) : null;
  const label = node ? nodeLabel(node) : 'target' in a ? a.target : '';
  switch (a.type) {
    case 'click':
      return `点击「${label}」`;
    case 'type':
      return `在「${label}」中输入“${a.value}”`;
    case 'select': {
      const choices = node ? choicesOf(node, NO_STATE) : null;
      return `在「${label}」中选择“${(choices && matchChoice(choices, a.value)?.label) ?? a.value}”`;
    }
    case 'toggle':
      return node?.type === 'Checkbox' ? `${a.value ? '勾选' : '取消勾选'}「${label}」` : `${a.value ? '打开' : '关闭'}「${label}」`;
    case 'back':
      return '返回上一页';
    case 'event':
      return a.name;
  }
}

function stripSources(o: unknown): void {
  if (Array.isArray(o)) return o.forEach(stripSources);
  if (o && typeof o === 'object') {
    delete (o as Record<string, unknown>).source;
    Object.values(o).forEach(stripSources);
  }
}

function stripNotes(n: SceneNode): void {
  delete n.note;
  delete n.source;
  for (const c of n.children ?? []) stripNotes(c);
}
