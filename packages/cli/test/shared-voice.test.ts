import { expect, it, vi } from 'vitest';
import { previousShareVoice } from '../src/cloud-share.ts';
const key = 'a'.repeat(64), file = `voice/${'b'.repeat(64)}.mp3`;
const index = { narrator: 'fp', roles: {}, clips: { [key]: file } };
const html = (project: unknown) => `<script type="application/json" id="joplo-ir">${JSON.stringify({project})}</script>`;
it('requests HTML and recovers schema 2 narration without requiring current work fields', async () => {
 const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => new Response(new Headers(init?.headers).get('accept') === 'text/html' ? html({schemaVersion:2, features:{}, scenarios:{}, voiceIndex:index}) : '# Agent Markdown'));
 const shared = await previousShareVoice('https://example.com/s/abcdefghij/',fetcher as typeof fetch);
 expect(shared?.index).toEqual(index);
});
it.each([new Response('# Markdown'),new Response('denied',{status:403}),new Response(html(null))])('refuses publication when previous narration cannot be inspected', async (response) => {
 await expect(previousShareVoice('https://example.com/s/abcdefghij/', (async()=>response) as typeof fetch)).rejects.toThrow('Publication stopped to preserve existing audio');
});
it('allows a valid previous build without generated narration', async () => {
 expect(await previousShareVoice('https://example.com/s/abcdefghij/',(async()=>new Response(html({schemaVersion:2}))) as typeof fetch)).toBeUndefined();
});
it('downloads only content-addressed audio under the same share', async () => {
 const fetcher = vi.fn(async (_url: unknown, _init?: RequestInit) => new Response(html({voiceIndex:index})));
 const shared = await previousShareVoice('https://example.com/s/abcdefghij/',fetcher as typeof fetch);
 fetcher.mockImplementation(async()=>new Response(new Uint8Array([1,2,3])));
 expect(await shared!.fetch('../secret')).toBeNull();
 expect(await shared!.fetch(file)).toEqual(new Uint8Array([1,2,3]));
 expect(String(fetcher.mock.calls.at(-1)?.[0])).toBe(`https://example.com/s/abcdefghij/${file}`);
});
