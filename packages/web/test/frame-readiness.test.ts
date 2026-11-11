import {expect,it} from 'vitest';
import {FrameReadiness} from '../src/runtime/frame-readiness';
it('waits all current tasks, aborts replaced generations and ignores late completion/rejection',async()=>{
 const registry=new FrameReadiness(),a={},b={};let finish!:()=>void,late!:(e:Error)=>void,signal!:AbortSignal;
 registry.advance('1');registry.register(a,s=>{signal=s;return new Promise((_r,j)=>{late=j;});},'old');
 registry.advance('2');expect(signal.aborted).toBe(true);
 registry.register(a,async()=>{},'a');registry.register(b,()=>new Promise(r=>{finish=r;}),'b');
 late(new Error('stale'));await Promise.resolve();expect(registry.status()).toMatchObject({pending:1,error:null});
 finish();await Promise.resolve();expect(registry.status()).toMatchObject({pending:0,error:null});
});
it('propagates rejection and releases owner/cancellation without leaking resources',async()=>{
 const registry=new FrameReadiness(),owner={};let signal!:AbortSignal;
 registry.register(owner,async s=>{signal=s;throw Error('decode');},'clip');await Promise.resolve();
 expect(signal.aborted).toBe(true);expect(registry.status()).toMatchObject({pending:0,error:'clip: decode'});
 registry.cancelOwner(owner);expect(registry.status()).toMatchObject({pending:0,error:null});
 const cancel=registry.register(owner,s=>{signal=s;return new Promise(()=>{});},'waiting');cancel();expect(signal.aborted).toBe(true);expect(registry.status().pending).toBe(0);
 registry.register(owner,()=>new Promise(()=>{}),'unmount');registry.cancelOwner(owner);expect(registry.status().pending).toBe(0);
});
it('retains additional tasks registered while another current task completes',async()=>{
 const r=new FrameReadiness(),owner={};let done!:()=>void;
 r.register(owner,async()=>{r.register(owner,()=>new Promise(resolve=>{done=resolve;}),'second');},'first');
 await Promise.resolve();expect(r.status().pending).toBe(1);done();await Promise.resolve();expect(r.status().pending).toBe(0);
});
