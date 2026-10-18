import type { HandoverSpec, Scenario, ScenarioNode } from '../types'

/**
 * Not Quite Herself. Ruth Okafor, Cedar wing. Entirely synthetic.
 *
 * A new change in orientation since breakfast. The point is to notice it relative to her baseline and get it to the
 * nurse promptly, described as observations, without naming a cause.
 */

const YOU = 'You (day PSW)'

const handover: HandoverSpec = {
  to: 'Daniel, charge nurse (RPN)',
  purpose: 'Tell Daniel what is different about Ruth’s thinking today compared with her usual, since when, and what isn’t known.',
  situation: {
    text: 'Since lunch Ruth has been unsure of the day and called staff by family names. At breakfast she was her usual self.',
    factIds: ['o1', 'o3', 'o4'],
  },
  recommendation: 'Please assess Ruth this afternoon. Tell me what to watch for and record until then, and whether her son should be called.',
  expected:
    'Situation: a new change in orientation since breakfast. Background: she usually knows the day and greets staff by name. Assessment: the timed observations, including the 10:00 note that she was herself. Recommendation: ask for an assessment now. Unknowns: when exactly it started, fluids since lunch, pain, sleep.',
}

const consequence = (id: string, clock: string, text: string, fact: string): ScenarioNode => ({
  id,
  label: 'Wednesday · afternoon',
  stage: 'C',
  handover,
  events: [{ id: `${id}_e`, day: 1, clock, kind: 'action', source: YOU, text, fact }],
})

export const ruth: Scenario = {
  id: 'ruth',
  version: 1,
  title: 'Not Quite Herself',
  subtitle: 'Ruth Okafor, Cedar wing',
  blurb:
    'Ruth always knows the day: she crosses it off her calendar. This afternoon she asks if it’s Sunday. Recognise a new change in her thinking and get it to the nurse, without guessing why.',
  role: 'You are Sam, the day-shift personal support worker (PSW) on Cedar wing.',
  days: ['Wednesday'],
  resident: {
    id: 'ruth-okafor',
    name: 'Ruth Okafor',
    preferredName: 'Ruth',
    pronoun: 'she',
    age: 81,
    room: '204',
    wing: 'Cedar',
    summary: 'Retired bookkeeper. Moved in last spring after a fall. Walks with a cane.',
    about: ['Her son Michael visits on Saturdays and phones most evenings.', 'Goes to the Sunday service in the chapel.', 'Loves word searches and keeps score at bingo.'],
    baseline: [
      { id: 'b1', dimension: 'orientation', text: 'Usually knows the day and date, and crosses each day off her wall calendar' },
      { id: 'b2', dimension: 'engagement', text: 'Usually greets staff by name and stays for the whole afternoon word-search group' },
      { id: 'b3', dimension: 'intake', text: 'Usually eats most of her meals in the dining room' },
    ],
  },
  dimensions: [
    { key: 'orientation', label: 'Orientation', usual: 'Knows the day; greets staff by name' },
    { key: 'engagement', label: 'Engagement', usual: 'Stays for the whole word-search group' },
    { key: 'intake', label: 'Meal intake', usual: 'Eats most of her meals' },
  ],
  baselineSeries: [
    { label: 'Mon', values: { orientation: 100, engagement: 95, intake: 95 } },
    { label: 'Tue', values: { orientation: 100, engagement: 100, intake: 90 } },
    { label: 'Wed', values: { orientation: 95, engagement: 100, intake: 100 } },
    { label: 'Thu', values: { orientation: 100, engagement: 90, intake: 95 } },
    { label: 'Fri', values: { orientation: 100, engagement: 100, intake: 100 } },
    { label: 'Sat', values: { orientation: 100, engagement: 95, intake: 90 } },
    { label: 'Sun', values: { orientation: 100, engagement: 100, intake: 95 } },
  ],
  courses: [{ id: 'main', label: 'Wednesday afternoon', summary: 'Ruth’s change in orientation was new since breakfast.' }],
  defaultCourse: 'main',
  start: 'wed_afternoon',
  insight: 'A change in thinking that is new since this morning is a change for her, whatever the cause. Describe it, time it, and tell someone now.',
  nodes: Object.fromEntries(
    (
      [
        {
          id: 'wed_afternoon',
          label: 'Wednesday · afternoon',
          stage: 'B',
          events: [
            {
              id: 'o1',
              day: 1,
              clock: '13:30',
              kind: 'observation',
              source: YOU,
              text: 'Ruth asks you what day it is. She usually tells you, and her calendar isn’t crossed off for today.',
              quote: 'Is it Sunday? I’m waiting for church.',
              fact: 'Asked what day it was; thought it was Sunday (usually knows the day)',
              measures: { orientation: 40 },
            },
            {
              id: 'o2',
              day: 1,
              clock: '13:40',
              kind: 'observation',
              source: YOU,
              text: 'She ate about half her lunch, slowly, and needed reminding to keep eating.',
              fact: 'Lunch: ate about half; needed reminding to keep eating',
              measures: { intake: 60 },
            },
            {
              id: 'o3',
              day: 1,
              clock: '14:05',
              kind: 'observation',
              source: 'Luis, activity aide',
              text: 'At word search, Ruth called Luis “Michael”, her son’s name, and left after five minutes. She usually stays the whole hour.',
              fact: 'Called the activity aide by her son’s name; left word search after five minutes (usually stays the hour)',
              measures: { orientation: 35, engagement: 35 },
            },
            {
              id: 'o4',
              day: 1,
              clock: '14:15',
              kind: 'documentation',
              source: 'Day RPN note, 10:00',
              text: 'The 10:00 note reads: “Pleasant and chatty at breakfast. Ate well.”',
              fact: 'Day RPN note 10:00: pleasant and chatty at breakfast, ate well',
            },
            {
              id: 'o5',
              day: 1,
              clock: '14:30',
              kind: 'observation',
              source: YOU,
              text: 'Back in her room she is picking at her blanket and says the lights are too bright.',
              fact: 'In her room at 14:30: picking at her blanket; said the lights were too bright',
              measures: { orientation: 30 },
            },
            {
              id: 'o6',
              day: 1,
              clock: '14:35',
              kind: 'unknown',
              source: 'Chart check',
              text: 'Not known: exactly when this started between breakfast and 13:30, how much she has drunk since lunch, whether she has pain, and how she slept.',
              fact: 'Not known: when it started after breakfast, fluids since lunch, pain, sleep',
            },
          ],
          decision: {
            id: 'd1',
            at: { day: 1, clock: '14:40' },
            title: 'Wednesday 14:40. Not quite herself.',
            prompt: 'Ruth is not her usual self this afternoon. What do you do?',
            recognition: {
              kind: 'dimensions',
              prompt: 'Which parts of Ruth’s usual pattern look different today?',
              options: [
                { id: 'orientation', label: 'Orientation', changed: true, why: 'Thought it was Sunday and called Luis by her son’s name.' },
                { id: 'engagement', label: 'Engagement', changed: true, why: 'Left word search after five minutes; she usually stays the hour.' },
                { id: 'intake', label: 'Meal intake', changed: true, why: 'About half her lunch, with reminders; she usually eats most of it.' },
                { id: 'mobility', label: 'Mobility', changed: false, why: 'Nothing anyone saw describes a change in how she walks.' },
                { id: 'sleep', label: 'Sleep', changed: false, why: 'Nothing is recorded about her sleep; that is unknown, not changed.' },
              ],
              pointsPerHit: 10,
              penaltyPerFalse: 6,
              max: 30,
            },
            pointsPerStatement: 5,
            statements: [
              { id: 's1', text: 'She asked what day it was and said she was waiting for church.', answer: 'observed', why: 'You heard it at 13:30.' },
              {
                id: 's2',
                text: 'She was chatty and her usual self at breakfast.',
                answer: 'observed',
                why: 'The 10:00 note records it. That is what makes this a new change since the morning.',
              },
              { id: 's3', text: 'She has delirium.', answer: 'assumption', why: 'A possible explanation the nurse may assess for, not something anyone observed.' },
              {
                id: 's4',
                text: 'Her memory is just getting worse with age.',
                answer: 'assumption',
                why: 'A change since this morning is a change from her own baseline, not slow decline to explain away.',
              },
              { id: 's5', text: 'She has had enough to drink since lunch.', answer: 'unknown', why: 'Nothing has been recorded since lunch.' },
            ],
            communicationMax: 30,
            choices: [
              {
                id: 'tell',
                label: 'Tell Daniel, the charge nurse, now',
                detail: 'Say what’s different from her usual, that she was herself at breakfast, and what isn’t known.',
                communication: 30,
                feedback:
                  'A new change in how someone is thinking, compared with this morning, needs to reach the nurse promptly. Saying when she was last her usual self is one of the most useful facts you can give.',
                next: 'wed_told',
              },
              {
                id: 'reorient',
                label: 'Gently reorient her, settle her, and mention it at the 15:00 handover',
                detail: 'Help her first; report later.',
                communication: 15,
                feedback:
                  'Reorienting her kindly is good care and earns credit. But a change in thinking that is new since breakfast shouldn’t wait for shift change: the nurse needs to hear it now.',
                next: 'wed_reorient',
              },
              {
                id: 'cause',
                label: 'Tell Daniel that Ruth has delirium, probably from an infection',
                detail: 'Lead with the likely cause.',
                communication: 10,
                assumes: true,
                feedback:
                  'Telling the nurse promptly earns some credit. But naming delirium and a cause is a conclusion nobody has assessed. Describe what you saw and when she was last herself; let the nurse assess.',
                next: 'wed_cause',
              },
              {
                id: 'leave',
                label: 'Leave it. Older people have confused moments.',
                detail: 'Don’t mention it.',
                communication: 0,
                feedback:
                  'Compared with her own baseline this morning, this is a clear change, not a usual “confused moment” for Ruth. Leaving it means nobody who can assess her knows.',
                next: 'wed_leave',
              },
            ],
            expected:
              'Notice the change in orientation and engagement relative to her usual, and that it is new since breakfast. Keep observations apart from causes. Tell the charge nurse now, including when she was last herself and what isn’t known.',
          },
        },
        consequence('wed_told', '14:45', 'You find Daniel and describe what you saw since 13:30, and that she was herself at breakfast. He goes to see Ruth and asks you to write it up.', 'Reported to the charge nurse at 14:45'),
        consequence('wed_reorient', '15:00', 'You settle Ruth in her chair and remind her it’s Wednesday. At the 15:00 handover you mention she has been “a bit confused”.', 'Reoriented at 14:45; mentioned at the 15:00 handover as “a bit confused”'),
        consequence('wed_cause', '14:45', 'You tell Daniel Ruth has delirium from an infection. He asks what you actually saw and when she was last herself, then goes to see her.', 'Reported to the charge nurse at 14:45, first as a guessed cause, then as observations'),
        consequence('wed_leave', '15:00', 'At 15:00 the evening PSW asks how Ruth’s day was. It is time for your handover.', 'Not reported before the 15:00 handover'),
      ] satisfies ScenarioNode[]
    ).map((n) => [n.id, n]),
  ),
}
