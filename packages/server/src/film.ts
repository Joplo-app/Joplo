/**
 * 胶片条与视频（`joplo render --film / --video`）：让 Agent 看见“运动”，而不只是每一步的终态。
 *
 * - renderFilm：Playwright 假时钟（page.clock）接管页面的 setTimeout / rAF / performance.now，演示控制器与引擎时钟
 *   因此按固定步长（sampleMs，默认 50 ms ≈ 20 fps）逐帧前进；每帧截一张图、在辅助页里用 canvas 算与上一帧的像素差。
 *   每隔 every（默认 250 ms）取一帧放进胶片条，标注时间、场景、步号与相邻帧差；同时客观地标出
 *   硬切（单帧整屏突变，前后帧都平静）与长时间静止（≥ stillMs 画面几乎不变）。加载耗时不进入采样时间；浏览器调度与栅格差异仍须实测复核。
 * - renderVideo：复用看板导出的录制器（defaultRecorder，按真实时间），得到可以直接发布的 webm：
 *   开播前的准备不进视频（#57）；可指定输出分辨率（#55）；已生成的旁白混进音轨（voice=real，#56）；
 *   可隐藏封面、鼠标、步骤标题条、字幕条，字幕另存为 .srt（#59）。
 *
 * 两者都走渲染路由的录制模式（record=1&frame=1）：与看板导出视频同一套演示控制器、鼠标、字幕；
 * chain=1 按发布站的顺序连续播放到方案的最后一个场景。胶片条用 voice=estimate：旁白按估算时长“读”（不出声、不调用朗读服务），
 * 停留时间与开着朗读的发布站一致。
 */
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import type { Browser, Page } from 'playwright-core';
import { JoploError, VIEWPORT_SIZE, displaySceneId, type Project } from '@joplo-app/core';
import type { FilmOptions, FilmResult, FilmCut, FilmStill, FilmBoundary, VideoOptions, VideoResult } from './contract.ts';
import { createDev } from './dev.ts';
import { realProjectDir } from './vite-shared.ts';
import { joploHome } from './home.ts';
import { loadPlaywright } from './export-runtime.ts';
import { assertNotProjectData, launch } from './render.ts';
import { encodeMp4 } from './video-format.ts';
import { commitOutput, writeOutput } from './output-file.ts';
import { createLayoutAuditSession } from './layout-audit.ts';
import { checkpointCommitsMatch, contentIdentity, exportRuntimeRoots } from './checkpoint.ts';
import { capture, geometryQuery } from './capture.ts';
import { frameTime, persistTimeline, playbackTimeline, type RawTimeline } from './timeline.ts';
import { EXPORT_SIZE, defaultRecorder, srt } from './export.ts';

/** 单帧整屏突变：变化像素占比至少这么多，且是前后帧的 CUT_RATIO 倍以上（排除持续的快速运镜）。 */
export const CUT_CHANGED = 0.3;
export const CUT_RATIO = 2.5;
/** 静止：与静止起点那一帧相比，变化像素占比低于这个值。 */
export const STILL_CHANGED = 0.004;
/** 一个像素的 RGB 平均差超过这个值才算“变了”（0–1）。 */
const PIXEL_THRESHOLD = 0.08;
function distinctOutputs(paths: (string | undefined)[]) {
  const values = paths.filter((p): p is string => !!p).map(p => path.resolve(p));
  if (new Set(values).size !== values.length) throw new JoploError('USAGE', 'Export output, timeline, subtitles and checkpoint paths must differ');
}
const MAX_MS = 10 * 60_000;

type Progress = { step: number; done: boolean; error: string | null; scenarioId: string | null; position: number; activeStep: number | null };
type Sample = { t: number; diff: number; changed: number; still: number; scenarioId: string | null; position: number; activeStep: number | null; stepId?: string | null; jpg?: string };

/** 纯函数：从逐帧的相邻差找出硬切。changed[i] 是第 i 帧与第 i-1 帧之间变化像素的占比。 */
export function findCuts(samples: readonly Pick<Sample, 't' | 'changed' | 'diff' | 'scenarioId' | 'position'>[]): FilmCut[] {
  const cuts: FilmCut[] = [];
  for (let i = 1; i < samples.length; i++) {
    const c = samples[i]!.changed;
    if (c < CUT_CHANGED) continue;
    const around = Math.max(samples[i - 1]?.changed ?? 0, samples[i + 1]?.changed ?? 0, i > 1 ? 0 : 0);
    if (c >= CUT_RATIO * Math.max(around, 0.02)) cuts.push({ atMs: samples[i]!.t, diff: round(samples[i]!.diff), changed: round(c), scenarioId: samples[i]!.scenarioId, position: samples[i]!.position });
  }
  return cuts;
}

/** 纯函数：still[i] = 第 i 帧距离“上一次明显变化”的毫秒数；找出至少 minMs 的静止段。 */
export function findStills(samples: readonly Pick<Sample, 't' | 'still' | 'scenarioId' | 'position'>[], minMs: number): FilmStill[] {
  const out: FilmStill[] = [];
  let run: FilmStill | null = null;
  for (const s of samples) {
    if (s.still >= minMs) {
      const from = s.t - s.still;
      if (run && run.fromMs === from) { run.toMs = s.t; continue; }
      run = { fromMs: from, toMs: s.t, scenarioId: s.scenarioId, position: s.position };
      out.push(run);
    } else run = null;
  }
  return out;
}

/** 纯函数：每次提交一步（或换场景）前后窗口里的最大相邻帧差，章节衔接是否硬切一眼可见。 */
export function stepBoundaries(samples: readonly Pick<Sample, 't' | 'diff' | 'changed' | 'scenarioId' | 'position'>[], before = 200, after = 1500): FilmBoundary[] {
  const out: FilmBoundary[] = [];
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]!, b = samples[i]!;
    if (a.scenarioId === b.scenarioId && a.position === b.position) continue;
    const win = samples.filter((s) => s.t >= b.t - before && s.t <= b.t + after);
    out.push({ atMs: b.t, scenarioId: b.scenarioId, position: b.position, chapter: a.scenarioId !== b.scenarioId, maxDiff: round(Math.max(0, ...win.map((s) => s.diff))), maxChanged: round(Math.max(0, ...win.map((s) => s.changed))) });
  }
  return out;
}

const round = (n: number) => Math.round(n * 10000) / 10000;
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** 辅助页：解码 JPEG、裁掉字幕区，与上一帧、静止起点比较。状态留在页面里，每帧只传一次图片。 */
const DIFF_PAGE = `<!doctype html><canvas id=c></canvas><script>
let prev=null, anchor=null, anchorT=0, history=[];
async function load(b64){ const img=new Image(); img.src='data:image/jpeg;base64,'+b64; await img.decode(); return img; }
function pixels(img, h){ const c=document.getElementById('c'); c.width=img.width; c.height=h; const g=c.getContext('2d',{willReadFrequently:true}); g.drawImage(img,0,0); return g.getImageData(0,0,img.width,h).data; }
function compare(a,b,th){ let sum=0, changed=0; const n=a.length/4; for(let i=0;i<a.length;i+=4){ const d=(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]))/765; sum+=d; if(d>th) changed++; } return { diff: sum/n, changed: changed/n }; }
window.dump = (back=0) => {const state=history[Math.max(0,history.length-1-back)]||{prev,anchor,anchorT};return {prev:Array.from(state.prev||[]),anchor:Array.from(state.anchor||[]),anchorT:state.anchorT};};
window.restore = (s) => {prev=new Uint8ClampedArray(s.prev);anchor=new Uint8ClampedArray(s.anchor);anchorT=s.anchorT;history=[{prev,anchor,anchorT}];};
window.step = async (b64, cropRatio, t, th, stillTh) => {
  const img = await load(b64); const d = pixels(img, Math.max(1, Math.round(img.height*cropRatio)));
  const adj = prev ? compare(prev, d, th) : { diff: 0, changed: 0 };
  prev = d;
  if (!anchor || compare(anchor, d, th).changed > stillTh) { anchor = d; anchorT = t; }
  history.push({prev,anchor,anchorT}); if(history.length>12)history.shift();
  return { ...adj, still: t - anchorT };
};
</script>`;

async function flush(page: Page) {
  // React 的提交可能跨多轮 MessageChannel；连续三轮无 DOM 变化后才采样。
  await page.evaluate(`() => new Promise((resolve, reject) => {
    let changed = false, quiet = 0, turns = 0;
    const observer = new MutationObserver(() => { changed = true; });
    observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
    const channel = new MessageChannel();
    const finish = () => { observer.disconnect(); channel.port1.close(); channel.port2.close(); };
    channel.port1.onmessage = () => {
      quiet = changed ? 0 : quiet + 1;
      changed = false;
      if (quiet >= 3) { finish(); resolve(); }
      else if (++turns >= 100) { finish(); reject(new Error('Render did not settle within 100 message turns')); }
      else channel.port2.postMessage(0);
    };
    channel.port2.postMessage(0);
  })`);
}

function check(opts: { projectDir: string; out: string; overwrite?: boolean }) {
  const out = path.resolve(opts.out);
  assertNotProjectData(opts.projectDir, out);
  if (fs.existsSync(out) && !opts.overwrite) throw new JoploError('USAGE', `Output file already exists: ${out}. To overwrite, pass overwrite: true (CLI: --overwrite)`);
  const dataDir = path.join(realProjectDir(opts.projectDir), '.joplo');
  if (out === dataDir || out.startsWith(dataDir + path.sep)) throw new JoploError('USAGE', `Cannot write to project data: ${out} (.joplo/ is managed by Joplo)`);
  return out;
}

async function compiled(projectDir: string) {
  const server = await createDev({ projectDir, port: 0, watch: false, log: () => undefined });
  const payload = server.payload();
  if (!payload.project) {
    await server.close().catch(() => undefined);
    const errs = payload.diagnostics.filter((d) => d.severity === 'error');
    throw new JoploError('INVALID_SCHEMA', `Project compilation failed: ${errs.map((d) => `${d.at ?? ''} ${d.message}`).join('; ')}`, { diagnostics: payload.diagnostics });
  }
  return { server, project: payload.project };
}

/** 视频分辨率：2–4096 的偶数（VP8 / VP9 编码要求偶数边长）。 */
function videoDimension(name: string, v: number) {
  if (!Number.isInteger(v) || v < 2 || v > 4096 || v % 2) throw new JoploError('USAGE', `--${name} for --video must be an even number of pixels from 2 to 4096 (got ${v})`);
  return v;
}

function recordUrl(base: string, projectId: string, project: Project, o: { scenarioId: string; theme?: string; chain?: boolean; audio?: boolean; locale?: string; content?: string; voice?: 'real' | 'estimate' | 'off'; hide?: readonly string[]; logicalViewport?: { width: number; height: number }; noFrame?: boolean; canvas?: { width: number; height: number } }) {
  if (!project.scenarios[o.scenarioId]) throw new JoploError('NOT_FOUND', `Scenario does not exist: ${o.scenarioId} (available: ${Object.keys(project.scenarios).join(', ') || 'none'})`);
  if (o.content !== undefined && !project.i18n?.locales.includes(o.content))
    throw new JoploError('USAGE', project.i18n ? `--content ${o.content} is not in config locales (${project.i18n.locales.join(', ')})` : `--content needs config({ locales }); this project has a single language`);
  const voice = o.voice ?? 'estimate';
  const q = new URLSearchParams({ render: '1', project: projectId, scenario: o.scenarioId, position: '0', theme: o.theme ?? project.theme ?? 'sketch', frame: '1', record: '1', ...(voice !== 'off' ? { voice } : {}), ...(o.chain ? { chain: '1' } : {}), ...(o.audio === false ? {audio:'0'} : {}), ...(o.locale ? { locale: o.locale } : {}), ...(o.content ? { content: o.content } : {}), ...(o.hide?.length ? { hide: o.hide.join(',') } : {}), ...geometryQuery(o), ...(o.canvas ? { w: String(o.canvas.width), h: String(o.canvas.height) } : {}) });
  const device: 'mobile' | 'desktop' = project.scenes[displaySceneId(project, o.scenarioId, 0)]?.viewport === 'mobile' ? 'mobile' : 'desktop';
  return { url: `${base}?${q}`, size: o.logicalViewport ?? (o.noFrame ? VIEWPORT_SIZE[device] : EXPORT_SIZE[device]), device };
}

/** 胶片条：按引擎时间逐帧定格取样。 */
async function samplePlayback(opts: FilmOptions & { frameFps?: number; frameScale?: number; framesOnly?: boolean }): Promise<FilmResult> {
  if(opts.auditLayout&&opts.resume)throw new JoploError('USAGE','Layout audit requires a fresh render; do not combine it with --resume');
  if(opts.auditLayout&&opts.framesOnly)throw new JoploError('USAGE','Layout audit supports static screenshots and --film, not --frames-out');
  const baselineRssBytes=process.memoryUsage().rss;
  const projectDir = realProjectDir(opts.projectDir);
  const out = check({ ...opts, projectDir });
  const metadataOut = check({ projectDir, out: out.replace(/(\.png)?$/i, '.json'), overwrite: opts.overwrite });
  if (opts.timeline) {
    check({ projectDir, out: opts.timeline, overwrite: opts.overwrite });
    assertNotProjectData(projectDir, path.join(`${path.resolve(opts.timeline).replace(/\.json$/i, '')}.assets`, '__asset.wav'));
  }
  distinctOutputs([out, metadataOut, opts.timeline, opts.checkpoint]);
  geometryQuery(opts);
  if (opts.voice && !['real', 'estimate', 'off'].includes(opts.voice)) throw new JoploError('USAGE', '--voice must be real, estimate or off');
  if (opts.hide?.some(h => !['cover', 'cursor', 'title', 'subtitles'].includes(h))) throw new JoploError('USAGE', 'Unknown hide item');
  if (opts.chapterTimeoutMs !== undefined && (!Number.isFinite(opts.chapterTimeoutMs) || opts.chapterTimeoutMs <= 0)) throw new JoploError('USAGE', 'chapterTimeoutMs must be positive');
  if (opts.sampleMs !== undefined && !Number.isFinite(opts.sampleMs)) throw new JoploError('USAGE', 'sampleMs must be finite');
  if ((opts.width === undefined) !== (opts.height === undefined)) throw new JoploError('USAGE', 'Film width and height must be provided together');
  if (opts.width !== undefined && ![opts.width, opts.height].every(n => Number.isInteger(n) && n! > 0 && n! <= 8192)) throw new JoploError('USAGE', 'Film dimensions must be integers from 1 to 8192');
  const sampleMs = Math.max(20, Math.min(250, Math.round(opts.sampleMs ?? 50)));
  const every = Math.max(sampleMs, Math.round((opts.every ?? 250) / sampleMs) * sampleMs);
  const stillMs = opts.stillMs ?? 1500;
  const columns = Math.max(1, Math.min(16, Math.round(opts.columns ?? 8)));
  const cellWidth = Math.max(120, Math.min(640, Math.round(opts.cellWidth ?? 224)));
  const playwright = await loadPlaywright({ home: joploHome(), projectDir });
  const { server, project } = await compiled(projectDir);
  let fingerprint = '';
  const checkpointFile = opts.checkpoint ? path.resolve(opts.checkpoint) : null;
  if (checkpointFile) assertNotProjectData(projectDir, checkpointFile);
  let checkpoint: { fingerprint: string; samples: Sample[]; diff: unknown; commits: {stepId:string;commitMs:number}[] } | null = null;
  if (opts.resume) {
    if (!checkpointFile) { await server.close(); throw new JoploError('USAGE', '--resume requires --checkpoint'); }
    try {
      checkpoint = JSON.parse(fs.readFileSync(checkpointFile, 'utf8'));
      if(!checkpoint||typeof checkpoint.fingerprint!=='string'||!Array.isArray(checkpoint.samples)||checkpoint.samples.length===0||!Array.isArray(checkpoint.commits)||checkpoint.commits.some(c=>typeof c.stepId!=='string'||!Number.isFinite(c.commitMs)))throw new Error('Invalid checkpoint schema');
    } catch { await server.close(); throw new JoploError('USAGE', 'Checkpoint is absent or invalid'); }
  }
  const startedAt = Date.now();
  let browser: Browser | null = null;
  try {
    const audit=opts.auditLayout?createLayoutAuditSession({out,project,crop:opts.crop,options:opts.auditLayout,overwrite:opts.overwrite,sampleMs}):null;
    const canvas = opts.width && opts.height ? { width: opts.width, height: opts.height } : opts.logicalViewport;
    const { url, size: defaultSize } = recordUrl(server.url, server.projectId, project, {...opts,audio:false,voice: opts.voice ?? (opts.framesOnly ? 'real' : 'estimate'), ...(canvas ? { canvas } : {})});
    const size = canvas ?? defaultSize;
    browser = await launch(playwright);
    const ctx = await browser.newContext({ viewport: size, deviceScaleFactor: opts.framesOnly ? opts.frameScale ?? 1 : 0.5 });
    const page = await ctx.newPage();
    const captureSession = await ctx.newCDPSession(page);
    await page.clock.install({ time: 0 });
    // 先冻结空白页，避免读 now 与 pauseAt 两次调用之间的墙钟竞态。
    await page.clock.pauseAt(86_400_000);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    // 载入阶段：真实时间里等网络与字体，假时间一点点往前推，直到渲染路由报告就绪
    const t0 = Date.now();
    for (;;) {
      const ready = await page.evaluate(() => (window as unknown as { __JOPLO_READY__?: boolean }).__JOPLO_READY__ === true);
      if (ready) break;
      if (Date.now() - t0 > 60_000) throw new JoploError('RENDER_FAILED', 'Render route did not become ready within 60 seconds');
      await page.clock.runFor(16);
      await page.waitForTimeout(10);
    }
    const err = await page.evaluate(() => (window as unknown as { __JOPLO_ERROR__?: string | null }).__JOPLO_ERROR__ ?? null);
    if (err) throw new JoploError('RENDER_FAILED', `Render route reported an error: ${err}`);
    // 加载期间也只按 16ms 网格推进；开播相位不随网络和字体加载耗时改变。
    await flush(page);
    await page.evaluate(() => (window as unknown as { __JOPLO_RECORD__: { prepare(): Promise<void> } }).__JOPLO_RECORD__.prepare());
    if(checkpointFile) {
    const excluded = [out,metadataOut,opts.timeline,opts.timeline ? opts.timeline.replace(/\.json$/i,'')+'.assets' : null,opts.frames,checkpointFile].filter((p):p is string=>!!p);
    const outStem=path.basename(out).replace(/\.png$/i,'');
    for(const name of fs.existsSync(path.dirname(out))?fs.readdirSync(path.dirname(out)):[]) if(name.startsWith(outStem+'-')&&name.endsWith('.png')) excluded.push(path.join(path.dirname(out),name));
    const sourceIdentity = contentIdentity([projectDir,...exportRuntimeRoots(projectDir,server.payload().plugins ?? {})],excluded);
    const { projectDir:_projectDir,out:_out,overwrite:_overwrite,resume:_resume,checkpoint:_checkpoint,timeline:_timeline,frames:_frames,...rendering }=opts;
    const voiceIdentity=await page.evaluate(()=>(window as unknown as {__JOPLO_RECORD__:{voiceIdentity():unknown}}).__JOPLO_RECORD__.voiceIdentity());
    fingerprint=createHash('sha256').update(JSON.stringify({version:2,browser:browser.version(),platform:process.platform,arch:process.arch,node:process.versions.node,project,voiceIdentity,sourceIdentity,rendering,sampleMs,every,stillMs,plugins:server.payload().plugins})).digest('hex');
    if (checkpoint?.fingerprint !== undefined && checkpoint.fingerprint !== fingerprint) throw new JoploError('USAGE','Checkpoint source, version or rendering options changed; start a fresh render');
    }
    const helper = await ctx.newPage();
    await helper.setContent(DIFF_PAGE);
    // 字幕与步骤标题条浮在画面上（D97）：胶片条只看画面本身的运动，采样时把它们藏起来，文字换行不算镜头切换
    await page.addStyleTag({ content: '[data-jsubtitle],[data-testid="step-title"]{visibility:hidden!important}' });
    const stageRatio = 1;
    const samples: Sample[] = [];
    let lastChapter: string | null = null;
    let chapterStartedAt = Date.now();
    const rssSamples: {engineMs:number;rssBytes:number}[]=[];
    let nextMemoryAt=0;
    let tail = -1;
    // 第一帧在开播之前采（封面 / 第 0 步）：开播那一下的切换也要量到
    let previousTime = 0;
    for (let index = 0; ; index++) {
      const t = opts.frameFps ? frameTime(index, opts.frameFps) : index * sampleMs;
      if (t > MAX_MS) break;
      if (index === 1) {
        await page.evaluate(() => (window as unknown as { __JOPLO_RECORD__: { play(): void } }).__JOPLO_RECORD__.play());
        await flush(page);
      }
      if (t > 0) await page.clock.runFor(t - previousTime);
      previousTime = t;
      await flush(page);
      const p = await page.evaluate(() => (window as unknown as { __JOPLO_RECORD__: { progress: Progress } }).__JOPLO_RECORD__.progress);
      if (p.error) throw new JoploError('RENDER_FAILED', `Playback failed at ${t} ms: ${p.error}`);
      if (p.scenarioId !== lastChapter) chapterStartedAt = Date.now();
      if (Date.now() - chapterStartedAt > (opts.chapterTimeoutMs ?? 180_000)) throw new JoploError('RENDER_FAILED', `Chapter ${p.scenarioId} timed out at ${t} ms (wall clock); completed checkpoint was preserved`);
      if(t>=nextMemoryAt) {rssSamples.push({engineMs:t,rssBytes:process.memoryUsage().rss});nextMemoryAt=t+5000;}
      const restored = checkpoint?.samples[index];
      if (restored) {
        samples.push(restored);
        if (index === checkpoint!.samples.length - 1) {
          const currentStep = p.scenarioId ? project.scenarios[p.scenarioId]?.steps[p.position-1]?.id ?? null : null;
          if(restored.scenarioId!==p.scenarioId||restored.position!==p.position||restored.activeStep!==p.activeStep||restored.stepId!==currentStep) throw new JoploError('RENDER_FAILED',`Checkpoint stable state diverged at ${t} ms; rerun without --resume`);
          const raw = await page.evaluate(() => (window as unknown as {__JOPLO_RECORD__:{timeline():RawTimeline}}).__JOPLO_RECORD__.timeline());
          const commits=playbackTimeline(raw).steps.map(s=>({stepId:s.stepId,commitMs:s.commitMs}));
          if(!checkpointCommitsMatch(checkpoint!.commits,commits)) throw new JoploError('RENDER_FAILED','Checkpoint playback commits differ by more than 50 ms; rerun without --resume');
          await helper.evaluate((state) => (window as unknown as { restore(s: unknown): void }).restore(state), checkpoint!.diff);
        }
        lastChapter = p.scenarioId;
        continue;
      }
      const jpg = (await capture(page, '[data-jexport]', opts.crop, 'jpeg', opts.framesOnly ? 95 : 72, captureSession, t)).toString('base64');
      await audit?.sample(page,{atMs:t,scenarioId:p.scenarioId??opts.scenarioId,position:p.position,jpg});
      const d = opts.framesOnly ? { diff: 0, changed: 0, still: 0 } : await helper.evaluate(([b64, crop, time, th, st]) => (window as unknown as { step: (...a: unknown[]) => Promise<{ diff: number; changed: number; still: number }> }).step(b64, crop, time, th, st), [jpg, stageRatio, t, PIXEL_THRESHOLD, STILL_CHANGED] as const);
      samples.push({ t, ...d, scenarioId: p.scenarioId, position: p.position, activeStep: p.activeStep, stepId: p.scenarioId ? project.scenarios[p.scenarioId]?.steps[p.position-1]?.id ?? null : null, ...(!opts.framesOnly && t % every === 0 ? { jpg } : {}) });
      if (opts.frames && (opts.framesOnly || t % every === 0)) { fs.mkdirSync(opts.frames, { recursive: true }); fs.writeFileSync(path.join(opts.frames, `${String(t).padStart(7, '0')}.jpg`), Buffer.from(jpg, 'base64')); }
      if (checkpointFile && lastChapter && lastChapter !== p.scenarioId && samples.length>4) {
        // Keep a stable final-state anchor before the seam. Its small tail is
        // recomputed, so accepted one-sample scheduling jitter never reuses seam pixels.
        const back=Math.min(10,Math.ceil(100/sampleMs)+1), prefix=samples.slice(0,-back);
        const diff=await helper.evaluate(back => (window as unknown as {dump(n:number):unknown}).dump(back),back);
        const raw=await page.evaluate(() => (window as unknown as {__JOPLO_RECORD__:{timeline():RawTimeline}}).__JOPLO_RECORD__.timeline());
        const cutoff=prefix.at(-1)!.t;
        const commits=playbackTimeline({...raw,events:raw.events.filter(e=>e.at-(raw.startedAt??0)<=cutoff)}).steps.map(s=>({stepId:s.stepId,commitMs:s.commitMs}));
        fs.mkdirSync(path.dirname(checkpointFile),{recursive:true});
        const temp=`${checkpointFile}.${process.pid}.tmp`;
        fs.writeFileSync(temp,JSON.stringify({fingerprint,samples:prefix,diff,commits}));fs.renameSync(temp,checkpointFile);
      }
      lastChapter = p.scenarioId;
      if (p.done && tail < 0) tail = t + 1000;
      if (tail >= 0 && t >= tail) break;
    }
    if (tail < 0) throw new JoploError('RENDER_FAILED', `Playback did not finish within ${MAX_MS / 60000} minutes of engine time`);
    const raw = await page.evaluate(() => (window as unknown as { __JOPLO_RECORD__: { timeline(): RawTimeline } }).__JOPLO_RECORD__.timeline());
    if (opts.timeline) { const file = check({ projectDir, out: opts.timeline, overwrite: opts.overwrite }); await persistTimeline(file, playbackTimeline(raw), project.mediaAssets ?? {}, server.url, opts.overwrite, server.token,project.mediaInfo); }
    const cuts = findCuts(samples);
    const stills = findStills(samples, stillMs);
    const boundaries = stepBoundaries(samples);
    const durationMs = samples[samples.length - 1]!.t;
    // 胶片条：每个场景一页，避免一张图太长被缩得看不清
    const pages = new Map<string, Sample[]>();
    for (const s of samples) if (s.jpg) { const k = s.scenarioId ?? ''; if (!pages.has(k)) pages.set(k, []); pages.get(k)!.push(s); }
    const name = (sid: string) => project.scenarios[sid]?.name ?? sid;
    const files: string[] = [];
    let index = 0;
    for (const [sid, cells] of pages) {
      index++;
      const file = pages.size === 1 ? out : out.replace(/(\.png)?$/i, `-${index}.png`);
      const cutAt = (s: Sample) => cuts.find((c) => c.atMs > s.t - every && c.atMs <= s.t);
      const stillAt = (s: Sample) => s.still >= stillMs;
      const body = cells.map((s) => {
        const cut = cutAt(s);
        const step = s.position > 0 ? project.scenarios[sid]?.steps[s.position - 1] : undefined;
        const first = cells.find((c) => c.position === s.position) === s;
        const peak = Math.max(...samples.filter((x) => x.t > s.t - every && x.t <= s.t).map((x) => x.changed), 0);
        return `<div class="cell${cut ? ' cut' : ''}${stillAt(s) ? ' still' : ''}"><img src="data:image/jpeg;base64,${s.jpg}"><div class="meta"><b>${(s.t / 1000).toFixed(2)}s</b> · ${s.position}${s.activeStep !== null ? `→${s.activeStep + 1}` : ''} <span class="bar"><i style="width:${Math.min(100, Math.round(peak * 100))}%"></i></span>${cut ? ` <em>CUT ${(cut.changed * 100).toFixed(0)}%</em>` : ''}${stillAt(s) ? ` <u>STILL ${(s.still / 1000).toFixed(1)}s</u>` : ''}${first && step ? `<div class="cap">${esc(step.caption)}</div>` : ''}</div></div>`;
      }).join('');
      const summary = `${cuts.filter((c) => c.scenarioId === sid).length} cuts · ${stills.filter((x) => x.scenarioId === sid).length} stills ≥ ${(stillMs / 1000).toFixed(1)}s · every ${every} ms, diff sampled every ${sampleMs} ms`;
      const html = `<!doctype html><meta charset="utf-8"><style>
        body{margin:0;padding:18px;background:#16181d;color:#e8e8ea;font:12px/1.35 -apple-system,"PingFang SC","Noto Sans SC",system-ui,sans-serif}
        h1{font-size:16px;margin:0 0 4px} p{margin:0 0 12px;color:#a0a4b0} .grid{display:grid;grid-template-columns:repeat(${columns},${cellWidth}px);gap:8px}
        .cell img{width:100%;display:block;border-radius:3px;border:2px solid #2c2f38} .cut img{border-color:#ff4d4f} .still img{border-color:#8a8f9c;filter:grayscale(.6)}
        .meta{padding:2px 1px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis} b{color:#ffb020} em{color:#ff6b6b;font-style:normal;font-weight:700} u{color:#c0c4cf;text-decoration:none}
        .bar{display:inline-block;width:40px;height:5px;background:#2c2f38;vertical-align:middle}.bar i{display:block;height:100%;background:#5b8cff}
        .cap{color:#c9ccd4;overflow:hidden;text-overflow:ellipsis}
      </style><h1>${esc(name(sid))} · ${esc(sid)}</h1><p>${esc(summary)}. Red = one-frame full-screen change (hard cut); grey = no visible change for ≥ ${(stillMs / 1000).toFixed(1)}s; blue bar = largest adjacent-frame change in the cell.</p><div class="grid">${body}</div>`;
      const sheet = await ctx.newPage();
      await sheet.setViewportSize({ width: columns * cellWidth + (columns - 1) * 8 + 36, height: 600 });
      await sheet.setContent(html, { waitUntil: 'load' });
      const png = await sheet.screenshot({ type: 'png', fullPage: true });
      await sheet.close();
      fs.mkdirSync(path.dirname(file), { recursive: true });
      await writeOutput(file,png,opts.overwrite);
      files.push(file);
    }
    await ctx.close();
    const result: FilmResult = { ...(audit?{audit:audit.finish()}:{}), path: files[0] ?? out, files, durationMs, sampleMs, every, samples: samples.length, cuts, stills, boundaries, maxDiff: round(Math.max(0, ...samples.map((s) => s.diff))), warnings: sampleMs > 50 ? ['Coarse analysis: transitions shorter than the computation interval may be missed; use 50 ms for final QA.'] : [], measurement: { baselineRssBytes, endRssBytes:process.memoryUsage().rss, memoryScope:'node-process-lifetime', rssSamples, wallMs: Date.now() - startedAt, peakRssBytes: process.resourceUsage().maxRSS * 1024, resumedSamples: checkpoint?.samples.length ?? 0 } };
    // 完整的判读数据（每一步提交前后的最大帧差、硬切、静止）放在胶片条旁边，评审时可以引用具体数字
    await writeOutput(metadataOut,JSON.stringify({ ...result, frames: samples.map(({ jpg: _jpg, ...rest }) => rest) }, null, 1),opts.overwrite);
    return result;
  } finally {
    await browser?.close().catch(() => undefined);
    await server.close().catch(() => undefined);
  }
}

export function renderFilm(opts: FilmOptions): Promise<FilmResult> { return samplePlayback(opts); }

const HIDE = ['cover', 'cursor', 'title', 'subtitles'] as const;

/** 视频：与看板导出相同的录制器（真实时间）。 */
export async function renderVideo(opts: VideoOptions): Promise<VideoResult> {
  const projectDir = realProjectDir(opts.projectDir);
  const out = check({ ...opts, projectDir });
  distinctOutputs([out, opts.timeline, opts.srt]);
  geometryQuery(opts);
  if(opts.auditLayout)throw new JoploError('USAGE','Layout audit supports static screenshots and --film, not --video');
  if (opts.crop) throw new JoploError('USAGE', 'Video crop is not supported; use --viewport/--no-frame or --frames-out with --crop');
  if (opts.timeline) {
    check({ projectDir, out: opts.timeline, overwrite: opts.overwrite });
    assertNotProjectData(projectDir, path.join(`${path.resolve(opts.timeline).replace(/\.json$/i, '')}.assets`, '__asset.wav'));
  }
  if ((opts.width === undefined) !== (opts.height === undefined)) throw new JoploError('USAGE', 'Video width and height must be provided together');
  const video = opts.width !== undefined ? { width: videoDimension('width', opts.width), height: videoDimension('height', opts.height!) } : null;
  const bad = (opts.hide ?? []).find((h) => !(HIDE as readonly string[]).includes(h));
  if (bad) throw new JoploError('USAGE', `Unknown --hide item ${JSON.stringify(bad)} (use ${HIDE.join(', ')})`);
  const voice = opts.voice ?? 'real';
  if (!['real', 'estimate', 'off'].includes(voice)) throw new JoploError('USAGE', `--voice must be real, estimate or off (got ${String(voice)})`);
  const srtOut = opts.srt ? check({ out: opts.srt, overwrite: opts.overwrite, projectDir }) : null;
  if (srtOut && srtOut === out) throw new JoploError('USAGE', 'The subtitle file must differ from the video file');
  const { server, project } = await compiled(projectDir);
  let videoWork: string | null = null;
  try {
    // 输出分辨率（#55）：视口就是视频分辨率，渲染路由把舞台等比缩放进这块画布（录屏按 CSS 像素取帧，deviceScaleFactor 不会让它更清晰）
    const { url, size } = recordUrl(server.url, server.projectId, project, { ...opts, voice, hide: opts.hide ?? [], ...(video ? { canvas: video } : {}) });
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const started = Date.now();
    const mp4 = path.extname(out).toLowerCase() === '.mp4';
    videoWork=fs.mkdtempSync(path.join(path.dirname(out),'.joplo-video-'));
    const recordingOut=path.join(videoWork,'recording.webm');
    const encodedOut=mp4?path.join(videoWork,'encoded.mp4'):recordingOut;
    const outcome = await defaultRecorder((dir) => loadPlaywright({ home: joploHome(), projectDir: dir }))({ projectDir, url, size: video ?? size, out: recordingOut, total: 0, progress: () => undefined, signal: new AbortController().signal, maxMs: MAX_MS });
    if (mp4) await encodeMp4(recordingOut,encodedOut);
    if (srtOut) {
      fs.mkdirSync(path.dirname(srtOut), { recursive: true });
      fs.writeFileSync(srtOut, srt(outcome?.cues ?? []), opts.overwrite ? undefined : { flag: 'wx' });
    }
    if (opts.timeline && outcome?.timeline) { const file = check({ projectDir, out: opts.timeline, overwrite: opts.overwrite }); await persistTimeline(file, outcome.timeline, project.mediaAssets ?? {}, server.url, opts.overwrite, server.token,project.mediaInfo); }
    await commitOutput(encodedOut,out,opts.overwrite);
    return { ...(outcome?.sync ? { sync: outcome.sync } : {}), path: out, durationMs: Date.now() - started, size: video ?? size, srt: srtOut, voice: outcome?.voice ?? { mode: voice, missing: [] } };
  } finally {
    if(videoWork)fs.rmSync(videoWork,{recursive:true,force:true});
    await server.close().catch(() => undefined);
  }
}

/** Public offline frame export. No audio synthesis or private browser bridge is needed by callers. */
export async function renderFrames(opts: import('./contract.ts').FramesOptions) {
  const fps = opts.fps ?? 30;
  if (!Number.isFinite(fps) || fps < 1 || fps > 120) throw new JoploError('USAGE', 'fps must be from 1 to 120');
  if (opts.scale !== undefined && (!Number.isFinite(opts.scale) || opts.scale <= 0 || opts.scale > 4)) throw new JoploError('USAGE', 'Frame scale must be above 0 and at most 4');
  const dir = path.resolve(opts.framesOut);
  assertNotProjectData(opts.projectDir, path.join(dir, '__frame.jpg'));
  if (dir === realProjectDir(opts.projectDir)) throw new JoploError('USAGE', 'Frame output directory must differ from the project root');
  if (fs.existsSync(dir) && fs.readdirSync(dir).length && !opts.overwrite) throw new JoploError('USAGE', 'Frame directory is not empty; use --overwrite');
  const timeline = opts.timeline ?? path.join(dir, 'timeline.json');
  if (opts.overwrite && fs.existsSync(dir)) for (const name of fs.readdirSync(dir)) if (/^\d{7}\.jpg$/.test(name)) fs.rmSync(path.join(dir, name));
  const result = await samplePlayback({ ...opts, hide: opts.hide ?? ['cover', 'cursor', 'title', 'subtitles'], out: path.join(dir, 'film.png'), frames: dir, timeline, frameFps: fps, frameScale: opts.scale, framesOnly: true });
  return { directory: dir, timeline, fps, frames: result.samples, durationMs: result.durationMs, toleranceMs: 50 };
}
