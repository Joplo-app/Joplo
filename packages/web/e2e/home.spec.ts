/** 看板首页（D39）：一个进程、多个项目；最近打开、功能行、编译错误、找不到目录与移除、再次注册实时出现、空状态。 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHub, type Hub } from '../../server/src/dev.ts';
import { Registry } from '../../server/src/home.ts';
import { copyExample, expect, node, test } from './fixtures';

const tmp = (p: string) => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), p)));
const broken = () => {
  const d = tmp('joplo-broken-');
  fs.writeFileSync(path.join(d, 'joplo.config.ts'), "import { config } from '@tokenroll/joplo-kit';\nexport default config({ name: '网店结算' });\n");
  fs.mkdirSync(path.join(d, 'features/cart'), { recursive: true });
  fs.writeFileSync(path.join(d, 'features/cart/feature.ts'), "import { feature } from '@tokenroll/joplo-kit';\nexport default feature({ name: '购物车', goal: 'g', cases: {}, pick: 'c-fast' });\n");
  return d;
};

test.describe('首页', () => {
  let hub: Hub;
  let home: string;
  let invite: string;
  let shop: string;
  let gone: string;
  test.beforeAll(async () => {
    home = tmp('joplo-home-');
    invite = copyExample();
    shop = broken();
    gone = tmp('joplo-gone-');
    hub = await createHub({ port: 0, home, log: () => undefined });
    for (const d of [gone, shop, invite]) hub.addProject(d, { compile: d !== gone });
    fs.rmSync(gone, { recursive: true, force: true });
    await hub.ensure(hub.projects().find((p) => p.dir === invite)!.id);
  });
  test.afterAll(async () => {
    await hub.close();
    for (const d of [invite, shop]) fs.rmSync(d, { recursive: true, force: true });
  });

  test('最近打开的项目在左栏；右侧是所选项目的功能行，「查看」进入演示页', async ({ page }) => {
    await page.goto(hub.url);
    const list = page.getByTestId('project-list');
    await expect(list.locator('[data-testid^="home-project-"]')).toHaveCount(3);
    // 最近打开的在最上面，并默认选中
    await expect(list.locator('[data-testid^="home-project-"]').first()).toContainText('团队邀请功能');
    const row = page.getByTestId('feature-invite');
    await expect(row).toContainText('团队成员邀请');
    await expect(row).toContainText('2 个方案');
    await expect(row).toContainText('已选 A · 单人邮件邀请弹窗');
    await expect(page.getByTestId('feature-gaps-invite')).toHaveText('缺失 3 · 待决定 1');
    await page.getByTestId('view-invite').click();
    await node(page, 'btn_invite').waitFor();
    await expect(page.getByTestId('crumb-project')).toHaveText('团队邀请功能');
  });

  test('编译出错的项目：左栏显示错误数；进入后看到 文件:行 列表', async ({ page }) => {
    await page.goto(hub.url);
    const id = hub.projects().find((p) => p.dir === shop)!.id;
    const item = page.getByTestId(`home-project-${id}`);
    await expect(item).toHaveAttribute('data-status', 'error');
    await expect(item).toContainText(/\d+ 个错误/);
    await item.click();
    await expect(page.getByTestId('home-errors')).toContainText('编译失败');
    await expect(page.getByTestId('home-error-item').first()).toContainText(/features\/cart\/feature\.ts:\d+:\d+/);
    expect(page.url()).toBe(`${hub.url}#/${id}`);
  });

  test('目录不存在：显示“找不到目录”，可以从列表移除（只删记录）', async ({ page }) => {
    await page.goto(hub.url);
    const id = hub.projects().find((p) => p.dir === gone)!.id;
    const item = page.getByTestId(`home-project-${id}`);
    await expect(item).toContainText('找不到目录');
    await item.click();
    await expect(page.getByTestId('home-missing')).toContainText('已不存在');
    await page.getByTestId('remove-project').click();
    await expect(item).toHaveCount(0);
    expect(new Registry(home).list().map((r) => r.dir)).not.toContain(gone);
    expect(fs.existsSync(path.join(invite, 'joplo.config.ts'))).toBe(true);
  });

  test('另一个项目注册进来（再次 joplo dev）：不刷新页面就出现在左栏', async ({ page }) => {
    await page.goto(hub.url);
    await expect(page.getByTestId('feature-invite')).toBeVisible();
    await page.evaluate(() => ((window as any).__NO_RELOAD__ = true));
    const d = tmp('joplo-late-');
    fs.writeFileSync(path.join(d, 'joplo.config.ts'), "import { config } from '@tokenroll/joplo-kit';\nexport default config({ name: '后来的项目' });\n");
    const { id } = hub.addProject(d);
    await expect(page.getByTestId(`home-project-${id}`)).toContainText('后来的项目');
    expect(await page.evaluate(() => (window as any).__NO_RELOAD__)).toBe(true);
    fs.rmSync(d, { recursive: true, force: true });
  });
});

test('没有任何项目：空状态给出三条开始命令', async ({ page }) => {
  const hub = await createHub({ port: 0, home: tmp('joplo-home-'), log: () => undefined });
  try {
    await page.goto(hub.url);
    const empty = page.getByTestId('home-empty');
    await expect(empty).toContainText('还没有打开过项目');
    await expect(empty).toContainText('npx joplo init my-demo');
    await expect(empty).toContainText('npx joplo dev');
  } finally {
    await hub.close();
  }
});
