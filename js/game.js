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
    mode: "pick", result: null, traceToken: 0, unlocked: [], presenting: false, presentToken: 0,
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

  // The stage (hut + witch + pot + cat) is one full-screen canvas per screen. What changes between
  // screens is only the camera: it frames the scene in whatever part of the screen the UI leaves free.
  function viewInsets() {
    const w = innerWidth, h = innerHeight, portrait = w / h < 1;
    const ins = { l: 0, t: 0, r: 0, b: 0 };
    const scr = state.screen;
    if (scr === "title") { const tt = document.querySelector(".title-top"); ins.t = tt ? Math.min(h * 0.5, tt.getBoundingClientRect().bottom + 4) : h * 0.3; ins.b = Math.min(96, h * 0.12); }
    else if (scr === "brew") {
      ins.t = portrait ? 120 : 96;
      if (state.mode === "pick") {
        const r = $("pantry").getBoundingClientRect();
        if (portrait) ins.b = Math.max(0, h - r.top); else ins.r = Math.max(0, w - r.left);
      } else if (state.mode === "stir" && !portrait) ins.r = Math.min(w * 0.22, 300);
    } else if (scr === "result") {
      {
        const b = $("result-board"), lay = b.offsetParent || $("screen-result");
        ins.t = portrait ? 96 : 112;
        if (portrait) ins.b = Math.max(0, h - (lay.offsetTop + b.offsetTop) + 6); else ins.r = Math.max(0, w - (lay.offsetLeft + b.offsetLeft) + 8);
      }
    }
    return ins;
  }
  function applyView(snap) {
    const key = state.screen === "brew" ? "pot" : state.screen;
    const c = cauldrons[key];
    if (c) c.setView(viewInsets(), snap);
  }
  const fitStage = () => applyView(false);
  function placeBubble() {
    const c = cauldrons.pot, b = $("brew-say");
    if (state.screen !== "brew") return;
    requestAnimationFrame(placeBubble);
    if (!c || !c.cam || !b.classList.contains("is-on")) return;
    const g = CauldronGeometry;
    const byWitch = state.sayWho === "witch";
    const p = byWitch ? c.toClient(g.WITCH.x + g.WITCH.w * 0.42, g.WITCH.y + g.WITCH.h * 0.02) : c.toClient(g.CAT.x + g.CAT.w * 0.62, g.CAT.y + g.CAT.h * 0.08);
    const bw = b.offsetWidth, bh = b.offsetHeight;
    const portrait = innerWidth / innerHeight < 1;
    const limit = (state.mode === "pick" && !portrait ? innerWidth - $("pantry").offsetWidth : innerWidth) - 10;
    const x = Math.max(10, Math.min(limit - bw, p.x - bw * (byWitch ? 0.25 : 0.7)));
    b.style.left = x + "px"; b.style.top = Math.max(64, p.y - bh - 20) + "px"; b.style.bottom = "auto";
    b.style.setProperty("--tail", Math.max(14, Math.min(bw - 30, p.x - x)) + "px");
  }
  let sayTimer = 0;
  function say(en, ja, ms, who) {
    const b = $("brew-say");
    state.sayWho = who || "cat";
    if (!en) { b.classList.remove("is-on"); return; }
    b.innerHTML = `<b>${en}</b>${ja ? `<small>${ja}</small>` : ""}`;
    b.classList.add("is-on");
    clearTimeout(sayTimer);
    sayTimer = setTimeout(() => b.classList.remove("is-on"), ms || 3800);
  }
  // tapping the witch or the cat: a hop, a sound and (on the brew screen) something to say
  const CAT_LINES = [["Meow!", "にゃー！"], ["Purr… purr…", "ゴロゴロ…"], ["Meow meow!", "にゃんにゃん！"], ["Is it soup yet?", "スープ まだ？"]];
  const WITCH_LINES = [["Abracadabra!", "アブラカダブラ！"], ["Bubble, bubble!", "ぐつぐつ ぐつぐつ！"], ["Hee hee hee!", "ヒッヒッヒ！"], ["Let's make magic!", "まほうを つくろう！"]];
  let lineN = 0;
  function hookActors(c, key) {
    c.onActor = (who) => {
      if (who === "cat") AudioFx.meow(); else { AudioFx.boing(); AudioFx.sparkle(); }
      if (key === "pot" && state.screen === "brew" && (state.mode === "pick" || state.mode === "stir")) {
        const L = who === "cat" ? CAT_LINES : WITCH_LINES, l = L[lineN++ % L.length];
        say(l[0], l[1], 2200, who);
      }
    };
  }
  const tagChip = (tag) => `<span class="tag-chip" style="--c:${TAGS[tag].color}">${TAGS[tag].emoji}</span>`;
  function ordinalName(i) { return SHAKE_WORDS[i] || "Next"; }


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
      cauldrons.title = new Cauldron($("title-canvas"), { showcase: true, idleStir: true, letters: false });
      cauldrons.title.onSplash = (p) => { if (Math.random() < 0.6) AudioFx.splash(p * 0.6); };
      cauldrons.title.onPop = (s) => AudioFx.plop(s);
      cauldrons.title.onThunder = () => AudioFx.thunder();
      hookActors(cauldrons.title, "title");
      initWitch();
    }
    const c = cauldrons.title;
    c.resize(); applyView(true); c.start(); c.greet(0.7);
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
    if (!host) return;
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
    markUsed();
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
    // with three ingredients in, the stirring circle appears: dragging in the pot starts the brew
    if (cauldrons.pot && state.mode === "pick") cauldrons.pot.showHint = state.picks.length >= MAX_PICKS && !state.incoming;
  }
  const inFlight = new Set();
  function markUsed() {
    const used = new Set(state.picks.map((p) => p.ingredient.id)); inFlight.forEach((id) => used.add(id));
    document.querySelectorAll("#ing-grid .ing-tile").forEach((t) => t.classList.toggle("is-used", used.has(t.dataset.id)));
  }
  function syncBrewUi() { renderSlots(); renderOracle(); markUsed(); }

  // ---------- brew: choosing ----------
  function pickIngredient(id, fromEl) {
    if (state.mode !== "pick") return;
    const ing = INGREDIENT_BY_ID[id];
    if (!ing) return;
    // one of each: the same ingredient can't go in twice
    if (state.picks.some((p) => p.ingredient.id === ing.id) || (state.pending && state.pending.ing.id === ing.id) || inFlight.has(ing.id)) {
      AudioFx.nope();
      if (fromEl) { fromEl.classList.remove("wiggle"); void fromEl.offsetWidth; fromEl.classList.add("wiggle"); }
      say("That's already in the pot! Pick a different one.", "それは もう はいってるよ！ ちがうのを えらぼう！", 3200);
      return;
    }
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
    const d = c.toClient(CauldronGeometry.CX, CauldronGeometry.LIQ.cy - 210);
    return { x: d.x, y: Math.max(r.top + 30, d.y) };
  }
  function dropIntoPot(ing, country, fromRect) {
    state.incoming++; inFlight.add(ing.id); markUsed();
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
      state.incoming--; inFlight.delete(ing.id);
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
    // each ingredient has its own pair of lines: one from the witch, one from the cat; one of them speaks
    const own = typeof REACT !== "undefined" && REACT[pick.ingredient.name];
    const who = Math.random() < 0.5 ? "witch" : "cat";
    const l = own ? own[who === "witch" ? 0 : 1] : lines[pick.ingredient.primary];
    setCat("pot", "wow");
    setTimeout(() => setCat("pot", "happy"), 1400);
    if (l) {
      say(l[0], l[1], 2600, who);
      cauldrons.pot.hop(who, 0.7);
      if (who === "cat") AudioFx.meow();
    }
    if (state.picks.length >= MAX_PICKS) {
      setTimeout(() => { if (state.mode === "pick" && state.picks.length >= MAX_PICKS) say("All in! Stir the pot to brew it!", "ぜんぶ はいった！ ぐるぐる まぜよう！", 6000, "witch"); }, l ? 2800 : 0);
    }
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


  // ---------- brew: enter / reset ----------
  function enterBrew() {
    if (!cauldrons.pot) {
      const c = cauldrons.pot = new Cauldron($("pot-canvas"), { letters: false, idleStir: true });
      c.onPop = (s) => AudioFx.plop(s);
      c.onSplash = (p) => AudioFx.splash(p);
      c.onThunder = () => AudioFx.thunder();
      hookActors(c, "pot");
      // no Brew button: once three ingredients are in, a stir (a real drag, not a tap) starts brewing
      c.onDrag = (moved) => { if (state.mode === "pick" && state.picks.length >= MAX_PICKS && !state.incoming && moved > 18) startStir(); };
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
    cauldrons.pot.resize(); applyView(true); cauldrons.pot.start();
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
    // now and then the brew blows up while it is being stirred (never the first brew, never twice in a row)
    state.brewN = (state.brewN || 0) + 1;
    state.boomAt = null;
    if (state.brewN > 1 && !state.lastBoom && Math.random() < BOOM_CHANCE) state.boomAt = STIR_TARGET * (0.3 + Math.random() * 0.5);
    else state.lastBoom = false;
    const c = cauldrons.pot;
    c.resetStir();
    c.opts.idleStir = false; c.captureAll = true; c.showHint = true;
    setMode("stir");
    setCat("pot", "stir");
    say("Stir, stir, stir! Drag in big circles!", "ドラッグして ぐるぐる〜！", 6000);
    $("stir-ui").classList.remove("is-done", "is-boom");
    $("stir-title").innerHTML = "Stir the pot!<small>ドラッグして ぐるぐる！</small>";
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
      if (state.boomAt && c.stirTotal >= state.boomAt && !state.stirDone) { state.stirDone = true; explodePot(); return; }
      if (p >= 1 && !state.stirDone) { state.stirDone = true; finishStir(); }
    };
    stirRaf = requestAnimationFrame(tick);
    $("btn-stir-help").onclick = () => { helped = true; c.autoStir(true, 4.4); $("btn-stir-help").hidden = true; };
  }
  const BOOM_CHANCE = 0.14;
  const BOOM_KEY = "witchsoup-booms";
  const BOOM_LINES = [
    ["KABOOM! Even the best witches do that! Stir again!", "ドッカーン！ じょうずな まじょでも あるよ！ もういちど まぜよう！", "witch"],
    ["Ha ha! What a big boom! Let's stir it again!", "あはは！ おおきな ばくはつ！ もういちど まぜよう！", "witch"],
    ["Whoa! That was SO cool! Again! Stir again!", "すごーい！ かっこいい！ もういっかい まぜて！", "cat"],
    ["My fur is fluffy now! Hee hee! Stir again!", "けが ふわふわに なった！ もういちど まぜよう！", "cat"]
  ];
  // after the ceremony the witch and cat wear their graduation outfits for good
  function graduated() {
    Cauldron.setGraduated(true);
    setTimeout(() => {
      const c = state.screen === "result" ? cauldrons.result : cauldrons.pot;
      if (c) { c.react("wow", 1.6); c.hop("witch", 1); c.hop("cat", 1); }
      toast("🎓 The witch and cat graduated too! ふたりも そつぎょう！", 3600);
    }, 400);
  }
  function boomCount() { try { return +localStorage.getItem(BOOM_KEY) || 0; } catch (e) { return 0; } }
  function addBoom() { const n = boomCount() + 1; try { localStorage.setItem(BOOM_KEY, String(n)); } catch (e) { /* ignore */ } return n === 1; }
  async function explodePot() {
    const c = cauldrons.pot;
    state.boomAt = null; state.lastBoom = true;
    cancelAnimationFrame(stirRaf);
    c.showHint = false;
    $("stir-ui").classList.add("is-done", "is-boom");
    c.explode(); AudioFx.boom(); AudioFx.setBoil(0.1);
    say("BOOM!!", "ドッカーン！！", 3000, "witch");
    await wait(3000);
    const fade = $("fade-black");
    fade.classList.add("is-on");
    await wait(900);
    c.unblast(); c.fx.list.length = 0; c.setBoil(0.2); c.setHeat(0.8); c.setGlow(0);
    // same three ingredients go straight back in the pot: it was bad luck, not a bad recipe
    state.result = null; state.stirDone = false; state.incoming = 0;
    c.items = []; c.setPicks(state.picks, { instant: true }); c.resetStir();
    $("stir-ui").classList.remove("is-done", "is-boom");
    setMode("pick"); syncBrewUi();
    const firstBoom = addBoom();
    // still black: wait for the ingredient panel to finish sliding back before framing the scene
    for (let i = 0, last = -1; i < 40; i++) {
      await wait(60);
      const r = viewInsets().r;
      if (Math.abs(r - last) < 0.5 && i > 3) break;
      last = r;
    }
    c.resize(); applyView(true); requestAnimationFrame(placeBubble);
    AudioFx.setBoil(0.25);
    await wait(250);
    fade.classList.remove("is-on");
    // the witch and cat laugh it off
    c.react("laugh", 3.2); c.act.cat.pose = "paw"; c.hop("witch", 0.8); c.hop("cat", 0.8);
    AudioFx.meow();
    const line = BOOM_LINES[(Math.random() * BOOM_LINES.length) | 0];
    say(line[0], line[1], 5200, line[2]);
    if (firstBoom) setTimeout(() => toast("💥 NEW! Kaboom! is in your Potion Book! ずかんに のったよ！", 3600), 1600);
  }
  // Stirring done: a clear "finished!" beat (100%, a cheer, a sparkle burst), then a heads-up
  // that the magic drawing is next, before the first letter appears.
  async function finishStir() {
    const c = cauldrons.pot;
    c.autoStir(false);
    c.showHint = false;
    $("stir-ui").classList.add("is-done");
    $("stir-ring").style.setProperty("--p", 1); $("stir-pct").textContent = "✓";
    $("stir-title").innerHTML = "Done!<small>できた！</small>";
    AudioFx.chime(2); AudioFx.chime(4); AudioFx.chime(6); AudioFx.sparkle();
    c.burst(state.result ? state.result.potion.color : "#ffffff", 40);
    const w = c.act.witch, k = c.act.cat;
    w.pose = "cheer"; w.until = c.time + 1.8; c.hop("witch", 1);
    k.pose = "paw"; k.until = c.time + 1.8; c.hop("cat", 0.8);
    say("Done! Great stirring!", "できた！ じょうずに まぜたね！", 2400, "witch");
    await wait(1900);
    c.burst("#ffe27a", 26); c.lightning();
    say("Now draw the magic letters!", "つぎは まほうの もじを かこう！", 2600, "cat");
    await wait(1700);
    startTrace();
  }

  // =====================================================================
  // magic tracing: every ingredient letter, then the potion's symbol
  // =====================================================================
  let tracer = null;
  async function startTrace() {
    if (!state.result) state.result = brewPotion(state.picks, state.unlocked);
    const pt = state.result.potion;
    const token = ++state.traceToken;
    setMode("trace");
    if (!tracer) {
      tracer = new Tracer($("trace-canvas"));
      let inkT = 0;
      tracer.onInk = () => { const n = performance.now(); if (n - inkT > 90) { inkT = n; AudioFx.shimmer(tracer.progress()); } };
      tracer.onStroke = () => AudioFx.chime(3);
      tracer.onDone = () => { AudioFx.ding(); AudioFx.sparkle(); };
    }
    const steps = state.picks.map((p) => ({ glyph: Glyphs.letterGlyph(p.ingredient.letter), color: letterColor(p.ingredient.letter), letter: p.ingredient.letter, pick: p }));
    steps.push({ glyph: Glyphs.symbolGlyph(pt), color: pt.color, symbol: true });
    const slots = $("trace-slots");
    slots.innerHTML = steps.map((s) => `<span class="tslot ${s.symbol ? "is-sym" : ""}" style="--lc:${s.color}">${s.symbol ? "✦" : s.letter}</span>`).join("");
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      if (token !== state.traceToken) return;
      slots.children[i].classList.add("is-now");
      $("trace-title").innerHTML = s.symbol
        ? `Now trace the magic symbol!<small>まほうの しるしを なぞろう！</small>`
        : `Trace the letter <span class="sq" style="--lc:${s.color}">${s.letter}</span><small>${s.letter}を なぞろう！ — ${s.pick.ingredient.name}</small>`;
      tracer.helping = false;
      await tracer.trace(s.glyph, s.color);
      if (token !== state.traceToken) return;
      const el = slots.children[i];
      el.classList.remove("is-now"); el.classList.add("is-done");
      if (s.symbol) el.innerHTML = Glyphs.svg(s.glyph, "#fff", 40);
      await wait(s.symbol ? 300 : 500);
    }
    if (token !== state.traceToken) return;
    $("trace-title").innerHTML = `The magic is ready!<small>まほうの じゅんび OK！</small>`;
    await wait(900);
    tracer.stop();
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
    if (res.secretUnlocked) extras.push(`<div class="reveal-extra secret">✨ You collected every potion! The secret potion appears! ✨<small>ぜんぶ あつめたね！ ひみつのポーション！</small></div>`);
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
      <div class="reveal-symbol">${Glyphs.svg(Glyphs.symbolGlyph(pt), pt.color, 40)}<span>${Glyphs.symbolFor(pt).name} = ${pt.nameEn}</span></div>
      <p class="reveal-desc">${pt.descriptionJa}</p>
      ${tagInfo && pt.tag ? `<div class="reveal-power">Main power: <b style="color:${tagInfo.color}">${tagInfo.emoji} ${tagInfo.name}</b> <small>${tagInfo.nameJa}</small></div>` : pt.id === 18 ? `<div class="reveal-power">Opposite powers cancel out! Try one power, or two that match.<small>はんたいの ちからが けしあったよ！</small></div>` : ""}
      ${extras.join("")}
      <div class="reveal-btns">${pt.isSecret ? `<button id="btn-reveal-cert" class="btn btn-yes btn-small reveal-cert" type="button"><span>🎓 My certificate<small>しょうじょう</small></span></button>` : ""}
      <button id="btn-present" class="btn btn-play btn-present" type="button"><svg class="ico" aria-hidden="true"><use href="#i-play"/></svg><span>Present it!<small>みんなに みせよう</small></span></button></div>`;
    $("btn-present").onclick = () => { AudioFx.click(); showScreen("result"); };
    if (pt.isSecret) {
      $("btn-reveal-cert").onclick = () => { AudioFx.click(); Graduation.openCertificate(); };
      Graduation.play({ onDone: graduated });          // the big graduation ceremony plays over the reveal card
    } else AudioFx.fanfare(res.stars >= 3);
    // glitter rain behind the card
    const col = pt.color;
    let n = 0;
    const rain = setInterval(() => {
      if (state.mode !== "reveal" || n++ > 120) { clearInterval(rain); return; }
      const r = revealFx.canvas.getBoundingClientRect();
      revealFx.spawn({ shape: Math.random() < 0.5 ? "star4" : "star5", color: Math.random() < 0.4 ? "#ffffff" : (Math.random() < 0.5 ? col : "#ffe27a"), x: Math.random() * r.width, y: -10, vx: (Math.random() - 0.5) * 60, vy: 120 + Math.random() * 220, life: 3, size: 5 + Math.random() * 10, vr: (Math.random() - 0.5) * 6, add: true, fade: "inout" });
    }, 55);
    await wait(900);
  }

  // =====================================================================
  // presentation
  // =====================================================================
  function enterResult() {
    const res = state.result || brewPotion(state.picks, state.unlocked);
    state.result = res;
    const pt = res.potion;
    if (!cauldrons.result) {
      const c = cauldrons.result = new Cauldron($("result-canvas"), { letters: false, idleStir: true });
      c.onPop = (s) => AudioFx.plop(s);
      c.onSplash = (p) => AudioFx.splash(p * 0.7);
      c.onThunder = () => AudioFx.thunder();
      c.onTap = (p, idx) => { if (idx >= 0) presentOne(idx); };
      hookActors(c, "result");
    }
    const c = cauldrons.result;
    c.resize(); buildBoard(); applyView(true); c.setPicks([], { instant: true }); c.start(); c.react("laugh", 4);
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
  // The student presents straight from this board: one sentence frame, then one line per ingredient.
  const LETTER_AN = "AEFHILMNORSX";
  function buildBoard() {
    const res = state.result, pt = res.potion;
    const tile = (l, cls) => `<span class="sq ${cls || ""}" style="--lc:${letterColor(l)}">${l}</span>`;
    const first = state.picks[0] ? state.picks[0].ingredient.letter : "A";
    const art = LETTER_AN.indexOf(first) !== -1 ? "an" : "a";
    const rows = state.picks.map((p, i) => {
      const l = p.ingredient.letter;
      return `
      <button type="button" class="sb-row ${p.ingredient.name.length > 13 ? "is-long" : p.ingredient.name.length > 9 ? "is-mid" : ""}" data-i="${i}" style="--lc:${letterColor(l)}">
        ${tile(l, "sq-big")}
        <span class="sb-text">
          <b><span class="sb-l">${l}</span> is for <ruby>${p.ingredient.name}<rt>${kanaFor(p.ingredient.name)}</rt></ruby>.</b>
          <span class="sb-from">${Art.flag(p.country.code)}<span>It's from <ruby>${p.country.name}<rt>${kanaFor(p.country.name)}</rt></ruby>.</span></span>
        </span>
        <img class="sb-img" src="${p.ingredient.image}" alt="">
      </button>`;
    }).join("");
    $("result-board").innerHTML = `
      <div class="sb-say">My soup is ${art} <span class="sb-tiles">${state.picks.map((p) => tile(p.ingredient.letter)).join("")}</span> soup.</div>
      <div class="sb-rows">${rows}</div>
      <button type="button" class="sb-potion" id="board-potion" style="--pc:${pt.color}">
        <img src="${pt.image}" alt="">
        <span class="sb-sym">${Glyphs.svg(Glyphs.symbolGlyph(pt), pt.color, 44)}</span>
        <span class="sb-ptext"><small>It makes…</small><b>${articleFor(pt.nameEn)} ${pt.nameEn}!</b></span>
        ${Art.stars(res.stars)}
      </button>`;
  }
  function highlightRow(i) {
    document.querySelectorAll(".sb-row").forEach((r, k) => r.classList.toggle("is-hl", k === i));
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
    await wait(1600);
    if (token === undefined || token === state.presentToken) highlightRow(-1);
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
    {
      // feather the scene's edges so it melts into the page instead of ending in a hard rectangle
      const m = document.createElement("canvas"); m.width = snap.width; m.height = snap.height;
      const mg = m.getContext("2d");
      mg.drawImage(snap, 0, 0);
      mg.globalCompositeOperation = "destination-in";
      const fade = (x0, y0, x1, y1, a, b) => { const lg = mg.createLinearGradient(x0, y0, x1, y1); lg.addColorStop(a, "rgba(0,0,0,0)"); lg.addColorStop(b, "rgba(0,0,0,1)"); mg.fillStyle = lg; mg.fillRect(0, 0, m.width, m.height); };
      fade(0, 0, 0, m.height, 0, 0.12);                  // top
      fade(m.width, 0, 0, 0, 0, 0.14);                   // right
      const pw = 835, ph = pw * snap.height / snap.width;
      g.drawImage(m, -10, H - ph + 8, pw, ph);
    }
    // title
    g.textAlign = "center"; g.lineJoin = "round";
    g.font = '800 64px "Baloo 2", "Nunito", sans-serif';
    g.strokeStyle = "#12061c"; g.lineWidth = 14; g.strokeText("Witch's Soup!", W / 2, 84);
    g.fillStyle = "#ffe27a"; g.fillText("Witch's Soup!", W / 2, 84);
    // parchment
    const bx = 860, by = 112, bw = 700, bh = 760;
    g.fillStyle = "#12061c"; rr(g, bx + 8, by + 12, bw, bh, 34); g.fill();
    const pg = g.createLinearGradient(0, by, 0, by + bh); pg.addColorStop(0, "#3b1d6e"); pg.addColorStop(1, "#26104a");
    g.fillStyle = pg; rr(g, bx, by, bw, bh, 34); g.fill(); g.strokeStyle = "#12061c"; g.lineWidth = 8; g.stroke();
    // the same sentence board the students present from
    const tileC = (l, x, y, sz) => {
      g.fillStyle = "#12061c"; rr(g, x, y + 5, sz, sz, sz * 0.24); g.fill();
      g.fillStyle = letterColor(l); rr(g, x, y, sz, sz, sz * 0.24); g.fill(); g.strokeStyle = "#12061c"; g.lineWidth = 5; g.stroke();
      g.fillStyle = "#fff"; g.font = `800 ${Math.round(sz * 0.66)}px "Baloo 2", "Nunito", sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(l, x + sz / 2, y + sz * 0.54); g.textAlign = "left"; g.textBaseline = "alphabetic";
    };
    const first = state.picks[0] ? state.picks[0].ingredient.letter : "A";
    const artW = LETTER_AN.indexOf(first) !== -1 ? "an" : "a";
    g.textAlign = "left";
    g.font = '800 38px "Baloo 2", "Nunito", sans-serif';
    const pre = `My soup is ${artW} `, post = " soup.";
    const tw = g.measureText(pre).width + state.picks.length * 62 + g.measureText(post).width;
    let tx = bx + bw / 2 - tw / 2;
    g.setLineDash([14, 10]); g.strokeStyle = "rgba(255,213,79,.75)"; g.lineWidth = 4; rr(g, bx + 28, by + 26, bw - 56, 92, 22); g.stroke(); g.setLineDash([]);
    g.fillStyle = "#fff"; g.fillText(pre, tx, by + 86); tx += g.measureText(pre).width;
    state.picks.forEach((p) => { tileC(p.ingredient.letter, tx + 2, by + 46, 54); tx += 62; });
    g.fillStyle = "#fff"; g.font = '800 38px "Baloo 2", "Nunito", sans-serif'; g.fillText(post, tx, by + 86);
    const imgs = await Promise.all(state.picks.map((p) => loadImage(p.ingredient.image)));
    const flags = await Promise.all(state.picks.map((p) => loadImage("assets/flags/" + p.country.code + ".svg")));
    state.picks.forEach((p, i) => {
      const y = by + 146 + i * 140, l = p.ingredient.letter;
      tileC(l, bx + 40, y + 8, 96);
      let fs = 40;
      g.font = `800 ${fs}px "Baloo 2", "Nunito", sans-serif`;
      while (fs > 24 && g.measureText(`${l} is for ${p.ingredient.name}.`).width > bw - 160 - 140) { fs -= 2; g.font = `800 ${fs}px "Baloo 2", "Nunito", sans-serif`; }
      g.lineWidth = 8; g.strokeStyle = "#12061c"; g.strokeText(l, bx + 160, y + 52); g.fillStyle = letterColor(l); g.fillText(l, bx + 160, y + 52);
      const isFor = " is for ", nx0 = bx + 160 + g.measureText(l).width + g.measureText(isFor).width;
      g.fillStyle = "#fff"; g.fillText(`${isFor}${p.ingredient.name}.`, bx + 160 + g.measureText(l).width, y + 52);
      const nw = g.measureText(p.ingredient.name).width;
      g.font = '700 17px "Nunito", sans-serif'; g.fillStyle = "#ffe9a8"; g.textAlign = "center";
      g.fillText(kanaFor(p.ingredient.name), nx0 + nw / 2, y + 12); g.textAlign = "left";
      if (flags[i]) { g.save(); rr(g, bx + 162, y + 72, 60, 40, 6); g.clip(); g.drawImage(flags[i], bx + 162, y + 72, 60, 40); g.restore(); g.strokeStyle = "#12061c"; g.lineWidth = 4; rr(g, bx + 162, y + 72, 60, 40, 6); g.stroke(); }
      g.fillStyle = "#e8dcff"; g.font = '800 28px "Baloo 2", "Nunito", sans-serif'; g.fillText(`It's from ${p.country.name}.`, bx + 236, y + 108);
      const cx0 = bx + 236 + g.measureText("It's from ").width, cw = g.measureText(p.country.name).width;
      g.font = '700 15px "Nunito", sans-serif'; g.fillStyle = "#ffe9a8"; g.textAlign = "center";
      g.fillText(kanaFor(p.country.name), cx0 + cw / 2, y + 80); g.textAlign = "left";
      if (imgs[i]) g.drawImage(imgs[i], bx + bw - 128, y + 14, 92, 92);
    });
    // potion
    const py = by + 146 + 3 * 140 + 6;
    g.fillStyle = "rgba(255,255,255,.1)"; rr(g, bx + 28, py, bw - 56, 150, 26); g.fill();
    const potImg = await loadImage(pt.image);
    if (potImg) g.drawImage(potImg, bx + 44, py + 6, 138, 138);
    g.fillStyle = "#c9b3ee"; g.font = '800 24px "Nunito", sans-serif'; g.fillText("It makes…", bx + 200, py + 46);
    g.fillStyle = "#ffe27a"; g.font = '800 40px "Baloo 2", "Nunito", sans-serif'; g.fillText(`${articleFor(pt.nameEn)} ${pt.nameEn}!`, bx + 200, py + 92);
    for (let i = 0; i < 3; i++) {
      g.fillStyle = i < res.stars ? "#ffc83a" : "rgba(255,255,255,.18)"; g.strokeStyle = "#12061c"; g.lineWidth = 3;
      g.beginPath();
      for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 9 : 20; g[k ? "lineTo" : "moveTo"](bx + 220 + i * 48 + Math.cos(a) * r, py + 124 + Math.sin(a) * r); }
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
      return `<button type="button" class="book-item ${has ? "is-got" : "is-locked"} ${p.isSecret ? "is-secret" : ""}" data-id="${p.id}" style="--pc:${p.color}">
        <img src="${has ? p.image : "assets/potions/locked-potion.webp"}" alt="">
        ${has ? Glyphs.svg(Glyphs.symbolGlyph(p), p.color, 26) : ""}
        <span>${has ? p.nameEn : p.isSecret ? "Secret!" : "? ? ?"}</span></button>`;
    }).join("");
    const nb = boomCount(), chip = $("book-boom");
    chip.classList.toggle("is-got", nb > 0);
    chip.innerHTML = nb > 0 ? `<b>💥</b><span>Kaboom! <i>×${nb}</i></span>` : `<b>💥</b><span>? ? ?</span>`;
    $("book-detail").hidden = true;
    $("book-modal").hidden = false;
  }
  // tapping a potion opens a big card about it; tapping the card closes it again
  function boomDetail() {
    const nb = boomCount(), box = $("book-detail");
    box.innerHTML = nb > 0
      ? `<div class="bp-card bp-boom" style="--pc:#ff7a2b"><span class="bp-emoji">💥</span>
          <div class="bp-info"><b>Kaboom!</b><i>ドッカーン！</i>
            <span class="bp-tag" style="--c:#ff7a2b">💥 × ${nb} <small>${nb}かい</small></span>
            <p>Sometimes a potion goes BOOM while you stir! It's just bad luck. Your ingredients stay in the pot, so stir again!</p>
            <p>まぜていると、ときどき ばくはつ するよ！ ざいりょうは そのままだから、もういちど まぜてね。</p></div>
          <span class="bp-close">✕</span></div>`
      : `<div class="bp-card is-locked"><span class="bp-emoji is-locked">💥</span>
          <div class="bp-info"><b>? ? ?</b><p class="bp-hint">Something surprising can happen while you stir… keep brewing!<small>まぜていると なにかが おこるかも…？</small></p></div>
          <span class="bp-close">✕</span></div>`;
    nb > 0 ? AudioFx.select() : AudioFx.nope();
    box.hidden = false;
  }
  // Health / Weak Health and Magic / Weak Magic differ only in how much of the power is in the pot
  function ladderHint(p) {
    const t = TAGS[p.tag], e = t.emoji, weak = p.min < 4;
    const other = POTION_BY_ID[POTION_LADDERS[p.tag][weak ? 1 : 0]].nameEn;
    const big = `<span class="hint-count">${weak ? `<i>${e}</i>` : `<i>${e}</i><i>${e}</i>`}</span>`;
    return weak
      ? `${big}Put in only <b>ONE</b> ingredient with ${e} as its first icon.<br>(Two of them make the ${other}!)<small>${e}が さいしょの アイコンの ざいりょうを <b>1つだけ</b> いれよう！ 2つ いれると「${POTION_BY_ID[POTION_LADDERS[p.tag][1]].nameJa}」に なるよ。</small>`
      : `${big}Put in <b>TWO</b> ingredients with ${e} as their first icon.<br>(Only one makes the ${other}!)<small>${e}が さいしょの アイコンの ざいりょうを <b>2つ</b> いれよう！ 1つだけだと「${POTION_BY_ID[POTION_LADDERS[p.tag][0]].nameJa}」に なるよ。</small>`;
  }
  function bookDetail(id) {
    const p = POTION_BY_ID[id];
    const has = state.unlocked.indexOf(p.id) !== -1;
    const box = $("book-detail");
    if (has) {
      const t = p.tag ? TAGS[p.tag] : null;
      box.innerHTML = `<div class="bp-card" style="--pc:${p.color}">
        <img src="${p.image}" alt="">
        <div class="bp-info"><b>${p.nameEn}</b><i>${p.nameJa}</i>
          ${t ? `<span class="bp-tag" style="--c:${t.color}">${t.emoji} ${t.name} <small>${t.nameJa}</small></span>` : ""}
          <span class="bp-sym">${Glyphs.svg(Glyphs.symbolGlyph(p), p.color, 48)} Magic symbol: ${Glyphs.symbolFor(p).name} <small>${Glyphs.symbolFor(p).nameJa}</small></span>
          <p>${p.descriptionJa}</p></div>
        <span class="bp-close">✕</span></div>`;
      AudioFx.select();
    } else {
      const hint = p.isSecret
        ? `Collect all ${REGULAR_POTIONS.length} other potions, then brew once more to make the secret potion!<small>ほかの ポーションを ぜんぶ あつめたら、もういちど つくってみよう！</small>`
        : p.tag && POTION_LADDERS[p.tag] ? ladderHint(p)
        : p.tag ? `Hint: use ${TAGS[p.tag].emoji} ${TAGS[p.tag].name} ingredients!${p.min >= 4 ? " Use two of them!" : ""}<small>${TAGS[p.tag].nameJa}の ざいりょうを ${p.min >= 4 ? "2つ " : ""}つかってみよう</small>`
        : `Hint: mix opposite powers, like 🔥 Fire and 💧 Water!<small>はんたいの ちからを まぜてみよう</small>`;
      box.innerHTML = `<div class="bp-card is-locked">
        <img src="assets/potions/locked-potion.webp" alt="">
        <div class="bp-info"><b>${p.isSecret ? "Secret Potion" : "? ? ?"}</b><p class="bp-hint">${hint}</p></div>
        <span class="bp-close">✕</span></div>`;
      AudioFx.nope();
    }
    box.hidden = false;
  }

  // =====================================================================
  // events
  // =====================================================================
  function bind() {
    document.addEventListener("pointerdown", () => AudioFx.unlock(), { once: true });
    $("btn-start").onclick = () => { AudioFx.unlock(); AudioFx.startAmbience(); AudioFx.startMusic(); AudioFx.whoosh(); resetBrew(); showScreen("brew"); };
    $("btn-title-book").onclick = openBook;
    $("btn-book").onclick = openBook;
    $("book-boom").onclick = () => boomDetail();
    $("book-close").onclick = () => { $("book-modal").hidden = true; AudioFx.click(); };
    $("book-detail").addEventListener("click", () => { $("book-detail").hidden = true; AudioFx.click(); });
    $("book-modal").addEventListener("click", (e) => { if (e.target === $("book-modal")) { $("book-modal").hidden = true; AudioFx.click(); } });
    $("book-grid").addEventListener("click", (e) => {
      const b = e.target.closest(".book-item"); if (!b) return;
      const p = POTION_BY_ID[+b.dataset.id];
      if (p.isSecret && state.unlocked.indexOf(p.id) !== -1) { Graduation.openCertificate(); return; }
      bookDetail(+b.dataset.id);
    });
    $("btn-home").onclick = () => {
      AudioFx.click(); cancelAnimationFrame(stirRaf); cancelAnimationFrame(shake.raf);
      state.traceToken++; if (tracer) tracer.stop();
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
    };
    document.querySelectorAll(".modal").forEach((m) => m.addEventListener("pointerdown", (e) => { if (e.target === m && m.id !== "country-modal") m.hidden = true; }));
    // test codes, typed anywhere (not in a text box): "magicmaster" plays the graduation ceremony,
    // "magicreset" empties the Potion Book again.  TODO: remove "magicmaster" once testing is done.
    let typed = "";
    document.addEventListener("keydown", (e) => {
      if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
      if (e.key && e.key.length === 1) typed = (typed + e.key.toLowerCase()).slice(-12);
      if (typed.endsWith("magicmaster") && !Graduation.running) {
        typed = "";
        AudioFx.unlock();
        if (state.unlocked.indexOf(SECRET_POTION.id) === -1) { state.unlocked.push(SECRET_POTION.id); saveUnlocked(); updateBookCount(); }
        document.querySelectorAll(".modal").forEach((m) => { m.hidden = true; });
        Graduation.play({ onDone: graduated });
      } else if (typed.endsWith("magicreset")) {
        typed = "";
        state.unlocked = []; saveUnlocked(); updateBookCount(); Cauldron.setGraduated(false);
        try { localStorage.removeItem("witchsoup-graduation"); } catch (err) { /* ignore */ }
        toast("Potion Book reset! リセットしたよ");
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { document.querySelectorAll(".modal").forEach((m) => { m.hidden = true; }); state.pending = null; }
      if ((e.key === " " || e.key === "Enter") && state.mode === "shake" && state.screen === "brew") { e.preventDefault(); pushShake((Math.random() - 0.5) * 60, (Math.random() - 0.5) * 20, 0.05); AudioFx.rattle(1.5); }
    });

    // pantry
    if ($("letter-tabs")) $("letter-tabs").addEventListener("click", (e) => {
      const b = e.target.closest(".letter-tab"); if (!b) return;
      AudioFx.click(); state.filter = b.dataset.letter; buildLetterTabs(); buildIngredientGrid();
    });
    $("ing-grid").addEventListener("click", (e) => { const t = e.target.closest(".ing-tile"); if (t) pickIngredient(t.dataset.id, t); });
    $("slots").addEventListener("click", (e) => { const s = e.target.closest(".slot.is-filled"); if (s) removePick(+s.dataset.i); });

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
      const row = e.target.closest(".sb-row");
      if (row) { state.presentToken++; state.presenting = false; presentOne(+row.dataset.i); return; }
      if (e.target.closest("#board-potion")) {
        const pt = state.result.potion;
        highlightRow("potion"); cauldrons.result.burst(pt.color, 24); AudioFx.sparkle();
        if (pt.isSecret) Graduation.openCertificate();
      }
    });
  }

  // =====================================================================
  function init() {
    loadUnlocked(); updateBookCount();
    if (state.unlocked.indexOf(SECRET_POTION.id) !== -1) Cauldron.setGraduated(true);
    try { if (localStorage.getItem(MUTE_KEY) === "1") { AudioFx.muted = true; $("btn-mute").classList.add("is-muted"); $("btn-mute").querySelector("use").setAttribute("href", "#i-mute"); } } catch (e) { /* ignore */ }
    bind();
    addEventListener("resize", () => applyView(false));

    // wait for the painted sprites so nothing pops in (or flashes) after the first frame
    document.getElementById("game").classList.add("is-loading");
    const logo = document.querySelector(".logo-img img"); if (logo) logo.addEventListener("load", () => { if (state.screen === "title") applyView(false); });
    Cauldron.preload().then(() => { document.getElementById("game").classList.remove("is-loading"); showScreen("title"); });
    if (/[?&]dev\b/.test(location.search)) {
      window.TC = {
        state, showScreen, cauldrons, resetBrew, setMode, startStir, startShake, showReveal, pushShake, buildBoard, startTrace, get tracer() { return tracer; },
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
        react(pick) { reactToPick(pick); },
        get booms() { return boomCount(); },
        boomNow() { state.brewN = 5; state.lastBoom = false; state.boomAt = 0.5; cauldrons.pot.stirTotal = 1; },
        openBook, downloadResultImage
      };
    }
  }
  init();
})();
