/* Witch's Soup — the graduation ceremony.
   Brewing the secret Potion of Knowledge (every other potion collected) is the big finish:
   a drum roll, the potion rising in a rainbow, fireworks, the witch and cat cheering, caps
   thrown in the air, and a themed certificate the student can save and reopen from the
   Potion Book at any time.  Graduation.play(), Graduation.openCertificate(). */
(function (global) {
  "use strict";

  const GRAD_KEY = "witchsoup-graduation";
  const $ = (id) => document.getElementById(id);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const FONT = '"Baloo 2", "Nunito", "Hiragino Maru Gothic ProN", sans-serif';
  const BODY = '"Nunito", "Hiragino Maru Gothic ProN", sans-serif';
  const RAINBOW = ["#ff5fa8", "#ffb238", "#ffe27a", "#6fe28a", "#5ad1ff", "#8b5cf6", "#ffffff"];

  // ---------- saved graduation (date + name) ----------
  function load() { try { return JSON.parse(localStorage.getItem(GRAD_KEY) || "null") || {}; } catch (e) { return {}; } }
  function save(d) { try { localStorage.setItem(GRAD_KEY, JSON.stringify(d)); } catch (e) { /* ignore */ } }
  // the student's name is only ever kept in memory while the certificate is open: never saved
  let typedName = "";
  function record() {
    const d = load();
    if (d.name !== undefined) { delete d.name; save(d); }
    if (!d.date) { d.date = new Date().toISOString(); save(d); }
    return d;
  }

  const imgs = {};
  function img(src) {
    if (!imgs[src]) imgs[src] = new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
    return imgs[src];
  }
  const ART = {
    witch: "assets/art/ww_cheer_g.webp", cat: "assets/art/ct_paw_g.webp",
    witch0: "assets/art/ww_cheer.webp", cat0: "assets/art/ct_paw.webp",
    logo: "assets/art/logo.webp", potion: "assets/potions/secret-potion.webp"
  };

  // =====================================================================
  // the certificate (drawn on a canvas so it can be saved as a picture)
  // =====================================================================
  function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function starPath(g, cx, cy, r1, r2, n, rot) {
    g.beginPath();
    for (let k = 0; k < n * 2; k++) { const a = (rot || -Math.PI / 2) + k * Math.PI / n, r = k % 2 ? r2 : r1; g[k ? "lineTo" : "moveTo"](cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
    g.closePath();
  }
  function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function fitFont(g, text, weight, size, family, maxW, min) {
    let s = size; g.font = `${weight} ${s}px ${family}`;
    while (s > (min || 10) && g.measureText(text).width > maxW) { s -= 2; g.font = `${weight} ${s}px ${family}`; }
    return s;
  }
  function inked(g, text, x, y, fill, lw) {
    g.lineJoin = "round"; g.strokeStyle = "#12061c"; g.lineWidth = lw; g.strokeText(text, x, y);
    g.fillStyle = fill; g.fillText(text, x, y);
  }
  // a little graduation cap (used on the cat, and thrown in the air)
  function cap(g, x, y, w, rot) {
    g.save(); g.translate(x, y); g.rotate(rot || 0);
    const h = w * 0.34;
    g.lineJoin = "round"; g.strokeStyle = "#12061c"; g.lineWidth = w * 0.045;
    // skull cap
    g.fillStyle = "#2b1546"; g.beginPath();
    g.moveTo(-w * 0.3, 0); g.lineTo(-w * 0.3, h * 0.9); g.quadraticCurveTo(0, h * 1.35, w * 0.3, h * 0.9); g.lineTo(w * 0.3, 0); g.closePath(); g.fill(); g.stroke();
    // the board
    g.fillStyle = "#3a1f63"; g.beginPath();
    g.moveTo(0, -h * 0.75); g.lineTo(w * 0.5, 0); g.lineTo(0, h * 0.62); g.lineTo(-w * 0.5, 0); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = "rgba(255,255,255,.16)"; g.beginPath(); g.moveTo(0, -h * 0.62); g.lineTo(w * 0.4, -h * 0.04); g.lineTo(0, -h * 0.2); g.closePath(); g.fill();
    // tassel
    g.strokeStyle = "#ffc83a"; g.lineWidth = w * 0.035; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(w * 0.36, h * 0.05, w * 0.4, h * 0.85); g.stroke();
    g.fillStyle = "#ffc83a"; g.strokeStyle = "#12061c"; g.lineWidth = w * 0.025;
    g.beginPath(); g.ellipse(w * 0.4, h * 1.0, w * 0.045, h * 0.28, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    g.beginPath(); g.arc(0, 0, w * 0.05, 0, Math.PI * 2); g.fill(); g.stroke();
    g.restore();
  }
  function pawPrint(g, x, y, s, col) {
    g.fillStyle = col;
    g.beginPath(); g.ellipse(x, y + s * 0.18, s * 0.42, s * 0.34, 0, 0, Math.PI * 2); g.fill();
    [[-0.46, -0.28, -0.35], [-0.16, -0.58, -0.1], [0.18, -0.58, 0.1], [0.48, -0.28, 0.35]].forEach(([dx, dy, r]) => {
      g.beginPath(); g.ellipse(x + dx * s, y + dy * s, s * 0.15, s * 0.2, r, 0, Math.PI * 2); g.fill();
    });
  }
  function dateText(iso) {
    const d = iso ? new Date(iso) : new Date();
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    return { en: `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`, ja: `${d.getFullYear()}ねん ${d.getMonth() + 1}がつ ${d.getDate()}にち` };
  }

  // the student's name is the only part that changes, so it is drawn on its own over a cached base
  function drawName(g, name) {
    const W = 1600, nm = (name || "").trim() || "Super Student";
    g.save(); g.textAlign = "center"; g.textBaseline = "alphabetic";
    fitFont(g, nm, 800, 84, FONT, 700, 36);
    g.fillStyle = "rgba(139,92,246,.28)"; g.fillText(nm, W / 2 + 2, 603);   // soft drop glow (no blur: cheap on Chromebooks)
    g.fillStyle = "#4a1f8a"; g.fillText(nm, W / 2, 598);
    g.restore();
  }
  let basePromise = null;
  function certBase() {
    if (!basePromise) basePromise = drawCertificate(null);
    return basePromise;
  }
  // full picture for saving: cached base + name
  async function composeCertificate(name, target) {
    const base = await certBase();
    const cv = target || document.createElement("canvas");
    if (cv.width !== base.width) { cv.width = base.width; cv.height = base.height; }
    const g = cv.getContext("2d");
    g.drawImage(base, 0, 0); drawName(g, name);
    return cv;
  }
  async function drawCertificate(name) {
    try { await Promise.all([`800 80px "Baloo 2"`, `700 40px "Baloo 2"`, `800 30px "Nunito"`, `900 30px "Nunito"`].map((f) => document.fonts.load(f))); } catch (e) { /* ignore */ }
    let [witch, catI, logo, potion] = await Promise.all([img(ART.witch), img(ART.cat), img(ART.logo), img(ART.potion)]);
    if (!witch) witch = await img(ART.witch0);
    if (!catI) catI = await img(ART.cat0);
    const W = 1600, H = 1131;
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const g = cv.getContext("2d");
    const R = rng(20261018);
    g.textAlign = "center"; g.textBaseline = "alphabetic";

    // night sky behind the scroll
    const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, "#3a1670"); sky.addColorStop(1, "#14062a");
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(255,240,200,${0.25 + R() * 0.6})`; g.beginPath(); g.arc(R() * W, R() * H, 0.8 + R() * 2.2, 0, Math.PI * 2); g.fill(); }

    // parchment
    const px = 46, py = 40, pw = W - 92, ph = H - 80;
    g.fillStyle = "#12061c"; rr(g, px + 6, py + 12, pw, ph, 44); g.fill();
    const paper = g.createLinearGradient(0, py, 0, py + ph); paper.addColorStop(0, "#fff8e4"); paper.addColorStop(1, "#f4dca6");
    g.fillStyle = paper; rr(g, px, py, pw, ph, 44); g.fill();
    g.save(); rr(g, px, py, pw, ph, 44); g.clip();
    const vig = g.createRadialGradient(W / 2, H / 2, 300, W / 2, H / 2, 950); vig.addColorStop(0, "rgba(180,120,40,0)"); vig.addColorStop(1, "rgba(170,105,30,.32)");
    g.fillStyle = vig; g.fillRect(0, 0, W, H);
    // a soft rainbow glow behind the potion and a few faint magic stars on the paper
    for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(200,150,60,${0.1 + R() * 0.12})`; starPath(g, px + 80 + R() * (pw - 160), py + 80 + R() * (ph - 160), 9 + R() * 10, 4, 4, R()); g.fill(); }
    g.restore();
    g.lineWidth = 8; g.strokeStyle = "#12061c"; rr(g, px, py, pw, ph, 44); g.stroke();
    // gold double border with corner stars
    const gold = g.createLinearGradient(0, 0, W, H); gold.addColorStop(0, "#f9c74f"); gold.addColorStop(0.5, "#fff0a8"); gold.addColorStop(1, "#e09a1a");
    g.strokeStyle = gold; g.lineWidth = 12; rr(g, px + 22, py + 22, pw - 44, ph - 44, 30); g.stroke();
    g.strokeStyle = "#b9832a"; g.lineWidth = 3; rr(g, px + 40, py + 40, pw - 80, ph - 80, 22); g.stroke();
    g.setLineDash([3, 12]); g.lineCap = "round"; g.strokeStyle = "rgba(185,131,42,.7)"; g.lineWidth = 4; rr(g, px + 52, py + 52, pw - 104, ph - 104, 18); g.stroke(); g.setLineDash([]);
    [[px + 30, py + 30], [px + pw - 30, py + 30], [px + 30, py + ph - 30], [px + pw - 30, py + ph - 30]].forEach(([x, y]) => {
      g.fillStyle = "#8b5cf6"; g.strokeStyle = "#12061c"; g.lineWidth = 4; g.beginPath(); g.arc(x, y, 26, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = "#ffe27a"; starPath(g, x, y, 19, 8, 5); g.fill(); g.lineWidth = 3; g.stroke();
    });

    // logo
    if (logo) { const lw = 300, lh = lw * logo.height / logo.width; g.drawImage(logo, W / 2 - lw / 2, py + 34, lw, lh); }

    // title
    g.font = `800 92px ${FONT}`;
    const tg = g.createLinearGradient(0, 230, 0, 320); tg.addColorStop(0, "#9b5cf0"); tg.addColorStop(1, "#5a22b0");
    g.save(); g.shadowColor = "rgba(18,6,28,.35)"; g.shadowOffsetY = 6; inked(g, "Certificate of Magic", W / 2, 320, tg, 14); g.restore();
    g.lineJoin = "round"; g.strokeStyle = "rgba(255,255,255,.65)"; g.lineWidth = 3;

    // ribbon banner
    {
      const bw = 640, bh = 78, bx = W / 2 - bw / 2, by = 344;
      const tail = (dir) => {
        const x0 = dir < 0 ? bx + 26 : bx + bw - 26, x1 = x0 + dir * 96;
        g.fillStyle = "#b8246e"; g.strokeStyle = "#12061c"; g.lineWidth = 6;
        g.beginPath(); g.moveTo(x0, by + 18); g.lineTo(x1, by + 18); g.lineTo(x1 - dir * 28, by + 18 + bh / 2); g.lineTo(x1, by + 18 + bh); g.lineTo(x0, by + 18 + bh); g.closePath(); g.fill(); g.stroke();
      };
      tail(-1); tail(1);
      const rg = g.createLinearGradient(0, by, 0, by + bh); rg.addColorStop(0, "#ff7cc0"); rg.addColorStop(1, "#e0408a");
      g.fillStyle = rg; g.strokeStyle = "#12061c"; g.lineWidth = 6;
      g.beginPath(); g.moveTo(bx, by); g.quadraticCurveTo(W / 2, by - 16, bx + bw, by); g.lineTo(bx + bw, by + bh); g.quadraticCurveTo(W / 2, by + bh - 16, bx, by + bh); g.closePath(); g.fill(); g.stroke();
      g.font = `800 50px ${FONT}`; inked(g, "★ ENGLISH MASTER ★", W / 2, by + 56, "#fff", 9);
    }
    g.font = `900 28px ${BODY}`; g.fillStyle = "#b8246e"; g.fillText("えいご マスター", W / 2, 462);

    // name
    g.font = `800 30px ${BODY}`; g.fillStyle = "#6b4a8a"; g.fillText("This certificate is proudly given to", W / 2, 512);
    if (name !== null) drawName(g, name);
    const ul = g.createLinearGradient(W / 2 - 360, 0, W / 2 + 360, 0); ul.addColorStop(0, "rgba(201,154,46,0)"); ul.addColorStop(0.15, "#c99a2e"); ul.addColorStop(0.85, "#c99a2e"); ul.addColorStop(1, "rgba(201,154,46,0)");
    g.fillStyle = ul; g.fillRect(W / 2 - 360, 616, 720, 4);

    // what they did
    g.fillStyle = "#3a1f55"; g.font = `800 30px ${BODY}`;
    g.fillText("for graduating from the Witch's Soup School of Magic", W / 2, 670);
    g.fillText("and brewing the legendary Potion of Knowledge!", W / 2, 712);
    g.font = `800 20px ${BODY}`; g.fillStyle = "#7a5a98";
    g.fillText("まほうがっこうを そつぎょうして、でんせつの「ちしきの ポーション」を つくりました！", W / 2, 752);
    g.font = `800 46px ${FONT}`; inked(g, "Great job with your English!", W / 2, 818, "#ff5fa8", 8);
    g.font = `900 24px ${BODY}`; g.fillStyle = "#b8246e"; g.fillText("えいご、よく がんばったね！", W / 2, 852);

    // the potion, glowing, with the gold seal
    const pcx = W / 2, pcy = 935;
    const glow = g.createRadialGradient(pcx, pcy, 10, pcx, pcy, 120);
    glow.addColorStop(0, "rgba(255,226,122,.85)"); glow.addColorStop(0.5, "rgba(255,124,192,.35)"); glow.addColorStop(1, "rgba(139,92,246,0)");
    g.fillStyle = glow; g.beginPath(); g.arc(pcx, pcy, 120, 0, Math.PI * 2); g.fill();
    g.save(); g.translate(pcx, pcy); g.strokeStyle = "rgba(255,200,58,.55)"; g.lineWidth = 4; g.lineCap = "round";
    for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8; g.beginPath(); g.moveTo(Math.cos(a) * 82, Math.sin(a) * 82); g.lineTo(Math.cos(a) * (i % 2 ? 100 : 114), Math.sin(a) * (i % 2 ? 100 : 114)); g.stroke(); }
    g.restore();
    if (potion) g.drawImage(potion, pcx - 72, pcy - 78, 144, 144);
    // seal
    {
      const sx = pcx + 120, sy = pcy + 38, r = 40;
      g.fillStyle = "#12061c"; g.beginPath();
      for (let k = 0; k <= 48; k++) { const a = k * Math.PI / 24, rr2 = (k % 2 ? r : r - 6) + 4; g[k ? "lineTo" : "moveTo"](sx + Math.cos(a) * rr2, sy + 3 + Math.sin(a) * rr2); }
      g.fill();
      const sg = g.createRadialGradient(sx - 14, sy - 14, 4, sx, sy, r); sg.addColorStop(0, "#fff0a8"); sg.addColorStop(1, "#e0961a");
      g.fillStyle = sg; g.beginPath();
      for (let k = 0; k <= 48; k++) { const a = k * Math.PI / 24, rr2 = k % 2 ? r : r - 6; g[k ? "lineTo" : "moveTo"](sx + Math.cos(a) * rr2, sy + Math.sin(a) * rr2); }
      g.fill(); g.strokeStyle = "#12061c"; g.lineWidth = 3; g.stroke();
      g.strokeStyle = "rgba(140,80,10,.6)"; g.lineWidth = 2; g.beginPath(); g.arc(sx, sy, r - 14, 0, Math.PI * 2); g.stroke();
      g.fillStyle = "#c46a0a"; starPath(g, sx, sy - 6, 18, 8, 5); g.fill();
      g.font = `800 15px ${FONT}`; g.fillStyle = "#7a3e00"; const nReg = typeof REGULAR_POTIONS !== "undefined" ? REGULAR_POTIONS.length : 20; g.fillText(`${nReg}/${nReg}`, sx, sy + 26);
    }

    // signatures
    const sig = (cx, title, ja, draw) => {
      draw(cx, 948);
      g.fillStyle = "#4a1f8a"; g.fillRect(cx - 115, 960, 230, 3);
      g.font = `800 22px ${FONT}`; g.fillStyle = "#4a1f8a"; g.fillText(title, cx, 988);
      g.font = `800 16px ${BODY}`; g.fillStyle = "#7a5a98"; g.fillText(ja, cx, 1010);
    };
    sig(520, "Head Witch", "こうちょう せんせい", (x, y) => {
      // a loopy hand-written signature
      g.save(); g.strokeStyle = "#5a22b0"; g.lineWidth = 4; g.lineCap = "round"; g.lineJoin = "round"; g.beginPath();
      g.moveTo(x - 100, y - 4);
      g.bezierCurveTo(x - 90, y - 60, x - 70, y - 50, x - 74, y);
      g.bezierCurveTo(x - 60, y - 40, x - 50, y - 40, x - 46, y);
      g.bezierCurveTo(x - 36, y - 40, x - 26, y - 40, x - 22, y - 6);
      g.bezierCurveTo(x - 10, y - 30, x + 6, y - 30, x + 8, y - 6);
      g.bezierCurveTo(x + 14, y - 64, x + 30, y - 52, x + 24, y - 2);
      g.bezierCurveTo(x + 40, y - 26, x + 56, y - 26, x + 60, y - 6);
      g.bezierCurveTo(x + 80, y - 20, x + 96, y - 10, x + 110, y - 18);
      g.stroke();
      g.fillStyle = "#ffc83a"; g.strokeStyle = "#12061c"; g.lineWidth = 2; starPath(g, x + 120, y - 30, 12, 5, 5); g.fill(); g.stroke();
      g.restore();
    });
    sig(1090, "Cat Teacher", "ねこの せんせい", (x, y) => {
      g.save(); g.translate(x, y - 22); g.rotate(-0.2); pawPrint(g, 0, 0, 38, "#5a22b0"); g.restore();
      g.save(); g.translate(x + 60, y - 14); g.rotate(0.25); pawPrint(g, 0, 0, 22, "rgba(90,34,176,.55)"); g.restore();
    });
    // date
    {
      // graduation day, on a little gold plaque in the top-left corner
      const dt = dateText(load().date), x = 270, y = 196;
      g.save(); g.translate(x, y); g.rotate(-0.06);
      g.fillStyle = "#12061c"; rr(g, -150, -40, 300, 80, 18); g.fill();
      const pg2 = g.createLinearGradient(0, -44, 0, 32); pg2.addColorStop(0, "#fff0a8"); pg2.addColorStop(1, "#f2b93a");
      g.fillStyle = pg2; rr(g, -146, -44, 292, 76, 16); g.fill();
      g.strokeStyle = "rgba(140,80,10,.5)"; g.lineWidth = 2; rr(g, -138, -36, 276, 60, 11); g.stroke();
      g.font = `800 17px ${BODY}`; g.fillStyle = "#7a3e00"; g.fillText("Graduation Day · そつぎょうび", 0, -14);
      g.font = `800 28px ${FONT}`; g.fillStyle = "#4a1f8a"; g.fillText(dt.en, 0, 20);
      g.restore();
    }

    // the witch and the cat, cheering from the corners
    if (witch) { const h = 480, w = h * witch.width / witch.height; g.drawImage(witch, 64, H - 50 - h, w, h); }
    if (catI) {
      const h = 330, w = h * catI.width / catI.height, x = W - 70 - w, y = H - 56 - h;
      g.drawImage(catI, x, y, w, h);
      cap(g, x + w * 0.63, y + h * 0.03, 118, 0.24);
    }
    // sparkle confetti in the top corners
    for (let i = 0; i < 18; i++) {
      const side = i % 3 ? 1 : -1, x = W / 2 + side * (420 + R() * 260), y = side > 0 ? py + 70 + R() * 200 : py + 66 + R() * 40;
      g.fillStyle = RAINBOW[i % 6]; g.strokeStyle = "#12061c"; g.lineWidth = 2;
      starPath(g, x, y, 8 + R() * 8, 3.5, i % 3 ? 4 : 5, R()); g.fill(); g.stroke();
    }
    return cv;
  }

  // =====================================================================
  // certificate modal
  // =====================================================================
  let drawTok = 0, onCertClose = null;
  function ensureCertModal() {
    if ($("cert-modal")) return;
    const m = document.createElement("div");
    m.id = "cert-modal"; m.className = "modal cert-modal"; m.hidden = true;
    m.innerHTML = `<div class="modal-card cert-card" role="dialog" aria-label="Certificate">
      <div class="cert-head">
        <h2 class="cert-title">🎓 Your Certificate! <small>しょうじょう</small></h2>
        <button type="button" class="book-x" id="cert-x" aria-label="Close">✕</button>
      </div>
      <div class="cert-frame"><canvas id="cert-cv" width="1600" height="1131" aria-label="Certificate of Magic: English Master"></canvas></div>
      <div class="cert-row">
        <label class="cert-name">Your name <small>なまえ</small>
          <input id="cert-name" type="text" maxlength="24" autocomplete="off" spellcheck="false" placeholder="Type your name">
        </label>
        <button type="button" class="btn btn-play cert-save" id="cert-save"><span>Save it!<small>ほぞんする</small></span></button>
      </div>
    </div>`;
    document.body.appendChild(m);
    const close = () => {
      m.hidden = true; AudioFx.click();
      typedName = ""; $("cert-name").value = "";   // forget the name as soon as it closes
      const f = onCertClose; onCertClose = null; if (f) f();
    };
    $("cert-x").onclick = close;
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") { typedName = ""; $("cert-name").value = ""; }
      if (e.key === "Escape" && onCertClose) { const f = onCertClose; onCertClose = null; m.hidden = true; f(); } });
    m.addEventListener("pointerdown", (e) => { if (e.target === m) { e.stopPropagation(); close(); } });
    let raf = 0;
    $("cert-name").addEventListener("input", () => {
      typedName = $("cert-name").value;
      cancelAnimationFrame(raf); raf = requestAnimationFrame(renderCert);
    });
    $("cert-name").addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") e.target.blur(); });
    $("cert-save").onclick = async () => {
      AudioFx.click();
      const cv = await composeCertificate(typedName);
      const blob = await new Promise((r) => cv.toBlob(r, "image/png"));
      const a = document.createElement("a");
      const nm = (typedName || "").trim().replace(/[^\w\- ]+/g, "").replace(/\s+/g, "-");
      a.href = URL.createObjectURL(blob); a.download = `english-master-certificate${nm ? "-" + nm : ""}.png`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      AudioFx.sparkle();
      const t = $("toast"); if (t) { t.textContent = "Saved! ほぞんしたよ！"; t.classList.add("is-on"); setTimeout(() => t.classList.remove("is-on"), 2200); }
    };
  }
  async function renderCert() {
    const tok = ++drawTok;
    const base = await certBase();
    if (tok !== drawTok) return;
    const cv = $("cert-cv");
    cv.classList.remove("is-loading");
    composeCertificate(typedName, cv);
  }
  function openCertificate(onClose) {
    ensureCertModal();
    record();
    onCertClose = onClose || null;
    typedName = ""; $("cert-name").value = "";
    if (!$("cert-cv").dataset.drawn) $("cert-cv").classList.add("is-loading");
    $("cert-cv").dataset.drawn = "1";
    $("cert-modal").hidden = false;
    AudioFx.page();
    return renderCert();
  }

  // =====================================================================
  // the ceremony
  // =====================================================================
  const CAP_SVG = `<svg viewBox="-60 -40 120 90" aria-hidden="true"><path d="M-30 0v20q30 18 60 0V0z" fill="#2b1546" stroke="#12061c" stroke-width="5" stroke-linejoin="round"/><path d="M0-26L50 0 0 22-50 0z" fill="#3a1f63" stroke="#12061c" stroke-width="5" stroke-linejoin="round"/><path d="M0 0q36 2 40 28" fill="none" stroke="#ffc83a" stroke-width="4"/><ellipse cx="40" cy="32" rx="5" ry="9" fill="#ffc83a" stroke="#12061c" stroke-width="2.5"/></svg>`;
  let running = false, fx = null, fwTimer = 0;

  function build() {
    let L = $("grad-layer");
    if (L) return L;
    L = document.createElement("div");
    L.id = "grad-layer"; L.className = "grad"; L.hidden = true;
    L.innerHTML = `
      <div class="grad-swirl"></div>
      <div class="grad-rays"></div>
      <canvas class="grad-fx"></canvas>
      <div class="grad-intro">Something magical is happening…<small>なにか すごい ことが…！</small></div>
      <img class="grad-witch" src="${ART.witch}" onerror="this.onerror=null;this.src='${ART.witch0}'" alt="">
      <img class="grad-cat" src="${ART.cat}" onerror="this.onerror=null;this.src='${ART.cat0}'" alt="">
      <div class="grad-stage">
        <div class="grad-potion"><img src="${ART.potion}" alt="Potion of Knowledge"></div>
        <h1 class="grad-title">YOU DID IT!<small>やったね！</small></h1>
        <div class="grad-name">The Potion of Knowledge<small>ちしきの ポーション</small></div>
        <div class="grad-stars"><i>★</i><i>★</i><i>★</i></div>
        <div class="grad-msg">You are an <b>English Master!</b><br>You graduated from Magic School!<small>えいご マスター！ まほうがっこうを そつぎょう！</small></div>
        <button type="button" class="btn btn-play grad-btn"><span>🎓 Get your certificate!<small>しょうじょうを もらおう</small></span></button>
      </div>
      <div class="grad-caps"></div>
      <div class="grad-flash"></div>`;
    document.body.appendChild(L);
    fx = new FxCanvas(L.querySelector(".grad-fx"));
    fx.fx.max = 220;
    return L;
  }
  function firework(x, y, big) {
    if (!fx) return;
    const n = big ? 40 : 26, col = RAINBOW[(Math.random() * 6) | 0], col2 = RAINBOW[(Math.random() * 7) | 0];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.2, sp = (big ? 260 : 190) * (0.75 + Math.random() * 0.5);
      fx.spawn({ shape: i % 3 ? "glow" : "star4", color: i % 2 ? col : col2, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 160, drag: 1.4, life: 1.1 + Math.random() * 0.6, size: big ? 9 : 7, s1: 0.3, add: true, vr: 4 });
    }
    fx.spawn({ shape: "glow", color: "#ffffff", x, y, life: 0.35, size: big ? 90 : 60, s1: 1.6, add: true });
    AudioFx.firework();
  }
  function tossCaps(L) {
    const box = L.querySelector(".grad-caps"); box.innerHTML = "";
    for (let i = 0; i < 9; i++) {
      const c = document.createElement("span");
      c.className = "grad-cap"; c.innerHTML = CAP_SVG;
      c.style.left = (8 + i * 10.5 + Math.random() * 4) + "%";
      c.style.setProperty("--d", (0.15 * i + Math.random() * 0.3).toFixed(2) + "s");
      c.style.setProperty("--h", (-48 - Math.random() * 30).toFixed(0) + "vh");
      c.style.setProperty("--r", ((Math.random() < 0.5 ? -1 : 1) * (360 + Math.random() * 360)).toFixed(0) + "deg");
      c.style.setProperty("--x", ((Math.random() - 0.5) * 18).toFixed(1) + "vw");
      box.appendChild(c);
    }
  }

  // phases are classes on the layer; CSS does the motion
  async function play(opts) {
    opts = opts || {};
    if (running) return;
    running = true;
    record();
    const L = build();
    L.className = "grad"; L.hidden = false; void L.offsetWidth;
    fx.resize(); fx.start();
    AudioFx.duckMusic(true);
    // no skipping: it only happens once per student, so it always plays in full
    const step = (ms) => wait(ms);

    L.classList.add("p0");                                  // darkness and a swirling rainbow
    AudioFx.drumroll(2.2);
    await step(500); L.classList.add("p1");                 // "something magical…"
    for (let i = 0; i < 10; i++) {               // sparkles rushing into the centre
      const r = fx.canvas.getBoundingClientRect();
      for (let k = 0; k < 6; k++) {
        const a = Math.random() * Math.PI * 2, d = Math.max(r.width, r.height) * 0.6;
        fx.spawn({ shape: "star4", color: RAINBOW[(Math.random() * 7) | 0], x: r.width / 2 + Math.cos(a) * d, y: r.height / 2 + Math.sin(a) * d, vx: -Math.cos(a) * d * 1.3, vy: -Math.sin(a) * d * 1.3, life: 0.75, size: 6 + Math.random() * 6, add: true, fade: "inout", vr: 6 });
      }
      await step(170);
    }
    L.classList.add("p2");                                  // flash! the potion appears
    AudioFx.graduate();
    { const r = fx.canvas.getBoundingClientRect(); firework(r.width / 2, r.height * 0.3, true); }
    await step(900); L.classList.add("p3");                 // YOU DID IT!
    await step(800); L.classList.add("p4");                 // name + stars stamp in
    for (let i = 0; i < 3; i++) { await step(260); AudioFx.stamp(); }
    await step(300); L.classList.add("p5");                 // witch + cat cheer, caps fly
    tossCaps(L); AudioFx.meow();
    let fwN = 0;
    clearInterval(fwTimer);
    fwTimer = setInterval(() => {
      if (!running) { clearInterval(fwTimer); return; }
      const r = fx.canvas.getBoundingClientRect();
      if (fwN++ < 14 || Math.random() < 0.35) firework(r.width * (0.12 + Math.random() * 0.76), r.height * (0.12 + Math.random() * 0.35), fwN % 4 === 0);
    }, 620);
    await step(900); L.classList.add("p6");                 // English Master!
    setTimeout(certBase, 60);                                // draw the certificate now, so it opens instantly
    await step(900); L.classList.add("p7");                 // certificate button

    await new Promise((res) => {
      L.querySelector(".grad-btn").onclick = () => {
        AudioFx.select();
        clearInterval(fwTimer); fx.stop();                 // nothing animates behind the certificate
        L.classList.add("is-paused");
        openCertificate(res);
      };
    });
    // certificate closed: the ceremony fades away
    L.classList.add("is-out");
    AudioFx.duckMusic(false);
    await wait(650);
    clearInterval(fwTimer); fx.stop(); L.hidden = true; L.className = "grad";
    running = false;
    if (opts.onDone) opts.onDone();
  }

  global.Graduation = { play, openCertificate, prewarm: () => { record(); return certBase(); }, drawCertificate, composeCertificate, get running() { return running; } };
})(window);
