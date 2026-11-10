/** Pure migration oracle for pre-change captures. Never used to read legacy IR at runtime. */
export function mapV2Capture(input: any): any {
  const p = input.project;
  if (!p) throw new Error('Baseline must contain compiled IR');
  const independent = Object.values(p.features).filter((f: any) => f.standalone) as any[];
  const id = (value: string) => {
    for (const f of independent) if (value === `${f.id}.main` || value.startsWith(`${f.id}.main.`) || value.startsWith(`${f.id}.main@`) || value.startsWith(`${f.id}.main~`)) return f.id + value.slice(`${f.id}.main`.length);
    return value;
  };
  const references = new Set(['id','optionId','optionIds','workId','workIds','featureIds','entryIds','pick','sceneId','scenarioId','scenarioIds','from','addedBy']);
  const tables = new Set(['options','works','scenes','scenarios','rules','issues']);
  const authored = new Set(['props','ui','data','inputs']);
  const walk = (v: any, key = ''): any => authored.has(key) ? structuredClone(v) : Array.isArray(v) ? v.map(x => walk(x, key)) : v && typeof v === 'object'
    ? Object.fromEntries(Object.entries(v).map(([k,x]) => [tables.has(key) ? id(k) : k === 'optionId' ? 'workId' : k === 'optionIds' ? 'workIds' : k === 'featureIds' ? 'entryIds' : k === 'options' ? 'works' : k, walk(x, k)]))
    : typeof v === 'string' ? key === 'source' || key === 'at' ? v.replaceAll('/options/', '/works/') : references.has(key) ? id(v) : key === 'kind' && v === 'option' ? 'work' : v : v;
  const out = walk(input), q = out.project;
  q.schemaVersion = 3;
  for (const [fid, f] of Object.entries(q.features) as [string, any][]) {
    if (f.standalone) { delete q.features[fid]; continue; }
    f.alternatives = Object.fromEntries(f.workIds.map((wid: string) => {
      const w = q.works[wid]; return [wid, {decisionFocus:w.decisionFocus ?? '',tradeoffs:w.tradeoffs ?? [],coverage:w.coverage}];
    }));
  }
  for (const w of Object.values(q.works) as any[]) {
    const f = independent.find(f => f.id === w.featureId);
    w.title=w.name; w.summary=w.idea; w.roles=f ? walk(f.roles) : [];
    delete w.name; delete w.idea; delete w.decisionFocus; delete w.tradeoffs; delete w.coverage;
    if (f) { w.key=f.id; delete w.featureId; if(f.audience)w.audience=f.audience; if(f.draft)w.draft=true; }
  }
  // The blank-page marker is the explicit, authorized exception to pure renaming.
  for (const r of Object.values(q.routes) as any[]) if (r.title === ' ') r.title='__joplo_internal_blank__';
  for (const s of Object.values(q.scenes) as any[]) if (s.name === ' ' || s.name.startsWith('  · ')) s.name='__joplo_internal_blank__'+s.name.slice(1);
  for (const d of out.diagnostics) d.message=d.message.replace(/\bOptions\b/g,'Works').replace(/\bOption\b/g,'Work').replace(/\boptions\b/g,'works').replace(/\boption\b/g,'work');
  return out;
}
