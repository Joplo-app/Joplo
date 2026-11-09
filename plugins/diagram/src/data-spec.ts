import type { PluginDataSpec, PluginScopeRule } from '@joplo-app/kit/plugin';
const map = (path: string[], extra: Partial<PluginScopeRule> = {}): PluginScopeRule => ({ path, kind: 'map', ...extra });
const items = (name: string, links = false): PluginScopeRule => ({ path: ['structure', name], kind: 'items', references: links ? [['id'], ['from'], ['to']] : [['id']] });
export const dataSpec: PluginDataSpec = {
  node: {
    text: ['nodes', 'groups', 'actors', 'messages', 'edges', 'blocks'].flatMap(name => ['label', 'description'].map(key => ['structure', name, '*', key])),
    scope: [
      ...['nodes', 'groups', 'actors', 'blocks'].map(name => items(name)), items('edges', true), items('messages', true),
      ...['nodes', 'groups', 'titles', 'actors', 'lifelines', 'messages', 'blocks', 'blockTitles', 'starts'].map(key => map(['layout', key])),
      map(['layout', 'edges'], { prefix: '__start:' }),
    ],
  },
  step: {
    scope: [
      map(['scenes'], { domain: 'scene', children: [
        map(['states']), { path: ['now'], kind: 'values' },
        map(['machines'], { children: [map(['states']), { path: ['current'], kind: 'reference' }] }),
        { path: ['traces'], kind: 'items', references: [['nodes', '*'], ['edges', '*', 'id'], ['groups', '*'], ['errorGroups', '*'], ['targets', '*']] },
      ] }),
    ],
  },
};
