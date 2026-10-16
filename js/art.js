/* Inline SVG builders (string returning) in the same chunky ink-outlined
   style as the rest of the game. */
const Art = (function () {
  const INK = "#12061c";
  let uid = 0;

  // Witch cat mascot. mood: "happy" | "wow" | "stir" | "sleepy"
  function cat(mood) {
    const id = "cat" + (uid++);
    const eyes = {
      happy: `<ellipse cx="86" cy="150" rx="9" ry="12" fill="#fff"/><ellipse cx="134" cy="150" rx="9" ry="12" fill="#fff"/><circle cx="88" cy="152" r="6" fill="${INK}"/><circle cx="132" cy="152" r="6" fill="${INK}"/><circle cx="90" cy="148" r="2.2" fill="#fff"/><circle cx="134" cy="148" r="2.2" fill="#fff"/>`,
      wow: `<ellipse cx="86" cy="150" rx="12" ry="15" fill="#fff"/><ellipse cx="134" cy="150" rx="12" ry="15" fill="#fff"/><circle cx="86" cy="151" r="8" fill="${INK}"/><circle cx="134" cy="151" r="8" fill="${INK}"/><circle cx="89" cy="147" r="3" fill="#fff"/><circle cx="137" cy="147" r="3" fill="#fff"/>`,
      stir: `<path d="M74 152q12-14 24 0M122 152q12-14 24 0" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>`,
      sleepy: `<path d="M74 150q12 10 24 0M122 150q12 10 24 0" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>`
    }[mood || "happy"];
    const mouth = mood === "wow"
      ? `<ellipse cx="110" cy="182" rx="8" ry="10" fill="#7a1230" stroke="${INK}" stroke-width="3"/>`
      : `<path d="M98 176q6 8 12 0q6 8 12 0" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`;
    return `<svg class="cat-svg" viewBox="0 0 220 260" aria-hidden="true">
  <defs>
    <linearGradient id="${id}h" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6a3fc4"/><stop offset="1" stop-color="#3c1f80"/></linearGradient>
    <linearGradient id="${id}b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4a4268"/><stop offset="1" stop-color="#1e1833"/></linearGradient>
  </defs>
  <path class="cat-tail" d="M168 232q52-6 40-54q-4-18-18-12q8 22-26 40z" fill="url(#${id}b)" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/>
  <ellipse cx="110" cy="222" rx="62" ry="36" fill="url(#${id}b)" stroke="${INK}" stroke-width="7"/>
  <ellipse cx="76" cy="248" rx="22" ry="12" fill="#3d3558" stroke="${INK}" stroke-width="6"/>
  <ellipse cx="144" cy="248" rx="22" ry="12" fill="#3d3558" stroke="${INK}" stroke-width="6"/>
  <path d="M46 150 36 96l36 22zM174 150l10-54-36 22z" fill="url(#${id}b)" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/>
  <path d="M50 134 46 112l16 10zM170 134l4-22-16 10z" fill="#ff8fb8"/>
  <ellipse cx="110" cy="158" rx="70" ry="58" fill="url(#${id}b)" stroke="${INK}" stroke-width="7"/>
  <ellipse cx="110" cy="176" rx="38" ry="26" fill="#6a6190" opacity=".55"/>
  ${eyes}
  <path d="M104 164l6 6 6-6z" fill="#ff8fb8" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
  ${mouth}
  <path d="M66 168l-30-6M66 176l-32 6M154 168l30-6M154 176l32 6" stroke="#cfc6ee" stroke-width="3" stroke-linecap="round"/>
  <circle cx="62" cy="170" r="9" fill="#ff7aa8" opacity=".45"/><circle cx="158" cy="170" r="9" fill="#ff7aa8" opacity=".45"/>
  <g class="cat-hat">
    <ellipse cx="110" cy="104" rx="86" ry="20" fill="url(#${id}h)" stroke="${INK}" stroke-width="7"/>
    <path d="M62 102Q80 52 104 8q4-6 10-2q26 40 44 96z" fill="url(#${id}h)" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/>
    <path d="M64 98q46 16 94 0l2 12q-48 16-98 0z" fill="#ffc83a" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
    <rect x="100" y="92" width="22" height="22" rx="4" fill="#ffe27a" stroke="${INK}" stroke-width="4"/>
    <rect x="106" y="98" width="10" height="10" rx="2" fill="#ffc83a"/>
    <path d="M110 44l4 9 10 1-8 7 3 10-9-5-9 5 3-10-8-7 10-1z" fill="#ffe27a" stroke="${INK}" stroke-width="3" stroke-linejoin="round" transform="translate(4 6) scale(.8)"/>
    <path d="M92 40q4 22-4 44" fill="none" stroke="rgba(255,255,255,.3)" stroke-width="6" stroke-linecap="round"/>
  </g>
</svg>`;
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
