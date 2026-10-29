// Everything tunable about an episode lives here.

export const config = {
  stage: {
    width: 1080,
    height: 1920,
  },
  episode: {
    number: 1,
    battles: 3,
    seed: 20261029,
    // Multiplies every animation duration. 2 = twice as slow.
    speed: 1,
  },
  // Durations in ms at speed 1.
  timing: {
    hookIn: 500,
    hookStagger: 150,
    hookOut: 400,
    introHold: 1800,
    counterTick: 700,
    dotPulse: 900,
    cardFade: 600,
    matchupIntro: 1800,
    panelIn: 400,
    cardPop: 350,
    panelOut: 300,
    rpsShake: 1200,
    rpsShakes: 3,
    rpsReveal: 1300,
    rpsDrawPause: 700,
    duelResult: 1800,
    zoomIn: 1400,
    spotlight: 450,
    pinIn: 350,
    punch: 320,
    shake: 380,
    flash: 280,
    clash: 260,
    burst: 480,
    stampIn: 350,
    stampOut: 250,
    fallShake: 500,
    fallShakes: 3,
    fall: 1100,
    afterConquest: 1600,
    zoomOut: 1200,
    // The draw: candidate flags flip from fast to slow before locking in.
    drawFastFlip: 70,
    drawSlowFlip: 420,
    drawLock: 1100,
    neighborsShow: 900,
  },
  draw: {
    attackerFlips: 16,
    defenderFlipsMax: 10,
  },
  battle: {
    module: 'rps',
    rpsWinsNeeded: 3,
    // ISO alpha-2 code (e.g. 'tn') that always attacks, or null for random.
    heroCountry: null as string | null,
  },
  map: {
    // The map covers the whole stage; the zoomed-out "home" view fits the
    // world into this box (stage pixels).
    home: { top: 330, height: 640, padding: 24 },
    // Longitude rotation so the map's cut runs east of Chukotka and Fiji
    // instead of slicing Russia in two.
    rotate: -12,
    // Landmasses closer than this (px at home zoom) share one flag, so an
    // archipelago shows one flag instead of one per island.
    flagClusterGap: 10,
    // Flags are fitted to each cluster's box. They may stretch up to this
    // factor before being cropped (keeps all stripes visible on wide shapes).
    flagMaxStretch: 1.6,
    flagAspect: 4 / 3,
    // Clusters smaller than this (px² at home zoom) reuse the empire's main
    // flag instead of getting their own fitted copy.
    minOwnFlagArea: 150,
    // Flag-fall conquest: how far (share of screen height) and how much
    // (degrees) the loser's piece drops and tips, and its pre-fall wobble.
    fall: { drop: 0.9, rotate: 14, wobble: 2.5 },
    // Opacity of the dark veil over countries not in the current battle.
    spotlightDim: 0.62,
    // K.O. impact: camera push-in factor and screen shake distance (px).
    impact: { punchScale: 1.06, shakeDistance: 14, flashOpacity: 0.75 },
    // Numeric ISO ids left out of play entirely (010 = Antarctica).
    excludedIds: ['010'],
    // Countries with no land border get links to this many nearest countries.
    islandLinks: 3,
  },
  camera: {
    // Where the battle region is framed while the duel panel is up.
    box: { top: 290, height: 730, padding: 70 },
    // Caps the zoom so tiny countries are not blown up to pixel mush.
    maxScale: 9,
  },
  story: {
    streakMin: 2, // wins in a row for a "streak" badge
    underdogRatio: 3, // rival holds this many times more land
    empireMin: 2, // countries held for an "empire" badge
  },
  persistence: {
    // Loaded at startup if present (served from public/). Put the world file
    // exported by the previous episode here to continue the story.
    savePath: '/saves/latest.json',
    // Download world state + battle log when the summary card appears.
    autoDownload: true,
  },
  render: {
    fps: 30,
    // Seconds the final card stays on screen after the episode ends.
    tailSeconds: 3,
    jpegQuality: 92, // per-frame capture quality (frames are re-encoded)
    crf: 18, // x264 quality: lower = better and bigger
    preset: 'medium',
  },
  debug: {
    showNeighborLinks: false,
  },
};

export type Config = typeof config;
