import type { Scenario } from '../types'
import { evelyn } from './evelyn'

export { evelyn }

export const SCENARIOS: Scenario[] = [evelyn]

export function getScenario(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id)
}
