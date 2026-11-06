import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';

const script = pathToFileURL(resolve(import.meta.dirname, '../../../scripts/release.mjs')).href;
test('smoke style injection uses a stable element id and preserves arbitrary title text', () => {
  const code = `
    import assert from 'node:assert/strict';
    import { addSmokeClassName } from ${JSON.stringify(script)};
    for (const title of ['Start designing', '作者修改的标题']) {
      const source = '<Title id="welcome" order={2}>' + title + '</Title>';
      const result = addSmokeClassName(source);
      assert.ok(result.includes('id="welcome"'));
      assert.ok(result.includes('className="tracking-[0.137em]"'));
      assert.ok(result.includes('>' + title + '</Title>'));
    }
    assert.throws(() => addSmokeClassName('<Title>No anchor</Title>'), /welcome/);
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' });
  expect(result.stderr).toBe('');
  expect(result.status).toBe(0);
});
