import { describe, expect, it } from 'vitest';
import { loadAtlas } from '../src/engine/atlas';
import { storyBadges, winStreak } from '../src/engine/stories';
import { applyConquest, initialState, resolveConquest } from '../src/engine/world';

const atlas = loadAtlas();
const win = { winner: 'attacker' as const, score: [3, 0] as [number, number], rounds: [] };

describe('story badges', () => {
  it('counts a win streak from the battle history', () => {
    const state = initialState(atlas);
    state.history.push(resolveConquest(state, { attacker: 'fr', defender: 'be' }, win, 'rps', 1, 1));
    state.history.push(resolveConquest(state, { attacker: 'fr', defender: 'lu' }, win, 'rps', 1, 2));
    expect(winStreak(state, 'fr')).toBe(2);
    expect(storyBadges(atlas, state, { attacker: 'fr', defender: 'de' }).attacker).toEqual({ kind: 'streak', value: 2 });
  });

  it('marks a much smaller country as the underdog', () => {
    const state = initialState(atlas);
    const badges = storyBadges(atlas, state, { attacker: 'lu', defender: 'fr' });
    expect(badges.attacker?.kind).toBe('underdog');
    expect(badges.attacker!.value).toBeGreaterThan(100);
    expect(badges.defender).toBeNull();
  });

  it('shows the size of an empire', () => {
    const state = initialState(atlas);
    applyConquest(state, 'de', 'at');
    applyConquest(state, 'pl', 'cz');
    // Germany and Poland are similar in size, and neither has a streak.
    expect(storyBadges(atlas, state, { attacker: 'de', defender: 'pl' })).toEqual({
      attacker: { kind: 'empire', value: 2 },
      defender: { kind: 'empire', value: 2 },
    });
  });
});
