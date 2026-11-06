import { describe, expect, it } from 'vitest';
import { collectCodepoints, parseUnicodeRange, pruneFontCss, rangeIntersects } from '../src/font-subsets.ts';

const points = (s: string) => new Set([...s].map((c) => c.codePointAt(0)!));
const face = (file: string, range = '') => `@font-face{font-family:'test';src:url('./${file}.woff2') format('woff2');${range ? `unicode-range:${range};` : ''}}`;

describe('unicode-range', () => {
  it('parses single points, ranges, comma lists and wildcard suffixes', () => {
    expect(parseUnicodeRange('U+41, u+4E00-4E02, U+1F6??')).toEqual([[65, 65], [0x4e00, 0x4e02], [0x1f600, 0x1f6ff]]);
    expect(rangeIntersects('U+4E00-4E02', points('丁'))).toBe(true);
    expect(rangeIntersects('U+1F6??', points('😀'))).toBe(true);
    expect(rangeIntersects('U+41', points('中'))).toBe(false);
  });
  it.each(['', 'U+XYZ', 'U+42-41', 'U+110000', 'U+?4', 'U+41,wat'])('keeps unparseable ranges: %s', (spec) => {
    expect(parseUnicodeRange(spec)).toBeNull();
    expect(rangeIntersects(spec, new Set())).toBe(true);
  });
});

describe('pruneFontCss', () => {
  it('removes only disjoint faces and files, retaining shared files', () => {
    const keep = face('shared', 'U+4E00-9FFF');
    const plain = 'body{color:red}';
    const css = plain + face('unused', 'U+AC00-D7AF') + face('shared', 'U+41') + keep;
    expect(pruneFontCss(css, points('中'))).toEqual({ css: plain + keep, keptFiles: ['./shared.woff2'], removedFiles: ['./unused.woff2'] });
  });
  it('empty points retain faces with no range and unparseable ranges', () => {
    const always = face('all');
    const invalid = face('unknown', 'U+oops');
    const out = pruneFontCss(always + face('cjk', 'U+4E00-9FFF') + invalid, new Set());
    expect(out.css).toBe(always + invalid);
    expect(out.removedFiles).toEqual(['./cjk.woff2']);
  });
  it('returns CSS without font faces unchanged, ignoring comments and strings', () => {
    const css = `/* ${face('comment', 'U+41')} */ p::before{content:"@font-face{unicode-range:U+41}"}`;
    expect(pruneFontCss(css, new Set())).toEqual({ css, keptFiles: [], removedFiles: [] });
  });
  it('keeps uncertain syntax and quoted braces intact', () => {
    const css = `@font-face{font-family:'a}b';src:url("./a.woff2");unicode-range:U+oops}`;
    expect(pruneFontCss(css, new Set()).css).toBe(css);
  });
  it('does not mistake quoted text for a unicode-range descriptor', () => {
    const css = `@font-face{font-family:'a;unicode-range:U+41;';src:url('./all.woff2')}`;
    expect(pruneFontCss(css, new Set()).css).toBe(css);
  });
});

it('collects literal, escaped JS/JSON, CSS and numeric HTML codepoints, including astral characters', () => {
  const cps = collectCodepoints(String.raw`中 \u6587 \u{20000} \ud840\udc01 content:'\9f98'; &#x9f99; &#40845;`);
  for (const cp of points('中文𠀀𠀁龘龙龍')) expect(cps.has(cp), cp.toString(16)).toBe(true);
});
