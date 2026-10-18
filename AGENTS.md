# AGENTS.md — Witch's Soup

Static, no-build site. Scripts are plain globals loaded **in order**: `js/data.js` → `js/audio.js` → `js/art.js` → `js/cauldron.js` → `js/trace.js` → `js/kana.js` → `js/game.js`.

- Serve with `python3 -m http.server 8000`; `?dev` exposes `window.TC` for driving screens from the console.
- Balance: `brewPotion()` in `js/data.js`. Primary tag = 2 pts, secondary = 1 pt; the top power with ≥2 pts makes that element's potion (Health/Magic need ≥4, otherwise the Weak versions). Opposite powers tied at the top (`OPPOSITES`) cancel into the Basic Potion (~5% of random brews). Keep ingredient tags spread so no element dominates.
- Katakana pronunciation guides (English sounds) for every ingredient and country live in `js/kana.js`; add one when adding an ingredient or country.
- Adding an ingredient: add `ing(name, letter, nameJa, furigana, descJa, "primary secondary", "#colour")` in `INGREDIENTS` and a ~256px WebP at `assets/ingredients/<slug>.webp` (slug = lowercase, spaces→`-`).
- The whole scene (hut, hearth, pot, witch, cat) is one world in `js/cauldron.js` (`CauldronGeometry`); screens only change the camera via `setView(insets)`. Never size things in CSS px inside it.
- Verify visually at 1366×768, 1280×720, 1024×768, 800×600 and portrait 390×844; check the console for errors.
- Magic symbols per potion type live in `POTION_SYMBOL` in `js/trace.js`; letter stroke shapes in `L` (0..100 x 0..120 box, one array per pen stroke).
- Living world (`js/cauldron.js`): one shared flicker `fireF` drives the hearth, room glow, floor, cast shadows and the characters' light; `drawRoom` is cached to an offscreen canvas (~13 fps or on camera moves) and `drawMotes` runs every frame. Characters are drawn in strips by `bentDraw` (feet planted, upper body leans with a spring `lean` per pose, chest breathes); their light layer (`lightSprite`) mixes hearth light from the fire side with the soup colour from the pot side. Shelf-potion glows and the window/moonbeam positions are in hut pixels (`SHELF_GLOWS`, `WIN`, `BEAM`).

## Graduation (secret potion)
- `js/graduation.js` + `css/grad.css`: brewing the secret Potion of Knowledge plays a full-screen ceremony (drum roll, rainbow swirl, potion rise, fireworks, witch + cat, thrown caps) over the reveal card, then offers a canvas-drawn certificate (name field, Save as PNG). Graduation date/name live in localStorage `witchsoup-graduation`.
- Tapping the secret potion in the Potion Book (or on the result board) reopens the certificate.
- Test codes typed anywhere: `magicmaster` (play ceremony, unlock secret) and `magicreset` (empty the Potion Book). Remove `magicmaster` before release.
