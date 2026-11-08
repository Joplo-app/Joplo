/** Local integration fixture. Only writes under scratch/; never contacts Cloud. */
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { buildSite, buildFeatureDiff } from '../packages/server/src/index.ts';
const root = resolve('scratch/feature-diff');
await mkdir(root, { recursive: true });
for (const side of ['before', 'after']) {
  const dir = join(root, side + '-project');
  await mkdir(join(dir, 'features/invite/options'), { recursive: true });
  await mkdir(join(dir, 'routes'), { recursive: true });
  await rm(join(dir, 'routes/index'), { recursive: true, force: true });
  await writeFile(join(dir, 'tsconfig.json'), JSON.stringify({ compilerOptions: { jsx: 'react-jsxdev', jsxImportSource: '@joplo-app/kit', moduleResolution: 'Bundler', module: 'ESNext', target: 'ES2023' } }));
  await writeFile(join(dir, 'joplo.config.ts'), `import { config } from '@joplo-app/kit'; export default config({ name: 'Feature diff fixture', home: '/' });`);
  await writeFile(join(dir, 'features/invite/feature.ts'), `import { feature } from '@joplo-app/kit'; export default feature({ name: 'Invitations', goal: 'Preview and send an invitation', cases: {}, pick: 'main' });`);
  await writeFile(join(dir, 'routes/page.tsx'), `import { page, $ } from '@joplo-app/kit'; import { Stack, Title, Text } from '@joplo-app/kit/ui'; export default page({ title: 'Invitation' }, <Stack p="xl"><Title>Team invitation</Title><Text>{$.ui.status}</Text><Text>{$.ui.preview}</Text></Stack>);`);
  await writeFile(join(dir, 'features/invite/options/main.tsx'), `import { option, flow, set, $, done } from '@joplo-app/kit';
export default option({ name: 'Email', idea: 'Review before sending', state: { ui: { status: 'Ready', preview: '' } }, on: { '/': {} }, scenarios: {
  send: flow('Single invitation').system('Open', set($.ui.status, 'Draft ready')).key('open')
    ${side === 'after' ? ".system('Preview', set($.ui.preview, 'Please join our team')).key('preview')" : ''}
    .system('Send', set($.ui.status, '${side === 'after' ? 'Sending…' : 'Sent'}')).key('send')
    .system('Complete', set($.ui.status, 'Sent'), done('Invitation sent')).key('complete'),
  initial: flow('Initial status', { state: { ui: { status: '${side === 'before' ? 'Old initial state' : 'New initial state'}' } } }).system('Finish', done('Status confirmed')),
  unchanged: flow('Read status').system('Read', done('Status read')),
  ambiguous: flow('Repeated retry').system('Retry')${side === 'after' ? ".system('Retry')" : ''}.system('Retry').system('Finish', done('Finished')),
  ${side === 'after' ? "batch: flow('Batch invitation').system('Select team', set($.ui.status, 'Three teammates selected')).system('Send batch', done('Batch sent'))" : "removed: flow('Legacy invitation').system('Legacy', done('Legacy sent'))"}
} });`);
  await buildSite({ projectDir: dir, outDir: join(root, side), overwrite: true });
}
await rm(join(root, 'bundle'), { recursive: true, force: true });
const result = await buildFeatureDiff({ beforeDir: join(root, 'before'), afterDir: join(root, 'after'), outDir: join(root, 'bundle'), baseSha: '1'.repeat(40), headSha: '2'.repeat(40) });
await mkdir('docs/feature-diff', { recursive: true });
await writeFile('docs/feature-diff/manifest.fixture.json', JSON.stringify(result.manifest, null, 2) + '\n');
console.log(JSON.stringify({ bundle: 'scratch/feature-diff/bundle', status: result.manifest.status, summary: result.manifest.summary }));
