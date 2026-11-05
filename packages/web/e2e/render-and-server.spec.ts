/**
 * renderStep（AC-22）与本地服务安全测试。
 * AC-22 的截图写入临时目录（不覆盖仓库中已跟踪的 docs/screenshots；文档截图只由 pnpm docs:screenshots 更新），
 * 同时生成手绘与线框两种主题。
 */
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { renderStep, startServer } from '@joplo/server';
import { copyExample, expect, test } from './fixtures';

const SHOTS = fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-e2e-shots-'));

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

  test('视口小于舞台：画框外的元素报“不在视口内”，不误报遮挡', async () => {
    const dir = copyExample();
    const r = await renderStep({ projectDir: dir, scenarioId: 'sc_a_success', out: path.join(dir, 'small.png'), viewport: { width: 800, height: 600 } });
    expect(r.warnings.filter((w) => w.startsWith('被遮挡'))).toEqual([]);
    expect(r.warnings.some((w) => w.startsWith('不在视口内'))).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('scale=2：box 仍是 CSS 像素，结果附带 scale', async () => {
    const dir = copyExample();
    const a = await renderStep({ projectDir: dir, scenarioId: 'sc_a_success', out: path.join(dir, 's1.png') });
    const b = await renderStep({ projectDir: dir, scenarioId: 'sc_a_success', out: path.join(dir, 's2.png'), scale: 2 });
    expect(a.scale).toBe(1);
    expect(b.scale).toBe(2);
    expect(b.elements.find((e) => e.id === 'btn_invite')!.box).toEqual(a.elements.find((e) => e.id === 'btn_invite')!.box);
    const png = fs.readFileSync(path.join(dir, 's2.png'));
    expect(png.readUInt32BE(16)).toBe(2560); // 截图像素 = CSS 像素 × scale
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('Toast 层（pointer-events:none）覆盖可交互元素时按几何相交报告', async () => {
    const dir = copyExample();
    const file = path.join(dir, 'project.joplo.json');
    const json = JSON.parse(fs.readFileSync(file, 'utf8'));
    json.scenes.scene_m = {
      id: 'scene_m', optionId: 'opt_a', name: '移动端', kind: 'proposed', viewport: 'mobile',
      root: { id: 'mpage', type: 'Page', props: { title: '设计团队' }, children: [
        { id: 'mimg', type: 'Image', props: { label: '占位', height: 690 } },
        { id: 'mbtn', type: 'Button', props: { label: '邀请', variant: 'primary' } },
      ] },
    };
    json.scenarios.sc_m = {
      id: 'sc_m', optionId: 'opt_a', name: '移动端', mock: { label: '模拟成功', outcome: 'success' },
      initial: { sceneId: 'scene_m', ui: {}, data: {}, inputs: {} },
      steps: [{ id: 'm1', kind: 'user', action: { type: 'click', target: 'mbtn' }, caption: '点击邀请', effects: [{ type: 'toast', text: '已发送邀请', tone: 'success' }] }],
    };
    fs.writeFileSync(file, JSON.stringify(json));
    const r = await renderStep({ projectDir: dir, scenarioId: 'sc_m', stepId: 'm1', out: path.join(dir, 'm.png') });
    expect(r.warnings.some((w) => w.includes('Toast') && w.includes('mbtn')), r.warnings.join('\n')).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('拒绝把截图写到 project.joplo.json 或 .joplo/ 内，即使 overwrite', async () => {
    const dir = copyExample();
    const before = fs.readFileSync(path.join(dir, 'project.joplo.json'));
    await expect(renderStep({ projectDir: dir, scenarioId: 'sc_a_success', out: path.join(dir, 'project.joplo.json'), overwrite: true })).rejects.toThrow(/不能写入/);
    await expect(renderStep({ projectDir: dir, scenarioId: 'sc_a_success', out: path.join(dir, '.joplo', 'x.png'), overwrite: true })).rejects.toThrow(/不能写入/);
    await expect(renderStep({ projectDir: dir, scenarioId: 'sc_a_success', out: path.join(dir, 'sub', '..', 'PROJECT.joplo.json'), overwrite: true })).rejects.toThrow(/不能写入/);
    expect(fs.readFileSync(path.join(dir, 'project.joplo.json')).equals(before)).toBe(true);
    expect(fs.existsSync(path.join(dir, '.joplo', 'x.png'))).toBe(false);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

test('startServer 使用项目快照时，接口返回快照而不是之后被改动的文件（renderStep 无 TOCTOU）', async () => {
  const dir = copyExample();
  const file = path.join(dir, 'project.joplo.json');
  const snapshot = JSON.parse(fs.readFileSync(file, 'utf8'));
  const s = await startServer({ projectDir: dir, port: 0, skipBuild: true, log: () => undefined, projectSnapshot: snapshot });
  const port = new URL(s.url).port;
  try {
    fs.writeFileSync(file, JSON.stringify({ ...snapshot, revision: 9, name: '被改过' }));
    const r = await rawRequest(`${s.url}api/project`, { headers: { host: `127.0.0.1:${port}` } });
    expect(JSON.parse(r.body)).toMatchObject({ revision: 1, project: { name: snapshot.name } });
  } finally {
    await s.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('startServer 监听失败（端口被占用）时不留下任何句柄', async () => {
  const dir = copyExample();
  const blocker = net.createServer();
  await new Promise<void>((r) => blocker.listen(0, '127.0.0.1', () => r()));
  const busyPort = (blocker.address() as net.AddressInfo).port;
  const count = () => process.getActiveResourcesInfo().filter((t) => t !== 'TTYWrap').sort().join(',');
  await new Promise((r) => setTimeout(r, 50));
  const before = count();
  await expect(startServer({ projectDir: dir, port: busyPort, skipBuild: true, log: () => undefined })).rejects.toThrow(/已被占用/);
  await new Promise((r) => setTimeout(r, 50));
  expect(count()).toBe(before);
  await new Promise<void>((r) => blocker.close(() => r()));
  fs.rmSync(dir, { recursive: true, force: true });
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
    // ..%2fpackage.json 解码后指向 packages/web/package.json（真实存在、在 dist 之外）
    const trav = await rawRequest(`${s.url}..%2fpackage.json`, { headers: { host: `127.0.0.1:${port}` } });
    expect(trav.status).toBe(404);
    expect(trav.body).not.toContain('@joplo/web');
    const trav2 = await rawRequest(`${s.url}assets%2f..%2f..%2fpackage.json`, { headers: { host: `127.0.0.1:${port}` } });
    expect(trav2.status).toBe(404);
    expect(trav2.body).not.toContain('@joplo/web');
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

test('selection 写接口：413、严格 Content-Type、对照当前项目校验、取消选中写 null', async () => {
  const dir = copyExample();
  const s = await startServer({ projectDir: dir, port: 0, skipBuild: true, log: () => undefined });
  const port = new URL(s.url).port;
  const H = { host: `127.0.0.1:${port}`, 'x-joplo-token': s.token };
  const base = { optionId: 'opt_a', scenarioId: 'sc_a_success', position: 1, stepId: 'a_s1_open', sceneId: 'scene_a_members', nodeId: 'sel_role', at: new Date().toISOString() };
  const put = (body: string, ct = 'application/json') => rawRequest(`${s.url}api/selection`, { method: 'PUT', headers: { ...H, 'content-type': ct }, body });
  const file = path.join(dir, '.joplo', 'selection.json');
  try {
    const big = await put(JSON.stringify({ ...base, pad: 'x'.repeat(70_000) }));
    expect(big.status).toBe(413);
    expect(JSON.parse(big.body).error.message).toMatch(/过大/);

    expect((await put(JSON.stringify(base), 'application/jsonx')).status).toBe(415);
    expect((await put(JSON.stringify(base), 'text/plain')).status).toBe(415);
    expect((await put(JSON.stringify(base), 'application/json; boundary=x')).status).toBe(415);
    expect((await put(JSON.stringify(base), 'application/json; charset=utf-8')).status).toBe(200);
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).nodeId).toBe('sel_role');

    const bad: [string, object][] = [
      ['方案不存在', { optionId: 'opt_x' }],
      ['场景不属于方案/不存在', { scenarioId: 'sc_nope' }],
      ['位置越界', { position: 9 }],
      ['stepId 与位置不符', { stepId: 'a_s3_role' }],
      ['画面与位置不符', { sceneId: 'scene_other' }],
      ['元素不在画面中', { nodeId: 'nope' }],
    ];
    for (const [why, patch] of bad) {
      const r = await put(JSON.stringify({ ...base, ...patch }));
      expect(r.status, why).toBe(409);
    }
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).nodeId, '非法请求不改动已有选中').toBe('sel_role');

    // 只选中步骤
    expect((await put(JSON.stringify({ ...base, nodeId: null }))).status).toBe(200);
    // 取消选中
    const clear = await put('null');
    expect(clear.status).toBe(200);
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toBeNull();
    const read = await rawRequest(`${s.url}api/selection`, { headers: { host: `127.0.0.1:${port}` } });
    expect(JSON.parse(read.body).selection).toBeNull();
  } finally {
    await s.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
