/**
 * `joplo share` 的嵌入代码（云端嵌入契约）：格式与云端控制台、分享页 Worker 逐字一致，开源 CLI 自己生成，不导入私有包。
 *
 * - iframe：`<iframe src="<分享页>?embed=1" title="<标题> · Joplo 演示" …>`，属性值做 HTML 转义；
 * - 徽章：`<分享页>badge.svg`；预览图：`<分享页>preview.png`（1200×630，优先用 share 上传的 `_joplo/preview.png`）；
 * - Markdown：`[![Joplo 演示 · <标题>](<徽章>)](<分享页>)`，替代文字把连续空白（含换行）合成一个空格，并转义 `\ [ ]`。
 *
 * “Joplo 演示”是契约里的固定标签（嵌入方页面上的文字），不是 CLI 的界面文案。
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { embedStartScenario } from '@joplo-app/core';

/** share 生成的预览图在发布清单里的固定路径。 */
export const PREVIEW_PATH = '_joplo/preview.png';
export const PREVIEW_SIZE = { width: 1200, height: 630 } as const;
/** 与 @joplo-app/server 的 SETUP_COMMAND 相同（这里不为一行提示载入 server）。 */
export const EXPORT_SETUP_COMMAND = 'npx joplo setup export';

export type EmbedSnippets = { iframe: string; markdown: string; badge: string; preview: string };

const LABEL = 'Joplo 演示';

const escapeAttr = (value: string) => value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const escapeMarkdownText = (value: string) => value.replace(/\s+/g, ' ').replace(/[\\[\]]/g, (c) => `\\${c}`);

/** 分享页地址：去掉查询与锚点，路径以 / 结尾（服务端返回的 url 已校验为 http(s)）。 */
export function sharePage(url: string): string {
  const u = new URL(url);
  u.search = '';
  u.hash = '';
  if (!u.pathname.endsWith('/')) u.pathname += '/';
  return u.href;
}

export function embedSnippets(url: string, title: string): EmbedSnippets {
  const page = sharePage(url);
  const badge = `${page}badge.svg`;
  return {
    iframe: `<iframe src="${escapeAttr(`${page}?embed=1`)}" title="${escapeAttr(`${title} · ${LABEL}`)}" style="width:100%;aspect-ratio:16/10;border:0" allow="fullscreen *" allowfullscreen loading="lazy"></iframe>`,
    markdown: `[![${escapeMarkdownText(`${LABEL} · ${title}`)}](${badge})](${page})`,
    badge,
    preview: `${page}preview.png`,
  };
}

/** 渲染一步截图（@joplo-app/server 的 renderStep；没有时由调用方抛错）。 */
export type RenderPreview = (opts: { projectDir: string; scenarioId: string; out: string; viewport: { width: number; height: number }; scale: number }) => Promise<unknown>;

/** 发布 IR（index.html 内联的 joplo-ir）；读不到时为 null。 */
export function inlineProject(html: string): Parameters<typeof embedStartScenario>[0] | null {
  const m = /<script type="application\/json" id="joplo-ir">([\s\S]*?)<\/script>/.exec(html);
  if (!m) return null;
  try {
    const data = JSON.parse(m[1]!) as { project?: unknown };
    const p = data.project as Parameters<typeof embedStartScenario>[0] | undefined;
    return p && typeof p === 'object' && p.features && p.options && p.scenarios ? p : null;
  } catch {
    return null;
  }
}

/** 发布 IR 的 mode（publish / review）；读不到时为 null。 */
export function inlineProjectMode(html: string): string | null {
  const m = /<script type="application\/json" id="joplo-ir">([\s\S]*?)<\/script>/.exec(html);
  if (!m) return null;
  try {
    const mode = (JSON.parse(m[1]!) as { project?: { mode?: unknown } }).project?.mode;
    return typeof mode === 'string' ? mode : null;
  } catch {
    return null;
  }
}

/** PNG 签名 + IHDR 宽高。 */
function pngSize(data: Uint8Array): { width: number; height: number } | null {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (data.length < 24 || sig.some((b, i) => data[i] !== b) || Buffer.from(data.subarray(12, 16)).toString('ascii') !== 'IHDR') return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/**
 * 预览图：渲染默认场景（与嵌入模式同一个）的初始画面为 1200×630 PNG，放到发布目录的 `_joplo/preview.png`。
 * 先渲染到 scratch，校验是 1200×630 的 PNG 后才复制进发布目录，所以任何失败都不会在清单里留下文件。
 * 失败（没有导出组件、浏览器启动失败、项目没有场景、尺寸不对……）只返回原因，由调用方在 stderr 提示一行，不让 share 失败。
 * 没有导出组件（D65）时只提示安装命令，绝不自动下载。
 */
export async function writePreview(render: () => Promise<RenderPreview>, projectDir: string, siteDir: string, scratch: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    const project = inlineProject(await readFile(join(siteDir, 'index.html'), 'utf8'));
    const scenarioId = project ? embedStartScenario(project) : null;
    if (!scenarioId) return { ok: false, reason: 'no scenario to show' };
    const renderStep = await render();
    await rm(scratch, { force: true });
    await renderStep({ projectDir, scenarioId, out: scratch, viewport: { ...PREVIEW_SIZE }, scale: 1 });
    const data = await readFile(scratch);
    const size = pngSize(data);
    if (!size || size.width !== PREVIEW_SIZE.width || size.height !== PREVIEW_SIZE.height) return { ok: false, reason: size ? `unexpected size ${size.width}x${size.height}` : 'the render is not a PNG' };
    await mkdir(join(siteDir, '_joplo'), { recursive: true });
    try {
      await writeFile(join(siteDir, PREVIEW_PATH), data, { flag: 'wx' });
    } catch (e) {
      // 已存在（作者产物自带同名文件）时不动它；其他写入失败删掉可能写了一半的文件
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') await rm(join(siteDir, PREVIEW_PATH), { force: true }).catch(() => undefined);
      throw e;
    }
    return { ok: true };
  } catch (e) {
    if ((e as { code?: unknown } | null)?.code === 'EXPORT_COMPONENT_MISSING') return { ok: false, reason: `the export component is not installed; to add preview images run: ${EXPORT_SETUP_COMMAND}` };
    return { ok: false, reason: (e instanceof Error ? e.message : String(e)).split('\n')[0]!.trim() || 'render failed' };
  } finally {
    await rm(scratch, { force: true }).catch(() => undefined);
  }
}
