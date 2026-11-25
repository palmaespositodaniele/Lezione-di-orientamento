/* Suoni sintetizzati con Web Audio: nessun file da scaricare.
   Mare, vento, pioggia, sirena della nave, tonfi dei container, rintocchi di successo. */
const Suono = (() => {
  let ctx = null, master = null, acceso = true;
  let mare = null, vento = null, pioggia = null;

  function rumore(secondi, colore) {
    const n = Math.floor(ctx.sampleRate * secondi);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let ultimo = 0;
    for (let i = 0; i < n; i++) {
      const b = Math.random() * 2 - 1;
      if (colore === 'marrone') { ultimo = (ultimo + 0.02 * b) / 1.02; d[i] = ultimo * 3.5; }
      else d[i] = b;
    }
    return buf;
  }

  function anello(buf, filtro, freq, q) {
    const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = filtro; f.frequency.value = freq; f.Q.value = q || 0.7;
    const g = ctx.createGain(); g.gain.value = 0;
    s.connect(f); f.connect(g); g.connect(master); s.start();
    return { s, f, g };
  }

  function avvia() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = acceso ? 0.9 : 0; master.connect(ctx.destination);
    const marrone = rumore(6, 'marrone'), bianco = rumore(3, 'bianco');
    mare = anello(marrone, 'lowpass', 500);
    // il respiro del mare: un oscillatore lentissimo muove il filtro
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.12;
    const lg = ctx.createGain(); lg.gain.value = 260; lfo.connect(lg); lg.connect(mare.f.frequency); lfo.start();
    vento = anello(bianco, 'bandpass', 700, 1.2);
    const lfo2 = ctx.createOscillator(); lfo2.frequency.value = 0.31;
    const lg2 = ctx.createGain(); lg2.gain.value = 380; lfo2.connect(lg2); lg2.connect(vento.f.frequency); lfo2.start();
    pioggia = anello(bianco, 'highpass', 2500);
  }

  function livello(nodo, v, t) {
    if (!ctx || !nodo) return;
    nodo.g.gain.cancelScheduledValues(ctx.currentTime);
    nodo.g.gain.setTargetAtTime(v, ctx.currentTime, t || 1.2);
  }

  function ambiente(o) {
    livello(mare, o.mare ?? 0.5);
    livello(vento, o.vento ?? 0.0);
    livello(pioggia, o.pioggia ?? 0.0);
  }

  function nota(freq, inizio, durata, tipo, vol, dest) {
    const o = ctx.createOscillator(); o.type = tipo || 'sine'; o.frequency.value = freq;
    const g = ctx.createGain(); const t = ctx.currentTime + inizio;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + durata);
    o.connect(g); g.connect(dest || master); o.start(t); o.stop(t + durata + 0.05);
    return o;
  }

  const suoni = {
    sirena() { // due canne gravi della sirena di bordo
      if (!ctx) return;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; f.connect(master);
      const g = ctx.createGain(); const t = ctx.currentTime;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.22, t + 0.25);
      g.gain.setValueAtTime(0.22, t + 2.2); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.4); g.connect(f);
      [98, 147, 196.5].forEach((fr) => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fr;
        o.frequency.setValueAtTime(fr * 0.97, t); o.frequency.linearRampToValueAtTime(fr, t + 0.4); o.connect(g); o.start(t); o.stop(t + 3.5); });
    },
    tonfo() {
      if (!ctx) return;
      const o = ctx.createOscillator(); o.type = 'sine'; const g = ctx.createGain(); const t = ctx.currentTime;
      o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.25);
      g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.35);
      nota(900 + Math.random() * 300, 0, 0.08, 'square', 0.03);
    },
    clic() { if (ctx) nota(1400, 0, 0.05, 'triangle', 0.08); },
    ok() { if (!ctx) return; [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => nota(f, i * 0.09, 0.9, 'sine', 0.14)); },
    boa() { if (!ctx) return; nota(880, 0, 1.2, 'sine', 0.16); nota(1318.5, 0.08, 1.4, 'sine', 0.1); },
    no() { if (!ctx) return; nota(220, 0, 0.25, 'square', 0.06); nota(185, 0.12, 0.35, 'square', 0.06); },
    tuono() {
      if (!ctx) return;
      const s = ctx.createBufferSource(); s.buffer = rumore(3, 'marrone');
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 220;
      const g = ctx.createGain(); const t = ctx.currentTime;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1.2, t + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
      s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + 3);
    },
    scintilla() { if (!ctx) return; [1568, 2093, 2637].forEach((f, i) => nota(f, i * 0.06, 0.6, 'sine', 0.06)); },
    fanfara() {
      if (!ctx) return;
      [[392, 0], [523.25, .18], [659.25, .36], [783.99, .54], [1046.5, .8]].forEach(([f, t]) => { nota(f, t, 1.6, 'triangle', 0.1); nota(f / 2, t, 1.6, 'sine', 0.08); });
    },
  };

  function commuta() {
    acceso = !acceso;
    if (master) master.gain.setTargetAtTime(acceso ? 0.9 : 0, ctx.currentTime, 0.2);
    return acceso;
  }

  return { avvia, ambiente, commuta, ...suoni, get acceso() { return acceso; } };
})();
