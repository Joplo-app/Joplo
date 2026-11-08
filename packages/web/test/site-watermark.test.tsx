/**
 * 发布站水印（D83）：
 * - 只有页面里有 <meta name="joplo-branding" content="off">（Joplo Cloud 给 Pro 创作者的分享注入）才去掉；缺省、其他值、本地 build 一律带；
 * - 水印是舞台右上角的一个小 Joplo 图标，点击在新标签页打开 joplo.app；
 * - 看板（不传 watermark）没有水印；导出走 RenderApp，不经过这里；
 * - 嵌入沿用控制条上的「Made with Joplo」，branding 关掉时一起去掉。
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider } from '../src/i18n/context';
import { StageViewport } from '../src/player/StageViewport';
import { BRANDING_META, readBranding } from '../src/site/branding';
import { JOPLO_SITE_URL } from '../src/player/PlayerPage';

const doc = (html: string) => {
  const metas = [...html.matchAll(/<meta\s+name="([^"]*)"\s+content="([^"]*)"\s*\/?>/g)].map(([, name, content]) => ({ name, content }));
  return {
    querySelector: (sel: string) => {
      const name = sel.match(/name="([^"]+)"/)?.[1];
      const m = metas.find((x) => x.name === name);
      return m ? { getAttribute: (a: string) => (a === 'content' ? m.content : null) } : null;
    },
  } as unknown as Document;
};

describe('readBranding', () => {
  it('缺省带水印；只有 content="off"（不分大小写、可带空格）才去掉', () => {
    expect(BRANDING_META).toBe('joplo-branding');
    expect(readBranding(doc(''))).toBe(true);
    expect(readBranding(doc('<meta name="joplo-branding" content="on">'))).toBe(true);
    expect(readBranding(doc('<meta name="joplo-branding" content="">'))).toBe(true);
    expect(readBranding(doc('<meta name="joplo-branding" content="nope">'))).toBe(true);
    expect(readBranding(doc('<meta name="joplo-branding" content="off">'))).toBe(false);
    expect(readBranding(doc('<meta name="joplo-branding" content=" OFF ">'))).toBe(false);
    expect(readBranding(doc('<meta name="other" content="off">'))).toBe(true);
  });
  it('没有 document（SSR、Node）时带水印', () => {
    expect(readBranding(undefined)).toBe(true);
  });
});

const stage = (watermark?: { href: string; label: string }, video = false) =>
  renderToStaticMarkup(
    <I18nProvider explicit="en">
      <StageViewport viewport="desktop" notice={null} onDismiss={() => {}} watermark={watermark} video={video}>
        {() => <div>demo</div>}
      </StageViewport>
    </I18nProvider>,
  );

describe('舞台水印', () => {
  it('传 watermark 时，舞台右上角是一个在新标签页打开 joplo.app 的小 Joplo 图标', () => {
    const html = stage({ href: JOPLO_SITE_URL, label: 'Made with Joplo' });
    const tag = html.match(/<a[^>]*data-testid="stage-watermark"[^>]*>/)?.[0] ?? '';
    expect(tag).toContain('href="https://joplo.app/"');
    expect(tag).toContain('target="_blank"');
    expect(tag).toContain('rel="noopener noreferrer"');
    expect(tag).toContain('aria-label="Made with Joplo"');
    expect(tag).toMatch(/class="[^"]*\bright-3\b[^"]*\btop-3\b/);
    // 只有图标，没有文字
    const inner = html.split('data-testid="stage-watermark"')[1]!.split('</a>')[0]!.replace(/^[^>]*>/, '');
    expect(inner).toContain('<svg');
    expect(inner.replace(/<[^>]+>/g, '').trim()).toBe('');
  });
  it('水印在幕布（过渡卡、封面，z-15）之上，在提示（z-20）之下', () => {
    const tag = stage({ href: JOPLO_SITE_URL, label: 'Made with Joplo' }).match(/<a[^>]*data-testid="stage-watermark"[^>]*>/)?.[0] ?? '';
    expect(tag).toContain('z-[16]');
  });
  it('手机上看（video）时图标更小', () => {
    const size = (html: string) => Number(html.split('data-testid="stage-watermark"')[1]!.match(/<svg[^>]*width="(\d+)"/)![1]);
    expect(size(stage({ href: JOPLO_SITE_URL, label: 'x' }, true))).toBeLessThan(size(stage({ href: JOPLO_SITE_URL, label: 'x' })));
  });
  it('不传 watermark（看板、Pro 分享）就没有', () => {
    expect(stage()).not.toContain('stage-watermark');
  });
});
