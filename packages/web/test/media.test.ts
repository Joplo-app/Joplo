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
