/**
 * renderStep（AC-22）与本地服务安全测试。
 * AC-22 的截图写入 docs/screenshots/，同时生成手绘与线框两种主题。
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { renderStep, startServer } from '@joplo/server';
import { copyExample, expect, ROOT, test } from './fixtures';

const SHOTS = path.join(ROOT, 'docs/screenshots');

test.describe('AC-22 renderStep', () => {
  const cases = [
    { name: 'success-0-initial', stepId: undefined, expectVisible: ['btn_invite', 'tbl_members', 'tbl_pending'], expectHidden: ['dlg_invite'] },
    { name: 'success-1-dialog-open', stepId: 'a_s1_open', expectVisible: ['dlg_invite', 'in_email', 'sel_role', 'btn_send', 'btn_cancel'], expectHidden: ['alert_send_error'] },
    { name: 'success-5-toast', stepId: 'a_s5_ok', expectVisible: ['tbl_pending'], expectHidden: ['dlg_invite'] },
  ];
  for (const theme of ['sketch', 'clean'] as const) {
    for (const c of cases) {
      test(`${c.name} · ${theme} 无告警`, async () => {
        const dir = copyExample();
        const out = path.join(SHOTS, `${c.name}.${theme}.png`);
        const r = await renderStep({ projectDir: dir, scenarioId: 'sc_a_success', stepId: c.stepId, theme, out, overwrite: true });
        expect(r.warnings).toEqual([]);
        expect(r.path).toBe(out);
        expect(fs.statSync(out).size).toBeGreaterThan(10_000);
        expect(r.sceneId).toBe('scene_a_members');
        for (const id of c.expectVisible) expect(r.elements.find((e) => e.id === id)?.visible, `${id} 应可见`).toBe(true);
        for (const id of c.expectHidden) expect(r.elements.find((e) => e.id === id)?.visible, `${id} 应隐藏`).toBe(false);
        const btn = r.elements.find((e) => e.id === 'btn_invite')!;
        expect(btn).toMatchObject({ type: 'Button', label: '邀请成员', disabled: false });
        if (c.name === 'success-1-dialog-open') {
          expect(r.position).toBe(1);
          expect(r.elements.find((e) => e.id === 'btn_send')?.box.width).toBeGreaterThan(40);
        }
        fs.rmSync(dir, { recursive: true, force: true });
      });
    }
  }

  test('无权限场景的禁用按钮出现在索引中且 disabled=true；目标已存在时拒绝覆盖', async () => {
    const dir = copyExample();
    const out = path.join(dir, 'shots', 'denied.png');
    const r = await renderStep({ projectDir: dir, scenarioId: 'sc_a_denied', out });
    expect(r.warnings).toEqual([]);
    expect(r.elements.find((e) => e.id === 'btn_invite')).toMatchObject({ visible: true, disabled: true });
    await expect(renderStep({ projectDir: dir, scenarioId: 'sc_a_denied', out })).rejects.toThrow(/已存在/);
    await expect(renderStep({ projectDir: dir, scenarioId: 'sc_a_success', optionId: 'opt_x', out: path.join(dir, 'x.png') })).rejects.toThrow(/不属于/);
    await expect(renderStep({ projectDir: dir, scenarioId: 'sc_a_success', stepId: 'nope', out: path.join(dir, 'y.png') })).rejects.toThrow(/不在场景/);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('渲染告警：标签文字溢出会被报告', async () => {
    const dir = copyExample();
    const file = path.join(dir, 'project.joplo.json');
    const json = JSON.parse(fs.readFileSync(file, 'utf8'));
    // 构造一个超长按钮标签（按钮最大宽度 260px，文字会溢出）
    json.scenes.scene_a_members.root.children[0].children[1].children[0].children[1].props.label = '邀请成员'.repeat(20);
    fs.writeFileSync(file, JSON.stringify(json));
    const r = await renderStep({ projectDir: dir, scenarioId: 'sc_a_success', out: path.join(dir, 'w.png') });
    expect(r.warnings.some((w) => w.startsWith('标签文字溢出'))).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

function rawRequest(url: string, opts: { method?: string; headers?: Record<string, string>; body?: string }): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request({ host: '127.0.0.1', port: u.port, path: u.pathname, method: opts.method ?? 'GET', headers: opts.headers }, (res) => {
      let b = '';
      res.on('data', (d) => (b += d));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: b }));
    });
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

test('安全：错误 Host 头、无令牌 PUT、跨源 PUT 都被拒绝；合法写入成功', async () => {
  const dir = copyExample();
  const s = await startServer({ projectDir: dir, port: 0, skipBuild: true, log: () => undefined });
  const port = new URL(s.url).port;
  const sel = JSON.stringify({ optionId: 'opt_a', scenarioId: 'sc_a_success', position: 0, stepId: null, sceneId: 'scene_a_members', nodeId: 'btn_invite', at: new Date().toISOString() });
  const json = { 'content-type': 'application/json' };
  try {
    expect((await rawRequest(`${s.url}api/project`, { headers: { host: 'evil.example.com' } })).status).toBe(403);
    expect((await rawRequest(`${s.url}api/project`, { headers: { host: `127.0.0.1:${Number(port) + 1}` } })).status).toBe(403);
    expect((await rawRequest(`${s.url}`, { headers: { host: 'attacker.test:' + port } })).status).toBe(403);

    const ok = await rawRequest(`${s.url}api/project`, { headers: { host: `localhost:${port}` } });
    expect(ok.status).toBe(200);
    expect(JSON.parse(ok.body).revision).toBe(1);

    const noToken = await rawRequest(`${s.url}api/selection`, { method: 'PUT', headers: { host: `127.0.0.1:${port}`, ...json }, body: sel });
    expect(noToken.status).toBe(401);
    const badToken = await rawRequest(`${s.url}api/selection`, { method: 'PUT', headers: { host: `127.0.0.1:${port}`, 'x-joplo-token': 'x'.repeat(48), ...json }, body: sel });
    expect(badToken.status).toBe(401);
    const crossOrigin = await rawRequest(`${s.url}api/selection`, { method: 'PUT', headers: { host: `127.0.0.1:${port}`, origin: 'https://evil.example.com', 'x-joplo-token': s.token, ...json }, body: sel });
    expect(crossOrigin.status).toBe(403);
    const badBody = await rawRequest(`${s.url}api/selection`, { method: 'PUT', headers: { host: `127.0.0.1:${port}`, 'x-joplo-token': s.token, ...json }, body: '{"nodeId":"../../etc"}' });
    expect(badBody.status).toBe(400);
    expect(fs.existsSync(path.join(dir, '.joplo', 'selection.json'))).toBe(false);

    const good = await rawRequest(`${s.url}api/selection`, { method: 'PUT', headers: { host: `127.0.0.1:${port}`, origin: `http://127.0.0.1:${port}`, 'x-joplo-token': s.token, ...json }, body: sel });
    expect(good.status).toBe(200);
    expect(JSON.parse(fs.readFileSync(path.join(dir, '.joplo', 'selection.json'), 'utf8')).nodeId).toBe('btn_invite');
    const read = await rawRequest(`${s.url}api/selection`, { headers: { host: `127.0.0.1:${port}` } });
    expect(JSON.parse(read.body).selection.nodeId).toBe('btn_invite');

    // 令牌以 meta 标签注入页面；路径穿越拿不到构建目录外的文件
    const html = await rawRequest(s.url, { headers: { host: `127.0.0.1:${port}` } });
    expect(html.body).toContain(`<meta name="joplo-token" content="${s.token}"`);
    const trav = await rawRequest(`${s.url}..%2f..%2fpackage.json`, { headers: { host: `127.0.0.1:${port}` } });
    expect(trav.body).not.toContain('"name": "@joplo/web"');
    // 服务不写 project.joplo.json
    const before = fs.readFileSync(path.join(dir, 'project.joplo.json'), 'utf8');
    expect((await rawRequest(`${s.url}api/project`, { method: 'PUT', headers: { host: `127.0.0.1:${port}`, 'x-joplo-token': s.token, ...json }, body: '{}' })).status).toBe(405);
    expect(fs.readFileSync(path.join(dir, 'project.joplo.json'), 'utf8')).toBe(before);
  } finally {
    await s.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('服务只监听 127.0.0.1', async () => {
  const dir = copyExample();
  const s = await startServer({ projectDir: dir, port: 0, skipBuild: true, log: () => undefined });
  expect(s.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
  await s.close();
  await expect(startServer({ projectDir: dir, port: 0, skipBuild: true, host: '0.0.0.0' as '127.0.0.1', log: () => undefined })).rejects.toThrow(/127\.0\.0\.1/);
  fs.rmSync(dir, { recursive: true, force: true });
});
