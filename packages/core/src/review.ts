/**
 * 评审清单（云端契约 8.1，v1）：`joplo share` 放进 `POST /api/v1/shares` 请求体的 `review` 字段，
 * 不作为分享文件上传（不进 R2、不进 meta.json，分享页 Worker 读不到）。评审页据此显示方案、规则、问题和每一步涉及的规则。
 *
 * - 输入必须是 dev IR（只有它带规则和问题）；mode = publish 时只含选定方案的内容（与 publish 构建同一范围：
 *   没有选定方案的功能不出现，规则与问题只含功能级和选定方案的），mode = review 时含所有功能的所有方案。
 * - id 全部沿用 IR（功能 Id、方案 / 规则 / 问题 / 场景 / 步骤的 Qid、元素 Id）；步骤 index 从 0 开始。
 * - 上限：字符串按 Unicode 码点截断（末尾 “…”），数组超出部分丢弃，id 永不截断（Qid ≤ 256、Id ≤ 64 由 schema 保证）；
 *   截断后序列化仍超过 512 KiB 时 assertReviewManifestSize 报错（share 在发任何请求之前失败），不静默丢内容。
 */
import { localOnlyWorks, localOnlyElementIds, withoutLocalContributions } from './publication.ts';
import { nodeLabel } from './catalog.ts';
import { featuresOf } from './features.ts';
import { JoploError } from './result.ts';
import type { Project, SceneNode } from './schema.ts';

/** 2（D103）：features[].options → works、optionId → workId、scenarios[].featureId 可为 null、新增顶层 works（独立作品）。清单的结构变了就升，云端按版本号严格解析。 */
export const REVIEW_MANIFEST_VERSION = 2 as const;
/** 契约 8.1：评审清单 JSON（UTF-8）最多 512 KiB。 */
export const REVIEW_MANIFEST_MAX_BYTES = 512 * 1024;

/** 字段上限（客户端截断；SaaS 的 zod 校验至少要接受这些值）。 */
export const REVIEW_LIMITS = {
  features: 100,
  /** 每个功能的方案数。 */
  works: 20,
  /** 每个功能的规则数（功能级 + 方案级）。 */
  rules: 300,
  questions: 100,
  tradeoffs: 20,
  /** 每条规则关联的元素数。 */
  elementIds: 50,
  scenarios: 500,
  /** 每个场景的步骤数。 */
  steps: 200,
  /** 每一步关联的规则数。 */
  ruleIds: 50,
  elements: 2000,
  text: { name: 200, goal: 2000, summary: 2000, tradeoff: 500, rule: 2000, question: 2000, caption: 500, explain: 2000, label: 200 },
} as const;

export type ReviewManifestMode = 'publish' | 'review';
export type ReviewManifest = {
  v: typeof REVIEW_MANIFEST_VERSION;
  mode: ReviewManifestMode;
  /** 参与清单的独立作品，按 entryIds 排序；功能下的作品在 features[].works。 */
  works: { id: string; key: string; title: string; summary: string }[];
  features: {
    id: string;
    name: string;
    goal: string;
    pick: string | null;
    works: { id: string; key: string; title: string; summary: string; tradeoffs: string[] }[];
    rules: { id: string; workId: string | null; text: string; origin: string; confirmation: string; elementIds: string[] }[];
    questions: { id: string; workId: string | null; text: string; severity: 'blocker' | 'major' | 'minor' }[];
  }[];
  scenarios: { id: string; featureId: string | null; workId: string; name: string; steps: { id: string; index: number; caption: string; explain: string | null; ruleIds: string[] }[] }[];
  elements: { id: string; label: string }[];
};

/** 作者写的元素 id（和 Rule.elementIds 同一套）；编译器生成的以 `_` 开头，不算。 */
export const AUTHOR_ELEMENT_ID = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

/** 按码点截断，超出时最后一个码点换成 “…”。 */
export function clipText(text: string, max: number): string {
  const chars = [...text];
  return chars.length <= max ? text : `${chars.slice(0, max - 1).join('')}…`;
}

export function reviewManifest(project: Project, mode: ReviewManifestMode): ReviewManifest {
  if (project.mode !== 'dev') throw new JoploError('USAGE', `The review manifest needs the dev IR (rules and questions); got a ${project.mode} IR`);
  const local = localOnlyWorks(project);
  const privateElements = localOnlyElementIds(project, local);
  const L = REVIEW_LIMITS;
  const T = L.text;
  const features: ReviewManifest['features'] = [];
  const works: ReviewManifest['works'] = [];
  const scenarios: ReviewManifest['scenarios'] = [];
  /** 参与的方案（publish：每个功能的选定方案）。 */
  const included = new Set<string>();
  for (const f of featuresOf(project)) {
    if (features.length >= L.features) break;
    // 清单读取 dev IR；草稿仍不能随普通分享或评审版上传。
    if (f.workIds.some(id => local.has(id))) continue;
    const workIds = (mode === 'publish' ? (f.pick ? [f.pick] : []) : f.workIds).filter((id) => project.works[id]).slice(0, L.works);
    if (mode === 'publish' && !workIds.length) continue;
    for (const id of workIds) included.add(id);
    const inScope = (workId: string | undefined) => workId === undefined || workIds.includes(workId);
    features.push({
      id: f.id,
      name: clipText(f.name, T.name),
      goal: clipText(f.goal, T.goal),
      pick: f.pick ?? null,
      works: workIds.map((id) => {
        const o = project.works[id]!;
        return { id: o.id, key: o.key, title: clipText(o.title, T.name), summary: clipText(o.summary, T.summary), tradeoffs: f.alternatives[id]!.tradeoffs.slice(0, L.tradeoffs).map((t) => clipText(t, T.tradeoff)) };
      }),
      rules: Object.values(project.rules)
        .filter((r) => r.featureId === f.id && inScope(r.workId))
        .slice(0, L.rules)
        .map((r) => ({ id: r.id, workId: r.workId ?? null, text: clipText(r.text, T.rule), origin: r.origin, confirmation: r.confirmation, elementIds: r.elementIds.filter(id => !privateElements.has(id)).slice(0, L.elementIds) })),
      questions: Object.values(project.issues)
        .filter((q) => q.featureId === f.id && inScope(q.workId))
        .slice(0, L.questions)
        .map((q) => ({ id: q.id, workId: q.workId ?? null, text: clipText(q.text, T.question), severity: q.severity })),
    });
    for (const workId of workIds) {
      for (const s of Object.values(project.scenarios)) {
        if (s.workId !== workId) continue;
        scenarios.push({
          id: s.id,
          featureId: f.id,
          workId: s.workId,
          name: clipText(s.name, T.name),
          steps: s.steps.slice(0, L.steps).map((st, index) => ({ id: st.id, index, caption: clipText(st.caption, T.caption), explain: st.explain === undefined ? null : clipText(st.explain, T.explain), ruleIds: st.ruleIds.slice(0, L.ruleIds) })),
        });
      }
    }
  }

  for (const id of project.entryIds) {
    if (works.length >= L.features) break;
    const w = project.works[id];
    if (!w || w.featureId || local.has(w.id)) continue;
    works.push({ id: w.id, key: w.key, title: clipText(w.title, T.name), summary: clipText(w.summary, T.summary) });
    included.add(w.id);
    for (const s of Object.values(project.scenarios)) {
      if (s.workId !== w.id) continue;
      scenarios.push({
        id: s.id, featureId: null, workId: w.id, name: clipText(s.name, T.name),
        steps: s.steps.slice(0, L.steps).map((st, index) => ({
          id: st.id, index, caption: clipText(st.caption, T.caption),
          explain: st.explain === undefined ? null : clipText(st.explain, T.explain),
          ruleIds: st.ruleIds.slice(0, L.ruleIds),
        })),
      });
    }
  }

  // 元素：参与方案能看到的所有画面（发布视图 `@路径`、方案的路径画面与层级画面）里的作者 id；同一个 id 取第一次出现的标签
  const elements = new Map<string, string>();
  const visit = (n: SceneNode) => {
    if (n.type !== '#text' && AUTHOR_ELEMENT_ID.test(n.id) && !elements.has(n.id)) elements.set(n.id, clipText(nodeLabel(n), T.label));
    for (const c of n.children ?? []) visit(c);
  };
  for (const scene of Object.values(project.scenes)) {
    if (scene.workId !== null && !included.has(scene.workId)) continue;
    const owner = project.routes[scene.route]?.addedBy;
    if (owner && local.has(owner)) continue;
    const root = withoutLocalContributions(scene.root, local);
    if (root) visit(root);
  }

  return {
    v: REVIEW_MANIFEST_VERSION,
    mode,
    features,
    works,
    scenarios: scenarios.slice(0, L.scenarios),
    elements: [...elements].slice(0, L.elements).map(([id, label]) => ({ id, label })),
  };
}

/** 序列化后的 UTF-8 字节数（请求体里就是这份 JSON）。 */
export function reviewManifestBytes(manifest: ReviewManifest): number {
  return new TextEncoder().encode(JSON.stringify(manifest)).length;
}

/** 超过 512 KiB 时报错：减少规则、问题、步骤说明后重试。 */
export function assertReviewManifestSize(manifest: ReviewManifest): void {
  const actualBytes = reviewManifestBytes(manifest);
  if (actualBytes > REVIEW_MANIFEST_MAX_BYTES)
    throw new JoploError('EXPORT_FAILED', `The review manifest is ${actualBytes} bytes, over the 512 KiB limit (${REVIEW_MANIFEST_MAX_BYTES} bytes). Shorten or remove rules, questions, captions, or explanations, then share again; nothing was uploaded`, { details: { maxBytes: REVIEW_MANIFEST_MAX_BYTES, actualBytes } });
}
