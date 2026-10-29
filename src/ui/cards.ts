import type { Atlas } from '../engine/atlas';
import type { EpisodeSummary, Standing } from '../engine/episode';
import { config } from '../config';
import { theme } from '../theme';
import { flagImg, h, px, sticker, stickerEdge, text } from './dom';
import { duration, wait } from './clock';
import { flagUrl } from './flags';
import { startHint } from './stage';

const c = theme.color;
const { left, right, top, bottom } = theme.layout.safe;
const { gap, pad } = theme.size;

// Resolves when the viewer starts the episode: Space/Enter, a click, or
// immediately with ?autostart. The hint lives outside the stage.
function waitForStart(stage: HTMLElement): Promise<void> {
  if (new URLSearchParams(location.search).has('autostart')) return Promise.resolve();
  const hint = startHint('Press SPACE or click to start');
  return new Promise((resolve) => {
    const done = () => {
      window.removeEventListener('keydown', onKey);
      stage.removeEventListener('click', done);
      hint.remove();
      resolve();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') done();
    };
    window.addEventListener('keydown', onKey);
    stage.addEventListener('click', done);
  });
}

// Stickers pop in: they rise, overshoot, and settle.
function popIn(node: HTMLElement, delay: number): void {
  node.animate([{ transform: `translateY(${px(theme.size.hand / 2)}) scale(0.6)`, opacity: 0 }, { transform: 'none', opacity: 1 }], {
    duration: duration(config.timing.hookIn),
    delay: duration(delay),
    easing: theme.motion.pop,
    fill: 'backwards',
  });
}

// Alternate slight tilts so a stack of stickers looks hand-placed.
const tilted = (node: HTMLElement, i: number) =>
  h('div', { transform: `rotate(${(i % 2 ? 1 : -1) * theme.shape.tilt}deg)` }, [node]);

const smallFlag = (code: string, width: number, style: Partial<CSSStyleDeclaration> = {}) =>
  flagImg(flagUrl(code), width, { ...stickerEdge(theme.size.radius / 3), borderWidth: px(theme.shape.stickerWidth / 2), ...style });

// Opening hook over the live map: episode, countries left, the question.
export async function showIntro(stage: HTMLElement, episode: number, countriesLeft: number): Promise<void> {
  await waitForStart(stage);
  const t = config.timing;
  const bars = [
    sticker(c.accent, [text(`EPISODE ${episode}`, 'display', theme.size.heading, c.onAccent)], { padding: `${px(gap / 2)} ${px(pad)}` }),
    sticker(c.paper, [text(`${countriesLeft} COUNTRIES`, 'display', theme.size.hero, c.textOnPaper)], { padding: `${px(gap / 2)} ${px(pad)}` }),
    sticker(c.ink, [text(theme.brand.hook, 'display', theme.size.heading, c.accent)], { padding: `${px(gap / 2)} ${px(pad)}` }),
  ];
  const hook = h('div', {
    position: 'absolute',
    left: px(left),
    top: px(theme.layout.hook.top),
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: px(gap),
  }, bars.map(tilted));
  stage.appendChild(hook);
  bars.forEach((bar, i) => popIn(bar, i * t.hookStagger));
  await wait(t.hookIn + t.hookStagger * bars.length + t.introHold);
  hook.animate([{ transform: 'none', opacity: 1 }, { transform: 'scale(0.6)', opacity: 0 }], {
    duration: duration(t.hookOut),
    easing: theme.motion.exit,
    fill: 'forwards',
  });
  await wait(t.hookOut);
  hook.remove();
}

function resultRow(atlas: Atlas, winner: string, loser: string, score: [number, number], attackerWon: boolean) {
  const name = (code: string) => atlas.countries.get(code)!.name;
  const [w, l] = attackerWon ? score : [score[1], score[0]];
  const flagW = theme.size.flagWidth / 2;
  return h('div', { display: 'flex', alignItems: 'center', gap: px(gap), background: c.paper, padding: px(gap / 2), ...stickerEdge() }, [
    smallFlag(winner, flagW),
    h('div', { flex: '1', minWidth: '0' }, [
      text(name(winner).toUpperCase(), 'display', theme.size.name, c.textOnPaper, { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }),
      text(`BEAT ${name(loser).toUpperCase()} ${w}–${l}`, 'label', theme.size.min, c.mutedOnPaper, { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }),
    ]),
    smallFlag(loser, flagW, { filter: 'grayscale(1)', opacity: '0.6' }),
  ]);
}

function leaderboard(atlas: Atlas, title: string, rows: Standing[], format: (v: number) => string) {
  return h('div', { flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column', gap: px(gap / 2) }, [
    sticker(c.ink, [text(title, 'label', theme.size.label, c.accent)], { padding: `${px(gap / 3)} ${px(gap)}`, alignSelf: 'flex-start' }),
    ...rows.map((r, i) =>
      h('div', { display: 'flex', alignItems: 'center', gap: px(gap / 2) }, [
        text(String(i + 1), 'display', theme.size.body, c.muted, { width: px(theme.size.body * 0.7) }),
        smallFlag(r.code, theme.size.flagWidth / 3),
        text(atlas.countries.get(r.code)!.name.toUpperCase(), 'display', theme.size.min, c.text, {
          flex: '1', minWidth: '0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }),
        text(format(r.value), 'display', theme.size.body, c.accent),
      ]),
    ),
  ]);
}

export async function showSummary(stage: HTMLElement, atlas: Atlas, s: EpisodeSummary): Promise<void> {
  const rows = s.battles.map((b) => resultRow(atlas, b.winner, b.loser, b.score, b.winner === b.attacker));
  const content = h('div', {
    position: 'absolute',
    left: px(left),
    width: px(right - left),
    top: px(top + gap),
    height: px(bottom - top - 2 * gap),
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
  }, [
    sticker(c.accent, [text(`EPISODE ${s.episode} · ${theme.brand.results}`, 'display', theme.size.heading, c.onAccent)], {
      padding: `${px(gap / 2)} ${px(pad)}`, alignSelf: 'flex-start',
    }),
    h('div', { display: 'flex', flexDirection: 'column', gap: px(gap / 2) }, rows),
    h('div', { display: 'flex', gap: px(gap * 2) }, [
      leaderboard(atlas, 'MOST WINS', s.topWins, (v) => String(v)),
      leaderboard(atlas, 'MOST LAND', s.topLand, (v) => `${(v * 100).toFixed(1)}%`),
    ]),
    sticker(c.paper, [
      text(String(s.countriesLeft), 'display', theme.size.hero, c.textOnPaper),
      h('div', { marginLeft: px(gap) }, [
        text('COUNTRIES', 'label', theme.size.label, c.mutedOnPaper),
        text(`LEFT OF ${s.countriesTotal}`, 'label', theme.size.label, c.mutedOnPaper),
      ]),
    ], { padding: `${px(gap / 2)} ${px(pad)}`, alignSelf: 'flex-start' }),
    sticker(c.ink, [text(`${theme.brand.cta} ${s.episode + 1}`, 'display', theme.size.heading, c.accent)], {
      padding: `${px(gap / 2)} ${px(pad)}`, justifyContent: 'center',
    }),
  ]);
  const card = h('div', { position: 'absolute', inset: '0', background: c.overlay }, [content]);
  stage.appendChild(card);
  card.animate([{ opacity: 0 }, { opacity: 1 }], { duration: duration(config.timing.cardFade), fill: 'forwards' });
  [...content.children].forEach((child, i) => popIn(child as HTMLElement, config.timing.cardFade + i * config.timing.hookStagger));
  await wait(config.timing.cardFade + config.timing.hookIn + config.timing.hookStagger * content.children.length);
}

// A big tilted sticker stamped over the map (e.g. "K.O.!" as a flag falls).
// Returns a function that peels it off again.
export function stamp(stage: HTMLElement, label: string): () => Promise<void> {
  const { top: boxTop, height } = config.camera.box;
  const node = sticker(c.accent, [text(label, 'display', theme.size.hero, c.onAccent)], { padding: `0 ${px(pad)}` });
  const holder = h('div', {
    position: 'absolute',
    left: '0',
    right: '0',
    top: px(boxTop + height / 2),
    display: 'flex',
    justifyContent: 'center',
    transform: `translateY(-50%) rotate(${-theme.shape.tilt * 3}deg)`,
    pointerEvents: 'none',
  }, [node]);
  stage.appendChild(holder);
  node.animate([{ transform: 'scale(2.4)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], {
    duration: duration(config.timing.stampIn),
    easing: theme.motion.pop,
    fill: 'backwards',
  });
  return async () => {
    node.animate([{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(0.5)', opacity: 0 }], {
      duration: duration(config.timing.stampOut),
      easing: theme.motion.exit,
      fill: 'forwards',
    });
    await wait(config.timing.stampOut);
    holder.remove();
  };
}

// A white flash over the whole stage: the impact frame of a K.O.
export function flash(stage: HTMLElement): void {
  const node = h('div', { position: 'absolute', inset: '0', background: c.flash, pointerEvents: 'none' });
  stage.appendChild(node);
  node
    .animate([{ opacity: config.map.impact.flashOpacity }, { opacity: 0 }], { duration: duration(config.timing.flash), easing: 'ease-out' })
    .finished.then(() => node.remove());
}
