import { compileStage, renderStage } from './plugin-stage.tsx';
import { $, chapter, push, set } from '@joplo-app/kit';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { expect, it } from 'vitest';
import content, { Canvas, ItemTrack } from '../src/plugin.ts';

const a = { code: 1, name: 'First', tone: '#abcdef' }, b = { code: 2, name: 'Second' };
const fields = { keyField: 'code', labelField: 'name', accentField: 'tone' };
function build(props: Record<string, unknown>, last = [b, a]) {
  return compileStage(content, jsx(ItemTrack, { id: 'cache', capacity: 3, ...props }), { data: { entries: [a] } },
    chapter('Cache').system('Append', push($.data.entries, b)).system('Reorder', set($.data.entries, last)));
}
function render(result: ReturnType<typeof build>, position = 0, liveEntries?: unknown[]) {
  return renderStage(result.project!, position, liveEntries ? { entries: liveEntries } : undefined);
}
const keys = (html: string) => [...html.matchAll(/data-jp-content-motion="([^"]+)"/g)].map(m => JSON.parse(m[1]!.replaceAll('&quot;', '"')));

it('keeps fixed slots and stable object identities through append, reorder and direct seeking', () => {
  const r = build({ ...fields, items: $.data.entries, emptyLabel: 'Free' });
  expect(r.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  const [before, after, reorder] = [0, 1, 2].map(i => render(r, i));
  for (const html of [before!, after!, reorder!]) expect(html.match(/<li\b/g)).toHaveLength(3);
  expect(before!.match(/>Free</g)).toHaveLength(2);
  expect(before).toContain('#abcdef');
  expect(after).toContain('>Second<');
  expect(after!.match(/data-jp-content-enter="rise"/g)).toHaveLength(2);
  expect(keys(before!)).toEqual([['cache', '1']]);
  expect(keys(after!)).toEqual([['cache', '1'], ['cache', '2']]);
  expect(keys(reorder!)).toEqual([['cache', '2'], ['cache', '1']]);
});

it('supports literal arrays, default keys and labels, and a vertical track', () => {
  const r = build({ direction: 'column', items: [{ id: 'x' }] });
  expect(r.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  const html = render(r);
  expect(html).toContain('repeat(1, minmax(0, 1fr))');
  expect(html).toContain('>x<');
  expect(html.match(/>空槽</g)).toHaveLength(2);
});

it.each([
  [{ capacity: 0 }, 'capacity'], [{ capacity: 2.5 }, 'capacity'], [{ capacity: 1e10 }, 'capacity'],
  [{ direction: 'diagonal' }, 'direction'], [{ items: null }, 'array'], [{ keyField: '' }, 'keyField'],
  [{ items: [{}] }, 'items[0].id'], [{ items: [{ id: 1 }, { id: '1' }] }, 'repeats'],
  [{ capacity: 1, items: [{ id: 'a' }, { id: 'b' }] }, 'capacity 1'],
])('diagnoses invalid literal props %o', (props, message) => {
  expect(build({ items: [], ...props }).diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'ITEM_TRACK_INVALID', message: expect.stringContaining(message) })]));
});

it('checks bound data on the failing step and keeps only fitting distinct entries during exploration', () => {
  const invalid = build({ ...fields, items: $.data.entries }, [b, b]);
  expect(invalid.diagnostics.find(d => d.code === 'ITEM_TRACK_INVALID')?.message).toMatch(/position 2.*repeats/);
  const html = render(build({ ...fields, capacity: 2, items: $.data.entries }), 0, [b, b, a, { code: 3 }]);
  expect(keys(html)).toEqual([['cache', '2'], ['cache', '1']]);
  expect(html.match(/<li\b/g)).toHaveLength(2);
  expect(html).toMatch(/role="status"[^>]*>.*capacity 2.*repeats/);
});

it('scopes local object keys to their track and never gives empty slots a motion key', () => {
  const tracks = ['cache', 'buffer'].map(id => jsx(ItemTrack, { id, capacity: 2, items: [{ id: 'token' }] }));
  const r = compileStage(content, jsx(Canvas, { children: tracks }), {}, chapter('Tracks').system('Read'));
  expect(r.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  expect(keys(renderStage(r.project!, 0))).toEqual([['cache', 'token'], ['buffer', 'token']]);
});
