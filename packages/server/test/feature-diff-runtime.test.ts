import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FeatureDiffManifest } from '@joplo-app/core';

// Execute the shipped runtime itself; the harness only supplies DOM, windows and timers.
const runtime = readFileSync(new URL('../src/feature-diff-runtime.js', import.meta.url), 'utf8');
const locales = readFileSync(new URL('../src/feature-diff-locales.json', import.meta.url), 'utf8');
const SEND = 'invite.main.send', OTHER = 'invite.main.other';
class Element {
  textContent = ''; value = ''; checked = false; disabled = false; hidden = false; className = ''; title = '';
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
  const doc: { onkeydown?: (e: object) => void; [k: string]: unknown } = { documentElement: {}, getElementById: node, querySelector: node, createElement: (tag: string) => { const el = new Element(tag); if (tag === 'iframe') frames.push(el); return el; } };
  runInNewContext(runtime, {
    document: doc,
    location: { search: '' }, navigator: { language: 'en' }, URLSearchParams,
    window: { addEventListener: (_type: string, fn: typeof listener) => { listener = fn; } }, setTimeout, clearTimeout,
  });
  const message = (frame: Element, data: object, source: unknown = frame.contentWindow) => listener({ source, data: { protocol: 1, ...data } });
  const position = (frame: Element, scenario = SEND, step = 1) => message(frame, { type: 'joplo:position', scenario, step });
  const ready = (frame: Element) => message(frame, { type: 'joplo:ready', scenarios: [{ id: SEND, steps: 2 }, { id: OTHER, steps: 2 }] });
  const alignInitially = () => { frames.forEach(frame => { ready(frame); position(frame); }); expect(node('status').textContent).toMatch(/^Aligned/); };
  const click = (id: string) => { expect(node(id).disabled, `${id} should be enabled`).toBe(false); node(id).onclick!(); };
  return { doc, node, frames, message, position, ready, alignInitially, click, sent: () => frames.map(f => f.contentWindow!.sent.length) };
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
it('names each change with its public caption and keeps the change list in step with navigation', () => {
  const m = manifest();
  m.scenarios[0]!.steps = [
    { before: null, after: { id: `${SEND}#1`, position: 1, caption: 'Preview the email' }, status: 'added', match: 'none', reasons: ['step-added'] },
    { before: { id: `${SEND}#1`, position: 1, caption: 'Send' }, after: { id: `${SEND}#2`, position: 2, caption: 'Send invitation' }, status: 'modified', match: 'key', reasons: ['caption', 'effects'], results: [{ kind: 'state', label: 'ui.status', before: 'Sent', after: 'Sending…' }, { kind: 'outcome', label: 'done', before: null, after: 'Invitation sent' }] },
  ];
  const h = harness(m);
  const text = (el: { textContent: string; children: unknown[] }): string => el.textContent + el.children.map(c => text(c as typeof el)).join('');
  expect(h.node('kind').textContent).toBe('New step inserted');
  expect(text(h.node('detail'))).toContain('Preview the email');
  const pane = (h.node('players').children[0] as unknown as { className: string; children: { children: { textContent: string; hidden?: boolean }[] }[] });
  expect(pane.className).toContain('paused');
  h.frames.forEach(f => { h.ready(f); h.position(f, SEND, f === h.frames[0] ? 0 : 1); });
  h.click('next');
  expect(h.node('kind').textContent).toBe('This step changed: Caption · Result');
  expect(text(h.node('detail'))).toMatch(/Old 1.*Send.*New 2.*Send invitation/);
  // The result values that changed are spelled out, so readers need not spot them on screen.
  expect(text(h.node('detail'))).toMatch(/ui\.status.*Sent.*→.*Sending….*Outcome.*—.*→.*Invitation sent/);
  const rows = (h.node('scenarios').children.find(c => (c as unknown as { className: string }).className === 'changes')!).children;
  expect(rows.map(r => r.attrs['aria-current'])).toEqual(['false', 'true']);
});
it('shows one large version, flips with Space without moving players, and enlarges one side from side-by-side', () => {
  const h = harness(); h.alignInitially();
  const panes = h.node('players').children;
  const front = () => panes.filter(p => p.className.split(' ').includes('front')).map(p => (p === panes[0] ? 'before' : 'after'));
  expect(h.node('players').className).toBe('players single');
  expect(front()).toEqual(['after']);
  const sent = h.sent();
  const press = (target: object = {}) => h.doc.onkeydown!({ key: ' ', target, preventDefault() {} });
  press();
  expect(front()).toEqual(['before']);
  expect(panes[1]!.attrs['aria-hidden']).toBe('true');
  // Space on a control keeps its native meaning.
  press({ closest: () => ({}) });
  expect(front()).toEqual(['before']);
  h.click('view-split');
  expect(h.node('players').className).toBe('players split');
  expect(h.node('sides').hidden).toBe(true);
  expect(panes.every(p => p.attrs['aria-hidden'] === 'false')).toBe(true);
  const zoom = panes[1]!.children[0]!.children.at(-1)!;
  zoom.onclick!();
  expect(h.node('players').className).toBe('players single');
  expect(front()).toEqual(['after']);
  expect(h.sent()).toEqual(sent);
  expect(h.node('status').textContent).toMatch(/^Aligned/);
  // A mouse press on the version tabs must not steal focus from Space.
  let prevented = false;
  const tab = h.node('sides').children[0]! as unknown as { onmousedown(e: object): void };
  tab.onmousedown({ preventDefault: () => { prevented = true; } });
  expect(prevented).toBe(true);
});
