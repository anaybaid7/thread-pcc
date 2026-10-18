import { dayName, node, resolveNext } from './core'
import type { Scenario } from './types'

/**
 * The scenario as a graph, for one course of the day: every node reachable from the start, with the choices that
 * lead out of each decision and what each choice earned. Used by the debrief to let a player explore what any other
 * choice would have led to. Static: it reads the scenario, not an attempt.
 */

export interface MapNode {
  id: string
  label: string
  /** Column: distance from the start. */
  depth: number
  decision: { id: string; title: string; clock: string } | null
  handover: boolean
  facts: { id: string; when: string; text: string; kind: string; onlyIf: string[] | null }[]
}

export interface MapEdge {
  from: string
  to: string
  choice: { id: string; label: string; earned: number; max: number; feedback: string } | null
}

export function scenarioMap(s: Scenario, course: string): { nodes: MapNode[]; edges: MapEdge[] } {
  const depth = new Map<string, number>([[s.start, 0]])
  const edges: MapEdge[] = []
  const queue = [s.start]
  while (queue.length) {
    const id = queue.shift()!
    const n = node(s, id)
    const out: MapEdge[] = []
    if (n.decision) {
      for (const c of n.decision.choices)
        out.push({
          from: id,
          to: resolveNext(c.next, course),
          choice: { id: c.id, label: c.label, earned: c.communication, max: n.decision.communicationMax, feedback: c.feedback },
        })
    } else if (n.next !== undefined) out.push({ from: id, to: resolveNext(n.next, course), choice: null })
    for (const e of out) {
      edges.push(e)
      const d = depth.get(id)! + 1
      if (!depth.has(e.to) || depth.get(e.to)! < d) {
        depth.set(e.to, d)
        queue.push(e.to)
      }
    }
  }
  const nodes: MapNode[] = [...depth.entries()].map(([id, d]) => {
    const n = node(s, id)
    return {
      id,
      label: n.label,
      depth: d,
      decision: n.decision ? { id: n.decision.id, title: n.decision.title, clock: `${dayName(s, n.decision.at.day).slice(0, 3)} ${n.decision.at.clock}` } : null,
      handover: !!n.handover,
      facts: n.events.map((e) => ({
        id: e.id,
        when: `${dayName(s, e.day).slice(0, 3)} ${e.clock}`,
        text: e.fact,
        kind: e.kind,
        onlyIf: e.when?.choices ?? null,
      })),
    }
  })
  return { nodes, edges }
}
