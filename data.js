// ---------------------------------------------------------------------------
// Training plan data — Erg sessions only, transcribed from
// SHALLI_VAC_TRAINING (TRINITY 26) Schedule.pdf
//
// Session "kind" drives how the adaptive engine treats a session:
//   ut2        steady-state aerobic base -> the VOLUME bucket
//   at         anaerobic threshold       -> the QUALITY / fatigue bucket
//   vo2        VO2max / TR intervals     -> the QUALITY / fatigue bucket
//   race       race-pace / primer work   -> the QUALITY / fatigue bucket
//   test       2k test piece             -> logged separately, feeds the goal model
//   easy       genuinely optional easy/skip piece (mostly Wednesdays)
//   rest       nothing prescribed
//
// `optional: true` marks sessions that were written into the plan as
// "(or skip)" / social / rest-by-design. Wednesdays in this plan are, on
// the athlete's own program, the deliberate low-priority day — skipping
// them is never treated as a miss by the adherence/fatigue engine.
// ---------------------------------------------------------------------------

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_LABELS = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };

function erg(kind, label, opts = {}) {
  return {
    kind,
    label,
    plannedMinutes: opts.min ?? null,
    structure: opts.structure ?? null,
    targetSplit500: opts.targetSplit500 ?? null, // seconds per 500m, when the plan names one
    optional: !!opts.optional,
    isTest: kind === 'test',
    note: opts.note ?? null,
  };
}

const REST = null; // no erg prescribed that day

// Each week: id, label (date range), phase, days keyed mon..sun -> erg session or REST
const WEEKS = [
  {
    id: 'preA', label: '29 Jun – 5 Jul', phase: 'Holiday / re-entry', preseason: true,
    days: {
      mon: erg('ut2', "20' UT2", { min: 20 }),
      tue: erg('ut2', "30' UT2", { min: 30 }),
      wed: REST, thu: REST, fri: REST, sat: REST, sun: REST,
    },
  },
  {
    id: 'preB', label: '6 Jul – 12 Jul', phase: 'Holiday end / re-acclimation', preseason: true,
    days: {
      mon: REST, tue: REST, wed: REST,
      thu: erg('ut2', "16' UT2", { min: 16 }),
      fri: erg('ut2', "2×20' UT2", { min: 40, structure: '2 × 20\' UT2' }),
      sat: erg('ut2', "30' UT2", { min: 30 }),
      sun: REST,
    },
  },
  {
    id: 'w1', label: '13 Jul – 19 Jul', phase: 'Week 1 · Base + 2K Baseline Test', weekNum: 1,
    days: {
      mon: erg('test', '2K Baseline Test', { structure: 'Warm-up: 12\' build + 3×10 hard strokes; negative split 2k' }),
      tue: erg('ut2', "40' UT2 (easy, post-test)", { min: 40 }),
      wed: erg('ut2', "40' UT2", { min: 40 }),
      thu: erg('easy', "20–25' easy UT2 (or skip)", { min: 22, optional: true }),
      fri: REST, // SOCIAL
      sat: REST, // rest / social weekend
      sun: REST,
    },
  },
  {
    id: 'w2', label: '20 Jul – 26 Jul', phase: 'Week 2 · Base · 1st threshold introduced', weekNum: 2,
    days: {
      mon: REST, // SOCIAL
      tue: erg('ut2', "30' UT2", { min: 30 }),
      wed: erg('easy', "20' easy UT2 (or skip)", { min: 20, optional: true }),
      thu: erg('at', "AT: 3×10' (1' rest)", { min: 30, structure: '3 × 10\' @ AT, 1\' rest' }),
      fri: erg('ut2', "50' UT2", { min: 50 }),
      sat: erg('ut2', "55' UT2 (long)", { min: 55 }),
      sun: REST,
    },
  },
  {
    id: 'w3', label: '27 Jul – 2 Aug', phase: 'Week 3 · Build · highest lifting volume', weekNum: 3,
    days: {
      mon: erg('ut2', "45' UT2", { min: 45 }),
      tue: erg('at', "AT: 4×8' (1' rest)", { min: 32, structure: '4 × 8\' @ AT, 1\' rest' }),
      wed: erg('easy', "20–25' easy (or skip)", { min: 22, optional: true }),
      thu: erg('ut2', "45' UT2", { min: 45 }),
      fri: erg('ut2', "50' UT2", { min: 50 }),
      sat: erg('ut2', "60' UT2 (long)", { min: 60 }),
      sun: REST,
    },
  },
  {
    id: 'w4', label: '3 Aug – 9 Aug', phase: 'Week 4 · Build', weekNum: 4,
    days: {
      mon: erg('ut2', "50' UT2", { min: 50 }),
      tue: erg('at', "AT: 4×10' (1' rest)", { min: 40, structure: '4 × 10\' @ AT, 1\' rest' }),
      wed: erg('easy', "25' easy (or skip)", { min: 25, optional: true }),
      thu: erg('ut2', "50' UT2", { min: 50 }),
      fri: erg('ut2', "50' UT2", { min: 50 }),
      sat: erg('ut2', "65' UT2 (long)", { min: 65 }),
      sun: REST,
    },
  },
  {
    id: 'w5', label: '10 Aug – 16 Aug', phase: 'Week 5 · DELOAD — erg easy', weekNum: 5, deload: true,
    days: {
      mon: erg('ut2', "30' UT2", { min: 30 }),
      tue: erg('ut2', "30' UT2", { min: 30 }),
      wed: erg('easy', "skip or 15' easy", { min: 15, optional: true }),
      thu: erg('ut2', "30' UT2", { min: 30 }),
      fri: erg('ut2', "35' UT2", { min: 35 }),
      sat: erg('ut2', "40' UT2 (deload)", { min: 40 }),
      sun: REST,
    },
  },
  {
    id: 'w6', label: '17 Aug – 23 Aug', phase: 'Week 6 · Build + 2K Retest → recalibrate zones', weekNum: 6,
    days: {
      mon: erg('test', '2K Retest → recalibrate all pace zones', { structure: 'Recalibration test — resets goal-pace model' }),
      tue: erg('ut2', "30' UT2 (easy, post-test)", { min: 30 }),
      wed: erg('at', "AT: 3×10'", { min: 30, structure: '3 × 10\' @ AT, 1\' rest' }),
      thu: erg('easy', "20' easy (or skip)", { min: 20, optional: true }),
      fri: erg('ut2', "45' UT2", { min: 45 }),
      sat: erg('ut2', "60' UT2 (long)", { min: 60 }),
      sun: REST,
    },
  },
  {
    id: 'w7', label: '24 Aug – 30 Aug', phase: 'Week 7 · Intensify · VO2 / 2k-pace work begins', weekNum: 7,
    days: {
      mon: erg('ut2', "50' UT2", { min: 50 }),
      tue: erg('vo2', "VO2: 6×500m @ TR (1'30 rest)", { min: 35, structure: '6 × 500m @ target race pace, 1\'30 rest' }),
      wed: erg('easy', "20' easy (or skip)", { min: 20, optional: true }),
      thu: erg('at', "AT: 4×10'", { min: 40, structure: '4 × 10\' @ AT, 1\' rest' }),
      fri: erg('ut2', "45' UT2", { min: 45 }),
      sat: erg('ut2', "60' UT2 (long)", { min: 60 }),
      sun: REST,
    },
  },
  {
    id: 'w8', label: '31 Aug – 6 Sep', phase: 'Week 8 · Intensify', weekNum: 8,
    days: {
      mon: erg('ut2', "50' UT2", { min: 50 }),
      tue: erg('vo2', "VO2: 4×750m @ TR (2' rest)", { min: 32, structure: '4 × 750m @ target race pace, 2\' rest' }),
      wed: erg('easy', "20' easy (or skip)", { min: 20, optional: true }),
      thu: erg('at', "AT: 3×12'", { min: 36, structure: '3 × 12\' @ AT, 1\' rest' }),
      fri: erg('ut2', "45' UT2", { min: 45 }),
      sat: erg('ut2', "65' UT2 (long)", { min: 65 }),
      sun: REST,
    },
  },
  {
    id: 'w9', label: '7 Sep – 13 Sep', phase: 'Week 9 · Intensify · peak intensity', weekNum: 9,
    days: {
      mon: erg('ut2', "45' UT2", { min: 45 }),
      tue: erg('vo2', "VO2: 5×4' @ TR (3' rest)", { min: 26, structure: '5 × 4\' @ target race pace, 3\' rest' }),
      wed: erg('easy', "20' easy (or skip)", { min: 20, optional: true }),
      thu: erg('at', "AT: 4×10'", { min: 40, structure: '4 × 10\' @ AT, 1\' rest' }),
      fri: erg('ut2', "40' UT2", { min: 40 }),
      sat: erg('ut2', "60' UT2 (long)", { min: 60 }),
      sun: REST,
    },
  },
  {
    id: 'w10', label: '14 Sep – 20 Sep', phase: 'Week 10 · Peak / sharpen · erg volume drops', weekNum: 10,
    days: {
      mon: erg('ut2', "40' UT2", { min: 40 }),
      tue: erg('race', "Race prep: 4×500m @ 1:44.9 (1' rest)", { min: 20, structure: '4 × 500m @ 1:44.9, 1\' rest', targetSplit500: 104.9 }),
      wed: erg('easy', "20' easy", { min: 20, optional: true }),
      thu: erg('ut2', "30' UT2", { min: 30 }),
      fri: erg('race', "3×750m @ ~2k pace (3' rest)", { min: 27, structure: '3 × 750m @ ~2k pace, 3\' rest' }),
      sat: erg('ut2', "45' UT2", { min: 45 }),
      sun: REST,
    },
  },
  {
    id: 'w11', label: '21 Sep – 27 Sep', phase: 'Week 11 · Taper + FINAL 2K TEST', weekNum: 11,
    days: {
      mon: erg('race', "30' UT2 + 6×20 race-pace strokes", { min: 30, structure: '30\' UT2 + 6 × 20 strokes @ race pace' }),
      tue: erg('race', "20' UT2 + 4×250m @ race pace", { min: 20, structure: '20\' UT2 + 4 × 250m @ race pace' }),
      wed: erg('easy', "15' easy (or off)", { min: 15, optional: true }),
      thu: erg('race', "Primer: 12' easy + 3×20 hard strokes", { min: 12, structure: '12\' easy + 3 × 20 hard strokes' }),
      fri: erg('test', '2K FINAL TEST', { structure: 'Goal day — this is the number that matters' }),
      sat: erg('easy', "Easy 20' spin or off", { min: 20, optional: true }),
      sun: REST,
    },
  },
];

// Historical log entries already visible in the athlete's own notes on the PDF.
// Everything else starts unlogged — the athlete fills it in as they go.
const SEED_LOGS = {
  'w1:mon': { status: 'incomplete', actualMinutes: null, note: 'Attempted, got to 500m and mental gave out — no valid time recorded.' },
  'w2:tue': { status: 'partial', actualMinutes: 10, note: "Skipped 10' in then called it, legs are gone rn but will make up for it." },
  'preB:sat': { status: 'partial', actualMinutes: 10, note: "Only managed 10', think this is a mental block." },
};

const GOAL_2K_SECONDS = 419; // 6:59 flat — sub-7 with a hair of margin
const GOAL_SPLIT_500 = GOAL_2K_SECONDS / 4; // 104.75 s/500m ≈ 1:44.8
