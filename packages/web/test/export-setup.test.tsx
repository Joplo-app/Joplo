/**
 * 看板的导出组件（D66）：安装卡何时出现、进度文字、安装请求带本机令牌、渲染出的卡片。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider } from '../src/i18n/context';
import { boardDictionary, boardEnglish } from '../src/i18n/board/dictionaries';
import { ExportSetupCard, setupProgress, showSetupCard, type ExportRuntime } from '../src/board/ExportSetup';
import { exportImage, fetchExportRuntime, installExportRuntime, type ExportRuntimeStatus, type InstallJob } from '../src/runtime/dev-client';

afterEach(() => vi.unstubAllGlobals());

const status = (ready: boolean): ExportRuntimeStatus => ({ ready, source: ready ? 'managed' : null, version: '1.64.1', dir: '/h/.joplo/runtime/playwright-1.64.1', downloadMB: 100, installingPid: null, command: 'npx joplo setup export' });
const job = (p: Partial<InstallJob>): InstallJob => ({ id: 'j', status: 'running', phase: 'browser', percent: 40, totalMB: 95.3, message: '', error: null, ...p });

describe('安装卡与进度', () => {
  it('未安装、安装中、安装失败时显示；已就绪或状态未知（旧服务端）时不显示', () => {
    expect(showSetupCard(status(false), null)).toBe(true);
    expect(showSetupCard(status(true), null)).toBe(false);
    expect(showSetupCard(null, null)).toBe(false);
    expect(showSetupCard(status(true), job({ status: 'running' }))).toBe(true);
    expect(showSetupCard(status(false), job({ status: 'error', phase: 'error', error: 'ECONNRESET' }))).toBe(true);
    expect(showSetupCard(status(true), job({ status: 'done', phase: 'done' }))).toBe(false);
  });

  it('每个阶段的进度文字（英文与中文）', () => {
    expect(setupProgress(job({ phase: 'package', percent: 1 }))).toEqual({ text: 'Installing Playwright…', percent: 1 });
    expect(setupProgress(job({ phase: 'browser', totalMB: 95.3 })).text).toBe('Downloading Chromium (95 MB)…');
    expect(setupProgress(job({ phase: 'browser', totalMB: null })).text).toBe('Downloading Chromium…');
    expect(setupProgress(job({ phase: 'verify', percent: 96 })).text).toBe('Checking that Chromium starts…');
    expect(setupProgress(job({ status: 'error', phase: 'error', error: 'npm install failed' })).text).toBe('Could not install the export component: npm install failed');
    expect(setupProgress(job({ percent: 140 })).percent).toBe(100);
    const zh = boardDictionary('zh-CN');
    expect(setupProgress(job({ phase: 'browser', totalMB: 95.3 }), zh).text).toBe('正在下载 Chromium（95 MB）…');
    expect(zh.board.installExportComponent(100)).toBe('安装导出组件（约 100 MB）');
  });

  const rt = (o: Partial<ExportRuntime>): ExportRuntime => ({ status: status(false), job: null, ready: false, installing: false, downloadMB: 100, command: 'npx joplo setup export', install: async () => undefined, markMissing: () => undefined, refresh: async () => undefined, ...o });
  const html = (r: ExportRuntime, locale: 'en' | 'zh-CN' = 'en') =>
    renderToStaticMarkup(
      <I18nProvider explicit={locale} extend={boardDictionary}>
        <ExportSetupCard rt={r} />
      </I18nProvider>,
    );

  it('未安装：说明（不装进项目）+「安装导出组件（约 N MB）」按钮 + 终端命令', () => {
    const out = html(rt({}));
    expect(out).toContain('Install export component (about 100 MB)');
    expect(out).toContain('not into your project');
    expect(out).toContain('npx joplo setup export');
    expect(html(rt({}), 'zh-CN')).toContain('安装导出组件（约 100 MB）');
  });

  it('安装中：进度条与“关掉菜单不会中断”；失败：原因 + 重试', () => {
    const running = html(rt({ job: job({ percent: 47 }), installing: true }));
    expect(running).toContain('aria-valuenow="47"');
    expect(running).toContain('Downloading Chromium (95 MB)…');
    expect(running).toContain('Closing this menu will not stop the installation');
    expect(running).not.toContain('data-testid="export-setup-install"');
    const failed = html(rt({ job: job({ status: 'error', phase: 'error', error: 'ECONNRESET' }) }));
    expect(failed).toContain('Could not install the export component: ECONNRESET');
    expect(failed).toContain(boardEnglish.board.retry);
  });
});

describe('请求', () => {
  it('安装请求：POST /__joplo/export-runtime/install，带本机令牌和 JSON；没有令牌时不发请求', async () => {
    vi.stubGlobal('document', { querySelector: () => ({ content: 'local-test-token' }) });
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ job: job({}) }), { status: 202 }));
    vi.stubGlobal('fetch', fetch);
    expect(await installExportRuntime()).toMatchObject({ ok: true, job: { id: 'j' } });
    expect(fetch.mock.calls[0]![0]).toBe('/__joplo/export-runtime/install');
    expect(fetch.mock.calls[0]![1]).toMatchObject({ method: 'POST', headers: { 'x-joplo-token': 'local-test-token', 'content-type': 'application/json' } });
    vi.stubGlobal('document', { querySelector: () => null });
    fetch.mockClear();
    expect((await installExportRuntime()).ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('状态读取；旧服务端（404）时为 null；图片导出失败带回错误码', async () => {
    vi.stubGlobal('document', { querySelector: () => ({ content: 'local-test-token' }) });
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ runtime: status(false), install: null }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response('{}', { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 'EXPORT_COMPONENT_MISSING', message: 'Run: npx joplo setup export' } }), { status: 503 }));
    vi.stubGlobal('fetch', fetch);
    expect(await fetchExportRuntime('p')).toEqual({ runtime: status(false), install: null });
    expect(fetch.mock.calls[0]![0]).toBe('/__joplo/p/p/export/runtime');
    expect(await fetchExportRuntime('p')).toBeNull();
    expect(await exportImage('p', { scenarioId: 's', position: 0, theme: 'sketch', locale: 'en' })).toEqual({ ok: false, code: 'EXPORT_COMPONENT_MISSING', message: 'Run: npx joplo setup export' });
  });
});
