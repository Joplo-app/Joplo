/** Deterministic synthesis parameters, sampled in score time so a seek does not re-strike a held note. */
export type VoiceProfile = { wave: OscillatorType; harmonics?: number[]; attackMs: number; decayMs: number | null; releaseMs: number; brightHz: number; darkHz: number; darkenMs: number; gain: number };
export function voiceProfile(program: number): VoiceProfile {
  const family=Math.floor(program/8);
  const piano: VoiceProfile={wave:'custom',harmonics:[0,1,.48,.22,.13,.07,.035,.018],attackMs:7,decayMs:650,releaseMs:90,brightHz:6500,darkHz:1100,darkenMs:220,gain:1};
  if(family===0)return piano;
  if(family===1)return {...piano,harmonics:[0,1,.12,.55,.08,.2],decayMs:450,brightHz:9000,darkHz:3000};
  if(family===3||family===4)return {...piano,harmonics:[0,1,.28,.17,.08,.04],decayMs:family===3?400:1000,darkHz:900};
  if(family===2)return {...piano,harmonics:[0,1,.5,.25,.14],attackMs:12,decayMs:null,brightHz:5000,darkHz:5000};
  if(family===5||family===6||family===7)return {...piano,wave:'sawtooth',harmonics:undefined,attackMs:family===5?75:30,decayMs:null,releaseMs:150,brightHz:2400,darkHz:1800,gain:.5};
  return {...piano,wave:'triangle',harmonics:undefined,attackMs:25,decayMs:null,releaseMs:110,brightHz:4000,darkHz:4000,gain:.8};
}
export function envelopeTimes(profile: VoiceProfile, durationMs: number) {
  const attack=Math.min(profile.attackMs,durationMs*.2);
  return {attack,release:Math.max(attack,durationMs-Math.min(profile.releaseMs,durationMs*.25))};
}
export function envelopeAt(profile: VoiceProfile, ageMs: number, durationMs: number): number {
  if(ageMs<=0||ageMs>=durationMs||durationMs<=0)return 0;
  const {attack,release}=envelopeTimes(profile,durationMs);
  if(ageMs<attack)return ageMs/attack;
  const body=(time:number)=>profile.decayMs?Math.exp(-(time-attack)/profile.decayMs):1;
  return ageMs<release?body(ageMs):body(release)*(durationMs-ageMs)/(durationMs-release);
}
export function cutoffAt(profile: VoiceProfile, ageMs: number): number {
  return profile.darkHz+(profile.brightHz-profile.darkHz)*Math.exp(-Math.max(0,ageMs)/profile.darkenMs);
}
/** AudioParam automation uses the same analytic curve as envelopeAt, including mid-note entry. */
export function scheduleEnvelope(param: AudioParam, profile: VoiceProfile, ageMs: number, durationMs: number, when: number, speed: number, peak: number) {
  const {attack,release}=envelopeTimes(profile,durationMs);
  const at=(time:number)=>when+Math.max(0,time-ageMs)/1000/speed;
  param.setValueAtTime(peak*envelopeAt(profile,ageMs,durationMs),when);
  if(ageMs<attack)param.linearRampToValueAtTime(peak,at(attack));
  if(profile.decayMs&&ageMs<release)param.setTargetAtTime(0,at(Math.max(attack,ageMs)),profile.decayMs/1000/speed);
  if(ageMs<release)param.setValueAtTime(peak*envelopeAt(profile,release,durationMs),at(release));
  param.linearRampToValueAtTime(0,at(durationMs));
}
