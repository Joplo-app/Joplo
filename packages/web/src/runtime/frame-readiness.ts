/** The host owns async presentation lifetime; it never advances the engine clock to finish a task. */
export class FrameReadiness {
  private entries=new Map<object,{owner:object;controller:AbortController;pending:boolean;error:string|null;label:string}>();
  private generation:string|null=null;
  private revision=0;
  advance(generation:string){if(this.generation===null){this.generation=generation;return;}if(this.generation===generation)return;this.dispose();this.generation=generation;}
  register(owner:object,task:(signal:AbortSignal)=>Promise<void>,label:string):()=>void {
    const token={},controller=new AbortController();
    const entry={owner,controller,pending:true,error:null as string|null,label};this.entries.set(token,entry);this.revision++;
    const cancel=()=>{this.entries.delete(token);this.revision++;controller.abort();};
    try {
      Promise.resolve(task(controller.signal)).then(()=>{if(this.entries.get(token)===entry){this.entries.delete(token);this.revision++;}},error=>{
        if(this.entries.get(token)!==entry)return;
        if(controller.signal.aborted){this.entries.delete(token);this.revision++;return;}
        entry.pending=false;entry.controller.abort();entry.error=`${label}: ${error instanceof Error?error.message:String(error)}`;
      });
    }catch(error){entry.pending=false;entry.controller.abort();entry.error=`${label}: ${error instanceof Error?error.message:String(error)}`;}
    return cancel;
  }
  cancelOwner(owner:object){for(const [token,e]of this.entries)if(e.owner===owner){this.entries.delete(token);this.revision++;e.controller.abort();}}
  dispose(){for(const e of this.entries.values())e.controller.abort();this.entries.clear();this.revision++;}
  status(){return {revision:this.revision,pending:[...this.entries.values()].filter(e=>e.pending).length,error:[...this.entries.values()].find(e=>e.error)?.error??null};}
}
