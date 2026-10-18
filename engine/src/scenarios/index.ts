import type { Scenario } from '../types'
import { arthur } from './arthur'
import { evelyn } from './evelyn'
import { ruth } from './ruth'

export { arthur, evelyn, ruth }

/** Evelyn first: the main scenario. */
export const SCENARIOS: Scenario[] = [evelyn, ruth, arthur]

export function getScenario(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id)
}

export function possessive(pronoun: Scenario['resident']['pronoun']) {
  return pronoun === 'she' ? 'her' : pronoun === 'he' ? 'his' : 'their'
}
