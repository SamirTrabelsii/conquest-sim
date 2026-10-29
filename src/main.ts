import '@fontsource/lilita-one/400.css';
import '@fontsource-variable/inter';
import './style.css';
import { mountStage, showSafeZones } from './ui/stage';
import { loadAtlas, type Atlas } from './engine/atlas';
import { buildGraph } from './engine/graph';
import { initialState, territoryOwners, type WorldState } from './engine/world';
import { runEpisode } from './engine/episode';
import { narrateEpisode, parseState, serializeState } from './engine/persistence';
import { MapView } from './ui/mapView';
import { createPresenter } from './ui/episodeView';
import { download } from './ui/download';
import { battleModule } from './battles';
import { config } from './config';
import { theme } from './theme';
import { useVirtualClock } from './ui/clock';
import { preloadFlags } from './ui/flags';

// URL overrides for development:
// ?links ?speed=0.5 ?seed=123 ?autostart ?fresh ?nodownload ?safe
// ?render switches to the virtual clock, driven by scripts/render.mjs.
const params = new URLSearchParams(location.search);
if (params.has('speed')) config.episode.speed = Number(params.get('speed'));
if (params.has('seed')) config.episode.seed = Number(params.get('seed'));
if (params.has('nodownload')) config.persistence.autoDownload = false;
const rendering = params.has('render');
if (rendering) {
  config.episode.speed = 1;
  config.persistence.autoDownload = false;
}
const clock = rendering ? useVirtualClock() : null;

// The saved world from the previous episode, or a fresh world if none.
async function loadWorld(atlas: Atlas): Promise<WorldState> {
  if (params.has('fresh')) return initialState(atlas);
  const res = await fetch(config.persistence.savePath, { cache: 'no-store' });
  // The dev server answers missing files with index.html, so check the type.
  if (!res.ok || !res.headers.get('content-type')?.includes('json')) {
    console.info(`No save at ${config.persistence.savePath}; starting a fresh world.`);
    return initialState(atlas);
  }
  const state = parseState(await res.text(), atlas);
  console.info(`Loaded save: next episode ${state.nextEpisode}, ${state.history.length} battles so far.`);
  return state;
}

const stage = document.getElementById('stage')!;
mountStage(stage);

const atlas = loadAtlas();
const graph = buildGraph(atlas);
const state = await loadWorld(atlas);

const map = new MapView(stage, atlas);
map.render(territoryOwners(atlas, state));
if (config.debug.showNeighborLinks || params.has('links')) map.showLinks(graph);
if (params.has('safe')) showSafeZones(stage);

// Everything visible must be ready before the first frame is captured.
await Promise.all([document.fonts.load(`${theme.size.min}px ${theme.type.display.fontFamily}`), preloadFlags()]);

const module = battleModule(config.battle.module);
const presenter = createPresenter(stage, atlas, graph, state, map, module);
// The renderer steps time through this handle and reads `done` + files.
const renderHandle = {
  advance: clock?.advance,
  episode: state.nextEpisode,
  render: config.render,
  stage: config.stage,
  done: false,
};
if (clock) Object.assign(window, { __render: renderHandle });
const summary = await runEpisode(atlas, graph, state, presenter, {
  seed: config.episode.seed,
  battles: config.episode.battles,
  hero: config.battle.heroCountry,
});

const tag = `ep${String(summary.episode).padStart(3, '0')}`;
const log = { episode: summary.episode, seed: config.episode.seed, summary, battles: summary.battles };
const files = {
  [`world-after-${tag}.json`]: serializeState(state),
  [`log-${tag}.json`]: JSON.stringify(log, null, 2),
  [`log-${tag}.txt`]: narrateEpisode(atlas, log, battleModule),
};
// Exposed for the MP4 renderer (which writes them into the project) and debugging.
Object.assign(window, { episodeFiles: files });
renderHandle.done = true;
if (config.persistence.autoDownload)
  for (const [name, content] of Object.entries(files))
    download(name, content, name.endsWith('.txt') ? 'text/plain' : 'application/json');
console.log('episode done', summary.episode, Object.keys(files));
