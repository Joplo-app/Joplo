import { fixtureConfig as config } from '../../../scripts/test/fixtures.ts';
/**
 * 媒体插件（D96 原型）端到端：<Video>/<Lottie> 的 asset() 数据 → playClip 校验时段、按时长给 holdMs → Step.effectHold
 * → frame 得到每一步每个片段停在哪里（ext.media.clips）；没播的步骤停在上一次的终点。
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { feature, flow, work, page } from '@joplo-app/kit';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { compile, type AuthoringProject } from '@joplo-app/core';
import media, { Video, playClip } from '../src/plugin.ts';
import { durationOf, lottieInfo, mp4DurationSec } from '../src/model.ts';

const dir = path.resolve(import.meta.dirname, '../../../examples/media-upload/assets');
const mp4 = fs.readFileSync(path.join(dir, 'upload.mp4'));
const json = fs.readFileSync(path.join(dir, 'success.json'));
const MP4 = `data:video/mp4;base64,${mp4.toString('base64')}`;
const LOTTIE = `data:application/json;base64,${json.toString('base64')}`;
const WEBM = 'data:video/webm;base64,GkXfo0AgQoaBAUL3gQFC8oEEQvOBCEKCQAR3ZWJtQoeBAkKFgQIYU4BnQI0VSalmQCgq17FAAw9CQE2AQAZ3aGFtbXlXQUAGd2hhbW15RIlACECPQAAAAAAAFlSua0AxrkAu14EBY8WBAZyBACK1nEADdW5khkAFVl9WUDglhohAA1ZQOIOBAeBABrCBCLqBCB9DtnVAIueBAKNAHIEAAIAwAQCdASoIAAgAAUAmJaQAA3AA/vz0AAA=';

function project(steps: (f: ReturnType<typeof flow>) => ReturnType<typeof flow>) {
  const file = '/p/a.tsx';
  const src: AuthoringProject = { root: '/p', config: { ...config({ name: 'T', home: '/', plugins: [media] }), file }, layouts: {},
    routes: { '/': { ...page({ title: 'Home', layout: false }, jsx(Video, { id: 'rec', src: MP4 })), file } },
    features: { f: { def: { ...feature({ name: 'F', goal: 'g', cases: {}, pick: 'a' }), file }, works: { a: { ...work({ title: 'A', summary: 'i', layers: {}, scenarios: { s: steps(flow('S', { start: '/' })) } }), file } } } } };
  return compile(src, 'dev');
}
const clipAt = (r: ReturnType<typeof project>, i: number, id = 'rec') => ((i ? r.project!.scenarios['f.a.s']!.steps[i - 1]!.ext : r.project!.scenarios['f.a.s']!.ext) as { media: { clips: Record<string, unknown> } }).media.clips[id];

describe('model', () => {
  it('MP4 时长读 mvhd；Lottie 读帧率与起止帧；WebM 未知', () => {
    expect(mp4DurationSec(Uint8Array.from(mp4))).toBeCloseTo(6, 1);
    expect(lottieInfo(JSON.parse(json.toString()))).toMatchObject({ fr: 30, ip: 0, op: 60, durationSec: 2 });
    expect(durationOf(MP4)).toBeCloseTo(6, 1);
    expect(durationOf(LOTTIE)).toBe(2);
    expect(durationOf(WEBM)).toBeNull();
    expect(lottieInfo({ fr: 30 })).toBeNull();
  });
});

describe('compile', () => {
  it('playClip：这一步播放 from→to，holdMs 按时长；之后的步骤停在终点；再播从上次停的地方接着播', () => {
    const r = project((f) => f.system('A', 'a', playClip('rec', { to: 2 })).system('B', 'b').system('C', 'c', playClip('rec')));
    expect(r.diagnostics.filter((d) => d.severity === 'error').map((d) => `${d.code}: ${d.message}`)).toEqual([]);
    expect(clipAt(r, 0)).toEqual({ from: 0, to: 0, live: false });
    expect(clipAt(r, 1)).toEqual({ from: 0, to: 2, live: true });
    expect(clipAt(r, 2)).toEqual({ from: 2, to: 2, live: false });
    const c = clipAt(r, 3) as { from: number; to: number; live: boolean };
    expect(c.from).toBe(2);
    expect(c.to).toBeCloseTo(6, 1);
    expect(c.live).toBe(true);
    const steps = r.project!.scenarios['f.a.s']!.steps;
    expect(steps[0]!.effectHold).toBe(2300);
    expect(steps[1]!.effectHold).toBeUndefined();
    expect(steps[0]!.references).toContain('rec');
  });
  it('诊断：未知片段、时间越界、from ≥ to', () => {
    const codes = (f: (x: ReturnType<typeof flow>) => ReturnType<typeof flow>) => project(f).diagnostics.map((d) => d.code);
    expect(codes((f) => f.system('A', 'a', playClip('nope')))).toContain('MEDIA_UNKNOWN');
    expect(codes((f) => f.system('A', 'a', playClip('rec', { to: 99 })))).toContain('MEDIA_TIME_INVALID');
    expect(codes((f) => f.system('A', 'a', playClip('rec', { from: 3, to: 2 })))).toContain('MEDIA_TIME_INVALID');
    expect(codes((f) => f.system('A', 'a', playClip('rec', { from: -1 })))).toContain('MEDIA_TIME_INVALID');
  });
});
