import { defineRuntime, type MediaDriver } from '@joplo-app/kit/plugin';
import { parseMidi } from './midi.ts';
import { voiceProfile, cutoffAt, scheduleEnvelope } from './synth.ts';

/** Offline synthesis: score-relative attack/decay and harmonics, with no soundfont downloads. */
export default defineRuntime({
  id: 'alda',
  components: {},
  media({ audio, destination, bytes }): MediaDriver {
    const score = parseMidi(bytes);
    const mix = audio.createDynamicsCompressor();
    mix.threshold.value = -10; mix.knee.value = 12; mix.ratio.value = 12;
    mix.attack.value = .003; mix.release.value = .15; mix.connect(destination);
    const waves = new Map<number, PeriodicWave>();
    const voices = new Map<string, { oscillator: OscillatorNode; gain: GainNode; filter: BiquadFilterNode }>();
    let previousOffset = -1, previousTime = 0, previousSpeed = 1, running = false;
    const clear = () => {
      for (const v of voices.values()) {
        v.oscillator.onended = null;
        try { v.oscillator.stop(); } catch { /* already stopped */ }
        v.oscillator.disconnect(); v.filter.disconnect(); v.gain.disconnect();
      }
      voices.clear();
    };
    return {
      update(frame) {
        const now = audio.currentTime;
        const expected = previousOffset + (now - previousTime) * 1000 * previousSpeed;
        if (!frame.playing) {
          if (running) clear();
          running = false; previousOffset = frame.offsetMs; previousTime = now;
          return;
        }
        if (!running || Math.abs(expected - frame.offsetMs) > 80 || frame.speed !== previousSpeed) clear();
        running = true; previousOffset = frame.offsetMs; previousTime = now; previousSpeed = frame.speed;
        const duration = score.duration;
        const cycle = frame.loop ? Math.floor(frame.offsetMs / duration) : 0;
        const lastCycle = frame.loop ? Math.floor((frame.offsetMs + 120 * frame.speed) / duration) : 0;
        for (let c = cycle; c <= lastCycle; c++) for (let i = 0; i < score.notes.length; i++) {
          const note = score.notes[i]!;
          const start = note.start + c * duration, end = note.end + c * duration, key = `${c}:${i}`;
          if (end <= frame.offsetMs || start > frame.offsetMs + 120 * frame.speed || voices.has(key)) continue;
          const when = now + Math.max(0, start - frame.offsetMs) / 1000 / frame.speed;
          const stop = now + (end - frame.offsetMs) / 1000 / frame.speed;
          const age = Math.max(0, frame.offsetMs - start);
          const profile = voiceProfile(note.program);
          const osc = audio.createOscillator(), gain = audio.createGain(), filter = audio.createBiquadFilter();
          if (profile.harmonics) {
            if (!waves.has(note.program)) waves.set(note.program, audio.createPeriodicWave(new Float32Array(profile.harmonics.length), new Float32Array(profile.harmonics)));
            osc.setPeriodicWave(waves.get(note.program)!);
          } else osc.type = profile.wave;
          osc.frequency.value = 440 * Math.pow(2, (note.pitch - 69) / 12);
          filter.type = 'lowpass'; filter.Q.value = .4;
          filter.frequency.setValueAtTime(cutoffAt(profile, age), when);
          filter.frequency.setTargetAtTime(profile.darkHz, when, profile.darkenMs / 1000 / frame.speed);
          scheduleEnvelope(gain.gain, profile, age, note.end - note.start, when, frame.speed, note.velocity * .3 * profile.gain * frame.volume);
          osc.connect(filter); filter.connect(gain); gain.connect(mix);
          voices.set(key, { oscillator: osc, gain, filter });
          osc.onended = () => { osc.disconnect(); filter.disconnect(); gain.disconnect(); voices.delete(key); };
          osc.start(when); osc.stop(stop + .01);
        }
      },
      destroy() { clear(); mix.disconnect(); },
    };
  },
});
