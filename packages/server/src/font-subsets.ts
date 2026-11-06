/** D59: pure font subsetting policy; uncertain CSS always survives. */
export function parseUnicodeRange(spec: string): [number, number][] | null {
  const out: [number, number][] = [];
  for (const part of spec.split(',')) {
    const m = /^U\+([0-9a-f]{1,6})(?:-([0-9a-f]{1,6}))?$|^U\+([0-9a-f]*\?+)$/i.exec(part.trim());
    if (!m) return null;
    if (m[3] && m[3].length > 6) return null;
    const lo = Number.parseInt(m[3] ? m[3].replaceAll('?', '0') : m[1]!, 16);
    const hi = Number.parseInt(m[3] ? m[3].replaceAll('?', 'f') : m[2] ?? m[1]!, 16);
    if (lo > hi || hi > 0x10ffff) return null;
    out.push([lo, hi]);
  }
  return out;
}

export function rangeIntersects(spec: string, points: ReadonlySet<number>): boolean {
  const ranges = parseUnicodeRange(spec);
  return ranges === null || ranges.some(([lo, hi]) => { for (const cp of points) if (cp >= lo && cp <= hi) return true; return false; });
}

/** Include both literal text and encodings left by JS/JSON, CSS content and HTML. */
export function collectCodepoints(text: string): Set<number> {
  const points = new Set<number>();
  const add = (s: string) => { for (const c of s) points.add(c.codePointAt(0)!); };
  add(text);
  add(text.replace(/\\u\{([\da-f]{1,6})\}|\\u([\da-f]{4})|\\x([\da-f]{2})/gi, (raw, astral, unit, byte) => {
    const cp = Number.parseInt(astral ?? unit ?? byte, 16);
    return cp <= 0x10ffff ? String.fromCodePoint(cp) : raw;
  }));
  for (const m of text.matchAll(/\\([\da-f]{1,6})(?:\s)?|&#(?:x([\da-f]+)|(\d+));?/gi)) {
    const cp = Number.parseInt(m[1] ?? m[2] ?? m[3]!, m[3] ? 10 : 16);
    if (cp <= 0x10ffff) points.add(cp);
  }
  return points;
}

/** Token boundaries ignore strings/comments, including braces in quoted font names. */
function faceSpans(css: string): [number, number][] {
  const spans: [number, number][] = [];
  let start = -1, depth = 0, quote = '';
  for (let i = 0; i < css.length; i++) {
    const c = css[i]!;
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = ''; continue; }
    if (c === '/' && css[i + 1] === '*') { const end = css.indexOf('*/', i + 2); if (end < 0) break; i = end + 1; continue; }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (start < 0 && c === '@') {
      const match = /^@font-face\s*\{/i.exec(css.slice(i));
      if (match) { start = i; depth = 1; i += match[0].length - 1; }
    } else if (start >= 0) {
      if (c === '{') depth++;
      if (c === '}' && --depth === 0) { spans.push([start, i + 1]); start = -1; }
    }
  }
  return spans;
}

/** Read descriptors only at declaration boundaries, never inside strings or url(). */
function unicodeRange(rule: string): string | null {
  const body = rule.slice(rule.indexOf('{') + 1, -1).replace(/\/\*[\s\S]*?\*\//g, '');
  const ranges: string[] = [];
  let start = 0, quote = '', depth = 0;
  for (let i = 0; i <= body.length; i++) {
    const c = body[i];
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = ''; continue; }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === '{' || c === '}') return null;
    if (c === '(') depth++;
    if (c === ')') depth--;
    if (depth === 0 && (c === ';' || i === body.length)) {
      const descriptor = /^\s*unicode-range\s*:\s*(.*?)\s*$/i.exec(body.slice(start, i));
      if (descriptor) ranges.push(descriptor[1]!);
      start = i + 1;
    }
  }
  return ranges.length === 1 ? ranges[0]! : null;
}

export function pruneFontCss(css: string, points: ReadonlySet<number>): { css: string; keptFiles: string[]; removedFiles: string[] } {
  const kept = new Set<string>(), removed = new Set<string>();
  let output = '', cursor = 0;
  for (const [start, end] of faceSpans(css)) {
    const rule = css.slice(start, end);
    const range = unicodeRange(rule);
    const keep = range === null || rangeIntersects(range, points);
    for (const m of rule.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]+))\s*\)/gi)) (keep ? kept : removed).add(m[1] ?? m[2] ?? m[3]!);
    output += css.slice(cursor, start) + (keep ? rule : '');
    cursor = end;
  }
  return { css: output + css.slice(cursor), keptFiles: [...kept].sort(), removedFiles: [...removed].filter((f) => !kept.has(f)).sort() };
}
