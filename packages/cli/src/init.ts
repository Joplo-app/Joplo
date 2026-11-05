import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { JoploError } from '@joplo/core';

export async function initProject(dir: string, name?: string): Promise<string> {
  const root = resolve(dir);
  try {
    if ((await readdir(root)).length) throw new JoploError('UNSUPPORTED_ACTION', `目录非空，拒绝初始化：${root}`);
  } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
  const files: Record<string, string> = {
    'package.json': JSON.stringify({ private: true, type: 'module' }, null, 2) + '\n',
    'joplo.config.ts': `import { config } from '@joplo/kit';\nexport default config({ name: ${JSON.stringify(name ?? (basename(root) || 'Joplo'))}, layout: 'app', home: '/' });\n`,
    'layouts/app.tsx': `import { layout, Outlet, Slot } from '@joplo/kit';\nimport { AppShell } from '@joplo/kit/ui';\nexport default layout(\n  <AppShell padding="lg">\n    <AppShell.Main>\n      <Outlet />\n    </AppShell.Main>\n    <Slot name="overlay" />\n  </AppShell>,\n);\n`,
    'routes/page.tsx': `import { page, Slot } from '@joplo/kit';\nimport { Group, Stack, Title } from '@joplo/kit/ui';\nexport default page(\n  { title: '首页' },\n  <Stack gap="md">\n    <Title order={2}>开始设计</Title>\n    <Group gap="sm">\n      <Slot name="actions" />\n    </Group>\n  </Stack>,\n);\n`,
    'features/example/feature.ts': `import { feature } from '@joplo/kit';\nexport default feature({ name: '示例功能', goal: '点击按钮完成演示', cases: { happy: '正常完成' }, pick: 'a' });\n`,
    'features/example/options/a.tsx': `import { option, flow, done } from '@joplo/kit';\nimport { Button } from '@joplo/kit/ui';\nexport default option({\n  name: '方案 A', idea: '一个按钮完成操作',\n  on: { '/': { actions: <Button id="start">开始</Button> } },\n  scenarios: { happy: flow('正常完成', { cases: ['happy'], start: '/' }).click('start', done('已完成')) },\n});\n`,
    'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2023', module: 'ESNext', moduleResolution: 'Bundler', jsx: 'react-jsxdev', jsxImportSource: '@joplo/kit', allowImportingTsExtensions: true, noEmit: true, strict: true } }, null, 2) + '\n',
    '.gitignore': '.joplo/\ndist/\n',
  };
  await mkdir(root, { recursive: true });
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content, { flag: 'wx' });
  }
  return root;
}
