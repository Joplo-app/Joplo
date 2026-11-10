import { JoploError } from '@joplo-app/core';
import type { CDPSession, Page } from 'playwright-core';
import type { ExportCrop } from './contract.ts';
const fixedFrames = new WeakMap<Page,{width:number;height:number}>();
/** Numeric crop coordinates are relative to the chosen export root, in CSS pixels. */
export async function capture(page: Page, root: string, crop: ExportCrop | undefined, type: 'png' | 'jpeg' = 'png', quality?: number, session?: CDPSession, fixedAtMs?: number) {
  const target = page.locator(root);
  const base = await target.boundingBox();
  if (!base) throw new JoploError('RENDER_FAILED', `Export root is not visible: ${root}`);
  // Locator screenshots wait for two stable animation frames; engine-time sampling already
  // settled React and must capture intentional motion immediately, without that wall-clock wait.
  const screenshot = async (clip: { x: number; y: number; width: number; height: number }) => {
    if (fixedAtMs !== undefined) {
      const previous=fixedFrames.get(page);
      if(previous&&(Math.abs(previous.width-clip.width)>.01||Math.abs(previous.height-clip.height)>.01)) throw new JoploError('RENDER_FAILED',`Crop dimensions changed at ${fixedAtMs} ms: expected ${previous.width}x${previous.height}, got ${clip.width}x${clip.height}; use a fixed-size frame or numeric crop`);
      fixedFrames.set(page,{width:clip.width,height:clip.height});
    }
    if (session) { const result = await session.send('Page.captureScreenshot', { format: type, ...(quality ? { quality } : {}), clip: { ...clip, scale: 1 }, captureBeyondViewport: true, optimizeForSpeed: true }); return Buffer.from(result.data, 'base64'); }
    return page.screenshot({ type, clip, ...(quality ? { quality } : {}) });
  };
  if (!crop) return screenshot(base);
  let rect: { x: number; y: number; width: number; height: number } | null;
  if (typeof crop === 'string') {
    try {
      const selected = page.locator(crop);
      if (await selected.count() !== 1) throw new Error('selector must match exactly one element');
      rect = await selected.boundingBox();
    } catch (e) { throw new JoploError('USAGE', `Invalid crop selector ${JSON.stringify(crop)}: ${e instanceof Error ? e.message : String(e)}`); }
  } else rect = { ...crop, x: base.x + crop.x, y: base.y + crop.y };
  if (!rect || ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0 || rect.x < base.x || rect.y < base.y || rect.x + rect.width > base.x + base.width + 0.5 || rect.y + rect.height > base.y + base.height + 0.5)
    throw new JoploError('USAGE', 'Crop must be a visible positive rectangle fully inside the export canvas');
  return screenshot(rect);
}
export function geometryQuery(o: { logicalViewport?: { width: number; height: number }; noFrame?: boolean }) {
  const v = o.logicalViewport;
  if (v && (![v.width, v.height].every(n => Number.isInteger(n) && n > 0 && n <= 8192))) throw new JoploError('USAGE', 'Logical viewport dimensions must be integers from 1 to 8192');
  return { ...(v ? { vw: String(v.width), vh: String(v.height) } : {}), ...(o.noFrame ? { noframe: '1' } : {}) };
}
