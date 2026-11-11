import type { AudioRegion } from '@joplo-app/kit/plugin';
/** Same controlled local-resource protocol for music and supplied narration; no generation authorization. */
export async function audioResource(url: string): Promise<{ bytes: Uint8Array; audio?: AudioRegion }> {
  let data = url, audio: AudioRegion | undefined;
  if (/^\/__joplo\/p\/[^/]+\/resources\//.test(url)) {
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-joplo-token': document.querySelector<HTMLMetaElement>('meta[name="joplo-token"]')?.content ?? '' }, body: '{}' });
    if (!response.ok) throw new Error('Audio resource is unavailable; prepare it before playback');
    const result = await response.json(); data = result.url; audio = result.audio;
  } else if (!url.startsWith('data:')) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error('Audio resource is unavailable');
    return { bytes: new Uint8Array(await response.arrayBuffer()) };
  }
  if (typeof data !== 'string' || !/^data:[^;,]+;base64,/.test(data)) throw new Error('Audio resource has no embedded bytes');
  return { bytes: Uint8Array.from(atob(data.slice(data.indexOf(',') + 1)), c => c.charCodeAt(0)), ...(audio ? { audio } : {}) };
}
