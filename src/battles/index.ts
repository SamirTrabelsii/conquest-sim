import type { BattleModule } from './types';
import { rps } from './rps';

const modules: Record<string, BattleModule> = { [rps.id]: rps };

export function battleModule(id: string): BattleModule {
  const m = modules[id];
  if (!m) throw new Error(`Unknown battle module "${id}"`);
  return m;
}
