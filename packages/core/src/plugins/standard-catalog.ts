import { docs, examples } from '@joplo-app/plugin-diagram/catalog';
import { skill, diagnostics } from '@joplo-app/plugin-diagram/guide';
import { skill as contentSkill } from '@joplo-app/plugin-content/guide';
export const standardGuides = { diagram: skill, content: contentSkill };
export const standardDocs = Object.fromEntries(Object.entries(docs).map(([k, v]) => [`diagram:${k}`, v]));
export const standardExamples = Object.fromEntries(Object.entries(examples).map(([k, v]) => [`diagram:${k}`, v]));
export const standardAliases = Object.fromEntries(Object.keys(docs).map(k => [k, `diagram:${k}`]));

export const standardChecks = diagnostics;
