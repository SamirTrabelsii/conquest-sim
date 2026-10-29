// All visual identity lives here: brand, palette, type, shapes, motion, layout.
// Direction: "Arcade" — sticker pop. Deep violet, flags and bars cut out like
// stickers with thick white edges, hot yellow accent, chunky rounded type,
// bouncy motion.

const display = "'Lilita One', 'Arial Rounded MT Bold', sans-serif";
const body = "'Inter Variable', 'Segoe UI', sans-serif";

export const theme = {
  brand: {
    name: 'FLAGFALL',
    hook: 'WHO FALLS TODAY?',
    cta: 'FOLLOW FOR EPISODE',
    ko: 'K.O.!',
    results: 'RESULTS',
    // Story badges on fighter cards; {n} is replaced by the number.
    badges: { streak: '{n} IN A ROW', underdog: 'UNDERDOG', empire: '{n} NATIONS' },
  },
  color: {
    background: '#1d0b40',
    ocean: '#2a1458',
    border: 'rgba(20, 6, 45, 0.9)',
    ink: '#1d0b40', // dark bars and chips
    paper: '#3a1f75', // card surfaces
    text: '#ffffff', // text on ink
    textOnPaper: '#ffffff',
    muted: '#b9a8e6', // secondary text on ink
    mutedOnPaper: '#cbbcf2',
    accent: '#ffd60a',
    onAccent: '#1d0b40',
    attacker: '#ff3d8b',
    onAttacker: '#ffffff',
    defender: '#2de2e6',
    onDefender: '#1d0b40',
    sticker: '#ffffff', // the white cut-out edge around stickers
    flash: '#ffffff',
    overlay: 'rgba(29, 11, 64, 0.95)',
    shadow: '#0e0424', // hard drop shadow under stickers
    safeZone: 'rgba(255, 0, 140, 0.28)',
    debugLink: 'rgba(255, 214, 10, 0.75)',
  },
  // Type presets: spread into a style object.
  type: {
    display: { fontFamily: display, fontWeight: '400', fontStyle: 'normal', lineHeight: '0.95', letterSpacing: '0.01em' },
    label: { fontFamily: display, fontWeight: '400', fontStyle: 'normal', letterSpacing: '0.04em', lineHeight: '1' },
    body: { fontFamily: body, fontWeight: '700', fontStyle: 'normal', lineHeight: '1.2' },
  },
  size: {
    min: 32, // readability floor: no on-screen text below this (px)
    hero: 110,
    title: 112,
    heading: 68,
    scoreboard: 48,
    scoreboardPad: 14,
    name: 44,
    body: 42,
    label: 34,
    score: 112,
    flagWidth: 180,
    hand: 110,
    scorePip: 26,
    pin: { stem: 70, dot: 10 },
    progressDot: 18,
    burst: 230,
    borderWidth: 0.6,
    highlightWidth: 6,
    neighborWidth: 4,
    gap: 20,
    pad: 26,
    radius: 22,
  },
  // Sticker shapes: rounded, white-edged, hard shadow, slightly tilted.
  shape: {
    skew: 0, // degrees; 0 = no slant (a broadcast theme would use ~-10)
    stickerWidth: 5, // white edge (px)
    shadowOffset: 10, // hard shadow drop (px)
    tilt: 3, // degrees of playful rotation on hook and title stickers
    pipRadius: '50%',
  },
  motion: {
    pop: 'cubic-bezier(.34, 1.56, .64, 1)', // overshoot: bouncy arrivals
    exit: 'cubic-bezier(.5, 0, .75, 0)',
  },
  layout: {
    // Area not covered by TikTok / Reels / Shorts buttons and captions.
    safe: { top: 150, bottom: 1540, left: 60, right: 960 },
    scoreboard: { top: 164, height: 104 },
    duel: { top: 1010 },
    hook: { top: 500 },
  },
} as const;

export type Theme = typeof theme;
