// ---------------------------------------------------------------------------
// Adaptive engine: pace/HR math, adherence, the volume vs. fatigue guards,
// and the sub-7 2k goal model.
// ---------------------------------------------------------------------------

// ---- time helpers ---------------------------------------------------------

function paceStrToSec(str) {
  if (!str) return null;
  const m = String(str).trim().match(/^(\d+):(\d+(?:\.\d+)?)$/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseFloat(m[2]);
}

function secToPaceStr(sec) {
  if (sec == null || !isFinite(sec)) return '—';
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

function secToClock(sec) {
  if (sec == null || !isFinite(sec)) return '—';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec - m * 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function dateFromWeekDay(week, dayKey, planStartISO) {
  // dates are derived positionally: week order index * 7 + day index, offset from plan start.
  const weekIdx = WEEKS.findIndex((w) => w.id === week.id);
  const dayIdx = DAY_KEYS.indexOf(dayKey);
  const start = new Date(planStartISO + 'T00:00:00');
  const d = new Date(start);
  d.setDate(start.getDate() + weekIdx * 7 + dayIdx);
  return d;
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

// ---- session classification -------------------------------------------

function bucketOf(session) {
  if (!session) return 'rest';
  if (session.optional) return 'optional';
  if (session.kind === 'test') return 'test';
  if (session.kind === 'ut2') return 'volume';
  if (session.kind === 'at' || session.kind === 'vo2' || session.kind === 'race') return 'quality';
  return 'optional';
}

// ---- HR zones ---------------------------------------------------------

function estimateHRMax(age) {
  if (!age) return null;
  return Math.round(208 - 0.7 * age); // Tanaka formula, more accurate than 220-age
}

function hrAtPct(pct, hrMax, hrRest) {
  if (!hrMax) return null;
  if (hrRest) return Math.round(hrRest + pct * (hrMax - hrRest)); // Karvonen
  return Math.round(pct * hrMax);
}

const HR_ZONES = {
  ut2: [0.60, 0.72],
  at: [0.80, 0.87],
  vo2: [0.88, 0.95],
  race: [0.92, 0.98],
  test: [0.93, 1.00],
};

function hrRangeFor(kind, profile) {
  const [lo, hi] = HR_ZONES[kind] || HR_ZONES.ut2;
  const low = hrAtPct(lo, profile.hrMax, profile.hrRest);
  const high = hrAtPct(hi, profile.hrMax, profile.hrRest);
  return { low, high };
}

// ---- adherence / volume / fatigue engine -------------------------------

const FATIGUE_KEYWORDS = [
  'gave out', 'mental block', 'legs are gone', 'exhausted', 'shattered',
  'burnt out', 'burnout', 'couldn’t', 'couldnt', 'dead legs', 'flat', 'drained',
];

// Build a flat, dated list of every erg session in the structured 11-week block.
function flattenSessions(planStartISO) {
  const out = [];
  for (const week of WEEKS) {
    for (const dayKey of DAY_KEYS) {
      const session = week.days[dayKey];
      if (!session) continue;
      const date = dateFromWeekDay(week, dayKey, planStartISO);
      out.push({ week, dayKey, session, date, key: `${week.id}:${dayKey}` });
    }
  }
  return out;
}

function computeEngine({ planStartISO, logs, today, profile }) {
  const all = flattenSessions(planStartISO);
  const todayMid = new Date(today.toDateString());
  const windowStart = new Date(todayMid);
  windowStart.setDate(windowStart.getDate() - 14);

  const past = all.filter((s) => s.date <= todayMid);
  const windowed = all.filter((s) => s.date >= windowStart && s.date <= todayMid);

  // --- volume (UT2) tracking, trailing 14 days, optional days excluded ---
  let plannedVolMin = 0;
  let actualVolMin = 0;
  let volLoggedCount = 0;
  for (const item of windowed) {
    const bucket = bucketOf(item.session);
    if (bucket !== 'volume') continue;
    const log = logs[item.key];
    plannedVolMin += item.session.plannedMinutes || 0;
    if (log && log.status && log.status !== 'unlogged') {
      volLoggedCount++;
      if (log.status === 'completed') actualVolMin += item.session.plannedMinutes || 0;
      else if (log.status === 'partial') actualVolMin += log.actualMinutes || 0;
      // 'skipped' / 'incomplete' contribute 0
    }
  }
  const volumeMissedPct = plannedVolMin > 0 ? Math.max(0, 1 - actualVolMin / plannedVolMin) : 0;
  const volumeFlag = volLoggedCount >= 2 && volumeMissedPct > 0.25;

  // --- fatigue guard: quality sessions cut short/skipped, high RPE, hot UT2 HR, keywords ---
  let qualityLogged = 0;
  let qualityStruggled = 0;
  let rpeSum = 0;
  let rpeCount = 0;
  const reasons = [];
  let signalCount = 0; // independent fatigue signals — the guard needs corroboration, not one bad day
  for (const item of windowed) {
    const bucket = bucketOf(item.session);
    const log = logs[item.key];
    if (!log || !log.status || log.status === 'unlogged') continue;
    if (bucket === 'quality') {
      qualityLogged++;
      const pct = log.status === 'completed' ? 1 : log.status === 'partial'
        ? (log.actualMinutes || 0) / (item.session.plannedMinutes || 1) : 0;
      if (pct < 0.7) {
        qualityStruggled++;
        reasons.push(`${item.session.label} (${item.week.label}) cut short`);
        signalCount++;
      }
    }
    if (log.rpe) { rpeSum += log.rpe; rpeCount++; }
    if (bucket === 'volume' && log.avgHR && profile.hrMax) {
      const ceiling = hrAtPct(HR_ZONES.ut2[1], profile.hrMax, profile.hrRest);
      if (ceiling && log.avgHR > ceiling) {
        reasons.push(`UT2 on ${item.week.label} ran hot (avg HR ${log.avgHR} vs ≤${ceiling} target)`);
        signalCount++;
      }
    }
    if (log.note) {
      const lower = log.note.toLowerCase();
      if (FATIGUE_KEYWORDS.some((k) => lower.includes(k))) {
        reasons.push(`Note flagged fatigue: "${log.note.trim()}"`);
        signalCount++;
      }
    }
  }
  const avgRpe = rpeCount ? rpeSum / rpeCount : null;
  if (avgRpe != null && avgRpe >= 8.5) signalCount++;
  // Require at least two corroborating signals (or a hard RPE reading on its own) so a single
  // offhand note doesn't flip the whole programme into recovery mode — but don't ignore it either.
  const fatigueFlag = signalCount >= 2 || (avgRpe != null && avgRpe >= 9);

  // --- overall adherence (non-optional sessions, all-time, excludes Wednesdays-by-design) ---
  let plannedAll = 0, actualAll = 0, loggedAll = 0, optionalDone = 0, optionalTotal = 0;
  for (const item of past) {
    const bucket = bucketOf(item.session);
    const log = logs[item.key];
    if (bucket === 'optional') {
      optionalTotal++;
      if (log && (log.status === 'completed' || log.status === 'partial')) optionalDone++;
      continue;
    }
    if (bucket === 'rest') continue;
    const minutes = item.session.plannedMinutes || 0;
    plannedAll += minutes;
    if (log && log.status && log.status !== 'unlogged') {
      loggedAll++;
      if (log.status === 'completed') actualAll += minutes;
      else if (log.status === 'partial') actualAll += log.actualMinutes || 0;
    }
  }
  const adherencePct = plannedAll > 0 && loggedAll > 0 ? actualAll / plannedAll : null;

  // --- goal model: current 2k estimate vs sub-7 target ---
  const current2k = estimateCurrent2k(all, logs);
  const lastWeek = WEEKS[WEEKS.length - 1];
  const finalTestDate = dateFromWeekDay(lastWeek, 'fri', planStartISO);
  const daysRemaining = Math.max(0, Math.round((finalTestDate - todayMid) / 86400000));
  const gapSec = current2k.seconds != null ? current2k.seconds - GOAL_2K_SECONDS : null;
  const onTrack = gapSec != null ? gapSec <= 2 : null; // 2s buffer

  // --- decide the operating mode ---
  let mode = 'as-planned';
  if (fatigueFlag) mode = 'recover';
  else if (volumeFlag && gapSec != null && gapSec > 0) mode = 'intensify';
  else if (volumeFlag) mode = 'rebuild-volume';

  return {
    volumeMissedPct, volumeFlag, plannedVolMin, actualVolMin, volLoggedCount,
    fatigueFlag, fatigueReasons: [...new Set(reasons)], qualityLogged, qualityStruggled, avgRpe,
    adherencePct, optionalDone, optionalTotal,
    current2k, gapSec, onTrack, daysRemaining, mode,
    all,
  };
}

// Estimate current 2k pace from best available evidence, most authoritative first.
function estimateCurrent2k(all, logs) {
  // 1) an explicit logged 2k test time (most recent, walking backwards)
  for (let i = all.length - 1; i >= 0; i--) {
    const item = all[i];
    if (item.session.kind !== 'test') continue;
    const log = logs[item.key];
    if (log && log.testSeconds) {
      return { seconds: log.testSeconds, source: `${item.session.label} · ${item.week.label}`, confidence: 'measured' };
    }
  }
  // 2) most recent race-pace / VO2 rep split, extrapolated to 2k
  for (let i = all.length - 1; i >= 0; i--) {
    const item = all[i];
    const bucket = bucketOf(item.session);
    if (bucket !== 'quality') continue;
    const log = logs[item.key];
    if (log && log.avgSplit500) {
      const factor = item.session.kind === 'race' ? 1.0 : item.session.kind === 'vo2' ? 1.005 : 1.03;
      return { seconds: log.avgSplit500 * 4 * factor, source: `extrapolated from ${item.session.label} · ${item.week.label}`, confidence: 'estimated' };
    }
  }
  // 3) no data at all — assume a conservative gap behind goal so the app doesn't overclaim
  return { seconds: GOAL_2K_SECONDS + 20, source: 'no data logged yet — placeholder estimate', confidence: 'unknown' };
}

// ---- idealised next-session targets -------------------------------------

function idealTargetsFor(session, engine, profile) {
  const kind = session.kind === 'easy' ? 'ut2' : session.kind;
  const base500 = (engine.current2k.seconds || GOAL_2K_SECONDS) / 4;
  const goal500 = GOAL_SPLIT_500;

  let lo, hi, guidance;
  const intensify = engine.mode === 'intensify';
  const recover = engine.mode === 'recover';

  switch (kind) {
    case 'ut2':
      lo = base500 * (recover ? 1.22 : 1.18);
      hi = base500 * (recover ? 1.28 : 1.24);
      guidance = recover
        ? 'Recovery mode: keep this conversational. Rate ≤20spm, HR must stay under the ceiling below — this is not the day to chase splits.'
        : 'Steady aerobic base. Rate 18–20spm, relaxed — pace should feel easy enough to hold a conversation.';
      break;
    case 'at':
      lo = goal500 * (intensify ? 1.055 : 1.065);
      hi = goal500 * (intensify ? 1.075 : 1.085);
      guidance = intensify
        ? 'Threshold work tightened slightly to close the gap to goal pace — still controlled, not a red-line effort.'
        : 'Comfortably hard, sustainable for the full interval. Rate 22–24spm.';
      break;
    case 'vo2':
      lo = goal500 * (intensify ? 0.965 : 0.975);
      hi = goal500 * (intensify ? 0.995 : 1.01);
      guidance = intensify
        ? 'Pushed toward/under goal pace — these reps are doing double duty as race-pace rehearsal.'
        : 'Hard intervals at/near target race pace. Rate 26–30spm.';
      break;
    case 'race':
      lo = goal500 * 0.985;
      hi = goal500 * 1.01;
      guidance = 'Race-pace rehearsal — this is what sub-7 pace should feel like. Rate 30–34spm.';
      break;
    case 'test':
      lo = goal500 * 0.97;
      hi = goal500 * 1.005;
      guidance = 'Negative-split the 2k: go out controlled through 1000m, empty the tank in the last 500m.';
      break;
    default:
      lo = base500 * 1.2; hi = base500 * 1.26; guidance = 'Easy effort.';
  }

  const hr = hrRangeFor(kind === 'ut2' ? 'ut2' : kind, profile);
  return {
    paceLowStr: secToPaceStr(lo),
    paceHighStr: secToPaceStr(hi),
    hr,
    guidance,
  };
}
