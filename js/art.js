/* Inline SVG builders (string returning) in the same chunky ink-outlined
   style as the rest of the game. */
const Art = (function () {
  const INK = "#12061c";
  let uid = 0;

  // Painted cat mascot (assets/art). mood: "happy" | "wow" | "stir" | "sleepy" | "idle"
  const CAT_FRAMES = { happy: "cat_happy", wow: "cat_wow", stir: "cat_idle", sleepy: "cat_sleepy", idle: "cat_idle", blink: "cat_blink" };
  function cat(mood) {
    const f = CAT_FRAMES[mood || "idle"] || "cat_idle";
    return `<img class="cat-svg" src="assets/art/${f}.webp" alt="" draggable="false">`;
  }

  // Mystery / potion bottle. fill 0..1 is how much liquid; glow adds an aura.
  function bottle(color, opts) {
    const o = opts || {};
    const id = "bt" + (uid++);
    const fill = o.fill === undefined ? 0.8 : o.fill;
    const top = 232 - fill * 130;
    const q = o.mark === false ? "" : `<text x="100" y="212" text-anchor="middle" font-family="Baloo 2, Nunito, sans-serif" font-weight="800" font-size="76" fill="#fff" stroke="${INK}" stroke-width="7" paint-order="stroke" stroke-linejoin="round">?</text>`;
    return `<svg class="bottle-svg" viewBox="0 0 200 300" aria-hidden="true">
  <defs>
    <clipPath id="${id}c"><path d="M70 92 70 112C30 130 22 170 22 210c0 44 34 70 78 70s78-26 78-70c0-40-8-80-48-98V92z"/></clipPath>
    <linearGradient id="${id}l" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="${color}" stop-opacity=".78"/></linearGradient>
  </defs>
  <path d="M70 92 70 112C30 130 22 170 22 210c0 44 34 70 78 70s78-26 78-70c0-40-8-80-48-98V92z" fill="rgba(255,255,255,.2)"/>
  <g clip-path="url(#${id}c)">
    <rect class="bottle-liquid" x="10" y="${top}" width="180" height="140" fill="url(#${id}l)"/>
    <path class="bottle-wave" d="M0 ${top}q25-12 50 0t50 0t50 0t50 0V${top + 20}H0z" fill="rgba(255,255,255,.35)"/>
    <ellipse cx="62" cy="190" rx="9" ry="34" fill="rgba(255,255,255,.4)" transform="rotate(14 62 190)"/>
    <circle cx="128" cy="236" r="7" fill="rgba(255,255,255,.55)"/><circle cx="104" cy="252" r="4" fill="rgba(255,255,255,.55)"/>
  </g>
  ${q}
  <path d="M70 92 70 112C30 130 22 170 22 210c0 44 34 70 78 70s78-26 78-70c0-40-8-80-48-98V92z" fill="none" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>
  <rect x="62" y="70" width="76" height="26" rx="9" fill="#e8f4ff" stroke="${INK}" stroke-width="8"/>
  <g class="bottle-cork"><path d="M72 70 76 24h48l4 46z" fill="#c98a4a" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>
  <path d="M86 36v22M100 32v26M114 38v20" stroke="#8a5a2b" stroke-width="4" stroke-linecap="round"/></g>
</svg>`;
  }

  function stars(n, total) {
    let out = "";
    for (let i = 0; i < (total || 3); i++) {
      out += `<svg class="star ${i < n ? "on" : ""}" viewBox="0 0 24 24" style="--i:${i}"><path d="M12 2.5l2.9 6.2 6.8.8-5 4.7 1.3 6.7L12 17.6 6 20.9l1.3-6.7-5-4.7 6.8-.8z" stroke-linejoin="round"/></svg>`;
    }
    return `<span class="stars">${out}</span>`;
  }

  function flag(code) {
    return `<img class="flag" src="assets/flags/${code}.svg" alt="" draggable="false" loading="lazy">`;
  }

  function sparkle(size, color) {
    return `<svg width="${size}" height="${size}" viewBox="-12 -12 24 24"><path d="M0-11 2.6-2.6 11 0 2.6 2.6 0 11-2.6 2.6-11 0-2.6-2.6z" fill="${color || "#ffe27a"}"/></svg>`;
  }

  return { cat, bottle, stars, flag, sparkle, INK };
})();
