/**
 * 看板「…」菜单的导出（D39）：
 *
 * - 图片：`POST /__joplo/p/<id>/export/image` `{ scenarioId, position, theme }` → PNG（当前步骤；尺寸跟随页面自己的 viewport，
 *   手机页面带外框；D44 起不再选择设备；镜头用这一步的导演镜头）。Playwright 打开本看板的渲染路由（与 renderStep 同一条渲染路径），截取 `[data-jexport]`。
 * - 视频（只在本机）：`POST …/export/video` `{ scenarioId, theme }` → 202 `{ jobId }`（尺寸跟随场景起始页面的 viewport）；
 *   Playwright `recordVideo` 录下渲染路由的自动播放（含鼠标与字幕），保存为 `<项目>/exports/<场景>-<时间>.webm`。
 *   进度：`GET …/export/video/events`（SSE，先发当前状态，之后每次变化一条，结束后关闭）；`GET …/export/video` 取当前状态。
 *   同一项目同时只能有一个视频任务（再提交返回 409）。没有 Playwright / Chromium 时任务失败，错误里带安装命令。
 *
 * 字段流向：job（写入点：这里的 runJob）→ jobs Map（存储）→ SSE / GET（读取点）→ 看板的导出视频弹窗（消费者）。
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import type http from 'node:http';
import path from 'node:path';
import type { Browser, Page } from 'playwright';
import { JoploError, stateAt, type Project } from '@tokenroll/joplo-core';
import { launch, loadPlaywright, type PlaywrightModule } from './render.ts';

export type Device = 'desktop' | 'mobile';

/**
 * 导出画面的尺寸：电脑 = 舞台 1280×800；手机 = 外框（renderer 的 phoneFrameSize(390, 844) = 446×934）
 * 四周再留 16px（RenderApp 的 frame 模式）。
 */
export const EXPORT_SIZE: Record<Device, { width: number; height: number }> = {
  desktop: { width: 1280, height: 800 },
  mobile: { width: 446 + 32, height: 934 + 32 },
};

export type VideoJob = {
  id: string;
  projectId: string;
  scenarioId: string;
  status: 'running' | 'done' | 'error';
  /** starting 启动浏览器 → recording 录制中 → saving 写文件。 */
  phase: 'starting' | 'recording' | 'saving' | 'done' | 'error';
  step: number;
  total: number;
  /** 0–100。 */
  percent: number;
  /** 完成后：相对项目目录的路径（exports/…webm）。 */
  file: string | null;
  error: string | null;
};

/** 录制实现：报告进度，返回写好的文件绝对路径。测试可注入。 */
export type VideoRecorder = (input: { url: string; size: { width: number; height: number }; out: string; total: number; progress: (step: number) => void; signal: AbortSignal }) => Promise<void>;

export type ExportDeps = {
  loadPlaywright: () => Promise<PlaywrightModule>;
  recordVideo: VideoRecorder;
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

function parseRequest(project: Project | null, body: unknown, needPosition: boolean) {
  if (!project) throw new JoploError('INVALID_SCHEMA', '项目还没有成功编译过，无法导出');
  const b = (body ?? {}) as { scenarioId?: unknown; position?: unknown; theme?: unknown };
  if (typeof b.scenarioId !== 'string' || !project.scenarios[b.scenarioId]) throw new JoploError('USAGE', `场景不存在：${String(b.scenarioId)}`);
  const sc = project.scenarios[b.scenarioId]!;
  const position = needPosition ? Number(b.position ?? 0) : 0;
  if (!Number.isInteger(position) || position < 0 || position > sc.steps.length) throw new JoploError('USAGE', `位置应为 0–${sc.steps.length} 的整数`);
  // 设备跟随页面自己的 viewport（D44）
  const sceneId = stateAt(project, sc.id, position).sceneId;
  const device: Device = project.scenes[sceneId]?.viewport === 'mobile' ? 'mobile' : 'desktop';
  const theme = b.theme === 'clean' ? 'clean' : 'sketch';
  return { sc, position, device, theme };
}

const fileSafe = (s: string) => s.replace(/[^\w.-]+/g, '_').slice(0, 80) || 'scenario';
const stamp = (d = new Date()) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;

async function waitReady(page: Page) {
  await page.waitForFunction(() => (window as unknown as { __JOPLO_READY__?: boolean }).__JOPLO_READY__ === true, null, { timeout: 60000 });
  const err = await page.evaluate(() => (window as unknown as { __JOPLO_ERROR__?: string | null }).__JOPLO_ERROR__ ?? null);
  if (err) throw new JoploError('RENDER_FAILED', `渲染路由报告错误：${err}`);
}

/** 缺省的录制：Playwright recordVideo + 渲染路由的录制模式（window.__JOPLO_RECORD__）。 */
export function defaultRecorder(load: () => Promise<PlaywrightModule>): VideoRecorder {
  return async ({ url, size, out, progress, signal }) => {
    const pw = await load();
    const browser: Browser = await launch(pw);
    const tmp = fs.mkdtempSync(path.join(path.dirname(out), '.rec-'));
    try {
      const ctx = await browser.newContext({ viewport: size, deviceScaleFactor: 1, recordVideo: { dir: tmp, size } });
      const page = await ctx.newPage();
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await waitReady(page);
      await page.waitForTimeout(400);
      await page.evaluate(() => (window as unknown as { __JOPLO_RECORD__: { play(): void } }).__JOPLO_RECORD__.play());
      const t0 = Date.now();
      for (;;) {
        if (signal.aborted) throw new JoploError('EXPORT_FAILED', '导出已取消');
        const p = await page.evaluate(() => (window as unknown as { __JOPLO_RECORD__: { progress: { step: number; done: boolean; error: string | null } } }).__JOPLO_RECORD__.progress);
        if (p.error) throw new JoploError('EXPORT_FAILED', `播放出错：${p.error}`);
        progress(p.step);
        if (p.done) break;
        if (Date.now() - t0 > 5 * 60_000) throw new JoploError('EXPORT_FAILED', '录制超过 5 分钟，已停止');
        await page.waitForTimeout(150);
      }
      await page.waitForTimeout(900); // 停留在结果画面
      const video = page.video();
      await ctx.close();
      if (!video) throw new JoploError('EXPORT_FAILED', '浏览器没有生成视频');
      await video.saveAs(out);
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

  constructor(private readonly opts: { baseUrl: () => string; log: (s: string) => void; deps?: Partial<ExportDeps>; onEvent?: (j: VideoJob) => void }) {
    const load = opts.deps?.loadPlaywright ?? (() => loadPlaywright());
    this.deps = { loadPlaywright: load, recordVideo: opts.deps?.recordVideo ?? defaultRecorder(load) };
  }

  private renderUrl(projectId: string, q: Record<string, string>) {
    return `${this.opts.baseUrl()}?${new URLSearchParams({ render: '1', project: projectId, ...q })}`;
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
        const { sc, position, device, theme } = parseRequest(ctx.project, b.body, true);
        const png = await this.image(ctx.projectId, sc.id, position, device, theme);
        res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store', 'content-disposition': `attachment; filename="${fileSafe(sc.id)}-${position}.png"` });
        res.end(png);
        return;
      }
      if (sub === 'video' && method === 'POST') {
        if (!ctx.guardWrite()) return;
        const b = await ctx.jsonBody();
        if (!b.ok) return;
        const { sc, device, theme } = parseRequest(ctx.project, b.body, false);
        const cur = this.jobs.get(ctx.projectId);
        if (cur?.status === 'running') return send(res, 409, { error: { code: 'UNSUPPORTED_ACTION', message: '这个项目已有一个视频正在导出，请等它完成' }, job: cur });
        const job = this.startVideo(ctx.projectId, ctx.dir, sc.id, sc.steps.length, device, theme);
        return send(res, 202, { jobId: job.id, job });
      }
      if (sub === 'video' && method === 'GET') return send(res, 200, { job: this.job(ctx.projectId) });
      if (sub === 'video/events' && method === 'GET') {
        if (!ctx.guardWrite(false)) return;
        return this.sse(ctx.projectId, res);
      }
      return send(res, 404, { error: { code: 'NOT_FOUND', message: `没有这个接口：${method} export/${sub}` } });
    } catch (e) {
      if (!res.headersSent) ctx.fail(e);
      else res.end();
    }
  }

  private async image(projectId: string, scenarioId: string, position: number, device: Device, theme: string): Promise<Buffer> {
    const pw = await this.deps.loadPlaywright();
    const browser = await launch(pw);
    try {
      const page = await browser.newPage({ viewport: EXPORT_SIZE[device], deviceScaleFactor: 2, reducedMotion: 'reduce' });
      await page.goto(this.renderUrl(projectId, { scenario: scenarioId, position: String(position), theme, frame: '1' }), { waitUntil: 'domcontentloaded' });
      await waitReady(page);
      return await page.locator('[data-jexport]').screenshot({ type: 'png', animations: 'disabled' });
    } finally {
      await browser.close().catch(() => undefined);
    }
  }

  private startVideo(projectId: string, dir: string, scenarioId: string, total: number, device: Device, theme: string): VideoJob {
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
          url: this.renderUrl(projectId, { scenario: scenarioId, position: '0', theme, frame: '1', record: '1' }),
          size: EXPORT_SIZE[device],
          out,
          total,
          signal: ac.signal,
          progress: (step) => {
            const s = Math.max(0, Math.min(step, total));
            const percent = Math.round(5 + (total ? s / total : 1) * 85);
            if (job.phase !== 'recording' || s !== job.step) this.update(job, { phase: 'recording', step: s, percent });
          },
        });
        this.update(job, { phase: 'saving', percent: 95 });
        if (!fs.existsSync(out)) throw new JoploError('EXPORT_FAILED', '录制完成，但没有生成视频文件');
        this.update(job, { status: 'done', phase: 'done', percent: 100, step: total, file: rel });
        this.opts.log(`[joplo] 已导出视频：${out}`);
      } catch (e) {
        this.update(job, { status: 'error', phase: 'error', error: e instanceof Error ? e.message : String(e) });
      } finally {
        this.aborts.delete(projectId);
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

  async close() {
    for (const ac of this.aborts.values()) ac.abort();
    await Promise.allSettled([...this.running]);
    this.listeners.clear();
  }
}
