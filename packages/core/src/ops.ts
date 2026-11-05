import { safeRecords } from './records.ts';
import { z } from 'zod';
import {
  Feature,
  Case,
  Option,
  Rule,
  Scene,
  Scenario,
  Issue,
  Coverage,
  Comment,
  SceneNode,
  Condition,
  Id,
  Project,
  parseRevision,
} from './schema.ts';
import { findNode } from './player.ts';
import { JoploError } from './result.ts';

export const RevisionInput = z
  .union([
    z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    z.string().regex(/^(?:rev_)?\d+$/),
  ])
  .refine((v) => {
    const n = parseRevision(v);
    return n !== null && Number.isSafeInteger(n);
  }, '无效修订号');
export const IdempotencyKey = z
  .string()
  .min(1)
  .max(256)
  .refine((key) => !key.includes('\0'), '幂等键不可包含 NUL');
const json = z.json();
export const NodePatch = z
  .strictObject({
    props: z.record(z.string(), json).optional(),
    when: Condition.optional(),
    disabled: z.union([z.boolean(), Condition]).optional(),
    disabledReason: z.string().optional(),
    unmodeled: z.boolean().optional(),
    note: z.string().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, '节点补丁不能为空');
export const OperationSchemas = {
  upsertFeature: z.strictObject({
    op: z.literal('upsertFeature'),
    value: Feature,
  }),
  upsertCase: z.strictObject({ op: z.literal('upsertCase'), value: Case }),
  upsertOption: z.strictObject({
    op: z.literal('upsertOption'),
    value: Option,
  }),
  upsertRule: z.strictObject({ op: z.literal('upsertRule'), value: Rule }),
  upsertScene: z.strictObject({ op: z.literal('upsertScene'), value: Scene }),
  upsertScenario: z.strictObject({
    op: z.literal('upsertScenario'),
    value: Scenario,
  }),
  upsertIssue: z.strictObject({ op: z.literal('upsertIssue'), value: Issue }),
  setCoverage: z.strictObject({
    op: z.literal('setCoverage'),
    optionId: Id,
    caseId: Id,
    value: Coverage,
  }),
  updateNode: z.strictObject({
    op: z.literal('updateNode'),
    sceneId: Id,
    nodeId: Id,
    patch: NodePatch,
  }),
  insertNode: z.strictObject({
    op: z.literal('insertNode'),
    sceneId: Id,
    parentId: Id,
    index: z.number().int().nonnegative().optional(),
    value: SceneNode,
  }),
  removeNode: z.strictObject({
    op: z.literal('removeNode'),
    sceneId: Id,
    nodeId: Id,
  }),
  remove: z.strictObject({
    op: z.literal('remove'),
    kind: z.enum([
      'feature',
      'case',
      'option',
      'rule',
      'scene',
      'scenario',
      'issue',
    ]),
    id: Id,
  }),
  addComment: z.strictObject({ op: z.literal('addComment'), value: Comment }),
  replyComment: z.strictObject({
    op: z.literal('replyComment'),
    id: Id,
    text: z.string().min(1),
  }),
  setCommentStatus: z.strictObject({
    op: z.literal('setCommentStatus'),
    id: Id,
    status: Comment.shape.status.removeDefault(),
  }),
};
export const Operation = z.discriminatedUnion('op', [
  OperationSchemas.upsertFeature,
  OperationSchemas.upsertCase,
  OperationSchemas.upsertOption,
  OperationSchemas.upsertRule,
  OperationSchemas.upsertScene,
  OperationSchemas.upsertScenario,
  OperationSchemas.upsertIssue,
  OperationSchemas.setCoverage,
  OperationSchemas.updateNode,
  OperationSchemas.insertNode,
  OperationSchemas.removeNode,
  OperationSchemas.remove,
  OperationSchemas.addComment,
  OperationSchemas.replyComment,
  OperationSchemas.setCommentStatus,
]);
export const Patch = z.strictObject({
  expectRevision: RevisionInput,
  idempotencyKey: IdempotencyKey,
  summary: z.string().min(1),
  operations: z.array(Operation).min(1),
});
export type Patch = z.infer<typeof Patch>;
export type Operation = z.infer<typeof Operation>;
export const patchJSONSchema = () => z.toJSONSchema(Patch);
export const operationJSONSchemas = () =>
  Object.fromEntries(
    Object.entries(OperationSchemas).map(([k, v]) => [k, z.toJSONSchema(v)]),
  );
const tables = {
  feature: 'features',
  case: 'cases',
  option: 'options',
  rule: 'rules',
  scene: 'scenes',
  scenario: 'scenarios',
  issue: 'issues',
} as const;
const upserts = {
  upsertFeature: 'features',
  upsertCase: 'cases',
  upsertOption: 'options',
  upsertRule: 'rules',
  upsertScene: 'scenes',
  upsertScenario: 'scenarios',
  upsertIssue: 'issues',
} as const;
function required<T>(value: T | undefined, id: string): T {
  if (value === undefined)
    throw new JoploError('NOT_FOUND', `对象不存在：${id}`);
  return value;
}
const deny = (message: string): never => {
  throw new JoploError('PERMISSION_DENIED', message);
};
/** 在 schema 解析前识别审批/元数据越权，避免将其降级为普通格式错误。 */
export function checkPatchPermissions(raw: unknown): void {
  if (!raw || typeof raw !== 'object') return;
  const r = raw as Record<string, unknown>;
  if (
    ['decisions', 'schemaVersion', 'revision', 'id', 'projectId'].some(
      (k) => k in r,
    )
  )
    deny('受控工具不能修改决策或项目标识/修订/schemaVersion');
  if (Array.isArray(r.operations))
    for (const o of r.operations) {
      if (!o || typeof o !== 'object') continue;
      const op = o as Record<string, any>;
      if (
        typeof op.path === 'string' &&
        /^\/(schemaVersion|revision|id|decisions)(\/|$)/.test(op.path)
      )
        deny('受控工具不能修改决策或项目元数据');
      if (
        /decision/i.test(String(op.op)) ||
        /decision/i.test(String(op.kind)) ||
        ['decisions', 'schemaVersion', 'revision', 'projectId'].some(
          (k) => k in op,
        )
      )
        deny('受控工具不能修改决策或项目元数据');
      if (
        (op.op === 'setCommentStatus' && op.status === 'resolved') ||
        (op.op === 'addComment' && op.value?.status === 'resolved')
      )
        deny('评论只能由人关闭');
    }
}
export function applyOperations(
  original: Project,
  operations: Operation[],
): { project: Project; changedIds: string[] } {
  const p = safeRecords(structuredClone(original));
  const changed = new Set<string>();
  for (const op of operations) {
    if (op.op in upserts) {
      const u = op as Extract<
        Operation,
        { value: Feature | Case | Option | Rule | Scene | Scenario | Issue }
      >;
      const table = upserts[op.op as keyof typeof upserts];
      const value = structuredClone(u.value);
      const ownership = (project: Project) =>
        (
          project[table] as Record<
            string,
            { featureId?: string; optionId?: string }
          >
        )[value.id];
      const existing = ownership(original) ?? ownership(p);
      if (existing)
        for (const field of ['featureId', 'optionId'] as const) {
          if (
            existing[field] !==
            (value as { featureId?: string; optionId?: string })[field]
          )
            throw new JoploError(
              'INVALID_REFERENCE',
              `已有对象不可改变 ${field}：${value.id}`,
            );
        }
      if (op.op === 'upsertIssue') {
        const next = value as Issue;
        if (next.status !== 'open' && next.status !== p.issues[next.id]?.status)
          deny('接受或解决问题只能由人完成');
      }
      if (op.op === 'upsertRule') {
        const next = value as Rule;
        const old = p.rules[next.id];
        const unchanged =
          old !== undefined &&
          JSON.stringify({ ...old, confirmation: undefined }) ===
            JSON.stringify({ ...next, confirmation: undefined });
        if (
          next.confirmation === 'confirmed' &&
          !(old?.confirmation === 'confirmed' && unchanged)
        )
          deny('规则确认只能由人完成');
        const confirmed =
          original.rules[next.id]?.confirmation === 'confirmed'
            ? original.rules[next.id]
            : old?.confirmation === 'confirmed'
              ? old
              : undefined;
        if (
          confirmed &&
          JSON.stringify({ ...confirmed, confirmation: undefined }) !==
            JSON.stringify({ ...next, confirmation: undefined })
        )
          next.confirmation = 'pending';
      }
      // schema 各自验证了 value，动态表写入不改变其他表。
      (p[table] as Record<string, unknown>)[value.id] = value;
      changed.add(value.id);
      continue;
    }
    switch (op.op) {
      case 'setCoverage':
        required(p.options[op.optionId], op.optionId).coverage[op.caseId] =
          structuredClone(op.value);
        changed.add(op.optionId);
        break;
      case 'updateNode': {
        const scene = required(p.scenes[op.sceneId], op.sceneId);
        const n = required(findNode(scene, op.nodeId)?.node, op.nodeId);
        const { props, ...fields } = op.patch;
        Object.assign(n, fields);
        if (props) {
          for (const [key, v] of Object.entries(props)) {
            if (v === null) {
              if (n.props) delete n.props[key];
            } else {
              n.props ??= {};
              Object.defineProperty(n.props, key, {
                value: structuredClone(v),
                enumerable: true,
                writable: true,
                configurable: true,
              });
            }
          }
        }
        changed.add(op.sceneId);
        changed.add(op.nodeId);
        break;
      }
      case 'insertNode': {
        const scene = required(p.scenes[op.sceneId], op.sceneId);
        const parent = required(
          findNode(scene, op.parentId)?.node,
          op.parentId,
        );
        parent.children ??= [];
        const index = op.index ?? parent.children.length;
        if (index > parent.children.length)
          throw new JoploError('INVALID_SCHEMA', '插入位置越界');
        parent.children.splice(index, 0, structuredClone(op.value));
        changed.add(op.sceneId);
        changed.add(op.value.id);
        break;
      }
      case 'removeNode': {
        const scene = required(p.scenes[op.sceneId], op.sceneId);
        const found = required(
          findNode(scene, op.nodeId) ?? undefined,
          op.nodeId,
        );
        const parent = found.ancestors.at(-1);
        if (!parent)
          throw new JoploError(
            'INVALID_SCHEMA',
            '不能删除画面根节点；请替换画面',
          );
        parent.children = parent.children!.filter((n) => n.id !== op.nodeId);
        changed.add(op.sceneId);
        changed.add(op.nodeId);
        break;
      }
      case 'remove': {
        const table = p[tables[op.kind]];
        required(table[op.id], op.id);
        delete table[op.id];
        changed.add(op.id);
        break;
      }
      case 'addComment':
        if (op.value.status === 'resolved') deny('评论只能由人关闭');
        if (op.value.author !== 'agent') deny('Agent 不能冒充用户发表评论');
        if (p.comments[op.value.id])
          throw new JoploError(
            'INVALID_SCHEMA',
            '评论 ID 已存在；请回复原评论',
          );
        p.comments[op.value.id] = structuredClone(op.value);
        changed.add(op.value.id);
        break;
      case 'replyComment':
        required(p.comments[op.id], op.id).replies.push({
          author: 'agent',
          text: op.text,
          at: new Date().toISOString(),
        });
        changed.add(op.id);
        break;
      case 'setCommentStatus':
        if (op.status === 'resolved') deny('评论只能由人关闭');
        required(p.comments[op.id], op.id).status = op.status;
        changed.add(op.id);
        break;
    }
  }
  return { project: p, changedIds: [...changed].sort() };
}
/** 恢复同样不能借历史快照重新确认规则、创建决策或关闭评论。 */
export function protectRestore(current: Project, target: Project): void {
  if (
    current.id !== target.id ||
    current.schemaVersion !== target.schemaVersion
  )
    deny('不能恢复不同项目或 schema');
  if (JSON.stringify(current.decisions) !== JSON.stringify(target.decisions))
    deny('恢复不能更改人工决策');
  for (const r of Object.values(target.rules))
    if (r.confirmation === 'confirmed') {
      const old = current.rules[r.id];
      if (
        !old ||
        old.confirmation !== 'confirmed' ||
        JSON.stringify({ ...old, confirmation: undefined }) !==
          JSON.stringify({ ...r, confirmation: undefined })
      )
        deny('恢复不能重新确认规则');
    }
  for (const c of Object.values(current.comments)) {
    const restored = target.comments[c.id];
    if (!restored) deny('恢复不能删除现有评论');
    if (c.status === 'resolved' && restored!.status !== 'resolved')
      deny('恢复不能重新打开已解决评论');
  }
  for (const issue of Object.values(target.issues))
    if (
      issue.status !== 'open' &&
      issue.status !== current.issues[issue.id]?.status
    )
      deny('恢复不能接受或解决问题');
  for (const c of Object.values(target.comments))
    if (
      c.status === 'resolved' &&
      current.comments[c.id]?.status !== 'resolved'
    )
      deny('恢复不能关闭评论');
}
