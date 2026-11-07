import { config } from '@joplo-app/kit';

export default config({
  name: 'Joplo 导演模式朗读（TTS）',
  description: '用 Joplo 设计 Joplo：自动播放时把字幕读出来。默认用浏览器朗读，不用配置；想要统一音色时接外部供应商、提前生成音频。核心规则：文字的停留时间到了、声音还没读完，就等声音读完。第一期只做网页，视频带声音放第二期。',
  home: '/',
});
