/* Witch's Soup — magic tracing.
   Before the potion is shaken, the student traces each ingredient's first letter and then the
   potion's magic symbol. Every potion type has one simple symbol, so over time students learn
   to recognise what they brewed before the reveal. */
(function (global) {
  "use strict";
  const TAU = Math.PI * 2;

  // ---------- shape helpers (all glyphs live in a 0..100 x 0..120 box for letters, 0..120 square for symbols)
  const arc = (cx, cy, rx, ry, a0, a1, n) => {
    const out = [], N = n || 24;
    for (let i = 0; i <= N; i++) {
      const a = (a0 + (a1 - a0) * i / N) * Math.PI / 180;
      out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
    }
    return out;
  };
  const quad = (p0, c, p1, n) => {
    const out = [], N = n || 16;
    for (let i = 0; i <= N; i++) {
      const t = i / N, u = 1 - t;
      out.push([u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]]);
    }
    return out;
  };
  const join = (...parts) => parts.reduce((a, p) => a.concat(a.length ? p.slice(1) : p), []);

  // Letters, written the way they are taught in print: one entry per pen stroke.
  const L = {
    A: [[[50, 0], [6, 120]], [[50, 0], [94, 120]], [[24, 76], [76, 76]]],
    B: [[[12, 0], [12, 120]], join([[12, 0], [52, 0]], arc(52, 29, 30, 29, -90, 90), [[52, 58], [12, 58]]), join([[12, 58], [56, 58]], arc(56, 89, 32, 31, -90, 90), [[56, 120], [12, 120]])],
    C: [arc(56, 60, 44, 60, -38, -322, 32)],
    D: [[[12, 0], [12, 120]], join([[12, 0], [38, 0]], arc(38, 60, 52, 60, -90, 90, 28), [[38, 120], [12, 120]])],
    E: [[[88, 0], [12, 0], [12, 120], [88, 120]], [[12, 60], [74, 60]]],
    F: [[[88, 0], [12, 0], [12, 120]], [[12, 60], [72, 60]]],
    G: [join(arc(56, 60, 44, 60, -38, -360, 32), [[100, 60], [62, 60]])],
    H: [[[12, 0], [12, 120]], [[88, 0], [88, 120]], [[12, 60], [88, 60]]],
    I: [[[50, 0], [50, 120]], [[22, 0], [78, 0]], [[22, 120], [78, 120]]],
    J: [join([[72, 0], [72, 86]], arc(44, 86, 28, 34, 0, 180, 18)), [[42, 0], [96, 0]]],
    K: [[[12, 0], [12, 120]], [[88, 0], [12, 72]], [[36, 50], [90, 120]]],
    L: [[[14, 0], [14, 120], [86, 120]]],
    M: [[[8, 120], [8, 0], [50, 72], [92, 0], [92, 120]]],
    N: [[[12, 120], [12, 0], [88, 120], [88, 0]]],
    O: [arc(50, 60, 44, 60, -90, 270, 40)],
    P: [[[12, 120], [12, 0]], join([[12, 0], [54, 0]], arc(54, 31, 32, 31, -90, 90), [[54, 62], [12, 62]])],
    Q: [arc(50, 60, 44, 60, -90, 270, 40), [[58, 84], [96, 122]]],
    R: [[[12, 120], [12, 0]], join([[12, 0], [54, 0]], arc(54, 31, 32, 31, -90, 90), [[54, 62], [12, 62]]), [[44, 62], [90, 120]]],
    S: [join(arc(50, 30, 38, 30, -25, -270, 20), arc(50, 90, 40, 30, -90, 155, 22))],
    T: [[[6, 0], [94, 0]], [[50, 0], [50, 120]]],
    U: [join([[12, 0], [12, 76]], arc(50, 76, 38, 44, 180, 0, 20), [[88, 76], [88, 0]])],
    V: [[[6, 0], [50, 120], [94, 0]]],
    W: [[[2, 0], [25, 120], [50, 40], [75, 120], [98, 0]]],
    X: [[[10, 0], [90, 120]], [[90, 0], [10, 120]]],
    Y: [[[10, 0], [50, 60], [90, 0]], [[50, 60], [50, 120]]],
    Z: [[[10, 0], [90, 0], [10, 120], [90, 120]]]
  };
  const letterGlyph = (ch) => ({ kind: "letter", strokes: L[ch] || L.A, w: 100, h: 120 });

  // One magic symbol per potion type (weak versions share their type's symbol).
  const star = () => { const p = []; for (let k = 0; k <= 5; k++) { const a = (-90 + k * 144) * Math.PI / 180; p.push([60 + Math.cos(a) * 54, 66 + Math.sin(a) * 54]); } return p; };
  const spiral = () => { const p = []; for (let i = 0; i <= 64; i++) { const t = i / 64, a = t * TAU * 2.25, r = 4 + t * 50; p.push([60 + Math.cos(a) * r, 60 + Math.sin(a) * r]); } return p; };
  const infinity = () => { const p = []; for (let i = 0; i <= 64; i++) { const t = i / 64 * TAU, d = 1 + Math.sin(t) ** 2; p.push([60 + 56 * Math.cos(t) / d, 60 + 56 * Math.sin(t) * Math.cos(t) / d]); } return p; };
  const wave = () => { const p = []; for (let i = 0; i <= 48; i++) { const t = i / 48; p.push([6 + t * 108, 60 + Math.sin(t * Math.PI * 3) * 30]); } return p; };
  const SYMBOLS = {
    heart:    { name: "Heart",    nameJa: "ハート", strokes: [join([[60, 112], [14, 54]], arc(36, 40, 25, 25, 150, 360, 16), arc(84, 40, 25, 25, 180, 390, 16), [[106, 54], [60, 112]])] },
    square:   { name: "Square",   nameJa: "しかく", strokes: [[[14, 14], [106, 14], [106, 106], [14, 106], [14, 14]]] },
    arrow:    { name: "Arrow",    nameJa: "やじるし", strokes: [[[8, 60], [110, 60]], [[74, 24], [110, 60], [74, 96]]] },
    moon:     { name: "Moon",     nameJa: "つき", strokes: [join(arc(60, 60, 50, 52, -55, -305, 26), arc(96, 60, 42, 44, 120, 240, 16))] },
    wave:     { name: "Wave",     nameJa: "なみ", strokes: [wave()] },
    triangle: { name: "Triangle", nameJa: "さんかく", strokes: [[[60, 8], [112, 106], [8, 106], [60, 8]]] },
    drop:     { name: "Drop",     nameJa: "しずく", strokes: [join([[60, 6], [31, 55]], arc(60, 76, 36, 36, 215, -35, 24), [[89, 55], [60, 6]])] },
    circle:   { name: "Circle",   nameJa: "まる", strokes: [arc(60, 60, 52, 52, -90, 270, 40)] },
    star:     { name: "Star",     nameJa: "ほし", strokes: [star()] },
    spiral:   { name: "Spiral",   nameJa: "うずまき", strokes: [spiral()] },
    leaf:     { name: "Leaf",     nameJa: "はっぱ", strokes: [join(quad([14, 106], [10, 10], [106, 14]), quad([106, 14], [110, 110], [14, 106])), [[14, 106], [80, 40]]] },
    diamond:  { name: "Diamond",  nameJa: "ダイヤ", strokes: [[[60, 4], [108, 60], [60, 116], [12, 60], [60, 4]]] },
    shield:   { name: "Shield",   nameJa: "たて", strokes: [join([[14, 10], [106, 10], [106, 54]], quad([106, 54], [106, 96], [60, 114]), quad([60, 114], [14, 96], [14, 54]), [[14, 54], [14, 10]])] },
    zigzag:   { name: "Z",        nameJa: "ゼット", strokes: [[[14, 14], [106, 14], [14, 106], [106, 106]]] },
    bolt:     { name: "Lightning", nameJa: "いなずま", strokes: [[[74, 4], [30, 64], [70, 58], [40, 116]]] },
    snow:     { name: "Snowflake", nameJa: "ゆきのけっしょう", strokes: [[[60, 6], [60, 114]], [[13, 33], [107, 87]], [[107, 33], [13, 87]]] },
    mountain: { name: "Mountain", nameJa: "やま", strokes: [[[4, 104], [40, 26], [62, 70], [84, 38], [116, 104]]] },
    plus:     { name: "Plus",     nameJa: "プラス", strokes: [[[60, 10], [60, 110]], [[10, 60], [110, 60]]] },
    infinity: { name: "Infinity", nameJa: "むげん", strokes: [infinity()] }
  };
  const POTION_SYMBOL = {
    health: "heart", "weak-health": "heart", strong: "square", speed: "arrow", dark: "moon", wind: "wave",
    fire: "triangle", water: "drop", light: "circle", lucky: "star", psychic: "spiral", life: "leaf",
    magic: "diamond", "weak-magic": "diamond", shield: "shield", sleep: "zigzag", thunder: "bolt",
    ice: "snow", earth: "mountain", basic: "plus", secret: "infinity"
  };
  const symbolFor = (potion) => SYMBOLS[POTION_SYMBOL[potion.key] || "plus"];
  const symbolGlyph = (potion) => Object.assign({ kind: "symbol", w: 120, h: 120 }, symbolFor(potion));

  // inline SVG of a glyph, for the reveal card, the board and the potion book
  function svg(glyph, color, size) {
    const w = glyph.w || 120, h = glyph.h || 120, pad = 14;
    const paths = glyph.strokes.map((s) => `<polyline points="${s.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ")}"/>`).join("");
    return `<svg class="glyph" viewBox="${-pad} ${-pad} ${w + pad * 2} ${h + pad * 2}" width="${size || 44}" height="${size || 44}" aria-hidden="true">
      <g fill="none" stroke-linecap="round" stroke-linejoin="round"><g stroke="#12061c" stroke-width="22">${paths}</g><g stroke="${color}" stroke-width="12">${paths}</g><g stroke="rgba(255,255,255,.75)" stroke-width="4">${paths}</g></g></svg>`;
  }

  // ---------- the tracer -------------------------------------------------------
  class Tracer {
    constructor(canvas) {
      this.canvas = canvas; this.ctx = canvas.getContext("2d");
      this.parts = []; this.trail = []; this.time = 0; this.running = false;
      this.down = false;
      canvas.style.touchAction = "none";
      canvas.addEventListener("pointerdown", (e) => { this.down = true; this.last = this.pt(e); this.trail.push(Object.assign({ a: 1 }, this.last)); this.cover(this.last, this.last); try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } });
      canvas.addEventListener("pointermove", (e) => {
        if (!this.down || !this.glyph) return;
        const p = this.pt(e);
        this.cover(this.last, p);
        this.trail.push(Object.assign({ a: 1 }, p)); if (this.trail.length > 40) this.trail.shift();
        if (Math.random() < 0.7) this.spark(p.x, p.y, 1);
        this.last = p;
      });
      const up = () => { this.down = false; };
      canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);
      this._r = () => this.resize(); global.addEventListener("resize", this._r);
    }
    pt(e) { const r = this.canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) * this.dpr, y: (e.clientY - r.top) * this.dpr }; }
    resize() {
      const c = this.canvas, dpr = Math.min(global.devicePixelRatio || 1, 2);
      this.dpr = dpr;
      c.width = Math.max(2, Math.round(c.offsetWidth * dpr)); c.height = Math.max(2, Math.round(c.offsetHeight * dpr));
      if (this.glyph) this.layout();
    }
    // fit the glyph into the middle of the canvas
    layout() {
      const g = this.glyph, c = this.canvas;
      const box = Math.min(c.width * 0.6, c.height * 0.5);
      this.k = box / Math.max(g.w, g.h);
      this.ox = c.width / 2 - g.w * this.k / 2; this.oy = c.height * 0.52 - g.h * this.k / 2;
      this.R = Math.max(22 * this.dpr, box * 0.085);           // how close the finger must be
      this.lw = Math.max(10 * this.dpr, box * 0.06);
      // resample every stroke into evenly spaced points (in canvas px)
      const step = Math.max(4, box * 0.022);
      this.strokes = g.strokes.map((s) => {
        const pts = [];
        for (let i = 0; i < s.length - 1; i++) {
          const a = s[i], b = s[i + 1];
          const ax = this.ox + a[0] * this.k, ay = this.oy + a[1] * this.k, bx = this.ox + b[0] * this.k, by = this.oy + b[1] * this.k;
          const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
          for (let j = 0; j < n; j++) pts.push({ x: ax + (bx - ax) * j / n, y: ay + (by - ay) * j / n, on: false });
        }
        const e = s[s.length - 1]; pts.push({ x: this.ox + e[0] * this.k, y: this.oy + e[1] * this.k, on: false });
        const prev = this.strokes && this.strokes.length ? null : null; void prev;
        return { pts, done: false, n: 0 };
      });
    }
    // Strokes must be drawn in order and in their writing direction: only the current stroke
    // takes ink, and only from its last inked point onward, so you can't paint the A's right leg
    // from the top before its left leg is done, or a stroke backwards from its far end.
    current() { return this.strokes ? this.strokes.find((x) => !x.done) : null; }
    cover(a, b) {
      if (!this.strokes || this.finished) return;
      const s = this.current();
      if (!s) return;
      const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 4));
      const R2 = this.R * this.R;
      let hit = false;
      for (let i = 0; i <= n; i++) {
        const x = a.x + (b.x - a.x) * i / n, y = a.y + (b.y - a.y) * i / n;
        // advance while one of the next few points is under the finger
        let moved = true;
        while (moved && s.n < s.pts.length) {
          moved = false;
          for (let k = s.n; k < Math.min(s.pts.length, s.n + 4); k++) {
            const p = s.pts[k];
            if ((p.x - x) * (p.x - x) + (p.y - y) * (p.y - y) < R2) {
              for (let m = s.n; m <= k; m++) s.pts[m].on = true;
              s.n = k + 1; moved = true; hit = true; break;
            }
          }
        }
      }
      if (hit) { this.lastHit = this.time; if (this.onInk) this.onInk(); }
      if (s.n >= s.pts.length - 1) {
        s.done = true; s.n = s.pts.length; s.pts.forEach((p) => { p.on = true; });
        s.pts.forEach((p, k) => { if (k % 3 === 0) this.spark(p.x, p.y, 2); });
        if (this.onStroke) this.onStroke(this.strokes.indexOf(s));
        // lifting the finger is not required, but the next stroke starts fresh from its own start
      }
      if (this.strokes.every((x) => x.done)) this.finish();
    }
    progress() {
      if (!this.strokes) return 0;
      let on = 0, all = 0;
      this.strokes.forEach((s) => { all += s.pts.length; on += s.pts.filter((p) => p.on).length; });
      return all ? on / all : 0;
    }
    finish() {
      if (this.finished) return;
      this.finished = true; this.doneT = this.time;
      for (let i = 0; i < 70; i++) {
        const s = this.strokes[(Math.random() * this.strokes.length) | 0], p = s.pts[(Math.random() * s.pts.length) | 0];
        this.spark(p.x, p.y, 3);
      }
      if (this.onDone) this.onDone();
    }
    // help: ink the next unfinished stroke for the student, point by point
    autoStep(dt) {
      this._auto = (this._auto || 0) + dt * 60;
      while (this._auto >= 1) {
        this._auto -= 1;
        const s = this.current();
        if (!s) break;
        const p = s.pts[Math.min(s.n, s.pts.length - 1)];
        this.cover(p, p);
        this.spark(p.x, p.y, 1);
      }
    }
    spark(x, y, k) {
      const n = k === 3 ? 1 : k === 2 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU, v = (k === 3 ? 260 + Math.random() * 520 : 40 + Math.random() * 140) * this.dpr;
        this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (k === 3 ? 120 : 30) * this.dpr, life: k === 3 ? 1.1 : 0.7, age: 0, s: (k === 3 ? 6 : 3 + Math.random() * 4) * this.dpr, c: Math.random() < 0.35 ? "#ffffff" : this.color, star: Math.random() < 0.4 });
      }
      if (this.parts.length > 500) this.parts.splice(0, this.parts.length - 500);
    }
    // trace one glyph; resolves when it is complete
    trace(glyph, color) {
      this.glyph = glyph; this.color = color || "#ffe27a"; this.finished = false; this.helping = false;
      this.trail = []; this.strokes = null; this.lastHit = this.time; this.startT = this.time;
      this.resize(); this.layout();
      this.start();
      return new Promise((res) => { this._resolve = res; });
    }
    start() {
      if (this.running) return;
      this.running = true; let last = performance.now();
      const loop = (now) => {
        if (!this.running) return;
        this.raf = requestAnimationFrame(loop);
        const dt = Math.min(0.05, (now - last) / 1000); last = now;
        this.time += dt;
        if (this.helping && !this.finished) this.autoStep(dt);
        if (this.finished && this.time - this.doneT > 1.0 && this._resolve) { const r = this._resolve; this._resolve = null; r(); }
        this.draw(dt);
      };
      this.raf = requestAnimationFrame(loop);
    }
    stop() { this.running = false; cancelAnimationFrame(this.raf); }
    draw(dt) {
      const ctx = this.ctx, c = this.canvas, t = this.time;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, c.width, c.height);
      if (!this.strokes) return;
      const box = Math.max(this.glyph.w, this.glyph.h) * this.k;
      const cx = c.width / 2, cy = this.oy + this.glyph.h * this.k / 2;
      // the magic circle the glyph is drawn inside
      const R0 = box * 0.68;
      const fin = this.finished ? Math.min(1, (t - this.doneT) / 0.6) : 0;
      ctx.save(); ctx.translate(cx, cy);
      ctx.globalCompositeOperation = "lighter";
      const glow = ctx.createRadialGradient(0, 0, R0 * 0.2, 0, 0, R0 * 1.25);
      glow.addColorStop(0, hexA(this.color, 0.16 + fin * 0.25)); glow.addColorStop(1, hexA(this.color, 0));
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, 0, R0 * 1.25, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      ctx.rotate(t * 0.12);
      ctx.strokeStyle = hexA(this.color, 0.45); ctx.lineWidth = 3 * this.dpr;
      ctx.beginPath(); ctx.arc(0, 0, R0, 0, TAU); ctx.stroke();
      ctx.setLineDash([4 * this.dpr, 14 * this.dpr]); ctx.beginPath(); ctx.arc(0, 0, R0 * 0.92, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      for (let i = 0; i < 12; i++) {           // little runes around the ring
        ctx.save(); ctx.rotate(i * TAU / 12); ctx.translate(0, -R0 * 1.06);
        ctx.strokeStyle = hexA(this.color, 0.5); ctx.lineWidth = 2.5 * this.dpr; ctx.beginPath();
        const r = 7 * this.dpr;
        if (i % 3 === 0) { ctx.moveTo(-r, r); ctx.lineTo(0, -r); ctx.lineTo(r, r); ctx.closePath(); }
        else if (i % 3 === 1) { ctx.arc(0, 0, r * 0.8, 0, TAU); }
        else { ctx.moveTo(-r, 0); ctx.lineTo(r, 0); ctx.moveTo(0, -r); ctx.lineTo(0, r); }
        ctx.stroke(); ctx.restore();
      }
      ctx.restore();

      ctx.lineCap = "round"; ctx.lineJoin = "round";
      // guide: dotted path of every stroke
      const curS = this.current();
      this.strokes.forEach((s, si) => {
        const isCur = s === curS;
        ctx.beginPath(); s.pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.strokeStyle = isCur ? "rgba(18,6,28,.7)" : "rgba(18,6,28,.4)"; ctx.lineWidth = this.lw * 1.25; ctx.stroke();
        ctx.setLineDash([0.1, this.lw * 0.9]); ctx.strokeStyle = isCur ? "rgba(255,255,255,.85)" : "rgba(255,255,255,.28)"; ctx.lineWidth = this.lw * 0.42; ctx.stroke(); ctx.setLineDash([]);
        // stroke number at the start of each stroke still to do
        if (!s.done && this.strokes.length > 1) {
          const p0 = s.pts[0], p1 = s.pts[Math.min(s.pts.length - 1, 4)];
          const a = Math.atan2(p1.y - p0.y, p1.x - p0.x) + Math.PI, d = this.lw * 1.35;
          const nx = p0.x + Math.cos(a) * d, ny = p0.y + Math.sin(a) * d, r = this.lw * 0.5;
          ctx.fillStyle = isCur ? "#ffe27a" : "rgba(255,255,255,.35)"; ctx.strokeStyle = "#12061c"; ctx.lineWidth = 3 * this.dpr;
          ctx.beginPath(); ctx.arc(nx, ny, r, 0, TAU); ctx.fill(); ctx.stroke();
          ctx.fillStyle = "#12061c"; ctx.font = `800 ${Math.round(r * 1.3)}px "Baloo 2", "Nunito", sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText(String(si + 1), nx, ny + r * 0.06);
        }
      });
      // a pulsing start dot + direction arrow on the next stroke to do
      const nx = this.strokes.find((s) => !s.done);
      if (nx && !this.finished) {
        const k = Math.min(nx.n, nx.pts.length - 1), p0 = nx.pts[k], p1 = nx.pts[Math.min(nx.pts.length - 1, k + 3)];
        const pulse = 1 + 0.25 * Math.sin(t * 6);
        ctx.fillStyle = "#7dffb0"; ctx.strokeStyle = "#12061c"; ctx.lineWidth = 4 * this.dpr;
        ctx.beginPath(); ctx.arc(p0.x, p0.y, this.lw * 0.55 * pulse, 0, TAU); ctx.fill(); ctx.stroke();
        if (p1 && p1 !== p0) {
          const a = Math.atan2(p1.y - p0.y, p1.x - p0.x), d = this.lw * 1.4;
          ctx.save(); ctx.translate(p0.x + Math.cos(a) * d, p0.y + Math.sin(a) * d); ctx.rotate(a);
          ctx.beginPath(); ctx.moveTo(this.lw * 0.5, 0); ctx.lineTo(-this.lw * 0.25, -this.lw * 0.4); ctx.lineTo(-this.lw * 0.25, this.lw * 0.4); ctx.closePath();
          ctx.fillStyle = "#7dffb0"; ctx.fill(); ctx.stroke(); ctx.restore();
        }
      }
      // inked parts glow like magic fire
      const runs = [];
      this.strokes.forEach((s) => {
        let cur = null;
        s.pts.forEach((p) => { if (p.on) { if (!cur) { cur = []; runs.push(cur); } cur.push(p); } else cur = null; });
      });
      const flick = 0.85 + 0.15 * Math.sin(t * 14);
      const passes = [[this.lw * 2.6, hexA(this.color, 0.18 * flick + fin * 0.2), true], [this.lw * 1.5, hexA(this.color, 0.45 + fin * 0.3), true], [this.lw * 0.95, this.color, false], [this.lw * 0.38, "rgba(255,255,255,.95)", false]];
      passes.forEach(([w, col, add]) => {
        ctx.globalCompositeOperation = add ? "lighter" : "source-over";
        ctx.strokeStyle = col; ctx.lineWidth = w * (1 + fin * 0.25);
        runs.forEach((r) => {
          ctx.beginPath(); r.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
          if (r.length === 1) ctx.lineTo(r[0].x + 0.1, r[0].y);
          ctx.stroke();
        });
      });
      ctx.globalCompositeOperation = "source-over";
      // the wand trail following the finger
      this.trail.forEach((p) => { p.a -= dt * 2.4; });
      while (this.trail.length && this.trail[0].a <= 0) this.trail.shift();
      ctx.globalCompositeOperation = "lighter";
      for (let i = 1; i < this.trail.length; i++) {
        const a = this.trail[i - 1], b = this.trail[i];
        ctx.strokeStyle = `rgba(255,240,180,${0.5 * b.a})`; ctx.lineWidth = this.lw * 0.5 * b.a;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      // sparkles
      this.parts.forEach((q) => {
        q.age += dt; q.vy += 420 * this.dpr * dt; q.vx *= 0.98; q.x += q.vx * dt; q.y += q.vy * dt;
        const a = Math.max(0, 1 - q.age / q.life);
        ctx.globalAlpha = a; ctx.fillStyle = q.c;
        if (q.star) {
          const s = q.s * 1.6; ctx.beginPath();
          for (let i = 0; i < 8; i++) { const r = i % 2 ? s * 0.3 : s, an = i * Math.PI / 4 + q.age * 4; ctx.lineTo(q.x + Math.cos(an) * r, q.y + Math.sin(an) * r); }
          ctx.closePath(); ctx.fill();
        } else { ctx.beginPath(); ctx.arc(q.x, q.y, q.s * a, 0, TAU); ctx.fill(); }
      });
      this.parts = this.parts.filter((q) => q.age < q.life);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
    }
  }
  // any CSS colour (hex, hsl, rgb) -> rgba with the given alpha
  const _cc = document.createElement("canvas").getContext("2d"), _cache = {};
  function hexA(col, a) {
    let hex = _cache[col];
    if (!hex) { _cc.fillStyle = "#000"; _cc.fillStyle = col; hex = _cache[col] = _cc.fillStyle; }
    if (hex[0] !== "#") return hex;
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  global.Glyphs = { letterGlyph, symbolGlyph, symbolFor, svg, SYMBOLS, POTION_SYMBOL };
  global.Tracer = Tracer;
})(window);
