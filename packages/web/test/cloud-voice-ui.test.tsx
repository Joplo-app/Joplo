/**
 * 看板里的 Joplo Cloud 账号卡片与声音浮层（D85，原型 examples/joplo 的 cloud_usage 方案 A）：
 * - 首页卡片：套餐、邮箱、空间（已用 / 上限）、朗读（免费写“体验额度”，Pro 写“本月 · 几号重置”）、“用量与音色 ↗”；
 *   没登录给登录命令；云端连不上时不显示数字；
 * - 声音浮层：Joplo Cloud 朗读排第一，右边写剩余字数（没登录写“登录后可用”并给登录命令）；OpenAI / ElevenLabs 没有 Key 写“没有密钥”；
 *   生成按钮写这次约用多少字，下面写生成后还剩多少；额度不够时说明并给“买加油包 ↗”；旧 profile 标“不再支持”，不能生成；
 * - 估算：只算缺音频的段、同一段只算一次，按 Array.from 计字。
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider } from '../src/i18n/context';
import { CloudAccountCard } from '../src/board/CloudAccountCard';
import { VoicePanel, type VoiceApi } from '../src/board/Voice';
import { canGenerate, cloudQuotaView, liveGenerate, sourceRows, voiceEstimate, voiceLabel, sampleUrl } from '../src/board/voice-model';
import { Narrator } from '../src/runtime/voice';
import type { CloudAccount, VoiceCloudView, VoiceProfileView, VoiceState } from '../src/runtime/dev-client';

const MB = 1024 * 1024;
const server = 'https://cloud.example';
const render = (node: React.ReactNode, locale: 'en' | 'zh-CN' = 'zh-CN') => renderToStaticMarkup(<I18nProvider explicit={locale}>{node}</I18nProvider>);
const quota = (left: number, extra: Partial<NonNullable<VoiceCloudView['quota']>> = {}) => ({ plan: 'free', period: 'trial' as const, allowanceChars: 5000, usedChars: 5000 - left, remainingChars: left, resetsAt: null, packs: [], totalRemainingChars: left, ...extra });

describe('首页的 Joplo Cloud 账号卡片', () => {
  it('免费版：套餐、邮箱、空间与朗读（体验额度），“用量与音色 ↗”去控制台的用量页', () => {
    const account: CloudAccount = { signedIn: true, server, email: 'lin@example.com', plan: 'free', storage: { usedBytes: Math.round(38.1 * MB), quotaBytes: 100 * MB }, voice: quota(3200) };
    const html = render(<CloudAccountCard account={account} />);
    expect(html).toContain('data-state="signed-in"');
    expect(html).toContain('免费版');
    expect(html).toContain('lin@example.com');
    expect(html).toContain('38.1 MB / 100 MB');
    expect(html).toContain('剩 3,200 字（体验额度）');
    expect(html).toContain(`href="${server}/usage"`);
    expect(html).toContain('用量与音色 ↗');
    expect(html).toContain('aria-valuenow="64"');
  });

  it('Pro：本月剩余与重置日期（加油包算在剩余里）', () => {
    const account: CloudAccount = { signedIn: true, server, email: 'jie@example.com', plan: 'pro', storage: { usedBytes: 2 * 1024 * MB, quotaBytes: 5 * 1024 * MB }, voice: quota(12000, { period: 'month', plan: 'pro', allowanceChars: 30000, remainingChars: 2000, resetsAt: '2026-12-01T00:00:00.000Z', packs: [{ remainingChars: 10000, expiresAt: '2027-11-01T00:00:00.000Z' }] }) };
    const html = render(<CloudAccountCard account={account} />, 'en');
    expect(html).toContain('Pro');
    expect(html).toContain('2 GB / 5 GB');
    expect(html).toMatch(/12,000 left this month · resets Dec 1/);
  });

  it('没登录：写一句说明和可复制的登录命令；云端连不上：不显示数字', () => {
    const out = render(<CloudAccountCard account={{ signedIn: false, server, loginCommand: 'npx joplo login' }} />);
    expect(out).toContain('data-state="signed-out"');
    expect(out).toContain('npx joplo login');
    const offline = render(<CloudAccountCard account={{ signedIn: true, server, email: 'lin@example.com', plan: null }} />);
    expect(offline).toContain('data-state="offline"');
    expect(offline).toContain('暂时连不上 Joplo Cloud');
    expect(offline).not.toContain('MB');
    expect(offline).not.toContain('/usage');
  });
});

const voices = ['narrator-warm-f', 'narrator-calm-m', 'bright-f'].map((id) => ({ id, name: id, gender: (id.endsWith('-m') ? 'male' : 'female') as 'male' | 'female', labels: { en: `Warm ${id}`, 'zh-CN': id === 'narrator-warm-f' ? '讲解 · 温和女声' : `音色 ${id}` }, samples: { 'zh-CN': `https://cdn.example/${id}.zh.mp3`, en: `https://cdn.example/${id}.en.mp3` } }));
const profile = (id: string, extra: Partial<VoiceProfileView> = {}): VoiceProfileView => ({ id, name: id === 'openai' ? 'OpenAI' : id === 'elevenlabs' ? 'ElevenLabs' : id === 'cloud' ? 'Joplo Cloud' : id, kind: (id === 'cloud' || id === 'openai' || id === 'elevenlabs' ? id : 'openai') as VoiceProfileView['kind'], preset: id, baseUrl: '', model: '', voice: id === 'cloud' ? 'narrator-warm-f' : 'marin', response: 'audio', key: { saved: false, hint: null, env: id === 'cloud' ? null : 'OPENAI_API_KEY', envSet: false }, voices: id === 'cloud' ? voices : [], removable: false, ...extra });
const profiles = [profile('cloud'), profile('openai'), profile('elevenlabs')];
const cloudOk: VoiceCloudView = { signedIn: true, server, loginCommand: null, available: true, quota: quota(3200), usageUrl: `${server}/usage`, exhausted: null };

function api(state: Partial<VoiceState>, opts: { have?: number; total?: number; steps?: number; chars?: number; list?: VoiceProfileView[] } = {}): Parameters<typeof VoicePanel>[0]['api'] {
  const narrator = new Narrator();
  narrator.locale = 'zh-CN';
  const full: VoiceState = { rev: 1, selected: null, source: 'default', missing: null, profile: profile('cloud'), voices: { narrator: 'fp', roles: {} }, narrator: 'narrator-warm-f', roles: {}, clips: {}, failures: {}, generating: null, cloud: cloudOk, ...state };
  const noop = async () => undefined;
  return {
    state: full, profiles: opts.list ?? profiles, on: true, setOn: () => undefined, browserVoice: null, setBrowserVoice: () => undefined, select: noop, setVoice: noop, generate: noop, busy: false, error: null,
    coverage: { have: opts.have ?? 17, total: opts.total ?? 18, failed: 0 }, estimate: { steps: opts.steps ?? 1, chars: opts.chars ?? 45 }, narrator, locale: 'zh-CN', contentLocale: null, lang: 'zh',
  } as unknown as Parameters<typeof VoicePanel>[0]['api'] & VoiceApi;
}
const order = (html: string) => [...html.matchAll(/data-testid="voice-source-([\w-]+)"/g)].map((m) => m[1]);

describe('声音浮层', () => {
  it('Joplo Cloud 朗读排第一、写剩余字数；按钮写这次约用多少字，下面写生成后还剩多少；旁白可试听', () => {
    const html = render(<VoicePanel api={api({})} onManage={() => undefined} />);
    expect(order(html)).toEqual(['cloud', 'browser', 'openai', 'elevenlabs']);
    expect(html).toContain('Joplo Cloud 朗读');
    expect(html).toContain('剩 3,200 字');
    expect(html).toContain('生成缺少的音频（1 步 · 约 45 字）');
    expect(html).toContain('生成后还剩 3,155 字');
    expect(html).toContain('旁白：讲解 · 温和女声');
    expect(html).toContain('data-testid="voice-preview"');
    expect(html).toContain(`href="${server}/usage"`);
    // OpenAI / ElevenLabs 没有 Key
    expect(html.match(/没有密钥/g)?.length).toBe(2);
    expect(html).toContain('管理密钥…');
    expect(html).not.toContain('AiHubMix');
  });

  it('没登录：写“登录后可用”，给可复制的登录命令；不显示生成按钮', () => {
    const html = render(<VoicePanel api={api({ cloud: { ...cloudOk, signedIn: false, loginCommand: 'npx joplo login', quota: null, usageUrl: null } })} onManage={() => undefined} />);
    expect(html).toContain('登录后可用');
    expect(html).toContain('data-testid="voice-login"');
    expect(html).toContain('npx joplo login');
    expect(html).not.toContain('data-testid="voice-generate"');
  });

  it('收到 402（或剩 0 字）：不显示生成按钮，说明还差多少、先用浏览器朗读，给“买加油包 ↗”', () => {
    const html = render(<VoicePanel api={api({ cloud: { ...cloudOk, quota: quota(0), exhausted: { neededChars: 160, remainingChars: 0 } } }, { have: 15, steps: 3, chars: 160 })} onManage={() => undefined} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain('朗读额度不够');
    expect(html).toContain('还有 3 步没有音频，约 160 字，剩 0 字。这几步先用浏览器朗读，演示照常播放。');
    expect(html).toContain(`href="${server}/usage"`);
    expect(html).toContain('买加油包 ↗');
    expect(html).not.toContain('data-testid="voice-generate"');
  });

  it('这次要用的字数比剩余多：照常给生成按钮，同时说明额度不够、用完会停', () => {
    const html = render(<VoicePanel api={api({ cloud: { ...cloudOk, quota: quota(100) } }, { have: 10, steps: 8, chars: 400 })} onManage={() => undefined} />);
    expect(html).toContain('data-testid="voice-generate"');
    expect(html).toContain('这次约需 400 字，只剩 100 字');
    expect(html).not.toContain('data-testid="voice-after"');
  });

  it('云端连不上：不写数字；旧 CLI 启动的看板：提示重启', () => {
    const offline = render(<VoicePanel api={api({ cloud: { ...cloudOk, available: false, quota: null, usageUrl: null } })} onManage={() => undefined} />);
    expect(offline).toContain('暂时连不上');
    expect(offline).not.toContain('剩 3,200');
    expect(render(<VoicePanel api={api({ cloud: null })} onManage={() => undefined} />)).toContain('需要重启 joplo dev');
  });

  it('选着不再支持的旧 profile：标出来，说明已生成的音频照常，不给生成按钮', () => {
    const legacy = profile('acme', { name: 'Acme Gateway', unsupported: true, removable: true });
    const html = render(<VoicePanel api={api({ profile: legacy, source: 'board', cloud: cloudOk }, { list: [...profiles, legacy] })} onManage={() => undefined} />);
    expect(order(html)).toEqual(['cloud', 'browser', 'openai', 'elevenlabs', 'acme']);
    expect(html).toContain('data-testid="voice-unsupported-acme"');
    expect(html).toContain('已经生成的音频照常播放');
    expect(html).not.toContain('data-testid="voice-generate"');
  });
});

describe('估算与额度', () => {
  it('voiceEstimate：缺音频的段，同一段只算一次，Array.from 计字', () => {
    const segs = [{ stepId: 'a', text: '你好 👋', role: null }, { stepId: 'b', text: ' 你好  👋', role: null }, { stepId: 'c', text: 'Hi', role: 'leo' }, { stepId: 'd', text: 'Done', role: null }];
    expect(voiceEstimate(segs, (s) => s.stepId === 'd')).toEqual({ steps: 2, chars: 4 + 2 });
  });
  it('cloudQuotaView：剩余来自服务端；after = 剩余 − 这次约用；402 或剩 0 时 out', () => {
    expect(cloudQuotaView(cloudOk, { chars: 45 })).toMatchObject({ left: 3200, after: 3155, short: false, out: false, trial: true });
    expect(cloudQuotaView({ ...cloudOk, quota: quota(10) }, { chars: 45 })).toMatchObject({ short: true, out: false, needed: 45 });
    expect(cloudQuotaView({ ...cloudOk, exhausted: { neededChars: 9, remainingChars: 2 } }, { chars: 9 })).toMatchObject({ out: true, needed: 9 });
    expect(cloudQuotaView({ ...cloudOk, signedIn: false }, { chars: 1 })).toBeNull();
    expect(cloudQuotaView(null, { chars: 1 })).toBeNull();
  });
  it('sourceRows 补上正在用、却不在列表里的旧 profile（例如从没存过的 AiHubMix）；音色名与样音按语言', () => {
    const ai = profile('aihubmix', { name: 'AiHubMix', unsupported: true });
    expect(sourceRows(profiles, ai).map((r) => r.id)).toEqual(['cloud', null, 'openai', 'elevenlabs', 'aihubmix']);
    expect(voiceLabel(voices[0], 'narrator-warm-f', 'ja')).toBe('Warm narrator-warm-f');
    expect(voiceLabel(undefined, 'x', 'en')).toBe('x');
    expect(sampleUrl(voices[1], 'zh-CN')).toBe('https://cdn.example/narrator-calm-m.zh.mp3');
    expect(sampleUrl(voices[1], 'fr')).toBe('https://cdn.example/narrator-calm-m.en.mp3');
  });
});

describe('评审修复：离线与现场生成（P1-4 / P1-6）', () => {
  it('云端连不上或旧云端 404：说明“暂时连不上，用浏览器朗读”，生成按钮不可用', () => {
    const html = render(<VoicePanel api={api({ cloud: { ...cloudOk, available: false, quota: null, usageUrl: null } })} onManage={() => undefined} />);
    expect(html).toContain('data-testid="voice-cloud-offline"');
    expect(html).toContain('没有音频的步骤用浏览器朗读');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*data-testid="voice-generate"|<button[^>]*data-testid="voice-generate"[^>]*disabled=""/);
    expect(canGenerate(profile('cloud'), { ...cloudOk, available: false })).toBe(false);
    expect(canGenerate(profile('cloud'), cloudOk)).toBe(true);
  });
  it('播放时现场生成与预取：只有自己的 Key（OpenAI / ElevenLabs），Joplo Cloud 朗读从不', () => {
    expect(liveGenerate(profile('cloud'), cloudOk)).toBe(false);
    expect(liveGenerate(profile('openai', { key: { saved: true, hint: '…1234', env: 'OPENAI_API_KEY', envSet: false } }), cloudOk)).toBe(true);
    expect(liveGenerate(profile('openai'), cloudOk)).toBe(false);
    expect(liveGenerate(profile('acme', { unsupported: true, key: { saved: true, hint: null, env: null, envSet: false } }), cloudOk)).toBe(false);
    expect(liveGenerate(null, cloudOk)).toBe(false);
  });
});
