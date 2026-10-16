/* =====================================================================
   Cauldron engine — a procedurally drawn, reactive witch's pot on <canvas>.

   Everything is drawn in a fixed 1000x900 "design space" and scaled to fit,
   so the same pot works on the title screen, the pantry, the stir game and
   the presentation screen. Static art (iron body, rim, logs) is baked once
   per size; the liquid, bubbles, floating ingredients, fire and every
   magic effect are animated each frame.

   Public API (see class Cauldron below):
     new Cauldron(canvas, options)  setPicks / addPick / removePick
     setSpoon / autoStir / stirTotal / stirSpeed   splash / burst / burp
     highlightItem / jumpItem / itemClientPos   start / stop / destroy
   ===================================================================== */
(function (global) {
  "use strict";

  const TAU = Math.PI * 2;
  const W = 1000, H = 900, CX = 500;
  const RIM = { cy: 300, rx: 372, ry: 112 };      // outer lip of the pot
  const INNER = { cy: 300, rx: 336, ry: 101 };    // opening
  const LIQ = { cy: 322, rx: 316, ry: 84 };       // liquid surface
  const OUTLINE = "#12061c";

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const wrap = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
  const hex2rgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const rgb = (c, a) => a === undefined ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const lighten = (c, t) => mixc(c, [255, 255, 255], t);
  const darken = (c, t) => mixc(c, [10, 4, 24], t);
  const reduceMotion = !!(global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches);

  // ---------- image + sprite caches -------------------------------------
  const IMG = {};
  function loadImg(src) {
    if (IMG[src]) return IMG[src];
    const im = new Image();
    im.decoding = "async";
    im.src = src;
    IMG[src] = im;
    return im;
  }
  const GLOW = {};
  function glowSprite(color) {
    if (GLOW[color]) return GLOW[color];
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d");
    const rgbv = hex2rgb(color);
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.22, rgb(lighten(rgbv, 0.35), 0.95));
    gr.addColorStop(0.55, rgb(rgbv, 0.45));
    gr.addColorStop(1, rgb(rgbv, 0));
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    GLOW[color] = c;
    return c;
  }
  const SOFT = {};
  function softSprite(color) {          // plain soft puff, no hot core (steam, smoke)
    if (SOFT[color]) return SOFT[color];
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d");
    const rgbv = hex2rgb(color);
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, rgb(rgbv, 0.9));
    gr.addColorStop(0.5, rgb(rgbv, 0.4));
    gr.addColorStop(1, rgb(rgbv, 0));
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    SOFT[color] = c;
    return c;
  }

  // ---------- particle shapes (drawn around the origin) -------------------
  const SHAPES = {
    glow(ctx, s, p) { ctx.drawImage(glowSprite(p.color), -s, -s, s * 2, s * 2); },
    soft(ctx, s, p) { ctx.drawImage(softSprite(p.color), -s, -s, s * 2, s * 2); },
    circle(ctx, s, p) { ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(0, 0, s, 0, TAU); ctx.fill(); },
    ring(ctx, s, p) { ctx.strokeStyle = p.color; ctx.lineWidth = p.lw || 4; ctx.beginPath(); ctx.arc(0, 0, s, 0, TAU); ctx.stroke(); },
    star4(ctx, s, p) {
      ctx.fillStyle = p.color; ctx.beginPath();
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, r = i % 2 ? s * 0.26 : s; ctx[i ? "lineTo" : "moveTo"](Math.cos(a) * r, Math.sin(a) * r); }
      ctx.closePath(); ctx.fill();
    },
    star5(ctx, s, p) {
      ctx.fillStyle = p.color; ctx.beginPath();
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? s * 0.45 : s; ctx[i ? "lineTo" : "moveTo"](Math.cos(a) * r, Math.sin(a) * r); }
      ctx.closePath(); ctx.fill();
    },
    heart(ctx, s, p) {
      ctx.fillStyle = p.color; ctx.beginPath(); ctx.moveTo(0, s * 0.9);
      ctx.bezierCurveTo(-s * 1.5, -s * 0.1, -s * 0.8, -s * 1.1, 0, -s * 0.35);
      ctx.bezierCurveTo(s * 0.8, -s * 1.1, s * 1.5, -s * 0.1, 0, s * 0.9); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.55)"; ctx.beginPath(); ctx.ellipse(-s * 0.5, -s * 0.38, s * 0.22, s * 0.13, -0.6, 0, TAU); ctx.fill();
    },
    leaf(ctx, s, p) {
      ctx.fillStyle = p.color; ctx.beginPath(); ctx.moveTo(0, -s);
      ctx.quadraticCurveTo(s * 0.95, -s * 0.15, 0, s); ctx.quadraticCurveTo(-s * 0.95, -s * 0.15, 0, -s); ctx.fill();
      ctx.strokeStyle = "rgba(0,60,0,.35)"; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(0, -s * 0.8); ctx.lineTo(0, s * 0.85); ctx.stroke();
    },
    drop(ctx, s, p) {
      ctx.fillStyle = p.color; ctx.beginPath(); ctx.moveTo(0, -s * 1.4);
      ctx.bezierCurveTo(s * 0.95, -s * 0.2, s * 0.85, s * 0.95, 0, s * 0.95);
      ctx.bezierCurveTo(-s * 0.85, s * 0.95, -s * 0.95, -s * 0.2, 0, -s * 1.4); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.5)"; ctx.beginPath(); ctx.ellipse(-s * 0.3, s * 0.2, s * 0.14, s * 0.3, 0.3, 0, TAU); ctx.fill();
    },
    snow(ctx, s, p) {
      ctx.strokeStyle = p.color; ctx.lineWidth = Math.max(1.6, s * 0.2); ctx.lineCap = "round"; ctx.beginPath();
      for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3; ctx.moveTo(Math.cos(a) * s, Math.sin(a) * s); ctx.lineTo(-Math.cos(a) * s, -Math.sin(a) * s); }
      ctx.stroke();
    },
    rock(ctx, s, p) {
      ctx.fillStyle = p.color; ctx.strokeStyle = "rgba(20,6,28,.7)"; ctx.lineWidth = 2; ctx.beginPath();
      for (let i = 0; i < 7; i++) { const a = i / 7 * TAU, r = s * (0.78 + 0.22 * Math.sin(i * 2.7 + (p.seed || 0))); ctx[i ? "lineTo" : "moveTo"](Math.cos(a) * r, Math.sin(a) * r); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
    },
    streak(ctx, s, p) {
      ctx.fillStyle = p.color; ctx.beginPath(); ctx.moveTo(-s * 3.2, 0); ctx.lineTo(s * 0.4, -s * 0.5); ctx.lineTo(s, 0); ctx.lineTo(s * 0.4, s * 0.5); ctx.closePath(); ctx.fill();
    },
    bat(ctx, s, p) {
      const f = 0.55 + 0.45 * Math.sin(p.age * 16 + (p.seed || 0));
      ctx.fillStyle = p.color; ctx.beginPath();
      ctx.ellipse(0, 0, s * 0.28, s * 0.4, 0, 0, TAU);
      ctx.moveTo(0, -s * 0.05);
      ctx.quadraticCurveTo(s * 0.7, -s * 1.0 * f, s * 1.5, -s * 0.2 * f); ctx.quadraticCurveTo(s * 1.15, s * 0.1, s * 0.95, s * 0.45); ctx.quadraticCurveTo(s * 0.6, s * 0.1, s * 0.3, s * 0.35);
      ctx.lineTo(0, s * 0.2);
      ctx.lineTo(-s * 0.3, s * 0.35); ctx.quadraticCurveTo(-s * 0.6, s * 0.1, -s * 0.95, s * 0.45); ctx.quadraticCurveTo(-s * 1.15, s * 0.1, -s * 1.5, -s * 0.2 * f);
      ctx.quadraticCurveTo(-s * 0.7, -s * 1.0 * f, 0, -s * 0.05);
      ctx.fill();
      ctx.beginPath(); ctx.moveTo(-s * 0.22, -s * 0.34); ctx.lineTo(-s * 0.12, -s * 0.7); ctx.lineTo(0, -s * 0.38); ctx.lineTo(s * 0.12, -s * 0.7); ctx.lineTo(s * 0.22, -s * 0.34); ctx.fill();
    },
    zzz(ctx, s, p) {
      ctx.font = `900 ${s * 2.2}px "Baloo 2", "Nunito", sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.lineWidth = s * 0.35; ctx.strokeStyle = "rgba(18,6,28,.85)"; ctx.lineJoin = "round"; ctx.strokeText("Z", 0, 0);
      ctx.fillStyle = p.color; ctx.fillText("Z", 0, 0);
    },
    clover(ctx, s, p) {
      ctx.fillStyle = p.color;
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; ctx.beginPath(); ctx.arc(Math.cos(a) * s * 0.5, Math.sin(a) * s * 0.5, s * 0.5, 0, TAU); ctx.fill(); }
      ctx.strokeStyle = "rgba(0,70,20,.55)"; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(s * 0.3, s * 1.1); ctx.stroke();
    },
    eye(ctx, s, p) {
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.moveTo(-s, 0); ctx.quadraticCurveTo(0, -s * 1.1, s, 0); ctx.quadraticCurveTo(0, s * 1.1, -s, 0); ctx.fill();
      ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(0, 0, s * 0.48, 0, TAU); ctx.fill();
      ctx.fillStyle = "#12061c"; ctx.beginPath(); ctx.arc(0, 0, s * 0.22, 0, TAU); ctx.fill();
    },
    spark(ctx, s, p) {
      ctx.strokeStyle = p.color; ctx.lineWidth = Math.max(1.5, s * 0.35); ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(-s, 0); ctx.lineTo(s, 0); ctx.stroke();
    }
  };

  class Particles {
    constructor(max) { this.list = []; this.max = max || 260; }
    spawn(o) {
      if (this.list.length >= this.max) return null;
      const p = Object.assign({
        x: 0, y: 0, vx: 0, vy: 0, g: 0, drag: 0, life: 1, age: 0, size: 6, s1: 1,
        rot: 0, vr: 0, color: "#fff", shape: "glow", add: false, alpha: 1, fade: "out", seed: Math.random() * 10
      }, o);
      this.list.push(p);
      return p;
    }
    update(dt) {
      const L = this.list;
      for (let i = L.length - 1; i >= 0; i--) {
        const p = L[i];
        p.age += dt;
        if (p.age >= p.life) { L[i] = L[L.length - 1]; L.pop(); continue; }
        p.vy += p.g * dt;
        if (p.drag) { const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vy *= k; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
        if (p.fn) p.fn(p, dt);
      }
    }
    draw(ctx, S, ox, oy) {
      for (let i = 0; i < this.list.length; i++) {
        const p = this.list[i];
        const t = p.age / p.life;
        let a = p.alpha;
        if (p.fade === "out") a *= 1 - t * t;
        else if (p.fade === "inout") a *= Math.min(1, t * 6, (1 - t) * 3);
        else if (p.fade === "in") a *= Math.min(1, t * 4);
        if (a <= 0.01) continue;
        const size = p.size * (1 + (p.s1 - 1) * t);
        const c = Math.cos(p.rot) * S, s = Math.sin(p.rot) * S;
        ctx.setTransform(c, s, -s, c, ox + p.x * S, oy + p.y * S);
        ctx.globalAlpha = a;
        ctx.globalCompositeOperation = p.add ? "lighter" : "source-over";
        SHAPES[p.shape](ctx, size, p);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      ctx.setTransform(S, 0, 0, S, ox, oy);
    }
  }

  // ---------- one emitter per element power ---------------------------------
  const RATE = {
    fire: 11, water: 4.5, ice: 7, earth: 4, wind: 7, thunder: 5, light: 6, dark: 5, life: 4.5,
    heal: 3.5, magic: 9, psychic: 1.3, luck: 3.2, sleep: 1.5, speed: 12, strong: 2.4, shield: 3
  };
  const TAGCOL = {
    fire: "#ff6a1f", water: "#5db6ff", ice: "#c6f4ff", earth: "#a8733a", wind: "#bffff0", thunder: "#ffe51f",
    light: "#ffe27a", dark: "#7a45c9", life: "#6be34a", heal: "#ff6b8e", magic: "#b86bff", psychic: "#ff6be8",
    luck: "#38e27a", sleep: "#9fb0ff", speed: "#6ff3e6", strong: "#ff5a4a", shield: "#cfe0ff"
  };
  const EMIT = {
    fire(pot) {
      const q = pot.surfacePoint(0.85);
      pot.fx.spawn({ shape: "glow", color: pick(["#ff9a2b", "#ffd24a", "#ff5a1f"]), x: q.x, y: q.y - 4, vx: rand(-30, 30), vy: rand(-300, -140), g: 120, life: rand(0.7, 1.4), size: rand(7, 15), s1: 0.2, add: true });
    },
    water(pot) {
      const q = pot.surfacePoint(0.8);
      pot.fx.spawn({ shape: "drop", color: "#8fd0ff", x: q.x, y: q.y, vx: rand(-60, 60), vy: -rand(320, 560), g: 1300, life: 1.25, size: rand(5, 9), fade: "inout" });
      if (Math.random() < 0.4) pot.ripple(q.x, q.y, 0.5);
    },
    ice(pot) {
      pot.fx.spawn({ shape: "snow", color: "#e8fbff", x: rand(CX - 310, CX + 310), y: rand(60, 230), vx: rand(-20, 20), vy: rand(36, 80), life: rand(2.2, 3.4), size: rand(6, 12), vr: rand(-2, 2), fade: "inout", add: true });
    },
    earth(pot) {
      const q = pot.surfacePoint(0.7);
      pot.fx.spawn({ shape: "rock", color: pick(["#8a5a2b", "#a8733a", "#6b4423", "#c08a50"]), x: q.x, y: q.y, vx: rand(-90, 90), vy: -rand(260, 420), g: 1150, life: 1.1, size: rand(6, 11), vr: rand(-8, 8), fade: "inout" });
    },
    wind(pot) {
      pot.fx.spawn({
        shape: "streak", color: "#dafff4", add: true, size: rand(5, 8), life: rand(1.6, 2.4), fade: "inout",
        ang: rand(0, TAU), rad: rand(250, 370), h: rand(120, 230), x: CX, y: 200,
        fn(p, dt) { p.ang += dt * 2.6; p.rad *= 1 - dt * 0.25; p.x = CX + Math.cos(p.ang) * p.rad; p.y = p.h + Math.sin(p.ang) * p.rad * 0.3 - p.age * 30; p.rot = p.ang + Math.PI / 2 - 0.2; }
      });
    },
    thunder(pot) {
      const q = pot.surfacePoint(0.9);
      pot.fx.spawn({ shape: "spark", color: pick(["#fff7a0", "#ffe51f", "#bfe6ff"]), x: q.x, y: q.y - 10, vx: rand(-420, 420), vy: -rand(120, 360), g: 700, life: rand(0.25, 0.5), size: rand(8, 15), rot: rand(0, TAU), vr: rand(-12, 12), add: true });
    },
    light(pot) {
      const q = pot.surfacePoint(0.9);
      pot.fx.spawn({ shape: "star4", color: pick(["#fff0a8", "#ffe27a", "#ffffff"]), x: q.x, y: q.y - 8, vx: rand(-25, 25), vy: -rand(60, 150), life: rand(1.4, 2.4), size: rand(6, 13), vr: rand(-1.5, 1.5), fade: "inout", add: true });
    },
    dark(pot) {
      const q = pot.surfacePoint(0.8);
      pot.fx.spawn({ shape: "soft", color: "#1b0830", x: q.x, y: q.y - 10, vx: rand(-14, 14), vy: -rand(40, 90), life: rand(1.8, 2.8), size: rand(26, 40), s1: 2.3, alpha: 0.5, fade: "inout" });
      if (Math.random() < 0.08) {
        const dir = Math.random() < 0.5 ? -1 : 1;
        pot.fx.spawn({ shape: "bat", color: "#190a2b", x: CX + dir * 140, y: 230, vx: dir * rand(70, 150), vy: -rand(100, 190), life: 2.6, size: rand(15, 24), fade: "inout", seed: rand(0, 6) });
      }
    },
    life(pot) {
      const q = pot.surfacePoint(0.85);
      pot.fx.spawn({ shape: "leaf", color: pick(["#6be34a", "#8bf06a", "#3fc23c"]), x: q.x, y: q.y - 6, vx: rand(-30, 30), vy: -rand(90, 190), g: 30, life: rand(1.5, 2.3), size: rand(9, 15), vr: rand(-3, 3), fade: "inout",
        fn(p) { p.vx += Math.sin(p.age * 5 + p.seed) * 4; } });
    },
    heal(pot) {
      const q = pot.surfacePoint(0.85);
      pot.fx.spawn({ shape: "heart", color: pick(["#ff6b8e", "#ff9ab3", "#ff4d6d"]), x: q.x, y: q.y - 6, vx: rand(-25, 25), vy: -rand(80, 160), life: rand(1.5, 2.2), size: rand(9, 15), fade: "inout",
        fn(p) { p.vx += Math.sin(p.age * 4 + p.seed) * 5; p.rot = Math.sin(p.age * 3 + p.seed) * 0.35; } });
    },
    magic(pot) {
      const q = pot.surfacePoint(0.8);
      pot.fx.spawn({ shape: pick(["star5", "star4", "glow"]), color: pick(["#c58bff", "#ff9bf1", "#8ea4ff", "#ffffff"]), x: q.x, y: q.y - 8, vx: 0, vy: -rand(90, 170), life: rand(1.4, 2.4), size: rand(7, 14), vr: rand(-3, 3), add: true, fade: "inout",
        a0: rand(0, TAU), x0: q.x,
        fn(p) { p.x = p.x0 + Math.sin(p.age * 4 + p.a0) * 30; } });
    },
    psychic(pot) {
      pot.fx.spawn({ shape: "ring", color: "#ff7be8", x: CX, y: 235, vx: 0, vy: -20, life: 1.5, size: 40, s1: 6, add: true, lw: 5, alpha: 0.8, fade: "out" });
      if (Math.random() < 0.6) {
        const q = pot.surfacePoint(0.8);
        pot.fx.spawn({ shape: "eye", color: pick(["#ff6be8", "#7be8ff"]), x: q.x, y: q.y - 10, vx: rand(-20, 20), vy: -rand(70, 130), life: 1.7, size: rand(10, 15), fade: "inout" });
      }
    },
    luck(pot) {
      const q = pot.surfacePoint(0.85);
      pot.fx.spawn({ shape: "clover", color: pick(["#38e27a", "#6bf09a", "#2fc866"]), x: q.x, y: q.y - 6, vx: rand(-25, 25), vy: -rand(80, 150), life: rand(1.5, 2.2), size: rand(10, 16), vr: rand(-2, 2), fade: "inout" });
      pot.fx.spawn({ shape: "star4", color: "#fff7a0", x: q.x + rand(-30, 30), y: q.y - rand(10, 60), vy: -30, life: 0.9, size: rand(5, 9), add: true, fade: "inout" });
    },
    sleep(pot) {
      const q = pot.surfacePoint(0.5);
      pot.fx.spawn({ shape: "zzz", color: pick(["#bcc7ff", "#9fb0ff", "#e1e6ff"]), x: q.x, y: q.y - 20, vx: rand(10, 36), vy: -rand(40, 80), life: 2.6, size: rand(9, 14), s1: 1.9, fade: "inout",
        fn(p) { p.rot = Math.sin(p.age * 2.2 + p.seed) * 0.25; } });
    },
    speed(pot) {
      const y = rand(LIQ.cy - 70, LIQ.cy + 30);
      pot.fx.spawn({ shape: "streak", color: "#8ff7ec", x: CX - 380, y, vx: rand(1100, 1700), life: 0.55, size: rand(5, 9), add: true, fade: "inout" });
    },
    strong(pot) {
      const q = pot.surfacePoint(0.7);
      pot.fx.spawn({ shape: "star4", color: pick(["#ff5a4a", "#ffb199", "#ff8a3a"]), x: q.x, y: q.y - 4, vx: rand(-200, 200), vy: -rand(200, 420), g: 800, life: rand(0.5, 0.9), size: rand(8, 15), vr: rand(-8, 8), add: true });
      if (Math.random() < 0.4) pot.fx.spawn({ shape: "ring", color: "#ff5a4a", x: q.x, y: q.y, size: 12, s1: 7, life: 0.7, add: true, lw: 5, alpha: 0.7 });
    },
    shield(pot) {
      pot.fx.spawn({ shape: "ring", color: "#bcd3ff", x: CX, y: 270, size: 120, s1: 2.1, life: 1.6, lw: 5, add: true, alpha: 0.5, fade: "out" });
      const q = pot.surfacePoint(0.9);
      pot.fx.spawn({ shape: "star4", color: "#ffffff", x: q.x, y: q.y - 20, vy: -20, life: 1.1, size: rand(5, 10), add: true, fade: "inout" });
    }
  };

  // ---------- static art -----------------------------------------------------
  function bodyPath(g) {
    g.beginPath();
    g.moveTo(CX - RIM.rx, RIM.cy);
    g.bezierCurveTo(70, 350, 52, 470, 96, 552);
    g.bezierCurveTo(150, 650, 300, 706, CX, 706);
    g.bezierCurveTo(700, 706, 850, 650, 904, 552);
    g.bezierCurveTo(948, 470, 930, 350, CX + RIM.rx, RIM.cy);
    g.ellipse(CX, RIM.cy, RIM.rx, RIM.ry, 0, 0, Math.PI, false);
    g.closePath();
  }
  const BODY_PATH = (function () {
    if (typeof Path2D === "undefined") return null;
    const p = new Path2D();
    p.moveTo(CX - RIM.rx, RIM.cy);
    p.bezierCurveTo(70, 350, 52, 470, 96, 552);
    p.bezierCurveTo(150, 650, 300, 706, CX, 706);
    p.bezierCurveTo(700, 706, 850, 650, 904, 552);
    p.bezierCurveTo(948, 470, 930, 350, CX + RIM.rx, RIM.cy);
    p.ellipse(CX, RIM.cy, RIM.rx, RIM.ry, 0, 0, Math.PI, false);
    p.closePath();
    return p;
  })();

  function drawGround(g) {
    // shadow
    let gr = g.createRadialGradient(CX, 830, 20, CX, 830, 470);
    gr.addColorStop(0, "rgba(10,2,20,.7)"); gr.addColorStop(1, "rgba(10,2,20,0)");
    g.fillStyle = gr; g.beginPath(); g.ellipse(CX, 832, 480, 92, 0, 0, TAU); g.fill();
    // two crossed logs
    const log = (x0, y0, x1, y1, th) => {
      const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
      g.save(); g.translate(x0, y0); g.rotate(ang);
      g.lineJoin = "round";
      g.fillStyle = "#6b3a1c"; g.strokeStyle = OUTLINE; g.lineWidth = 9;
      g.beginPath(); g.roundRect ? g.roundRect(0, -th / 2, len, th, th / 2) : g.rect(0, -th / 2, len, th);
      g.fill(); g.stroke();
      const lg = g.createLinearGradient(0, -th / 2, 0, th / 2);
      lg.addColorStop(0, "rgba(255,190,120,.35)"); lg.addColorStop(0.45, "rgba(255,190,120,0)"); lg.addColorStop(1, "rgba(0,0,0,.35)");
      g.fillStyle = lg; g.beginPath(); g.roundRect ? g.roundRect(0, -th / 2, len, th, th / 2) : g.rect(0, -th / 2, len, th); g.fill();
      g.strokeStyle = "rgba(40,16,4,.55)"; g.lineWidth = 3;
      for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(len * (0.18 + k * 0.2), -th * 0.22); g.lineTo(len * (0.24 + k * 0.2), th * 0.18); g.stroke(); }
      // cut end rings
      g.fillStyle = "#d9a064"; g.strokeStyle = OUTLINE; g.lineWidth = 6;
      g.beginPath(); g.ellipse(len, 0, th * 0.26, th * 0.5, 0, 0, TAU); g.fill(); g.stroke();
      g.strokeStyle = "#a8683a"; g.lineWidth = 3; g.beginPath(); g.ellipse(len, 0, th * 0.14, th * 0.3, 0, 0, TAU); g.stroke();
      g.restore();
    };
    log(300, 842, 700, 800, 46);
    log(310, 802, 696, 846, 46);
    log(380, 828, 640, 816, 40);
  }

  function drawPotBase(g) {
    g.lineJoin = "round"; g.lineCap = "round";
    // side legs
    const leg = (x0, y0, x1, y1, w) => {
      g.beginPath(); g.moveTo(x0 - w / 2, y0); g.lineTo(x1 - w * 0.4, y1);
      g.quadraticCurveTo(x1, y1 + 18, x1 + w * 0.4, y1); g.lineTo(x0 + w / 2, y0); g.closePath();
      const lg = g.createLinearGradient(x1 - w / 2, 0, x1 + w / 2, 0);
      lg.addColorStop(0, "#3b3a5d"); lg.addColorStop(0.4, "#55547d"); lg.addColorStop(1, "#242340");
      g.fillStyle = lg; g.fill(); g.strokeStyle = OUTLINE; g.lineWidth = 10; g.stroke();
    };
    leg(292, 690, 246, 782, 74);
    leg(708, 690, 754, 782, 74);
    // handles (rings tucked behind the body)
    [[84, -1], [916, 1]].forEach(([x]) => {
      g.strokeStyle = OUTLINE; g.lineWidth = 36; g.beginPath(); g.ellipse(x, 432, 50, 66, 0, 0, TAU); g.stroke();
      g.strokeStyle = "#4b4a72"; g.lineWidth = 21; g.stroke();
      g.strokeStyle = "rgba(255,255,255,.28)"; g.lineWidth = 5; g.beginPath(); g.ellipse(x, 432, 50, 66, 0, Math.PI * 1.05, Math.PI * 1.55); g.stroke();
    });
    // body
    bodyPath(g);
    let lg = g.createLinearGradient(80, 0, 920, 0);
    lg.addColorStop(0, "#26253f"); lg.addColorStop(0.2, "#4f4e78"); lg.addColorStop(0.42, "#3d3c63"); lg.addColorStop(0.78, "#2a2946"); lg.addColorStop(1, "#1e1d36");
    g.fillStyle = lg; g.fill();
    g.save(); bodyPath(g); g.clip();
    lg = g.createLinearGradient(0, 300, 0, 710);
    lg.addColorStop(0, "rgba(6,2,16,.55)"); lg.addColorStop(0.22, "rgba(6,2,16,0)"); lg.addColorStop(1, "rgba(6,2,16,.28)");
    g.fillStyle = lg; g.fillRect(0, 280, W, 440);
    let rg = g.createRadialGradient(320, 470, 10, 320, 470, 260);
    rg.addColorStop(0, "rgba(220,225,255,.34)"); rg.addColorStop(1, "rgba(220,225,255,0)");
    g.fillStyle = rg; g.fillRect(0, 280, W, 440);
    // shine stripe
    g.strokeStyle = "rgba(255,255,255,.22)"; g.lineWidth = 16; g.beginPath(); g.moveTo(148, 392); g.quadraticCurveTo(122, 470, 168, 548); g.stroke();
    g.strokeStyle = "rgba(255,255,255,.14)"; g.lineWidth = 7; g.beginPath(); g.moveTo(190, 590); g.quadraticCurveTo(230, 640, 300, 664); g.stroke();
    g.restore();
    bodyPath(g); g.strokeStyle = OUTLINE; g.lineWidth = 12; g.stroke();
    // lugs where the handles join
    [[110, 1], [890, -1]].forEach(([x]) => {
      g.fillStyle = "#3d3c63"; g.strokeStyle = OUTLINE; g.lineWidth = 8;
      g.beginPath(); g.roundRect ? g.roundRect(x - 26, 398, 52, 70, 14) : g.rect(x - 26, 398, 52, 70); g.fill(); g.stroke();
    });
    // rivets along the lip
    for (let i = 0; i < 13; i++) {
      const t = Math.PI * (0.07 + i * 0.86 / 12);
      const x = CX + Math.cos(t) * 372, y = 322 + Math.sin(t) * 124;
      g.fillStyle = "#6a699a"; g.strokeStyle = OUTLINE; g.lineWidth = 4;
      g.beginPath(); g.arc(x, y, 9, 0, TAU); g.fill(); g.stroke();
      g.fillStyle = "rgba(255,255,255,.55)"; g.beginPath(); g.arc(x - 2.5, y - 3, 3, 0, TAU); g.fill();
    }
    // emblem base (the live pips are painted on top every frame)
    g.fillStyle = "#17102a"; g.strokeStyle = OUTLINE; g.lineWidth = 8;
    g.beginPath(); g.arc(CX, 548, 74, 0, TAU); g.fill(); g.stroke();
    g.strokeStyle = "#8a89b4"; g.lineWidth = 6; g.beginPath(); g.arc(CX, 548, 62, 0, TAU); g.stroke();
    g.strokeStyle = "rgba(255,255,255,.18)"; g.lineWidth = 3; g.beginPath(); g.arc(CX, 548, 49, 0, TAU); g.stroke();
    // centre leg (in front)
    g.beginPath(); g.moveTo(446, 694); g.lineTo(458, 770); g.quadraticCurveTo(500, 790, 542, 770); g.lineTo(554, 694); g.closePath();
    lg = g.createLinearGradient(446, 0, 554, 0); lg.addColorStop(0, "#3b3a5d"); lg.addColorStop(0.4, "#58577f"); lg.addColorStop(1, "#242340");
    g.fillStyle = lg; g.fill(); g.strokeStyle = OUTLINE; g.lineWidth = 10; g.stroke();
    // rim ring (top surface of the lip)
    g.beginPath(); g.ellipse(CX, RIM.cy, RIM.rx, RIM.ry, 0, 0, TAU);
    lg = g.createLinearGradient(0, RIM.cy - RIM.ry, 0, RIM.cy + RIM.ry);
    lg.addColorStop(0, "#9a99bd"); lg.addColorStop(0.5, "#6d6c96"); lg.addColorStop(1, "#4a4970");
    g.fillStyle = lg; g.fill(); g.strokeStyle = OUTLINE; g.lineWidth = 11; g.stroke();
    g.strokeStyle = "rgba(255,255,255,.42)"; g.lineWidth = 5; g.beginPath(); g.ellipse(CX, RIM.cy, RIM.rx - 8, RIM.ry - 7, 0, Math.PI * 1.08, Math.PI * 1.7); g.stroke();
    // dark opening
    g.beginPath(); g.ellipse(CX, INNER.cy, INNER.rx, INNER.ry, 0, 0, TAU);
    lg = g.createLinearGradient(0, INNER.cy - INNER.ry, 0, INNER.cy + INNER.ry);
    lg.addColorStop(0, "#07020f"); lg.addColorStop(0.55, "#1a0d2b"); lg.addColorStop(1, "#2a1a40");
    g.fillStyle = lg; g.fill(); g.strokeStyle = "rgba(10,2,20,.9)"; g.lineWidth = 5; g.stroke();
  }

  function drawRimFront(g) {
    g.lineJoin = "round";
    g.beginPath();
    g.ellipse(CX, RIM.cy, RIM.rx, RIM.ry, 0, 0, Math.PI, false);
    g.ellipse(CX, INNER.cy, INNER.rx, INNER.ry, 0, Math.PI, 0, true);
    g.closePath();
    const lg = g.createLinearGradient(0, RIM.cy - RIM.ry, 0, RIM.cy + RIM.ry);
    lg.addColorStop(0, "#9a99bd"); lg.addColorStop(0.5, "#6d6c96"); lg.addColorStop(1, "#4a4970");
    g.fillStyle = lg; g.fill();
    g.strokeStyle = OUTLINE; g.lineWidth = 11;
    g.beginPath(); g.ellipse(CX, RIM.cy, RIM.rx, RIM.ry, 0, 0, Math.PI, false); g.stroke();
    g.strokeStyle = "rgba(10,2,20,.9)"; g.lineWidth = 5;
    g.beginPath(); g.ellipse(CX, INNER.cy, INNER.rx, INNER.ry, 0, 0, Math.PI, false); g.stroke();
    g.strokeStyle = "rgba(255,255,255,.34)"; g.lineWidth = 4;
    g.beginPath(); g.ellipse(CX, INNER.cy, INNER.rx + 6, INNER.ry + 5, 0, Math.PI * 0.2, Math.PI * 0.8, false); g.stroke();
  }

  function drawStones(g) {
    const stones = [[130, 850, 78, 40], [236, 878, 70, 36], [352, 890, 62, 32], [500, 896, 70, 34], [648, 890, 62, 32], [764, 878, 70, 36], [870, 850, 78, 40]];
    stones.forEach(([x, y, rx, ry], i) => {
      const lg = g.createLinearGradient(x, y - ry, x, y + ry);
      lg.addColorStop(0, i % 2 ? "#9a97b3" : "#8d8aa8"); lg.addColorStop(1, "#4d4a66");
      g.fillStyle = lg; g.strokeStyle = OUTLINE; g.lineWidth = 8;
      g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fill(); g.stroke();
      g.fillStyle = "rgba(255,255,255,.3)"; g.beginPath(); g.ellipse(x - rx * 0.25, y - ry * 0.35, rx * 0.4, ry * 0.2, -0.1, 0, TAU); g.fill();
    });
  }

  // ===================================================================
  class Cauldron {
    constructor(canvas, options) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      const o = this.opts = Object.assign({
        fit: "center", fire: true, steam: true, pointer: true, spoon: true, letters: false,
        quality: 1, showcase: false, idleStir: false, maxItems: 4, bubbleRate: 1
      }, options || {});
      this.fx = new Particles(260);
      this.picks = [];
      this.items = [];
      this.bubbles = [];
      this.ripples = [];
      this.puffs = [];
      this.jumpers = [];
      this.time = 0;
      this.running = false;
      this.raf = 0;
      this.q = o.quality;
      this.col = hex2rgb(typeof EMPTY_POT_COLOR !== "undefined" ? EMPTY_POT_COLOR : "#35b58c");
      this.colT = this.col.slice();
      this.heat = 0.8;
      this.boil = 0.2;
      this.glow = 0;
      this.flash = 0;
      this.kick = 0; this.kickV = 0;
      this.orbit = 0; this.orbitV = 0.16;
      this.swirl = 0;
      this.stirSpeed = 0; this.stirTotal = 0; this.stirDir = 1; this._lastA = null;
      this.spoon = { x: CX + 120, y: LIQ.cy + 10, tx: CX + 120, ty: LIQ.cy + 10, alpha: 0, want: false };
      this.trail = [];
      this.pointer = { x: 0, y: 0, inside: false, down: false, id: null };
      this.auto = { on: false, t: 0, speed: 3.4 };
      this.idleT = 0;
      this.tags = {};           // active power weights
      this.emitAcc = {};
      this.boltT = 2; this.bolt = null;
      this.pips = [null, null, null, null];
      this.pipGlow = [0, 0, 0, 0];
      this.showT = 1.2;
      this.perf = { n: 0, sum: 0, lowCount: 0 };
      this.onPop = null; this.onSplash = null; this.onTap = null; this.onThunder = null; this.onDrop = null;
      this.hl = -1;
      this._resize = () => this.resize();
      if (typeof ResizeObserver !== "undefined") {
        this.ro = new ResizeObserver(this._resize);
        this.ro.observe(canvas.parentElement || canvas);
      } else {
        global.addEventListener("resize", this._resize);
      }
      this.resize();
      if (o.pointer) this.bindPointer();
    }

    // ----- layout ------------------------------------------------------
    resize() {
      const c = this.canvas;
      const r = c.getBoundingClientRect();
      const cw = Math.max(2, r.width), ch = Math.max(2, r.height);
      const dpr = Math.min(global.devicePixelRatio || 1, 2) * this.q;
      const w = Math.round(cw * dpr), h = Math.round(ch * dpr);
      if (c.width === w && c.height === h && this.layers) return;
      c.width = w; c.height = h;
      this.S = Math.min(w / W, h / H);
      this.ox = (w - W * this.S) / 2;
      this.oy = this.opts.fit === "bottom" ? h - H * this.S : (h - H * this.S) / 2;
      this.buildLayers();
    }
    buildLayers() {
      const mk = (fn) => {
        const cv = document.createElement("canvas");
        cv.width = this.canvas.width; cv.height = this.canvas.height;
        const g = cv.getContext("2d");
        g.setTransform(this.S, 0, 0, this.S, this.ox, this.oy);
        fn(g);
        return cv;
      };
      this.layers = { ground: mk(drawGround), base: mk(drawPotBase), rimFront: mk(drawRimFront), stones: mk(drawStones) };
    }
    toDesign(clientX, clientY) {
      const r = this.canvas.getBoundingClientRect();
      const px = (clientX - r.left) / r.width * this.canvas.width;
      const py = (clientY - r.top) / r.height * this.canvas.height;
      return { x: (px - this.ox) / this.S, y: (py - this.oy) / this.S };
    }
    toClient(x, y) {
      const r = this.canvas.getBoundingClientRect();
      return {
        x: r.left + (this.ox + x * this.S) / this.canvas.width * r.width,
        y: r.top + (this.oy + y * this.S) / this.canvas.height * r.height
      };
    }
    // the point where things should splash into the pot, in client pixels
    dropPoint() { return this.toClient(CX, LIQ.cy - 30); }
    surfacePoint(k) {
      const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * (k || 0.8);
      return { x: CX + Math.cos(a) * r * LIQ.rx, y: LIQ.cy + Math.sin(a) * r * LIQ.ry };
    }

    // ----- pointer -------------------------------------------------------
    bindPointer() {
      const c = this.canvas;
      c.style.touchAction = "none";
      const inside = (p) => {
        const u = (p.x - CX) / (LIQ.rx * 1.12), v = (p.y - LIQ.cy) / (LIQ.ry * 1.9);
        return u * u + v * v <= 1;
      };
      const move = (e) => {
        const p = this.toDesign(e.clientX, e.clientY);
        this.pointer.x = p.x; this.pointer.y = p.y;
        this.pointer.inside = inside(p);
        this.pointer.type = e.pointerType;
        this.idleT = 0;
      };
      c.addEventListener("pointermove", move);
      c.addEventListener("pointerdown", (e) => {
        move(e);
        this.pointer.down = true; this.pointer.id = e.pointerId;
        this._down = { x: e.clientX, y: e.clientY, t: performance.now() };
        try { c.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        if (this.onPointerDown) this.onPointerDown(this.pointer);
      });
      const up = (e) => {
        if (!this.pointer.down) return;
        this.pointer.down = false;
        const d = this._down;
        if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 10 && performance.now() - d.t < 400) {
          const p = this.toDesign(e.clientX, e.clientY);
          if (this.onTap) this.onTap(p, this.hitItem(p));
        }
        if (e.pointerType !== "mouse") this.pointer.inside = false;
      };
      c.addEventListener("pointerup", up);
      c.addEventListener("pointercancel", up);
      c.addEventListener("pointerleave", () => { this.pointer.inside = false; });
    }
    hitItem(p) {
      let best = -1, bd = 1e9;
      this.items.forEach((it, i) => {
        const d = Math.hypot(p.x - it.x, p.y - (it.y - 10));
        if (d < it.size * 0.6 && d < bd) { bd = d; best = i; }
      });
      return best;
    }

    // ----- state ---------------------------------------------------------
    setPicks(picks, o) {
      const opt = o || {};
      this.picks = picks.slice();
      // keep existing items for picks that are still there, add the rest
      const keep = [];
      this.picks.forEach((pk, i) => {
        let it = this.items.find((x) => x.pick === pk);
        if (!it) {
          it = this.makeItem(pk, i, !opt.instant);
        }
        keep.push(it);
      });
      this.items = keep;
      this.relayout();
      this.recompute(opt.instant);
    }
    addPick(pk, from) {
      this.picks.push(pk);
      const it = this.makeItem(pk, this.picks.length - 1, true, from);
      this.items.push(it);
      this.relayout();
      this.recompute(false);
      const slot = this.picks.length - 1;
      if (slot < 4) { this.pips[slot] = pk.ingredient.color; this.pipGlow[slot] = 0; }
      return it;
    }
    removePick(index) {
      const it = this.items[index];
      this.picks.splice(index, 1);
      this.items.splice(index, 1);
      if (it) {
        this.splash(it.x, LIQ.cy, 0.5);
        this.fx.spawn({ shape: "glow", color: "#ffffff", x: it.x, y: it.y, size: 60, life: 0.4, add: true, s1: 0.2 });
      }
      this.pips = [null, null, null, null];
      this.picks.forEach((p, i) => { if (i < 4) { this.pips[i] = p.ingredient.color; this.pipGlow[i] = 1; } });
      this.relayout();
      this.recompute(false);
    }
    makeItem(pk, index, drop, from) {
      const img = loadImg(pk.ingredient.image);
      const it = {
        pick: pk, img, th: 0, rho: 0.5, x: CX, y: LIQ.cy, size: 128, bob: rand(0, TAU), tilt: 0,
        state: "float", vy: 0, hl: 0, letter: pk.ingredient.letter, born: this.time, sink: 1,
        tmp: null
      };
      if (drop) {
        it.state = "drop";
        it.dropX = from ? from.x : null;
        it.x = from ? from.x : CX + rand(-80, 80);
        it.y = from ? from.y : -140;
        it.vy = 0;
        it.th = index * TAU / Math.max(1, this.picks.length);
        it.settled = false;
      }
      return it;
    }
    relayout() {
      const n = Math.max(1, this.items.length);
      this.items.forEach((it, i) => {
        it.thT = i * TAU / n + (n === 1 ? 0 : 0.5);
        it.rhoT = n === 1 ? 0.12 : n === 2 ? 0.48 : 0.56 + (i % 2) * 0.06;
        if (it.th === undefined || it.state === "float" && it.firstLayout === undefined) { it.th = it.thT; it.rho = it.rhoT; it.firstLayout = true; }
      });
    }
    recompute(instant) {
      this.colT = hex2rgb(typeof mixLiquidColor === "function" ? mixLiquidColor(this.picks) : "#35b58c");
      if (instant) this.col = this.colT.slice();
      const scores = typeof scorePowers === "function" ? scorePowers(this.picks).score : {};
      this.tags = {};
      Object.keys(scores).forEach((t) => { this.tags[t] = clamp(scores[t] / 4, 0.25, 1); });
      const n = this.picks.length;
      this.heat = 0.78 + n * 0.06;
      this.boil = 0.2 + n * 0.17;
    }
    setBoil(v) { this.boil = v; }
    setHeat(v) { this.heat = v; }
    setGlow(v) { this.glow = v; }
    highlightItem(i) { this.hl = i; }
    itemClientPos(i) {
      const it = this.items[i];
      if (!it) return null;
      return this.toClient(it.x, it.y - 20);
    }
    jumpItem(i) {
      const it = this.items[i];
      if (!it || it.state !== "float") return;
      it.state = "jump"; it.vy = -760; it.vx = rand(-90, 90) + (CX - it.x) * 0.2; it.spin = rand(-6, 6); it.rotJ = 0;
      this.splash(it.x, LIQ.cy, 0.7);
    }

    // ----- effects -------------------------------------------------------
    ripple(x, y, power) {
      this.ripples.push({ x, y, r: 6, vr: 150 * (power || 1) + 40, a: 0.75, age: 0, life: 1 });
    }
    splash(x, y, power) {
      const p = power || 1;
      this.ripple(x, y, p);
      this.ripples.push({ x, y, r: -14, vr: 120 * p + 40, a: 0.55, age: 0, life: 1 });
      const lc = rgb(lighten(this.col, 0.45));
      const n = Math.round(7 + p * 9);
      for (let i = 0; i < n; i++) {
        this.fx.spawn({ shape: "drop", color: lc, x: x + rand(-30, 30), y: y - 6, vx: rand(-170, 170) * p, vy: -rand(300, 640) * (0.6 + p * 0.5), g: 1500, life: rand(0.7, 1.1), size: rand(4, 9), fade: "inout" });
      }
      this.kickV += 1.6 * p;
      this.flash = Math.max(this.flash, 0.12 * p);
      if (this.onSplash) this.onSplash(p);
    }
    burst(color, n) {
      const c = color || "#ffffff";
      for (let i = 0; i < (n || 26); i++) {
        const a = rand(0, TAU), sp = rand(200, 620);
        this.fx.spawn({ shape: pick(["star4", "glow", "star5"]), color: c, x: CX, y: LIQ.cy - 40, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 260, g: 520, life: rand(0.9, 1.7), size: rand(8, 18), vr: rand(-8, 8), add: true, fade: "inout" });
      }
      this.ripple(CX, LIQ.cy, 2.2);
      this.flash = Math.max(this.flash, 0.4);
      this.kickV += 3;
    }
    burp() {
      this.spawnBubble(true);
      this.spawnBubble(true);
      this.kickV += 1.2;
    }
    spawnBubble(big) {
      const a = Math.random() * TAU, rr = Math.sqrt(Math.random()) * 0.82;
      const size = big ? rand(26, 44) : rand(5, 17);
      this.bubbles.push({
        x: CX + Math.cos(a) * rr * LIQ.rx * 0.92, y: LIQ.cy + Math.sin(a) * rr * LIQ.ry * 0.92,
        size, life: big ? rand(0.9, 1.4) : rand(0.55, 1.2), age: 0, rise: size * (big ? 1.0 : 0.5), tint: Math.random()
      });
    }
    popBubble(b) {
      this.ripples.push({ x: b.x, y: b.y, r: b.size * 0.6, vr: 60 + b.size * 2, a: 0.5, age: 0, life: 0.7 });
      const lc = rgb(lighten(this.col, 0.5));
      const n = b.size > 20 ? 6 : 3;
      for (let i = 0; i < n; i++) {
        this.fx.spawn({ shape: "drop", color: lc, x: b.x, y: b.y - b.rise, vx: rand(-70, 70), vy: -rand(120, 260), g: 1100, life: 0.6, size: rand(2.5, 4.5) + b.size * 0.08, fade: "inout" });
      }
      if (this.onPop) this.onPop(b.size);
    }
    lightning() {
      const pts = [];
      let x = CX + rand(-200, 200), y = -20;
      const tx = CX + rand(-170, 170), ty = LIQ.cy - 10;
      const steps = 9;
      for (let i = 0; i <= steps; i++) {
        pts.push([x, y]);
        x = lerp(x, tx, 0.25) + rand(-60, 60); y += (ty - y) / (steps - i + 0.01) * 1.0;
      }
      pts.push([tx, ty]);
      this.bolt = { pts, life: 0.32, age: 0 };
      this.flash = Math.max(this.flash, reduceMotion ? 0.05 : 0.5);
      this.splash(tx, ty, 0.8);
      if (this.onThunder) this.onThunder();
    }
    autoStir(on, speed) { this.auto.on = !!on; if (speed) this.auto.speed = speed; }
    resetStir() { this.stirTotal = 0; this._lastA = null; }

    // ----- loop ----------------------------------------------------------
    start() {
      if (this.running) return;
      this.running = true;
      this.last = performance.now();
      const loop = (now) => {
        if (!this.running) return;
        this.raf = requestAnimationFrame(loop);
        const dt = Math.min(0.05, (now - this.last) / 1000);
        this.last = now;
        this.step(dt);
        this.render();
        this.watchPerf(dt);
      };
      this.raf = requestAnimationFrame(loop);
    }
    stop() { this.running = false; cancelAnimationFrame(this.raf); }
    destroy() {
      this.stop();
      if (this.ro) this.ro.disconnect(); else global.removeEventListener("resize", this._resize);
    }
    watchPerf(dt) {
      const p = this.perf;
      p.n++; p.sum += dt;
      if (p.n >= 90) {
        const avg = p.sum / p.n;
        if (avg > 0.03 && this.q > 0.55) {
          this.q = Math.max(0.55, this.q * 0.8);
          this.fx.max = Math.round(this.fx.max * 0.7);
          this.layers = null; this.resize();
        }
        p.n = 0; p.sum = 0;
      }
    }

    step(dt) {
      this.time += dt;
      const t = this.time;
      // colour glides toward the mix of the ingredients
      const k = 1 - Math.pow(0.0004, dt);
      for (let i = 0; i < 3; i++) this.col[i] += (this.colT[i] - this.col[i]) * Math.min(1, dt * 2.4);
      // pot jiggle (damped spring)
      this.kickV += (-this.kick * 90 - this.kickV * 7) * dt;
      this.kick += this.kickV * dt;
      this.flash = Math.max(0, this.flash - dt * 1.6);
      for (let i = 0; i < 4; i++) {
        if (this.pips[i]) this.pipGlow[i] = Math.min(1, this.pipGlow[i] + dt * 1.8);
        else this.pipGlow[i] = Math.max(0, this.pipGlow[i] - dt * 2.5);
      }

      // ---- spoon & stirring ----
      const sp = this.spoon, pt = this.pointer;
      const usingPointer = this.opts.spoon && (pt.down || (pt.inside && pt.type === "mouse"));
      if (usingPointer) { this.idleT = 0; }
      else this.idleT += dt;
      let want = usingPointer;
      let tx = sp.tx, ty = sp.ty;
      if (usingPointer) {
        const u = clamp((pt.x - CX) / (LIQ.rx * 0.9), -1, 1), v = clamp((pt.y - LIQ.cy) / (LIQ.ry * 0.9), -1, 1);
        const d = Math.hypot(u, v);
        const m = d > 1 ? 1 / d : 1;
        tx = CX + u * m * LIQ.rx * 0.9; ty = LIQ.cy + v * m * LIQ.ry * 0.9;
      } else if (this.auto.on || (this.opts.idleStir && this.idleT > 2.5 && ((this.idleT - 2.5) % 9) < 4.2)) {
        this.auto.t += dt * (this.auto.on ? this.auto.speed : 2.4);
        tx = CX + Math.cos(this.auto.t) * LIQ.rx * 0.52; ty = LIQ.cy + Math.sin(this.auto.t) * LIQ.ry * 0.52;
        want = true;
      }
      sp.want = want;
      const f = 1 - Math.exp(-dt * 16);
      sp.tx = tx; sp.ty = ty;
      sp.x += (tx - sp.x) * f; sp.y += (ty - sp.y) * f;
      sp.alpha = clamp(sp.alpha + (want ? dt * 6 : -dt * 4), 0, 1);
      // angular speed of the spoon around the pot centre
      const uu = (sp.x - CX) / LIQ.rx, vv = (sp.y - LIQ.cy) / LIQ.ry;
      const rad = Math.hypot(uu, vv);
      const ang = Math.atan2(vv, uu);
      let w = 0;
      if (want && rad > 0.26 && this._lastA !== null) {
        const d = wrap(ang - this._lastA);
        w = d / Math.max(dt, 1e-3);
        const add = Math.min(Math.abs(d), 0.5);
        this.stirTotal += add;
        if (Math.abs(w) > 0.4) this.stirDir = Math.sign(w);
      }
      this._lastA = want ? ang : null;
      const wTarget = clamp(Math.abs(w), 0, 14);
      this.stirSpeed += (wTarget - this.stirSpeed) * Math.min(1, dt * 5);
      if (!want) this.stirSpeed *= Math.pow(0.35, dt);
      if (sp.alpha > 0.1) {
        this.trail.push({ x: sp.x, y: sp.y, a: 1 });
        if (this.trail.length > 22) this.trail.shift();
      }
      this.trail.forEach((p) => { p.a -= dt * 1.8; });
      while (this.trail.length && this.trail[0].a <= 0) this.trail.shift();

      // swirl + orbit
      this.swirl += (0.25 + this.stirSpeed * 0.55) * this.stirDir * dt;
      const ov = 0.14 + this.stirSpeed * 0.34;
      this.orbitV += (ov * this.stirDir - this.orbitV) * Math.min(1, dt * 3);
      this.orbit += this.orbitV * dt;

      // ---- ingredient sprites ----
      this.items.forEach((it, i) => {
        it.bob += dt * (1.6 + this.stirSpeed * 0.3);
        if (it.state === "drop") {
          it.vy += 2100 * dt;
          it.y += it.vy * dt;
          const target = this.itemTarget(it);
          it.x += (target.x - it.x) * Math.min(1, dt * 5);
          it.spin = (it.spin || 0);
          it.rotJ = (it.rotJ || 0) + dt * 6;
          if (it.y >= target.y && it.vy > 0) {
            it.state = "float"; it.y = target.y; it.x = target.x;
            this.splash(it.x, LIQ.cy, 1);
            this.fx.spawn({ shape: "glow", color: it.pick.ingredient.color, x: it.x, y: LIQ.cy - 10, size: 120, life: 0.7, add: true, s1: 2.2, alpha: 0.9 });
            if (this.onDrop) this.onDrop(it, i);
          }
        } else if (it.state === "jump") {
          it.vy += 1500 * dt;
          it.y += it.vy * dt; it.x += it.vx * dt; it.rotJ += it.spin * dt;
          const target = this.itemTarget(it);
          if (it.vy > 0 && it.y >= target.y) { it.state = "float"; it.rotJ = 0; this.splash(it.x, LIQ.cy, 0.9); }
        } else {
          // gently orbit and bob
          it.th += wrap(it.thT - (it.th - this.orbit)) * 0; // layout is expressed relative to orbit
          const target = this.itemTarget(it);
          it.x += (target.x - it.x) * Math.min(1, dt * 9);
          it.y += (target.y - it.y) * Math.min(1, dt * 9);
          it.rotJ = (it.rotJ || 0) * Math.pow(0.02, dt);
        }
        it.rho += (it.rhoT - it.rho) * Math.min(1, dt * 3);
        it.th += (it.thT - it.th) * Math.min(1, dt * 3);
        const hlT = this.hl === i ? 1 : 0;
        it.hl += (hlT - it.hl) * Math.min(1, dt * 10);
      });

      // ---- bubbles ----
      const rate = (2.2 + this.boil * 9) * this.opts.bubbleRate * (1 + this.stirSpeed * 0.5) * this.q;
      if (Math.random() < rate * dt) this.spawnBubble(false);
      if (Math.random() < (0.12 + this.boil * 0.35 + this.stirSpeed * 0.15) * dt * 2) this.spawnBubble(true);
      for (let i = this.bubbles.length - 1; i >= 0; i--) {
        const b = this.bubbles[i];
        b.age += dt;
        if (b.age >= b.life) { this.popBubble(b); this.bubbles.splice(i, 1); }
      }
      for (let i = this.ripples.length - 1; i >= 0; i--) {
        const r = this.ripples[i];
        r.age += dt; r.r += r.vr * dt; r.vr *= Math.pow(0.35, dt);
        if (r.age >= r.life) this.ripples.splice(i, 1);
      }

      // ---- element emitters ----
      const rateScale = this.q;
      Object.keys(this.tags).forEach((tag) => {
        if (tag === "thunder") {
          this.boltT -= dt;
          if (this.boltT <= 0) { this.lightning(); this.boltT = rand(2, 4.2) / this.tags.thunder; }
        }
        const fn = EMIT[tag];
        if (!fn) return;
        const per = (RATE[tag] || 4) * this.tags[tag] * rateScale * (tag === "thunder" ? 0.5 : 1);
        this.emitAcc[tag] = (this.emitAcc[tag] || 0) + per * dt;
        let guard = 0;
        while (this.emitAcc[tag] >= 1 && guard++ < 6) { this.emitAcc[tag] -= 1; fn(this); }
      });
      if (this.bolt) { this.bolt.age += dt; if (this.bolt.age > this.bolt.life) this.bolt = null; }

      // fire embers + steam
      if (this.opts.fire) {
        this.emberAcc = (this.emberAcc || 0) + dt * (3 + this.heat * 6) * this.q;
        while (this.emberAcc >= 1) {
          this.emberAcc -= 1;
          this.fx.spawn({ shape: "glow", color: pick(["#ff9a2b", "#ffcf4a", "#ff6a1f"]), x: CX + rand(-260, 260), y: rand(760, 830), vx: rand(-40, 40), vy: -rand(120, 300), g: -20, life: rand(1.2, 2.6), size: rand(4, 8), s1: 0.1, add: true, fade: "out",
            fn(p) { p.vx += Math.sin(p.age * 5 + p.seed) * 6; } });
        }
      }
      if (this.opts.steam) {
        this.puffAcc = (this.puffAcc || 0) + dt * (1.6 + this.boil * 3.2) * this.q;
        while (this.puffAcc >= 1) {
          this.puffAcc -= 1;
          const q = this.surfacePoint(0.8);
          this.puffs.push({ x: q.x, y: q.y - 20, vx: rand(-12, 12), vy: -rand(36, 78), size: rand(30, 52), age: 0, life: rand(2.2, 3.4), a: rand(0.14, 0.26) });
        }
        for (let i = this.puffs.length - 1; i >= 0; i--) {
          const p = this.puffs[i];
          p.age += dt; p.x += p.vx * dt + Math.sin(p.age * 1.7 + p.y * 0.01) * 6 * dt; p.y += p.vy * dt;
          if (p.age >= p.life) this.puffs.splice(i, 1);
        }
      }

      // title-screen showcase: ingredients leap out of the pot
      if (this.opts.showcase && typeof INGREDIENTS !== "undefined") {
        this.showT -= dt;
        if (this.showT <= 0) {
          this.showT = rand(1.1, 2.0);
          const ing = pick(INGREDIENTS);
          const dir = Math.random() < 0.5 ? -1 : 1;
          this.jumpers.push({ img: loadImg(ing.image), x: CX + dir * rand(20, 160), y: LIQ.cy - 10, vx: dir * rand(30, 160), vy: -rand(900, 1150), rot: rand(-0.6, 0.6), vr: rand(-4, 4), size: rand(92, 130), age: 0 });
          this.splash(CX + dir * 60, LIQ.cy, 0.6);
          this.kickV += 1;
        }
      }
      for (let i = this.jumpers.length - 1; i >= 0; i--) {
        const j = this.jumpers[i];
        j.vy += 1250 * dt; j.x += j.vx * dt; j.y += j.vy * dt; j.rot += j.vr * dt; j.age += dt;
        if (j.vy > 0 && j.y > LIQ.cy - 10) { this.splash(j.x, LIQ.cy, 0.7); this.jumpers.splice(i, 1); }
      }

      this.fx.update(dt);
    }

    itemTarget(it) {
      const th = it.th + this.orbit;
      const rx = LIQ.rx * 0.8, ry = LIQ.ry * 0.78;
      return {
        x: CX + Math.cos(th) * it.rho * rx,
        y: LIQ.cy + Math.sin(th) * it.rho * ry - it.size * 0.06 + Math.sin(it.bob) * 4
      };
    }

    // ----- drawing --------------------------------------------------------
    render() {
      const ctx = this.ctx, S = this.S, ox = this.ox, oy = this.oy;
      if (!this.layers) return;
      const t = this.time;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.drawImage(this.layers.ground, 0, 0);
      ctx.setTransform(S, 0, 0, S, ox, oy);
      if (this.opts.fire) this.drawFire(ctx, true);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      // the pot jiggles as one piece
      const jig = clamp(this.kick, -0.4, 0.4) * 0.05;
      const jx = 1 + jig, jy = 1 - jig;
      const pivotX = ox + CX * S, pivotY = oy + 720 * S;
      const jiggle = () => ctx.setTransform(jx, 0, 0, jy, pivotX * (1 - jx), pivotY * (1 - jy));
      jiggle();
      ctx.drawImage(this.layers.base, 0, 0);
      jiggle();
      ctx.transform(S, 0, 0, S, ox, oy);
      // contents
      this.drawLiquid(ctx);
      this.drawTrail(ctx);
      this.drawItems(ctx);
      this.drawBubbles(ctx);
      this.drawSpoon(ctx);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      jiggle();
      ctx.drawImage(this.layers.rimFront, 0, 0);
      ctx.setTransform(S, 0, 0, S, ox, oy);
      this.drawPips(ctx);
      if (this.opts.fire) { this.drawFire(ctx, false); }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(this.layers.stones, 0, 0);
      ctx.setTransform(S, 0, 0, S, ox, oy);
      this.drawJumpers(ctx);
      this.fx.draw(ctx, S, ox, oy);
      this.drawSteam(ctx);
      this.drawAura(ctx);
      this.drawBolt(ctx);
      if (this.flash > 0.01 && !reduceMotion) {
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = `rgba(255,248,210,${this.flash * 0.35})`;
        ctx.fillRect(-ox / S, -oy / S, this.canvas.width / S, this.canvas.height / S);
        ctx.globalCompositeOperation = "source-over";
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    drawFire(ctx, back) {
      const t = this.time, heat = this.heat;
      if (back) {
        const f = 0.82 + 0.18 * Math.sin(t * 9) * Math.sin(t * 5.3);
        ctx.globalCompositeOperation = "lighter";
        const gr = ctx.createRadialGradient(CX, 800, 30, CX, 800, 520);
        gr.addColorStop(0, `rgba(255,150,40,${0.5 * f * heat})`); gr.addColorStop(0.5, `rgba(255,90,20,${0.2 * f * heat})`); gr.addColorStop(1, "rgba(255,90,20,0)");
        ctx.fillStyle = gr; ctx.fillRect(0, 380, W, 520);
        ctx.globalCompositeOperation = "source-over";
        const defs = [[-250, 140, 150, 0.4], [-170, 160, 190, 1.7], [-80, 150, 215, 2.9], [0, 170, 240, 4.1], [85, 150, 210, 5.3], [175, 160, 185, 0.9], [255, 140, 140, 2.3]];
        defs.forEach(([dx, w, h, ph]) => this.flame(ctx, CX + dx, 800, w, h * heat, ph, t, ["#d93a1b", "#ff6f22", "#ffb23a"]));
      } else {
        const defs = [[-300, 110, 140, 1.1], [-200, 100, 120, 3.1], [-60, 90, 100, 2.2], [70, 90, 110, 4.4], [205, 100, 125, 0.3], [305, 110, 145, 5.0]];
        defs.forEach(([dx, w, h, ph]) => this.flame(ctx, CX + dx, 842, w, h * heat, ph, t * 1.2, ["#ff5a1f", "#ff9d2e", "#ffe36a"]));
        // coal glow on the logs
        ctx.globalCompositeOperation = "lighter";
        const gl = 0.5 + 0.5 * Math.sin(t * 6);
        const cg = ctx.createRadialGradient(CX, 830, 10, CX, 830, 210);
        cg.addColorStop(0, `rgba(255,120,30,${0.45 + gl * 0.12})`); cg.addColorStop(1, "rgba(255,120,30,0)");
        ctx.fillStyle = cg; ctx.fillRect(CX - 220, 760, 440, 130);
        ctx.globalCompositeOperation = "source-over";
      }
    }
    flame(ctx, x, baseY, w, h, ph, t, cols) {
      const speed = 3.4;
      for (let layer = 0; layer < 3; layer++) {
        const sc = 1 - layer * 0.3;
        const k = 0.86 + 0.14 * Math.sin(t * speed + ph + layer) + 0.07 * Math.sin(t * speed * 2.3 + ph * 1.7);
        const hh = h * sc * k;
        const ww = w * sc;
        const sway = Math.sin(t * speed * 0.7 + ph) * ww * 0.2;
        ctx.fillStyle = cols[layer];
        ctx.beginPath();
        ctx.moveTo(x - ww / 2, baseY);
        ctx.bezierCurveTo(x - ww * 0.58, baseY - hh * 0.35, x - ww * 0.12 + sway, baseY - hh * 0.62, x + sway * 1.5, baseY - hh);
        ctx.bezierCurveTo(x + ww * 0.22 + sway, baseY - hh * 0.6, x + ww * 0.58, baseY - hh * 0.35, x + ww / 2, baseY);
        ctx.closePath();
        ctx.fill();
      }
    }

    drawLiquid(ctx) {
      const c = this.col, t = this.time;
      const light = lighten(c, 0.38), dark = darken(c, 0.5);
      ctx.save();
      ctx.beginPath(); ctx.ellipse(CX, LIQ.cy, LIQ.rx, LIQ.ry, 0, 0, TAU); ctx.clip();
      let gr = ctx.createRadialGradient(CX - 40, LIQ.cy - 14, 10, CX, LIQ.cy, LIQ.rx);
      gr.addColorStop(0, rgb(light)); gr.addColorStop(0.55, rgb(c)); gr.addColorStop(1, rgb(dark));
      ctx.fillStyle = gr; ctx.fillRect(CX - LIQ.rx, LIQ.cy - LIQ.ry, LIQ.rx * 2, LIQ.ry * 2);
      // swirl arms (drawn in circle space, squashed to the ellipse)
      ctx.translate(CX, LIQ.cy); ctx.scale(1, LIQ.ry / LIQ.rx);
      const arms = 3;
      for (let a = 0; a < arms; a++) {
        const base = this.swirl + a * TAU / arms;
        ctx.beginPath();
        for (let r = 24; r <= LIQ.rx; r += 14) {
          const ang = base + r * 0.011 * (this.stirDir || 1) * (1 + this.stirSpeed * 0.15);
          const x = Math.cos(ang) * r, y = Math.sin(ang) * r;
          if (r === 24) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = rgb(light, 0.22 + Math.min(0.3, this.stirSpeed * 0.04)); ctx.lineWidth = 22; ctx.lineCap = "round"; ctx.stroke();
        ctx.strokeStyle = rgb(dark, 0.16); ctx.lineWidth = 8; ctx.stroke();
      }
      // vortex dimple while stirring
      if (this.stirSpeed > 1.2) {
        const d = ctx.createRadialGradient(0, 0, 0, 0, 0, 120);
        d.addColorStop(0, rgb(dark, Math.min(0.5, this.stirSpeed * 0.05))); d.addColorStop(1, rgb(dark, 0));
        ctx.fillStyle = d; ctx.beginPath(); ctx.arc(0, 0, 120, 0, TAU); ctx.fill();
      }
      ctx.restore();
      // sparkly surface glints
      ctx.save();
      ctx.beginPath(); ctx.ellipse(CX, LIQ.cy, LIQ.rx, LIQ.ry, 0, 0, TAU); ctx.clip();
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < 5; i++) {
        const a = t * 0.35 + i * 1.26, rr = 0.35 + 0.4 * Math.abs(Math.sin(t * 0.21 + i * 2.1));
        const x = CX + Math.cos(a) * rr * LIQ.rx, y = LIQ.cy + Math.sin(a) * rr * LIQ.ry;
        ctx.fillStyle = rgb(light, 0.22);
        ctx.beginPath(); ctx.ellipse(x, y, 42, 7, -0.2, 0, TAU); ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
      // ripples
      ctx.lineWidth = 4;
      this.ripples.forEach((r) => {
        if (r.r <= 0) return;
        const a = r.a * (1 - r.age / r.life);
        ctx.strokeStyle = `rgba(255,255,255,${a})`;
        ctx.beginPath(); ctx.ellipse(r.x, r.y, r.r, r.r * 0.27, 0, 0, TAU); ctx.stroke();
      });
      // foam along the inner edge
      ctx.strokeStyle = rgb(lighten(c, 0.6), 0.42); ctx.lineWidth = 8;
      ctx.beginPath(); ctx.ellipse(CX, LIQ.cy, LIQ.rx - 3, LIQ.ry - 2, 0, 0, TAU); ctx.stroke();
      ctx.restore();
      // soft edge shadow where the wall meets the liquid
      ctx.strokeStyle = "rgba(8,2,18,.55)"; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.ellipse(CX, LIQ.cy, LIQ.rx + 1, LIQ.ry + 1, 0, 0, TAU); ctx.stroke();
    }

    drawTrail(ctx) {
      if (this.trail.length < 3) return;
      ctx.save();
      ctx.beginPath(); ctx.ellipse(CX, LIQ.cy, LIQ.rx, LIQ.ry, 0, 0, TAU); ctx.clip();
      ctx.lineCap = "round";
      const c = lighten(this.col, 0.6);
      for (let i = 1; i < this.trail.length; i++) {
        const a = this.trail[i], b = this.trail[i - 1];
        ctx.strokeStyle = rgb(c, Math.max(0, a.a) * 0.4);
        ctx.lineWidth = 3 + i * 0.7;
        ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(a.x, a.y); ctx.stroke();
      }
      ctx.restore();
    }

    drawItems(ctx) {
      const list = this.items.slice().sort((a, b) => a.y - b.y);
      const c = this.col, wet = darken(c, 0.35);
      list.forEach((it) => {
        if (!it.img.complete || !it.img.naturalWidth) return;
        const depth = clamp((it.y - (LIQ.cy - LIQ.ry)) / (LIQ.ry * 2), 0, 1);
        let size = it.size * (0.86 + depth * 0.3) * (1 + it.hl * 0.2);
        if (it.state === "drop") size *= 1.05;
        const px = 160;
        if (!it.tmp) { it.tmp = document.createElement("canvas"); it.tmp.width = it.tmp.height = px; }
        const g = it.tmp.getContext("2d");
        g.clearRect(0, 0, px, px);
        g.globalCompositeOperation = "source-over";
        g.drawImage(it.img, 0, 0, px, px);
        if (it.state === "float") {
          g.globalCompositeOperation = "source-atop";
          const gr = g.createLinearGradient(0, px * 0.5, 0, px * 0.98);
          gr.addColorStop(0, rgb(wet, 0)); gr.addColorStop(1, rgb(wet, 0.9));
          g.fillStyle = gr; g.fillRect(0, 0, px, px);
        }
        ctx.save();
        ctx.translate(it.x, it.y);
        const tilt = it.state === "float" ? Math.sin(it.bob * 0.8 + it.th) * 0.12 : (it.rotJ || 0);
        ctx.rotate(tilt);
        if (it.hl > 0.02) {
          ctx.globalCompositeOperation = "lighter";
          ctx.drawImage(glowSprite("#ffe27a"), -size * 0.95, -size * 0.95, size * 1.9, size * 1.9);
          ctx.globalCompositeOperation = "source-over";
        }
        // little contact shadow on the liquid
        if (it.state === "float") {
          ctx.fillStyle = "rgba(10,2,20,.28)";
          ctx.beginPath(); ctx.ellipse(0, size * 0.34, size * 0.4, size * 0.09, 0, 0, TAU); ctx.fill();
        }
        ctx.drawImage(it.tmp, -size / 2, -size / 2, size, size);
        if (this.opts.letters) {
          const s = size * 0.3;
          const lx = -size * 0.4, ly = -size * 0.42;
          ctx.rotate(-tilt);
          ctx.fillStyle = it.pick.letterColor || "#ff8a1f";
          ctx.strokeStyle = OUTLINE; ctx.lineWidth = 5;
          ctx.beginPath(); ctx.roundRect ? ctx.roundRect(lx - s * 0.5, ly - s * 0.5, s, s, s * 0.28) : ctx.rect(lx - s * 0.5, ly - s * 0.5, s, s);
          ctx.fill(); ctx.stroke();
          ctx.fillStyle = "#fff"; ctx.font = `800 ${s * 0.78}px "Baloo 2", "Nunito", sans-serif`;
          ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText(it.letter, lx, ly + s * 0.04);
        }
        ctx.restore();
      });
    }

    drawBubbles(ctx) {
      const c = this.col, light = lighten(c, 0.55), mid = lighten(c, 0.2);
      this.bubbles.forEach((b) => {
        const tt = b.age / b.life;
        const grow = Math.min(1, tt / 0.4);
        const r = b.size * (0.35 + 0.65 * grow) * (tt > 0.9 ? 1 + (tt - 0.9) * 3 : 1);
        const y = b.y - b.rise * grow;
        const gr = ctx.createRadialGradient(b.x - r * 0.35, y - r * 0.35, r * 0.05, b.x, y, r);
        gr.addColorStop(0, "rgba(255,255,255,.75)"); gr.addColorStop(0.35, rgb(light, 0.38)); gr.addColorStop(1, rgb(mid, 0.55));
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.arc(b.x, y, r, 0, TAU); ctx.fill();
        ctx.strokeStyle = `rgba(255,255,255,${0.55 * (1 - Math.max(0, tt - 0.85) * 6)})`; ctx.lineWidth = Math.max(1.5, r * 0.12);
        ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,.85)";
        ctx.beginPath(); ctx.ellipse(b.x - r * 0.38, y - r * 0.4, r * 0.2, r * 0.12, -0.7, 0, TAU); ctx.fill();
      });
    }

    drawSpoon(ctx) {
      const sp = this.spoon;
      if (sp.alpha < 0.02) return;
      ctx.save();
      ctx.globalAlpha = sp.alpha;
      const ang = -1.12, len = 640;
      const x = sp.x, y = sp.y;
      const ex = x + Math.cos(ang) * len, ey = y + Math.sin(ang) * len;
      ctx.lineCap = "round";
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 30; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.strokeStyle = "#b9743d"; ctx.lineWidth = 19; ctx.stroke();
      ctx.strokeStyle = "#e0a066"; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(x - 4, y - 4); ctx.lineTo(ex - 4, ey - 4); ctx.stroke();
      // paddle end, mostly under the surface
      ctx.fillStyle = "#a35f2d"; ctx.strokeStyle = OUTLINE; ctx.lineWidth = 8;
      ctx.beginPath(); ctx.ellipse(x, y + 4, 44, 19, -0.25, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = rgb(darken(this.col, 0.2), 0.5);
      ctx.beginPath(); ctx.ellipse(x, y + 8, 40, 14, -0.25, 0, TAU); ctx.fill();
      ctx.restore();
    }

    drawPips(ctx) {
      const cx = CX, cy = 548;
      const pos = [[0, -40], [40, 0], [0, 40], [-40, 0]];
      let any = 0;
      pos.forEach(([dx, dy], i) => {
        const col = this.pips[i] ? hex2rgb(this.pips[i]) : [70, 62, 100];
        const gl = this.pipGlow[i];
        any += gl;
        if (gl > 0.02) {
          ctx.globalCompositeOperation = "lighter";
          ctx.drawImage(glowSprite(this.pips[i] || "#ffffff"), cx + dx - 34 * gl, cy + dy - 34 * gl, 68 * gl, 68 * gl);
          ctx.globalCompositeOperation = "source-over";
        }
        ctx.fillStyle = rgb(mixc([40, 32, 66], col, gl));
        ctx.strokeStyle = OUTLINE; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(cx + dx, cy + dy, 14, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.fillStyle = `rgba(255,255,255,${0.15 + gl * 0.5})`;
        ctx.beginPath(); ctx.arc(cx + dx - 4, cy + dy - 4, 4, 0, TAU); ctx.fill();
      });
      // star glyph in the middle of the rune
      ctx.fillStyle = `rgba(255,226,122,${0.3 + Math.min(0.7, any * 0.2)})`;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 7 : 16; ctx[i ? "lineTo" : "moveTo"](cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
      ctx.closePath(); ctx.fill();
    }

    drawJumpers(ctx) {
      this.jumpers.forEach((j) => {
        if (!j.img.complete || !j.img.naturalWidth) return;
        ctx.save(); ctx.translate(j.x, j.y); ctx.rotate(j.rot);
        ctx.drawImage(j.img, -j.size / 2, -j.size / 2, j.size, j.size);
        ctx.restore();
      });
    }

    drawSteam(ctx) {
      if (!this.opts.steam) return;
      const col = rgb(lighten(this.col, 0.7));
      this.puffs.forEach((p) => {
        const tt = p.age / p.life;
        const a = p.a * Math.min(1, tt * 4) * (1 - tt);
        ctx.globalAlpha = a;
        const s = p.size * (1 + tt * 1.8);
        ctx.drawImage(softSprite("#ffffff"), p.x - s, p.y - s, s * 2, s * 2);
      });
      ctx.globalAlpha = 1;
      void col;
    }

    drawAura(ctx) {
      const g = this.glow;
      const n = this.picks.length;
      const a = Math.min(0.55, g * 0.5 + n * 0.035);
      if (a < 0.02) return;
      ctx.globalCompositeOperation = "lighter";
      const c = lighten(this.col, 0.2);
      const gr = ctx.createRadialGradient(CX, 250, 20, CX, 250, 460);
      gr.addColorStop(0, rgb(c, a)); gr.addColorStop(1, rgb(c, 0));
      ctx.fillStyle = gr; ctx.fillRect(0, -100, W, 700);
      ctx.globalCompositeOperation = "source-over";
    }

    drawBolt(ctx) {
      if (!this.bolt) return;
      const b = this.bolt, a = 1 - b.age / b.life;
      ctx.globalCompositeOperation = "lighter";
      ctx.lineJoin = "round"; ctx.lineCap = "round";
      [[22, 0.18], [10, 0.5], [4, 1]].forEach(([w, al]) => {
        ctx.strokeStyle = `rgba(255,${w > 8 ? 230 : 255},${w > 8 ? 120 : 220},${al * a})`;
        ctx.lineWidth = w;
        ctx.beginPath();
        b.pts.forEach(([x, y], i) => ctx[i ? "lineTo" : "moveTo"](x, y));
        ctx.stroke();
      });
      ctx.globalCompositeOperation = "source-over";
    }

    snapshot() {
      const c = document.createElement("canvas");
      c.width = this.canvas.width; c.height = this.canvas.height;
      c.getContext("2d").drawImage(this.canvas, 0, 0);
      return c;
    }
  }

  // A tiny standalone effects canvas (used behind the potion bottle).
  class FxCanvas {
    constructor(canvas) {
      this.canvas = canvas; this.ctx = canvas.getContext("2d");
      this.fx = new Particles(180);
      this.running = false;
      this.S = 1; this.ox = 0; this.oy = 0;
      this.resize();
      this._r = () => this.resize();
      global.addEventListener("resize", this._r);
    }
    resize() {
      const r = this.canvas.getBoundingClientRect();
      const dpr = Math.min(global.devicePixelRatio || 1, 2);
      this.canvas.width = Math.max(2, Math.round(r.width * dpr));
      this.canvas.height = Math.max(2, Math.round(r.height * dpr));
      this.S = dpr; this.w = r.width; this.h = r.height;
    }
    start() {
      if (this.running) return;
      this.running = true; this.last = performance.now();
      const loop = (now) => {
        if (!this.running) return;
        this.raf = requestAnimationFrame(loop);
        const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
        this.fx.update(dt);
        const c = this.ctx;
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.clearRect(0, 0, this.canvas.width, this.canvas.height);
        c.setTransform(this.S, 0, 0, this.S, 0, 0);
        this.fx.draw(c, this.S, 0, 0);
      };
      this.raf = requestAnimationFrame(loop);
    }
    stop() { this.running = false; cancelAnimationFrame(this.raf); }
    destroy() { this.stop(); global.removeEventListener("resize", this._r); }
    spawn(o) { return this.fx.spawn(o); }
  }

  global.Cauldron = Cauldron;
  global.FxCanvas = FxCanvas;
  global.CauldronGeometry = { W, H, CX, RIM, INNER, LIQ };
  global.TAG_COLORS = TAGCOL;
})(window);
