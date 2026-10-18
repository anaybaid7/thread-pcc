import type { Flow, HandoverSpec, Scenario, ScenarioNode } from '../types'

/**
 * Offered Isn't Consumed. Arthur Bell, Birch wing. Entirely synthetic.
 *
 * The chart says "fluids offered", again and again. Nothing says he drank. The player must separate an attempted
 * intervention from its outcome, notice that low intake may be recurring, name what is unknown, and communicate it.
 */

const YOU = 'You (day PSW)'

const handover: HandoverSpec = {
  to: 'Priya, charge nurse (RPN)',
  purpose: 'Tell Priya what you saw of Arthur’s eating and drinking today, what the chart does and doesn’t show, and what isn’t known.',
  situation: {
    text: 'Arthur has drunk very little that anyone saw today and ate about half his lunch. The chart records drinks offered, not how much he drank.',
    factIds: ['f3', 'f4', 'f5'],
  },
  recommendation: 'Please review Arthur’s eating and drinking today. I will record how much he actually drinks each time, not only the offer. Tell me who else should know.',
  expected:
    'Situation: little seen drunk today, half his lunch, and charting that records offers without amounts. Background: his usual intake. Assessment: the full cold cup, the sips at lunch, the two days of “fluids offered”. Recommendation: ask for review and record amounts. Unknowns: how much he drank on the last two days.',
}

const consequence = (id: string, clock: string, text: string, fact: string, flows: Flow[]): ScenarioNode => ({
  id,
  label: 'Thursday · day shift',
  stage: 'C',
  handover,
  events: [{ id: `${id}_e`, day: 1, clock, kind: 'action', source: YOU, by: 'you', flows, text, fact }],
})

export const arthur: Scenario = {
  id: 'arthur',
  version: 2,
  title: 'Offered Isn’t Consumed',
  subtitle: 'Arthur Bell, Birch wing',
  blurb:
    'Arthur’s chart says “fluids offered” at every round for two days. His 10:00 tea is still full and cold. Tell an attempt apart from an outcome, and say what nobody knows.',
  role: 'You are Sam, the day-shift personal support worker (PSW) on Birch wing.',
  days: ['Thursday'],
  window: { start: { day: 1, clock: '07:00' }, end: { day: 1, clock: '15:00' } },
  people: [
    { id: 'you', label: 'Sam (you)', role: 'Day PSW' },
    { id: 'float', label: 'Float PSW', role: 'Covered 10:00' },
    { id: 'priya', label: 'Priya', role: 'Charge nurse' },
    { id: 'record', label: 'Chart', role: 'Written record' },
  ],
  resident: {
    id: 'arthur-bell',
    name: 'Arthur Bell',
    preferredName: 'Arthur',
    pronoun: 'he',
    age: 89,
    room: '131',
    wing: 'Birch',
    summary: 'Retired bus driver. Sharp sense of humour. Needs reminders to drink but usually finishes a cup when one is in front of him.',
    about: ['Prefers ginger ale to water.', 'Sits by the window in the dining room with his friend Frank.', 'Calls everyone “love”.'],
    baseline: [
      { id: 'b1', dimension: 'fluids', text: 'Usually finishes his breakfast juice and his 10:00 and 15:00 tea when reminded' },
      { id: 'b2', dimension: 'intake', text: 'Usually eats most of his meals in the dining room' },
      { id: 'b3', dimension: 'engagement', text: 'Usually chats and jokes with Frank at meals' },
    ],
  },
  dimensions: [
    { key: 'fluids', label: 'Drinks', usual: 'Finishes his juice and tea when reminded' },
    { key: 'intake', label: 'Meal intake', usual: 'Eats most of his meals' },
    { key: 'engagement', label: 'Engagement', usual: 'Chats and jokes with Frank at meals' },
  ],
  baselineSeries: [
    { label: 'Mon', values: { fluids: 95, intake: 95, engagement: 100 } },
    { label: 'Tue', values: { fluids: 90, intake: 100, engagement: 95 } },
    { label: 'Wed', values: { fluids: 100, intake: 90, engagement: 100 } },
    { label: 'Thu', values: { fluids: 95, intake: 95, engagement: 100 } },
    { label: 'Fri', values: { fluids: 90, intake: 100, engagement: 95 } },
    { label: 'Sat', values: { fluids: 100, intake: 95, engagement: 100 } },
    { label: 'Sun', values: { fluids: 95, intake: 90, engagement: 95 } },
  ],
  courses: [{ id: 'main', label: 'Thursday', summary: 'Arthur’s low intake may have been going on for two days behind “fluids offered”.' }],
  defaultCourse: 'main',
  start: 'thu_morning',
  insight: 'An offer is an action, not an outcome. When the record shows only what was tried, say so, and ask for what actually happened to be recorded.',
  nodes: Object.fromEntries(
    (
      [
        {
          id: 'thu_morning',
          label: 'Thursday · day shift',
          stage: 'B',
          events: [
            {
              id: 'f1',
              day: 1,
              clock: '08:15',
              kind: 'observation',
              source: YOU,
              by: 'you',
              text: 'Breakfast in the dining room. Arthur eats most of it but leaves his juice untouched.',
              fact: 'Breakfast: ate most; left his juice untouched (usually finishes it)',
              measures: { intake: 90, fluids: 40 },
            },
            {
              id: 'f2',
              day: 1,
              clock: '10:05',
              kind: 'documentation',
              source: 'Float PSW note',
              by: 'float',
              flows: [{ from: 'float', to: 'record', passed: true, note: 'Charted “fluids offered”, no amount' }],
              text: 'A float PSW charts at 10:00: “Fluids offered.”',
              fact: 'Charted at 10:00 by a float PSW: “Fluids offered” (no amount)',
            },
            {
              id: 'f3',
              day: 1,
              clock: '11:30',
              kind: 'observation',
              source: YOU,
              by: 'you',
              aware: ['you'],
              text: 'The cup of tea from 10:00 is still full and cold on his table.',
              fact: 'At 11:30 the 10:00 tea was still full and cold',
              measures: { fluids: 25 },
            },
            {
              id: 'f4',
              day: 1,
              clock: '11:35',
              kind: 'documentation',
              source: 'Flowsheet',
              by: 'record',
              text: 'The flowsheet shows “Fluids offered” at 10:00 and 15:00 on Tuesday and Wednesday too. No amounts are recorded on any of them.',
              fact: 'Flowsheet Tuesday and Wednesday: “Fluids offered” at 10:00 and 15:00, no amounts recorded',
            },
            {
              id: 'f5',
              day: 1,
              clock: '12:30',
              kind: 'observation',
              source: YOU,
              by: 'you',
              text: 'At lunch he eats about half and takes a few sips of water.',
              quote: 'Not thirsty, love.',
              fact: 'Lunch: ate about half; a few sips of water; said he wasn’t thirsty',
              measures: { intake: 50, fluids: 25 },
            },
            {
              id: 'f6',
              day: 1,
              clock: '12:45',
              kind: 'observation',
              source: YOU,
              by: 'you',
              text: 'He is quiet at the table and doesn’t joke with Frank. His lips look dry.',
              fact: 'Quiet at lunch, not joking with Frank; lips looked dry',
              measures: { engagement: 50 },
            },
            {
              id: 'f7',
              day: 1,
              clock: '12:50',
              kind: 'unknown',
              source: 'Chart check',
              by: 'record',
              text: 'Not known: how much he actually drank on Tuesday and Wednesday, or at any point today apart from the sips you saw.',
              fact: 'Not known: amounts drunk on Tuesday, Wednesday or today beyond the sips seen',
            },
          ],
          decision: {
            id: 'd1',
            at: { day: 1, clock: '12:55' },
            title: 'Thursday 12:55. The chart says fluids were offered.',
            prompt: 'The record says Arthur was offered drinks all week. What do you do?',
            recognition: {
              kind: 'dimensions',
              prompt: 'Which parts of Arthur’s usual pattern look different?',
              options: [
                { id: 'fluids', label: 'Drinks', changed: true, why: 'Juice untouched, tea left full, a few sips at lunch; he usually finishes them.' },
                { id: 'intake', label: 'Meal intake', changed: true, why: 'About half his lunch; he usually eats most.' },
                { id: 'engagement', label: 'Engagement', changed: true, why: 'Quiet, not joking with Frank as he usually does.' },
                { id: 'mobility', label: 'Mobility', changed: false, why: 'Nothing anyone saw describes a change in how he moves.' },
              ],
              pointsPerHit: 10,
              penaltyPerFalse: 6,
              max: 30,
            },
            pointsPerStatement: 5,
            statements: [
              { id: 's1', text: 'A drink was offered at 10:00.', answer: 'observed', why: 'It is documented at 10:00.' },
              { id: 's2', text: 'He didn’t drink his 10:00 tea.', answer: 'observed', why: 'You saw the cup still full and cold at 11:30.' },
              {
                id: 's3',
                text: 'He drank enough on Tuesday and Wednesday.',
                answer: 'unknown',
                why: 'Only offers were charted, with no amounts. An offer records an attempt, not an outcome.',
              },
              { id: 's4', text: 'He’s dehydrated.', answer: 'assumption', why: 'Low intake is a reason to ask for review. Whether he is dehydrated is for the nurse to assess.' },
              { id: 's5', text: 'He’s refusing drinks to be stubborn.', answer: 'assumption', why: 'A guess about his motives. What was seen is that he didn’t drink and said he wasn’t thirsty.' },
            ],
            communicationMax: 30,
            choices: [
              {
                id: 'report',
                label: 'Tell Priya now: little drunk today, and two days of offers with no amounts',
                detail: 'Describe what you saw, what the chart does and doesn’t show, and what isn’t known.',
                communication: 30,
                feedback:
                  'You separated the attempt (offered) from the outcome (not drunk), noticed it may have been going on for two days, and passed it on with what isn’t known. That is exactly what the nurse needs.',
                next: 'thu_report',
              },
              {
                id: 'record',
                label: 'Start recording the amounts he drinks, and report at the end of shift',
                detail: 'Fix the record first.',
                communication: 18,
                feedback:
                  'Recording actual amounts closes the gap in the record, which is good practice. But low intake that may have been going on for two days should reach the nurse now, not at 15:00.',
                next: 'thu_record',
              },
              {
                id: 'offer',
                label: 'Offer him a ginger ale and chart “fluids offered”',
                detail: 'Try his favourite drink.',
                communication: 8,
                feedback:
                  'Offering his preferred drink is good care. But charting another “fluids offered” repeats the gap: it records the attempt, not whether he drank, and nobody who can assess him hears about the pattern.',
                next: 'thu_offer',
              },
              {
                id: 'fine',
                label: 'The chart shows fluids offered all week, so he’s fine',
                detail: 'Trust the record.',
                communication: 0,
                assumes: true,
                feedback: 'The chart shows offers, not outcomes. Treating “offered” as “drank” turns a gap in the record into a false reassurance.',
                next: 'thu_fine',
              },
            ],
            expected:
              'Notice that drinks, meals and engagement are all below his usual. Keep “offered” apart from “drank”: the record shows attempts, not outcomes. Tell the nurse now, including the two days of offers without amounts and what isn’t known.',
          },
        },
        consequence('thu_report', '13:00', 'You tell Priya what you saw today and that the last two days show offers with no amounts. She comes to see Arthur and asks you to write it up.', 'Reported to the charge nurse at 13:00', [{ from: 'you', to: 'priya', passed: true, note: 'Told Priya at 13:00' }]),
        consequence('thu_record', '14:50', 'You record each drink: by 14:30, about half a cup of ginger ale. You plan to tell Priya at 15:00.', 'Recorded amounts from 13:00: about half a cup by 14:30', [{ from: 'you', to: 'record', passed: true, note: 'Amounts recorded from 13:00' }, { from: 'you', to: 'priya', passed: false, note: 'Not told until 15:00' }]),
        consequence('thu_offer', '13:15', 'Arthur takes the ginger ale and has a sip. You chart “Fluids offered.”', 'Ginger ale offered at 13:15; a sip seen; charted as “Fluids offered”', [{ from: 'you', to: 'record', passed: true, note: 'Charted “fluids offered” again' }, { from: 'you', to: 'priya', passed: false, note: 'Charge nurse not told' }]),
        consequence('thu_fine', '14:45', 'At 14:45 Priya asks how Arthur’s day has been. It is time for your handover.', 'Not reported before 14:45', [{ from: 'you', to: 'priya', passed: false, note: 'Not told; Priya asked at 14:45' }]),
      ] satisfies ScenarioNode[]
    ).map((n) => [n.id, n]),
  ),
}
