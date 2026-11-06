/** data.embed 与云端嵌入契约逐字一致：iframe 属性 HTML 转义，Markdown 替代文字去换行并转义 \ [ ]。 */
import { expect, it } from 'vitest';
import { embedSnippets, PREVIEW_PATH } from '../src/cloud-embed.ts';

const page = 'https://joplo.app/s/Abc1234567/';

it('matches the contract for an ordinary title', () => {
  expect(embedSnippets(page, 'Team invite')).toEqual({
    iframe: '<iframe src="https://joplo.app/s/Abc1234567/?embed=1" title="Team invite · Joplo 演示" style="width:100%;aspect-ratio:16/10;border:0" allow="fullscreen *" allowfullscreen loading="lazy"></iframe>',
    markdown: '[![Joplo 演示 · Team invite](https://joplo.app/s/Abc1234567/badge.svg)](https://joplo.app/s/Abc1234567/)',
    badge: 'https://joplo.app/s/Abc1234567/badge.svg',
    preview: 'https://joplo.app/s/Abc1234567/preview.png',
  });
  expect(PREVIEW_PATH).toBe('_joplo/preview.png');
});

it('escapes quotes, angle brackets, ampersands, brackets, backslashes and newlines', () => {
  const title = `"A" & 'B' <x>\n[1] \\ ]`;
  const e = embedSnippets(page, title);
  expect(e.iframe).toContain(' title="&quot;A&quot; &amp; &#39;B&#39; &lt;x&gt;\n[1] \\ ] · Joplo 演示" ');
  expect(e.iframe.match(/"/g)!.length % 2).toBe(0);
  expect(e.markdown).toBe(`[![Joplo 演示 · "A" & 'B' <x> \\[1\\] \\\\ \\]](${page}badge.svg)](${page})`);
  expect(e.markdown).not.toMatch(/[\r\n]/);
  // 多个连续空白（含 \r\n、制表符）合成一个空格
  expect(embedSnippets(page, 'a \r\n\t b').markdown).toContain('[![Joplo 演示 · a b](');
});

it('normalizes the server share URL to the page with a trailing slash and no query or hash', () => {
  for (const url of ['https://joplo.app/s/Abc1234567', 'https://joplo.app/s/Abc1234567/?x=1#y', page]) {
    expect(embedSnippets(url, 'T').badge).toBe(`${page}badge.svg`);
    expect(embedSnippets(url, 'T').iframe).toContain(`src="${page}?embed=1"`);
  }
  expect(embedSnippets('http://127.0.0.1:9/s/Abc1234567/', 'T').preview).toBe('http://127.0.0.1:9/s/Abc1234567/preview.png');
});

it('handles empty titles without producing broken markup', () => {
  const e = embedSnippets(page, '');
  expect(e.iframe).toContain('title=" · Joplo 演示"');
  expect(e.markdown).toBe(`[![Joplo 演示 · ](${page}badge.svg)](${page})`);
});
