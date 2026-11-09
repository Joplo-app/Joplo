export type Note = { start: number; end: number; pitch: number; velocity: number; program: number; channel: number };
export type Score = { notes: Note[]; duration: number };
/** SMF 0/1, PPQN, global tempo map, running status, program and sustain. Times are milliseconds. */
export function parseMidi(bytes: Uint8Array): Score {
  let p = 0;
  const u8 = () => { if (p >= bytes.length) throw new Error('Truncated MIDI'); return bytes[p++]!; };
  const n = (length: number) => { let v = 0; for (let i=0;i<length;i++) v = v * 256 + u8(); return v; };
  const tag = () => String.fromCharCode(u8(),u8(),u8(),u8());
  const vlq = () => { let v=0; for(let i=0;i<4;i++){ const b=u8(); v=(v<<7)|(b&127); if(!(b&128))return v; } throw new Error('Invalid MIDI variable integer'); };
  if (tag() !== 'MThd') throw new Error('Missing MIDI header');
  const header = n(4), format=n(2), tracks=n(2), ppqn=n(2);
  if (header < 6 || format > 1 || !ppqn || ppqn & 0x8000) throw new Error('Unsupported MIDI format/time division');
  p += header - 6;
  const events: {tick:number; order:number; type:number; a:number; b:number; track:number}[]=[];
  for (let t=0;t<tracks;t++) {
    if(tag()!=='MTrk')throw new Error('Missing MIDI track');
    const end=p+4+n(4); if(end>bytes.length)throw new Error('Truncated MIDI track');
    let tick=0,status=0;
    while(p<end){
      tick+=vlq(); let b=u8(); if(b&128)status=b; else { if(!status || status>=0xf0)throw new Error('Invalid running status'); p--; }
      if(status===0xff){ const type=u8(), len=vlq(); if(p+len>end)throw new Error('Invalid meta event'); if(type===0x51 && len===3)events.push({tick,order:events.length,type:0xff,a:n(3),b:0,track:t}); else p+=len; status=0; }
      else if(status===0xf0||status===0xf7){ const len=vlq(); p+=len; status=0; }
      else { const type=status>>4, channel=status&15; if(type<8||type>14)throw new Error('Invalid channel event'); const a=u8(), b=type===12||type===13?0:u8(); events.push({tick,order:events.length,type:status,a,b,track:t}); if(channel>15)throw new Error('Invalid channel'); }
      if(p>end)throw new Error('MIDI event exceeds track');
    }
    events.push({tick,order:events.length,type:0,a:0,b:0,track:t});
  }
  events.sort((a,b)=>a.tick-b.tick||a.order-b.order);
  let tick=0,time=0,tempo=500000;
  const programs=new Map<number,number>(), active=new Map<string,Note[]>(), sustain=new Set<number>(), released=new Set<Note>(), notes:Note[]=[];
  for(const e of events){ time+=(e.tick-tick)*tempo/ppqn/1000; tick=e.tick;
    if(e.type===255){tempo=e.a;continue;} const ch=e.type&15,type=e.type>>4, key=`${ch}:${e.a}`;
    if(type===12)programs.set(ch,e.a);
    if(type===9&&e.b){ const note={start:time,end:time,pitch:e.a,velocity:e.b/127,program:programs.get(ch)??0,channel:ch}; notes.push(note); active.set(key,[...(active.get(key)??[]),note]); }
    if(type===8||type===9&&!e.b){ const note=active.get(key)?.shift(); if(note){if(sustain.has(ch))released.add(note);else note.end=time;} }
    if(type===11&&e.a===64){if(e.b>=64)sustain.add(ch);else {sustain.delete(ch);for(const note of released)if(note.channel===ch){note.end=time;released.delete(note);}}}
  }
  for(const note of notes)if(note.end<=note.start)note.end=Math.max(note.start+100,time);
  return { notes, duration:notes.reduce((max,n)=>Math.max(max,n.end),Math.max(1,time)) };
}
