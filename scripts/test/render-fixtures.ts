/** SSR tests opt into the same runtimes their fixture config explicitly enables. */
import { registerPluginRuntime } from '../../packages/web/src/renderer/plugins';
import ui from '../../plugins/ui/src/runtime';
import diagram from '../../plugins/diagram/src/runtime';
import content from '../../plugins/content/src/runtime';
for(const runtime of [ui,diagram,content])registerPluginRuntime(runtime);
