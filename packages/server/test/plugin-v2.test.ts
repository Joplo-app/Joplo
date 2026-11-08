import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { expect, it } from 'vitest';
import { bundlePluginRuntimes } from '../src/build.ts';
import { locateWebAssets } from '../src/web-assets.ts';

it('bundles React plugins with host React/JSX imports and defers evaluation until the host is ready', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-react-plugin-'));
  try {
    const file = path.join(dir, 'runtime.tsx');
    fs.writeFileSync(file, `import React, { useState } from 'react';
      globalThis.__SEEN_REACT__ = React;
      export default { id: 'probe', apiVersion: 2, components: { Box: { react: () => <b>{useState('shared hooks')[0]}</b> } } };`);
    const web = locateWebAssets();
    const [code] = await bundlePluginRuntimes({ probe: file }, dir, web);
    expect(code!.length).toBeLessThan(5000);
    expect(code).not.toContain(dir);
    expect(code).not.toContain('react.transitional.element');
    const requireHost = createRequire(path.join(web.webDir, 'package.json'));
    const React = requireHost('react');
    const shared = Object.fromEntries(['react', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom', 'react-dom/client'].map(name => [name, requireHost(name)]));
    const context: any = { __JOPLO_PLUGINS__: [] };
    vm.runInNewContext(code!, context);
    expect(context.__SEEN_REACT__).toBeUndefined();
    context.__JOPLO_SHARED__ = shared;
    context.__JOPLO_PLUGIN_FACTORIES__[0].load();
    expect(context.__SEEN_REACT__).toBe(React);
    const runtime = context.__JOPLO_PLUGINS__[0];
    const html = requireHost('react-dom/server').renderToStaticMarkup(React.createElement(runtime.components.Box.react));
    expect(html).toBe('<b>shared hooks</b>');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
