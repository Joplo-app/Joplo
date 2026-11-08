import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FeatureDiffManifest } from '@joplo-app/core';

// Execute the shipped runtime itself; the harness only supplies DOM, windows and timers.
const runtime = readFileSync(new URL('../src/feature-diff-runtime.js', import.meta.url), 'utf8');
const locales = readFileSync(new URL('../src/feature-diff-locales.json', import.meta.url), 'utf8');
const SEND = 'invite.main.send', OTHER = 'invite.main.other';
class Element {
  textContent = ''; value = ''; checked = false; disabled = false;
  children: Element[] = []; attrs: Record<string, string> = {};
  onclick?: () => void;
  contentWindow?: { sent: unknown[]; postMessage(data: unknown): void };
  constructor(tag = 'div') {
    if (tag === 'iframe') this.contentWindow = { sent: [], postMessage(data) { this.sent.push(data); } };
  }
  setAttribute(key: string, value: string) { this.attrs[key] = value; }
  replaceChildren(...children: Element[]) { this.children = children; }
  append(...children: Element[]) { this.children.push(...children); }
}
function manifest(): FeatureDiffManifest {
  return { formatVersion: 1, kind: 'joplo-feature-diff', base: { sha: null }, head: { sha: null }, status: 'changed', reasons: [], summary: { added: [], modified: ['Invite / Send'], removed: [] }, scenarios: [{
    featureId: 'invite', featureName: 'Invite', name: 'Send', before: SEND, after: SEND, status: 'modified', reasons: [],
    steps: [1, 2].map(n => ({ before: { id: `${SEND}#${n}`, position: n }, after: { id: `${SEND}#${n}`, position: n }, status: 'modified', match: 'key', reasons: ['effects'] })),
  }] };
}
function harness(m = manifest()) {
  const nodes = new Map<string, Element>(), frames: Element[] = [];
  let listener: (event: { source: unknown; data: unknown }) => void;
  const node = (id: string) => { if (!nodes.has(id)) nodes.set(id, new Element()); return nodes.get(id)!; };
  node('joplo-feature-diff').textContent = JSON.stringify(m);
  node('joplo-diff-locales').textContent = locales;
  runInNewContext(runtime, {
    document: { documentElement: {}, getElementById: node, querySelector: node, createElement: (tag: string) => { const el = new Element(tag); if (tag === 'iframe') frames.push(el); return el; } },
    location: { search: '' }, navigator: { language: 'en' }, URLSearchParams,
    window: { addEventListener: (_type: string, fn: typeof listener) => { listener = fn; } }, setTimeout, clearTimeout,
  });
  const message = (frame: Element, data: object, source: unknown = frame.contentWindow) => listener({ source, data: { protocol: 1, ...data } });
  const position = (frame: Element, scenario = SEND, step = 1) => message(frame, { type: 'joplo:position', scenario, step });
  const ready = (frame: Element) => message(frame, { type: 'joplo:ready', scenarios: [{ id: SEND, steps: 2 }, { id: OTHER, steps: 2 }] });
  const alignInitially = () => { frames.forEach(frame => { ready(frame); position(frame); }); expect(node('status').textContent).toMatch(/^Aligned/); };
  const click = (id: string) => { expect(node(id).disabled, `${id} should be enabled`).toBe(false); node(id).onclick!(); };
  return { node, frames, message, position, ready, alignInitially, click, sent: () => frames.map(f => f.contentWindow!.sent.length) };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('public diff runtime acknowledgements', () => {
  it.each([0, 1])('stops on another scenario at step %s, invalidates cached alignment, and waits for realign replies', step => {
    const h = harness(); h.alignInitially(); h.click('play'); h.frames.forEach(f => h.position(f));
    expect(h.node('play').textContent).toBe('Pause');
    h.position(h.frames[0]!, OTHER, step);
    expect(h.node('status').textContent).toMatch(/independently/);
    expect(h.node('play').textContent).toBe('Play changes');
    const sent = h.sent(); vi.advanceTimersByTime(2000);
    expect(h.sent()).toEqual(sent); expect(h.node('counter').textContent).toBe('1 / 2');
    expect(vi.getTimerCount()).toBe(0);
    // Returning independently does not resurrect the old acknowledgement or resume playback.
    h.position(h.frames[0]!);
    expect(h.node('status').textContent).toMatch(/independently/);
    h.click('align');
    expect(h.node('status').textContent).toMatch(/Restoring/);
    expect(h.frames.every(f => JSON.stringify(f.contentWindow!.sent.at(-1)) === JSON.stringify({ type: 'joplo:goto', protocol: 1, scenario: SEND, step: 1 }))).toBe(true);
    h.position(h.frames[0]!);
    expect(h.node('status').textContent).toMatch(/Restoring/); // Other pane's cached step is insufficient.
    vi.advanceTimersByTime(1800); expect(h.node('counter').textContent).toBe('1 / 2');
    h.position(h.frames[1]!);
    expect(h.node('status').textContent).toMatch(/^Aligned/);
    expect(h.node('play').textContent).toBe('Play changes'); expect(vi.getTimerCount()).toBe(0);
    h.click('play'); h.frames.forEach(f => h.position(f)); vi.advanceTimersByTime(1800);
    expect(h.node('counter').textContent).toBe('2 / 2');
  });
  it('stops a scene switch during an outstanding synchronization, not just during dwell', () => {
    const h = harness(); h.alignInitially(); h.click('play');
    h.position(h.frames[0]!, OTHER, 1);
    expect(h.node('status').textContent).toMatch(/independently/);
    h.position(h.frames[1]!); h.position(h.frames[0]!);
    expect(h.node('status').textContent).toMatch(/independently/);
    expect(vi.getTimerCount()).toBe(0); expect(h.node('play').textContent).toBe('Play changes');
  });
  it('requires fresh replies from an unchanged pane too, and times out safely', () => {
    const m = manifest(); m.scenarios[0]!.steps[1]!.before!.position = 1;
    const h = harness(m); h.alignInitially(); h.click('next');
    h.position(h.frames[1]!, SEND, 2);
    expect(h.node('status').textContent).toMatch(/Restoring/);
    vi.advanceTimersByTime(12000);
    expect(h.node('status').textContent).toMatch(/did not confirm/);
    expect(h.node('play').textContent).toBe('Play changes');
    h.click('align'); h.position(h.frames[0]!); h.position(h.frames[1]!, SEND, 2);
    expect(h.node('status').textContent).toMatch(/^Aligned/);
  });
  it('treats independent same-scenario movement as drift and ignores invalid/unregistered telemetry', () => {
    const h = harness(); h.alignInitially();
    const frame = h.frames[0]!;
    for (const data of [{ scenario: SEND, step: -1 }, { scenario: SEND, step: 1.5 }, { scenario: SEND, step: 999 }, { scenario: 'missing', step: 0 }, { scenario: OTHER, step: 0, protocol: 2 }])
      h.message(frame, { type: 'joplo:position', ...data });
    h.message(frame, { type: 'joplo:position', scenario: OTHER, step: 0 }, {});
    expect(h.node('status').textContent).toMatch(/^Aligned/);
    h.position(frame, SEND, 2);
    expect(h.node('status').textContent).toMatch(/independently/);
  });
  it('accepts initial zero-step acknowledgements without a cached position', () => {
    const m = manifest(); m.scenarios[0] = { ...m.scenarios[0]!, before: null, status: 'added', steps: [] };
    const h = harness(m), frame = h.frames[0]!;
    h.message(frame, { type: 'joplo:ready', scenarios: [{ id: SEND, steps: 0 }] });
    expect(h.node('status').textContent).toMatch(/Restoring/);
    h.position(frame, SEND, 0);
    expect(h.frames).toHaveLength(1); expect(h.node('status').textContent).toMatch(/^Aligned/);
  });
});

it('waits through initial/previous position reports, then confirms both target tuples', () => {
  const h = harness(); h.frames.forEach(f => { h.ready(f); h.position(f, SEND, 0); });
  expect(h.node('status').textContent).toMatch(/Restoring/);
  h.frames.forEach(f => h.position(f)); expect(h.node('status').textContent).toMatch(/^Aligned/);
  h.click('next'); h.frames.forEach(f => h.position(f));
  expect(h.node('status').textContent).toMatch(/Restoring/);
  h.frames.forEach(f => h.position(f, SEND, 2)); expect(h.node('status').textContent).toMatch(/^Aligned/);
});
it('invalidates a pane that independently steps away after acknowledging while its sibling is pending', () => {
  const h = harness(); h.alignInitially(); h.click('play');
  h.position(h.frames[0]!); h.position(h.frames[0]!, SEND, 2);
  expect(h.node('status').textContent).toMatch(/independently/);
  h.position(h.frames[1]!);
  expect(h.node('status').textContent).toMatch(/independently/); expect(vi.getTimerCount()).toBe(0);
});
