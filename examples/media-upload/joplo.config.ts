import { config } from '@joplo-app/kit';
import media from '@joplo-app/plugin-av';
import ui from '@joplo-app/plugin-ui';

export default config({
  name: '上传产品演示视频',
  description: '媒体插件原型（D96）：视频片段与 Lottie 动画跟着引擎时钟播放——暂停就停、倍速跟随、截图定位到终点帧。',
  theme: 'clean',
  plugins: [ui, media],
});
