import { isNode, type JNode, type JChild } from '@joplo-app/kit/node';
import type { PluginReport as Report } from '@joplo-app/kit/plugin';
import { DIAGRAM_GROUP_ICONS, DIAGRAM_NODE_KINDS, DIAGRAM_PINS, DIAGRAM_TONES, GRAPH_FAMILY, SEQUENCE_BLOCK_KINDS, SEQUENCE_FAMILY, isDiagramRoot, type DiagramIndex } from './model-index.ts';
import type { Trace } from './schema.ts';
export function resolveTrace(diagrams: DiagramIndex[], ids: string[], tmode: Trace['mode'], at: string | undefined, err: Report): Trace | null {
      const shown = `trace(${ids.map((x) => JSON.stringify(x)).join(', ')})`;
      if (!ids.length) {
        err('TRACE_UNKNOWN', `${shown} requires at least one node or edge id`, at);
        return null;
      }
      const has = (d: DiagramIndex, t: string) => d.nodes.has(t) || d.edges.some((e) => e.id === t);
      const d = diagrams.find((x) => ids.every((t) => has(x, t)));
      if (!d) {
        const missing = ids.find((t) => !diagrams.some((x) => has(x, t)));
        err('TRACE_UNKNOWN', missing ? `${shown} contains "${missing}", which is not a node, group, edge, state, transition, actor or message id in any Diagram / StateMachine / Sequence` : `${shown} mixes elements from different diagrams; trace one diagram at a time`, at);
        return null;
      }
      const nodes: string[] = [];
      const edges: Trace['edges'] = [];
      const addNode = (n: string) => {
        if (!nodes.includes(n)) nodes.push(n);
      };
      /** 节点（或分组）自己是分组时连同它算进去，再加上它的各级父分组。 */
      const groupsOfNode = (n: string): string[] => [...(d.groupIds.has(n) ? [n] : []), ...(d.groupsOf.get(n) ?? [])];
      const finishTrace = (): Trace => {
        if (tmode === 'skip') return { mode: tmode, nodes, edges, ...(d.type === 'diagram:Sequence' ? { targets: [] } : {}) };
        const all = [...new Set(nodes.flatMap(groupsOfNode))];
        const last = nodes[nodes.length - 1];
        // 失败只标红终点所在的最内层分组（终点本身是分组时就是它）；外层分组照常 active，不把整个云账号都标红
        const errorGroups = tmode === 'fail' && last ? groupsOfNode(last).slice(0, 1) : [];
        return {
          mode: tmode,
          nodes,
          edges,
          ...(all.some((g) => !errorGroups.includes(g)) ? { groups: all.filter((g) => !errorGroups.includes(g)) } : {}),
          ...(errorGroups.length ? { errorGroups } : {}),
          // 时序图的镜头对准消息所在的行（参与者头部在最上面，对准它们会把镜头拉离正在讲的那一行）
          ...(d.type === 'diagram:Sequence' ? { targets: edges.map((e) => e.id) } : {}),
        };
      };
      // trace.skip 标记“这次没被调用”的一组元素，不是路径：节点和连线各自 dim，不要求彼此相连
      if (tmode === 'skip') {
        for (const t of ids) {
          if (d.nodes.has(t)) addNode(t);
          else edges.push({ id: t, reverse: false });
        }
        return finishTrace();
      }
      const kind = d.type === 'diagram:Sequence' ? 'diagram:Sequence.Message' : d.type === 'diagram:StateMachine' ? 'diagram:StateMachine.Transition' : 'diagram:Diagram.Edge';
      let prev: string | null = null;
      for (const t of ids) {
        const edge = d.edges.find((e) => e.id === t);
        if (edge) {
          // 写连线 id：方向由上一个节点决定（从 to 端接上时逆向走）；时序图的消息各自独立，连续写几条消息 id 不要求首尾相接
          const reverse: boolean = prev !== null && prev === edge.to && prev !== edge.from;
          if (d.type !== 'diagram:Sequence' && prev !== null && prev !== edge.from && prev !== edge.to) {
            err('TRACE_UNKNOWN', `${shown}: edge "${t}"(${edge.from} → ${edge.to}) is not connected to the previous node "${prev}"`, at);
            return null;
          }
          edges.push({ id: edge.id, reverse });
          addNode(reverse ? edge.to : edge.from);
          addNode(reverse ? edge.from : edge.to);
          prev = reverse ? edge.from : edge.to;
          continue;
        }
        if (prev !== null && prev !== t) {
          // 一段：先找同向的连线，没有再找反向的；同一方向有多条时要写连线 id
          const fwd = d.edges.filter((e) => e.from === prev && e.to === t);
          const back = d.edges.filter((e) => e.from === t && e.to === prev);
          const pick = fwd.length ? fwd : back;
          if (pick.length > 1) {
            err('TRACE_AMBIGUOUS', `${shown}: "${prev}" and "${t}" have ${pick.length} ${d.type === 'diagram:Sequence' ? 'messages' : 'edges'} (${pick.map((e) => e.id).join(', ')}), use an id instead, for example trace('${pick[0]!.id}')`, at);
            return null;
          }
          if (!pick.length) {
            err('TRACE_UNKNOWN', `${shown}: "${prev}" and "${t}" have no connecting ${kind} (each segment needs one in the same diagram; either direction is allowed)`, at);
            return null;
          }
          edges.push({ id: pick[0]!.id, reverse: !fwd.length });
        }
        addNode(t);
        prev = t;
      }
      return finishTrace();
}
export function checkDiagramRoot(d: JNode, err: Report): void {
  const type = d.type as 'diagram:Diagram' | 'diagram:StateMachine' | 'diagram:Sequence';
  const strOf = (v: unknown) => (typeof v === 'string' ? v : String(v));
  const oneOf = (el: JNode, prop: string, allowed: readonly string[], severity: 'error' | 'warning' = 'error') => {
    const v = el.props[prop];
    if (v !== undefined && (typeof v !== 'string' || !allowed.includes(v))) err(prop === 'icon' ? 'ICON_UNKNOWN' : 'INVALID_DIAGRAM_PROP', `<${el.type}> ${prop}="${strOf(v)}" is not supported (available: ${allowed.join(', ')})${severity === 'warning' ? '; it is drawn as the default' : ''}`, el.source, severity);
  };
  if (type === 'diagram:Sequence') {
    const actors = new Set<string>();
    const messages: JNode[] = [];
    const walk = (cs: JChild[], inside: 'root' | 'group' | 'block') => {
      for (const c of flatten(cs)) {
        if (!isNode(c) || isDiagramRoot(c.type)) continue;
        if (c.type === SEQUENCE_FAMILY.actor) {
          if (inside === 'block') err('INVALID_DIAGRAM_CHILD', `<Sequence.Actor> "${labelOf(c)}" cannot be inside <Sequence.Block>; declare participants at the top (optionally in <Sequence.Group>) and put messages in blocks`, c.source);
          if (typeof c.props.id === 'string') actors.add(c.props.id);
        } else if (c.type === SEQUENCE_FAMILY.message) {
          if (inside === 'group') err('INVALID_DIAGRAM_CHILD', '<Sequence.Message> cannot be inside <Sequence.Group> (a group boxes participants); put it after the participants, or in a <Sequence.Block>', c.source);
          messages.push(c);
        } else if (c.type === SEQUENCE_FAMILY.group) {
          if (inside !== 'root') err('INVALID_DIAGRAM_CHILD', '<Sequence.Group> must be a direct child of <Sequence>', c.source);
          oneOf(c, 'icon', DIAGRAM_GROUP_ICONS);
          walk(c.children, 'group');
        } else if (c.type === SEQUENCE_FAMILY.block) {
          if (inside === 'group') err('INVALID_DIAGRAM_CHILD', '<Sequence.Block> cannot be inside <Sequence.Group>', c.source);
          oneOf(c, 'kind', SEQUENCE_BLOCK_KINDS);
          walk(c.children, 'block');
        } else if (c.type.startsWith('diagram:Diagram.') || c.type.startsWith('diagram:StateMachine.')) {
          err('INVALID_DIAGRAM_CHILD', `<${c.type}> cannot be used inside <Sequence>; use Sequence.Actor / Sequence.Message / Sequence.Group / Sequence.Block`, c.source);
        }
      }
    };
    walk(d.children, 'root');
    const known = [...actors].join(', ') || '(no participants)';
    for (const m of messages)
      for (const k of ['from', 'to'] as const) {
        const v = m.props[k];
        if (typeof v !== 'string' || !actors.has(v)) err('UNKNOWN_DIAGRAM_NODE', `<Sequence.Message> ${k} "${strOf(v)}" is not a participant id in this Sequence (available: ${known})`, m.source);
      }
    return;
  }
  const fam = GRAPH_FAMILY[type];
  const nodes = new Set<string>();
  const groups = new Map<string, JNode>();
  /** 元素 → 它的父分组（嵌套或 group= 引用）；记录嵌套父分组，用来查冲突。 */
  const parentOf = new Map<string, string | null>();
  const edges: JNode[] = [];
  const refs: { el: JNode; ref: string; nested: string | null }[] = [];
  let nodeCount = 0;
  const walk = (cs: JChild[], nested: string | null) => {
    for (const c of flatten(cs)) {
      if (!isNode(c) || isDiagramRoot(c.type)) continue;
      const id = typeof c.props.id === 'string' ? c.props.id : null;
      const ref = typeof c.props.group === 'string' ? c.props.group : null;
      if (c.props.group !== undefined && ref === null) err('UNKNOWN_DIAGRAM_GROUP', `<${c.type}> group must be a group id string`, c.source);
      if (c.type === fam.node) {
        nodeCount++;
        if (id) {
          nodes.add(id);
          parentOf.set(id, ref ?? nested);
        }
        if (ref) refs.push({ el: c, ref, nested });
        oneOf(c, 'pin', DIAGRAM_PINS);
        // kind 以前没有校验（未知值画成 service）：保持兼容，只给 warning
        if (type === 'diagram:Diagram') oneOf(c, 'kind', DIAGRAM_NODE_KINDS, 'warning');
      } else if (c.type === fam.group) {
        if (id) {
          groups.set(id, c);
          parentOf.set(id, ref ?? nested);
        }
        if (ref) refs.push({ el: c, ref, nested });
        oneOf(c, 'icon', DIAGRAM_GROUP_ICONS);
        oneOf(c, 'tone', DIAGRAM_TONES);
        oneOf(c, 'pin', DIAGRAM_PINS);
        walk(c.children, id ?? nested);
      } else if (c.type === fam.edge) {
        edges.push(c);
      } else if (c.type.startsWith('diagram:Diagram.') || c.type.startsWith('diagram:StateMachine.') || c.type.startsWith('diagram:Sequence.')) {
        err('INVALID_DIAGRAM_CHILD', `<${c.type}> cannot be used inside <${type}>; use ${fam.node} / ${fam.edge} / ${fam.group}`, c.source);
      }
    }
  };
  walk(d.children, null);
  const groupList = [...groups.keys()].join(', ') || '(no groups with an id)';
  for (const { el, ref, nested } of refs) {
    if (!groups.has(ref)) err('UNKNOWN_DIAGRAM_GROUP', `<${el.type}> group="${ref}" is not a ${fam.group} id in this ${type} (available: ${groupList})`, el.source);
    else if (nested && nested !== ref) err('DIAGRAM_GROUP_CONFLICT', `<${el.type}> is nested in group "${nested}" but declares group="${ref}"; use one of the two`, el.source);
  }
  // 分组成环（只可能来自 group= 引用）
  const reported = new Set<string>();
  for (const gid of groups.keys()) {
    const seen: string[] = [gid];
    for (let q = parentOf.get(gid) ?? null; q && groups.has(q); q = parentOf.get(q) ?? null) {
      if (seen.includes(q)) {
        const cycle = seen.slice(seen.indexOf(q));
        const key = [...cycle].sort().join(',');
        if (!reported.has(key)) {
          reported.add(key);
          err('DIAGRAM_GROUP_CYCLE', `Groups ${[...cycle, q].map((x) => `"${x}"`).join(' → ')} contain each other; remove one group= reference`, groups.get(gid)!.source);
        }
        break;
      }
      seen.push(q);
    }
  }
  const ancestors = (id: string): string[] => {
    const out: string[] = [];
    for (let q = parentOf.get(id) ?? null; q && !out.includes(q); q = parentOf.get(q) ?? null) out.push(q);
    return out;
  };
  const known = [...nodes, ...groups.keys()].join(', ') || '(no nodes)';
  for (const e of edges) {
    let ok = true;
    for (const k of ['from', 'to'] as const) {
      const v = e.props[k];
      if (typeof v !== 'string' || (!nodes.has(v) && !groups.has(v))) {
        ok = false;
        err('UNKNOWN_DIAGRAM_NODE', `<${fam.edge}> ${k} "${strOf(v)}" is not a ${type === 'diagram:StateMachine' ? 'state' : 'node'} or group id in this ${type} (available: ${known})`, e.source);
      }
    }
    if (!ok) continue;
    const from = e.props.from as string;
    const to = e.props.to as string;
    if (ancestors(from).includes(to) || ancestors(to).includes(from))
      err('DIAGRAM_EDGE_INTO_OWN_GROUP', `<${fam.edge}> ${from} → ${to} connects an element to a group that contains it; connect to another element inside the group, or to a group outside`, e.source);
  }
  // 按业务域分组的提示：节点多，却没有分组（或只有一个把所有节点都包起来的分组）
  if (type === 'diagram:Diagram' && nodeCount >= 6) {
    const top = [...groups.values()].filter((g) => !parentOf.get(String(g.props.id)));
    const allInOne = groups.size === 1 && top.length === 1 && [...nodes].every((n) => parentOf.get(n) === String(top[0]!.props.id));
    if (groups.size === 0 || allInOne)
      err('DIAGRAM_UNGROUPED', `<Diagram> has ${nodeCount} nodes but ${groups.size === 0 ? 'no groups' : 'a single group around all of them'}; group nodes by business domain (gateway, runtime, storage…) with <Diagram.Group label icon> so viewers can tell what belongs where. See npx joplo skill diagram`, d.source, 'info');
  }
}

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

function labelOf(n: JNode): string {
  const p = n.props;
  for (const k of ['label', 'title', 'placeholder', 'aria-label']) if (typeof p[k] === 'string') return p[k] as string;
  const t = flatten(n.children).filter((c) => typeof c === 'string').join('');
  return t || n.type;
}
