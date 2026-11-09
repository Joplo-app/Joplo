/** Standard author manifests, kept out of browser imports. No component vocabulary lives here. */
import ui from '@joplo-app/plugin-ui';
import diagram from '@joplo-app/plugin-diagram';
import content from '@joplo-app/plugin-content';
import type { PluginComponentSpec } from '@joplo-app/kit/plugin';
import { skill as uiSkill } from '@joplo-app/plugin-ui/guide';
import { skill, diagnostics } from '@joplo-app/plugin-diagram/guide';
import { skill as contentSkill } from '@joplo-app/plugin-content/guide';
export const standardGuides = { diagram: skill, content: contentSkill, ui: uiSkill };
export const standardComponents: Record<string, PluginComponentSpec> = Object.fromEntries([ui, diagram, content].flatMap(p => Object.entries(p.components).map(([name,c]) => [`${p.id}:${name}`, c])));
export const standardDocs = Object.fromEntries(Object.entries(standardComponents).map(([name,c])=>[name,c.doc]));
export const standardExamples = Object.fromEntries(Object.entries(standardComponents).filter(([,c])=>c.example).map(([name,c])=>[name,c.example!]));
export const standardAliases = Object.fromEntries(Object.keys(standardComponents).map(name=>[name.split(':')[1]!,name]));
export const standardChecks = diagnostics;
