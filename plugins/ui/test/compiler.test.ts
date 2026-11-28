import { replay } from '@joplo-app/core';
import { $, callout, flow, highlight, shot, spotlight } from '@joplo-app/kit';
import { Fragment } from '@joplo-app/kit/node';
import { describe, expect, it } from 'vitest';
import { Arrow, Board, Box, Compare, Image, RatioBar } from '../src/plugin.ts';
import { build, h, scenario } from './fixture.ts';

const errors = (tree: ReturnType<typeof h>) => build(tree).diagnostics.filter(d => d.severity === 'error').map(d => d.code);

describe('RatioBar validation', () => {
  it.each([
    { total: 0, left: 0 }, { total: -1, left: 0 }, { total: 1, left: -1 }, { total: 10, left: 2, right: -1 },
    { total: 10, left: 9, right: 2 }, { total: 10, left: 0, threshold: -1 }, { total: 10, left: 0, threshold: 11 },
    { total: 10, left: $.ui.left, right: 11 }, { total: 10, left: '5' }, { total: 10 }, { total: 100, left: NaN },
  ])('rejects invalid counts %o', props => expect(errors(h(RatioBar, props))).toContain('RATIO_BAR_INVALID'));
  it('defers comparisons between bindings', () => {
    expect(errors(h(RatioBar, { total: $.data.capacity, left: $.ui.count, right: 2, threshold: $.data.limit }))).toEqual([]);
  });
});

describe('Compare validation', () => {
  const side = (value: string) => h(Compare.Side, { value, label: value });
  const compare = (...children: unknown[]) => h(Compare, { id: 'policy', unmodeled: true }, ...children);
  it('accepts fragments and arrays as direct children', () => {
    expect(errors(compare(h(Fragment, {}, [side('a'), side('b')])))).toEqual([]);
  });
  it('rejects orphan, non-side and missing sides', () => {
    expect(errors(side('a'))).toContain('PLUGIN_PARENT');
    expect(errors(compare(h(Box), side('a')))).toContain('COMPARE_CHILD');
    expect(errors(compare(side('a')))).toContain('COMPARE_SIDES');
  });
  it('rejects repeated or empty values and an unknown initial value or mode', () => {
    expect(errors(compare(side('a'), side('a')))).toContain('COMPARE_DUPLICATE_VALUE');
    expect(errors(compare(side('a'), side(' ')))).toContain('COMPARE_VALUE');
    expect(errors(h(Compare, { id: 'c', mode: 'grid', defaultValue: 'c' }, side('a'), side('b')))).toEqual(expect.arrayContaining(['COMPARE_MODE', 'COMPARE_SELECTION']));
  });
  it('limits select to directly owned choices across nested comparisons', () => {
    const tree = compare(h(Compare.Side, { value: 'a' }, h(Compare, { id: 'nested', unmodeled: true }, side('inner'), side('outer'))), side('b'));
    const invalid = build(tree, flow('Show', { start: '/' }).select('policy', 'inner'));
    expect(replay(invalid.project!, scenario).diagnostics).toMatchObject([{ code: 'UNKNOWN_CHOICE' }]);
  });
});

describe('Image.Region validation and focus', () => {
  const region = (rect: unknown) => h(Image.Region, { id: 'quota', rect, label: 'Quota' });
  it.each([[], [1, 2, 3], [0, 0, 0, 1], [0, 0, 1, -1], [-0.1, 0, 0.1, 1], [0, -0.1, 1, 1], [0.9, 0, 0.2, 1], [0, 0.9, 1, 0.2], [0, 0, '1', 1]].map(rect => ({rect})))('rejects $rect', ({rect}) => {
    expect(errors(h(Image, {}, region(rect)))).toContain('IMAGE_REGION_RECT');
  });
  it('requires a parent image and explicit id', () => {
    expect(errors(region([0, 0, 1, 1]))).toContain('PLUGIN_PARENT');
    expect(errors(h(Image, {}, h(Image.Region, { rect: [0, 0, 1, 1] })))).toContain('MISSING_ID');
  });
  it('accepts fill and the four ordinary focus effects on the same region', () => {
    const tree = h(Image, { fit: 'fill', src: 'data:image/svg+xml,<svg/>' }, region([0, 0, 1, 1]));
    const playback = flow('Show', { start: '/' }).system('Quota', shot('quota'), callout('quota', 'Available')).system('Highlight', highlight('quota')).system('Focus', spotlight('quota'));
    expect(build(tree, playback).diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  });
});

it('keeps self-loop references on the same board', () => {
  expect(errors(h(Board, {}, h(Box, { id: 'job' }), h(Arrow, { from: 'job', to: 'job' })))).toEqual([]);
  expect(errors(h(Board, {}, h(Arrow, { from: 'absent', to: 'absent' })))).toContain('ARROW_TARGET_UNKNOWN');
});
