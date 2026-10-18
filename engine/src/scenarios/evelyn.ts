import type { Choice, Flow, ScenarioEvent, ScenarioNode, Scenario, Statement } from '../types'

/**
 * Off Day or Something More? Evelyn Carter, Birch wing. Entirely synthetic.
 *
 * One morning, three parts of Evelyn's usual pattern change at once. The player decides at Monday 11:00 with what is
 * known then. The day then follows one of two courses (the change persists, or it resolves), and the player's earlier
 * choice decides whether the nurse and evening staff knew. Scores never depend on the course: the 11:00 decision is
 * worth the same whichever way Tuesday goes.
 */

const YOU = 'You (day PSW)'
const PRIYA = 'Priya, charge nurse (RPN)'
const GRACE = 'Grace, evening PSW'
const LUIS = 'Luis, activity aide'
const CHART = 'Chart check'

// ── Monday morning: the first off day ───────────────────────────────────────

const monday: ScenarioEvent[] = [
  {
    id: 'm1',
    day: 1,
    clock: '07:35',
    kind: 'observation',
    source: YOU,
    by: 'you',
    aware: ['you'],
    text: 'Evelyn is still in bed when you come in. She is usually up and dressed by 07:15.',
    quote: 'I’ll stay put a bit, dear.',
    fact: 'Still in bed at 07:35 (usually up and dressed by 07:15)',
    measures: { mobility: 60, engagement: 70 },
  },
  {
    id: 'm2',
    day: 1,
    clock: '08:10',
    kind: 'observation',
    source: YOU,
    by: 'you',
    text: 'She asks for a tray in her room instead of walking to the dining room, and eats about a quarter of her porridge and half a slice of toast.',
    fact: 'Breakfast on a tray in her room; ate about a quarter',
    measures: { intake: 30, mobility: 30 },
  },
  {
    id: 'm3',
    day: 1,
    clock: '08:20',
    kind: 'documentation',
    source: YOU,
    by: 'you',
    text: 'You record breakfast as 25% on her meal record.',
    fact: 'Meal record: breakfast 25%',
  },
  {
    id: 'm4',
    day: 1,
    clock: '10:30',
    kind: 'observation',
    source: LUIS,
    by: 'luis',
    aware: ['luis'],
    flows: [{ from: 'luis', to: 'you', passed: true, note: 'Told you she skipped music group' }],
    text: 'Luis says Evelyn didn’t come to music group. When he stopped by her room she said she was tired and answered in a word or two.',
    fact: 'Missed 10:30 music group; short answers (reported by the activity aide)',
    measures: { engagement: 40 },
  },
  {
    id: 'm5',
    day: 1,
    clock: '10:40',
    kind: 'documentation',
    source: 'Night PSW note, 06:30',
    by: 'record',
    text: 'The night note reads: “Settled night. No concerns.”',
    fact: 'Night note: settled night, no concerns recorded',
  },
  {
    id: 'm6',
    day: 1,
    clock: '10:45',
    kind: 'unknown',
    source: CHART,
    by: 'record',
    text: 'Nothing recorded yet today about how much she has had to drink, whether she has any pain, or her temperature.',
    fact: 'Not recorded today: fluids, pain, temperature',
  },
]

const d1Statements: Statement[] = [
  {
    id: 's1',
    text: 'She ate about a quarter of her breakfast.',
    answer: 'observed',
    why: 'You saw it at 08:10 and recorded 25% at 08:20.',
  },
  {
    id: 's2',
    text: 'She asked for a tray instead of walking to the dining room.',
    answer: 'observed',
    why: 'You saw this at 08:10.',
  },
  {
    id: 's3',
    text: 'She’s just tired after Joan’s visit yesterday.',
    answer: 'assumption',
    why: 'Joan did visit, but nothing anyone saw links the visit to today. It is a possible explanation, not an observation.',
  },
  {
    id: 's4',
    text: 'She has had enough to drink today.',
    answer: 'unknown',
    why: 'Nothing has been recorded. No record is not the same as enough.',
  },
  {
    id: 's5',
    text: 'She isn’t in any pain.',
    answer: 'unknown',
    why: 'Nobody has asked or recorded it. Not hearing a complaint is not evidence of no pain.',
  },
]

const d1Choices: Choice[] = [
  {
    id: 'tell',
    label: 'Tell Priya, the charge nurse, now',
    detail: 'Say what is different from Evelyn’s usual, since when, and what you don’t know yet.',
    communication: 15,
    feedback:
      'Three parts of her usual pattern changed on the same morning, and nothing is recorded about fluids or pain. Telling the nurse now, in observations rather than conclusions, is timely and lets someone who can assess decide what is needed. It does not assume anything is wrong.',
    next: { persist: 'mon_told_persist', resolve: 'mon_told_resolve' },
  },
  {
    id: 'chart',
    label: 'Write it in her chart and keep an eye on her yourself',
    detail: 'Document the changes; don’t tell anyone directly.',
    communication: 6,
    feedback:
      'Documenting is good practice and earns credit. But a chart note may not be read for hours, and with three changes in one morning the nurse and the next shift need to hear it directly. Writing it down is not the same as telling someone.',
    next: { persist: 'mon_untold_persist', resolve: 'mon_untold_resolve' },
  },
  {
    id: 'cause',
    label: 'Tell Priya that Evelyn probably has a urinary tract infection',
    detail: 'Lead with the likely cause.',
    communication: 5,
    assumes: true,
    feedback:
      'Telling the nurse promptly earns some credit. But nothing anyone observed points to a urinary infection: a guess passed on as a finding can anchor everyone on the wrong explanation. Report what you saw and leave assessment to the nurse.',
    next: { persist: 'mon_told_persist', resolve: 'mon_told_resolve' },
  },
  {
    id: 'wait',
    label: 'Treat it as an off day and check again tomorrow',
    detail: 'Don’t document or report anything yet.',
    communication: 0,
    feedback:
      'At 11:00 this was one morning, and many off days pass on their own, so waiting is an understandable instinct. But three areas of her routine changed at once and nobody else knows. Deciding alone to wait means the evening and night staff cannot watch for it, and nothing is on record if it continues.',
    next: { persist: 'mon_untold_persist', resolve: 'mon_untold_resolve' },
  },
]

// ── Monday afternoon and evening, by course and by whether anyone was told ──

const toldOpening: ScenarioEvent[] = [
  {
    id: 'a0',
    day: 1,
    clock: '11:10',
    kind: 'action',
    source: YOU,
    by: 'you',
    flows: [{ from: 'you', to: 'priya', passed: true, note: 'Told Priya at 11:10' }],
    text: 'You tell Priya: Evelyn was still in bed at 07:35, ate about a quarter of breakfast on a tray, missed music group, and nothing is recorded yet for fluids or pain.',
    fact: 'Changes reported to the charge nurse at 11:10',
    when: { choices: ['tell'] },
  },
  {
    id: 'a0c',
    day: 1,
    clock: '11:10',
    kind: 'action',
    source: YOU,
    by: 'you',
    flows: [{ from: 'you', to: 'priya', passed: true, note: 'Told Priya, first as a guessed cause' }],
    text: 'You tell Priya you think Evelyn has a urinary infection. Priya asks, “What have you actually seen?” You go back through breakfast, the tray and music group.',
    fact: 'Reported to the charge nurse at 11:10, first as a guessed cause, then as observations',
    when: { choices: ['cause'] },
  },
  {
    id: 'a1',
    day: 1,
    clock: '11:40',
    kind: 'action',
    source: PRIYA,
    by: 'priya',
    flows: [{ from: 'priya', to: 'eve_rpn', passed: true, note: 'Passed on to the evening RPN' }],
    text: 'Priya sees Evelyn, then asks you to offer fluids hourly, write down what she actually drinks, and tell her about any further change. She passes it on to the evening RPN.',
    fact: 'Charge nurse saw Evelyn at 11:40; asked for fluids offered hourly and amounts recorded',
  },
]

const untoldOpening: ScenarioEvent[] = [
  {
    id: 'u0',
    day: 1,
    clock: '11:10',
    kind: 'documentation',
    source: YOU,
    by: 'you',
    flows: [{ from: 'you', to: 'record', passed: true, note: 'Chart note; nobody told' }],
    text: 'You write in her chart: “Stayed in room for breakfast, ate 25%, missed music group. Quieter than usual.” You don’t mention it to anyone.',
    fact: 'Chart note at 11:10: breakfast 25% in room, missed music group, quieter than usual',
    when: { choices: ['chart'] },
  },
]

const monTold = (course: 'persist' | 'resolve'): ScenarioNode => ({
  id: `mon_told_${course}`,
  label: 'Monday · rest of the day',
  stage: 'C',
  next: `tue_${course}`,
  events: [
    ...toldOpening,
    ...(course === 'persist'
      ? ([
          {
            id: 'tp1',
            day: 1,
            clock: '12:30',
            kind: 'observation',
            source: YOU,
            by: 'you',
            text: 'Lunch in her room again. She eats about a third.',
            fact: 'Lunch in her room; ate about a third',
            measures: { intake: 40, mobility: 30 },
          },
          {
            id: 'tp2',
            day: 1,
            clock: '14:30',
            kind: 'documentation',
            source: YOU,
            by: 'you',
            flows: [{ from: 'you', to: 'record', passed: true, note: 'Fluid amounts recorded' }],
            text: 'Fluid record since 11:00: tea offered four times. She finished one cup and about half of another.',
            fact: 'Fluid record 11:00–14:30: tea offered four times; drank one cup and about half of another',
          },
          {
            id: 'tp3',
            day: 1,
            clock: '18:10',
            kind: 'observation',
            source: GRACE,
            by: 'grace',
            aware: ['grace'],
            text: 'Grace: Evelyn ate about half her supper and needed a hand to stand up from her chair, which is new for her.',
            fact: 'Supper: ate about half; needed a hand to stand from her chair (new)',
            measures: { intake: 50, mobility: 25, engagement: 40 },
          },
          {
            id: 'tp4',
            day: 1,
            clock: '21:30',
            kind: 'documentation',
            source: 'Evening RPN note',
            by: 'eve_rpn',
            flows: [{ from: 'eve_rpn', to: 'record', passed: true, note: 'Evening note asks for a morning update' }],
            text: 'Evening RPN: “Day staff report reduced intake and mobility. Fluids encouraged. Day team to update in the morning.”',
            fact: 'Evening RPN note: aware of reduced intake and mobility; asked for an update in the morning',
          },
        ] satisfies ScenarioEvent[])
      : ([
          {
            id: 'tr1',
            day: 1,
            clock: '12:30',
            kind: 'observation',
            source: YOU,
            by: 'you',
            text: 'Evelyn walks to the dining room for lunch with her rollator and eats most of it.',
            fact: 'Walked to lunch with her rollator; ate most of it',
            measures: { intake: 90, mobility: 100, engagement: 70 },
          },
          {
            id: 'tr2',
            day: 1,
            clock: '14:30',
            kind: 'documentation',
            source: YOU,
            by: 'you',
            flows: [{ from: 'you', to: 'record', passed: true, note: 'Fluid amounts recorded' }],
            text: 'Fluid record since 11:00: she has finished two cups of tea and a glass of water.',
            fact: 'Fluid record 11:00–14:30: two cups of tea and a glass of water finished',
          },
          {
            id: 'tr3',
            day: 1,
            clock: '18:10',
            kind: 'observation',
            source: GRACE,
            by: 'grace',
            text: 'Grace: Evelyn ate most of her supper in the dining room and chatted with her tablemate.',
            fact: 'Supper in the dining room: ate most; chatted with her tablemate',
            measures: { intake: 95, mobility: 100, engagement: 90 },
          },
        ] satisfies ScenarioEvent[])),
  ],
})

const monUntold = (course: 'persist' | 'resolve'): ScenarioNode => ({
  id: `mon_untold_${course}`,
  label: 'Monday · rest of the day',
  stage: 'C',
  next: `tue_${course}`,
  events: [
    ...untoldOpening,
    course === 'persist'
      ? {
          id: 'up1',
          day: 1,
          clock: '12:30',
          kind: 'observation',
          source: YOU,
          by: 'you',
          text: 'Lunch in her room again. She eats about a third.',
          fact: 'Lunch in her room; ate about a third',
          measures: { intake: 40, mobility: 30 },
        }
      : {
          id: 'ur1',
          day: 1,
          clock: '12:30',
          kind: 'observation',
          source: YOU,
          by: 'you',
          text: 'Evelyn walks to the dining room for lunch with her rollator and eats most of it.',
          fact: 'Walked to lunch with her rollator; ate most of it',
          measures: { intake: 90, mobility: 100, engagement: 70 },
        },
    {
      id: `u_handover_${course}`,
      day: 1,
      clock: '15:00',
      kind: 'action',
      source: YOU,
      by: 'you',
      flows: [{ from: 'you', to: 'grace', passed: false, note: 'Not mentioned at the 15:00 handover' }],
      text: 'Shift change. Your handover to Grace, the evening PSW, covers residents with new orders. Evelyn isn’t mentioned.',
      fact: '15:00 shift handover: Evelyn not mentioned',
    },
    ...(course === 'persist'
      ? ([
          {
            id: 'up2',
            day: 1,
            clock: '18:10',
            kind: 'observation',
            source: GRACE,
            by: 'grace',
            aware: ['grace'],
            text: 'Grace notices Evelyn declined most of her supper and needed a hand to stand up from her chair, which is new for her. She didn’t know the morning had been different too.',
            fact: 'Supper: declined most; needed a hand to stand from her chair (new); evening PSW unaware of the morning',
            measures: { intake: 20, mobility: 25, engagement: 40 },
          },
          {
            id: 'up3',
            day: 1,
            clock: '19:00',
            kind: 'documentation',
            source: GRACE,
            by: 'grace',
            flows: [{ from: 'record', to: 'grace', passed: true, note: 'Read the 11:10 chart note' }, { from: 'grace', to: 'eve_rpn', passed: true, note: 'Told the evening RPN at 19:15' }],
            text: 'Grace reads your 11:10 chart note while charting and tells the evening RPN at 19:15.',
            fact: 'Evening PSW read the 11:10 chart note at 19:00 and told the evening RPN',
            when: { choices: ['chart'] },
          },
        ] satisfies ScenarioEvent[])
      : ([
          {
            id: 'ur2',
            day: 1,
            clock: '18:10',
            kind: 'observation',
            source: GRACE,
            by: 'grace',
            text: 'Grace: Evelyn ate most of her supper in the dining room and chatted with her tablemate.',
            fact: 'Supper in the dining room: ate most; chatted with her tablemate',
            measures: { intake: 95, mobility: 100, engagement: 90 },
          },
        ] satisfies ScenarioEvent[])),
    {
      id: `u_fluids_${course}`,
      day: 1,
      clock: '22:00',
      kind: 'unknown',
      source: CHART,
      by: 'record',
      text: 'No fluid record was started today. How much Evelyn drank after breakfast isn’t known.',
      fact: 'No fluid record on Monday: amount drunk after breakfast unknown',
    },
  ],
})

// ── Tuesday: persisted ──────────────────────────────────────────────────────

const tuePersist: ScenarioNode = {
  id: 'tue_persist',
  label: 'Tuesday · day shift',
  stage: 'C',
  events: [
    {
      id: 'tp5',
      day: 2,
      clock: '07:35',
      kind: 'observation',
      source: YOU,
      by: 'you',
      text: 'Evelyn is in bed again when you come in.',
      quote: 'I just feel washed out.',
      fact: 'Tuesday 07:35: in bed again; says she feels “washed out”',
      measures: { mobility: 30, engagement: 40 },
    },
    {
      id: 'tp6',
      day: 2,
      clock: '08:10',
      kind: 'observation',
      source: YOU,
      by: 'you',
      text: 'Breakfast on a tray in her room again. She eats about a quarter.',
      fact: 'Tuesday breakfast on a tray in her room; ate about a quarter (second day)',
      measures: { intake: 25 },
    },
    {
      id: 'tp7',
      day: 2,
      clock: '08:20',
      kind: 'observation',
      source: YOU,
      by: 'you',
      text: 'She needs you to steady her to walk to the bathroom. She usually walks there on her own with her rollator.',
      fact: 'Needed one person to steady her walking to the bathroom (usually walks on her own with her rollator)',
      measures: { mobility: 15 },
    },
    {
      id: 'tp8',
      day: 2,
      clock: '08:25',
      kind: 'unknown',
      source: CHART,
      by: 'record',
      text: 'Not recorded overnight: how much she drank. No temperature has been recorded since Sunday.',
      fact: 'No overnight fluid record; no temperature recorded since Sunday',
    },
  ],
  decision: {
    id: 'd2_persist',
    at: { day: 2, clock: '08:30' },
    title: 'Tuesday 08:30. It hasn’t passed.',
    prompt: 'Evelyn is still not herself, and now she needs help to walk. What do you do?',
    recognition: {
      kind: 'trend',
      prompt: 'Compared with Monday morning, how is Evelyn’s pattern now?',
      options: [
        {
          id: 'usual',
          label: 'Back to her usual',
          points: 0,
          why: 'Breakfast, getting up and walking are all still below her usual this morning.',
        },
        {
          id: 'same',
          label: 'About the same as yesterday',
          points: 7,
          why: 'Eating and engagement are about the same, but walking has changed: she now needs someone to steady her, which she didn’t yesterday.',
        },
        {
          id: 'more',
          label: 'Still changed, and now affecting her walking too',
          points: 15,
          why: 'The change has lasted into a second day and spread to walking. That is a persisting change from her baseline.',
        },
      ],
      max: 15,
    },
    pointsPerStatement: 3,
    statements: [
      {
        id: 't1',
        text: 'She needed help to walk to the bathroom this morning.',
        answer: 'observed',
        why: 'You steadied her yourself at 08:20.',
      },
      {
        id: 't2',
        text: 'She has eaten much less than usual for two days.',
        answer: 'observed',
        why: 'Both breakfasts and Monday’s lunch and supper were seen and recorded below her usual.',
      },
      {
        id: 't3',
        text: 'She’s dehydrated.',
        answer: 'assumption',
        why: 'Low intake is a reason to ask for an assessment, not a finding. Whether she is dehydrated is for the nurse to assess.',
      },
      {
        id: 't4',
        text: 'She drank enough overnight.',
        answer: 'unknown',
        why: 'Nothing was recorded overnight.',
      },
      {
        id: 't5',
        text: 'This is just her age catching up with her.',
        answer: 'assumption',
        why: 'Her baseline last week is the comparison. A change over two days is a change for her, not something to explain away by age.',
      },
    ],
    communicationMax: 15,
    choices: [
      {
        id: 'report',
        label: 'Give Priya a structured handover now',
        detail: 'The change has lasted into a second day and now affects walking. Say what’s different, since when, what’s been tried and what isn’t known.',
        communication: 15,
        feedback:
          'A change that persists into a second day and spreads to walking needs to be communicated promptly and clearly. Including what has been tried, and what she actually drank rather than what was offered, plus what isn’t known, helps the nurse decide what to assess.',
        next: 'tue_p_report',
      },
      {
        id: 'encourage',
        label: 'Encourage her to eat and drink, and mention it at the 15:00 handover',
        detail: 'Do something about it yourself first.',
        communication: 6,
        feedback:
          'Encouraging food and fluids is good care and earns credit. But offering a drink is not the same as her drinking it, and waiting until 15:00 delays a change that has already lasted overnight. The nurse needs to hear it this morning.',
        next: 'tue_p_encourage',
      },
      {
        id: 'hospital',
        label: 'Ask Priya to send her to hospital because she’s dehydrated',
        detail: 'Push for the biggest response.',
        communication: 4,
        assumes: true,
        feedback:
          'Communicating today earns some credit. But “dehydrated” is a conclusion nobody has assessed, and a transfer is not the support worker’s decision. Report what you saw and let the nurse assess and decide.',
        next: 'tue_p_hospital',
      },
      {
        id: 'wait2',
        label: 'Give it one more day. She was fine last week.',
        detail: 'Hold off on telling anyone.',
        communication: 0,
        feedback:
          'Last week is her baseline, and that is the point: two days below it, and now needing help to walk, is a persisting change. Waiting another day without telling anyone leaves the nurse without information she needs.',
        next: 'tue_p_wait',
      },
    ],
    expected:
      'Recognise that the change has persisted overnight and spread to walking. Keep what was seen (two low breakfasts, needing help to walk) apart from conclusions (dehydrated, her age). Communicate it this morning, in a structured way that includes what was tried and what isn’t known.',
  },
}

const persistHandover = {
  to: 'Priya, charge nurse (RPN)',
  purpose: 'Write the handover Priya will use: what has changed for Evelyn compared with her usual, what is known, and what isn’t.',
  situation: {
    text: 'Evelyn has eaten much less than usual and stayed in her room since Monday morning. This morning she needed someone to steady her walking to the bathroom.',
    factIds: ['m2', 'tp6', 'tp7'],
  },
  recommendation:
    'Please assess Evelyn this morning. Tell me what you want recorded and how often, and who should be told at the next shift.',
  expected:
    'Situation: a change from her usual since Monday morning, now affecting walking. Background: what usual looks like for Evelyn. Assessment: timed observations, including what was offered versus what she drank. Recommendation: ask for an assessment and what to record. Unknowns: overnight fluids, temperature, pain.',
}

const tueConsequence = (
  id: string,
  clock: string,
  text: string,
  fact: string,
  handover: ScenarioNode['handover'],
  flows: Flow[],
): ScenarioNode => ({
  id,
  label: 'Tuesday · day shift',
  stage: 'C',
  handover,
  events: [{ id: `${id}_e`, day: 2, clock, kind: 'action', source: YOU, by: 'you', flows, text, fact }],
})

const told = (note: string): Flow[] => [{ from: 'you', to: 'priya', passed: true, note }]
const notTold = (note: string): Flow[] => [{ from: 'you', to: 'priya', passed: false, note }]

// ── Tuesday: resolved ───────────────────────────────────────────────────────

const tueResolve: ScenarioNode = {
  id: 'tue_resolve',
  label: 'Tuesday · day shift',
  stage: 'C',
  events: [
    {
      id: 'tr5',
      day: 2,
      clock: '07:20',
      kind: 'observation',
      source: YOU,
      by: 'you',
      text: 'Evelyn is up and dressed when you come in, and asks whether the newspaper has arrived for her crossword.',
      fact: 'Tuesday 07:20: up and dressed; asked for the newspaper crossword',
      measures: { mobility: 100, engagement: 95 },
    },
    {
      id: 'tr6',
      day: 2,
      clock: '08:05',
      kind: 'observation',
      source: YOU,
      by: 'you',
      text: 'She walks to breakfast with her rollator and eats most of it.',
      fact: 'Walked to breakfast with her rollator; ate most of it',
      measures: { intake: 95, mobility: 100 },
    },
    {
      id: 'tr7',
      day: 2,
      clock: '10:30',
      kind: 'observation',
      source: LUIS,
      by: 'luis',
      text: 'Luis: Evelyn is at music group, singing along.',
      fact: 'At 10:30 music group, singing along (reported by the activity aide)',
      measures: { engagement: 100 },
    },
    {
      id: 'tr8',
      day: 2,
      clock: '10:40',
      kind: 'unknown',
      source: CHART,
      by: 'record',
      text: 'Still not known: what, if anything, was behind Monday’s change. No temperature has been recorded since Sunday.',
      fact: 'Not known what was behind Monday’s change; no temperature recorded since Sunday',
    },
  ],
  decision: {
    id: 'd2_resolve',
    at: { day: 2, clock: '11:00' },
    title: 'Tuesday 11:00. She seems herself again.',
    prompt: 'Evelyn looks like her usual self this morning. What do you do?',
    recognition: {
      kind: 'trend',
      prompt: 'Compared with Monday morning, how is Evelyn’s pattern now?',
      options: [
        {
          id: 'usual',
          label: 'Back to her usual',
          points: 15,
          why: 'Up and dressed, walked to breakfast, ate most of it, at music group: each matches her baseline.',
        },
        {
          id: 'same',
          label: 'About the same as yesterday',
          points: 0,
          why: 'This morning looks like her baseline, not like Monday morning.',
        },
        {
          id: 'more',
          label: 'Still changed, and now affecting her walking too',
          points: 0,
          why: 'She walked to breakfast on her own with her rollator.',
        },
      ],
      max: 15,
    },
    pointsPerStatement: 3,
    statements: [
      {
        id: 'r1',
        text: 'She walked to breakfast and ate most of it.',
        answer: 'observed',
        why: 'You saw it at 08:05.',
      },
      {
        id: 'r2',
        text: 'She went to music group this morning.',
        answer: 'observed',
        why: 'Luis saw her there at 10:30.',
      },
      {
        id: 'r3',
        text: 'Monday was nothing to worry about.',
        answer: 'assumption',
        why: 'Knowing how Tuesday went doesn’t tell you what Monday was. Hindsight is not an observation.',
      },
      {
        id: 'r4',
        text: 'Whatever was behind Monday won’t come back.',
        answer: 'assumption',
        why: 'A prediction, not something anyone has seen.',
      },
      {
        id: 'r5',
        text: 'Her temperature has been normal.',
        answer: 'unknown',
        why: 'No temperature has been recorded since Sunday.',
      },
    ],
    communicationMax: 15,
    choices: [
      {
        id: 'close',
        label: 'Tell Priya she’s back to her usual, and note it in her chart',
        detail: 'Close the loop with what you saw this morning, and keep her usual routine.',
        communication: 15,
        feedback:
          'Saying that a change has resolved matters as much as reporting it. Anyone watching since Monday can stand down with evidence, and the record shows how the story ended. Proportionate, not alarmed.',
        next: 'tue_r_close',
      },
      {
        id: 'tests',
        label: 'Ask Priya to send her for hospital tests anyway, to be safe',
        detail: 'Escalate as far as possible, just in case.',
        communication: 4,
        feedback:
          'Wanting to be safe is understandable, but this morning’s observations show her usual pattern. Noticing a change doesn’t mean every observation needs the same escalation. Share what you saw and let the nurse decide on follow-up.',
        next: 'tue_r_tests',
      },
      {
        id: 'silent',
        label: 'Say nothing. She’s fine now.',
        detail: 'No need to bring it up again.',
        communication: 6,
        feedback:
          'She does look like herself. But if Monday was reported or written down, people are still waiting to hear, and without a note that it resolved the record ends on a concern. The next shift has nothing to compare against if it comes back.',
        next: 'tue_r_silent',
      },
    ],
    expected:
      'Recognise that her pattern is back to baseline, without deciding in hindsight that Monday meant nothing. Close the loop: tell the nurse what you saw this morning and note it, so the record shows the change resolved.',
  },
}

const resolveHandover = {
  to: 'Priya, charge nurse (RPN), and the evening PSW',
  purpose: 'Close the loop: what changed on Monday, what you see now, and what is still unknown.',
  situation: {
    text: 'Evelyn is back to her usual pattern this morning, after staying in her room and eating much less on Monday morning.',
    factIds: ['m2', 'tr5', 'tr6'],
  },
  recommendation:
    'Please let the evening shift know she is back to her usual routine. If she stays in bed, eats much less or needs help to walk again, report it straight away.',
  expected:
    'Situation: back to her usual this morning after a change on Monday. Background: her usual pattern. Assessment: what Monday looked like and what this morning looked like, with times. Recommendation: keep her usual routine and report if the change returns. Unknowns: what was behind Monday, temperature.',
}

export const evelyn: Scenario = {
  id: 'evelyn',
  version: 2,
  title: 'Off Day or Something More?',
  subtitle: 'Evelyn Carter, Birch wing',
  blurb:
    'One morning, three parts of Evelyn’s usual pattern change at once. Decide what it means, and what to do, with only what you know at the time.',
  role: 'You are Sam, the day-shift personal support worker (PSW) on Birch wing.',
  days: ['Monday', 'Tuesday'],
  window: { start: { day: 1, clock: '07:00' }, end: { day: 2, clock: '15:00' } },
  people: [
    { id: 'you', label: 'Sam (you)', role: 'Day PSW' },
    { id: 'luis', label: 'Luis', role: 'Activity aide' },
    { id: 'priya', label: 'Priya', role: 'Charge nurse, day' },
    { id: 'grace', label: 'Grace', role: 'Evening PSW' },
    { id: 'eve_rpn', label: 'Evening RPN', role: 'Charge nurse, evening' },
    { id: 'record', label: 'Chart', role: 'Written record' },
  ],
  resident: {
    id: 'evelyn-carter',
    name: 'Evelyn Carter',
    preferredName: 'Evelyn',
    pronoun: 'she',
    age: 86,
    room: '118',
    wing: 'Birch',
    summary: 'Retired school librarian. Widowed. Lives on Birch wing; walks with a rollator.',
    about: [
      'Her daughter Joan visits on Sunday afternoons (she visited yesterday).',
      'Likes tea with milk and the newspaper crossword after breakfast.',
      'Wears a hearing aid in her right ear.',
    ],
    baseline: [
      { id: 'b1', dimension: 'mobility', text: 'Usually up and dressed by 07:15, and walks to all three meals with her rollator' },
      { id: 'b2', dimension: 'intake', text: 'Usually eats most of her breakfast in the dining room' },
      { id: 'b3', dimension: 'engagement', text: 'Usually chats with staff and goes to the 10:30 music group most days' },
    ],
  },
  dimensions: [
    { key: 'mobility', label: 'Mobility', usual: 'Walks to every meal with her rollator' },
    { key: 'intake', label: 'Meal intake', usual: 'Eats most of her breakfast' },
    { key: 'engagement', label: 'Engagement', usual: 'Chats with staff; music group most days' },
  ],
  baselineSeries: [
    { label: 'Mon', values: { mobility: 100, intake: 95, engagement: 100 } },
    { label: 'Tue', values: { mobility: 100, intake: 100, engagement: 90 } },
    { label: 'Wed', values: { mobility: 100, intake: 90, engagement: 100 } },
    { label: 'Thu', values: { mobility: 95, intake: 100, engagement: 95 } },
    { label: 'Fri', values: { mobility: 100, intake: 95, engagement: 100 } },
    { label: 'Sat', values: { mobility: 100, intake: 100, engagement: 90 } },
    { label: 'Sun', values: { mobility: 100, intake: 90, engagement: 100 } },
  ],
  courses: [
    { id: 'persist', label: 'The change persists', summary: 'Evelyn’s change carried on into Tuesday and spread to her walking.' },
    { id: 'resolve', label: 'The change resolves', summary: 'Evelyn was back to her usual pattern by Monday lunchtime and stayed that way.' },
  ],
  defaultCourse: 'persist',
  start: 'mon_morning',
  insight:
    'One unusual observation can be ambiguous. Her own baseline, the pattern across time, and how clearly the change is communicated decide what a thoughtful next step looks like.',
  nodes: Object.fromEntries(
    (
    [
      {
        id: 'mon_morning',
        label: 'Monday · day shift',
        stage: 'B',
        events: monday,
        decision: {
          id: 'd1',
          at: { day: 1, clock: '11:00' },
          title: 'Monday 11:00. Off day, or something more?',
          prompt: 'You have seen Evelyn’s morning, and Luis has told you about music group. What do you do now?',
          recognition: {
            kind: 'dimensions',
            prompt: 'Which parts of Evelyn’s usual pattern look different today?',
            options: [
              { id: 'mobility', label: 'Mobility', changed: true, why: 'Still in bed at 07:35 and didn’t walk to breakfast.' },
              { id: 'intake', label: 'Meal intake', changed: true, why: 'About a quarter of breakfast; she usually eats most of it.' },
              { id: 'engagement', label: 'Engagement', changed: true, why: 'Missed music group and gave short answers.' },
              { id: 'sleep', label: 'Sleep', changed: false, why: 'The only evidence is the night note, which records a settled night.' },
              { id: 'orientation', label: 'Orientation', changed: false, why: 'Nothing anyone saw suggests she was confused about time, place or people.' },
            ],
            pointsPerHit: 5,
            penaltyPerFalse: 3,
            max: 15,
          },
          pointsPerStatement: 2,
          statements: d1Statements,
          communicationMax: 15,
          choices: d1Choices,
          expected:
            'Notice that three parts of Evelyn’s usual pattern changed on the same morning. Keep what was seen (breakfast, the tray, music group) apart from guesses (tired after a visit) and unknowns (fluids, pain). Tell the charge nurse now, in observations, and say what isn’t known.',
        },
      },
      monTold('persist'),
      monTold('resolve'),
      monUntold('persist'),
      monUntold('resolve'),
      tuePersist,
      tueConsequence(
        'tue_p_report',
        '08:40',
        'You find Priya at the nursing station and walk her through it. She comes to see Evelyn at 08:50 and asks you to write it up as a handover for the record.',
        'Structured report to the charge nurse at 08:40; she saw Evelyn at 08:50',
        persistHandover,
        told('Structured report at 08:40'),
      ),
      tueConsequence(
        'tue_p_encourage',
        '14:00',
        'You offer tea and toast through the morning. By 14:00 the fluid record shows she has drunk about half a cup. You’ll mention it at 15:00.',
        'Fluids and food offered through Tuesday morning; about half a cup drunk by 14:00',
        persistHandover,
        notTold('Not told until the 15:00 handover'),
      ),
      tueConsequence(
        'tue_p_hospital',
        '08:40',
        'You tell Priya that Evelyn is dehydrated and needs hospital. Priya asks what you have actually seen, then goes to assess her and asks you to write up your observations.',
        'Reported to the charge nurse at 08:40 with a guessed cause; she asked for the observations',
        persistHandover,
        told('Told Priya, as a guessed cause'),
      ),
      tueConsequence(
        'tue_p_wait',
        '14:45',
        'At 14:45 Priya asks how Evelyn has been. It is time for your end-of-shift handover.',
        'Charge nurse asked about Evelyn at 14:45; not told before then',
        persistHandover,
        notTold('Not told; Priya had to ask at 14:45'),
      ),
      tueResolve,
      tueConsequence(
        'tue_r_close',
        '11:10',
        'You tell Priya that Evelyn walked to breakfast, ate most of it and was at music group. Priya notes it and asks you to keep her usual routine.',
        'Told the charge nurse at 11:10 that Evelyn is back to her usual pattern',
        resolveHandover,
        told('Told Priya she is back to her usual'),
      ),
      tueConsequence(
        'tue_r_tests',
        '11:10',
        'Priya asks what you have seen today, then says she will check Evelyn herself before deciding anything. She asks you to write up your observations.',
        'Asked the charge nurse at 11:10 for hospital tests; she will check Evelyn first',
        resolveHandover,
        told('Asked Priya for hospital tests'),
      ),
      tueConsequence(
        'tue_r_silent',
        '14:45',
        'At 14:45 Priya asks how Evelyn has been since yesterday. It is time for your end-of-shift handover.',
        'Charge nurse asked about Evelyn at 14:45; not updated before then',
        resolveHandover,
        notTold('Not updated; Priya asked at 14:45'),
      ),
    ] satisfies ScenarioNode[]
    ).map((n) => [n.id, n]),
  ),
}
