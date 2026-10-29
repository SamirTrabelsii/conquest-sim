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
    introHold: 1500,
    cardFade: 600,
    matchupIntro: 1800,
    panelIn: 400,
    panelOut: 300,
    rpsShake: 1200,
    rpsShakes: 3,
    rpsReveal: 1300,
    rpsDrawPause: 700,
    duelResult: 1800,
    zoomIn: 1400,
    conquest: 1600,
    afterConquest: 1200,
    zoomOut: 1200,
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
    home: { top: 380, height: 760, padding: 16 },
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
    // Numeric ISO ids left out of play entirely (010 = Antarctica).
    excludedIds: ['010'],
    // Countries with no land border get links to this many nearest countries.
    islandLinks: 3,
  },
  camera: {
    // Where the battle region is framed while the duel panel is up.
    box: { top: 300, height: 820, padding: 70 },
    // Caps the zoom so tiny countries are not blown up to pixel mush.
    maxScale: 9,
  },
  persistence: {
    // Loaded at startup if present (served from public/). Put the world file
    // exported by the previous episode here to continue the story.
    savePath: '/saves/latest.json',
    // Download world state + battle log when the summary card appears.
    autoDownload: true,
  },
  debug: {
    showNeighborLinks: false,
  },
};

export type Config = typeof config;
