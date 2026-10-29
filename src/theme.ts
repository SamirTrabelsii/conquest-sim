// All visual identity lives here: brand, palette, fonts, sizes.

export const theme = {
  brand: {
    name: 'FLAGFALL',
    tagline: 'One map. One winner.',
  },
  color: {
    background: '#0b1320',
    ocean: '#11233a',
    border: 'rgba(8, 12, 20, 0.85)',
    text: '#f5f1e6',
    textMuted: '#9fb0c6',
    accent: '#ffb627',
    attacker: '#ff5a4e',
    defender: '#3fa7ff',
    panel: 'rgba(9, 16, 28, 0.92)',
    panelEdge: 'rgba(255, 255, 255, 0.12)',
    card: 'rgba(11, 19, 32, 0.97)',
    // Darkens the top of the stage so the HUD reads over busy flags.
    hudScrim: 'linear-gradient(to bottom, rgba(11, 19, 32, 0.92) 0%, rgba(11, 19, 32, 0.6) 70%, rgba(11, 19, 32, 0) 100%)',
    debugLink: 'rgba(255, 182, 39, 0.75)',
  },
  font: {
    display: "'Anton', 'Impact', sans-serif",
    body: "'Inter Variable', 'Segoe UI', sans-serif",
  },
  size: {
    title: 120,
    heading: 72,
    body: 44,
    small: 32,
    borderWidth: 0.6,
    highlightWidth: 5,
    radius: 28,
    flagWidth: 260,
    hand: 220,
    scorePip: 34,
    gap: 24,
  },
  // Stage regions (px). The map fills the stage; these sit on top of it.
  layout: {
    gutter: 40,
    hud: { top: 56, scrimHeight: 340 },
    duel: { top: 1140, height: 740 },
  },
} as const;

export type Theme = typeof theme;
