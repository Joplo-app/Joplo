import type { AppearanceFont } from '@joplo-app/core/runtime';

const loads = new WeakMap<Document, { promise: Promise<void>; link: HTMLLinkElement; resolve: () => void }>();
function unloadWenKai(doc: Document): void {
  const load = loads.get(doc);
  if (!load) return;
  loads.delete(doc);
  load.link.remove();
  load.resolve();
}
/** Board/render only. Merely displaying or previewing the font option never requests the CDN. */
export function loadWenKai(font: AppearanceFont | null, doc: Document = document): Promise<void> {
  if (font !== 'kai') { unloadWenKai(doc); return Promise.resolve(); }
  let loaded = loads.get(doc);
  if (!loaded) {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => { resolve = done; });
    const link = doc.createElement('link');
    loaded = { promise, link, resolve };
    loads.set(doc, loaded);
    link.rel = 'stylesheet';
    link.href = 'https://cdn.jsdelivr.net/npm/lxgw-wenkai-webfont@1.7.0/style.css';
    link.onload = resolve;
    const current = loaded;
    link.onerror = () => { if (loads.get(doc) === current) unloadWenKai(doc); };
    doc.head.appendChild(link);
  }
  return loaded.promise;
}

/** One deadline covers stylesheet, font files and FontFaceSet.ready, including offline requests. */
export async function waitForFonts(doc: Document, font: AppearanceFont | null, fonts: string[], text: string, timeout = 3000): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      (async () => {
        await loadWenKai(font, doc);
        await Promise.all(fonts.map((stack) => doc.fonts.load(stack, text)));
        await doc.fonts.ready;
      })().catch(() => undefined),
      new Promise<void>((resolve) => { timer = setTimeout(() => { if (font === 'kai') unloadWenKai(doc); resolve(); }, timeout); }),
    ]);
  } finally { clearTimeout(timer); }
}
