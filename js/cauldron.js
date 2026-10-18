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
  // ---- one shared world ------------------------------------------------------
  // The hut backdrop, hearth, pot, witch and cat all live in this one coordinate system and stand
  // on one floor, so they always share a scale; each screen only moves the camera.
  const K = 0.62;                                  // pot scale (896px source sprite -> world)
  const HK = K / 0.78;                             // the hearth art was laid out for a 0.78 pot...
  const HEARTH_REF = 760;                          // ...whose feet stood at y=760
  const HEARTH_FEET = 800;                         // where the hearth art is anchored
  const FEET_Y = 834;                              // the pot sits down inside the ring: its front feet tuck behind the front stones
  const PY = FEET_Y - 816 * K;                     // top of the pot sprite
  const px2x = (sx) => CX + (sx - 450) * K, px2y = (sy) => PY + sy * K;
  const POT = { x: CX - 450 * K, y: PY, w: 896 * K, h: 823 * K };
  const RIM = { cy: px2y(133), rx: 330 * K, ry: 82 * K };
  const INNER = { cy: px2y(133), rx: 285 * K, ry: 71 * K };   // the opening
  const LIQ = { cy: px2y(150), rx: 262 * K, ry: 54 * K };     // liquid surface
  const EMBLEM = { x: px2x(298), y: px2y(490) };
  const DY = RIM.cy - 268;                         // element effects were authored for a rim at y=268
  const FLOOR_Y = 860;                             // the floor line the witch and cat stand on
  const HEARTH_Y = 840;                            // centre of the stone ring
  // The hut was painted around this very cast (rendered at its in-game size), so its door, window,
  // shelves and rug are built to the characters' scale. It occupies this fixed world rectangle on
  // every screen; the camera is kept inside it (see updateCamTarget).
  const BG = { x: -1286.6, y: -793.2, w: 3574.8, h: 1995.2 };
  // things painted in the hut (hut.webp pixels, 2752x1536) that should feel alive
  const HX = (px) => BG.x + px * BG.w / 2752, HY = (py) => BG.y + py * BG.h / 1536;
  const SHELF_GLOWS = [   // potions on the shelves softly pulse with their own colour
    [330, 330, "#3fe0c0", 95], [500, 380, "#ff5fb8", 70], [330, 640, "#ffa040", 80], [500, 640, "#5fe08a", 60], [610, 650, "#c070ff", 50],
    [300, 905, "#3fe0c0", 100], [440, 870, "#ff5fb8", 75], [590, 860, "#ff7fc0", 65], [670, 850, "#ffa040", 55],
    [1255, 275, "#ff5fb8", 55], [1560, 525, "#ff5050", 45], [1725, 520, "#ffa040", 55], [1515, 790, "#ff4a4a", 45], [1640, 520, "#ff6fb0", 40],
    [1975, 1050, "#d070ff", 75], [1545, 1000, "#ffb040", 50]
  ].map(([px, py, c, r], i) => ({ x: HX(px), y: HY(py), c, r: r * 1.3, ph: i * 1.7, sp: 0.5 + (i % 5) * 0.17 }));
  const WIN = { x0: HX(2165), y0: HY(395), x1: HX(2510), y1: HY(905) };     // the moonlit window
  const BEAM = [[HX(2175), HY(420)], [HX(2500), HY(450)], [HX(2380), HY(1480)], [HX(1480), HY(1420)]];
  // the witch stands on the floor left of the hearth and stirs with her wand (ww_*.webp: 820x1156)
  const WITCH = { h: 720, feetX: 6, feetFx: 0.40, feetFy: 0.955, tipFx: 0.898, tipFy: 0.249 };
  WITCH.w = WITCH.h * 820 / 1156; WITCH.x = WITCH.feetX - WITCH.feetFx * WITCH.w;
  WITCH.y = FLOOR_Y - WITCH.feetFy * WITCH.h; WITCH.feetY = FLOOR_Y;
  // the cat (ct_*.webp: 624x604, tail is its own layer so it can swish)
  const CAT = { h: 380, feetY: FLOOR_Y + 6, x: 836, bodyFx: 0.56, tailFx: 0.24, tailFy: 0.87 };
  CAT.w = CAT.h * 624 / 604; CAT.y = CAT.feetY - CAT.h;
  const TIPS = { cheer: [0.847, 0.084] };            // wand star per witch pose (default: WITCH.tipFx/Fy)
  const VIEW = { cx: 515, cy: 540, w: 1640, h: 960 };    // the framed scene
  const ART = "assets/art/";
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
  const SPR = {};
  ["hut", "pot", "logs", "stones", "stones_front", "ladle", "ww_idle", "ww_wow", "ww_laugh", "ww_blink", "ww_cheer", "ww_wavebase", "ww_hand", "ww_cap", "ww_tap", "ww_focus", "ww_yuck", "ww_blast", "ct_blast", "ct_idle", "ct_wow", "ct_blink", "ct_yawn", "ct_look", "ct_paw", "ct_tail", "flame0", "flame1", "flame2", "flame3", "flame4"].forEach((n) => { SPR[n] = loadImg(ART + n + ".webp"); });
  const sprReady = () => Object.keys(SPR).every((k) => SPR[k].complete && SPR[k].naturalWidth);
  const sprWait = (cb) => {
    if (sprReady()) return cb();
    let n = 0;
    Object.keys(SPR).forEach((k) => { if (!SPR[k].complete) { n++; SPR[k].addEventListener("load", () => { if (--n === 0) cb(); }); SPR[k].addEventListener("error", () => { if (--n === 0) cb(); }); } });
    if (!n) cb();
  };
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

  // pre-rendered soft radial lights (so big glows are one drawImage, not a fresh gradient + big fill each frame)
  const RAD = {};
  function radSprite(key, stops) {
    if (RAD[key]) return RAD[key];
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d");
    const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    stops.forEach(([o, col]) => gr.addColorStop(o, col));
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    return (RAD[key] = c);
  }
  const FLOOR_GLOW = () => radSprite("floor", [[0.05, "rgba(255,140,50,.34)"], [0.5, "rgba(255,90,30,.12)"], [1, "rgba(255,80,20,0)"]]);
  const FIRE_BACK = () => radSprite("fireb", [[0.07, "rgba(255,150,40,.5)"], [0.5, "rgba(255,90,20,.2)"], [1, "rgba(255,90,20,0)"]]);
  const FIRE_FRONT = () => radSprite("firef", [[0.04, "rgba(255,120,30,1)"], [1, "rgba(255,120,30,0)"]]);
  const AURA = () => radSprite("aura", [[0.05, "rgba(255,255,255,1)"], [1, "rgba(255,255,255,0)"]]);
  const ROOM_GLOW = () => radSprite("room", [[0, "rgba(255,150,70,.26)"], [0.45, "rgba(255,110,45,.10)"], [1, "rgba(255,90,30,0)"]]);
  const MOTE = () => radSprite("mote", [[0, "rgba(255,240,210,1)"], [0.35, "rgba(255,230,190,.5)"], [1, "rgba(255,220,170,0)"]]);

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
      pot.fx.spawn({ shape: "snow", color: "#e8fbff", x: rand(CX - 310 * HK, CX + 310 * HK), y: rand(60, 230) + DY, vx: rand(-20, 20), vy: rand(36, 80), life: rand(2.2, 3.4), size: rand(6, 12), vr: rand(-2, 2), fade: "inout", add: true });
    },
    earth(pot) {
      const q = pot.surfacePoint(0.7);
      pot.fx.spawn({ shape: "rock", color: pick(["#8a5a2b", "#a8733a", "#6b4423", "#c08a50"]), x: q.x, y: q.y, vx: rand(-90, 90), vy: -rand(260, 420), g: 1150, life: 1.1, size: rand(6, 11), vr: rand(-8, 8), fade: "inout" });
    },
    wind(pot) {
      pot.fx.spawn({
        shape: "streak", color: "#dafff4", add: true, size: rand(5, 8), life: rand(1.6, 2.4), fade: "inout",
        ang: rand(0, TAU), rad: rand(250, 370) * HK, h: rand(120, 230) + DY, x: CX, y: 200 + DY,
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
        pot.fx.spawn({ shape: "bat", color: "#190a2b", x: CX + dir * 140 * HK, y: 230 + DY, vx: dir * rand(70, 150), vy: -rand(100, 190), life: 2.6, size: rand(15, 24), fade: "inout", seed: rand(0, 6) });
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
      pot.fx.spawn({ shape: "ring", color: "#ff7be8", x: CX, y: 235 + DY, vx: 0, vy: -20, life: 1.5, size: 40, s1: 6, add: true, lw: 5, alpha: 0.8, fade: "out" });
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
      pot.fx.spawn({ shape: "streak", color: "#8ff7ec", x: CX - 380 * HK, y, vx: rand(1100, 1700), life: 0.55, size: rand(5, 9), add: true, fade: "inout" });
    },
    strong(pot) {
      const q = pot.surfacePoint(0.7);
      pot.fx.spawn({ shape: "star4", color: pick(["#ff5a4a", "#ffb199", "#ff8a3a"]), x: q.x, y: q.y - 4, vx: rand(-200, 200), vy: -rand(200, 420), g: 800, life: rand(0.5, 0.9), size: rand(8, 15), vr: rand(-8, 8), add: true });
      if (Math.random() < 0.4) pot.fx.spawn({ shape: "ring", color: "#ff5a4a", x: q.x, y: q.y, size: 12, s1: 7, life: 0.7, add: true, lw: 5, alpha: 0.7 });
    },
    shield(pot) {
      pot.fx.spawn({ shape: "ring", color: "#bcd3ff", x: CX, y: 270 + DY, size: 120, s1: 2.1, life: 1.6, lw: 5, add: true, alpha: 0.5, fade: "out" });
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

  // soft contact shadow, pre-rendered once
  const SHADOW = (function () {
    const c = document.createElement("canvas"); c.width = 256; c.height = 64;
    const g = c.getContext("2d");
    g.scale(1, 0.25);
    const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, "rgba(6,2,14,1)"); gr.addColorStop(0.55, "rgba(6,2,14,.62)"); gr.addColorStop(1, "rgba(6,2,14,0)");
    g.fillStyle = gr; g.beginPath(); g.arc(128, 128, 128, 0, TAU); g.fill();
    return c;
  })();
  function shadow(g, x, y, rx, ry, a) { g.globalAlpha = a; g.drawImage(SHADOW, x - rx, y - ry, rx * 2, ry * 2); g.globalAlpha = 1; }

  // ===================================================================
  class Cauldron {
    constructor(canvas, options) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      const o = this.opts = Object.assign({
        fit: "center", fire: true, steam: true, pointer: true, spoon: true, letters: false,
        quality: 1, showcase: false, idleStir: false, maxItems: 3, bubbleRate: 1, actors: true
      }, options || {});
      this.fx = new Particles(190);
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
      this.spoon = { x: CX + 120, y: LIQ.cy + 10, tx: CX + 120, ty: LIQ.cy + 10, vx: 0, vy: 0, alpha: 0, want: false };
      this.trail = [];
      this.pointer = { x: 0, y: 0, inside: false, down: false, id: null };
      this.act = { witch: { pose: "idle", until: 0, blinkT: 2.2 }, cat: { pose: "idle", until: 0, blinkT: 3.6 } };
      this.lit = {}; this.breath = 1; this.hintA = 0; this.showHint = false; this.captureAll = false; this.keepT = 0;
      this.bPtr = 0; this.bAuto = 0; this.sway = 0; this.swayX = 0; this.insets = { l: 0, t: 0, r: 0, b: 0 };
      this.auto = { on: false, t: 0, speed: 3.4 };
      this.idleT = 0;
      this.tags = {};           // active power weights
      this.emitAcc = {};
      this.boltT = 2; this.bolt = null;
      this.pips = [null, null, null];
      this.pipGlow = [0, 0, 0];
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

    // ----- layout & camera ----------------------------------------------
    // The canvas is the whole screen; the camera frames the shared world inside the
    // part of it that isn't covered by UI (insets, in CSS px) and glides between framings.
    setView(ins, snap) {
      this.insets = Object.assign({ l: 0, t: 0, r: 0, b: 0 }, ins || {});
      if (snap) this._snap = true;
      this.updateCamTarget();
    }
    updateCamTarget() {
      const c = this.canvas, w = c.width, h = c.height;
      const d = w / Math.max(1, c.offsetWidth);
      const I = this.insets || (this.insets = { l: 0, t: 0, r: 0, b: 0 });
      const l = I.l * d, t = I.t * d, aw = Math.max(40, w - l - I.r * d), ah = Math.max(40, h - t - I.b * d);
      const portrait = aw / ah < 0.85, tallScreen = w / h < 1;
      const vw = portrait ? 1560 : VIEW.w;
      const S = Math.min(aw / vw, ah / VIEW.h);
      let s = S, ox = l + aw / 2 - VIEW.cx * S, oy = t + ah / 2 - VIEW.cy * S;
      // keep the camera inside the painted room: zoom in a little if the view would be bigger
      // than the room, then slide it so no edge of the room ever shows
      const sMin = Math.max((w - l - I.r * d) / BG.w, (h - I.b * d) / BG.h);
      if (s < sMin) {
        const s2 = Math.min(sMin, s * (tallScreen ? 1 : 1.5));
        ox = (ox - (l + aw / 2)) * s2 / s + (l + aw / 2); oy = (oy - (t + ah / 2)) * s2 / s + (t + ah / 2); s = s2;
      }
      // the room must cover what is visible; behind the side/bottom panels it may end
      const fit = (o, p0, p1, b0, blen) => {
        const lo = p1 - (b0 + blen) * s, hi = p0 - b0 * s;   // o in [lo, hi] keeps the room covering [p0, p1]
        return lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, o));
      };
      ox = fit(ox, l, w - I.r * d, BG.x, BG.w); oy = fit(oy, 0, h - I.b * d, BG.y, BG.h);
      this.camT = { S: s, ox, oy };
    }
    stepCam(dt) {
      if (!this.camT) this.updateCamTarget();
      const T = this.camT;
      if (!this.cam || this._snap) { this.cam = Object.assign({}, T); this._snap = false; }
      else {
        const k = 1 - Math.exp(-dt * 4.2), C = this.cam;
        C.S += (T.S - C.S) * k; C.ox += (T.ox - C.ox) * k; C.oy += (T.oy - C.oy) * k;
      }
      this.S = this.cam.S; this.ox = this.cam.ox; this.oy = this.cam.oy;
    }
    resize() {
      const c = this.canvas;
      const cw = Math.max(2, c.offsetWidth), ch = Math.max(2, c.offsetHeight);
      const dpr = Math.min(global.devicePixelRatio || 1, 2);
      const w = Math.round(cw * dpr), h = Math.round(ch * dpr);
      if (c.width === w && c.height === h && this.cam) return;
      c.width = w; c.height = h;
      this._snap = true;
      this.updateCamTarget();
      this.stepCam(0);
      try { this.render(); } catch (e) { /* first frame only */ }   // never leave a cleared canvas for a frame
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
    // Stirring only happens while the pointer is pressed (mouse drag or touch). The drag is
    // relative, so circling anywhere on the screen stirs the pot smoothly; a quick tap instead
    // pokes an ingredient, the witch or the cat.
    bindPointer() {
      const c = this.canvas;
      c.style.touchAction = "none";
      const move = (e) => {
        const p = this.toDesign(e.clientX, e.clientY);
        const pt = this.pointer;
        if (pt.down && this.drag) {
          const g = 1.15, yk = (LIQ.ry / LIQ.rx) * 1.7;
          let x = this.drag.x + (p.x - pt.x) * g, y = this.drag.y + (p.y - pt.y) * g * yk;
          const u = (x - CX) / (LIQ.rx * 0.9), v = (y - LIQ.cy) / (LIQ.ry * 0.9), d = Math.hypot(u, v);
          if (d > 1) { x = CX + u / d * LIQ.rx * 0.9; y = LIQ.cy + v / d * LIQ.ry * 0.9; }
          this.drag.x = x; this.drag.y = y;
          this.drag.moved += Math.hypot(e.movementX || 0, e.movementY || 0);
        } else if (!pt.down) {
          c.style.cursor = this.hitActor(p) || this.hitItem(p) >= 0 ? "pointer" : (this.opts.spoon ? "grab" : "default");
        }
        pt.x = p.x; pt.y = p.y;
        pt.type = e.pointerType;
      };
      c.addEventListener("pointermove", move);
      c.addEventListener("pointerdown", (e) => {
        if (e.button !== undefined && e.button > 0) return;
        const p = this.toDesign(e.clientX, e.clientY);
        this.pointer.x = p.x; this.pointer.y = p.y; this.pointer.type = e.pointerType;
        this.pointer.down = true; this.pointer.id = e.pointerId;
        const sp = this.spoon;
        this.drag = { x: sp.ax !== undefined ? sp.ax : sp.x, y: sp.ay !== undefined ? sp.ay : sp.y, moved: 0 };
        this._down = { x: e.clientX, y: e.clientY, t: performance.now() };
        if (this.opts.spoon) c.style.cursor = "grabbing";
        try { c.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        if (this.onPointerDown) this.onPointerDown(this.pointer);
      });
      const up = (e) => {
        if (!this.pointer.down) return;
        this.pointer.down = false;
        this.drag = null;
        if (this.opts.spoon) c.style.cursor = "grab";
        const d = this._down;
        if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 10 && performance.now() - d.t < 450) {
          const p = this.toDesign(e.clientX, e.clientY);
          const who = this.hitActor(p);
          if (who) { this.poke(who); if (this.onActor) this.onActor(who); return; }
          if (this.onTap) this.onTap(p, this.hitItem(p));
        }
      };
      c.addEventListener("pointerup", up);
      c.addEventListener("pointercancel", up);
    }
    hitActor(p) {
      if (!this.opts.actors) return null;
      const cx0 = CAT.x + CAT.w * 0.2, cx1 = CAT.x + CAT.w * 0.95;
      if (p.x > cx0 && p.x < cx1 && p.y > CAT.y + CAT.h * 0.05 && p.y < CAT.feetY) return "cat";
      const wx0 = WITCH.x + WITCH.w * 0.12, wx1 = WITCH.x + WITCH.w * 0.72;
      if (p.x > wx0 && p.x < wx1 && p.y > WITCH.y + WITCH.h * 0.02 && p.y < FLOOR_Y) return "witch";
      return null;
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
      if (slot < 3) { this.pips[slot] = pk.ingredient.color; this.pipGlow[slot] = 0; }
      // now and then she pulls a "yuck!" face at what just went in
      const w = this.act.witch;
      if (this.opts.actors && w.pose === "idle" && Math.random() < 0.4) { w.pose = "yuck"; w.until = this.time + 1.5; this.hop("witch", 0.5); }
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
      this.picks.forEach((p, i) => { if (i < 3) { this.pips[i] = p.ingredient.color; this.pipGlow[i] = 1; } });
      this.relayout();
      this.recompute(false);
    }
    makeItem(pk, index, drop, from) {
      const img = loadImg(pk.ingredient.image);
      const it = {
        pick: pk, img, th: 0, rho: 0.5, x: CX, y: LIQ.cy, size: 104 * HK, bob: rand(0, TAU), tilt: 0,
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
    // the potion blows up: flash, shockwave, fire, smoke and falling ash; the witch and cat get blasted
    explode() {
      const T = this.time, cx = CX, cy = LIQ.cy - 20;
      this.blastT = T; this.shake = 1; this.ashT = 3.2; this.flash = 1.2;
      this.opts.spoon = false; this.spoon.alpha = 0; this.drag = null; this.auto.on = false;
      this.colT = [58, 52, 66];                       // the soup turns to sooty sludge
      this.kickV += 9;
      for (let i = 0; i < 3; i++) this.splash(cx + rand(-120, 120), LIQ.cy, 1.5);
      this.fx.spawn({ shape: "ring", color: "#fff2c0", x: cx, y: cy, size: 30, s1: 26, life: 0.55, add: true, fade: "out", lw: 18 });
      this.fx.spawn({ shape: "glow", color: "#ffd24a", x: cx, y: cy, size: 160, s1: 3.2, life: 0.5, add: true, fade: "out" });
      for (let i = 0; i < 34; i++) {
        const a = rand(-Math.PI * 0.95, -Math.PI * 0.05), v = rand(300, 1000);
        this.fx.spawn({ shape: "glow", color: pick(["#ffb02b", "#ff6a1f", "#ffe27a", "#ff4a1f"]), x: cx + rand(-60, 60), y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 700, drag: 1.2, life: rand(0.7, 1.4), size: rand(14, 30), s1: 0.2, add: true, fade: "out" });
      }
      for (let i = 0; i < 16; i++) {
        const a = rand(-Math.PI * 0.95, -Math.PI * 0.05), v = rand(120, 520);
        this.fx.spawn({ shape: "soft", color: pick(["#2a2430", "#3a3340", "#1c1722"]), x: cx + rand(-100, 100), y: cy + rand(-20, 30), vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 1.4, life: rand(1.6, 2.8), size: rand(50, 90), s1: 2.2, alpha: 0.75, fade: "inout" });
      }
      for (let i = 0; i < 26; i++) {
        const a = rand(0, TAU), v = rand(200, 800);
        this.fx.spawn({ shape: "star4", color: pick(["#fff7a0", "#ffffff", "#ff9a2b"]), x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 200, g: 500, drag: 0.8, life: rand(0.5, 1.1), size: rand(8, 18), vr: rand(-10, 10), add: true, fade: "out" });
      }
      const w = this.act.witch, c = this.act.cat;
      w.pose = "blast"; c.pose = "blast"; w.until = c.until = T + 60;
      this.hop("witch", 1.6); this.hop("cat", 1.8);
    }
    unblast() {
      this.blastT = undefined; this.shake = 0; this.ashT = 0; this.opts.spoon = true;
      const w = this.act.witch, c = this.act.cat; w.pose = c.pose = "idle"; w.until = c.until = 0;
    }
    burp() {
      this.spawnBubble(true);
      this.spawnBubble(true);
      this.kickV += 1.2;
    }
    spawnBubble(big) {
      const a = Math.random() * TAU, rr = Math.sqrt(Math.random()) * 0.82;
      const size = (big ? rand(26, 44) : rand(5, 17)) * HK;
      this.bubbles.push({
        x: CX + Math.cos(a) * rr * LIQ.rx * 0.92, y: LIQ.cy + Math.sin(a) * rr * LIQ.ry * 0.92,
        size, life: big ? rand(1.4, 2.1) : rand(0.9, 1.7), age: 0, rise: size * (big ? 1.0 : 0.5), tint: Math.random()
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
      if (this.opts.actors) {
        const c = this.act.cat, w = this.act.witch;
        if (c.pose === "idle") { c.pose = "wow"; c.until = this.time + 0.9; this.hop("cat", 0.5); }
        c.lv = (c.lv || 0) + 160; w.lv = (w.lv || 0) - 110;
      }
      const pts = [];
      let x = CX + rand(-200, 200) * HK, y = RIM.cy - 460;
      const tx = CX + rand(-120, 120), ty = LIQ.cy - 6;
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
          // slow machine: thin out the particles, never the picture
          this.q = Math.max(0.55, this.q * 0.8);
          this.fx.max = Math.max(60, Math.round(this.fx.max * 0.7));
        }
        p.n = 0; p.sum = 0;
      }
    }

    step(dt) {
      this.time += dt;
      const t = this.time;
      this.stepCam(dt);
      // colour glides toward the mix of the ingredients
      const k = 1 - Math.pow(0.0004, dt);
      for (let i = 0; i < 3; i++) this.col[i] += (this.colT[i] - this.col[i]) * Math.min(1, dt * 2.4);
      // pot jiggle (damped spring)
      this.kickV += (-this.kick * 90 - this.kickV * 7) * dt;
      this.kick += this.kickV * dt;
      this.flash = Math.max(0, this.flash - dt * 1.6);
      for (let i = 0; i < 3; i++) {
        if (this.pips[i]) this.pipGlow[i] = Math.min(1, this.pipGlow[i] + dt * 1.8);
        else this.pipGlow[i] = Math.max(0, this.pipGlow[i] - dt * 2.5);
      }

      // ---- ladle & stirring ----
      // The ladle's bowl chases a target on a critically-damped spring, so it can never
      // snap: pointer, auto-stir and the witch's idle circling are blended, never switched.
      const sp = this.spoon, pt = this.pointer;
      const usingPointer = this.opts.spoon && pt.down && !!this.drag;
      if (usingPointer) this.idleT = 0; else this.idleT += dt;
      const actors = this.opts.actors;
      this.keepT += dt * (this.idleT > 1.2 ? 1.5 : 0.6);
      if (this.auto.on) this.auto.t += dt * this.auto.speed;
      let idleOn = actors;
      if (!actors && this.opts.idleStir && this.idleT > 2.5 && ((this.idleT - 2.5) % 9) < 4.2) { this.auto.t += dt * 2.4; idleOn = true; }
      const kb = (a, b) => a + (b - a) * (1 - Math.exp(-dt * 7));
      this.bPtr = kb(this.bPtr, usingPointer ? 1 : 0);
      this.bAuto = kb(this.bAuto, this.auto.on ? 1 : 0);
      const orb = (a, r) => [CX + Math.cos(a) * LIQ.rx * r, LIQ.cy + Math.sin(a) * LIQ.ry * r];
      let [tx, ty] = orb(this.keepT, 0.42);
      if (this.auto.on || this.bAuto > 0.01) { const [ax, ay] = orb(this.auto.t, 0.52); tx = lerp(tx, ax, this.bAuto); ty = lerp(ty, ay, this.bAuto); }
      if (usingPointer) { this._ptx = this.drag.x; this._pty = this.drag.y; }
      if ((usingPointer || this.bPtr > 0.01) && this._ptx !== undefined) {
        tx = lerp(tx, this._ptx, this.bPtr); ty = lerp(ty, this._pty, this.bPtr);
      }
      // when the player lets go, the witch's circling picks up from where the spoon is
      if (!usingPointer && this._wasPtr) {
        this.keepT = Math.atan2((sp.y - LIQ.cy) / LIQ.ry, (sp.x - CX) / LIQ.rx);
      }
      this._wasPtr = usingPointer;
      const want = actors || usingPointer || this.auto.on || idleOn;
      const counts = usingPointer || this.auto.on || (!actors && idleOn);
      // the aim point can only travel so fast, so even a mouse that teleports can't make the ladle snap
      if (sp.ax === undefined) { sp.ax = sp.x; sp.ay = sp.y; }
      {
        const ddx = tx - sp.ax, ddy = ty - sp.ay, dd = Math.hypot(ddx, ddy), mv = Math.min(dd, 900 * dt);
        if (dd > 1e-3) { sp.ax += ddx / dd * mv; sp.ay += ddy / dd * mv; }
        tx = sp.ax; ty = sp.ay;
      }
      sp.want = want; sp.tx = tx; sp.ty = ty;
      {
        const kS = 260, cS = 2 * Math.sqrt(kS) * 0.95;
        let rem = Math.min(dt, 0.05);
        while (rem > 1e-5) {
          const h = Math.min(rem, 1 / 120); rem -= h;
          sp.vx += ((tx - sp.x) * kS - sp.vx * cS) * h; sp.vy += ((ty - sp.y) * kS - sp.vy * cS) * h;
          sp.x += sp.vx * h; sp.y += sp.vy * h;
        }
        const eu = (sp.x - CX) / (LIQ.rx * 0.95), ev = (sp.y - LIQ.cy) / (LIQ.ry * 0.95), ed = Math.hypot(eu, ev);
        if (ed > 1) { sp.x = CX + eu / ed * LIQ.rx * 0.95; sp.y = LIQ.cy + ev / ed * LIQ.ry * 0.95; }
      }
      sp.alpha = actors ? 1 : clamp(sp.alpha + (want ? dt * 6 : -dt * 4), 0, 1);
      // the ladle handle leans outward and trails the motion; the witch leans with it (feet planted)
      const nx = clamp((sp.x - CX) / LIQ.rx, -1, 1);
      const laT = nx * 0.4 - clamp(sp.vx, -700, 700) * 0.00055 + Math.sin(t * 1.7) * 0.02;
      this.ladleA = (this.ladleA === undefined ? laT : this.ladleA + (laT - this.ladleA) * (1 - Math.exp(-dt * 9)));
      const swT = nx * 0.014 + clamp(sp.vx, -500, 500) * 0.00002 + Math.sin(t * 1.3) * 0.004;
      this.sway += (swT - this.sway) * (1 - Math.exp(-dt * 5));
      this.swayX = 0;
      // angular speed of the spoon around the pot centre
      const uu = (sp.x - CX) / LIQ.rx, vv = (sp.y - LIQ.cy) / LIQ.ry;
      const rad = Math.hypot(uu, vv);
      const ang = Math.atan2(vv, uu);
      let w = 0;
      if (want && rad > 0.26 && this._lastA !== null) {
        const d = wrap(ang - this._lastA);
        w = d / Math.max(dt, 1e-3);
        const add = Math.min(Math.abs(d), 0.5);
        if (counts) this.stirTotal += add;
        if (Math.abs(w) > 0.4) this.stirDir = Math.sign(w);
      }
      this._lastA = want ? ang : null;
      const wTarget = clamp(Math.abs(w), 0, 14);
      this.stirSpeed += (wTarget - this.stirSpeed) * Math.min(1, dt * 5);
      if (!want) this.stirSpeed *= Math.pow(0.35, dt);
      if (actors) {
        const mT = clamp(0.45 + this.stirSpeed * 0.16 + this.bPtr * 0.35 + this.bAuto * 0.35, 0, 1);
        this.magicA = (this.magicA || 0) + (mT - (this.magicA || 0)) * (1 - Math.exp(-dt * 4));
        this.sparkAcc = (this.sparkAcc || 0) + dt * (4 + this.magicA * 24) * this.q;
        const self = this;
        while (this.sparkAcc >= 1) {
          this.sparkAcc -= 1;
          const ox = rand(-9, 9), oy = rand(-9, 9), sp0 = rand(0.9, 1.6);
          const q0 = this.magicPoint(0);
          this.fx.spawn({ shape: pick(["star4", "glow", "glow"]), color: pick(["#ffe27a", "#c58bff", "#ffffff", "#ff9bf1"]), x: q0.x, y: q0.y, life: 1 / sp0, size: rand(4, 9), vr: rand(-4, 4), add: true, fade: "inout", u: 0,
            fn(pp, d) { pp.u += d * sp0; const q = self.magicPoint(Math.min(1, pp.u)); pp.x = q.x + ox * Math.sin(pp.u * Math.PI); pp.y = q.y + oy * Math.sin(pp.u * Math.PI); } });
        }
      }
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
      const rate = (1.1 + this.boil * 3.4) * this.opts.bubbleRate * (1 + this.stirSpeed * 0.35) * this.q;
      if (Math.random() < rate * dt) this.spawnBubble(false);
      if (Math.random() < (0.05 + this.boil * 0.14 + this.stirSpeed * 0.06) * dt * 2) this.spawnBubble(true);
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

      this.updateActors(dt);
      // fire embers + steam
      if (this.opts.fire) {
        this.emberAcc = (this.emberAcc || 0) + dt * (2 + this.heat * 3.5) * this.q;
        while (this.emberAcc >= 1) {
          this.emberAcc -= 1;
          this.fx.spawn({ shape: "glow", color: pick(["#ff9a2b", "#ffcf4a", "#ff6a1f"]), x: CX + rand(-260, 260) * HK, y: HEARTH_FEET + rand(0, 70) * HK, vx: rand(-40, 40), vy: -rand(120, 300), g: -20, life: rand(1.2, 2.6), size: rand(4, 8), s1: 0.1, add: true, fade: "out",
            fn(p) { p.vx += Math.sin(p.age * 5 + p.seed) * 6; } });
        }
      }
      if (this.opts.steam) {
        this.puffAcc = (this.puffAcc || 0) + dt * (1.3 + this.boil * 2.4) * this.q;
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
          // leap up and come straight back down into the soup: pick where it lands first, then the sideways speed to get there
          const x0 = CX + dir * rand(10, 90), vy0 = -rand(900, 1150), air = 2 * -vy0 / 1250;
          const x1 = CX + rand(-0.6, 0.6) * LIQ.rx;   // always lands inside the liquid
          this.jumpers.push({ img: loadImg(ing.image), x: x0, y: LIQ.cy - 10, vx: (x1 - x0) / air, vy: vy0, rot: rand(-0.6, 0.6), vr: rand(-4, 4), size: rand(92, 130) * HK, age: 0 });
          this.splash(x0, LIQ.cy, 0.6);
          this.kickV += 1;
          const ca = this.act.cat, wa = this.act.witch;
          ca.lv = (ca.lv || 0) - 70; wa.lv = (wa.lv || 0) - 45;          // both lean in to watch it fly
          if (ca.pose === "idle" && !ca.gest && Math.random() < 0.3) { ca.gest = "look"; ca.gT = 0; ca.gDur = 1.6; }
        }
      }
      for (let i = this.jumpers.length - 1; i >= 0; i--) {
        const j = this.jumpers[i];
        j.vy += 1250 * dt; j.x += j.vx * dt; j.y += j.vy * dt; j.rot += j.vr * dt; j.age += dt;
        if (j.vy > 0 && j.y > LIQ.cy - 10) { this.splash(j.x, LIQ.cy, 0.7); this.jumpers.splice(i, 1); }
      }

      if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 1.3);
      if (this.ashT > 0) {
        this.ashT -= dt;
        this.ashAcc = (this.ashAcc || 0) + dt * 22 * this.q;
        while (this.ashAcc >= 1) {
          this.ashAcc -= 1;
          this.fx.spawn({ shape: "circle", color: pick(["#4a4450", "#6b6572", "#2e2a34", "#8a8492"]), x: rand(WITCH.feetX - 200, CAT.x + CAT.w), y: rand(180, 560), vx: rand(-30, 30), vy: rand(30, 110), life: rand(1.6, 2.6), size: rand(3, 8), fade: "inout",
            fn(p) { p.vx += Math.sin(p.age * 3 + p.seed) * 3; } });
        }
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
      if (!this.cam) return;
      const sh = this.shake > 0 ? this.shake * this.shake * 26 * this.S : 0;
      this.renderTo(this.ctx, { S: this.S, ox: this.ox + (sh ? rand(-sh, sh) : 0), oy: this.oy + (sh ? rand(-sh, sh) : 0), w: this.canvas.width, h: this.canvas.height });
    }
    // Everything is drawn back-to-front in one shared world; the camera is just S/ox/oy.
    renderTo(ctx, cam) {
      const { S, ox, oy, w, h } = cam;
      const t = this.time;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (!cam.noRoom) { ctx.fillStyle = "#120819"; ctx.fillRect(0, 0, w, h); }
      ctx.setTransform(S, 0, 0, S, ox, oy);
      const left = -ox / S, top = -oy / S, vw = w / S, vh = h / S;
      if (!cam.noRoom) {
        // The room (hut, its firelight, shelf glows, moonbeam) changes slowly, so on the live canvas it is
        // painted into a cache at ~16 fps (or whenever the camera moves) and blitted every frame.
        // Only the drifting dust is drawn every frame. Snapshots draw it directly.
        if (ctx === this.ctx) {
          let rc = this._roomCache;
          if (!rc || rc.cv.width !== w || rc.cv.height !== h) { rc = this._roomCache = { cv: document.createElement("canvas"), k: "", t: -1 }; rc.cv.width = w; rc.cv.height = h; rc.g = rc.cv.getContext("2d"); }
          const k = S.toFixed(5) + "," + ox.toFixed(1) + "," + oy.toFixed(1);
          if (k !== rc.k || t - rc.t > 0.075 || t < rc.t) {
            rc.k = k; rc.t = t;
            rc.g.setTransform(1, 0, 0, 1, 0, 0); rc.g.fillStyle = "#120819"; rc.g.fillRect(0, 0, w, h);
            rc.g.setTransform(S, 0, 0, S, ox, oy);
            this.drawRoom(rc.g, left, top, vw, vh);
          }
          ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(rc.cv, 0, 0); ctx.setTransform(S, 0, 0, S, ox, oy);
        } else this.drawRoom(ctx, left, top, vw, vh);
        this.drawMotes(ctx);
      }
      // contact shadows: everything stands on the same floor, and the firelight throws a longer,
      // flickering shadow away from the hearth (to the witch's left, to the cat's right)
      {
        const hw = this.hopShape(this.act.witch), hc = this.hopShape(this.act.cat);
        const kw = 1 + hw.dy / 120, kc = 1 + hc.dy / 120;
        const fl = (this.fireF || 0.9), sa = clamp(0.2 + this.heat * 0.16, 0, 0.42) * (1.25 - fl * 0.3);
        shadow(ctx, WITCH.feetX - 95 - fl * 30, FLOOR_Y + 8, (190 + fl * 40) * kw, 30 * kw, sa * kw);
        shadow(ctx, CAT.x + CAT.w * 0.6 + 80 + fl * 22, CAT.feetY + 2, (CAT.w * 0.48 + fl * 26) * kc, 22 * kc, sa * kc);
        shadow(ctx, WITCH.feetX + 18, FLOOR_Y + 2, 150 * kw, 26 * kw, 0.75 * kw);
        shadow(ctx, CAT.x + CAT.w * 0.6, CAT.feetY - 4, CAT.w * 0.4 * kc, 22 * kc, 0.75 * kc);
      }

      // 2. hearth (authored at the old pot scale, so it is drawn through one transform)
      const hearth = (fn) => { ctx.save(); ctx.translate(CX, HEARTH_FEET); ctx.scale(HK, HK); ctx.translate(-CX, -HEARTH_REF); fn(); ctx.restore(); };
      const st = SPR.stones, lg = SPR.logs, sf = SPR.stones_front;
      hearth(() => {
        shadow(ctx, CX, 866, 540, 80, 0.62);
        if (this.opts.fire) this.drawFire(ctx, true);
        if (st.naturalWidth) ctx.drawImage(st, CX - 430, 640, 860, 860 * st.naturalHeight / st.naturalWidth);
        // the logs sit wholly inside the ring: their ends are hidden by the front stones
        if (lg.naturalWidth) ctx.drawImage(lg, CX - 205, 618, 410, 410 * lg.naturalHeight / lg.naturalWidth);
      });

      // 3. the pot (one jiggling piece), what is inside it, and the magic ladle standing in the soup
      const jig = clamp(this.kick, -0.4, 0.4) * 0.05, pivY = FEET_Y - 20;
      ctx.save();
      ctx.translate(CX, pivY); ctx.scale(1 + jig, 1 - jig); ctx.translate(-CX, -pivY);
      if (SPR.pot.naturalWidth) ctx.drawImage(SPR.pot, POT.x, POT.y, POT.w, POT.h);
      ctx.save();
      this.occlude(ctx);
      this.drawLiquid(ctx);
      this.drawTrail(ctx);
      const sp = this.spoon;
      // ingredients behind the ladle first, then the ladle, then the ones in front of it
      this.drawItems(ctx, (it) => it.y < sp.y);
      this.drawBubbles(ctx);
      this.drawSpoon(ctx);
      this.drawItems(ctx, (it) => it.y >= sp.y);
      this.drawJumpers(ctx);
      ctx.restore();
      this.drawPips(ctx);
      ctx.restore();

      // 4. front fire + the stones that sit in front of the pot
      hearth(() => {
        if (this.opts.fire) this.drawFire(ctx, false);
        if (sf.naturalWidth) ctx.drawImage(sf, CX - 430, 640, 860, 860 * sf.naturalHeight / sf.naturalWidth);
      });

      // 5. the cast: the witch on the floor, conducting the ladle with her wand; the cat watching
      if (this.opts.actors) {
        this.drawWitch(ctx);
        if (this.blastT === undefined) this.drawMagic(ctx);
        this.drawCat(ctx);
      }
      this.drawHint(ctx);
      this.fx.draw(ctx, S, ox, oy);
      this.drawSteam(ctx);
      this.drawAura(ctx);
      this.drawBolt(ctx);
      if (this.flash > 0.01 && !reduceMotion) {
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = `rgba(255,248,210,${this.flash * 0.14})`;
        ctx.fillRect(left, top, vw, vh);
        ctx.globalCompositeOperation = "source-over";
      }
      if (cam.noRoom) return;
      // soft vignette to seat everything in the room
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const vg = ctx.createRadialGradient(w / 2, h * 0.55, Math.min(w, h) * 0.35, w / 2, h * 0.55, Math.max(w, h) * 0.78);
      vg.addColorStop(0, "rgba(8,2,18,0)"); vg.addColorStop(1, "rgba(8,2,18,.55)");
      ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
    }
    drawRoom(ctx, left, top, vw, vh) {
      const t = this.time;

      // 1. the hut, scaled just enough to always cover the view
      const hut = SPR.hut;
      if (hut.naturalWidth) {
        if (top < BG.y || top + vh > BG.y + BG.h) { ctx.fillStyle = "#120819"; ctx.fillRect(left, top, vw, vh); }   // only ever seen on tall portrait screens
        ctx.drawImage(this.hutDim(hut), BG.x, BG.y, BG.w, BG.h);
        // on those screens the room's top/bottom edge melts into the dark instead of ending in a line
        const fe = 180;
        if (top < BG.y) { const g = ctx.createLinearGradient(0, BG.y, 0, BG.y + fe); g.addColorStop(0, "#120819"); g.addColorStop(1, "rgba(18,8,25,0)"); ctx.fillStyle = g; ctx.fillRect(BG.x, BG.y, BG.w, fe); }
        if (top + vh > BG.y + BG.h) { const y1 = BG.y + BG.h; const g = ctx.createLinearGradient(0, y1 - fe, 0, y1); g.addColorStop(0, "rgba(18,8,25,0)"); g.addColorStop(1, "#120819"); ctx.fillStyle = g; ctx.fillRect(BG.x, y1 - fe, BG.w, fe); }
      }
      this.drawRoomLife(ctx);
      // warm pool of firelight on the floor
      {
        const f = (this.fireF || 0.9) * 1.05;
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = clamp(f * this.heat, 0, 1);
        ctx.drawImage(FLOOR_GLOW(), CX - 760, HEARTH_Y + 20 - 760 * 0.42, 1520, 1520 * 0.42);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
      }
    }
    // the room breathes with the fire: walls warm and cool with the flicker, the soup's colour spills
    // onto the room, potions on the shelves glow softly, and moonlight with drifting dust falls from the window
    drawRoomLife(ctx) {
      const t = this.time, fl = this.fireF || 0.9;
      ctx.globalCompositeOperation = "lighter";
      // the flicker on top of the steady glow baked into the room
      ctx.globalAlpha = clamp((fl - 0.8) * 2.2 * (0.55 + this.heat * 0.45), 0, 0.6);
      ctx.drawImage(ROOM_GLOW(), CX - 1100, HEARTH_Y - 160 - 780, 2200, 1560);
      // a faint wash of the soup's own colour around the pot
      const c = lighten(this.col, 0.15), key = rgb([c[0] & ~15, c[1] & ~15, c[2] & ~15]);
      let ts = this._roomTint;
      if (!ts || ts.key !== key) {
        const cv = ts ? ts.cv : document.createElement("canvas"); cv.width = cv.height = 128;
        const g = cv.getContext("2d"); g.globalCompositeOperation = "source-over"; g.clearRect(0, 0, 128, 128);
        g.drawImage(AURA(), 0, 0, 128, 128); g.globalCompositeOperation = "source-in"; g.fillStyle = key; g.fillRect(0, 0, 128, 128);
        ts = this._roomTint = { key, cv };
      }
      ctx.globalAlpha = 0.1 + this.glow * 0.12 + Math.sin(t * 1.3) * 0.015;
      ctx.drawImage(ts.cv, CX - 700, RIM.cy - 520, 1400, 1040);
      // shelf potions
      SHELF_GLOWS.forEach((b) => {
        const a = 0.13 + 0.11 * (0.5 + 0.5 * Math.sin(t * b.sp + b.ph));
        ctx.globalAlpha = a;
        ctx.drawImage(glowSprite(b.c), b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
      });
      // the moon glows a little brighter and dimmer as clouds pass
      ctx.globalAlpha = 0.14 + 0.07 * Math.sin(t * 0.6);
      ctx.drawImage(glowSprite("#b8c8ff"), WIN.x0 - 60, WIN.y0 - 40, WIN.x1 - WIN.x0 + 120, WIN.y1 - WIN.y0 + 80);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }
    drawMotes(ctx) {
      const t = this.time, fl = this.fireF || 0.9;
      ctx.globalCompositeOperation = "lighter";
      // drifting dust: a few motes in the moonbeam and in the warm air over the hearth
      if (!this.motes) {
        this.motes = [];
        for (let i = 0; i < 22; i++) this.motes.push({ moon: i < 10, s: Math.random() * 100, ph: Math.random() * TAU, sp: rand(0.03, 0.07), sz: rand(3, 6.5) });
      }
      const mote = MOTE();
      this.motes.forEach((m) => {
        const u = (m.s + t * m.sp) % 1, w = Math.sin(t * 0.7 + m.ph);
        let x, y, a;
        if (m.moon) {
          const k = (m.ph / TAU);                                   // where across the beam
          const top = [lerp(BEAM[0][0], BEAM[1][0], k), lerp(BEAM[0][1], BEAM[1][1], k)], bot = [lerp(BEAM[3][0], BEAM[2][0], k), lerp(BEAM[3][1], BEAM[2][1], k)];
          x = lerp(top[0], bot[0], u) + w * 26; y = lerp(top[1], bot[1], u);
          a = Math.sin(u * Math.PI) * 0.55;
        } else {
          x = CX + Math.cos(m.ph) * 620 + w * 40; y = HEARTH_Y - 80 - u * 760;        // warm air rising from the fire
          a = Math.sin(u * Math.PI) * 0.4 * fl;
        }
        ctx.globalAlpha = a;
        ctx.drawImage(mote, x - m.sz, y - m.sz, m.sz * 2, m.sz * 2);
      });
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }
    // the room with its evening dim already applied, made once and shared by every scene
    hutDim(hut) {
      if (Cauldron._hutDim && Cauldron._hutDim.src === hut) return Cauldron._hutDim.cv;
      const cv = document.createElement("canvas");
      cv.width = hut.naturalWidth; cv.height = hut.naturalHeight;
      const g = cv.getContext("2d");
      g.drawImage(hut, 0, 0);
      g.fillStyle = "rgba(14,5,30,.34)"; g.fillRect(0, 0, cv.width, cv.height);
      // the steady part of the hearth's light on the walls and the moonbeam are painted in once;
      // only their flicker/pulse is added per frame
      const sx = cv.width / BG.w, sy = cv.height / BG.h, X = (x) => (x - BG.x) * sx, Y = (y) => (y - BG.y) * sy;
      g.globalCompositeOperation = "lighter";
      g.globalAlpha = 0.75;
      g.drawImage(ROOM_GLOW(), X(CX - 1500), Y(HEARTH_Y - 160 - 1050), 3000 * sx, 2100 * sy);
      g.globalAlpha = 1;
      const bg = g.createLinearGradient(X(WIN.x0), Y(WIN.y0), X(BEAM[3][0]), Y(BEAM[3][1]));
      bg.addColorStop(0, "rgba(170,190,255,.08)"); bg.addColorStop(1, "rgba(170,190,255,0)");
      g.fillStyle = bg; g.beginPath(); BEAM.forEach(([x, y], i) => g[i ? "lineTo" : "moveTo"](X(x), Y(y))); g.closePath(); g.fill();
      g.globalCompositeOperation = "source-over";
      Cauldron._hutDim = { src: hut, cv };
      return cv;
    }
    // Clip to "above the back rim, or inside the opening": anything lower than the rim line
    // is hidden by the pot's front lip instead of drawing over it.
    occlude(ctx) {
      ctx.beginPath();
      ctx.moveTo(-4000, -4000); ctx.lineTo(5000, -4000); ctx.lineTo(5000, INNER.cy);
      ctx.lineTo(CX + INNER.rx, INNER.cy);
      ctx.ellipse(CX, INNER.cy, INNER.rx, INNER.ry, 0, 0, Math.PI, false);
      ctx.lineTo(-4000, INNER.cy); ctx.closePath(); ctx.clip();
    }

    drawFire(ctx, back) {
      const t = this.time, heat = this.heat;
      const f = (this.fireF || 0.9) * 1.04;
      ctx.globalCompositeOperation = "lighter";
      if (back) {
        ctx.globalAlpha = clamp(f * heat, 0, 1);
        ctx.drawImage(FIRE_BACK(), CX - 440, 350, 880, 880);
        ctx.globalAlpha = 1;
      }
      ctx.globalCompositeOperation = "source-over";
      // painted flame sprites, wobbled and stretched with the heat
      const defs = back
        ? [[-250, 170, 3, 0.4], [-120, 210, 0, 1.7], [0, 250, 4, 2.9], [120, 210, 1, 4.1], [250, 170, 3, 5.3]]
        : [[-255, 120, 2, 1.1], [-160, 150, 1, 3.1], [-60, 120, 2, 2.2], [65, 120, 2, 4.4], [165, 150, 3, 0.3], [262, 120, 2, 5.0]];
      defs.forEach(([dx, w, si, ph]) => this.flameSprite(ctx, SPR["flame" + si], CX + dx, back ? 800 : 858, w, t * (back ? 1 : 1.2), ph));
      if (!back) {
        ctx.globalCompositeOperation = "lighter";
        const gl = 0.5 + 0.5 * Math.sin(t * 6);
        ctx.globalAlpha = 0.4 + gl * 0.12;
        ctx.drawImage(FIRE_FRONT(), CX - 230, 570, 460, 460);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
      }
    }
    flameSprite(ctx, im, x, baseY, w, t, ph) {
      if (!im || !im.naturalWidth) return;
      const heat = clamp(this.heat, 0.3, 1.6);
      const k = 0.88 + 0.12 * Math.sin(t * 3.4 + ph) + 0.07 * Math.sin(t * 7.8 + ph * 1.7);
      const ww = w * (1.05 - (k - 0.88) * 0.5) * (0.8 + heat * 0.25);
      const hh = w * im.naturalHeight / im.naturalWidth * k * (0.7 + heat * 0.38);
      const sway = Math.sin(t * 2.4 + ph) * 0.12;
      ctx.save();
      ctx.translate(x, baseY);
      ctx.transform(1, 0, sway, 1, 0, 0);
      ctx.drawImage(im, -ww / 2, -hh + 6, ww, hh);
      ctx.restore();
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

    drawItems(ctx, filter) {
      const list = this.items.filter((it) => !filter || filter(it)).sort((a, b) => a.y - b.y);
      const c = this.col, wet = darken(c, 0.35);
      list.forEach((it) => {
        if (!it.img.complete || !it.img.naturalWidth) return;
        const depth = clamp((it.y - (LIQ.cy - LIQ.ry)) / (LIQ.ry * 2), 0, 1);
        let size = it.size * (0.86 + depth * 0.3) * (1 + it.hl * 0.2);
        if (it.state === "drop") size *= 1.05;
        // the "wet" tinted copy is only rebuilt when the soup colour has really moved
        const px = 160, wk = it.state === "float" ? (wet[0] >> 4) + "," + (wet[1] >> 4) + "," + (wet[2] >> 4) : "dry";
        if (!it.tmp) { it.tmp = document.createElement("canvas"); it.tmp.width = it.tmp.height = px; }
        if (it.tmpKey !== wk) {
          it.tmpKey = wk;
          const g = it.tmp.getContext("2d");
          g.clearRect(0, 0, px, px);
          g.globalCompositeOperation = "source-over";
          g.drawImage(it.img, 0, 0, px, px);
          if (wk !== "dry") {
            g.globalCompositeOperation = "source-atop";
            const gr = g.createLinearGradient(0, px * 0.5, 0, px * 0.98);
            gr.addColorStop(0, rgb(wet, 0)); gr.addColorStop(1, rgb(wet, 0.9));
            g.fillStyle = gr; g.fillRect(0, 0, px, px);
          }
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
      const c = this.col, spr = this.bubbleSprite();
      this.bubbles.forEach((b) => {
        const tt = b.age / b.life;
        const grow = Math.min(1, tt / 0.4);
        const r = b.size * (0.35 + 0.65 * grow) * (tt > 0.9 ? 1 + (tt - 0.9) * 3 : 1);
        const y = b.y - b.rise * grow;
        ctx.globalAlpha = Math.max(0, 1 - Math.max(0, tt - 0.85) * 6);
        ctx.drawImage(spr, b.x - r, y - r, r * 2, r * 2);
      });
      ctx.globalAlpha = 1;
      void c;
    }
    // one pre-drawn bubble (gradient, rim, glint) per soup colour step, drawn at any size
    bubbleSprite() {
      const c = this.col, key = (c[0] >> 4) + "," + (c[1] >> 4) + "," + (c[2] >> 4);
      if (this._bub && this._bub.key === key) return this._bub.cv;
      const cv = this._bub ? this._bub.cv : document.createElement("canvas"), N = 96, r = N / 2 - 3;
      cv.width = cv.height = N;
      const g = cv.getContext("2d"), light = lighten(c, 0.55), mid = lighten(c, 0.2);
      const gr = g.createRadialGradient(N / 2 - r * 0.35, N / 2 - r * 0.35, r * 0.05, N / 2, N / 2, r);
      gr.addColorStop(0, "rgba(255,255,255,.75)"); gr.addColorStop(0.35, rgb(light, 0.38)); gr.addColorStop(1, rgb(mid, 0.55));
      g.fillStyle = gr; g.beginPath(); g.arc(N / 2, N / 2, r, 0, TAU); g.fill();
      g.strokeStyle = "rgba(255,255,255,.55)"; g.lineWidth = 4; g.stroke();
      g.fillStyle = "rgba(255,255,255,.85)";
      g.beginPath(); g.ellipse(N / 2 - r * 0.38, N / 2 - r * 0.4, r * 0.2, r * 0.12, -0.7, 0, TAU); g.fill();
      this._bub = { key, cv };
      return cv;
    }

    // where the star on the witch's wand is in the world (she sways about her feet)
    wandTip(tipOverride) {
      const pose = this.act.witch.pose;
      const tp = tipOverride || TIPS[pose] || [WITCH.tipFx, WITCH.tipFy];
      const hs = this.hopShape(this.act.witch);
      const ub = clamp((WITCH.feetFy - tp[1]) / WITCH.feetFy, 0, 1);
      const lx = (tp[0] - WITCH.feetFx) * WITCH.w * hs.sx + (this.wBend || 0) * Math.pow(ub, 1.7), ly = (tp[1] - WITCH.feetFy) * WITCH.h * (this.breath || 1) * hs.sy;
      const rot = this.sway + this.flourish();
      const c = Math.cos(rot), s = Math.sin(rot);
      const raw = { x: WITCH.feetX + lx * c - ly * s, y: FLOOR_Y + hs.dy + lx * s + ly * c };
      if (tipOverride) return raw;
      if (!this._tip || this._tipT !== this.time) {
        if (!this._tip) this._tip = raw;
        const k = 1 - Math.exp(-(this.time - (this._tipT || this.time)) * 14);
        this._tip = { x: this._tip.x + (raw.x - this._tip.x) * k, y: this._tip.y + (raw.y - this._tip.y) * k };
        this._tipT = this.time;
      }
      return this._tip;
    }
    flourish() { const f = this.act.witch.flA || 0; return f > 0 ? Math.sin((1 - f) * Math.PI * 2) * 0.035 * f : 0; }
    // the ladle stands in the soup: its bowl is under the surface at the stir point, the handle
    // leans outward and lags behind the motion like a real spoon being pushed round a pot
    ladleGeom() {
      const sp = this.spoon;
      const depth = clamp((sp.y - (LIQ.cy - LIQ.ry)) / (2 * LIQ.ry), 0, 1);
      const sc = 0.9 + depth * 0.18;
      const L = 440 * HK * sc;
      const a = this.ladleA || 0;
      return { x: sp.x, y: sp.y, a, L, sc, top: { x: sp.x + Math.sin(a) * L * 0.74, y: sp.y - Math.cos(a) * L * 0.74 } };
    }
    drawSpoon(ctx) {
      const im = SPR.ladle;
      if (this.spoon.alpha < 0.02 || !im.naturalWidth) return;
      const g = this.ladleGeom(), ww = g.L * im.naturalWidth / im.naturalHeight * 0.92;
      const c = this.col;
      ctx.save();
      ctx.globalAlpha = this.spoon.alpha;
      // where the handle meets the soup: a little dark well and a foam ring
      ctx.fillStyle = rgb(darken(c, 0.45), 0.55);
      ctx.beginPath(); ctx.ellipse(g.x, g.y + 2, 24 * g.sc, 7 * g.sc, 0, 0, TAU); ctx.fill();
      // magic glow hugging the handle
      const act = this.magicA || 0;
      if (act > 0.02) {
        ctx.globalCompositeOperation = "lighter";
        for (let i = 0; i < 6; i++) {
          const f = 0.12 + i * 0.13, r = (26 + 10 * Math.sin(this.time * 5 + i)) * g.sc;
          ctx.globalAlpha = act * 0.35;
          ctx.drawImage(glowSprite("#c58bff"), g.x + Math.sin(g.a) * g.L * f - r, g.y - Math.cos(g.a) * g.L * f - r, r * 2, r * 2);
        }
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = this.spoon.alpha;
      }
      // only what is above the surface is visible
      ctx.save();
      ctx.beginPath(); ctx.rect(g.x - 2000, g.y - 2000, 4000, 2000 + 1); ctx.clip();
      ctx.translate(g.x, g.y); ctx.rotate(g.a);
      ctx.drawImage(im, -ww / 2, -g.L * 0.8, ww, g.L);
      // wet where it leaves the soup
      ctx.globalAlpha = this.spoon.alpha * 0.7;
      ctx.beginPath(); ctx.rect(-ww, -g.L * 0.1, ww * 2, g.L * 0.1 + 2); ctx.clip();
      ctx.drawImage(this.wetLadle(im), -ww / 2, -g.L * 0.8, ww, g.L);
      ctx.restore();
      // the foam ring sits over the handle
      ctx.strokeStyle = rgb(lighten(c, 0.7), 0.85); ctx.lineWidth = 3.5 * g.sc;
      ctx.beginPath(); ctx.ellipse(g.x, g.y + 1, 22 * g.sc + Math.sin(this.time * 8) * 1.5, 6.5 * g.sc, 0, 0, TAU); ctx.stroke();
      ctx.restore();
    }
    wetLadle(im) {
      if (!this._wet) { this._wet = document.createElement("canvas"); this._wet.width = 92; this._wet.height = Math.round(92 * im.naturalHeight / im.naturalWidth); }
      const c = this._wet, g = c.getContext("2d");
      g.globalCompositeOperation = "source-over";
      g.clearRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height);
      g.globalCompositeOperation = "source-atop";
      g.fillStyle = rgb(darken(this.col, 0.2), 0.75); g.fillRect(0, 0, c.width, c.height);
      return c;
    }
    // a ribbon of sparkles from the wand star to the ladle handle
    magicPoint(u) {
      const a = this.wandTip(), b = this.ladleGeom().top;
      const mx = (a.x + b.x) / 2, my = Math.min(a.y, b.y) - 70 - 20 * Math.sin(this.time * 2.3);
      const v = 1 - u;
      return { x: v * v * a.x + 2 * v * u * mx + u * u * b.x, y: v * v * a.y + 2 * v * u * my + u * u * b.y };
    }
    drawMagic(ctx) {
      const act = this.magicA || 0;
      const tip = this.wandTip();
      ctx.globalCompositeOperation = "lighter";
      // the wand star always twinkles
      const r = 30 + 8 * Math.sin(this.time * 6) + act * 18;
      ctx.globalAlpha = 0.55 + act * 0.4;
      ctx.drawImage(glowSprite("#ffe27a"), tip.x - r, tip.y - r, r * 2, r * 2);
      if (act > 0.02) {
        ctx.lineCap = "round";
        const N = 22;
        for (let k = 0; k < 2; k++) {
          ctx.beginPath();
          for (let i = 0; i <= N; i++) {
            const u = i / N, p = this.magicPoint(u);
            const wob = Math.sin(u * 9 - this.time * (7 + k * 2) + k * 2) * 7 * Math.sin(u * Math.PI);
            if (i) ctx.lineTo(p.x, p.y + wob); else ctx.moveTo(p.x, p.y + wob);
          }
          ctx.strokeStyle = k ? `rgba(255,226,122,${0.32 * act})` : `rgba(197,139,255,${0.3 * act})`;
          ctx.lineWidth = k ? 3 : 9;
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }

    // ----- the cast: witch + cat, drawn in the same space as the pot -------
    react(kind, dur) {
      const t = this.time + (dur || 1.2);
      if (kind === "wow") { this.act.witch.pose = "wow"; this.act.cat.pose = "wow"; this.hop("cat", 0.6); }
      else if (kind === "laugh") { this.act.witch.pose = "laugh"; this.act.cat.pose = "blink"; }
      this.act.witch.until = t; this.act.cat.until = t;
    }
    hop(who, k) { const o = this.act[who]; o.hopT = 0; o.hopK = k || 1; o.lv = (o.lv || 0) + (Math.random() < 0.5 ? -1 : 1) * 140 * (k || 1); }
    // a tap on a character: a happy hop, a new pose and a little burst of magic
    poke(who) {
      const o = this.act[who];
      if (who === "witch") {
        o.pose = "cheer"; o.until = this.time + 1.4; this.hop("witch", 1);
        const tip = this.wandTip(TIPS.cheer);
        for (let i = 0; i < 22; i++) {
          const a = rand(0, TAU), v = rand(120, 380);
          this.fx.spawn({ shape: pick(["star4", "star5", "glow"]), color: pick(["#ffe27a", "#c58bff", "#ff9bf1", "#ffffff"]), x: tip.x, y: tip.y - 40, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120, g: 260, life: rand(0.8, 1.4), size: rand(7, 15), vr: rand(-6, 6), add: true, fade: "inout" });
        }
      } else {
        o.pose = "paw"; o.until = this.time + 1.5; this.hop("cat", 1);
        for (let i = 0; i < 6; i++) {
          this.fx.spawn({ shape: "heart", color: pick(["#ff6b8e", "#ff9ab3", "#ff4d6d"]), x: CAT.x + CAT.w * rand(0.55, 0.85), y: CAT.y + CAT.h * 0.12, vx: rand(-50, 50), vy: -rand(90, 170), life: rand(1.2, 1.8), size: rand(10, 16), fade: "inout" });
        }
      }
    }
    // squash -> leap -> land, as {dy, sx, sy}
    hopShape(o) {
      if (o.hopT === undefined || o.hopT > 0.75) return { dy: 0, sx: 1, sy: 1 };
      const t = o.hopT, k = o.hopK || 1;
      if (t < 0.1) { const u = Math.sin(t / 0.1 * Math.PI / 2); return { dy: 0, sx: 1 + 0.06 * u * k, sy: 1 - 0.08 * u * k }; }
      if (t < 0.5) { const u = (t - 0.1) / 0.4; return { dy: -Math.sin(u * Math.PI) * 34 * k, sx: 1 - 0.03 * k, sy: 1 + 0.05 * k * Math.sin(u * Math.PI) }; }
      const u = (t - 0.5) / 0.25; const w = Math.sin(u * Math.PI) * (1 - u * 0.5);
      return { dy: 0, sx: 1 + 0.05 * w * k, sy: 1 - 0.07 * w * k };
    }
    updateActors(dt) {
      const a = this.act;
      ["witch", "cat"].forEach((k) => {
        const o = a[k];
        if (o.pose !== "idle" && this.time > o.until) o.pose = "idle";
        o.blinkT -= dt;
        if (o.blinkT < -0.15) o.blinkT = rand(2.6, 5.2);
        if (o.hopT !== undefined) o.hopT += dt;
      });
      this.breath = 1 + Math.sin(this.time * 1.9) * 0.006;
      // one firelight flicker shared by the hearth, the room, the floor, the shadows and the cast
      const t = this.time;
      this.fireNT = (this.fireNT || 0) - dt;
      if (this.fireNT <= 0) { this.fireNT = rand(0.08, 0.3); this.fireNTarget = rand(-1, 1); }
      this.fireN = (this.fireN || 0) + ((this.fireNTarget || 0) - (this.fireN || 0)) * Math.min(1, dt * 9);
      this.fireF = 0.86 + 0.06 * Math.sin(t * 7.1) * Math.sin(t * 2.7) + 0.04 * Math.sin(t * 12.3 + 1) + 0.06 * this.fireN;
      // springy leans: each pose pulls the body a little (toward the pot to concentrate, away when startled),
      // and hops/flinches kick the spring so hat, hair and ears follow through
      const lean = (o, target) => {
        const h = Math.min(dt, 0.033);
        for (let n = Math.ceil(dt / h), i = 0; i < n; i++) {
          o.lv = (o.lv || 0) + ((target - (o.lean || 0)) * 70 - (o.lv || 0) * 8.5) * (dt / n);
          o.lean = (o.lean || 0) + o.lv * (dt / n);
        }
      };
      {
        const o = a.witch, P = o.pose;
        const nx = clamp((this.spoon.x - CX) / LIQ.rx, -1, 1);
        let T = { focus: 16, wow: -12, yuck: -16, laugh: Math.sin(t * 9) * 5, cheer: -5, blast: -26 }[P] || 0;
        if (this.focusT > 0 && P === "idle") T = 15 + nx * 7;
        if (o.gest === "tap") T = Math.sin(o.gT * 3.4 * Math.PI) * 4;
        lean(o, T);
        this.wBend = o.lean + Math.sin(t * 0.8) * 4.5 + Math.sin(t * 1.9 + 1) * 1.6;
      }
      {
        const o = a.cat, P = o.pose;
        let T = { wow: 14, blast: 24, paw: -10, laugh: Math.sin(t * 8) * 4 }[P] || 0;
        if (P === "idle" && this.stirSpeed > 1.2) T = -9 - clamp(this.stirSpeed, 0, 8) * 0.6;   // leans in to watch the swirl
        if (o.gest === "yawn") T = 6;
        if (o.gest === "look") T = 5;
        lean(o, T);
        this.cBend = o.lean + Math.sin(t * 0.7 + 2) * 2.4;
      }
      // while the player is stirring she keeps her eyes on the pot
      this.focusT = (this.drag && this.pointer.down) ? 0.9 : Math.max(0, (this.focusT || 0) - dt);
      // little idle gestures: the witch taps her foot or waves hello, the cat yawns or looks around
      [["witch", ["tap"], 1.9], ["cat", ["yawn", "look"], 2.4]].forEach(([k, list, dur]) => {
        const o = a[k];
        if (o.gest) { o.gT += dt; if (o.gT > o.gDur || o.pose !== "idle") o.gest = null; }
        o.gNext = (o.gNext === undefined ? (k === "witch" ? 4 : 6.5) : o.gNext) - dt;
        if (o.gNext <= 0 && !o.gest && o.pose === "idle" && !(this.focusT > 0)) {
          o.gest = list[(o.gI = ((o.gI || 0) + 1) % list.length)]; o.gT = 0; o.gDur = dur + (o.gest === "look" ? 0.6 : 0);
          o.gNext = rand(7, 12);
        }
      });
      // idle life: every few seconds the witch gives her wand a flourish...
      const w = a.witch;
      w.flT = (w.flT === undefined ? 3 : w.flT) - dt;
      if (w.flT <= 0) {
        w.flT = rand(4.5, 8); w.flA = 1;
        const tip = this.wandTip();
        for (let i = 0; i < 9; i++) this.fx.spawn({ shape: pick(["star4", "glow"]), color: pick(["#ffe27a", "#ffffff", "#c58bff"]), x: tip.x, y: tip.y, vx: rand(-90, 90), vy: rand(-140, -30), g: 120, life: rand(0.6, 1.1), size: rand(5, 10), add: true, fade: "inout" });
      }
      w.flA = Math.max(0, (w.flA || 0) - dt * 1.6);
      // ...and the cat flicks its tail harder now and then, or perks up when the soup is stirred
      const c = a.cat;
      c.flT = (c.flT === undefined ? 2 : c.flT) - dt;
      if (c.flT <= 0) { c.flT = rand(3, 6); c.flA = 1; }
      c.flA = Math.max(0, (c.flA || 0) - dt * 0.9);
    }
    // the witch greets the player (a short wave), e.g. when a screen opens
    greet(delay) {
      const o = this.act.witch;
      this._greetT = setTimeout(() => { if (this.running && o.pose === "idle") { o.gest = "wave"; o.gT = 0; o.gDur = 2.6; o.gNext = Math.max(o.gNext || 0, 6); } }, (delay || 0.5) * 1000);
    }
    litSprite(im, key) {
      if (this.lit[key]) return this.lit[key];
      const c = document.createElement("canvas");
      c.width = im.naturalWidth; c.height = im.naturalHeight;
      const g = c.getContext("2d");
      g.drawImage(im, 0, 0);
      g.globalCompositeOperation = "source-atop";
      if (key[0] === "c") {
        // the cat sits to the right of the hearth, so the firelight rakes across it from the left (and a little from below)
        const gl = g.createLinearGradient(0, 0, c.width * 0.8, 0);
        gl.addColorStop(0, "rgba(255,150,50,0.6)"); gl.addColorStop(1, "rgba(255,150,50,0)");
        g.fillStyle = gl; g.fillRect(0, 0, c.width, c.height);
        const gb = g.createLinearGradient(0, c.height * 0.6, 0, c.height);
        gb.addColorStop(0, "rgba(255,150,50,0)"); gb.addColorStop(1, "rgba(255,150,50,0.18)");
        g.fillStyle = gb; g.fillRect(0, 0, c.width, c.height);
      } else {
        // the witch stands left of the hearth: warm light from her right and from below
        const gl = g.createLinearGradient(c.width, 0, c.width * 0.25, 0);
        gl.addColorStop(0, "rgba(255,150,50,0.55)"); gl.addColorStop(1, "rgba(255,150,50,0)");
        g.fillStyle = gl; g.fillRect(0, 0, c.width, c.height);
        const gr = g.createLinearGradient(0, c.height * 0.55, 0, c.height);
        gr.addColorStop(0, "rgba(255,150,50,0)"); gr.addColorStop(1, "rgba(255,150,50,0.32)");
        g.fillStyle = gr; g.fillRect(0, 0, c.width, c.height);
      }
      this.lit[key] = c;
      return c;
    }
    // Draw a character as horizontal strips: feet stay planted, the upper body leans by `bend`
    // (growing with height) and the chest swells a little with each breath. Cheap "puppet" life.
    bentDraw(ctx, img, x, y, w, h, bend, br, bu) {
      const N = 14, iw = img.naturalWidth, ih = img.naturalHeight, H = -y || 1;
      for (let i = 0; i < N; i++) {
        const v0 = i / N, dy = y + v0 * h, dh = h / N;
        const u = clamp(-(dy + dh * 0.5) / H, 0, 1);
        const off = bend * Math.pow(u, 1.7);
        const z = (u - bu) / 0.17, sx = 1 + br * Math.exp(-z * z);
        ctx.drawImage(img, 0, v0 * ih, iw, ih / N + (i < N - 1 ? 1.5 : 0), x * sx + off, dy, w * sx, dh + (i < N - 1 ? 1.5 * h / ih : 0));
      }
    }
    // One light layer per character pose: the hearth's warm light from the fire side plus the soup's own
    // colour spilling on the side that faces the pot. Half resolution (it is soft light), cached per pose
    // and colour step, drawn over the body with the shared flicker.
    lightSprite(im, key, fromRight) {
      const c = this.col, ck = (c[0] >> 5) + "," + (c[1] >> 5) + "," + (c[2] >> 5);
      const k = key + "|" + ck;
      this._light = this._light || {};
      const e = this._light[key];
      if (e && e.k === k) return e.cv;
      const cv = (e && e.cv) || document.createElement("canvas");
      cv.width = Math.round(im.naturalWidth / 2); cv.height = Math.round(im.naturalHeight / 2);
      const g = cv.getContext("2d");
      g.globalCompositeOperation = "source-over"; g.clearRect(0, 0, cv.width, cv.height);
      g.drawImage(this.litSprite(im, key), 0, 0, cv.width, cv.height);
      g.globalCompositeOperation = "source-atop";
      const lc = lighten(c, 0.3);
      const gr = fromRight ? g.createLinearGradient(cv.width, 0, cv.width * 0.5, 0) : g.createLinearGradient(0, 0, cv.width * 0.5, 0);
      gr.addColorStop(0, rgb(lc, 0.38)); gr.addColorStop(1, rgb(lc, 0));
      g.fillStyle = gr; g.fillRect(0, 0, cv.width, cv.height);
      this._light[key] = { k, cv };
      return cv;
    }
    drawActor(ctx, imgs, rect, o, key, breath) {
      const pose = o.pose !== "idle" ? o.pose : (o.blinkT < 0 ? "blink" : "idle");
      const im = imgs[pose] || imgs.idle;
      if (!im || !im.naturalWidth) return;
      ctx.save();
      ctx.translate(rect.x + rect.w / 2, rect.feetY);
      ctx.scale(1, breath);
      ctx.drawImage(im, -rect.w / 2, -rect.h, rect.w, rect.h);
      // warm firelight from the hearth
      const f = 0.7 + 0.16 * Math.sin(this.time * 3.1) + 0.08 * Math.sin(this.time * 5.3 + 1) + this.glow * 0.3;
      ctx.globalAlpha = clamp(f * (0.55 + this.heat * 0.4), 0, 1);
      ctx.drawImage(this.litSprite(im, key + pose), -rect.w / 2, -rect.h, rect.w, rect.h);
      ctx.restore();
    }
    drawWitch(ctx) {
      const o = this.act.witch;
      let pose = o.pose !== "idle" ? o.pose : (o.blinkT < 0 ? "blink" : "idle");
      if (o.pose === "idle" && o.gest === "wave") pose = "wave";   // body is one picture; the hand is its own layer, rocked at the wrist below
      else if (o.pose === "idle" && !o.gest && pose === "idle" && this.focusT > 0) pose = "focus";
      else if (o.pose === "idle" && o.gest === "tap") pose = (Math.floor(o.gT * 3.4) % 2 === 0) ? "tap" : "idle";
      const imgs = { idle: SPR.ww_idle, blink: SPR.ww_blink, wow: SPR.ww_wow, laugh: SPR.ww_laugh, cheer: SPR.ww_cheer, wave: SPR.ww_wavebase, tap: SPR.ww_tap, focus: SPR.ww_focus, yuck: SPR.ww_yuck, blast: SPR.ww_blast };
      const im = imgs[pose] && imgs[pose].naturalWidth ? imgs[pose] : imgs.idle;
      if (!im || !im.naturalWidth) return;
      const hs = this.hopShape(o);
      // a gentle bob on her toes while she conducts
      const bob = 1 + Math.sin(this.time * 2.6) * 0.004;
      ctx.save();
      ctx.translate(WITCH.feetX, FLOOR_Y + hs.dy);
      ctx.rotate(pose === "blast" ? -0.07 + Math.sin(this.time * 38) * 0.03 * this.shake : this.sway + this.flourish());
      ctx.scale(hs.sx, (this.breath || 1) * bob * hs.sy);
      const x = -WITCH.feetFx * WITCH.w, y = -WITCH.feetFy * WITCH.h;
      const bend = pose === "blast" ? 0 : (this.wBend || 0), br = Math.sin(this.time * 1.9) * 0.012;
      this.bentDraw(ctx, im, x, y, WITCH.w, WITCH.h, bend, br, 0.6);
      const f = (this.fireF || 0.9) * 0.82 + this.glow * 0.3;
      ctx.globalAlpha = clamp(f * (0.5 + this.heat * 0.35), 0, 1);
      this.bentDraw(ctx, this.lightSprite(im, "w" + pose, true), x, y, WITCH.w, WITCH.h, bend, br, 0.6);
      ctx.globalAlpha = 1;
      if (pose === "wave" && SPR.ww_hand.naturalWidth) {
        ctx.translate(bend * Math.pow(0.54, 1.7), 0);     // the hand rides along with the lean
        // the waving hand rocks smoothly about her wrist (sprite pixels: wrist 128,507; hand layer starts at 43,388)
        const k = WITCH.w / 820, T = o.gT, D = o.gDur;
        const env = Math.min(1, T / 0.3, (D - T) / 0.3);
        const ang = (Math.sin(T * TAU * 1.9) * 0.3 - 0.03) * Math.max(0, env);
        ctx.globalAlpha = 1;
        ctx.translate(x + 128 * k, y + 507 * k); ctx.rotate(ang);
        ctx.drawImage(SPR.ww_hand, (43 - 128) * k, (388 - 507) * k, SPR.ww_hand.naturalWidth * k, SPR.ww_hand.naturalHeight * k);
        // the sleeve is drawn over the wrist, so the hand turns inside the cuff with no seam
        ctx.rotate(-ang); ctx.translate(-(x + 128 * k), -(y + 507 * k)); ctx.translate(x, y);
        if (SPR.ww_cap.naturalWidth) ctx.drawImage(SPR.ww_cap, 78 * k, 485 * k, SPR.ww_cap.naturalWidth * k, SPR.ww_cap.naturalHeight * k);
      }
      ctx.restore();
    }
    drawCat(ctx) {
      const o = this.act.cat, t = this.time;
      let pose = o.pose !== "idle" ? o.pose : (o.blinkT < 0 ? "blink" : "idle");
      if (o.pose === "idle" && o.gest) pose = o.gest === "look" ? (o.gT > 0.15 && o.gT < o.gDur - 0.15 ? "look" : "idle") : "yawn";
      const imgs = { idle: SPR.ct_idle, blink: SPR.ct_blink, wow: SPR.ct_wow, paw: SPR.ct_paw, laugh: SPR.ct_blink, yawn: SPR.ct_yawn, look: SPR.ct_look, blast: SPR.ct_blast };
      const im = imgs[pose] && imgs[pose].naturalWidth ? imgs[pose] : imgs.idle;
      if (!im || !im.naturalWidth) return;
      const hs = this.hopShape(o);
      const ax = CAT.x + CAT.w * CAT.bodyFx;
      const breath = 1 + Math.sin(t * 1.6 + 1) * 0.004 + (pose === "yawn" ? Math.sin(clamp((o.gT || 0) / (o.gDur || 1), 0, 1) * Math.PI) * 0.035 : 0);
      const excite = clamp(this.stirSpeed / 6, 0, 1) * 0.6 + (o.flA || 0) + (o.pose === "paw" ? 1 : 0);
      const tailA = Math.sin(t * 1.5) * 0.07 + Math.sin(t * 0.55 + 1) * 0.04 + Math.sin(t * 7) * 0.09 * clamp(excite, 0, 1.4);
      const f = (this.fireF || 0.9) * 0.82 + this.glow * 0.3;
      const lit = clamp(f * (0.55 + this.heat * 0.4), 0, 1);
      const bend = this.cBend || 0, br = Math.sin(t * 1.6 + 1) * 0.016;
      ctx.save();
      ctx.translate(ax, CAT.feetY + hs.dy);
      if (pose === "blast") ctx.rotate(Math.sin(t * 42) * 0.03 * this.shake);
      ctx.scale(hs.sx, breath * hs.sy);
      const x0 = -CAT.w * CAT.bodyFx, y0 = -CAT.h;
      const draw = (img, key, flat) => {
        if (flat) {
          ctx.drawImage(img, x0, y0, CAT.w, CAT.h);
          ctx.globalAlpha = lit; ctx.drawImage(this.litSprite(img, key), x0, y0, CAT.w, CAT.h); ctx.globalAlpha = 1;
          return;
        }
        this.bentDraw(ctx, img, x0, y0, CAT.w, CAT.h, bend, br, 0.42);
        ctx.globalAlpha = lit; this.bentDraw(ctx, this.lightSprite(img, key, false), x0, y0, CAT.w, CAT.h, bend, br, 0.42);
        ctx.globalAlpha = 1;
      };
      // tail behind the body, swishing about its base
      const tl = SPR.ct_tail;
      if (tl.naturalWidth) {
        const px = x0 + CAT.tailFx * CAT.w, py = y0 + CAT.tailFy * CAT.h;
        ctx.save(); ctx.translate(px, py); ctx.rotate(tailA); ctx.translate(-px, -py);
        if (pose === "blast") {                      // singed: the tail is sooty grey like the rest of the cat
          if (!this._sootTail || this._sootTail.w !== tl.naturalWidth) {
            const cv = document.createElement("canvas"); cv.width = tl.naturalWidth; cv.height = tl.naturalHeight;
            const g = cv.getContext("2d"); g.drawImage(tl, 0, 0); g.globalCompositeOperation = "source-atop";
            g.fillStyle = "rgba(52,48,60,.82)"; g.fillRect(0, 0, cv.width, cv.height);
            this._sootTail = { w: tl.naturalWidth, cv };
          }
          ctx.drawImage(this._sootTail.cv, x0, y0, CAT.w, CAT.h);
        } else draw(tl, "ctail", true);
        ctx.restore();
      }
      draw(im, "c" + pose);
      ctx.restore();
    }
    drawHint(ctx) {
      this.hintA += ((this.showHint ? 1 : 0) - this.hintA) * 0.12;
      if (this.hintA < 0.02) return;
      const rx = LIQ.rx * 0.78, ry = LIQ.ry * 0.78;
      ctx.save();
      ctx.globalAlpha = this.hintA * (0.75 + 0.25 * Math.sin(this.time * 4));
      ctx.translate(CX, LIQ.cy + 4); ctx.scale(1, ry / rx);
      ctx.lineCap = "round"; ctx.setLineDash([26, 22]); ctx.lineDashOffset = -this.time * 60;
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 16; ctx.beginPath(); ctx.arc(0, 0, rx, 0, TAU); ctx.stroke();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 8; ctx.stroke();
      ctx.setLineDash([]);
      // arrow head
      const a = this.time * 1.1 % TAU, hx = Math.cos(a) * rx, hy = Math.sin(a) * rx;
      ctx.translate(hx, hy); ctx.rotate(a + Math.PI / 2);
      ctx.fillStyle = "#fff"; ctx.strokeStyle = OUTLINE; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(0, -20); ctx.lineTo(26, 18); ctx.lineTo(-26, 18); ctx.closePath(); ctx.stroke(); ctx.fill();
      ctx.restore();
    }

    drawPips(ctx) {
      const cx = EMBLEM.x, cy = EMBLEM.y;
      const pos = [[0, -30 * HK], [27 * HK, 16 * HK], [-27 * HK, 16 * HK]];
      pos.forEach(([dx, dy], i) => {
        const gl = this.pipGlow[i];
        if (gl < 0.02 || !this.pips[i]) return;
        ctx.globalCompositeOperation = "lighter";
        const r = (30 * gl + 6 * Math.sin(this.time * 4 + i)) * HK;
        ctx.drawImage(glowSprite(this.pips[i]), cx + dx - r, cy + dy - r, r * 2, r * 2);
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = this.pips[i];
        ctx.strokeStyle = OUTLINE; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(cx + dx * 1.1, cy + dy * 1.1, 6.5 * HK, 0, TAU); ctx.fill(); ctx.stroke();
      });
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
      // tint the white light sprite once per colour step instead of building a gradient every frame
      const key = rgb([c[0] & ~15, c[1] & ~15, c[2] & ~15]);
      let ts = this._auraTint;
      if (!ts || ts.key !== key) {
        const cv = ts ? ts.cv : document.createElement("canvas");
        cv.width = cv.height = 128;
        const g = cv.getContext("2d");
        g.globalCompositeOperation = "source-over"; g.clearRect(0, 0, 128, 128);
        g.drawImage(AURA(), 0, 0, 128, 128);
        g.globalCompositeOperation = "source-in"; g.fillStyle = key; g.fillRect(0, 0, 128, 128);
        ts = this._auraTint = { key, cv };
      }
      ctx.globalAlpha = Math.min(1, a);
      ctx.drawImage(ts.cv, CX - 430, RIM.cy - 430, 860, 860);
      ctx.globalAlpha = 1;
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

    // A framed picture of the whole scene (for the PNG export), independent of the live camera.
    snapshot() {
      const w = 1400, h = Math.round(w * VIEW.h / VIEW.w);
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const S = w / VIEW.w;
      this.renderTo(c.getContext("2d"), { S, ox: w / 2 - VIEW.cx * S, oy: h / 2 - VIEW.cy * S, w, h });
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

  Cauldron.preload = () => new Promise((res) => { sprWait(res); setTimeout(res, 6000); });
  global.Cauldron = Cauldron;
  global.FxCanvas = FxCanvas;
  global.CauldronGeometry = { W, H, CX, RIM, INNER, LIQ, WITCH, CAT, VIEW };
  global.TAG_COLORS = TAGCOL;
})(window);
