import '../../../scripts/test/render-fixtures.ts';
/**
 * 发布浮层里的账号容量（C27，原型 storage_quota 方案 B）：
 * - 用量不到八成：只有一行小字“已用 … / … · 链接永久有效”，没有用量条；
 * - 八成以上：黄色用量条 + “空间快满了”，免费版给“管理我的分享”和“升级 Pro”，Pro 只给“管理”；
 * - 这次放不下：红色提示写清差多少、已有链接不受影响，链接用 CLI 给的当前 server 地址；
 * - 没有容量数据（旧云端、连不上）：什么都不画。
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider } from '../src/i18n/context';
import { StorageFull, StorageUsage } from '../src/board/CloudPublish';

const MB = 1024 * 1024;
const server = 'https://cloud.example';
const render = (node: React.ReactNode, locale: 'en' | 'zh-CN' = 'en') => renderToStaticMarkup(<I18nProvider explicit={locale}>{node}</I18nProvider>);

describe('StorageUsage', () => {
  it('不到八成：一行小字，没有用量条和提醒', () => {
    const html = render(<StorageUsage storage={{ usedBytes: 38 * MB, quotaBytes: 100 * MB }} server={server} plan="free" full={false} />, 'zh-CN');
    expect(html).toContain('data-testid="cloud-storage-mini"');
    expect(html).toContain('已用 38 MB / 100 MB · 链接永久有效');
    expect(html).not.toContain('cloud-storage-meter');
  });
  it('八成以上：黄色用量条与提醒；免费版两个入口，Pro 只有管理', () => {
    const free = render(<StorageUsage storage={{ usedBytes: Math.round(82.6 * MB), quotaBytes: 100 * MB }} server={server} plan="free" full={false} />);
    expect(free).toMatch(/data-testid="cloud-storage-meter" data-level="near"/);
    expect(free).toContain('aria-valuenow="83"');
    expect(free).toContain('Storage is almost full');
    expect(free).toContain(`href="${server}/shares"`);
    expect(free).toContain(`href="${server}/settings/billing"`);
    const pro = render(<StorageUsage storage={{ usedBytes: 4.5 * 1024 * MB, quotaBytes: 5 * 1024 * MB }} server={server} plan="pro" full={false} />);
    expect(pro).toContain('4.5 GB / 5 GB');
    expect(pro).toContain(`href="${server}/shares"`);
    expect(pro).not.toContain('settings/billing');
    expect(pro).not.toContain('upgrade to Pro');
  });
  it('这次放不下时用量条变红，即使用量本身不到八成', () => {
    const html = render(<StorageUsage storage={{ usedBytes: 10 * MB, quotaBytes: 100 * MB }} server={server} plan="free" full />);
    expect(html).toMatch(/data-level="over"/);
    expect(html).not.toContain('cloud-storage-mini');
  });
  it('没有容量数据就什么都不画', () => {
    expect(render(<StorageUsage storage={undefined} server={server} plan="free" full={false} />)).toBe('');
  });
});

describe('StorageFull', () => {
  const links = { manageUrl: `${server}/shares`, upgradeUrl: `${server}/settings/billing` };
  it('新建：写需要多少、还剩多少、还差多少；已有链接不受影响', () => {
    const html = render(<StorageFull full={{ ...links, usedBytes: Math.round(95.9 * MB), quotaBytes: 100 * MB, shareBytes: Math.round(12.4 * MB), replacedBytes: 0 }} plan="free" />, 'zh-CN');
    expect(html).toContain('role="alert"');
    expect(html).toContain('空间不够，这次没有发布');
    expect(html).toContain('这次需要 12.4 MB，只剩 4.1 MB（还差 8.3 MB）。');
    expect(html).toContain('已经发出去的链接都不受影响。');
    expect(html).toContain(`href="${server}/settings/billing"`);
  });
  it('更新：写多占多少；Pro 不给升级入口；数字缺了给通用说明', () => {
    const update = render(<StorageFull full={{ ...links, usedBytes: 5 * 1024 * MB, quotaBytes: 5 * 1024 * MB, shareBytes: 70 * MB, replacedBytes: 60 * MB }} plan="pro" />);
    expect(update).toContain('This update adds 10 MB, but only 0 MB is left.');
    expect(update).not.toContain('settings/billing');
    expect(render(<StorageFull full={links} plan="free" />)).toContain('There isn&#x27;t enough storage left for this share.');
  });
});
