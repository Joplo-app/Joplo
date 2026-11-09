import { expect, it, vi } from 'vitest';
import { MediaCache } from '../src/runtime/media-cache';
it('bounds encoded/PCM LRU bytes, pins active leases, deduplicates, retries failures and drains on dispose',async()=>{
 let active=0,peak=0,calls=0;
 const cache=new MediaCache({budgetBytes:200,concurrency:1});
 const load=async()=>{active++;peak=Math.max(peak,active);calls++;await new Promise(r=>setTimeout(r,1));active--;return {value:{},bytes:80};};
 const first=cache.acquire('a',load);await first.value;
 for(let i=0;i<40;i++){const lease=cache.acquire(String(i),load);await lease.value;lease.release();}
 expect(cache.status().bytes).toBeLessThanOrEqual(200);expect(peak).toBe(1);
 const a=cache.acquire('a',load),b=cache.acquire('a',load);await Promise.all([a.value,b.value]);expect(calls).toBe(41);
 a.release();b.release();first.release();
 const bad=cache.acquire('bad',async()=>{throw new Error('transient')});await expect(bad.value).rejects.toThrow('transient');bad.release();
 const retry=cache.acquire('bad',load);await retry.value;retry.release();
 const huge=cache.acquire('10-minute',async()=>({value:{},bytes:211680000}));await expect(huge.value).rejects.toThrow(/budget/);huge.release();
 cache.dispose();expect(cache.status()).toMatchObject({bytes:0,entries:0,queued:0});
});
