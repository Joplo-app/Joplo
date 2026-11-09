import { MessageError, type Text } from '../i18n/messages';
import type { Locale } from '../i18n/locale';
import { m } from '../i18n/board/messages';
/**
 * 看板与 `joplo dev` 看板进程通信（一个进程、多个项目，D39）。
 *
 * - 读：项目列表 `/__joplo/projects`、某个项目的 IR `/__joplo/p/<id>/ir`、选中、视频导出状态。
 * - 推送：Vite HMR 自定义事件 `joplo:ir`（带 projectId，只接收当前项目的）与 `joplo:projects`（列表变化）。
 * - 写：选中、移除项目、打开编辑器、导出 —— 都带本地令牌（页面 meta），服务端另校验 Origin。
 */
import type { AppearanceFont, AppearanceStroke, Diagnostic, Project, Selection, LocalReviewState, LocalReviewWrite } from '@joplo-app/core';
import type { SelectionInput, SelectionWriteResult } from './demo';

export type DevPayload = { projectId?: string; version: number; ok: boolean; project: Project | null; diagnostics: Diagnostic[]; home: string | null };

export type ProjectSummary = {
  id: string;
  dir: string;
  name: string;
  lastOpened: string;
  status: 'idle' | 'compiling' | 'ok' | 'error' | 'missing';
  errors: number;
  version: number;
};

export type VideoJob = {
  id: string;
  projectId: string;
  scenarioId: string;
  status: 'running' | 'done' | 'error' | 'cancelled';
  phase: 'starting' | 'recording' | 'saving' | 'done' | 'error' | 'cancelled';
  step: number;
  total: number;
  percent: number;
  file: string | null;
  error: string | null;
};

export function localToken(): string | null {
  const v = document.querySelector<HTMLMetaElement>('meta[name="joplo-token"]')?.content ?? '';
  return v && v !== '__JOPLO_TOKEN__' ? v : null;
}

const enc = encodeURIComponent;
const errMsg = (e: unknown): Text => e instanceof MessageError ? e.text : e instanceof Error ? e.message : String(e);

async function readError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? `HTTP ${res.status}`;
}

function writeHeaders(json = true): Record<string, string> | null {
  const token = localToken();
  if (!token) return null;
  return { 'x-joplo-token': token, ...(json ? { 'content-type': 'application/json' } : {}) };
}

export async function fetchProjects(): Promise<ProjectSummary[] | { error: Text }> {
  try {
    const res = await fetch('/__joplo/projects', { cache: 'no-store' });
    if (!res.ok) return { error: m.board.couldNotReadProjectList(await readError(res)) };
    return ((await res.json()) as { projects: ProjectSummary[] }).projects;
  } catch (e) {
    return { error: m.board.couldNotConnectToJoploDev(errMsg(e)) };
  }
}

export async function fetchIR(projectId: string): Promise<DevPayload | { error: Text; status?: number }> {
  try {
    const res = await fetch(`/__joplo/p/${enc(projectId)}/ir`, { cache: 'no-store' });
    if (!res.ok) return { error: await readError(res), status: res.status };
    return (await res.json()) as DevPayload;
  } catch (e) {
    return { error: m.board.couldNotConnectToJoploDev(errMsg(e)) };
  }
}

type Hot = { on(ev: string, cb: (d: any) => void): void; off(ev: string, cb: (d: any) => void): void };
const hot = (): Hot | null => (import.meta.hot as unknown as Hot | undefined) ?? null;

/** 订阅某个项目的 IR 推送。返回取消函数。 */
export function subscribeIR(projectId: string, cb: (p: DevPayload) => void, onConnection?: (connected: boolean) => void): () => void {
  const h = hot();
  if (!h) return () => undefined;
  const handler = (p: DevPayload) => {
    if (p.projectId === projectId) cb(p);
  };
  const up = () => onConnection?.(true);
  const down = () => onConnection?.(false);
  h.on('joplo:ir', handler);
  h.on('vite:ws:connect', up);
  h.on('vite:ws:disconnect', down);
  onConnection?.(true);
  return () => {
    h.off('joplo:ir', handler);
    h.off('vite:ws:connect', up);
    h.off('vite:ws:disconnect', down);
  };
}

/** 订阅项目列表变化（再次 joplo dev 注册、编译状态变化、移除）。 */
export function subscribeProjects(cb: (list: ProjectSummary[]) => void): () => void {
  const h = hot();
  if (!h) return () => undefined;
  const handler = (d: { projects: ProjectSummary[] }) => cb(d.projects);
  h.on('joplo:projects', handler);
  return () => h.off('joplo:projects', handler);
}

export async function fetchSelection(projectId: string): Promise<Selection | null> {
  try {
    const res = await fetch(`/__joplo/p/${enc(projectId)}/selection`, { cache: 'no-store' });
    const body = (await res.json()) as { selection?: Selection | null };
    return body.selection ?? null;
  } catch {
    return null;
  }
}

/** 写回选中；null 表示取消选中（selection.json 写为 null）。 */
export function selectionWriter(projectId: string) {
  return async (input: SelectionInput | null): Promise<SelectionWriteResult> => {
    const headers = writeHeaders();
    if (!headers) return { ok: false, message: m.board.thisPageHasNoLocalTokenOpenItThrough };
    try {
      const res = await fetch(`/__joplo/p/${enc(projectId)}/selection`, { method: 'PUT', headers, body: JSON.stringify({ selection: input }) });
      const body = (await res.json().catch(() => null)) as { selection?: Selection | null; current?: Selection | null; error?: { message?: string } } | null;
      if (res.ok) return { ok: true, selection: body?.selection ?? null };
      return { ok: false, message: body?.error?.message ?? `HTTP ${res.status}`, ...(body && 'current' in body ? { current: body.current ?? null } : {}) };
    } catch (e) {
      return { ok: false, message: errMsg(e) };
    }
  };
}

async function post(url: string, body: unknown, method = 'POST'): Promise<Response> {
  const headers = writeHeaders(body !== undefined);
  if (!headers) throw new MessageError(m.board.thisPageHasNoLocalTokenOpenItThrough);
  return fetch(url, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
}

/** 仅本地看板可用；读写都带本机令牌，发布站不导入这个客户端。 */
export async function fetchLocalReview(projectId: string, optionId: string): Promise<{ ok: true; state: LocalReviewState } | { ok: false; message: Text }> {
  try {
    const headers = writeHeaders(false);
    if (!headers) throw new MessageError(m.board.thisPageHasNoLocalToken);
    const res = await fetch(`/__joplo/p/${enc(projectId)}/review?option=${enc(optionId)}`, { headers, cache: 'no-store' });
    return res.ok ? { ok: true, state: await res.json() as LocalReviewState } : { ok: false, message: await readError(res) };
  } catch (e) { return { ok: false, message: errMsg(e) }; }
}
export async function writeLocalReviewEvent(projectId: string, input: LocalReviewWrite): Promise<{ ok: true; state: LocalReviewState } | { ok: false; message: Text }> {
  try {
    const res = await post(`/__joplo/p/${enc(projectId)}/review`, input);
    return res.ok ? { ok: true, state: await res.json() as LocalReviewState } : { ok: false, message: await readError(res) };
  } catch (e) { return { ok: false, message: errMsg(e) }; }
}

/** 从列表移除（只删记录，不删项目文件）。 */
export async function removeProject(projectId: string): Promise<{ ok: true } | { ok: false; message: Text }> {
  try {
    const res = await post(`/__joplo/projects/${enc(projectId)}`, undefined, 'DELETE');
    return res.ok ? { ok: true } : { ok: false, message: await readError(res) };
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
}

export async function openInEditor(projectId: string, at: string): Promise<{ ok: true } | { ok: false; message: Text }> {
  try {
    const res = await post(`/__joplo/p/${enc(projectId)}/open`, { at });
    return res.ok ? { ok: true } : { ok: false, message: await readError(res) };
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
}

/** 导出跟随页面自己的 viewport（D44：不再选择设备）。 */
export type ExportRequest = { locale: Locale; /** 看板当前的内容语言（D84）；项目没有 i18n 时不传。 */ contentLocale?: string; scenarioId: string; position: number; theme: string; /** D55：null = 跟随主题。 */ font?: AppearanceFont | null; stroke?: AppearanceStroke | null };

/** 本机导出图片：服务端用导出组件（Playwright，D66）渲染当前步骤（与 joplo render 同一渲染路径）。code 是服务端错误码（例如 EXPORT_COMPONENT_MISSING）。 */
export async function exportImage(projectId: string, body: ExportRequest): Promise<{ ok: true; blob: Blob; name: string } | { ok: false; message: Text; code?: string }> {
  try {
    const res = await post(`/__joplo/p/${enc(projectId)}/export/image`, body);
    if (!res.ok) {
      const b = (await res.json().catch(() => null)) as { error?: { message?: string; code?: string } } | null;
      return { ok: false, message: b?.error?.message ?? `HTTP ${res.status}`, ...(b?.error?.code ? { code: b.error.code } : {}) };
    }
    const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? 'joplo.png';
    return { ok: true, blob: await res.blob(), name };
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
}

export async function startVideo(projectId: string, body: Omit<ExportRequest, 'position'>): Promise<{ ok: true; job: VideoJob } | { ok: false; message: Text; job?: VideoJob }> {
  try {
    const res = await post(`/__joplo/p/${enc(projectId)}/export/video`, body);
    const b = (await res.json().catch(() => null)) as { job?: VideoJob; error?: { message?: string } } | null;
    if (res.ok && b?.job) return { ok: true, job: b.job };
    return { ok: false, message: b?.error?.message ?? `HTTP ${res.status}`, ...(b?.job ? { job: b.job } : {}) };
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
}

/** 取消正在进行的视频导出（D55）：DELETE …/export/video。 */
export async function cancelVideo(projectId: string): Promise<{ ok: true; job: VideoJob } | { ok: false; message: Text }> {
  try {
    const headers = writeHeaders(false);
    if (!headers) return { ok: false, message: m.board.thisPageHasNoLocalToken };
    const res = await fetch(`/__joplo/p/${enc(projectId)}/export/video`, { method: 'DELETE', headers, cache: 'no-store' });
    const b = (await res.json().catch(() => null)) as { job?: VideoJob; error?: { message?: string } } | null;
    return res.ok && b?.job ? { ok: true, job: b.job } : { ok: false, message: b?.error?.message ?? `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
}

/** 视频导出进度（SSE，用 fetch 读流以便带令牌）。返回取消函数。 */
export function watchVideo(projectId: string, cb: (job: VideoJob | null) => void, onError: (message: Text) => void): () => void {
  return watchSse(`/__joplo/p/${enc(projectId)}/export/video/events`, cb, onError);
}

// ---------- 导出组件（D66）：Playwright + Chromium 由 Joplo 装在 JOPLO_HOME 下；没装时看板可以一键安装 ----------
/** 与服务端 export-runtime.ts 的 ExportRuntimeStatus 一致。 */
export type ExportRuntimeStatus = { ready: boolean; source: 'managed' | 'project' | null; version: string; dir: string; downloadMB: number; installingPid: number | null; command: string };
/** 与服务端 export.ts 的 InstallJob 一致。 */
export type InstallJob = { id: string; status: 'running' | 'done' | 'error'; phase: 'package' | 'browser' | 'verify' | 'done' | 'error'; percent: number; totalMB: number | null; message: string; error: string | null };

/** 导出组件状态（含项目里已有的 Playwright）与正在进行的安装任务；读不到（旧服务端）时为 null。 */
export async function fetchExportRuntime(projectId: string): Promise<{ runtime: ExportRuntimeStatus; install: InstallJob | null } | null> {
  try {
    const res = await fetch(`/__joplo/p/${enc(projectId)}/export/runtime`, { cache: 'no-store' });
    if (!res.ok) return null;
    const b = (await res.json()) as { runtime?: ExportRuntimeStatus; install?: InstallJob | null };
    return b.runtime ? { runtime: b.runtime, install: b.install ?? null } : null;
  } catch {
    return null;
  }
}

/** 请服务端安装导出组件（带本机令牌）；已有任务时返回那个任务。 */
export async function installExportRuntime(): Promise<{ ok: true; job: InstallJob } | { ok: false; message: Text }> {
  try {
    const res = await post('/__joplo/export-runtime/install', {});
    const b = (await res.json().catch(() => null)) as { job?: InstallJob; error?: { message?: string } } | null;
    return res.ok && b?.job ? { ok: true, job: b.job } : { ok: false, message: b?.error?.message ?? `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
}

/** 安装进度（SSE，用 fetch 读流以便带令牌）。返回取消函数。 */
export function watchExportRuntime(cb: (job: InstallJob | null) => void, onError: (message: Text) => void): () => void {
  return watchSse('/__joplo/export-runtime/install/events', cb, onError);
}

function watchSse<T>(url: string, cb: (v: T | null) => void, onError: (message: Text) => void): () => void {
  const ac = new AbortController();
  void (async () => {
    try {
      const headers = writeHeaders(false);
      if (!headers) throw new MessageError(m.board.thisPageHasNoLocalToken);
      const res = await fetch(url, { headers, signal: ac.signal, cache: 'no-store' });
      if (!res.ok || !res.body) throw new Error(await readError(res));
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i: number;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, i);
          buf = buf.slice(i + 2);
          if (chunk.startsWith('data: ')) cb(JSON.parse(chunk.slice(6)) as T | null);
        }
      }
    } catch (e) {
      if (!ac.signal.aborted) onError(errMsg(e));
    }
  })();
  return () => ac.abort();
}

// ---------- 看板设置（D51 / D55）：外观（配色 / 字体 / 线条），存于 <JOPLO_HOME>/settings.json ----------
/** 与服务端 home.ts 的 BoardSettings 一致；字段不存在 = 没有设置，null 见 appearance-model.ts。 */
export type AppearanceOverride = { theme?: string | null; font?: AppearanceFont | null; stroke?: AppearanceStroke | null };
export type BoardSettings = { version: 1 } & AppearanceOverride & { projects?: Record<string, AppearanceOverride> };

export async function fetchSettings(): Promise<BoardSettings> {
  try {
    const res = await fetch('/__joplo/settings', { cache: 'no-store' });
    if (!res.ok) return { version: 1 };
    return ((await res.json()) as { settings: BoardSettings }).settings ?? { version: 1 };
  } catch {
    return { version: 1 };
  }
}

export async function saveSettings(settings: BoardSettings): Promise<{ ok: true; settings: BoardSettings } | { ok: false; message: Text }> {
  try {
    const res = await post('/__joplo/settings', { settings }, 'PUT');
    if (!res.ok) return { ok: false, message: await readError(res) };
    return { ok: true, settings: ((await res.json()) as { settings: BoardSettings }).settings };
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
}

/** 设置变化（同一页面里的设置页与演示页之间）通知。 */
const settingsListeners = new Set<(s: BoardSettings) => void>();
export const onSettings = (cb: (s: BoardSettings) => void) => {
  settingsListeners.add(cb);
  return () => settingsListeners.delete(cb);
};
export const emitSettings = (s: BoardSettings) => settingsListeners.forEach((cb) => cb(s));

// ---------- 朗读（D74 / D85）：声音来源（本机）与项目音频 ----------
/** 声音来源的类型（D85：只有官方的）；http 只出现在本机旧的 profile 里（不再支持）。 */
export type VoiceKind = 'cloud' | 'openai' | 'elevenlabs' | 'http';
export type VoiceResponseMode = 'audio' | 'json-base64' | 'json-url';
/** 音色候选（与服务端 VoiceChoice 一致）；cloud 的音色另有 labels / samples（按界面语言）。 */
export type VoiceChoiceView = { id: string; name: string; gender: 'female' | 'male' | 'neutral'; accent?: string; recommended?: boolean; labels?: Record<string, string>; samples?: Record<string, string> };
/** 与服务端 voice.ts 的 PublicProfile 一致：不含 Key，只有是否已保存、末 4 位、可用的环境变量。 */
export type VoiceProfileView = {
  id: string;
  name: string;
  kind: VoiceKind;
  preset?: string;
  baseUrl: string;
  model: string;
  voice: string;
  response: VoiceResponseMode;
  /** 说话风格（OpenAI 的 instructions）。 */
  style?: string;
  key: { saved: boolean; hint: string | null; env: string | null; envSet: boolean };
  voices: VoiceChoiceView[];
  removable: boolean;
  /** 不再支持的旧 profile（D85）：已生成的音频照常播放与发布，不能再生成。 */
  unsupported?: boolean;
};
/** 与服务端 cloud.ts 的 VoiceQuota 一致（D85）。 */
export type VoiceQuota = { plan: string; period: 'trial' | 'month'; allowanceChars: number; usedChars: number; remainingChars: number; resetsAt: string | null; packs: { remainingChars: number; expiresAt: string }[]; totalRemainingChars: number };
/** 与服务端 voice-http.ts 的 VoiceCloudView 一致。 */
export type VoiceCloudView = { signedIn: boolean; server: string | null; loginCommand: string | null; available: boolean; quota: VoiceQuota | null; usageUrl: string | null; exhausted: { neededChars: number | null; remainingChars: number | null } | null };
/** 与服务端 voice-http.ts 的 VoiceState 一致。 */
export type VoiceState = {
  /** 服务端的状态版本（递增）；见 newerVoiceState。 */
  rev: number;
  selected: string | null;
  /** default = 没选过时的默认（D85：已登录为 Joplo Cloud 朗读）。 */
  source: 'config' | 'board' | 'default' | null;
  missing: string | null;
  profile: VoiceProfileView | null;
  voices: { narrator: string | null; roles: Record<string, string> };
  /** 各内容语言的声音（D84）：音色与指纹；没有的语言用上面的默认声音。 */
  byLocale?: Record<string, { narrator: string | null; roles: Record<string, string>; voices: { narrator: string | null; roles: Record<string, string> } }>;
  narrator: string | null;
  roles: Record<string, string>;
  clips: Record<string, string>;
  failures: Record<string, { stepId: string; message: string }>;
  generating: { done: number; total: number; failed: number } | null;
  /** 托管朗读（D85）；旧版 joplo dev 没有这一项。 */
  cloud?: VoiceCloudView | null;
};
export type VoiceTestResult = { ok: true; audio: string; bytes: number; contentType: string } | { ok: false; message: Text; code?: string };

type ErrBody = { error?: { message?: string; code?: string; hint?: { response: VoiceResponseMode; path: string } } } | null;

/** profile 列表与本机存储文件（所有项目共用；file 里的用户目录写成 ~）。 */
export async function fetchVoiceProfiles(): Promise<{ profiles: VoiceProfileView[]; file: string | null } | { error: Text }> {
  try {
    const res = await fetch('/__joplo/voice/profiles', { cache: 'no-store' });
    if (!res.ok) return { error: await readError(res) };
    const b = (await res.json()) as { profiles: VoiceProfileView[]; file?: string };
    return { profiles: b.profiles, file: typeof b.file === 'string' ? b.file : null };
  } catch (e) {
    return { error: errMsg(e) };
  }
}

/** 改预设（D85：只有 cloud / openai / elevenlabs）：默认音色（浮层里换旁白音色）或 Key（「管理密钥」）。key：undefined = 不改，null = 删掉保存的 Key。 */
export async function saveVoiceProfile(id: string, profile: { voice?: string } | undefined, key?: string | null): Promise<{ ok: true; profile: VoiceProfileView; profiles: VoiceProfileView[] } | { ok: false; message: Text }> {
  try {
    const res = await post(`/__joplo/voice/profiles/${enc(id)}`, { ...(profile ? { profile } : {}), ...(key !== undefined ? { key } : {}) }, 'PUT');
    const b = (await res.json().catch(() => null)) as ({ profile?: VoiceProfileView; profiles?: VoiceProfileView[] } & NonNullable<ErrBody>) | null;
    return res.ok && b?.profile && b.profiles ? { ok: true, profile: b.profile, profiles: b.profiles } : { ok: false, message: b?.error?.message ?? `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
}

/** 删除本机旧的 profile；预设恢复默认。 */
export async function deleteVoiceProfile(id: string): Promise<{ ok: true; profiles: VoiceProfileView[] } | { ok: false; message: Text }> {
  try {
    const res = await post(`/__joplo/voice/profiles/${enc(id)}`, undefined, 'DELETE');
    const b = (await res.json().catch(() => null)) as ({ profiles?: VoiceProfileView[] } & NonNullable<ErrBody>) | null;
    return res.ok && b?.profiles ? { ok: true, profiles: b.profiles } : { ok: false, message: b?.error?.message ?? `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
}

/** 用 OpenAI / ElevenLabs 试读一句（「管理密钥」里测试 Key）：传 id 与可选的、还没保存的 key。 */
export async function testVoiceProfile(body: { id: string; key?: string; text?: string }): Promise<VoiceTestResult> {
  try {
    const res = await post('/__joplo/voice/test', body);
    const b = (await res.json().catch(() => null)) as ({ ok?: boolean; audio?: string; bytes?: number; contentType?: string } & NonNullable<ErrBody>) | null;
    if (res.ok && b?.ok && b.audio) return { ok: true, audio: b.audio, bytes: b.bytes ?? 0, contentType: b.contentType ?? '' };
    return { ok: false, message: b?.error?.message ?? `HTTP ${res.status}`, ...(b?.error?.code ? { code: b.error.code } : {}) };
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
}

/** refresh：让服务端重新问一次云端的朗读额度（打开声音浮层时）。 */
export async function fetchVoiceState(projectId: string, refresh = false): Promise<VoiceState | null> {
  try {
    const res = await fetch(`/__joplo/p/${enc(projectId)}/voice${refresh ? '?refresh=1' : ''}`, { cache: 'no-store' });
    return res.ok ? ((await res.json()) as VoiceState) : null;
  } catch {
    return null;
  }
}

/** 看板里选用的 profile（null = 只用浏览器朗读）。 */
export async function selectVoiceProfile(projectId: string, profileId: string | null): Promise<{ ok: true; state: VoiceState } | { ok: false; message: Text }> {
  try {
    const res = await post(`/__joplo/p/${enc(projectId)}/voice`, { profileId }, 'PUT');
    const b = (await res.json().catch(() => null)) as (VoiceState & NonNullable<ErrBody>) | null;
    return res.ok && b && 'clips' in b ? { ok: true, state: b } : { ok: false, message: b?.error?.message ?? `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
}

export type VoiceSegment = { stepId: string; text: string; role: string | null };
export type VoiceSummary = {
  total: number;
  generated: number;
  skipped: number;
  failed: { stepId: string; message: string }[];
  noProfile?: boolean;
  /** 选用的来源不再支持（D85）。 */
  unsupported?: boolean;
  /** cloud 额度不够（402），生成在这里停下。 */
  quota?: { neededChars: number | null; remainingChars: number | null };
  stopped?: number;
  error?: { code: string; message: string };
};

/** 生成缺的音频（进度通过 joplo:voice 推送）。 */
export async function generateVoice(projectId: string, locale: Locale, segments: VoiceSegment[], contentLocale?: string | null): Promise<{ ok: true; summary: VoiceSummary; state: VoiceState } | { ok: false; message: Text }> {
  try {
    const res = await post(`/__joplo/p/${enc(projectId)}/voice/generate`, { locale, segments, ...(contentLocale ? { contentLocale } : {}) });
    const b = (await res.json().catch(() => null)) as ({ summary?: VoiceSummary; state?: VoiceState } & NonNullable<ErrBody>) | null;
    return res.ok && b?.summary && b.state ? { ok: true, summary: b.summary, state: b.state } : { ok: false, message: b?.error?.message ?? `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
}

/**
 * 订阅某个项目的朗读状态（选用、生成进度、新音频）。
 * 供应商 profile 是本机共用的：任何看板保存 / 删除 profile 后服务端推 { profilesChanged }，这里重新取本项目的状态
 * （Key 是否保存、音色、声音指纹都可能变了；不取的话看板会一直用旧指纹找音频、以为没有 Key）。
 */
export function subscribeVoice(projectId: string, cb: (s: VoiceState) => void, deps: { hot?: Hot | null; fetchState?: (projectId: string) => Promise<VoiceState | null> } = {}): () => void {
  const h = deps.hot !== undefined ? deps.hot : hot();
  if (!h) return () => undefined;
  const fetchState = deps.fetchState ?? fetchVoiceState;
  let alive = true;
  const handler = (d: { projectId?: string; state?: VoiceState; profilesChanged?: boolean }) => {
    if (d?.profilesChanged) void fetchState(projectId).then((s) => alive && s && cb(s));
    else if (d?.projectId === projectId && d.state) cb(d.state);
  };
  h.on('joplo:voice', handler);
  return () => {
    alive = false;
    h.off('joplo:voice', handler);
  };
}

/** 边放边生成一段（D74）：已有就直接返回；同一段并发只生成一次。 */
export async function requestClip(projectId: string, locale: Locale, segment: VoiceSegment, contentLocale?: string | null): Promise<{ ok: true; url: string; key: string } | { ok: false; message: Text }> {
  try {
    const res = await post(`/__joplo/p/${enc(projectId)}/voice/clip`, { locale, segment, ...(contentLocale ? { contentLocale } : {}) });
    const b = (await res.json().catch(() => null)) as ({ url?: string; key?: string } & NonNullable<ErrBody>) | null;
    return res.ok && b?.url && b.key ? { ok: true, url: b.url, key: b.key } : { ok: false, message: b?.error?.message ?? `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
}

// ---------- 直接发布到云端（D76） ----------
/** 与 @joplo-app/server 的 CloudAccount / CloudJob 一致（页面只拿到邮箱和套餐，令牌留在本机进程）。 */
export type CloudVisibility = 'public' | 'private';
export type CloudPortfolio = { workUrl: string | null; profileUrl: string | null; needsUsername: boolean; setupPath: string };
export type CloudLinks = { main: { visibility?: CloudVisibility } | null; scoped?: Record<string, { visibility?: CloudVisibility }> };
export type CloudAccount =
  | { signedIn: true; server: string; email: string; plan: 'free' | 'pro' | null; storage?: CloudStorage; username?: string | null; portfolioUrl?: string | null; /** 托管朗读额度（D85）；旧云端或连不上时没有。 */ voice?: VoiceQuota }
  | { signedIn: false; server: string; loginCommand: string; message?: string };
/** 账号容量（C27），字节。 */
export type CloudStorage = { usedBytes: number; quotaBytes: number };
export type CloudStorageFull = { usedBytes?: number; quotaBytes?: number; shareBytes?: number; replacedBytes?: number; manageUrl: string; upgradeUrl: string };
export type CloudBorrowed =
  | { kind: 'element'; featureId: string; featureName: string; optionId: string; elementId: string; route: string; refs: string[]; scenarios: string[] }
  | { kind: 'page'; featureId: string; featureName: string; optionId: string; route: string; scenarios: string[] };
export type CloudScope = { key: string; scenarios: string[]; features: string[]; borrowed: CloudBorrowed[] };
export type CloudPublishRequest = { visibility?: CloudVisibility; review?: boolean; scenarios?: string[]; features?: string[] };
export type CloudJob = {
  id: string;
  state: 'running' | 'done' | 'failed';
  request: CloudPublishRequest;
  startedAt: number;
  lines: string[];
  result?: { mode?: 'review'; visibility?: CloudVisibility; portfolio?: CloudPortfolio; review?: { url: string; shareId: string }; shareId: string; url: string; expiresAt: string | null; version: number; plan: 'free' | 'pro'; scope?: CloudScope; storage?: CloudStorage & { shareBytes: number } };
  error?: { code: string; message: string; loginCommand?: string; storage?: CloudStorageFull };
};

/** 账号：available = false 表示这个看板进程不能发布（旧版 CLI 启动的）。 */
export async function fetchCloudAccount(): Promise<{ ok: true; available: boolean; account: CloudAccount | null } | { ok: false; message: Text }> {
  try {
    const headers = writeHeaders(false);
    if (!headers) return { ok: false, message: m.board.thisPageHasNoLocalTokenOpenItThrough };
    const res = await fetch('/__joplo/cloud/account', { headers, cache: 'no-store' });
    // 旧版看板没有这个接口
    if (res.status === 404) return { ok: true, available: false, account: null };
    if (!res.ok) return { ok: false, message: await readError(res) };
    const b = (await res.json()) as { available: boolean; account?: CloudAccount };
    return { ok: true, available: b.available, account: b.account ?? null };
  } catch (e) {
    return { ok: false, message: m.board.couldNotConnectToJoploDev(errMsg(e)) };
  }
}

/** 读取分享历史。失败必须与“没有链接”区分，避免更新预选为公开。 */
export async function fetchCloudLinks(projectId: string): Promise<CloudLinks> {
  const headers = writeHeaders(false);
  if (!headers) throw new MessageError(m.board.thisPageHasNoLocalTokenOpenItThrough);
  const res = await fetch(`/__joplo/p/${enc(projectId)}/cloud/links`, { headers, cache: 'no-store' });
  if (!res.ok) throw new Error(await readError(res));
  const body = await res.json();
  // 只有成功读到明确的空记录才能按新建处理；错误/旧接口响应不能悄悄变成公开预选。
  const main = body?.links?.main;
  if (!body?.links || typeof body.links !== 'object' || !('main' in body.links)
    || !(main === null || typeof main === 'object' && !Array.isArray(main)
      && (main.visibility === undefined || main.visibility === 'private' || main.visibility === 'public'))) {
    throw new MessageError(m.board.cloudLinksFailed);
  }
  return body.links;
}

/** 当前发布任务（没有时 null）。 */
export async function fetchCloudJob(projectId: string): Promise<CloudJob | null> {
  try {
    const headers = writeHeaders(false);
    if (!headers) return null;
    const res = await fetch(`/__joplo/p/${enc(projectId)}/cloud/publish`, { headers, cache: 'no-store' });
    if (!res.ok) return null;
    return ((await res.json()) as { job: CloudJob | null }).job;
  } catch {
    return null;
  }
}

/** 开始发布（进度通过 joplo:cloud 推送）；已有进行中的任务时返回那一个。 */
export async function startCloudPublish(projectId: string, request: CloudPublishRequest): Promise<{ ok: true; job: CloudJob } | { ok: false; message: Text }> {
  try {
    const res = await post(`/__joplo/p/${enc(projectId)}/cloud/publish`, request);
    const b = (await res.json().catch(() => null)) as ({ job?: CloudJob } & NonNullable<ErrBody>) | null;
    return res.ok && b?.job ? { ok: true, job: b.job } : { ok: false, message: b?.error?.message ?? `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
}

/** 订阅某个项目的发布任务。 */
export function subscribeCloud(projectId: string, cb: (job: CloudJob) => void): () => void {
  const h = hot();
  if (!h) return () => undefined;
  const handler = (d: { projectId: string; job: CloudJob }) => {
    if (d.projectId === projectId) cb(d.job);
  };
  h.on('joplo:cloud', handler);
  return () => h.off('joplo:cloud', handler);
}
