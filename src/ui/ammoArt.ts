// Little portraits of each kind of shot for the gun rack: drawn as SVG so
// they stay crisp at any HUD size. Gradient ids are shared between copies,
// which is fine: every copy defines them identically.

import type { AmmoId } from '../game/ammo';

const iron = (id: string, hi: string, mid: string, lo: string) =>
  `<radialGradient id="${id}" cx="0.36" cy="0.32" r="0.75"><stop offset="0" stop-color="${hi}"/><stop offset="0.45" stop-color="${mid}"/><stop offset="1" stop-color="${lo}"/></radialGradient>`;

const shine = (cx: number, cy: number, r: number) =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${r}" ry="${r * 0.7}" fill="#fff" opacity="0.55" transform="rotate(-30 ${cx} ${cy})"/>`;

const ART: Record<AmmoId, string> = {
  round: `<defs>${iron('aqa-round', '#b4bcc4', '#4a5159', '#16191c')}</defs>
    <ellipse cx="20" cy="34" rx="10" ry="2.2" fill="#000" opacity="0.25"/>
    <circle cx="20" cy="20" r="12" fill="url(#aqa-round)"/>
    ${shine(15.5, 15, 3.2)}`,

  shell: `<defs>${iron('aqa-shell', '#a89e93', '#463e37', '#14110e')}<radialGradient id="aqa-spark"><stop offset="0" stop-color="#fff6d8"/><stop offset="0.35" stop-color="#ffc35a"/><stop offset="1" stop-color="#ff7a1a" stop-opacity="0"/></radialGradient></defs>
    <ellipse cx="19" cy="35" rx="10" ry="2.2" fill="#000" opacity="0.25"/>
    <circle cx="19" cy="22" r="12" fill="url(#aqa-shell)"/>
    <path d="M9 22h20" stroke="#c9a15a" stroke-width="1.4" opacity="0.7"/>
    <rect x="24.2" y="9.6" width="5" height="4.2" rx="1" fill="#c9a15a" transform="rotate(38 26.7 11.7)"/>
    <path d="M28.5 9.5c1.6-1.2 2.4-2.6 2.8-4.3" stroke="#6b5a40" stroke-width="1.2" fill="none" stroke-linecap="round"/>
    <circle cx="31.4" cy="5.6" r="4.6" fill="url(#aqa-spark)"/>
    <path d="M31.4 2.2v6.8M28 5.6h6.8" stroke="#fffbe6" stroke-width="0.9" stroke-linecap="round"/>
    ${shine(14.5, 17, 3)}`,

  fire: `<defs>${iron('aqa-fire', '#ffe2a8', '#ff6a2a', '#7a1606')}<linearGradient id="aqa-flame" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff5a1f"/><stop offset="0.6" stop-color="#ffb43a"/><stop offset="1" stop-color="#fff3b0"/></linearGradient></defs>
    <ellipse cx="20" cy="35" rx="10" ry="2.2" fill="#000" opacity="0.25"/>
    <path d="M10.5 22c-1.8-5.6 1.2-9.4 3.6-11.6-.2 3 1 4.4 2.4 5.2-.6-5.6 2.6-10 6.8-12.6-1 4.2 1 7 3.4 9.2.4-2 1.6-3.4 3-4.2-.4 3.8 2.6 7.2 1.6 14z" fill="url(#aqa-flame)" opacity="0.95"/>
    <circle cx="20" cy="23.5" r="10.5" fill="url(#aqa-fire)"/>
    <circle cx="20" cy="23.5" r="10.5" fill="none" stroke="#ffcf7a" stroke-width="0.8" opacity="0.6"/>
    ${shine(16, 19.5, 2.6)}`,

  chain: `<defs>${iron('aqa-chain', '#b4bcc4', '#4c545c', '#16191c')}</defs>
    <ellipse cx="20" cy="35" rx="13" ry="2" fill="#000" opacity="0.22"/>
    <path d="M4.5 26a7.5 7.5 0 0 1 7.5-7.5v15a7.5 7.5 0 0 1-7.5-7.5z" fill="url(#aqa-chain)" transform="rotate(-18 8 26)"/>
    <path d="M35.5 14a7.5 7.5 0 0 1-7.5 7.5v-15a7.5 7.5 0 0 1 7.5 7.5z" fill="url(#aqa-chain)" transform="rotate(-18 32 14)"/>
    <g fill="none" stroke="#b8c2ca" stroke-width="1.5">
      <ellipse cx="15.2" cy="21.8" rx="2.6" ry="1.5" transform="rotate(-24 15.2 21.8)"/>
      <ellipse cx="19.4" cy="19.9" rx="1.5" ry="2.6" transform="rotate(-24 19.4 19.9)"/>
      <ellipse cx="23.6" cy="18" rx="2.6" ry="1.5" transform="rotate(-24 23.6 18)"/>
    </g>
    ${shine(8, 23, 1.8)}${shine(31, 11, 1.8)}`,

  grape: `<defs>${iron('aqa-grape', '#c2c6cb', '#5a5e64', '#1c1d20')}</defs>
    <ellipse cx="20" cy="35" rx="11" ry="2.2" fill="#000" opacity="0.25"/>
    <path d="M12 12.5c2.6-2.2 13.4-2.2 16 0" stroke="#b49a6c" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    <path d="M20 6.5v4.5" stroke="#b49a6c" stroke-width="1.6" stroke-linecap="round"/>
    ${[
      [14, 17], [20, 15.5], [26, 17], [11.5, 23], [17.2, 22], [23, 22], [28.5, 23], [14.5, 28.5], [20.2, 28], [25.8, 28.5],
    ]
      .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.3" fill="url(#aqa-grape)"/><circle cx="${x - 1}" cy="${y - 1.1}" r="0.9" fill="#fff" opacity="0.5"/>`)
      .join('')}
    <path d="M10 20.5c-1 6 3 10.5 10 10.8 7-.3 11-4.8 10-10.8" stroke="#b49a6c" stroke-width="0.9" fill="none" opacity="0.65" stroke-dasharray="1.6 1.4"/>`,
};

export function ammoIcon(id: AmmoId): string {
  return `<svg class="ammo-ico" viewBox="0 0 40 40" aria-hidden="true">${ART[id]}</svg>`;
}
