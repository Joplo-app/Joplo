/** Run outside the Vitest worker: tsx and Vitest otherwise compete over source-map registration. */
import { join } from 'node:path';
import { tsImport } from 'tsx/esm/api';
import { loadAuthoring } from '../../src/load.ts';
import { compile, type CompileMode } from '../../src/compile.ts';
import { validate } from '../../src/validate.ts';
const [root, mode] = process.argv.slice(2) as [string, CompileMode];
const loaded = await loadAuthoring(root, file => tsImport(file, { parentURL: import.meta.url, tsconfig: join(root, 'tsconfig.json') }));
const result = loaded.authoring ? compile(loaded.authoring, mode) : {project:null,diagnostics:[]};
process.stdout.write(JSON.stringify({project:result.project,diagnostics:[...loaded.diagnostics,...result.diagnostics,...(result.project ? validate(result.project).diagnostics : [])]}));
