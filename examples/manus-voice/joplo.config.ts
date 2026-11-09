import { config } from '@joplo-app/kit';
import content from '@joplo-app/plugin-content';
import ui from '@joplo-app/plugin-ui';

export default config({
  name: 'Manus 语音输入',
  locales: ['zh-CN', 'en', 'ja'],
  description: '产品录屏风格的功能演示：你说的话，会实时写在光标处。',
  theme: 'voice',
  // 产品录屏风格：画面自己会说明变化，不要引擎自动加的聚焦框
  autoFocus: false,
  // 两个声音：旁白讲解，“我”是在对着输入框说话的人（say(…, { role: 'me' })）
  voice: { narrator: 'narrator-warm-f', roles: { me: 'friendly-m' } },
  plugins: [ui, content],
});
