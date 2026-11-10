import { config } from '@joplo-app/kit';
import ui from '@joplo-app/plugin-ui';
import diagram from '@joplo-app/plugin-diagram';
import content from '@joplo-app/plugin-content';
import alda from '@joplo-app/plugin-alda';

export default config({
  name: "__PROJECT_NAME__",
  layout: 'app',
  home: '/',
  plugins: [ui, diagram, content, alda({})],
});
