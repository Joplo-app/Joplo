import { config } from '@joplo-app/kit';
import ui from '@joplo-app/plugin-ui';
import content from '@joplo-app/plugin-content';
import scene3d from '@joplo-app/plugin-3d';
import alda from '@joplo-app/plugin-alda';
import { scores } from './music';

export default config({
  name: "一颗苹果的旅程",
  theme: "journey",
  autoFocus: false,
  home: '/',
  plugins: [ui, content, scene3d, alda(scores)],
});
