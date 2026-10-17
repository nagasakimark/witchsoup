# Witch's Soup 🧙‍♀️🍲

A classroom-ready, bilingual (EN/JA) potion-brewing game for students 8–14, built in the same
no-build, static-site style as [Tomachi Chef](https://github.com/nagasakimark/chef).

Pick **3 ingredients**, say **which country** each one comes from, drop them in a **bubbling cauldron that
reacts to what you add**, **stir** the pot with the spoon, **shake** the bottle to pop the cork, and reveal
your potion. Then **present** your brew from the result board ("My soup is a … soup. F is for Fairy dust. It's from Japan.").

## How it plays
1. **Pantry** – 77 ingredients on a wooden shelf (filter by first letter). Each carries two element powers
   (🔥 💧 ❄️ ⛰️ 🌀 ⚡ ✨ 🦇 🌱 💗 🔮 👁️ 🍀 😴 💨 💪 🛡️). The "Predicted Result" parchment shows what the pot is leaning towards.
2. **Country** – every ingredient needs a country (82 flags, grouped by continent).
3. **Pot reacts** – liquid colour mixes from the ingredients; every power has its own particle effects
   (fire embers, rain drops, snowflakes, bats, hearts, clovers, lightning bolts, Zzz…).
4. **Stir** – click-and-drag (or drag a finger) in circles anywhere on the screen to fill the ring. Hovering does nothing. "Stir for me" appears if a student is stuck.
5. **Shake** – wiggle the mouse/finger (or phone), press the Shake button, or tap Space until the cork pops.
6. **Reveal** – 1–3 stars, NEW! badge, speech. Strongest power decides the potion. Weak ingredients give the Basic potion.
7. **Secret potion** – once all 20 regular potions are in the Potion Book, the next brew makes the **Potion of Knowledge**.
8. **Present** – a sentence board with matching letter tiles; tap a line to hear it and make that ingredient jump. **Save** exports a PNG of the same board.
9. **Characters** – tap the witch (she cheers) or the cat (it waves and meows). Both have idle animation: breathing, blinking, wand flourishes, a swishing tail.

Progress (collected potions) is stored in `localStorage` (`unlocked-potions`, same key as the first version).

## Run
No build, no dependencies. Open `index.html` or:
```
python3 -m http.server 8000   # http://localhost:8000
```
Add `?dev` to expose `window.TC` (e.g. `TC.fill(['Ember','Fairy dust','Herbs','Ice'])`, `TC.stirNow()`).

## Files
- `js/data.js` – ingredients (name/JA/element tags/colour), countries, potions, `brewPotion()` & `mixLiquidColor()`.
- `js/cauldron.js` – the canvas cauldron engine (liquid, bubbles, fire, spring-driven ladle, per-element particles). One shared world with a gliding camera; adapts quality on slow devices.
- `js/audio.js` – procedural WebAudio: bubbling/fire ambience that follows the boil, music box, effects.
- `js/art.js` – SVG bottle and stars. `js/game.js` – flow/UI. `css/game.css` – styling.
- `assets/` – ingredient & potion WebP art, flags, flags. `assets/art/` holds the painted sprites (pot, witch with wand ×5 poses, cat ×4 poses + a separate tail, spoon, flames, logs, stones, hut backdrop). The hut, hearth, pot, witch and cat are drawn back-to-front in one shared world in `js/cauldron.js`, so they share a floor and a scale; each screen just moves the camera. The witch stands on the floor and stirs with magic: her wand is painted into her sprite, a sparkle arc links its star to a wooden spoon standing in the soup, and the spoon follows a spring (lagging and leaning like a real one). Everything in the pot is clipped behind the front lip.

## Art
The painted art was generated with fal nano-banana-pro from one shared style prompt (flat magenta backgrounds, chroma-keyed), with expression/pose variants made as image edits of a base sprite and ECC-aligned so they swap cleanly in game.
