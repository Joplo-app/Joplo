import { rolesOf } from './entries.ts';
/**
 * 朗读（D74）的纯函数：看板、发布站、服务端（生成与 build）共用。
 *
 * - 读什么：narrationText —— 有 say() 读 say；过渡卡读标题和副标题；其余读字幕（字幕由调用方按当前语言给出，
 *   自动字幕在网页里本地化）。explain 不读。
 * - 谁来读：speakerRoleAt —— 用户操作取这一步导演层画面的角色（与字幕说话人同一来源）；系统步骤、过渡卡用旁白。
 * - 音频片段的键：clipKey(声音指纹, 朗读文字)。指纹由服务端按 profile 与音色算出（不含 Key），
 *   同一段文字换了声音或改了字就是新键，旧音频自然失效，不需要另记“过期”。
 * - 节奏：每一步停留 = max(画面停留, 声音时长 + VOICE_BREATH_MS)，换气按播放速度缩放。
 */
import { cameraAt, layersOf, roleOfScene } from './player.ts';
import type { Project, Step } from './schema.ts';

/**
 * 默认说话风格（D74）：像讲解人介绍功能，而不是朗读；用文字本身的语言、母语口音读（这就是“跟随语言”：
 * 同一个音色读中文就是中文母语的读法，读英文就是英文的读法）。发给支持 instructions 的模型。
 */
export const DEFAULT_STYLE =
  'You are the narrator of a short product demo. Speak like a friendly presenter walking a colleague through a new feature: warm, clear and relaxed, at a natural conversational pace, never like reading a list. Pause briefly at commas and between sentences. Read the text in its own language with a natural native accent; never translate it.';

/** 读完之后、进下一步之前的换气（毫秒，1× 速度）。 */
export const VOICE_BREATH_MS = 450;

/** 一段文字是不是以中日韩文字为主（决定拼接时用全角句号）。 */
const mostlyWide = (t: string) => [...t].filter((ch) => (ch.codePointAt(0) ?? 0) > 0x2e80).length * 2 >= [...t.replace(/\s/g, '')].length;

/** 全角句号与句末标点（写成转义：源码里不放 CJK 字面量）。 */
const WIDE_STOP = '\u3002';
const SENTENCE_END = /[\u3002\uff01\uff1f!?.\u2026:\uff1a;\uff1b,\uff0c]$/;

/** 把几句话连成一段朗读：句末没有标点时补一个（中文“。”，其他“.”）。 */
export function joinSpoken(parts: (string | null | undefined)[]): string {
  const xs = parts.map((p) => (p ?? '').trim()).filter(Boolean);
  return xs
    .map((p, i) => (i < xs.length - 1 && !SENTENCE_END.test(p) ? p + (mostlyWide(p) ? WIDE_STOP : '.') : p))
    .join(xs.some(mostlyWide) ? '' : ' ');
}

/**
 * 这一步读什么、用谁的声音（D74）：narrate()（旁白的声音）> say()（这一步角色的声音；没有角色时旁白）>
 * 字幕（旁白的声音；过渡卡读标题和副标题）。caption 是这一步在当前语言下显示的字幕（网页用 stepCaption，服务端用 step.caption）；
 * speaker 是这一步的说话角色（speakerRoleAt）。text 为空串表示这一步不读；role 为 null 表示旁白。
 */
export function spokenLine(step: Step, caption: string, speaker: string | null): { text: string; role: string | null } {
  if (step.narrate?.trim()) return { text: step.narrate.trim(), role: null };
  if (step.say?.trim()) return { text: step.say.trim(), role: speaker };
  if (step.action.type === 'card') return { text: joinSpoken([step.action.title, step.action.sub]), role: null };
  return { text: caption.trim(), role: null };
}

/** 这一步要读的文字（不关心是谁读）。 */
export function narrationText(step: Step, caption: string): string {
  return spokenLine(step, caption, null).text;
}

/** 第 index 步（1 起）的说话角色：用户操作取这一步之后导演所在层画面的角色 id；没有角色、系统步骤与过渡卡为 null。say() 用它的声音。 */
export function speakerRoleAt(project: Project, scenarioId: string, index: number): string | null {
  const step = project.scenarios[scenarioId]?.steps[index - 1];
  // say(…, { role }) 写明了是谁（D100）：任何步骤都以它为准（系统步骤没有“操作的人”）
  if (step?.say && step.sayRole) return rolesOf(project, project.scenarios[scenarioId]?.workId).find(r => r.id === step.sayRole)?.id ?? null;
  if (!step || step.kind !== 'user') return null;
  const layer = cameraAt(project, scenarioId, index).directorLayer;
  const sceneId = layersOf(project, scenarioId).find((l) => l.id === layer)?.sceneId;
  return roleOfScene(project, sceneId)?.id ?? null;
}

/** 53 位的字符串哈希（cyrb53），两个种子拼成 26 位十六进制；同步、无依赖，网页与服务端结果一致。 */
function cyrb53(s: string, seed: number): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** 音频片段的键：声音指纹 + 规整后的朗读文字（空白合并）。 */
export function clipKey(fingerprint: string, text: string): string {
  const s = `${fingerprint}\n${text.replace(/\s+/g, ' ').trim()}`;
  return `c${cyrb53(s, 1).toString(16).padStart(14, '0')}${cyrb53(s, 7).toString(16).padStart(14, '0')}`;
}

/** 某个角色（null = 旁白）的声音；传文字时优先该语言索引中的片段覆盖，再用角色 / 旁白指纹。 */
export function voiceFingerprint(voices: { narrator: string | null; roles: Record<string, string>; overrides?: Record<string, string> }, roleId: string | null, text?: string): string | null {
  if (text !== undefined) {
    const override = voices.overrides?.[clipKey(roleId ?? '', text)];
    if (override) return override;
  }
  return (roleId ? voices.roles[roleId] : undefined) ?? voices.narrator;
}

/**
 * 托管朗读的计费字数（D85，与 Cloud 一致）：规整空白后的朗读文字按 Array.from 计（一个 emoji、一个汉字都算 1 个字）。
 * 看板的“约 X 字”、`joplo voice --dry-run` 的估算与服务端的扣费用同一个算法。
 */
export function spokenChars(text: string): number {
  return Array.from(text.replace(/\s+/g, ' ').trim()).length;
}
