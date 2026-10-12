// Sound effects, synthesised with WebAudio so the demo needs no audio files.
// Per the spec, background music plays only on the desktop/server view, so the phone has effects only.
(function () {
  let ctx = null, master = null, noiseBuf = null;

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.8;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  function envelope(gainNode, t0, peak, attack, decay) {
    const g = gainNode.gain;
    g.setValueAtTime(0.0001, t0);
    g.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + attack);
    g.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  }

  function tone(freq, dur, type, vol, slideTo, delay) {
    const t0 = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    envelope(g, t0, vol, 0.008, dur);
    o.connect(g).connect(master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  function noise(dur, vol, filterType, freq, q, freqTo, delay) {
    const t0 = ctx.currentTime + (delay || 0);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = filterType || 'lowpass';
    f.frequency.setValueAtTime(freq || 1000, t0);
    if (freqTo) f.frequency.exponentialRampToValueAtTime(freqTo, t0 + dur);
    f.Q.value = q || 1;
    const g = ctx.createGain();
    envelope(g, t0, vol, 0.01, dur);
    src.connect(f).connect(g).connect(master);
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + dur + 0.05);
  }

  const sfx = {
    getBeer(v) {           // tap pour + clink on the tray
      noise(0.28, 0.22 * v, 'bandpass', 1100, 1.4, 700);
      tone(2600, 0.12, 'sine', 0.16 * v, null, 0.2);
      tone(3400, 0.1, 'sine', 0.1 * v, null, 0.22);
    },
    bounce(v) {            // soft thump
      tone(170, 0.18, 'sine', 0.5 * v, 60);
      noise(0.07, 0.18 * v, 'lowpass', 700);
    },
    loseBeers(v) {         // glass smash
      noise(0.4, 0.35 * v, 'highpass', 2600, 0.7);
      for (let i = 0; i < 6; i++) tone(2200 + Math.random() * 3200, 0.12 + Math.random() * 0.2, 'triangle', 0.09 * v, null, i * 0.03);
      tone(110, 0.2, 'sine', 0.3 * v, 50);
    },
    throw(v) {             // whoosh
      noise(0.32, 0.3 * v, 'bandpass', 380, 2.2, 2400);
    },
    drink(v) {             // three gulps and an "ahh"
      for (let i = 0; i < 3; i++) tone(200, 0.11, 'sine', 0.38 * v, 105, i * 0.17);
      tone(420, 0.35, 'triangle', 0.08 * v, 300, 0.55);
    },
    serve(v) {             // bell
      tone(988, 0.14, 'triangle', 0.22 * v);
      tone(1319, 0.3, 'triangle', 0.22 * v, null, 0.1);
    },
    fall(v) {              // slide-whistle down + thud
      tone(900, 0.5, 'sine', 0.25 * v, 140);
      tone(90, 0.25, 'sine', 0.45 * v, 45, 0.5);
      noise(0.12, 0.25 * v, 'lowpass', 500, 1, null, 0.5);
    },
    blocked(v) {
      tone(1600, 0.18, 'square', 0.07 * v, 2400);
      tone(2400, 0.12, 'sine', 0.1 * v, null, 0.05);
    },
    beep() { tone(523, 0.16, 'square', 0.1); },
    go() { tone(1047, 0.45, 'square', 0.1); tone(1568, 0.45, 'triangle', 0.08); },
    whistle() { tone(2100, 0.25, 'sine', 0.22, 2300); tone(2100, 0.6, 'sine', 0.22, 1900, 0.3); },
    deny() { tone(180, 0.1, 'square', 0.06); },
  };

  HMB.Audio = {
    init,
    play(name, vol) {
      if (!ctx || !sfx[name]) return;
      if (ctx.state === 'suspended') ctx.resume();
      sfx[name](vol == null ? 1 : vol);
    },
  };
})();
