/**
 * Senaryo kaydı. 26.1 sürümünden itibaren tek senaryo vardır: Modern Dünya (2020).
 */
import type { ScenarioInfo } from './types';
import { MODERN_SCENARIO } from './modern';

export const SCENARIOS: ScenarioInfo[] = [MODERN_SCENARIO];

export function getScenario(id: string): ScenarioInfo | undefined {
  return SCENARIOS.find((s) => s.id === id);
}
