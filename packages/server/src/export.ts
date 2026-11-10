/**
 * 看板「…」菜单的导出（D39）：
 *
 * - 图片：`POST /__joplo/p/<id>/export/image` `{ scenarioId, position, theme, font?, stroke? }` → PNG（当前步骤；尺寸跟随页面自己的 viewport，
 *   手机页面带外框；D44 起不再选择设备；镜头用这一步的导演镜头）。Playwright 打开本看板的渲染路由（与 renderStep 同一条渲染路径），截取 `[data-jexport]`。
 * - 视频（只在本机）：`POST …/export/video` `{ scenarioId, theme, font?, stroke?, voice? }` → 202 `{ jobId }`（尺寸跟随场景起始页面的 viewport；
 *   voice: true = 看板开着朗读，已生成的旁白混进音轨并按真实时长停留，#56）；
 *   Playwright `recordVideo` 录下渲染路由的自动播放（含鼠标与字幕），保存为 `<项目>/exports/<场景>-<时间>.webm`。
 *   进度：`GET …/export/video/events`（SSE，先发当前状态，之后每次变化一条，结束后关闭）；`GET …/export/video` 取当前状态。
 *   同一项目同时只能有一个视频任务（再提交返回 409）；`DELETE …/export/video` 取消正在进行的任务（D55）。没有导出组件时图片返回 503 EXPORT_COMPONENT_MISSING、
 *   视频任务失败，错误里带安装命令。
 * - 导出组件（D66）：`GET …/export/runtime` → `{ runtime: 状态（含项目里已有的 Playwright）, install: 安装任务 | null }`；
 *   `POST /__joplo/export-runtime/install`（本机令牌 + Origin + JSON）开始安装（已有任务时返回那个任务）、
 *   `GET /__joplo/export-runtime/install/events`（令牌，SSE）推送进度。只有这条路径会下载，导出本身从不下载。
 *
 * 外观（D55）：font / stroke 由 exportAppearance 校验（未知值 = null = 跟随主题），非 null 时作为渲染路由的 URL 参数，
 * RenderApp 读出后交给舞台、字幕与手机外框（与看板里看到的一致）。
 *
 * 字段流向：job（写入点：这里的 runJob）→ jobs Map（存储）→ SSE / GET（读取点）→ 看板的导出视频弹窗（消费者）。
 */
import { recordedCalibration } from './media-calibration.ts';
import { muxRecordedAudio } from './media-mux.ts';
import crypto from 'node:crypto';
import fs from 'node:fs';
import type http from 'node:http';
import path from 'node:path';
import type { Browser, Page } from 'playwright-core';
import { exportLocale, type ExportLocale } from './locale.ts';
import { JoploError, THEME_NAME, displaySceneId, isAppearanceFont, isAppearanceStroke, type AppearanceFont, type AppearanceStroke, type Project } from '@joplo-app/core';
import { launch } from './render.ts';
import { exportRuntimeStatus, installExportRuntime, loadPlaywright, type InstallDeps, type InstallProgress, type PlaywrightModule } from './export-runtime.ts';

export type Device = 'desktop' | 'mobile';

/**
 * 导出画面的尺寸：电脑 = 舞台 1280×800；手机 = 外框（renderer 的 phoneFrameSize(390, 844) = 446×934）
 * 四周再留 16px（RenderApp 的 frame 模式）。字幕与步骤标题条浮在舞台上（D97），不另占高度。
 */
export const EXPORT_SIZE: Record<Device, { width: number; height: number }> = {
  desktop: { width: 1280, height: 800 },
  mobile: { width: 446 + 32, height: 934 + 32 },
};

export type VideoJob = {
  id: string;
  projectId: string;
  scenarioId: string;
  status: 'running' | 'done' | 'error' | 'cancelled';
  /** starting 启动浏览器 → recording 录制中 → saving 写文件。 */
  phase: 'starting' | 'recording' | 'saving' | 'done' | 'error' | 'cancelled';
  step: number;
  total: number;
  /** 0–100。 */
  percent: number;
  /** 完成后：相对项目目录的路径（exports/…webm）。 */
  file: string | null;
  error: string | null;
};

/** 字幕的一条（秒，相对视频开头）。 */
export type VideoCue = { start: number; end: number; text: string };
/** 录制结果（#56 #59）：字幕时间轴（对到视频时间）与没有音频、按估算时长停留的旁白。 */
export type RecordOutcome = { cues: VideoCue[]; voice: { mode: 'estimate' | 'real' | 'off'; missing: { text: string; role: string | null }[] } };

/** 录制实现：报告进度，写好 out。测试可注入。size 是视口，也是视频分辨率（录屏按 CSS 像素取帧）。 */
export type VideoRecorder = (input: { projectDir: string; url: string; size: { width: number; height: number }; out: string; total: number; progress: (step: number) => void; signal: AbortSignal; /** 最长录制时长（毫秒，默认 5 分钟）。 */ maxMs?: number }) => Promise<RecordOutcome | void>;

type RecordWindow = { __JOPLO_RECORD__: { prepare?(): Promise<void>; play(): Promise<void>; calibrate?(): Promise<boolean>; calibratedAt?(): number | null; cues?(): { at: number; text: string | null }[]; voice?(): RecordOutcome['voice']; stopAudio?(): Promise<{ data: string } | null>; progress: { step: number; done: boolean; error: string | null } } };

/** 页面里记下的字幕变化 → 视频时间轴上的字幕条（originMs = 视频第 0 秒对应的页面时间）。纯函数。 */
export function videoCues(raw: readonly { at: number; text: string | null }[], originMs: number, endSeconds: number): VideoCue[] {
  const out: VideoCue[] = [];
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]!;
    if (!c.text) continue;
    const start = Math.max(0, (c.at - originMs) / 1000);
    const end = Math.min(endSeconds, i + 1 < raw.length ? (raw[i + 1]!.at - originMs) / 1000 : endSeconds);
    if (end - start >= 0.05) out.push({ start: Math.round(start * 1000) / 1000, end: Math.round(end * 1000) / 1000, text: c.text });
  }
  return out;
}

/** SubRip 字幕文件。纯函数。 */
export function srt(cues: readonly VideoCue[]): string {
  const ts = (sec: number) => {
    const ms = Math.max(0, Math.round(sec * 1000));
    const p = (n: number, w = 2) => String(n).padStart(w, '0');
    return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
  };
  return cues.map((c, i) => `${i + 1}\n${ts(c.start)} --> ${ts(c.end)}\n${c.text.replace(/\r?\n+/g, '\n')}\n`).join('\n');
}

export type ExportDeps = {
  /** 按项目解析 Playwright（托管运行时优先，其次项目里已有的）。 */
  loadPlaywright: (projectDir: string) => Promise<PlaywrightModule>;
  recordVideo: VideoRecorder;
  /** 导出组件的安装（测试注入假的 npm / 下载 / 自检）。 */
  install: Partial<InstallDeps>;
};

/**
 * 导出组件的安装任务（D66）。字段流向：startInstall（写入点，installExportRuntime 的进度回调）→ this.install（存储）
 * → `GET …/export/runtime`、`GET /__joplo/export-runtime/install`、SSE（读取点）→ 看板导出菜单的安装卡与「导出」按钮进度环（消费者）。
 */
export type InstallJob = {
  id: string;
  status: 'running' | 'done' | 'error';
  phase: InstallProgress['phase'] | 'error';
  percent: number;
  /** 正在下载的文件大小（MiB）。 */
  totalMB: number | null;
  /** 英文进度说明（看板按 phase 显示本地化文字，这里只作日志）。 */
  message: string;
  error: string | null;
};

type Ctx = {
  projectId: string;
  dir: string;
  project: Project | null;
  /** Origin + 令牌（+ needJson 时 Content-Type）检查；false 表示已拒绝并写好响应。 */
  guardWrite: (needJson?: boolean) => boolean;
  jsonBody: () => Promise<{ ok: true; body: unknown } | { ok: false }>;
  fail: (e: unknown) => void;
};

const send = (res: http.ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(JSON.stringify(body));
};

/** 导出请求里的字体与线条（D55）：合法值保留，缺省、null 与未知值都是 null（跟随主题）。任何输入都不抛错。 */
export function exportAppearance(body: unknown): { font: AppearanceFont | null; stroke: AppearanceStroke | null } {
  const b = (body && typeof body === 'object' ? body : {}) as { font?: unknown; stroke?: unknown };
  return { font: isAppearanceFont(b.font) ? b.font : null, stroke: isAppearanceStroke(b.stroke) ? b.stroke : null };
}

/** 渲染路由上的外观参数（null 不写）。 */
const appearanceParams = (a: { font: AppearanceFont | null; stroke: AppearanceStroke | null }): Record<string, string> => ({ ...(a.font ? { font: a.font } : {}), ...(a.stroke ? { stroke: a.stroke } : {}) });

/** content（D84）：作者内容语言；导出与看板当前预览的语言一致。voice（#56）：看板开着朗读，视频混进已生成的旁白。 */
type Look = { theme: string; font: AppearanceFont | null; stroke: AppearanceStroke | null; locale?: ExportLocale; content?: ExportLocale; voice?: boolean };

function parseRequest(project: Project | null, body: unknown, needPosition: boolean) {
  if (!project) throw new JoploError('INVALID_SCHEMA', 'Cannot export before the project compiles successfully');
  const b = (body ?? {}) as { scenarioId?: unknown; position?: unknown; theme?: unknown; locale?: unknown; contentLocale?: unknown; voice?: unknown };
  if (typeof b.scenarioId !== 'string' || !project.scenarios[b.scenarioId]) throw new JoploError('USAGE', `Scenario does not exist: ${String(b.scenarioId)}`);
  const sc = project.scenarios[b.scenarioId]!;
  const position = needPosition ? Number(b.position ?? 0) : 0;
  if (!Number.isInteger(position) || position < 0 || position > sc.steps.length) throw new JoploError('USAGE', `Position must be an integer from 0 to ${sc.steps.length}`);
  // 设备跟随页面自己的 viewport（D44）
  const sceneId = displaySceneId(project, sc.id, position);
  const device: Device = project.scenes[sceneId]?.viewport === 'mobile' ? 'mobile' : 'desktop';
  // 主题（D51）：请求里的主题名，没有或不合法时用项目配置的主题
  const theme = typeof b.theme === 'string' && THEME_NAME.test(b.theme) ? b.theme : project.theme;
  return { sc, position, device, look: { theme, ...exportAppearance(body), locale: exportLocale(b.locale), ...(exportLocale(b.contentLocale) ? { content: exportLocale(b.contentLocale)! } : {}), ...(b.voice === true ? { voice: true } : {}) } satisfies Look };
}

const fileSafe = (s: string) => s.replace(/[^\w.-]+/g, '_').slice(0, 80) || 'scenario';
const stamp = (d = new Date()) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;

async function waitReady(page: Page) {
  await page.waitForFunction(() => (window as unknown as { __JOPLO_READY__?: boolean }).__JOPLO_READY__ === true, null, { timeout: 60000 });
  const err = await page.evaluate(() => (window as unknown as { __JOPLO_ERROR__?: string | null }).__JOPLO_ERROR__ ?? null);
  if (err) throw new JoploError('RENDER_FAILED', `Render route reported an error: ${err}`);
}

/**
 * 缺省的录制：渲染路由的录制模式（window.__JOPLO_RECORD__）。
 *
 * 开播前的准备（载入、字体、解码配乐与旁白）不进视频（#57）：Playwright 有 page.screencast 时，prepare() 之后才开始录屏，
 * 视频从封面淡出 / 第一步开始；项目自带的旧版 Playwright 没有它时退回 recordVideo（从建页开始录）。
 */
export function defaultRecorder(load: (projectDir: string) => Promise<PlaywrightModule>): VideoRecorder {
  return async ({ projectDir, url, size, out, progress, signal, maxMs = 5 * 60_000 }) => {
    const pw = await load(projectDir);
    const browser: Browser = await launch(pw);
    const tmp = fs.mkdtempSync(path.join(path.dirname(out), '.rec-'));
    try {
      let ctx = await browser.newContext({ viewport: size, deviceScaleFactor: 1 });
      let page = await ctx.newPage();
      const screencast = typeof (page as Partial<Page>).screencast?.start === 'function';
      if (!screencast) {
        await ctx.close();
        ctx = await browser.newContext({ viewport: size, deviceScaleFactor: 1, recordVideo: { dir: tmp, size } });
        page = await ctx.newPage();
      }
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await waitReady(page);
      await page.waitForTimeout(400);
      await page.evaluate(() => (window as unknown as RecordWindow).__JOPLO_RECORD__.prepare?.());
      const file = path.join(tmp, 'screen.webm');
      if (screencast) await page.screencast.start({ path: file, size });
      // 视频第 0 秒对应的页面时间：录屏刚开始时（recordVideo 从建页开始录，近似为导航开始 = 0）
      let origin = screencast ? await page.evaluate(() => performance.now()) : 0;
      await page.evaluate(() => (window as unknown as RecordWindow).__JOPLO_RECORD__.play());
      const t0 = Date.now();
      for (;;) {
        if (signal.aborted) throw new JoploError('EXPORT_FAILED', 'Export cancelled');
        const p = await page.evaluate(() => (window as unknown as RecordWindow).__JOPLO_RECORD__.progress);
        if (p.error) throw new JoploError('EXPORT_FAILED', `Playback failed: ${p.error}`);
        progress(p.step);
        if (p.done) break;
        if (Date.now() - t0 > maxMs) throw new JoploError('EXPORT_FAILED', `Recording exceeded ${Math.round(maxMs / 60000)} minutes and was stopped`);
        await page.waitForTimeout(150);
      }
      await page.waitForTimeout(900); // 停留在结果画面
      const endAt = await page.evaluate(() => performance.now());
      const calibrated=await page.evaluate(()=> (window as unknown as RecordWindow).__JOPLO_RECORD__.calibrate?.()??false);
      const page_ = await page.evaluate(() => { const r = (window as unknown as RecordWindow).__JOPLO_RECORD__; return { cues: r.cues?.() ?? [], voice: r.voice?.() ?? { mode: 'off' as const, missing: [] }, flash: r.calibratedAt?.() ?? null }; });
      const audio = await page.evaluate(() => (window as unknown as RecordWindow).__JOPLO_RECORD__.stopAudio?.() ?? null);
      if (screencast) await page.screencast.stop();
      const video = screencast ? null : page.video();
      await ctx.close();
      if (screencast) { if (!fs.existsSync(file)) throw new JoploError('EXPORT_FAILED', 'The browser did not generate a video'); fs.renameSync(file, out); }
      else { if (!video) throw new JoploError('EXPORT_FAILED', 'The browser did not generate a video'); await video.saveAs(out); }
      let endSeconds = (endAt - origin) / 1000;
      if (audio) {
        if(!calibrated)throw new Error('Audio/video calibration unavailable');
        const analysis=await browser.newContext();const probe=await analysis.newPage();await probe.goto(url,{waitUntil:'domcontentloaded'});
        try {
          const bytes=Buffer.from(audio.data,'base64');const timing=await recordedCalibration(probe,out,bytes);
          await muxRecordedAudio(out,bytes,timing.offsetSeconds,{videoEnd:timing.videoPTS,audioEnd:timing.audioPTS,audioDurations:timing.audioDurations});
          // 校准闪屏：页面时间 flash ↔ 视频时间 videoPTS，比录屏开始时的估计更准；视频在闪屏处截断
          if (page_.flash !== null) origin = page_.flash - timing.videoPTS * 1000;
          endSeconds = timing.videoPTS;
        }
        finally{await analysis.close();}
      }
      return { cues: videoCues(page_.cues, origin, endSeconds), voice: page_.voice };
    } finally {
      await browser.close().catch(() => undefined);
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  };
}

export class ExportHub {
  private jobs = new Map<string, VideoJob>();
  private listeners = new Map<string, Set<(j: VideoJob) => void>>();
  private aborts = new Map<string, AbortController>();
  private running = new Set<Promise<void>>();
  private deps: ExportDeps;

  private install: InstallJob | null = null;
  private installListeners = new Set<(j: InstallJob) => void>();
  private installAbort: AbortController | null = null;

  /** home：导出组件所在的 JOPLO_HOME（看板进程的 home；没有时用环境变量 / ~/.joplo）。 */
  constructor(private readonly opts: { baseUrl: () => string; log: (s: string) => void; home: string; deps?: Partial<ExportDeps>; onEvent?: (j: VideoJob) => void }) {
    const load = opts.deps?.loadPlaywright ?? ((projectDir: string) => loadPlaywright({ home: opts.home, projectDir }));
    this.deps = { loadPlaywright: load, recordVideo: opts.deps?.recordVideo ?? defaultRecorder(load), install: opts.deps?.install ?? {} };
  }

  private renderUrl(projectId: string, q: Record<string, string>) {
    return `${this.opts.baseUrl()}?${new URLSearchParams({ render: '1', project: projectId, ...q })}`;
  }

  /** 取消正在进行的视频任务（D55 导出进度里的「取消」）：立即标为“已取消”并中止录制；没有任务时返回 null。 */
  cancel(projectId: string): VideoJob | null {
    const job = this.jobs.get(projectId);
    if (!job || job.status !== 'running') return null;
    this.update(job, { status: 'cancelled', phase: 'cancelled', error: 'Cancelled' });
    this.aborts.get(projectId)?.abort();
    this.aborts.delete(projectId);
    return { ...job };
  }

  job(projectId: string): VideoJob | null {
    return this.jobs.get(projectId) ?? null;
  }

  private update(job: VideoJob, patch: Partial<VideoJob>) {
    Object.assign(job, patch);
    const snap = { ...job };
    for (const l of this.listeners.get(job.projectId) ?? []) l(snap);
    this.opts.onEvent?.(snap);
  }

  async handle(sub: string, req: http.IncomingMessage, res: http.ServerResponse, ctx: Ctx): Promise<void> {
    const method = req.method ?? 'GET';
    try {
      if (sub === 'image' && method === 'POST') {
        if (!ctx.guardWrite()) return;
        const b = await ctx.jsonBody();
        if (!b.ok) return;
        const { sc, position, device, look } = parseRequest(ctx.project, b.body, true);
        const png = await this.image(ctx.projectId, ctx.dir, sc.id, position, device, look);
        res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store', 'content-disposition': `attachment; filename="${fileSafe(sc.id)}-${position}.png"` });
        res.end(png);
        return;
      }
      if (sub === 'video' && method === 'POST') {
        if (!ctx.guardWrite()) return;
        const b = await ctx.jsonBody();
        if (!b.ok) return;
        const { sc, device, look } = parseRequest(ctx.project, b.body, false);
        const cur = this.jobs.get(ctx.projectId);
        if (cur?.status === 'running') return send(res, 409, { error: { code: 'UNSUPPORTED_ACTION', message: 'This project already has a video export in progress; wait for it to finish' }, job: cur });
        const job = this.startVideo(ctx.projectId, ctx.dir, sc.id, sc.steps.length, device, look);
        return send(res, 202, { jobId: job.id, job });
      }
      if (sub === 'video' && method === 'GET') return send(res, 200, { job: this.job(ctx.projectId) });
      if (sub === 'runtime' && method === 'GET') return send(res, 200, { runtime: exportRuntimeStatus({ home: this.opts.home, projectDir: ctx.dir }), install: this.install });
      if (sub === 'video' && method === 'DELETE') {
        if (!ctx.guardWrite(false)) return;
        const job = this.cancel(ctx.projectId);
        return job ? send(res, 200, { job }) : send(res, 404, { error: { code: 'NOT_FOUND', message: 'This project has no video export in progress' } });
      }
      if (sub === 'video/events' && method === 'GET') {
        if (!ctx.guardWrite(false)) return;
        return this.sse(ctx.projectId, res);
      }
      return send(res, 404, { error: { code: 'NOT_FOUND', message: `Unknown endpoint: ${method} export/${sub}` } });
    } catch (e) {
      if (!res.headersSent) ctx.fail(e);
      else res.end();
    }
  }

  private async image(projectId: string, dir: string, scenarioId: string, position: number, device: Device, look: Look): Promise<Buffer> {
    const pw = await this.deps.loadPlaywright(dir);
    const browser = await launch(pw);
    try {
      const page = await browser.newPage({ viewport: EXPORT_SIZE[device], deviceScaleFactor: 2, reducedMotion: 'reduce' });
      await page.goto(this.renderUrl(projectId, { scenario: scenarioId, position: String(position), theme: look.theme, ...appearanceParams(look), ...(look.locale ? { locale: look.locale } : {}), ...(look.content ? { content: look.content } : {}), frame: '1' }), { waitUntil: 'domcontentloaded' });
      await waitReady(page);
      return await page.locator('[data-jexport]').screenshot({ type: 'png', animations: 'disabled' });
    } finally {
      await browser.close().catch(() => undefined);
    }
  }

  private startVideo(projectId: string, dir: string, scenarioId: string, total: number, device: Device, look: Look): VideoJob {
    const job: VideoJob = { id: crypto.randomBytes(6).toString('hex'), projectId, scenarioId, status: 'running', phase: 'starting', step: 0, total, percent: 0, file: null, error: null };
    this.jobs.set(projectId, job);
    const ac = new AbortController();
    this.aborts.set(projectId, ac);
    const rel = `exports/${fileSafe(scenarioId)}-${stamp()}.webm`;
    const out = path.join(dir, rel);
    const p = (async () => {
      try {
        fs.mkdirSync(path.dirname(out), { recursive: true });
        this.update(job, { phase: 'starting', percent: 2 });
        await this.deps.recordVideo({
          projectDir: dir,
          url: this.renderUrl(projectId, { scenario: scenarioId, position: '0', theme: look.theme, ...appearanceParams(look), ...(look.locale ? { locale: look.locale } : {}), ...(look.content ? { content: look.content } : {}), ...(look.voice ? { voice: 'real' } : {}), frame: '1', record: '1' }),
          size: EXPORT_SIZE[device],
          out,
          total,
          signal: ac.signal,
          progress: (step) => {
            if (job.status !== 'running') return; // 已取消
            const s = Math.max(0, Math.min(step, total));
            const percent = Math.round(5 + (total ? s / total : 1) * 85);
            if (job.phase !== 'recording' || s !== job.step) this.update(job, { phase: 'recording', step: s, percent });
          },
        });
        if (job.status !== 'running') return; // 已取消：录制器之后才返回，不改回完成
        this.update(job, { phase: 'saving', percent: 95 });
        if (!fs.existsSync(out)) throw new JoploError('EXPORT_FAILED', 'Recording completed, but no video file was generated');
        this.update(job, { status: 'done', phase: 'done', percent: 100, step: total, file: rel });
        this.opts.log(`[joplo] Exported video: ${out}`);
      } catch (e) {
        if (job.status === 'running') this.update(job, { status: 'error', phase: 'error', error: e instanceof Error ? e.message : String(e) });
      } finally {
        // 只删自己的（取消后可能已经开始了新任务）
        if (this.aborts.get(projectId) === ac) this.aborts.delete(projectId);
      }
    })();
    this.running.add(p);
    void p.finally(() => this.running.delete(p));
    return job;
  }

  private sse(projectId: string, res: http.ServerResponse) {
    res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive', 'x-content-type-options': 'nosniff' });
    const write = (j: VideoJob | null) => res.write(`data: ${JSON.stringify(j)}\n\n`);
    const cur = this.job(projectId);
    write(cur);
    if (!cur || cur.status !== 'running') {
      res.end();
      return;
    }
    const set = this.listeners.get(projectId) ?? new Set();
    this.listeners.set(projectId, set);
    const l = (j: VideoJob) => {
      write(j);
      if (j.status !== 'running') {
        set.delete(l);
        res.end();
      }
    };
    set.add(l);
    res.on('close', () => set.delete(l));
  }

  // ---------- 导出组件的安装（D66）：全局一个任务，进度推给所有看板页面 ----------

  /**
   * 全局接口 `/__joplo/export-runtime/<sub>`。调用方（dev.ts）已校验 Host；这里对写接口与进度流再校验本机令牌与 Origin。
   * 不变量：只有带本机令牌、来自看板自己源的请求能触发下载。
   */
  async handleRuntime(sub: string, req: http.IncomingMessage, res: http.ServerResponse, ctx: Pick<Ctx, 'guardWrite' | 'jsonBody' | 'fail'>): Promise<void> {
    const method = req.method ?? 'GET';
    try {
      if (sub === 'install' && method === 'POST') {
        if (!ctx.guardWrite()) return;
        const b = await ctx.jsonBody();
        if (!b.ok) return;
        const force = (b.body as { force?: unknown } | null)?.force === true;
        return send(res, 202, { job: this.startInstall(force) });
      }
      if (sub === 'install' && method === 'GET') return send(res, 200, { job: this.install, runtime: exportRuntimeStatus({ home: this.opts.home }) });
      if (sub === 'install/events' && method === 'GET') {
        if (!ctx.guardWrite(false)) return;
        return this.installSse(res);
      }
      return send(res, 404, { error: { code: 'NOT_FOUND', message: `Unknown endpoint: ${method} export-runtime/${sub}` } });
    } catch (e) {
      if (!res.headersSent) ctx.fail(e);
      else res.end();
    }
  }

  /** 开始安装；已有任务在运行时返回那个任务（不重复下载）。 */
  startInstall(force = false): InstallJob {
    if (this.install?.status === 'running') return { ...this.install };
    const job: InstallJob = { id: crypto.randomBytes(6).toString('hex'), status: 'running', phase: 'package', percent: 0, totalMB: null, message: 'Starting', error: null };
    this.install = job;
    const ac = new AbortController();
    this.installAbort = ac;
    const set = (patch: Partial<InstallJob>) => {
      Object.assign(job, patch);
      const snap = { ...job };
      for (const l of this.installListeners) l(snap);
    };
    const p = (async () => {
      try {
        const r = await installExportRuntime({ home: this.opts.home, force, signal: ac.signal, deps: this.deps.install, onProgress: (x: InstallProgress) => set({ phase: x.phase, percent: x.percent, totalMB: x.totalMB, message: x.message }) });
        set({ status: 'done', phase: 'done', percent: 100, message: r.alreadyInstalled ? 'Already installed' : 'Export component is ready' });
        this.opts.log(`[joplo] Export component ready: ${r.dir}`);
      } catch (e) {
        set({ status: 'error', phase: 'error', error: e instanceof Error ? e.message : String(e) });
      } finally {
        if (this.installAbort === ac) this.installAbort = null;
      }
    })();
    this.running.add(p);
    void p.finally(() => this.running.delete(p));
    return { ...job };
  }

  private installSse(res: http.ServerResponse) {
    res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive', 'x-content-type-options': 'nosniff' });
    const write = (j: InstallJob | null) => res.write(`data: ${JSON.stringify(j)}\n\n`);
    const cur = this.install;
    write(cur ? { ...cur } : null);
    if (!cur || cur.status !== 'running') {
      res.end();
      return;
    }
    const l = (j: InstallJob) => {
      write(j);
      if (j.status !== 'running') {
        this.installListeners.delete(l);
        res.end();
      }
    };
    this.installListeners.add(l);
    res.on('close', () => this.installListeners.delete(l));
  }

  async close() {
    this.installAbort?.abort();
    for (const ac of this.aborts.values()) ac.abort();
    await Promise.allSettled([...this.running]);
    this.listeners.clear();
    this.installListeners.clear();
  }
}
