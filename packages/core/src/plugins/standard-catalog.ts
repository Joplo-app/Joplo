import { docs, examples } from '../../../../plugins/diagram/src/catalog.ts';
import { skill, diagnostics } from '../../../../plugins/diagram/src/guide.ts';
export const standardGuides = { diagram: skill };
export const standardDocs = Object.fromEntries(Object.entries(docs).map(([k, v]) => [`diagram:${k}`, v]));
export const standardExamples = Object.fromEntries(Object.entries(examples).map(([k, v]) => [`diagram:${k}`, v]));
export const standardAliases = Object.fromEntries(Object.keys(docs).map(k => [k, `diagram:${k}`]));

export const standardChecks = diagnostics;
