import type { Rng } from '../engine/rng';

export interface Fighter {
  code: string;
  name: string;
}

export type Side = 'attacker' | 'defender';

export interface BattleResult {
  winner: Side;
  score: [number, number]; // attacker, defender
  rounds: unknown[]; // module-specific, recorded in the battle log
}

// What the duel panel offers a battle module.
export interface DuelUI {
  arena: HTMLElement; // module-owned area between the two fighters
  setScore(attacker: number, defender: number): void;
  caption(text: string, color?: string): void;
}

// A module decides the outcome up front from the RNG alone (so episodes can be
// simulated and verified without a browser), then animates that outcome.
export interface BattleModule {
  id: string;
  title: string; // shown on screen, e.g. "Rock Paper Scissors"
  target: number; // wins needed, for the score pips
  resolve(rng: Rng): BattleResult;
  animate(result: BattleResult, attacker: Fighter, defender: Fighter, ui: DuelUI): Promise<void>;
  // One plain-English line per round, for the battle log / voiceover script.
  narrate(result: BattleResult, attacker: Fighter, defender: Fighter): string[];
}

export async function runBattle(
  module: BattleModule,
  attacker: Fighter,
  defender: Fighter,
  rng: Rng,
  ui: DuelUI,
): Promise<BattleResult> {
  const result = module.resolve(rng);
  await module.animate(result, attacker, defender, ui);
  return result;
}
