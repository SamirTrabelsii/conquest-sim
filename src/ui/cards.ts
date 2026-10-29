import type { Atlas } from '../engine/atlas';
import type { EpisodeSummary } from '../engine/episode';
import { config } from '../config';
import { theme } from '../theme';
import { h, px } from './dom';
import { duration, wait } from './clock';
import { flagUrl } from './flags';

function overlay(parent: HTMLElement, children: HTMLElement[]): HTMLElement {
  const node = h('div', {
    position: 'absolute',
    inset: '0',
    background: theme.color.card,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: px(theme.size.gap * 2),
    padding: px(theme.layout.gutter * 2),
    textAlign: 'center',
  }, children);
  parent.appendChild(node);
  return node;
}

function fade(node: HTMLElement, from: number, to: number, ms: number): Promise<void> {
  node.animate([{ opacity: from }, { opacity: to }], { duration: duration(ms), fill: 'forwards' });
  return wait(ms);
}

const text = (content: string, size: number, color: string = theme.color.text, display = true) =>
  h('div', {
    fontFamily: display ? theme.font.display : theme.font.body,
    fontWeight: display ? '400' : '700',
    fontSize: px(size),
    color,
    lineHeight: '1.1',
  }, [content]);

function flag(code: string, width: number): HTMLImageElement {
  const img = h('img', {
    width: px(width),
    height: px(width / config.map.flagAspect),
    objectFit: 'cover',
    borderRadius: px(theme.size.radius / 4),
    boxShadow: `0 0 0 3px ${theme.color.panelEdge}`,
  });
  img.src = flagUrl(code);
  return img;
}

// Resolves when the viewer starts the episode: Space/Enter, a click, or
// immediately with ?autostart.
function waitForStart(stage: HTMLElement): Promise<void> {
  if (new URLSearchParams(location.search).has('autostart')) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      window.removeEventListener('keydown', onKey);
      stage.removeEventListener('click', done);
      resolve();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') done();
    };
    window.addEventListener('keydown', onKey);
    stage.addEventListener('click', done);
  });
}

export async function showIntro(stage: HTMLElement, episode: number, countriesLeft: number): Promise<void> {
  const hint = text('Press SPACE to start', theme.size.small, theme.color.textMuted, false);
  const card = overlay(stage, [
    text(theme.brand.name, theme.size.title * 1.4, theme.color.accent),
    text(theme.brand.tagline, theme.size.body, theme.color.textMuted, false),
    text(`EPISODE ${episode}`, theme.size.title),
    text(`${countriesLeft} countries remain`, theme.size.body, theme.color.text, false),
    hint,
  ]);
  await waitForStart(stage);
  hint.remove();
  await wait(config.timing.introHold);
  await fade(card, 1, 0, config.timing.cardFade);
  card.remove();
}

function battleRow(atlas: Atlas, winner: string, loser: string, score: [number, number], attackerWon: boolean) {
  const name = (code: string) => atlas.countries.get(code)!.name;
  const [w, l] = attackerWon ? score : [score[1], score[0]];
  const size = theme.size.flagWidth / 2.5;
  return h('div', { display: 'flex', alignItems: 'center', gap: px(theme.size.gap), width: '100%' }, [
    flag(winner, size),
    h('div', { flex: '1', textAlign: 'left' }, [
      text(name(winner), theme.size.body),
      text(`beat ${name(loser)} ${w}–${l}`, theme.size.small, theme.color.textMuted, false),
    ]),
    flag(loser, size),
  ]);
}

function statRow(atlas: Atlas, label: string, code: string, value: string) {
  return h('div', {
    display: 'flex',
    alignItems: 'center',
    gap: px(theme.size.gap),
    width: '100%',
    padding: px(theme.size.gap),
    border: `2px solid ${theme.color.panelEdge}`,
    borderRadius: px(theme.size.radius),
  }, [
    flag(code, theme.size.flagWidth / 2),
    h('div', { flex: '1', textAlign: 'left' }, [
      text(label.toUpperCase(), theme.size.small, theme.color.accent, false),
      text(atlas.countries.get(code)!.name, theme.size.heading * 0.8),
    ]),
    text(value, theme.size.heading),
  ]);
}

export async function showSummary(stage: HTMLElement, atlas: Atlas, s: EpisodeSummary): Promise<void> {
  const rows = s.battles.map((b) => battleRow(atlas, b.winner, b.loser, b.score, b.winner === b.attacker));
  const card = overlay(stage, [
    text(`END OF EPISODE ${s.episode}`, theme.size.heading, theme.color.accent),
    h('div', { display: 'flex', flexDirection: 'column', gap: px(theme.size.gap), width: '100%' }, rows),
    h('div', { display: 'flex', flexDirection: 'column', gap: px(theme.size.gap), width: '100%' }, [
      h('div', {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        width: '100%',
        padding: px(theme.size.gap),
        border: `2px solid ${theme.color.panelEdge}`,
        borderRadius: px(theme.size.radius),
      }, [
        text('COUNTRIES REMAINING', theme.size.small, theme.color.accent, false),
        text(`${s.countriesLeft} / ${s.countriesTotal}`, theme.size.heading),
      ]),
      statRow(atlas, 'Most battles won', s.mostWins.code, String(s.mostWins.value)),
      statRow(atlas, 'Most land controlled', s.mostLand.code, `${(s.mostLand.value * 100).toFixed(1)}%`),
    ]),
    text('TO BE CONTINUED…', theme.size.title * 0.8, theme.color.accent),
  ]);
  await fade(card, 0, 1, config.timing.cardFade);
}
