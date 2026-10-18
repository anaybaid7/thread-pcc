import type { Event, Resident, Staff, Ward } from './model'

/** Birch wing, Tuesday 10:40. Fictional residents and staff. Vital ranges are illustrative, per person. */

export const t = (day: 'Mon' | 'Tue' | 'Wed', hhmm: string) => ({ Mon: 0, Tue: 1440, Wed: 2880 })[day] + Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3))

export const START = t('Tue', '10:40')

export const STAFF: Staff[] = [
  { id: 'maya', name: 'Maya', role: 'PSW', shift: 'day' },
  { id: 'sam', name: 'Sam', role: 'PSW', shift: 'day' },
  { id: 'priya', name: 'Priya', role: 'RPN', shift: 'day' },
  { id: 'grace', name: 'Grace', role: 'PSW', shift: 'evening' },
  { id: 'daniel', name: 'Daniel', role: 'RPN', shift: 'evening' },
  { id: 'luis', name: 'Luis', role: 'Activity aide', shift: 'any' },
  { id: 'float', name: 'Float PSW', role: 'PSW', shift: 'any' },
  { id: 'osei', name: 'Dr. Osei', role: 'NP', shift: 'any' },
]

const v = (temp: [number, number], pulse: [number, number], sbp: [number, number], spo2: [number, number]) => ({
  temp: { lo: temp[0], hi: temp[1] },
  pulse: { lo: pulse[0], hi: pulse[1] },
  sbp: { lo: sbp[0], hi: sbp[1] },
  spo2: { lo: spo2[0], hi: spo2[1] },
})

export const RESIDENTS: Resident[] = [
  {
    id: 'evelyn',
    name: 'Evelyn Carter',
    preferred: 'Evelyn',
    pronoun: 'she',
    age: 86,
    room: '118',
    assignedTo: 'maya',
    fluids: 1500,
    vitals: v([36.2, 36.8], [66, 80], [118, 138], [95, 98]),
    usual: {
      mobility: 'Up by 07:15 and walks to every meal with her rollator',
      eating: 'Eats most of her breakfast in the dining room',
      drinking: 'Finishes her tea and juice at meals',
      mood: 'Chats with staff; goes to the 10:30 music group',
      thinking: 'Knows the day; does the crossword after lunch',
      pain: 'No pain most days',
    },
  },
  {
    id: 'ruth',
    name: 'Ruth Okafor',
    preferred: 'Ruth',
    pronoun: 'she',
    age: 81,
    room: '108',
    assignedTo: 'maya',
    fluids: 1400,
    vitals: v([36.3, 36.9], [68, 82], [124, 142], [95, 98]),
    usual: {
      thinking: 'Knows the day and crosses it off her calendar',
      mood: 'Stays for the whole afternoon word search',
      eating: 'Eats most of her meals',
      drinking: 'Drinks well when reminded',
      mobility: 'Walks with a cane',
    },
  },
  {
    id: 'joseph',
    name: 'Joseph Brown',
    preferred: 'Joe',
    pronoun: 'he',
    age: 77,
    room: '112',
    assignedTo: 'maya',
    fluids: 1700,
    vitals: v([36.4, 37.0], [62, 76], [130, 150], [94, 97]),
    usual: {
      mobility: 'Walks the corridor twice a day',
      eating: 'Good appetite; second helpings at lunch',
      mood: 'Talks about the Leafs with anyone',
      sleep: 'Up once overnight',
    },
  },
  {
    id: 'agnes',
    name: 'Agnes Novak',
    preferred: 'Agnes',
    pronoun: 'she',
    age: 91,
    room: '115',
    assignedTo: 'maya',
    fluids: 1300,
    vitals: v([36.0, 36.7], [70, 86], [110, 132], [94, 97]),
    usual: {
      mobility: 'Wheelchair; transfers with one person',
      eating: 'Eats about half, with encouragement',
      mood: 'Quiet; enjoys hand massage',
      pain: 'Mild knee pain, worse in the morning',
    },
  },
  {
    id: 'harold',
    name: 'Harold Singh',
    preferred: 'Harold',
    pronoun: 'he',
    age: 79,
    room: '122',
    assignedTo: 'sam',
    fluids: 1600,
    vitals: v([36.4, 37.0], [70, 84], [126, 146], [93, 96]),
    usual: {
      breathing: 'An occasional cough in the morning',
      mobility: 'Walks with a frame, on his own',
      eating: 'Good appetite',
      mood: 'TV room after lunch',
    },
  },
  {
    id: 'arthur',
    name: 'Arthur Bell',
    preferred: 'Arthur',
    pronoun: 'he',
    age: 89,
    room: '131',
    assignedTo: 'sam',
    fluids: 1500,
    vitals: v([36.2, 36.9], [64, 78], [120, 140], [94, 97]),
    usual: {
      drinking: 'Finishes his juice and his 10:00 and 15:00 tea when reminded',
      eating: 'Eats most meals in the dining room',
      mood: 'Jokes with Frank at meals',
      mobility: 'Walks with a cane',
    },
  },
  {
    id: 'margaret',
    name: 'Margaret Liu',
    preferred: 'Margaret',
    pronoun: 'she',
    age: 84,
    room: '110',
    assignedTo: 'sam',
    fluids: 1400,
    vitals: v([36.1, 36.8], [66, 82], [116, 136], [95, 98]),
    usual: {
      drinking: 'Drinks well with meals',
      mood: 'Chatty at breakfast',
      mobility: 'Wheelchair; transfers with one person',
    },
  },
  {
    id: 'walter',
    name: 'Walter Price',
    preferred: 'Walter',
    pronoun: 'he',
    age: 83,
    room: '120',
    assignedTo: 'sam',
    fluids: 1600,
    vitals: v([36.3, 36.9], [60, 74], [128, 148], [94, 97]),
    usual: {
      mobility: 'Walks to meals with a cane',
      thinking: 'Sharp; reads the paper every morning',
      mood: 'Plays cribbage after supper',
    },
  },
]

/** What happened before the demo starts. */
export const HISTORY: Event[] = [
  // Harold: a change reported last evening, a recheck planned for 10:00 today that hasn't happened.
  { type: 'observe', id: 'h1', at: t('Mon', '16:20'), by: 'grace', residentId: 'harold', area: 'breathing', usual: false, finding: 'Coughing more than usual, a few times an hour' },
  { type: 'report', id: 'h2', at: t('Mon', '16:22'), by: 'grace', residentId: 'harold', observed: ['h1'], unknown: [] },
  { type: 'plan', id: 'h3', at: t('Mon', '17:00'), by: 'daniel', concernId: 'h2', decision: 'watch', recheckAt: t('Tue', '10:00'), recheck: ['breathing'] },
  // Margaret: reported last evening, rechecked at breakfast, closed on a recorded outcome.
  { type: 'observe', id: 'g1', at: t('Mon', '19:00'), by: 'grace', residentId: 'margaret', area: 'drinking', usual: false, finding: 'Drank less than usual' },
  { type: 'observe', id: 'g2', at: t('Mon', '19:00'), by: 'grace', residentId: 'margaret', area: 'mood', usual: false, finding: 'Quieter than usual' },
  { type: 'report', id: 'g3', at: t('Mon', '19:02'), by: 'grace', residentId: 'margaret', observed: ['g1', 'g2'], unknown: [] },
  { type: 'plan', id: 'g4', at: t('Mon', '19:30'), by: 'daniel', concernId: 'g3', decision: 'watch', recheckAt: t('Tue', '08:00'), recheck: ['drinking', 'mood'] },
  { type: 'observe', id: 'g5', at: t('Tue', '08:05'), by: 'sam', residentId: 'margaret', area: 'drinking', usual: true, finding: 'Finished her tea and juice at breakfast' },
  { type: 'observe', id: 'g6', at: t('Tue', '08:05'), by: 'sam', residentId: 'margaret', area: 'mood', usual: true, finding: 'Chatty at breakfast' },
  { type: 'resolve', id: 'g7', at: t('Tue', '08:20'), by: 'priya', concernId: 'g3', evidence: ['g5', 'g6'] },
  // Arthur: drinks offered three times, no amount ever recorded.
  { type: 'offer', id: 'a1', at: t('Mon', '10:00'), by: 'float', residentId: 'arthur', what: 'Fluids offered' },
  { type: 'offer', id: 'a2', at: t('Mon', '15:00'), by: 'float', residentId: 'arthur', what: 'Fluids offered' },
  { type: 'offer', id: 'a3', at: t('Tue', '10:00'), by: 'float', residentId: 'arthur', what: 'Fluids offered' },
  // Ruth: the activity aide reported a change at 09:35; no nurse has looked yet.
  { type: 'observe', id: 'r1', at: t('Tue', '09:30'), by: 'luis', residentId: 'ruth', area: 'thinking', usual: false, finding: 'Unsure of day or place', quote: 'Is it Sunday? I’m waiting for church.' },
  { type: 'observe', id: 'r2', at: t('Tue', '09:30'), by: 'luis', residentId: 'ruth', area: 'mood', usual: false, finding: 'Skipped usual activity' },
  { type: 'report', id: 'r3', at: t('Tue', '09:35'), by: 'luis', residentId: 'ruth', observed: ['r1', 'r2'], unknown: ['eating', 'drinking', 'mobility'] },
]

export function seedWard(): Ward {
  return { now: START, events: structuredClone(HISTORY) }
}
