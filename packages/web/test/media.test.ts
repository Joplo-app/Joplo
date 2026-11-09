import { afterEach, expect, it, vi } from 'vitest';
import { MediaEngine } from '../src/runtime/media';
const mock = vi.hoisted(() => ({ update: vi.fn(), destroy: vi.fn(), factory: vi.fn() }));
vi.mock('../src/renderer/plugins', () => ({ pluginStatus: () => ({ state: 'ready', runtime: { media: mock.factory } }) }));
class FakeAudio {
  static gains: any[] = [];
  currentTime=1; state='suspended'; destination={};
  resume(){this.state='running';return Promise.resolve();} close(){this.state='closed';return Promise.resolve();}
  createGain(){const node={gain:{value:0,setTargetAtTime:vi.fn()},connect:vi.fn(),disconnect:vi.fn()};FakeAudio.gains.push(node);return node;}
}
const snapshot = { 'fake:bgm': { plugin:'fake',resource:'r',offsetMs:4000,volume:.4,loop:true,fadeInMs:200 } };
const frame = {playing:true,enabled:true,speed:1,elapsedMs:250,duck:false,identity:'s'};
afterEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks();FakeAudio.gains=[];});
it('requires a gesture, consumes only bytes, pauses/resumes/seeks, ducks and mutes', async()=>{
 vi.stubGlobal('AudioContext',FakeAudio); mock.factory.mockResolvedValue({update:mock.update,destroy:mock.destroy});
 const engine=new MediaEngine();const assets={r:'data:audio/wav;base64,UklGRg=='};
 engine.update(snapshot,assets,frame);expect(mock.factory).not.toHaveBeenCalled();expect(engine.status().state).toBe('locked');
 engine.unlock();engine.update(snapshot,assets,frame);await new Promise(r=>setTimeout(r,0));engine.update(snapshot,assets,frame);
 expect(mock.factory.mock.calls[0]![0].bytes).toEqual(new Uint8Array([82,73,70,70]));
 expect(mock.update).toHaveBeenLastCalledWith({offsetMs:4250,volume:1,loop:true,speed:1,playing:true});
 engine.update(snapshot,assets,{...frame,playing:false});expect(mock.update.mock.lastCall?.[0].playing).toBe(false);
 engine.update(snapshot,assets,{...frame,speed:2,elapsedMs:750,duck:true});
 expect(mock.update.mock.lastCall?.[0]).toMatchObject({offsetMs:4750,speed:2,playing:true});
 expect(FakeAudio.gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(.1,1,.015);
 engine.update(snapshot,assets,{...frame,elapsedMs:0});expect(mock.update.mock.lastCall?.[0].offsetMs).toBe(4000);
 engine.update({'fake:bgm':{...snapshot['fake:bgm'],offsetMs:12000,startOffsetMs:12000,fadeInMs:1000}},assets,frame);
 expect(FakeAudio.gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(.1,1,.015);
 engine.update(snapshot,assets,{...frame,enabled:false});expect(mock.destroy).toHaveBeenCalledTimes(1);
 engine.destroy();
});
it('fades stop snapshots and destroys asynchronous drivers after leaving a scenario',async()=>{
 vi.stubGlobal('AudioContext',FakeAudio);let finish!:(x:any)=>void;mock.factory.mockImplementation(()=>new Promise(r=>finish=r));
 const engine=new MediaEngine();engine.unlock();const assets={r:'data:audio/wav;base64,UklGRg=='};
 engine.update({'fake:bgm':{...snapshot['fake:bgm'],stopAfterMs:500}},assets,frame);
 await new Promise(r=>setTimeout(r,0));expect(FakeAudio.gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(.2,1,.015);
 engine.update({},assets,{...frame,identity:'other'});finish({update:mock.update,destroy:mock.destroy});
 await new Promise(r=>setTimeout(r,0));expect(mock.destroy).toHaveBeenCalledTimes(1);expect(engine.status().tracks).toBe(0);engine.destroy();
});
it('diagnostic-only updates preserve the exact project object and reject stale generations', async()=>{
 const {withDiagnostics}=await import('../src/runtime/dev-client');
 const payload:any={version:4,project:{scenarios:{}},ok:true,home:null,diagnostics:[]};
 const diagnostic:any={severity:'warning',code:'LOCAL_RESOURCE_FAILED',at:'score.ts:8:1',source:'structure',message:'Tool missing'};
 const next=withDiagnostics(payload,{projectId:'p',version:4,diagnostics:[diagnostic]})!;
 expect(next.project).toBe(payload.project);expect(next.version).toBe(4);expect(next.ok).toBe(true);expect(next.diagnostics).toEqual([diagnostic]);
 expect(withDiagnostics(next,{projectId:'p',version:3,diagnostics:[]})).toBe(next);
 expect(withDiagnostics(next,{projectId:'p',version:4,diagnostics:[]})!.diagnostics).toEqual([]);
});
it('keeps a track continuous on the engine clock across step snapshots and adopts the old slot for a crossfade (D92)', async () => {
  vi.stubGlobal('AudioContext', FakeAudio); mock.factory.mockImplementation(async () => ({ update: mock.update, destroy: mock.destroy }));
  const engine = new MediaEngine(); engine.unlock();
  const assets = { a: 'data:audio/wav;base64,UklGRg==', b: 'data:audio/wav;base64,UklGRh==' };
  const A = { plugin: 'fake', resource: 'a', offsetMs: 0, volume: .5, loop: true, fadeInMs: 0 };
  engine.update({ 'fake:bgm': A }, assets, { ...frame, elapsedMs: 0, timeMs: 1000 });
  await new Promise(r => setTimeout(r, 0));
  engine.update({ 'fake:bgm': A }, assets, { ...frame, elapsedMs: 5000, timeMs: 6000 });
  expect(mock.update.mock.lastCall?.[0].offsetMs).toBe(5000);
  // 下一步的快照按估算写了 3000 ms（编译期不知道真实时长）：同一个 epoch 里以引擎时钟为准，不回跳
  engine.update({ 'fake:bgm': { ...A, offsetMs: 3000 } }, assets, { ...frame, elapsedMs: 0, timeMs: 6000 });
  expect(mock.update.mock.lastCall?.[0].offsetMs).toBe(5000);
  engine.update({ 'fake:bgm': { ...A, offsetMs: 3000 } }, assets, { ...frame, elapsedMs: 100, timeMs: 6100 });
  expect(mock.update.mock.lastCall?.[0].offsetMs).toBe(5100);
  expect(mock.factory).toHaveBeenCalledTimes(1);
  // 交叉淡化：旧曲换到 >a 键继续（不重建驱动），新曲另起一条
  engine.update({ 'fake:bgm': { ...A, resource: 'b', fadeInMs: 800 }, 'fake:bgm>a': { ...A, offsetMs: 3000, stopAfterMs: 800 } }, assets, { ...frame, elapsedMs: 0, timeMs: 6100 });
  await new Promise(r => setTimeout(r, 0));
  expect(mock.factory).toHaveBeenCalledTimes(2);
  expect(mock.destroy).not.toHaveBeenCalled();
  expect(engine.status().tracks).toBe(2);
  // 换 epoch（跳转）才按快照重新定位
  engine.update({ 'fake:bgm': { ...A, offsetMs: 3000 } }, assets, { ...frame, identity: 'jump', elapsedMs: 0, timeMs: 9000 });
  await new Promise(r => setTimeout(r, 0));
  engine.update({ 'fake:bgm': { ...A, offsetMs: 3000 } }, assets, { ...frame, identity: 'jump', elapsedMs: 0, timeMs: 9000 });
  expect(mock.update.mock.lastCall?.[0].offsetMs).toBe(3000);
  engine.destroy();
});

// 评审 RF7：淡出用引擎时间锚定；实际停留比编译期估算长时，已经淡完的旧曲在下一步提交时不能复活
it('anchors a crossfade fade-out on engine time so a finished fade never comes back on the next commit (D92 R2)', async () => {
  vi.stubGlobal('AudioContext', FakeAudio); mock.factory.mockImplementation(async () => ({ update: mock.update, destroy: mock.destroy }));
  const engine = new MediaEngine(); engine.unlock();
  const assets = { a: 'data:audio/wav;base64,UklGRg==', b: 'data:audio/wav;base64,UklGRh==' };
  const A = { plugin: 'fake', resource: 'a', offsetMs: 0, volume: .5, loop: true, fadeInMs: 0 };
  const f = { playing: true, enabled: true, speed: 1, elapsedMs: 0, timeMs: 0, duck: false, identity: 's' };
  engine.update({ 'fake:bgm': A }, assets, f); await new Promise(r => setTimeout(r, 0));
  const cross = { 'fake:bgm': { ...A, resource: 'b', fadeInMs: 2600 }, 'fake:bgm>a': { ...A, stopAfterMs: 2600 } };
  engine.update(cross, assets, { ...f, timeMs: 5000 }); await new Promise(r => setTimeout(r, 0));
  engine.update(cross, assets, { ...f, timeMs: 6300, elapsedMs: 1300 });
  const old = FakeAudio.gains[0];
  expect(old.gain.setTargetAtTime.mock.lastCall[0]).toBeCloseTo(.25, 5); // 一半
  engine.update(cross, assets, { ...f, timeMs: 9000, elapsedMs: 4000 });
  expect(old.gain.setTargetAtTime.mock.lastCall[0]).toBe(0);
  // 下一步：编译期只推进了 hold 1.2 s，快照里淡出键还在、stopAfterMs 1400、volume 已按估算缩小
  const { advanceMedia } = await import('../../core/src/media.ts');
  engine.update(advanceMedia(cross, 1200), assets, { ...f, timeMs: 9000, elapsedMs: 0 });
  engine.update(advanceMedia(cross, 1200), assets, { ...f, timeMs: 9500, elapsedMs: 500 });
  expect(old.gain.setTargetAtTime.mock.lastCall[0]).toBe(0);
  expect(mock.update.mock.calls.filter(c => c[0].playing).length).toBeGreaterThan(0);
  // 新曲的淡入同样按引擎时间：5000 起淡入 2600 → 6300 时一半
  const fresh = FakeAudio.gains[1];
  expect(fresh.gain.setTargetAtTime.mock.calls.find((c: number[]) => c[0] > 0)).toBeTruthy();
  // 再次 play 同一首（快照里没有淡出）才重新启用
  engine.update({ 'fake:bgm': { ...A, resource: 'b' }, 'fake:bgm>a': { ...A } }, assets, { ...f, timeMs: 9600, elapsedMs: 0 });
  expect(old.gain.setTargetAtTime.mock.lastCall[0]).toBe(.5);
  engine.destroy();
});
it('an anchored fade continues smoothly when the step is shorter than its hold, ducks with narration, and survives a relay chapter (D92 R2)', async () => {
  vi.stubGlobal('AudioContext', FakeAudio); mock.factory.mockImplementation(async () => ({ update: mock.update, destroy: mock.destroy }));
  const { advanceMedia } = await import('../../core/src/media.ts');
  const engine = new MediaEngine(); engine.unlock();
  const assets = { a: 'data:audio/wav;base64,UklGRg==', b: 'data:audio/wav;base64,UklGRh==' };
  const A = { plugin: 'fake', resource: 'a', offsetMs: 0, volume: .8, loop: true, fadeInMs: 0 };
  const f = { playing: true, enabled: true, speed: 1, elapsedMs: 0, timeMs: 0, duck: false, identity: 's' };
  engine.update({ 'fake:bgm': A }, assets, f); await new Promise(r => setTimeout(r, 0));
  const cross = { 'fake:bgm': { ...A, resource: 'b', fadeInMs: 2000 }, 'fake:bgm>a': { ...A, stopAfterMs: 2000 } };
  engine.update(cross, assets, { ...f, timeMs: 1000 }); await new Promise(r => setTimeout(r, 0));
  const old = FakeAudio.gains[0], fresh = FakeAudio.gains[1];
  // 这一步只停了 500 ms（比编译期的 hold 3 s 短），下一步快照仍按 hold 推进：淡出继续按引擎时间走，不跳
  const next = advanceMedia(cross, 3000);
  engine.update(next, assets, { ...f, timeMs: 1500, elapsedMs: 0 });
  expect(old.gain.setTargetAtTime.mock.lastCall[0]).toBeCloseTo(.6, 5); // 0.8 × (1 − 500/2000)
  // 旁白压低：同一时刻乘 0.25
  engine.update(next, assets, { ...f, timeMs: 2000, elapsedMs: 500, duck: true });
  expect(old.gain.setTargetAtTime.mock.lastCall[0]).toBeCloseTo(.1, 5); // 0.8 × 0.5 × 0.25
  expect(fresh.gain.setTargetAtTime.mock.lastCall[0]).toBeCloseTo(.1, 5); // 新曲淡入一半 × 0.25
  // 接力到下一章（同一个 seek）：新曲继续、旧曲按原时间淡完，不重新开始
  engine.update({ 'fake:bgm': { ...A, resource: 'b', fadeInMs: 2000 } }, assets, { ...f, timeMs: 3200, elapsedMs: 0 });
  expect(fresh.gain.setTargetAtTime.mock.lastCall[0]).toBeCloseTo(.8, 5);
  expect(mock.factory).toHaveBeenCalledTimes(2);
  engine.destroy();
});
