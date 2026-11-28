import '../../../scripts/test/render-fixtures.ts';
import { compile, stateAt, type Project } from '@joplo-app/core';
import { config, work, type JNode, type WorkDef } from '@joplo-app/kit';
import type { PluginDef } from '@joplo-app/kit/plugin';
import { renderToStaticMarkup } from 'react-dom/server';
import { Stage } from '../../../packages/web/src/renderer/Stage';
import { I18nProvider } from '../../../packages/web/src/i18n/context';

export function compileStage(plugin: PluginDef, stage: JNode, state: WorkDef['state'], script: WorkDef['scenarios'][string]) {
  const demo = work({ title: 'Demo', summary: 'Plugin stage', stage, state, scenarios: { show: script } });
  return compile({ root: '/p', config: { ...config({ name: 'test', plugins: [plugin] }), file: 'joplo.config.ts' }, routes: {}, layouts: {}, features: {}, works: { demo: { ...demo, file: 'works/demo.tsx' } } }, 'dev');
}

export function renderStage(project: Project, position: number, data?: Record<string, unknown>) {
  const state = stateAt(project, 'demo.show', position);
  state.data = { ...state.data, ...data };
  return renderToStaticMarkup(<I18nProvider explicit="en"><Stage project={project} sceneId={project.works.demo!.layers!.stage!.sceneId} state={state} theme="sketch" mode="render" animate={false} /></I18nProvider>);
}
