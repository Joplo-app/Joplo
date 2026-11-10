/** 固定基线输入：不含影片，源位置也不依赖 checkout 的绝对路径。 */
import { $, config, feature, flow, Fragment, work, page, set } from '@joplo-app/kit';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import type { AuthoringProject } from '../../src/compile.ts';

export function workDemoBaseline(): AuthoringProject {
  const scenario = flow('Opening', { start: '/', cases: ['main'], expected: 'Ready' })
    .system('Open', 'Opening the demo', set($.ui.ready, true));
  Object.assign(scenario, { source: '/p/features/demo/works/a.tsx:4:1' });
  scenario.steps[0]!.source = '/p/features/demo/works/a.tsx:5:1';
  return {
    root: '/p',
    config: { ...config({ name: 'Existing demo' }), file: 'joplo.config.ts', source: '/p/joplo.config.ts:2:1' },
    layouts: {},
    routes: { '/': { ...page({ title: 'Home', layout: false }, jsx(Fragment, { children: 'Home' })), file: 'routes/page.tsx', source: '/p/routes/page.tsx:2:1' } },
    features: { demo: {
      def: { ...feature({ name: 'Existing feature', goal: 'Existing goal', cases: { main: 'Main' }, pick: 'a' }), file: 'features/demo/feature.ts', source: '/p/features/demo/feature.ts:2:1' },
      works: { a: { ...work({ title: 'A', summary: 'Existing idea', scenarios: { opening: scenario } }), file: 'features/demo/works/a.tsx', source: '/p/features/demo/works/a.tsx:2:1' } },
    } },
  };
}
