/* Witch's Soup — game flow.
   title → brew (pick ingredients + countries → stir → shake → reveal) → presentation */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const UNLOCK_KEY = "unlocked-potions";
  const MUTE_KEY = "witchsoup-muted";
  const MAX_PICKS = 3;
  const STIR_TARGET = 21;            // radians of stirring (about 3.3 laps)
  const SHAKE_WORDS = ["First", "Second", "Third", "Fourth"];

  const state = {
    picks: [], incoming: 0, filter: "ALL", pending: null,
    mode: "pick", result: null, unlocked: [], presenting: false, presentToken: 0,
    screen: "title", stirDone: false
  };

  // ---------- storage ----------
  function loadUnlocked() {
    try {
      const raw = JSON.parse(localStorage.getItem(UNLOCK_KEY) || "[]");
      state.unlocked = Array.isArray(raw) ? raw.map(Number).filter((n) => POTION_BY_ID[n]) : [];
    } catch (e) { state.unlocked = []; }
  }
  function saveUnlocked() { try { localStorage.setItem(UNLOCK_KEY, JSON.stringify(state.unlocked)); } catch (e) { /* ignore */ } }
  function updateBookCount() {
    const n = state.unlocked.filter((id) => !POTION_BY_ID[id].isSecret).length;
    const total = REGULAR_POTIONS.length;
    $("book-count").textContent = n + "/" + total;
  }

  // ---------- small helpers ----------
  const letterColor = (letter) => {
    const i = letter.charCodeAt(0) - 65;
    return `hsl(${(i * 47) % 360} 78% 52%)`;
  };
  function toast(msg, ms) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.add("is-on");
    clearTimeout(toast.t);
    toast.t = setTimeout(() => t.classList.remove("is-on"), ms || 2200);
  }
  // The witch and cat live inside the cauldron canvas now; "setCat" just tells that scene how to react.
  function setCat(key, mood) {
    const c = cauldrons[key];
    if (c && mood === "wow") c.react("wow", 1.4);
  }
  function setWitch(pose) {
    const c = cauldrons.pot;
    if (c && pose === "laugh") c.react("laugh", 6);
    if (c && pose === "flourish") c.react("wow", 1.2);
  }
  function initWitch() {}

  // The stage (witch + pot + cat) is one canvas; in the pick screen it is scaled so the whole
  // scene fits beside the pantry instead of being cropped by it.
  function fitStage() {
    const wrap = $("pot-wrap"); if (!wrap) return;
    const w = innerWidth, h = innerHeight;
    const portrait = w / h < 1;
    let k = 1;
    if (!portrait) {
      const pw = $("pantry").offsetWidth || 0;
      const sFull = Math.min(w / 1500, h / 900);
      k = Math.min(1, (w - pw - 24) / (1400 * sFull));
    }
    wrap.style.setProperty("--pick-k", k.toFixed(3));
  }
  function placeBubble() {
    const c = cauldrons.pot, b = $("brew-say");
    if (state.screen !== "brew") return;
    requestAnimationFrame(placeBubble);
    if (!c || !c.layers || !b.classList.contains("is-on")) return;
    const g = CauldronGeometry;
    const p = c.toClient(g.CAT.x + g.CAT.w * 0.5, g.CAT.y + g.CAT.h * 0.08);
    const bw = b.offsetWidth, bh = b.offsetHeight;
    const portrait = innerWidth / innerHeight < 1;
    const limit = (state.mode === "pick" && !portrait ? innerWidth - $("pantry").offsetWidth : innerWidth) - 10;
    const x = Math.max(10, Math.min(limit - bw, p.x - bw * 0.7));
    b.style.left = x + "px"; b.style.top = Math.max(64, p.y - bh - 20) + "px"; b.style.bottom = "auto";
    b.style.setProperty("--tail", Math.max(14, Math.min(bw - 30, p.x - x)) + "px");
  }
  let sayTimer = 0;
  function say(en, ja, ms) {
    const b = $("brew-say");
    if (!en) { b.classList.remove("is-on"); return; }
    b.innerHTML = `<b>${en}</b>${ja ? `<small>${ja}</small>` : ""}`;
    b.classList.add("is-on");
    clearTimeout(sayTimer);
    sayTimer = setTimeout(() => b.classList.remove("is-on"), ms || 3800);
  }
  const tagChip = (tag) => `<span class="tag-chip" style="--c:${TAGS[tag].color}">${TAGS[tag].emoji}</span>`;
  function ordinalName(i) { return SHAKE_WORDS[i] || "Next"; }

  // speech ------------------------------------------------------
  function speak(text, lang) {
    return new Promise((resolve) => {
      if (AudioFx.muted || !("speechSynthesis" in window)) { setTimeout(resolve, Math.min(2600, 380 + text.length * 55)); return; }
      try {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = lang || "en-US"; u.rate = 0.92; u.pitch = 1.12;
        let done = false;
        const fin = () => { if (!done) { done = true; resolve(); } };
        u.onend = fin; u.onerror = fin;
        window.speechSynthesis.speak(u);
        setTimeout(fin, 7000);
      } catch (e) { resolve(); }
    });
  }
  function stopSpeech() { try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) { /* ignore */ } }

  // fireflies -------------------------------------------------------
  (function fireflies() {
    const host = $("fireflies");
    for (let i = 0; i < 22; i++) {
      const s = document.createElement("i");
      s.style.left = Math.random() * 100 + "%";
      s.style.top = Math.random() * 100 + "%";
      s.style.setProperty("--d", 6 + Math.random() * 8 + "s");
      s.style.setProperty("--dl", -Math.random() * 10 + "s");
      s.style.setProperty("--s", 3 + Math.random() * 5 + "px");
      s.style.setProperty("--dx", (Math.random() - 0.5) * 120 + "px");
      host.appendChild(s);
    }
  })();

  // =====================================================================
  // screens
  // =====================================================================
  const cauldrons = { title: null, pot: null, result: null };
  let titleTimer = 0;
  let shakeFx = null, revealFx = null;

  function showScreen(name) {
    stopSpeech();
    state.presenting = false; state.presentToken++;
    state.screen = name;
    document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("is-active", s.id === "screen-" + name));
    $("game").dataset.screen = name;
    Object.keys(cauldrons).forEach((k) => { if (cauldrons[k] && k !== (name === "brew" ? "pot" : name)) cauldrons[k].stop(); });
    clearInterval(titleTimer);
    if (name === "title") enterTitle();
    if (name === "brew") enterBrew();
    if (name === "result") enterResult();
    if (name !== "brew") { AudioFx.setBoil(0.25); }
  }

  // ---------- title ----------
  function enterTitle() {
    if (!cauldrons.title) {
      cauldrons.title = new Cauldron($("title-canvas"), { showcase: true, idleStir: true, letters: false, fit: "bottom" });
      cauldrons.title.onSplash = (p) => { if (Math.random() < 0.6) AudioFx.splash(p * 0.6); };
      cauldrons.title.onPop = (s) => AudioFx.plop(s);
      cauldrons.title.onThunder = () => AudioFx.thunder();
      initWitch();
    }
    const c = cauldrons.title;
    c.resize(); c.start();
    const colors = POTIONS.filter((p) => !p.isSecret).map((p) => p.color);
    let i = 0;
    const cycle = () => {
      const col = colors[(i++ * 5) % colors.length];
      c.colT = hexToRgb(col);
      c.tags = {};
      const tag = POTIONS.find((p) => p.color === col && p.tag);
      if (tag && tag.tag) c.tags[tag.tag] = 0.7;
      c.boil = 0.55;
    };
    cycle();
    titleTimer = setInterval(cycle, 4200);
    AudioFx.setBoil(0.4);
  }

  // ---------- brew: pantry ----------
  function buildLetterTabs() {
    const host = $("letter-tabs");
    host.innerHTML = "";
    ["ALL"].concat(LETTERS).forEach((l) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "letter-tab" + (state.filter === l ? " is-active" : "");
      b.dataset.letter = l; b.setAttribute("role", "tab");
      b.textContent = l === "ALL" ? "★" : l;
      if (l !== "ALL") b.style.setProperty("--lc", letterColor(l));
      host.appendChild(b);
    });
  }
  function buildIngredientGrid() {
    const host = $("ing-grid");
    host.innerHTML = "";
    const list = INGREDIENTS.filter((i) => state.filter === "ALL" || i.letter === state.filter);
    const frag = document.createDocumentFragment();
    list.forEach((ing) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "ing-tile"; b.dataset.id = ing.id;
      b.style.setProperty("--lc", letterColor(ing.letter));
      b.innerHTML = `<span class="ing-letter">${ing.letter}</span>
        <span class="ing-tags">${tagChip(ing.primary)}${tagChip(ing.secondary)}</span>
        <img src="${ing.image}" alt="" draggable="false" loading="lazy" decoding="async">
        <span class="ing-name">${ing.name}</span><span class="ing-ja">${ing.nameJa}</span>`;
      frag.appendChild(b);
    });
    host.appendChild(frag);
    host.parentElement.scrollTop = 0;
  }
  function renderSlots() {
    const host = $("slots");
    host.innerHTML = "";
    for (let i = 0; i < MAX_PICKS; i++) {
      const p = state.picks[i];
      const b = document.createElement("button");
      b.type = "button"; b.className = "slot" + (p ? " is-filled" : "") + (i === state.picks.length + state.incoming ? " is-next" : "");
      b.dataset.i = i; b.setAttribute("role", "listitem");
      if (p) {
        b.style.setProperty("--lc", letterColor(p.ingredient.letter));
        b.setAttribute("aria-label", "Remove " + p.ingredient.name);
        b.innerHTML = `<img class="slot-img" src="${p.ingredient.image}" alt=""><span class="slot-letter">${p.ingredient.letter}</span>${Art.flag(p.country.code)}<span class="slot-x">✕</span>`;
      } else {
        b.disabled = true;
        b.innerHTML = `<span class="slot-q">${i + 1}</span>`;
      }
      host.appendChild(b);
    }
  }
  function renderOracle() {
    const color = mixLiquidColor(state.picks);
    $("oracle-bottle").innerHTML = Art.bottle(color, { fill: state.picks.length ? 0.55 + state.picks.length * 0.1 : 0.45 });
    const { score } = scorePowers(state.picks);
    const rows = Object.keys(score).sort((a, b) => score[b] - score[a]).slice(0, 3);
    const host = $("oracle-bars");
    if (!rows.length) {
      host.innerHTML = `<div class="oracle-empty">Add ingredients to see<br>what the pot is thinking…<small>ざいりょうを いれてみよう</small></div>`;
    } else {
      const max = Math.max(6, score[rows[0]]);
      host.innerHTML = rows.map((t, i) => `<div class="obar ${i === 0 ? "top" : ""}"><span class="obar-ico">${TAGS[t].emoji}</span><span class="obar-name">${TAGS[t].name}<small>${TAGS[t].nameJa}</small></span><span class="obar-track"><i style="width:${Math.round(score[t] / max * 100)}%;background:${TAGS[t].color}"></i></span></div>`).join("");
    }
    const left = MAX_PICKS - state.picks.length;
    $("btn-brew").disabled = left > 0 || state.incoming > 0;
    $("brew-sub").textContent = left > 0 ? "あと " + left : "Ready!";
    $("btn-brew").classList.toggle("is-ready", left === 0);
  }
  function syncBrewUi() { renderSlots(); renderOracle(); }

  // ---------- brew: choosing ----------
  function pickIngredient(id, fromEl) {
    if (state.mode !== "pick") return;
    const ing = INGREDIENT_BY_ID[id];
    if (!ing) return;
    if (state.picks.length + state.incoming >= MAX_PICKS) {
      AudioFx.nope();
      $("slots").classList.remove("wiggle"); void $("slots").offsetWidth; $("slots").classList.add("wiggle");
      say("The pot is full!", "いっぱいだよ！ ✕で とりだせるよ", 3000);
      return;
    }
    AudioFx.select();
    state.pending = { ing, from: fromEl ? fromEl.getBoundingClientRect() : null };
    openCountry(ing);
  }
  function openCountry(ing) {
    $("country-hero").innerHTML = `<img src="${ing.image}" alt=""><b>${ing.name}</b><small>${ing.nameJa}</small>
      <span class="ing-tags">${tagChip(ing.primary)}${tagChip(ing.secondary)}</span>`;
    const tabs = $("continent-tabs");
    tabs.innerHTML = "";
    [{ id: "all", name: "All", nameJa: "ぜんぶ" }].concat(CONTINENTS).forEach((c, i) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "ctab" + (i === 0 ? " is-active" : ""); b.dataset.c = c.id;
      b.innerHTML = `${c.name}<small>${c.nameJa}</small>`;
      tabs.appendChild(b);
    });
    renderCountries("all");
    $("country-modal").hidden = false;
    $("country-grid").scrollTop = 0;
  }
  function renderCountries(cid) {
    const host = $("country-grid");
    host.innerHTML = COUNTRY_LIST.filter((c) => cid === "all" || c.continent === cid).map((c) =>
      `<button type="button" class="country-btn" data-id="${c.id}">${Art.flag(c.code)}<b>${c.name}</b><small>${c.nameJa}</small></button>`).join("");
  }
  function closeCountry() { $("country-modal").hidden = true; }

  function chooseCountry(cid) {
    const pend = state.pending;
    if (!pend) return;
    const country = COUNTRY_BY_ID[cid];
    state.pending = null;
    closeCountry();
    AudioFx.country();
    dropIntoPot(pend.ing, country, pend.from);
  }
  function potDropClient() {
    const c = cauldrons.pot;
    const r = $("pot-canvas").getBoundingClientRect();
    const d = c.toClient(500, 150);
    return { x: d.x, y: Math.max(r.top + 30, d.y) };
  }
  function dropIntoPot(ing, country, fromRect) {
    state.incoming++;
    renderSlots();
    const target = potDropClient();
    const sx = fromRect ? fromRect.left + fromRect.width / 2 : window.innerWidth * 0.75;
    const sy = fromRect ? fromRect.top + fromRect.height / 2 : window.innerHeight * 0.6;
    const img = document.createElement("img");
    img.className = "fly"; img.src = ing.image; img.alt = "";
    $("fly-layer").appendChild(img);
    const size = 96;
    img.style.cssText = `left:${-size / 2}px;top:${-size / 2}px;width:${size}px;height:${size}px`;
    AudioFx.whoosh();
    const midY = Math.min(sy, target.y) - 120;
    const anim = img.animate([
      { transform: `translate(${sx}px,${sy}px) scale(.7) rotate(0deg)`, opacity: 1 },
      { offset: 0.5, transform: `translate(${(sx + target.x) / 2}px,${midY}px) scale(1.25) rotate(160deg)`, opacity: 1 },
      { transform: `translate(${target.x}px,${target.y}px) scale(1) rotate(360deg)`, opacity: 1 }
    ], { duration: 620, easing: "cubic-bezier(.3,.1,.4,1)" });
    anim.onfinish = () => {
      img.remove();
      const pick = { ingredient: ing, country, letterColor: letterColor(ing.letter) };
      state.incoming--;
      state.picks.push(pick);
      const d = cauldrons.pot.toDesign(target.x, target.y);
      cauldrons.pot.addPick(pick, { x: d.x, y: d.y });
      AudioFx.setBoil(0.25 + state.picks.length * 0.12);
      syncBrewUi();
      reactToPick(pick);
    };
  }
  function reactToPick(pick) {
    const lines = {
      fire: ["Hot hot hot! 🔥", "あつあつ！"], water: ["Splish splash! 💧", "ばしゃばしゃ！"], ice: ["Brrr, so cold! ❄️", "ひんやり！"],
      earth: ["Rumble rumble! ⛰️", "ごろごろ！"], wind: ["Whoosh! 🌀", "ぴゅ〜！"], thunder: ["Zap zap! ⚡", "ビリビリ！"],
      light: ["So shiny! ✨", "ピカピカ！"], dark: ["Ooooh, spooky! 🦇", "ぞぞぞ…"], life: ["It's growing! 🌱", "にょきにょき！"],
      heal: ["So gentle… 💗", "やさしいね"], magic: ["Sparkly magic! 🔮", "キラキラ！"], psychic: ["I see everything! 👁️", "みえるよ！"],
      luck: ["Lucky! 🍀", "ラッキー！"], sleep: ["Zzz… so sleepy 😴", "ねむい…"], speed: ["Zoom zoom! 💨", "びゅん！"],
      strong: ["Super strong! 💪", "ちからもち！"], shield: ["Clang! Protected! 🛡️", "まもるよ！"]
    };
    const l = lines[pick.ingredient.primary];
    setCat("pot", "wow");
    setTimeout(() => setCat("pot", "happy"), 1400);
    if (state.picks.length >= MAX_PICKS) say("Ready to brew! Press the button!", "じゅんび OK！ ボタンをおしてね", 4800);
    else if (l) say(l[0], l[1], 2600);
  }
  function removePick(i) {
    if (state.mode !== "pick" || !state.picks[i]) return;
    AudioFx.plop(18);
    state.picks.splice(i, 1);
    cauldrons.pot.removePick(i);
    AudioFx.setBoil(0.25 + state.picks.length * 0.12);
    syncBrewUi();
  }
  async function clearPot() {
    if (state.mode !== "pick" || !state.picks.length) return;
    AudioFx.page();
    while (state.picks.length) { removePick(state.picks.length - 1); await wait(110); }
  }
  async function surprise() {
    if (state.mode !== "pick") return;
    AudioFx.select();
    const btn = $("btn-random");
    while (state.picks.length + state.incoming < MAX_PICKS) {
      const ing = INGREDIENTS[(Math.random() * INGREDIENTS.length) | 0];
      const country = COUNTRY_LIST[(Math.random() * COUNTRY_LIST.length) | 0];
      dropIntoPot(ing, country, btn.getBoundingClientRect());
      await wait(520);
    }
  }

  // ---------- brew: enter / reset ----------
  function enterBrew() {
    if (!cauldrons.pot) {
      const c = cauldrons.pot = new Cauldron($("pot-canvas"), { letters: false, idleStir: true, fit: "bottom" });
      c.onPop = (s) => AudioFx.plop(s);
      c.onSplash = (p) => AudioFx.splash(p);
      c.onThunder = () => AudioFx.thunder();
      c.onTap = (p, idx) => {
        if (state.mode !== "pick" || idx < 0) return;
        c.jumpItem(idx); AudioFx.splash(0.8);
        const pk = state.picks[idx];
        if (pk) say(pk.ingredient.name + " from " + pk.country.name, pk.ingredient.nameJa, 2600);
      };
      buildLetterTabs(); buildIngredientGrid();
    }
    setMode("pick");
    fitStage(); requestAnimationFrame(placeBubble);
    cauldrons.pot.resize(); cauldrons.pot.start();
    syncBrewUi();
    AudioFx.setBoil(0.25 + state.picks.length * 0.12);
    if (!state.picks.length) say("Pick 3 ingredients for the pot!", "ざいりょうを 3つ えらぼう！", 5200);
  }
  function resetBrew() {
    state.picks = []; state.incoming = 0; state.result = null; state.stirDone = false;
    if (cauldrons.pot) { cauldrons.pot.setPicks([], { instant: true }); cauldrons.pot.resetStir(); cauldrons.pot.colT = hexToRgb(EMPTY_POT_COLOR); }
    state.filter = "ALL";
    if (cauldrons.pot) { buildLetterTabs(); buildIngredientGrid(); }
  }
  function setMode(m) {
    state.mode = m;
    $("screen-brew").dataset.mode = m;
    fitStage();
    if (m === "pick") { cauldrons.pot && (cauldrons.pot.opts.idleStir = true); }
    else if (cauldrons.pot) { cauldrons.pot.opts.idleStir = false; cauldrons.pot.captureAll = false; cauldrons.pot.showHint = false; }
  }


  // =====================================================================
  // stirring
  // =====================================================================
  let stirRaf = 0;
  function startStir() {
    if (state.mode !== "pick" || state.picks.length < MAX_PICKS) return;
    AudioFx.click();
    state.result = brewPotion(state.picks, state.unlocked);
    state.stirDone = false;
    const c = cauldrons.pot;
    c.resetStir();
    c.opts.idleStir = false; c.captureAll = true; c.showHint = true;
    setMode("stir");
    setCat("pot", "stir");
    say("Stir, stir, stir! Make circles with the spoon!", "スプーンで ぐるぐる〜！", 6000);
    $("stir-ui").classList.remove("is-done");
    $("btn-stir-help").hidden = true;
    let lastProgressT = performance.now(), lastTot = 0, swishT = 0, helped = false;
    cancelAnimationFrame(stirRaf);
    const tick = (now) => {
      if (state.mode !== "stir") return;
      stirRaf = requestAnimationFrame(tick);
      const target = helped ? STIR_TARGET : STIR_TARGET;
      const p = clamp(c.stirTotal / target, 0, 1);
      $("stir-ring").style.setProperty("--p", p);
      $("stir-pct").textContent = Math.round(p * 100) + "%";
      c.setBoil(0.4 + p * 0.65);
      c.setHeat(0.9 + p * 0.5);
      c.setGlow(p * 0.8);
      AudioFx.setBoil(0.35 + p * 0.65);
      c.showHint = c.stirTotal < 2.5;
      if (c.stirSpeed > 1.8 && now - swishT > 260) { swishT = now; AudioFx.swish(c.stirSpeed); }
      if (c.stirTotal - lastTot > 0.2) { lastTot = c.stirTotal; lastProgressT = now; }
      if (now - lastProgressT > 7000 && !helped) $("btn-stir-help").hidden = false;
      if (p >= 1 && !state.stirDone) { state.stirDone = true; finishStir(); }
    };
    stirRaf = requestAnimationFrame(tick);
    $("btn-stir-help").onclick = () => { helped = true; c.autoStir(true, 4.4); $("btn-stir-help").hidden = true; };
  }
  async function finishStir() {
    const c = cauldrons.pot;
    c.autoStir(false);
    $("stir-ui").classList.add("is-done");
    setCat("pot", "wow");
    AudioFx.thunder(); AudioFx.sparkle();
    c.burst(state.result ? state.result.potion.color : "#ffffff", 40);
    c.lightning();
    say("It's ready! Look at that!", "できた〜！", 3000);
    await wait(1100);
    c.burst("#ffe27a", 26);
    AudioFx.chime(4); AudioFx.chime(6);
    await wait(700);
    startShake();
  }

  // =====================================================================
  // shaking
  // =====================================================================
  const shake = { p: 0, vx: 0, vy: 0, lx: null, ly: null, rot: 0, ox: 0, oy: 0, raf: 0, snd: 0, popped: false, sparkT: 0 };
  function startShake() {
    setMode("shake");
    if (cauldrons.pot) { cauldrons.pot.captureAll = false; cauldrons.pot.showHint = false; }
    setCat("pot", "happy");
    setWitch("flourish");
    const color = mixLiquidColor(state.picks);
    $("bottle").innerHTML = Art.bottle(color, { fill: 0.78 });
    $("bottle").className = "bottle";
    $("bottle").style.setProperty("--glow", color);
    $("shake-fill").style.width = "0%";
    Object.assign(shake, { p: 0, vx: 0, vy: 0, lx: null, ly: null, rot: 0, ox: 0, oy: 0, popped: false });
    if (!shakeFx) shakeFx = new FxCanvas($("shake-fx"));
    shakeFx.resize(); shakeFx.start();
    AudioFx.whoosh();
    const layer = $("shake-layer");
    layer.classList.remove("is-popped");
    cancelAnimationFrame(shake.raf);
    let last = performance.now();
    const tick = (now) => {
      if (state.mode !== "shake") return;
      shake.raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      // physics-ish wobble: the bottle chases the pointer's push and springs back
      shake.vx *= Math.pow(0.002, dt); shake.vy *= Math.pow(0.002, dt);
      const speed = Math.hypot(shake.vx, shake.vy);
      shake.ox = shake.ox * Math.pow(0.0005, dt) + shake.vx * dt * 0.7;
      shake.oy = shake.oy * Math.pow(0.0005, dt) + shake.vy * dt * 0.7;
      shake.rot = shake.rot * Math.pow(0.0008, dt) + shake.vx * dt * 0.03;
      const lim = 90;
      const jx = clamp(shake.ox, -lim, lim), jy = clamp(shake.oy, -lim * 0.6, lim * 0.6);
      $("bottle").style.transform = `translate(${jx}px,${jy}px) rotate(${clamp(shake.rot, -0.5, 0.5)}rad) scale(${1 + shake.p * 0.12})`;
      $("shake-fill").style.width = Math.round(shake.p * 100) + "%";
      $("bottle").style.setProperty("--shake", shake.p);
      // slosh: fizz inside the bottle
      if (speed > 220 && now - shake.snd > 90) { shake.snd = now; AudioFx.rattle(speed / 400); }
      if (shake.p > 0.02) {
        shake.sparkT -= dt;
        if (shake.sparkT <= 0) {
          shake.sparkT = 0.09 - shake.p * 0.06;
          const r = $("bottle").getBoundingClientRect();
          const col = state.result ? TAG_COLORS[state.result.tag] || state.result.potion.color : "#ffe27a";
          const fr = shakeFx.canvas.getBoundingClientRect();
          shakeFx.spawn({ shape: Math.random() < 0.5 ? "star4" : "glow", color: col, x: r.left - fr.left + r.width * (0.2 + Math.random() * 0.6), y: r.top - fr.top + r.height * (0.15 + Math.random() * 0.2),
            vx: (Math.random() - 0.5) * 240, vy: -80 - Math.random() * 200, g: 260, life: 0.9 + Math.random() * 0.6, size: 6 + Math.random() * 9, add: true, fade: "inout", vr: (Math.random() - 0.5) * 8 });
        }
      }
      if (shake.p >= 1 && !shake.popped) { shake.popped = true; popCork(); }
    };
    shake.raf = requestAnimationFrame(tick);
    say("", "");
  }
  function pushShake(dx, dy, amount) {
    if (state.mode !== "shake" || shake.popped) return;
    shake.vx = clamp(shake.vx + dx * 14, -2400, 2400);
    shake.vy = clamp(shake.vy + dy * 8, -1400, 1400);
    shake.p = clamp(shake.p + amount, 0, 1);
  }
  async function popCork() {
    const layer = $("shake-layer");
    layer.classList.add("is-popped");
    AudioFx.corkPop();
    const r = $("bottle").getBoundingClientRect();
    const fr = shakeFx.canvas.getBoundingClientRect();
    const cx = r.left - fr.left + r.width / 2, cy = r.top - fr.top + r.height * 0.18;
    const col = state.result ? state.result.potion.color : "#ffe27a";
    for (let i = 0; i < 46; i++) {
      const a = Math.random() * Math.PI * 2, sp = 200 + Math.random() * 600;
      shakeFx.spawn({ shape: ["star5", "star4", "glow"][i % 3], color: i % 4 === 0 ? "#ffffff" : col, x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 250, g: 500, life: 1 + Math.random() * 0.9, size: 8 + Math.random() * 14, add: true, fade: "inout", vr: (Math.random() - 0.5) * 10 });
    }
    $("flash").classList.remove("go"); void $("flash").offsetWidth; $("flash").classList.add("go");
    await wait(850);
    showReveal();
  }

  // =====================================================================
  // reveal
  // =====================================================================
  async function showReveal() {
    cancelAnimationFrame(shake.raf);
    const res = state.result;
    const pt = res.potion;
    const isNew = state.unlocked.indexOf(pt.id) === -1;
    if (isNew) { state.unlocked.push(pt.id); saveUnlocked(); updateBookCount(); }
    setMode("reveal");
    setWitch("laugh");
    const layer = $("reveal-layer");
    layer.classList.remove("is-on"); void layer.offsetWidth; layer.classList.add("is-on");
    if (!revealFx) revealFx = new FxCanvas($("reveal-fx"));
    revealFx.resize(); revealFx.start();
    const tagInfo = res.tag ? TAGS[res.tag] : null;
    const extras = [];
    if (res.wordUnlockedSecret) extras.push(`<div class="reveal-extra secret">✨ You spelled <b>${res.word}</b>! The secret potion appears! ✨<small>ひみつのことばが できた！</small></div>`);
    else if (res.wordButLocked) extras.push(`<div class="reveal-extra word">You spelled <b>${res.word}</b>! Collect all ${REGULAR_POTIONS.length} potions to unlock the secret one!<small>ぜんぶのポーションを あつめると…？</small></div>`);
    if (res.worldTraveler) extras.push(`<div class="reveal-extra travel">🌍 World Traveler! ${res.continents.length} continents!<small>せかいを たびしたね</small></div>`);
    $("reveal-card").innerHTML = `
      <div class="reveal-label">You made<small>できたのは…</small></div>
      <div class="reveal-art ${pt.isSecret ? "is-secret" : ""}" style="--pc:${pt.color}">
        <img src="${pt.image}" alt="${pt.nameEn}">
        ${isNew ? '<span class="new-badge">NEW!<small>はっけん</small></span>' : ""}
      </div>
      <h2 class="reveal-name">${pt.nameEn}</h2>
      <div class="reveal-ja">${pt.nameJa}</div>
      ${Art.stars(res.stars)}
      <p class="reveal-desc">${pt.descriptionJa}</p>
      ${tagInfo && pt.tag ? `<div class="reveal-power">Main power: <b style="color:${tagInfo.color}">${tagInfo.emoji} ${tagInfo.name}</b> <small>${tagInfo.nameJa}</small></div>` : pt.id === 18 ? `<div class="reveal-power">Tip: pick ingredients with the same power!<small>おなじ ちからの ざいりょうを あつめよう</small></div>` : ""}
      ${extras.join("")}
      <button id="btn-present" class="btn btn-play btn-present" type="button"><svg class="ico" aria-hidden="true"><use href="#i-play"/></svg><span>Present it!<small>みんなに みせよう</small></span></button>`;
    $("btn-present").onclick = () => { AudioFx.click(); showScreen("result"); };
    pt.isSecret ? AudioFx.secret() : AudioFx.fanfare(res.stars >= 3);
    // glitter rain behind the card
    const col = pt.color;
    let n = 0;
    const rain = setInterval(() => {
      if (state.mode !== "reveal" || n++ > 120) { clearInterval(rain); return; }
      const r = revealFx.canvas.getBoundingClientRect();
      revealFx.spawn({ shape: Math.random() < 0.5 ? "star4" : "star5", color: Math.random() < 0.4 ? "#ffffff" : (Math.random() < 0.5 ? col : "#ffe27a"), x: Math.random() * r.width, y: -10, vx: (Math.random() - 0.5) * 60, vy: 120 + Math.random() * 220, life: 3, size: 5 + Math.random() * 10, vr: (Math.random() - 0.5) * 6, add: true, fade: "inout" });
    }, 55);
    await wait(900);
    speak(pt.nameEn + "!");
  }

  // =====================================================================
  // presentation
  // =====================================================================
  function enterResult() {
    const res = state.result || brewPotion(state.picks, state.unlocked);
    state.result = res;
    const pt = res.potion;
    if (!cauldrons.result) {
      const c = cauldrons.result = new Cauldron($("result-canvas"), { letters: false, idleStir: true, fit: "bottom" });
      c.onPop = (s) => AudioFx.plop(s);
      c.onSplash = (p) => AudioFx.splash(p * 0.7);
      c.onThunder = () => AudioFx.thunder();
      c.onTap = (p, idx) => { if (idx >= 0) presentOne(idx); };
    }
    const c = cauldrons.result;
    c.resize(); c.setPicks([], { instant: true }); c.start(); c.react("laugh", 4);
    c.setBoil(0.7); c.setGlow(0.5);
    setCat("result", "happy");
    $("result-banner").innerHTML = `Your Witch's Soup!<small>あなたの まほうのスープ！</small>`;
    buildBoard();
    setTimeout(() => {
      c.setPicks(state.picks, { instant: false });
      c.setBoil(0.75);
    }, 450);
    setTimeout(() => { confetti(); AudioFx.celebrate(); }, 900);
    AudioFx.setBoil(0.7);
    void pt;
  }
  function buildBoard() {
    const res = state.result, pt = res.potion;
    const letters = state.picks.map((p) => `<span class="lt" style="--lc:${letterColor(p.ingredient.letter)}">${p.ingredient.letter}</span>`).join("");
    const rows = state.picks.map((p, i) => `
      <button type="button" class="brow" data-i="${i}" style="--lc:${letterColor(p.ingredient.letter)}">
        <span class="brow-letter">${p.ingredient.letter}</span>
        <img class="brow-img" src="${p.ingredient.image}" alt="">
        <span class="brow-names"><b>${p.ingredient.name}</b><small>${p.ingredient.nameJa}</small></span>
        <span class="brow-from">${Art.flag(p.country.code)}<span><b>${p.country.name}</b><small>${p.country.nameJa}</small></span></span>
      </button>`).join("");
    $("result-board").innerHTML = `
      <div class="board-head">
        <div class="board-title">Ingredients<small>ざいりょう</small></div>
        <div class="board-word ${res.word ? "is-word" : ""}">${letters}${res.word ? `<span class="word-tag">${res.word}!</span>` : ""}</div>
      </div>
      <div class="board-rows">${rows}</div>
      <button type="button" class="board-potion" id="board-potion" style="--pc:${pt.color}">
        <img src="${pt.image}" alt="">
        <span class="bp-text"><small>Result</small><b>${pt.nameEn}</b><i>${pt.nameJa}</i>${Art.stars(res.stars)}<em>${pt.descriptionJa}</em></span>
      </button>
      <div class="board-actions">
        <button id="btn-present-all" class="btn btn-play btn-present-all" type="button"><svg class="ico" aria-hidden="true"><use href="#i-play"/></svg><span>Present!<small>はっぴょう</small></span></button>
      </div>`;
  }
  function highlightRow(i) {
    document.querySelectorAll(".brow").forEach((r, k) => r.classList.toggle("is-hl", k === i));
    const potion = $("board-potion");
    if (potion) potion.classList.toggle("is-hl", i === "potion");
    cauldrons.result && cauldrons.result.highlightItem(typeof i === "number" ? i : -1);
  }
  async function presentOne(i, token) {
    const p = state.picks[i];
    if (!p) return;
    highlightRow(i);
    cauldrons.result.jumpItem(i);
    AudioFx.chime(i * 2);
    setCat("result", "wow");
    await speak(`${p.ingredient.name}, from ${p.country.name}.`);
    if (token === undefined || token === state.presentToken) setCat("result", "happy");
  }
  async function presentAll() {
    if (state.presenting) { state.presenting = false; state.presentToken++; stopSpeech(); highlightRow(-1); $("btn-present-all").classList.remove("is-busy"); return; }
    state.presenting = true;
    const token = ++state.presentToken;
    const btn = $("btn-present-all");
    btn.classList.add("is-busy");
    const pt = state.result.potion;
    const art = articleFor(pt.nameEn);
    await speak(`Hello everyone! Today I made ${art} ${pt.nameEn}!`);
    for (let i = 0; i < state.picks.length; i++) {
      if (token !== state.presentToken) return;
      await presentOne(i, token);
      await wait(250);
    }
    if (token !== state.presentToken) return;
    highlightRow("potion");
    cauldrons.result.burst(pt.color, 34); AudioFx.sparkle();
    setCat("result", "wow");
    await speak(`Together they make ${art} ${pt.nameEn}!`);
    if (token !== state.presentToken) return;
    if (state.result.word) await speak(`And the first letters spell ${state.result.word.split("").join(", ")}. ${state.result.word}!`);
    if (token !== state.presentToken) return;
    confetti(); AudioFx.celebrate();
    state.presenting = false;
    btn.classList.remove("is-busy");
    highlightRow(-1);
    setCat("result", "happy");
  }
  function confetti() {
    const host = $("confetti");
    host.innerHTML = "";
    const cols = ["#ffe27a", "#ff8fd0", "#8ff7ec", "#c58bff", "#ff9a5a", "#9bff8f"];
    for (let i = 0; i < 70; i++) {
      const s = document.createElement("i");
      s.style.left = Math.random() * 100 + "%";
      s.style.background = cols[i % cols.length];
      s.style.setProperty("--dx", (Math.random() - 0.5) * 220 + "px");
      s.style.setProperty("--r", Math.random() * 900 + "deg");
      s.style.animationDelay = Math.random() * 0.8 + "s";
      s.style.animationDuration = 2.4 + Math.random() * 2 + "s";
      host.appendChild(s);
    }
    setTimeout(() => { host.innerHTML = ""; }, 5600);
  }

  // ---------- save as picture ----------
  const imgCache = {};
  function loadImage(src) {
    if (imgCache[src]) return imgCache[src];
    imgCache[src] = new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
    return imgCache[src];
  }
  function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  async function downloadResultImage() {
    const res = state.result; if (!res) return;
    const pt = res.potion;
    const W = 1600, H = 900;
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const g = cv.getContext("2d");
    const bg = await loadImage("assets/art/hut.webp");
    if (bg) { const k = Math.max(W / bg.width, H / bg.height); g.drawImage(bg, (W - bg.width * k) / 2, (H - bg.height * k) / 2, bg.width * k, bg.height * k); }
    g.fillStyle = "rgba(24,8,48,.72)"; g.fillRect(0, 0, W, H);
    // pot
    const snap = cauldrons.result.snapshot();
    let ph = 880, pw = ph * snap.width / snap.height;
    if (pw > 850) { pw = 850; ph = pw * snap.height / snap.width; }
    g.drawImage(snap, 6, H - ph, pw, ph);
    // title
    g.textAlign = "center"; g.lineJoin = "round";
    g.font = '800 64px "Baloo 2", "Nunito", sans-serif';
    g.strokeStyle = "#12061c"; g.lineWidth = 14; g.strokeText("Witch's Soup!", W / 2, 84);
    g.fillStyle = "#ffe27a"; g.fillText("Witch's Soup!", W / 2, 84);
    // parchment
    const bx = 860, by = 120, bw = 700, bh = 740;
    g.fillStyle = "#12061c"; rr(g, bx + 8, by + 12, bw, bh, 34); g.fill();
    const pg = g.createLinearGradient(0, by, 0, by + bh); pg.addColorStop(0, "#3b1d6e"); pg.addColorStop(1, "#26104a");
    g.fillStyle = pg; rr(g, bx, by, bw, bh, 34); g.fill(); g.strokeStyle = "#12061c"; g.lineWidth = 8; g.stroke();
    // letters
    g.textAlign = "left"; g.fillStyle = "#fff3d2"; g.font = '800 34px "Baloo 2", "Nunito", sans-serif'; g.fillText("Ingredients  ざいりょう", bx + 40, by + 62);
    state.picks.forEach((p, i) => {
      const y = by + 94 + i * 118;
      g.fillStyle = "rgba(255,255,255,.08)"; rr(g, bx + 28, y, bw - 56, 104, 22); g.fill();
      g.fillStyle = letterColor(p.ingredient.letter); rr(g, bx + 40, y + 24, 56, 56, 14); g.fill(); g.strokeStyle = "#12061c"; g.lineWidth = 5; g.stroke();
      g.fillStyle = "#fff"; g.font = '800 40px "Baloo 2", sans-serif'; g.textAlign = "center"; g.fillText(p.ingredient.letter, bx + 68, y + 66); g.textAlign = "left";
      g.fillStyle = "#fff3d2"; g.font = '800 32px "Baloo 2", "Nunito", sans-serif'; g.fillText(p.ingredient.name, bx + 232, y + 46);
      g.fillStyle = "#c9b3ee"; g.font = '700 22px "Nunito", sans-serif'; g.fillText(p.ingredient.nameJa, bx + 232, y + 78);
      g.fillStyle = "#fff3d2"; g.font = '800 26px "Baloo 2", "Nunito", sans-serif'; g.fillText(p.country.name, bx + 500, y + 62);
    });
    const imgs = await Promise.all(state.picks.map((p) => loadImage(p.ingredient.image)));
    const flags = await Promise.all(state.picks.map((p) => loadImage("assets/flags/" + p.country.code + ".svg")));
    state.picks.forEach((p, i) => {
      const y = by + 94 + i * 118;
      if (imgs[i]) g.drawImage(imgs[i], bx + 108, y + 6, 92, 92);
      if (flags[i]) { g.save(); rr(g, bx + 424, y + 34, 60, 40, 8); g.clip(); g.drawImage(flags[i], bx + 424, y + 34, 60, 40); g.restore(); g.strokeStyle = "#12061c"; g.lineWidth = 4; rr(g, bx + 424, y + 34, 60, 40, 8); g.stroke(); }
    });
    // potion
    const py = by + 94 + 3 * 118 + 4;
    g.fillStyle = "rgba(255,255,255,.12)"; rr(g, bx + 28, py, bw - 56, 150, 26); g.fill();
    const potImg = await loadImage(pt.image);
    if (potImg) g.drawImage(potImg, bx + 40, py - 8, 160, 160);
    g.fillStyle = "#fff3d2"; g.font = '800 40px "Baloo 2", "Nunito", sans-serif'; g.fillText(pt.nameEn, bx + 212, py + 56);
    g.fillStyle = "#c9b3ee"; g.font = '800 26px "Nunito", sans-serif'; g.fillText(pt.nameJa, bx + 212, py + 92);
    for (let i = 0; i < 3; i++) {
      g.fillStyle = i < res.stars ? "#ffc83a" : "rgba(255,255,255,.18)"; g.strokeStyle = "#12061c"; g.lineWidth = 3;
      g.beginPath();
      for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 9 : 20; g[k ? "lineTo" : "moveTo"](bx + 230 + i * 48 + Math.cos(a) * r, py + 124 + Math.sin(a) * r); }
      g.closePath(); g.fill(); g.stroke();
    }
    const blob = await new Promise((r) => cv.toBlob(r, "image/png"));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "witch-soup.png";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast("Saved! ほぞんしたよ！");
  }

  // =====================================================================
  // potion book
  // =====================================================================
  function openBook() {
    AudioFx.page();
    const grid = $("book-grid");
    const regular = REGULAR_POTIONS.length;
    const got = state.unlocked.filter((id) => !POTION_BY_ID[id].isSecret).length;
    $("book-count-big").innerHTML = `<b>${got}</b> / ${regular} <small>あつめたよ</small>`;
    grid.innerHTML = POTIONS.map((p) => {
      const has = state.unlocked.indexOf(p.id) !== -1;
      const secretLocked = p.isSecret && !has;
      return `<button type="button" class="book-item ${has ? "is-got" : "is-locked"} ${p.isSecret ? "is-secret" : ""}" data-id="${p.id}" style="--pc:${p.color}">
        <img src="${has ? p.image : "assets/potions/locked-potion.webp"}" alt="">
        <span>${has ? p.nameEn : secretLocked ? "? ? ?" : "?"}</span></button>`;
    }).join("");
    $("book-detail").innerHTML = `<p class="book-hint">Tap a potion to see it!<small>ポーションを タップしてね</small></p>`;
    $("book-modal").hidden = false;
  }
  function bookDetail(id) {
    const p = POTION_BY_ID[id];
    const has = state.unlocked.indexOf(p.id) !== -1;
    if (has) {
      $("book-detail").innerHTML = `<div class="bd"><img src="${p.image}" alt=""><div><b>${p.nameEn}</b><i>${p.nameJa}</i><p>${p.descriptionJa}</p></div></div>`;
      speak(p.nameEn);
    } else {
      const hint = p.isSecret ? "Collect every other potion first… then spell a secret word with the first letters!" : p.tag ? `Hint: use ${TAGS[p.tag].emoji} ${TAGS[p.tag].name} ingredients!` : "Keep brewing to find it!";
      $("book-detail").innerHTML = `<div class="bd"><img src="assets/potions/locked-potion.webp" alt=""><div><b>? ? ?</b><p>${hint}</p></div></div>`;
      AudioFx.nope();
    }
  }

  // =====================================================================
  // events
  // =====================================================================
  function bind() {
    document.addEventListener("pointerdown", () => AudioFx.unlock(), { once: true });
    $("btn-start").onclick = () => { AudioFx.unlock(); AudioFx.startAmbience(); AudioFx.startMusic(); AudioFx.whoosh(); resetBrew(); showScreen("brew"); };
    $("btn-title-book").onclick = openBook;
    $("btn-book").onclick = openBook;
    $("book-close").onclick = () => { $("book-modal").hidden = true; AudioFx.click(); };
    $("book-grid").addEventListener("click", (e) => { const b = e.target.closest(".book-item"); if (b) bookDetail(+b.dataset.id); });
    $("btn-home").onclick = () => {
      AudioFx.click(); cancelAnimationFrame(stirRaf); cancelAnimationFrame(shake.raf);
      if (cauldrons.pot) cauldrons.pot.autoStir(false);
      if (shakeFx) shakeFx.stop(); if (revealFx) revealFx.stop();
      showScreen("title");
    };
    $("btn-again").onclick = () => { AudioFx.click(); resetBrew(); showScreen("brew"); };
    $("btn-print").onclick = () => { AudioFx.click(); downloadResultImage(); };
    $("btn-qr").onclick = () => { AudioFx.click(); $("qr-modal").hidden = false; };
    $("qr-close").onclick = () => { $("qr-modal").hidden = true; };
    $("btn-mute").onclick = () => {
      const m = AudioFx.toggleMute();
      $("btn-mute").classList.toggle("is-muted", m);
      $("btn-mute").querySelector("use").setAttribute("href", m ? "#i-mute" : "#i-sound");
      try { localStorage.setItem(MUTE_KEY, m ? "1" : "0"); } catch (e) { /* ignore */ }
      if (m) stopSpeech();
    };
    document.querySelectorAll(".modal").forEach((m) => m.addEventListener("pointerdown", (e) => { if (e.target === m && m.id !== "country-modal") m.hidden = true; }));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { document.querySelectorAll(".modal").forEach((m) => { m.hidden = true; }); state.pending = null; }
      if ((e.key === " " || e.key === "Enter") && state.mode === "shake" && state.screen === "brew") { e.preventDefault(); pushShake((Math.random() - 0.5) * 60, (Math.random() - 0.5) * 20, 0.05); AudioFx.rattle(1.5); }
    });

    // pantry
    $("letter-tabs").addEventListener("click", (e) => {
      const b = e.target.closest(".letter-tab"); if (!b) return;
      AudioFx.click(); state.filter = b.dataset.letter; buildLetterTabs(); buildIngredientGrid();
    });
    $("ing-grid").addEventListener("click", (e) => { const t = e.target.closest(".ing-tile"); if (t) pickIngredient(t.dataset.id, t); });
    $("slots").addEventListener("click", (e) => { const s = e.target.closest(".slot.is-filled"); if (s) removePick(+s.dataset.i); });
    $("btn-clear").onclick = clearPot;
    $("btn-random").onclick = surprise;
    $("btn-brew").onclick = startStir;

    // country modal
    $("country-cancel").onclick = () => { AudioFx.click(); state.pending = null; closeCountry(); };
    $("continent-tabs").addEventListener("click", (e) => {
      const b = e.target.closest(".ctab"); if (!b) return;
      AudioFx.click();
      document.querySelectorAll(".ctab").forEach((x) => x.classList.toggle("is-active", x === b));
      renderCountries(b.dataset.c); $("country-grid").scrollTop = 0;
    });
    $("country-grid").addEventListener("click", (e) => { const b = e.target.closest(".country-btn"); if (b) chooseCountry(b.dataset.id); });

    // shaking
    const layer = $("shake-layer");
    layer.addEventListener("pointermove", (e) => {
      if (shake.lx !== null) {
        const dx = e.clientX - shake.lx, dy = e.clientY - shake.ly;
        const d = Math.hypot(dx, dy);
        if (e.pointerType === "mouse" || e.buttons) pushShake(dx, dy, Math.min(d, 90) * 0.00085);
      }
      shake.lx = e.clientX; shake.ly = e.clientY;
    });
    layer.addEventListener("pointerdown", (e) => { shake.lx = e.clientX; shake.ly = e.clientY; try { layer.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } });
    layer.addEventListener("pointerleave", () => { shake.lx = null; shake.ly = null; });
    $("btn-shake").addEventListener("pointerdown", (e) => { e.stopPropagation(); });
    $("btn-shake").onclick = () => { pushShake((Math.random() < 0.5 ? -1 : 1) * 70, (Math.random() - 0.5) * 30, 0.075); AudioFx.rattle(2); };
    if (window.DeviceMotionEvent) {
      window.addEventListener("devicemotion", (e) => {
        if (state.mode !== "shake") return;
        const a = e.accelerationIncludingGravity; if (!a) return;
        const m = Math.abs(a.x || 0) + Math.abs(a.y || 0) + Math.abs(a.z || 0);
        if (m > 28) pushShake((a.x || 0) * 3, (a.y || 0) * 2, Math.min(0.06, (m - 28) * 0.002));
      });
    }

    // presentation
    $("result-board").addEventListener("click", (e) => {
      const row = e.target.closest(".brow");
      if (row) { state.presentToken++; state.presenting = false; presentOne(+row.dataset.i); return; }
      if (e.target.closest("#btn-present-all")) { AudioFx.click(); presentAll(); return; }
      if (e.target.closest("#board-potion")) {
        const pt = state.result.potion;
        highlightRow("potion"); cauldrons.result.burst(pt.color, 24); AudioFx.sparkle();
        speak(`${pt.nameEn}!`);
      }
    });
  }

  // =====================================================================
  function init() {
    loadUnlocked(); updateBookCount();
    try { if (localStorage.getItem(MUTE_KEY) === "1") { AudioFx.muted = true; $("btn-mute").classList.add("is-muted"); $("btn-mute").querySelector("use").setAttribute("href", "#i-mute"); } } catch (e) { /* ignore */ }
    bind();
    addEventListener("resize", fitStage);
    // wait for the painted sprites so nothing pops in (or flashes) after the first frame
    document.getElementById("game").classList.add("is-loading");
    Cauldron.preload().then(() => { document.getElementById("game").classList.remove("is-loading"); showScreen("title"); });
    if (/[?&]dev\b/.test(location.search)) {
      window.TC = {
        state, showScreen, cauldrons, resetBrew, setMode, startStir, startShake, showReveal, pushShake, buildBoard,
        add(name, country) {
          const ing = INGREDIENTS.find((i) => i.name.toLowerCase() === name.toLowerCase());
          const c = COUNTRY_BY_ID[country || "japan"];
          const pick = { ingredient: ing, country: c, letterColor: letterColor(ing.letter) };
          state.picks.push(pick);
          if (cauldrons.pot) cauldrons.pot.addPick(pick, null);
          syncBrewUi();
        },
        fill(names) { names.forEach((n, i) => TC.add(n, ["japan", "france", "brazil", "kenya"][i] || "japan")); },
        go(name) { resetBrew(); showScreen("brew"); },
        finish() { state.result = brewPotion(state.picks, state.unlocked); showScreen("result"); },
        stirNow() { cauldrons.pot.stirTotal = STIR_TARGET; },
        openBook, downloadResultImage
      };
    }
  }
  init();
})();
