/* Procedural sound: every effect is synthesised with WebAudio, no files.
   Includes a looping cauldron ambience (bubbling + fire crackle) that reacts
   to how hard the pot is boiling, and a gentle music-box lullaby. */
const AudioFx = {
  ctx: null,
  muted: false,
  master: null,
  amb: null,
  music: { on: false, timer: 0, step: 0 },

  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      const comp = this.ctx.createDynamicsCompressor();
      this.master.connect(comp);
      comp.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
  },
  out() { return this.master || (this.ctx && this.ctx.destination); },

  tone(freq, time, duration, type, gain, slideTo) {
    if (this.muted || !this.ctx) return;
    const c = this.ctx, t0 = c.currentTime + (time || 0);
    const osc = c.createOscillator(), amp = c.createGain();
    osc.type = type || "triangle";
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + duration);
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.exponentialRampToValueAtTime(gain || 0.08, t0 + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(amp); amp.connect(this.out());
    osc.start(t0); osc.stop(t0 + duration + 0.03);
  },

  noise(duration, freq, q, gain, time, type) {
    if (this.muted || !this.ctx) return;
    const c = this.ctx;
    const len = Math.max(1, Math.floor(c.sampleRate * duration));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = type || "bandpass"; f.frequency.value = freq; f.Q.value = q;
    const amp = c.createGain();
    const t0 = c.currentTime + (time || 0);
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.015);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    src.connect(f); f.connect(amp); amp.connect(this.out());
    src.start(t0); src.stop(t0 + duration + 0.03);
  },

  // ----- UI -----
  click() { this.unlock(); this.tone(640, 0, 0.05, "square", 0.04); },
  select() { this.unlock(); this.tone(520, 0, 0.07, "triangle", 0.07); this.tone(780, 0.06, 0.09, "triangle", 0.07); },
  whoosh() { this.unlock(); this.noise(0.3, 900, 0.5, 0.06); this.tone(220, 0, 0.22, "sawtooth", 0.02, 520); },
  nope() { this.unlock(); this.tone(220, 0, 0.14, "square", 0.05); this.tone(165, 0.1, 0.2, "square", 0.05); },
  page() { this.unlock(); this.noise(0.2, 2800, 0.8, 0.05); },
  country() { this.unlock(); [392, 523, 659].forEach((n, i) => this.tone(n, i * 0.07, 0.12, "square", 0.05)); },

  // ----- cauldron -----
  plop(size) {
    this.unlock();
    if (this.muted || !this.ctx) return;
    // calm, sparse bubbling: small bubbles are mostly silent and pops are rate-limited
    const now = this.ctx.currentTime;
    if (size < 14 && Math.random() < 0.65) return;
    if (now - (this._lastPlop || 0) < 0.28) return;
    this._lastPlop = now;
    const k = size ? Math.max(0.6, Math.min(1.6, 14 / size)) : 1;
    this.tone(200 * k * (0.9 + Math.random() * 0.3), 0, 0.14, "sine", 0.045, 520 * k);
    this.noise(0.1, 1300, 0.8, 0.01, 0.02);
  },
  pop() { this.unlock(); this.tone(700 + Math.random() * 400, 0, 0.05, "sine", 0.012, 300); },
  meow() {
    this.unlock();
    if (this.muted || !this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(), o2 = c.createOscillator(), bp = c.createBiquadFilter(), g = c.createGain();
    o.type = "sawtooth"; o2.type = "triangle";
    const f0 = 520 + Math.random() * 120;
    [o, o2].forEach((x, i) => {
      const m = i ? 2 : 1;
      x.frequency.setValueAtTime(f0 * m, t);
      x.frequency.linearRampToValueAtTime(f0 * 1.55 * m, t + 0.16);
      x.frequency.linearRampToValueAtTime(f0 * 1.1 * m, t + 0.42);
    });
    bp.type = "bandpass"; bp.Q.value = 3;
    bp.frequency.setValueAtTime(900, t); bp.frequency.linearRampToValueAtTime(1800, t + 0.15); bp.frequency.linearRampToValueAtTime(1100, t + 0.42);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.48);
    o.connect(bp); o2.connect(bp); bp.connect(g); g.connect(this.out());
    o.start(t); o2.start(t); o.stop(t + 0.5); o2.stop(t + 0.5);
  },
  shimmer(p) {   // soft rising twinkle while magic ink flows
    if (this.muted || !this.ctx) return;
    const f = 620 + (p || 0) * 900 + Math.random() * 60;
    this.tone(f, 0, 0.14, "sine", 0.022); this.tone(f * 1.5, 0.02, 0.1, "triangle", 0.008);
  },
  boing() { this.unlock(); this.tone(260, 0, 0.22, "sine", 0.08, 620); this.tone(520, 0.04, 0.18, "triangle", 0.03, 900); },
  splash(p) {
    this.unlock();
    const g = 0.06 + 0.06 * (p || 1);
    this.noise(0.45, 1100, 0.5, g);
    this.noise(0.3, 3200, 0.8, g * 0.5, 0.03);
    this.tone(150, 0, 0.18, "sine", 0.14, 70);
  },
  swish(speed) {
    if (this.muted || !this.ctx) return;
    this.noise(0.22, 500 + speed * 260, 0.7, Math.min(0.06, 0.012 + speed * 0.005));
  },
  thunder() {
    this.unlock();
    this.noise(0.9, 160, 0.4, 0.22, 0, "lowpass");
    this.noise(0.18, 3000, 0.6, 0.12);
  },
  zap() { this.unlock(); this.noise(0.18, 4200, 1.2, 0.08); this.tone(1400, 0, 0.12, "sawtooth", 0.03, 200); },
  chime(i) {
    this.unlock();
    const scale = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.5];
    const f = scale[(i || 0) % scale.length];
    this.tone(f, 0, 0.7, "sine", 0.09); this.tone(f * 2, 0.01, 0.4, "sine", 0.03);
  },
  drop(i) {   // ingredient lands: rising pitch per slot
    this.unlock();
    this.splash(1);
    this.chime((i || 0) * 2);
  },
  rattle(v) {
    this.unlock();
    this.noise(0.07, 2200 + Math.random() * 2400, 1.8, 0.05 + Math.min(0.08, v * 0.02));
    this.tone(300 + Math.random() * 300, 0, 0.04, "square", 0.02);
  },
  corkPop() {
    this.unlock();
    this.tone(180, 0, 0.14, "sine", 0.3, 520);
    this.noise(0.25, 1800, 0.6, 0.18);
  },
  ding() { this.unlock(); this.tone(1318, 0, 0.9, "sine", 0.12); this.tone(1976, 0.01, 0.6, "sine", 0.05); },
  sparkle() {
    this.unlock();
    for (let i = 0; i < 6; i++) this.tone(1200 + Math.random() * 1800, i * 0.045, 0.16, "sine", 0.035);
  },
  fanfare(big) {
    this.unlock();
    const n = big ? [523, 659, 784, 1046, 1318, 1568] : [523, 659, 784, 1046];
    n.forEach((f, i) => this.tone(f, i * 0.1, 0.28, "square", 0.05));
    n.forEach((f, i) => this.tone(f / 2, i * 0.1, 0.4, "triangle", 0.06));
    this.tone(n[n.length - 1], n.length * 0.1, 0.9, "triangle", 0.09);
  },
  celebrate() { this.fanfare(false); },
  secret() {
    this.unlock();
    [392, 523, 659, 784, 988, 1175, 1568, 1976].forEach((f, i) => this.tone(f, i * 0.08, 0.5, "sine", 0.07));
    this.fanfare(true);
  },

  // ----- ambience: bubbling brew + fire crackle, driven by setBoil(0..1) -----
  startAmbience() {
    this.unlock();
    if (!this.ctx || this.amb) return;
    const c = this.ctx;
    const len = c.sampleRate * 2;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.03 * w) / 1.03; d[i] = last * 4; }   // brown noise
    const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 380;
    const g = c.createGain(); g.gain.value = 0.0;
    const lfo = c.createOscillator(); lfo.frequency.value = 6;
    const lg = c.createGain(); lg.gain.value = 0.012;
    lfo.connect(lg); lg.connect(g.gain);
    src.connect(lp); lp.connect(g); g.connect(this.out());
    src.start(); lfo.start();
    this.amb = { src, g, lp, lfo, lg, boil: 0.2, crackle: 0 };
    this.setBoil(0.2);
    const crack = () => {
      if (!this.amb) return;
      if (!this.muted) {
        if (Math.random() < 0.6) this.noise(0.03 + Math.random() * 0.04, 2500 + Math.random() * 3500, 2, 0.03 + Math.random() * 0.03);
        if (Math.random() < 0.05 + this.amb.boil * 0.08) this.pop();
      }
      this.amb.crackle = setTimeout(crack, 120 + Math.random() * 380);
    };
    crack();
  },
  setBoil(v) {
    if (!this.amb || !this.ctx) return;
    this.amb.boil = v;
    const t = this.ctx.currentTime;
    this.amb.g.gain.setTargetAtTime(this.muted ? 0 : 0.025 + v * 0.055, t, 0.3);
    this.amb.lp.frequency.setTargetAtTime(260 + v * 560, t, 0.3);
    this.amb.lfo.frequency.setTargetAtTime(2 + v * 2.6, t, 0.3);
  },
  stopAmbience() {
    if (!this.amb) return;
    clearTimeout(this.amb.crackle);
    try { this.amb.src.stop(); this.amb.lfo.stop(); } catch (e) { /* ignore */ }
    this.amb = null;
  },

  // ----- music box lullaby (A minor pentatonic random walk over a slow bass) -----
  startMusic() {
    this.unlock();
    if (!this.ctx || this.music.on) return;
    this.music.on = true;
    const notes = [220, 261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25];
    const bass = [110, 110, 87.31, 98];
    let idx = 4;
    const tick = () => {
      if (!this.music.on) return;
      const s = this.music.step++;
      if (!this.muted) {
        if (s % 8 === 0) this.tone(bass[(s / 8) % bass.length | 0], 0, 1.6, "sine", 0.05);
        if (Math.random() < 0.72) {
          idx = Math.max(0, Math.min(notes.length - 1, idx + [-2, -1, -1, 1, 1, 2][(Math.random() * 6) | 0]));
          const f = notes[idx];
          this.tone(f, 0, 0.9, "sine", 0.035);
          this.tone(f * 2, 0, 0.3, "triangle", 0.012);
        }
      }
      this.music.timer = setTimeout(tick, 330);
    };
    tick();
  },
  stopMusic() { this.music.on = false; clearTimeout(this.music.timer); },

  toggleMute() {
    this.unlock();
    this.muted = !this.muted;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 1, this.ctx.currentTime, 0.05);
    if (this.amb) this.setBoil(this.amb.boil);
    if (!this.muted) this.click();
    return this.muted;
  }
};
