/**
 * 手动检查 Joplo Cloud 朗读（D85）用的模拟云端：/api/v1/me（含 storage）、/api/v1/voice（额度与 6 个音色）、/api/v1/voice/speech（按 Array.from 扣字数，
 * 不够时 402 TTS_QUOTA_EXCEEDED）。只给本机看板与 CLI 用，不是测试的一部分，也不是 Cloud 的实现。
 *
 *   LEFT=3200 node scripts/dev/mock-cloud-voice.mjs          # 端口 4799；LEFT 是剩余字数（设 0 看“额度不够”）
 *   JOPLO_HOME=<临时目录> JOPLO_CLOUD_URL=http://127.0.0.1:4799 pnpm joplo dev <项目>
 * 登录：在 <临时目录>/credentials.json 写 {"server":"http://127.0.0.1:4799","accessToken":"tok-mock","user":{"id":"u","email":"lin@example.com"},"createdAt":"2026-11-08T00:00:00.000Z"}（权限 0600）。
 */
import { createServer } from 'node:http';
const ids = ['narrator-warm-f', 'narrator-calm-m', 'bright-f', 'friendly-m', 'clear-f', 'deep-m'];
const zh = { 'narrator-warm-f': '讲解 · 温和女声', 'narrator-calm-m': '讲解 · 沉稳男声', 'bright-f': '明亮女声', 'friendly-m': '亲切男声', 'clear-f': '清晰女声', 'deep-m': '低沉男声' };
let left = Number(process.env.LEFT ?? 3200);
const mp3 = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(400, 0)]);
createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString() || '{}') : {};
  const json = (v, s = 200) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(JSON.stringify(v)); };
  console.log(req.method, req.url, JSON.stringify(body).slice(0, 120));
  if (req.url === '/api/v1/me') return json({ user: { id: 'u', email: 'lin@example.com', name: 'Lin' }, plan: 'free', limits: { maxUploadBytes: 1e8, maxTotalBytes: 1e8, maxFiles: 2000, publishesPerHour: 30 }, storage: { usedBytes: Math.round(38.1 * 1048576), quotaBytes: 100 * 1048576 } });
  if (req.url === '/api/v1/voice') return json({ model: 'mock', defaultVoice: 'narrator-warm-f', quota: { plan: 'free', period: 'trial', allowanceChars: 5000, usedChars: 5000 - left, remainingChars: left, resetsAt: null, packs: [], totalRemainingChars: left },
    voices: ids.map((id) => ({ id, gender: id.endsWith('-m') ? 'male' : 'female', labels: { en: id, 'zh-CN': zh[id] }, samples: {} })), recommended: { 'zh-CN': ['narrator-warm-f', 'narrator-calm-m'] } });
  if (req.url === '/api/v1/voice/speech') {
    const n = Array.from(String(body.text ?? '')).length;
    if (n > left) return json({ code: 'TTS_QUOTA_EXCEEDED', message: 'quota', data: { neededChars: n, remainingChars: left, usagePath: '/usage' } }, 402);
    left -= n;
    res.writeHead(200, { 'content-type': 'audio/mpeg', 'x-joplo-chars-charged': String(n), 'x-joplo-chars-remaining': String(left), 'x-joplo-cache': 'miss' });
    return res.end(mp3);
  }
  json({ code: 'NOT_FOUND' }, 404);
}).listen(4799, '127.0.0.1', () => console.log('mock on 4799'));
