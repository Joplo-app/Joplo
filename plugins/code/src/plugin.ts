import packageInfo from './version.json' with { type: 'json' };
import { z } from 'zod';
import { definePlugin, pluginComponent, pluginEffect, type PluginIRNode } from '@joplo-app/kit/plugin';
import { skill } from './guide.ts';
import { applyOps, DIFF_MS, initialFrame, langOf, LANGS, typeMs, type EditorFrame, type Op } from './model.ts';

/**
 * 代码插件（D96 原型）：一个代码编辑器窗口，逐字打出新代码、按行 diff、高亮几行。
 * 端到端：作者效果 typeCode / editCode / highlightLines → effect 钩子校验并记下这一步的操作（step ext.code.ops）
 * 和效果时长 holdMs（D98）→ frame 钩子在上一步快照上应用操作，得到每一步每个编辑器的完整快照（ext.code.editors）
 * → 运行时只读快照，按引擎时钟画动画。着色在编译期由 Shiki 完成，浏览器不带语法库。
 */
type TypeOpts = { after?: number; cps?: number };
/** 在第 after 行之后（缺省：末尾）逐字打出 text；cps = 每秒字符数（缺省 28）。 */
export const typeCode = (editor: string, text: string, opts: TypeOpts = {}) => pluginEffect('code', 'type', { editor, text, ...opts });
/** 把代码改成 code（完整的新代码），按行 diff：删掉的行标红收起，新增的行标绿展开。 */
export const editCode = (editor: string, code: string) => pluginEffect('code', 'edit', { editor, code });
/** 高亮第 from–to 行（1 起，只属于这一步）；highlightLines(editor, null) 什么都不高亮。 */
export const highlightLines = (editor: string, from: number | null, to?: number) => pluginEffect('code', 'highlight', { editor, from, to: to ?? from });

const all = (n: PluginIRNode): PluginIRNode[] => [n, ...(n.children ?? []).flatMap(all)];
const editorsIn = (roots: readonly PluginIRNode[]) => roots.flatMap(all).filter((n) => n.type === 'code:Editor');
type StepData = { ops: Op[] };
const Tok = z.tuple([z.string(), z.number().int().nonnegative()]);
const LineS = z.array(Tok);
const EditorFrameS = z.strictObject({
  lang: z.enum(LANGS), code: z.string(), palette: z.array(z.string()), lines: z.array(LineS),
  anim: z.union([z.null(), z.strictObject({ kind: z.literal('type'), from: z.number().int(), to: z.number().int(), cps: z.number() }), z.strictObject({ kind: z.literal('diff'), rows: z.array(z.union([z.strictObject({ k: z.enum(['s', 'a']), i: z.number().int() }), z.strictObject({ k: z.literal('d'), line: LineS })])) })]),
  hl: z.union([z.null(), z.tuple([z.number().int(), z.number().int()])]),
});
const OpS = z.union([
  z.strictObject({ kind: z.literal('type'), editor: z.string(), text: z.string(), after: z.number().int().nullable(), cps: z.number() }),
  z.strictObject({ kind: z.literal('edit'), editor: z.string(), code: z.string() }),
  z.strictObject({ kind: z.literal('highlight'), editor: z.string(), from: z.number().int(), to: z.number().int() }),
  z.strictObject({ kind: z.literal('clear'), editor: z.string() }),
]);
/** 步骤槽位：effect 写这一步的操作，frame 换成每个编辑器的完整快照。 */
const StepS = z.union([z.strictObject({ ops: z.array(OpS) }), z.strictObject({ editors: z.record(z.string(), EditorFrameS) })]);
type Frame = { editors: Record<string, EditorFrame> };

const code = definePlugin({
  packageName: '@joplo-app/plugin-code',
  id: 'code', title: 'Code', version: packageInfo.version,
  runtime: new URL(import.meta.url.endsWith('.ts') ? './runtime.tsx' : './runtime.js', import.meta.url),
  components: {
    Editor: { doc: `file?, lang?=${LANGS.join('|')}, code (initial text), h?=360, w?; a code editor window. Change it with typeCode / editCode / highlightLines`, needsId: true, selfEvident: true, traits: { frame: true, text: ['file'] } },
  },
  skill,
  schemas: { step: StepS },
  data: { step: { scope: [{ path: ['editors'], kind: 'map', domain: 'element' }] } },
  compile: {
    node(n, { report }) {
      if (n.type !== 'code:Editor') return;
      const props = (n as { props?: Record<string, unknown> }).props ?? {};
      if (props.code !== undefined && typeof props.code !== 'string') report('CODE_INVALID', '<Editor code> must be a string (the initial file content)', (n as { source?: string }).source);
      if (!langOf(props.lang)) report('CODE_LANG_UNKNOWN', `<Editor lang="${String(props.lang)}">: use one of ${LANGS.join(', ')}`, (n as { source?: string }).source);
    },
    effect(effect, ctx) {
      const p = effect.payload as Record<string, unknown>;
      const editor = typeof p?.editor === 'string' ? p.editor : '';
      if (!editorsIn(ctx.roots).some((n) => n.id === editor)) { ctx.report('CODE_EDITOR_UNKNOWN', `${effect.name}("${editor}") : no <Editor id="${editor}"> on the screens of this step`, ctx.source); return; }
      const ops = [...((ctx.data as StepData | undefined)?.ops ?? [])];
      let holdMs = 0;
      if (effect.name === 'type') {
        const cps = p.cps === undefined ? 28 : p.cps;
        const after = p.after === undefined ? null : p.after;
        if (typeof p.text !== 'string' || !p.text.trim()) { ctx.report('CODE_INVALID', 'typeCode(editor, text) needs the text to type', ctx.source); return; }
        if (typeof cps !== 'number' || !(cps >= 5 && cps <= 200)) { ctx.report('CODE_INVALID', 'typeCode cps must be 5–200 characters per second', ctx.source); return; }
        if (after !== null && !(Number.isInteger(after) && (after as number) >= 0)) { ctx.report('CODE_INVALID', 'typeCode { after } is a line number (0 = before the first line)', ctx.source); return; }
        ops.push({ kind: 'type', editor, text: p.text, after: after as number | null, cps });
        holdMs = Math.min(60_000, typeMs(p.text, cps));
      } else if (effect.name === 'edit') {
        if (typeof p.code !== 'string') { ctx.report('CODE_INVALID', 'editCode(editor, code) needs the complete new code', ctx.source); return; }
        ops.push({ kind: 'edit', editor, code: p.code });
        holdMs = DIFF_MS;
      } else if (effect.name === 'highlight') {
        if (p.from === null) ops.push({ kind: 'clear', editor });
        else if (Number.isInteger(p.from) && Number.isInteger(p.to) && (p.from as number) >= 1 && (p.to as number) >= (p.from as number)) ops.push({ kind: 'highlight', editor, from: p.from as number, to: p.to as number });
        else { ctx.report('CODE_INVALID', 'highlightLines(editor, from, to?) takes 1-based line numbers, to ≥ from', ctx.source); return; }
      } else { ctx.report('PLUGIN_EFFECT_UNKNOWN', `Unknown code effect ${effect.name}`, ctx.source); return; }
      return { data: { ops } satisfies StepData, references: [editor], ...(holdMs ? { holdMs } : {}) };
    },
    frame(ctx) {
      const editors = editorsIn(ctx.roots);
      if (!editors.length) return;
      const previous = (ctx.previousData as Frame | undefined)?.editors ?? {};
      const ops = (ctx.data as StepData | undefined)?.ops ?? [];
      const out: Record<string, EditorFrame> = {};
      for (const node of editors) {
        if (out[node.id]) continue;
        const props = node.props ?? {};
        const base = previous[node.id] ?? initialFrame(typeof props.code === 'string' ? props.code : '', langOf(props.lang) ?? 'text');
        const mine = ops.filter((o) => o.editor === node.id);
        out[node.id] = mine.length ? applyOps(base, mine) : { ...base, anim: null, hl: null };
      }
      return { editors: out } satisfies Frame;
    },
  },
});

export const Editor = pluginComponent(code, 'Editor');
export default code;
