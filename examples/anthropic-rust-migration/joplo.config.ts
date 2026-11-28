import { config } from '@joplo-app/kit';
import content from '@joplo-app/plugin-content';
import diagram from '@joplo-app/plugin-diagram';
import ui from '@joplo-app/plugin-ui';
import viz from '@joplo-app/plugin-viz';

export default config({
  name: 'Anthropic Messages API Rust 迁移校验机制',
  theme: 'diagram:juice',
  plugins: [ui, content, diagram, viz],
});
