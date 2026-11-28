import { afterEach, expect, it, vi } from 'vitest';
import type { PluginObservation } from '@joplo-app/kit/plugin';
import { observe } from '../src/runtime.tsx';

afterEach(() => vi.unstubAllGlobals());

it.each(['standalone', 'canvas'])('keeps existing items still and distinguishes arrival, reorder and re-entry (%s)', surface => {
  vi.stubGlobal('getComputedStyle', () => ({ opacity: '1' }));
  vi.stubGlobal('HTMLElement', class {});
  const update: PluginObservation = { frame: { animate: true, position: 0, scenarioId: 'test' }, ext: {} } as PluginObservation;
  const world = {
    dataset: {}, closest: () => null,
    querySelectorAll: (selector: string) => /motion|enter/.test(selector) ? visible : [],
  };
  const track = { ...world, dataset: { jitemTrack: '' }, closest: () => surface === 'canvas' ? world : null };
  const root = { querySelectorAll: () => surface === 'canvas' ? [world, track] : [track], contains: () => true };
  const parent = surface === 'canvas' ? world : track;
  function item(key: string, left: number) {
    const animations: { id: string; cancel: () => void; addEventListener: () => void }[] = [];
    return {
      dataset: { jpContentMotion: JSON.stringify(['cache', key]), jtrackItem: '', jpContentEnter: 'rise' },
      offsetParent: parent, parentElement: parent, offsetLeft: left, offsetTop: 0, offsetWidth: 120, offsetHeight: 40,
      closest: () => null, textContent: key, cloneNode: () => ({
        querySelectorAll: () => [], getAttributeNames: () => [], outerHTML: key,
      }),
      animations, getAnimations: () => animations,
      animate: vi.fn(() => {
        const animation = { id: '', cancel: vi.fn(), addEventListener: vi.fn() };
        animations.push(animation);
        return animation;
      }),
    };
  }

  const a = item('a', 0), b = item('b', 128);
  let visible = [a];
  const observer = observe(root as unknown as HTMLElement, update);
  observer.update(update);
  visible = [a, b];
  observer.update(update);
  expect(a.animate).not.toHaveBeenCalled();
  expect(b.animations.map(anim => anim.id)).toEqual(['jenter']);

  a.offsetLeft = 128;
  b.offsetLeft = 0;
  visible = [b, a];
  observer.update(update);
  expect(a.animations.map(anim => anim.id)).toEqual(['jmotion']);
  expect(b.animations.map(anim => anim.id)).toEqual(['jenter', 'jmotion']);

  visible = [b];
  observer.update(update);
  const reinserted = item('a', 128);
  visible = [b, reinserted];
  observer.update(update);
  expect(reinserted.animations.map(anim => anim.id)).toEqual(['jenter']);
  observer.destroy();
});
