/** Leased LRU: pinned entries cannot be evicted; allocation concurrency and bytes are bounded. */
export class MediaCache<T = unknown> {
  private entries = new Map<string, { refs:number; used:number; bytes:number; value:Promise<T>; reject:(e:Error)=>void }>();
  private queue: (()=>void)[] = [];
  private active = 0; private clock = 0; private disposed = false;
  constructor(private limits: { budgetBytes:number; concurrency:number; maxEntries?:number; label?:string }) {}
  private room(bytes:number, except?:string) {
    const used=()=>[...this.entries].reduce((n,[k,e])=>n+(k===except?0:e.bytes),0);
    for(const [key] of [...this.entries].filter(([k,e])=>k!==except&&!e.refs).sort((a,b)=>a[1].used-b[1].used)) {
      if(used()+bytes<=this.limits.budgetBytes && this.entries.size<=(this.limits.maxEntries??32)) break;
      this.entries.delete(key);
    }
    if(bytes>this.limits.budgetBytes || used()+bytes>this.limits.budgetBytes) throw new Error(`Media ${this.limits.label ?? 'cache'} budget exceeded: needs ${bytes} new bytes, ${used()} bytes already retained, limit ${this.limits.budgetBytes} bytes (${this.limits.budgetBytes/1048576} MiB). ${this.limits.label==='encoded audio'?'Transcode large WAV/PCM to lossless FLAC or a smaller supported format; splitting does not reduce simultaneous encoded bytes.':'Shorten simultaneous audio, finish fades before another cue, or reduce decoded duration/channels.'}`);
  }
  acquire(key:string, load:()=>Promise<{value:T;bytes:number}>, estimate=0) {
    let e=this.entries.get(key);
    if(!e) {
      let resolve!:(v:T)=>void, reject!:(e:Error)=>void;
      const value=new Promise<T>((r,j)=>{resolve=r;reject=j;});
      e={refs:0,used:++this.clock,bytes:estimate,value,reject};const entry=e;
      this.entries.set(key,e);
      const run=()=>{
        if(this.disposed || this.entries.get(key)!==entry) {reject(new Error('Media cache disposed'));return;}
        try {this.room(estimate,key);}catch(err){this.entries.delete(key);reject(err as Error);return;}
        this.active++;
        void load().then(result=>{
          if(this.disposed) throw new Error('Media cache disposed');
          this.room(result.bytes,key);entry.bytes=result.bytes;resolve(result.value);
        }).catch(err=>{if(this.entries.get(key)===entry)this.entries.delete(key);reject(err);}).finally(()=>{this.active--;this.pump();});
      };
      this.queue.push(run);
    }
    e.refs++;e.used=++this.clock;const entry=e;let released=false;
    this.pump();
    return {value:e.value,release:()=>{if(released)return;released=true;entry.refs--;try{this.room(0);}catch{/* pinned entries are released by their owners */}}};
  }
  private pump(){while(!this.disposed&&this.active<this.limits.concurrency&&this.queue.length)this.queue.shift()!();}
  status(){return {bytes:[...this.entries.values()].reduce((n,e)=>n+e.bytes,0),entries:this.entries.size,queued:this.queue.length,active:this.active,pinned:[...this.entries.values()].filter(e=>e.refs>0).length};}
  dispose(){this.disposed=true;for(const e of this.entries.values())e.reject(new Error('Media cache disposed'));this.entries.clear();this.queue=[];}
}
