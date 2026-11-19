// Tiny synthesized sound kit (no audio files). All sounds are short and quiet.
(function () {
  let ac = null;
  let master = null;
  let enabled = true;

  function ctx() {
    if (!ac) {
      try {
        ac = new (window.AudioContext || window.webkitAudioContext)();
        master = ac.createGain();
        master.gain.value = 0.32;
        master.connect(ac.destination);
      } catch (e) {
        ac = null;
      }
    }
    if (ac && ac.state === 'suspended') ac.resume().catch(() => {});
    return ac;
  }

  function env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  function noiseBuffer(a, dur) {
    const b = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  const S = {
    set enabled(v) { enabled = !!v; },
    get enabled() { return enabled; },
    unlock() { if (enabled) ctx(); },

    baa(pitch = 1, length = 1) {
      const a = enabled && ctx();
      if (!a) return;
      const t = a.currentTime + 0.01;
      const dur = 0.55 * length;
      const o = a.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(290 * pitch, t);
      o.frequency.linearRampToValueAtTime(345 * pitch, t + 0.09);
      o.frequency.linearRampToValueAtTime(255 * pitch, t + dur);
      // bleat tremolo
      const am = a.createGain();
      am.gain.value = 0.6;
      const lfo = a.createOscillator();
      lfo.frequency.value = 19 + Math.random() * 5;
      const lg = a.createGain();
      lg.gain.value = 0.4;
      lfo.connect(lg).connect(am.gain);
      // two vowel formants ("eh")
      const f1 = a.createBiquadFilter();
      f1.type = 'bandpass'; f1.frequency.value = 760 * pitch; f1.Q.value = 4;
      const f2 = a.createBiquadFilter();
      f2.type = 'bandpass'; f2.frequency.value = 1700 * pitch; f2.Q.value = 6;
      const mix = a.createGain();
      mix.gain.value = 1.4;
      const e = a.createGain();
      env(e, t, 0.04, 0.9, dur);
      o.connect(am);
      am.connect(f1).connect(mix);
      am.connect(f2).connect(mix);
      mix.connect(e).connect(master);
      o.start(t); lfo.start(t);
      o.stop(t + dur + 0.1); lfo.stop(t + dur + 0.1);
    },

    pop() {
      const a = enabled && ctx();
      if (!a) return;
      const t = a.currentTime + 0.01;
      const o = a.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(700, t);
      o.frequency.exponentialRampToValueAtTime(140, t + 0.12);
      const e = a.createGain();
      env(e, t, 0.005, 0.7, 0.14);
      o.connect(e).connect(master);
      o.start(t); o.stop(t + 0.2);
    },

    thud() {
      const a = enabled && ctx();
      if (!a) return;
      const t = a.currentTime + 0.01;
      const o = a.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(140, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.18);
      const e = a.createGain();
      env(e, t, 0.005, 0.9, 0.2);
      o.connect(e).connect(master);
      o.start(t); o.stop(t + 0.25);
    },

    snip() {
      const a = enabled && ctx();
      if (!a) return;
      for (const off of [0, 0.11]) {
        const t = a.currentTime + 0.01 + off;
        const n = a.createBufferSource();
        n.buffer = noiseBuffer(a, 0.06);
        const hp = a.createBiquadFilter();
        hp.type = 'highpass'; hp.frequency.value = 3500;
        const e = a.createGain();
        env(e, t, 0.002, 0.8, 0.05);
        n.connect(hp).connect(e).connect(master);
        n.start(t);
      }
    },

    munch() {
      const a = enabled && ctx();
      if (!a) return;
      const t = a.currentTime + 0.01;
      const n = a.createBufferSource();
      n.buffer = noiseBuffer(a, 0.09);
      const lp = a.createBiquadFilter();
      lp.type = 'bandpass'; lp.frequency.value = 900; lp.Q.value = 1.5;
      const e = a.createGain();
      env(e, t, 0.005, 0.35, 0.08);
      n.connect(lp).connect(e).connect(master);
      n.start(t);
    },

    woof() {
      const a = enabled && ctx();
      if (!a) return;
      for (const off of [0, 0.2]) {
        const t = a.currentTime + 0.01 + off;
        const o = a.createOscillator();
        o.type = 'square';
        o.frequency.setValueAtTime(230, t);
        o.frequency.exponentialRampToValueAtTime(120, t + 0.12);
        const lp = a.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 900;
        const e = a.createGain();
        env(e, t, 0.01, 0.5, 0.12);
        o.connect(lp).connect(e).connect(master);
        o.start(t); o.stop(t + 0.16);
      }
    },
  };
  window.Sound = S;
})();
