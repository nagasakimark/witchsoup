# AGENTS.md — Witch's Soup

Static, no-build site. Scripts are plain globals loaded **in order**: `js/data.js` → `js/audio.js` → `js/art.js` → `js/cauldron.js` → `js/trace.js` → `js/game.js`.

- Serve with `python3 -m http.server 8000`; `?dev` exposes `window.TC` for driving screens from the console.
- Balance: `brewPotion()` in `js/data.js`. Primary tag = 2 pts, secondary = 1 pt; ≥3 pts → that element's potion (≥4 for Health/Magic upgrades). Keep ingredient tags spread so no element dominates.
- Adding an ingredient: add `ing(name, letter, nameJa, furigana, descJa, "primary secondary", "#colour")` in `INGREDIENTS` and a ~256px WebP at `assets/ingredients/<slug>.webp` (slug = lowercase, spaces→`-`).
- The whole scene (hut, hearth, pot, witch, cat) is one world in `js/cauldron.js` (`CauldronGeometry`); screens only change the camera via `setView(insets)`. Never size things in CSS px inside it.
- Verify visually at 1366×768, 1280×720, 1024×768, 800×600 and portrait 390×844; check the console for errors.
- Magic symbols per potion type live in `POTION_SYMBOL` in `js/trace.js`; letter stroke shapes in `L` (0..100 x 0..120 box, one array per pen stroke).
