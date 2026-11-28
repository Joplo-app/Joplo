import { compile, type AuthoringProject } from '@joplo-app/core';
import { config, feature, flow, page, work, type Flow, type WorkDef } from '@joplo-app/kit';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import ui from '../src/plugin.ts';

export const h = (type: unknown, props: Record<string, unknown> = {}, ...children: unknown[]) => jsx(type, { ...props, children });
export const scenario = 'f.a.show';

export function build(tree: ReturnType<typeof jsx>, steps: Flow = flow('Show', { start: '/' }), state?: WorkDef['state']) {
  const input: AuthoringProject = {
    root: '/p', layouts: {},
    config: { ...config({ name: 'Example', plugins: [ui] }), file: '/p/joplo.config.ts' },
    routes: { '/': { ...page({ title: 'Home', layout: false }, tree), file: '/p/routes/page.tsx' } },
    features: { f: {
      def: { ...feature({ name: 'F', goal: 'Compare', cases: {}, pick: 'a' }), file: '/p/features/f/feature.ts' },
      works: { a: { ...work({ title: 'A', summary: 'Compare', state, scenarios: { show: steps } }), file: '/p/features/f/works/a.tsx' } },
    } },
  };
  return compile(input, 'dev');
}
