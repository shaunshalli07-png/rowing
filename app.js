// ---------------------------------------------------------------------------
// App glue: state (localStorage), rendering, and event wiring.
// No build step, no backend — everything lives in this browser.
// ---------------------------------------------------------------------------

const PLAN_START_ISO = '2026-06-29'; // Monday of the first (preseason) week in WEEKS[0]
const LS_LOGS = 'sub7.logs.v1';
const LS_PROFILE = 'sub7.profile.v1';

// Some hosting contexts (sandboxed iframes, private browsing) block localStorage
// entirely and *throw* on access rather than just no-op. Fall back to an
// in-memory store so the app still works for the session either way.
const memoryStore = {};
const safeStorage = {
  get(key) {
    try { return localStorage.getItem(key); } catch (e) { return Object.prototype.hasOwnProperty.call(memoryStore, key) ? memoryStore[key] : null; }
  },
  set(key, val) {
    try { localStorage.setItem(key, val); } catch (e) { memoryStore[key] = val; }
  },
};
let persistent = true;
try { localStorage.setItem('sub7.probe', '1'); localStorage.removeItem('sub7.probe'); } catch (e) { persistent = false; }

let logs = loadLogs();
let profile = loadProfile();

function loadLogs() {
  try {
    const raw = safeStorage.get(LS_LOGS);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* ignore corrupt storage */ }
  const seeded = {};
  for (const [key, val] of Object.entries(SEED_LOGS)) seeded[key] = { status: 'unlogged', ...val };
  safeStorage.set(LS_LOGS, JSON.stringify(seeded));
  return seeded;
}
function saveLogs() { safeStorage.set(LS_LOGS, JSON.stringify(logs)); }

function loadProfile() {
  try {
    const raw = safeStorage.get(LS_PROFILE);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* ignore */ }
  return { age: null, hrMax: null, hrRest: null };
}
function saveProfile() { safeStorage.set(LS_PROFILE, JSON.stringify(profile)); }

function effectiveProfile() {
  const hrMax = profile.hrMax || estimateHRMax(profile.age) || null;
  return { hrMax, hrRest: profile.hrRest || null, estimated: !profile.hrMax && !!profile.age };
}

function todayMidnight() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// ---- engine (recomputed on every render) --------------------------------

let engine = null;
function recompute() {
  engine = computeEngine({ planStartISO: PLAN_START_ISO, logs, today: new Date(), profile: effectiveProfile() });
  // next 1-2 quality / volume sessions from today, used to scope intensify/reduce badges
  const todayMid = todayMidnight();
  const future = engine.all.filter((s) => s.date >= todayMid);
  engine.nextQualityKeys = future.filter((s) => bucketOf(s.session) === 'quality').slice(0, 2).map((s) => s.key);
  engine.nextVolumeKeys = future.filter((s) => bucketOf(s.session) === 'volume').slice(0, 2).map((s) => s.key);
}

function findNextSession() {
  const todayMid = todayMidnight();
  for (const item of engine.all) {
    if (item.date < todayMid) continue;
    const log = logs[item.key];
    const alreadyLogged = log && log.status && log.status !== 'unlogged';
    if (item.date.getTime() === todayMid.getTime() && alreadyLogged) continue;
    return item;
  }
  return null;
}

function findDefaultLogTarget() {
  const todayMid = todayMidnight();
  // most recent unlogged session at/before today
  let candidate = null;
  for (const item of engine.all) {
    if (item.date > todayMid) break;
    const log = logs[item.key];
    if (!log || !log.status || log.status === 'unlogged') candidate = item;
  }
  return candidate || findNextSession() || engine.all[0];
}

// ---- rendering ------------------------------------------------------------

function fmtDate(d) {
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function kindLabel(kind) {
  return { ut2: 'UT2', at: 'AT', vo2: 'VO2', race: 'Race pace', test: '2K TEST', easy: 'Easy / optional' }[kind] || kind;
}

function statusBadge(log) {
  if (!log || !log.status || log.status === 'unlogged') return '<span class="badge badge-unlogged">not logged</span>';
  const map = {
    completed: ['badge-completed', 'done'],
    partial: ['badge-partial', 'partial'],
    skipped: ['badge-skipped', 'skipped'],
    incomplete: ['badge-skipped', "didn't finish"],
  };
  const [cls, text] = map[log.status] || ['badge-unlogged', log.status];
  return `<span class="badge ${cls}">${text}</span>`;
}

function computeAdjustmentBadge(item, todayMid) {
  const bucket = bucketOf(item.session);
  if (bucket === 'optional') return { text: 'Optional — skipping is not a setback', cls: 'badge-optional' };
  if (item.date < todayMid) return null;
  if (bucket === 'quality' && engine.nextQualityKeys.includes(item.key)) {
    if (engine.mode === 'recover') return { text: 'Dialled back ~20% — fatigue guard active', cls: 'badge-reduced' };
    if (engine.mode === 'intensify') return { text: 'Intensified — closing the gap to sub-7', cls: 'badge-intensified' };
  }
  if (bucket === 'volume' && engine.nextVolumeKeys.includes(item.key)) {
    if (engine.mode === 'recover') return { text: 'Keep it easy — HR capped, not a make-up day', cls: 'badge-reduced' };
    if (engine.mode === 'rebuild-volume' || engine.mode === 'intensify') return { text: '+10–15% — rebuilding missed volume', cls: 'badge-extend' };
  }
  return null;
}

function renderGoalStat() {
  const el = document.getElementById('goal-stat');
  const c = engine.current2k;
  el.innerHTML = `
    <div class="stat"><span class="stat-num">${secToClock(c.seconds)}</span><span class="stat-label">current 2k ${c.confidence === 'measured' ? 'PB' : 'estimate'}</span></div>
    <div class="stat"><span class="stat-num">${engine.daysRemaining}</span><span class="stat-label">days to final test</span></div>
    <div class="stat"><span class="stat-num ${engine.onTrack ? 'good' : 'warn'}">${engine.gapSec == null ? '—' : (engine.gapSec <= 0 ? 'on track' : '+' + secToClock(engine.gapSec))}</span><span class="stat-label">vs sub-7:00 goal</span></div>
  `;
}

const MODE_COPY = {
  'as-planned': { icon: '✅', title: 'On plan', body: 'No red flags on volume or fatigue. Keep executing the block as written.' },
  recover: { icon: '🛑', title: 'Fatigue guard active — recovery first', body: 'Quality (AT/VO2/race-pace) sessions are being dialled back. Volume catch-up is paused until this clears — piling more work on a fatigued athlete doesn\'t protect the goal, it delays it.' },
  intensify: { icon: '🔥', title: 'Intensifying to protect the sub-7 goal', body: 'Aerobic volume has slipped and you\'re currently behind sub-7 pace, but fatigue is not flagged — so the next quality sessions are being tightened toward goal pace to close the gap.' },
  'rebuild-volume': { icon: '📈', title: 'Rebuilding missed aerobic volume', body: 'UT2 volume has slipped over the last 2 weeks. You\'re still on track for sub-7, so this is just a base top-up — next UT2 sessions extended ~10–15%, no need to add intensity.' },
};

function renderModeBanner() {
  const el = document.getElementById('mode-banner');
  const m = MODE_COPY[engine.mode];
  el.className = `card mode-banner mode-${engine.mode}`;
  el.innerHTML = `
    <div class="mode-icon">${m.icon}</div>
    <div>
      <h3>${m.title}</h3>
      <p>${m.body}</p>
      ${engine.fatigueFlag && engine.fatigueReasons.length ? `<ul class="reason-list">${engine.fatigueReasons.map((r) => `<li>${r}</li>`).join('')}</ul>` : ''}
    </div>
  `;
}

function renderInsights() {
  const el = document.getElementById('insights-card');
  const volPct = Math.round(engine.volumeMissedPct * 100);
  el.innerHTML = `
    <h2>Guards</h2>
    <div class="insight-grid">
      <div class="insight">
        <h4>Volume (UT2 base) — trailing 14 days</h4>
        <p class="big ${engine.volumeFlag ? 'warn' : 'good'}">${engine.volLoggedCount ? volPct + '% missed' : 'no data yet'}</p>
        <p class="muted small">${Math.round(engine.actualVolMin)}' of ${Math.round(engine.plannedVolMin)}' logged. Wednesdays are excluded — they're optional by design, never counted as missed.</p>
      </div>
      <div class="insight">
        <h4>Fatigue guard (AT / VO2 / race-pace)</h4>
        <p class="big ${engine.fatigueFlag ? 'warn' : 'good'}">${engine.fatigueFlag ? 'ON' : 'clear'}</p>
        <p class="muted small">${engine.qualityLogged ? `${engine.qualityStruggled}/${engine.qualityLogged} quality sessions cut short` : 'no quality sessions logged yet'}${engine.avgRpe ? `, avg RPE ${engine.avgRpe.toFixed(1)}` : ''}. This is a different signal from volume — missing a UT2 piece isn't fatigue, cutting short a hard AT/VO2 piece repeatedly is.</p>
      </div>
      <div class="insight">
        <h4>Adherence (non-optional sessions)</h4>
        <p class="big">${engine.adherencePct == null ? '—' : Math.round(engine.adherencePct * 100) + '%'}</p>
        <p class="muted small">${engine.optionalTotal ? `+${engine.optionalDone}/${engine.optionalTotal} optional Wednesday pieces done as a bonus.` : ''}</p>
      </div>
    </div>
  `;
}

function renderNextSession() {
  const el = document.getElementById('next-session-card');
  const item = findNextSession();
  if (!item) {
    el.innerHTML = '<h2>Next session</h2><p>Plan complete — nothing scheduled after the final test. Go race it.</p>';
    return;
  }
  const t = idealTargetsFor(item.session, engine, effectiveProfile());
  const prof = effectiveProfile();
  el.innerHTML = `
    <h2>Next session — idealised targets</h2>
    <p class="next-session-when">${fmtDate(item.date)} · <span class="badge badge-kind">${kindLabel(item.session.kind)}</span></p>
    <p class="next-session-label">${item.session.label}</p>
    <div class="target-grid">
      <div class="target"><span class="target-label">Split /500m</span><span class="target-val">${t.paceLowStr}–${t.paceHighStr}</span></div>
      <div class="target"><span class="target-label">Heart rate</span><span class="target-val">${t.hr.low && t.hr.high ? `${t.hr.low}–${t.hr.high} bpm` : 'set your HR profile below'}</span></div>
    </div>
    <p class="guidance">${t.guidance}</p>
    ${item.session.kind === 'ut2' ? '<p class="muted small">UT2 = easy aerobic. If your HR creeps above this range, back the split off further — pace should follow HR here, not the other way round.</p>' : ''}
    <p class="muted small">Targets built off current 2k estimate <strong>${secToClock(engine.current2k.seconds)}</strong> (${engine.current2k.source})${prof.estimated ? ' · HR max estimated from age' : ''}.</p>
  `;
}

function renderLogCard() {
  const el = document.getElementById('log-card');
  const target = findDefaultLogTarget();
  const options = engine.all.filter((i) => i.session).map((i) => {
    const log = logs[i.key];
    const tick = log && log.status && log.status !== 'unlogged' ? '✓ ' : '';
    return `<option value="${i.key}" ${i.key === target.key ? 'selected' : ''}>${tick}${i.week.label} · ${DAY_LABELS[i.dayKey]} — ${i.session.label}</option>`;
  }).join('');
  el.innerHTML = `
    <h2>Log a session</h2>
    <label class="grow">Which session?
      <select id="log-picker">${options}</select>
    </label>
    <div id="log-form-mount"></div>
  `;
  mountLogForm(target.key);
  document.getElementById('log-picker').addEventListener('change', (e) => mountLogForm(e.target.value));
}

function mountLogForm(key) {
  const mount = document.getElementById('log-form-mount');
  const item = engine.all.find((i) => i.key === key);
  const tpl = document.getElementById('tpl-log-form');
  const frag = tpl.content.cloneNode(true);
  const form = frag.querySelector('form');
  form.dataset.key = key;
  const log = logs[key] || {};
  form.status.value = log.status || 'unlogged';
  if (log.actualMinutes != null) form.actualMinutes.value = log.actualMinutes;
  if (log.avgSplit500 != null) form.avgSplit500.value = secToPaceStr(log.avgSplit500);
  if (log.avgHR != null) form.avgHR.value = log.avgHR;
  if (log.rpe != null) form.rpe.value = log.rpe;
  if (log.testSeconds != null) form.testTime.value = secToClock(log.testSeconds);
  if (log.note) form.note.value = log.note;
  if (!item.session.isTest) form.querySelector('.only-test').style.display = 'none';
  mount.innerHTML = '';
  mount.appendChild(frag);
  mount.querySelector('form').addEventListener('submit', onLogSubmit);
}

function onLogSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const key = form.dataset.key;
  const fd = new FormData(form);
  const status = fd.get('status');
  if (status === 'unlogged') {
    delete logs[key];
  } else {
    logs[key] = {
      status,
      actualMinutes: fd.get('actualMinutes') ? Number(fd.get('actualMinutes')) : null,
      avgSplit500: paceStrToSec(fd.get('avgSplit500')),
      avgHR: fd.get('avgHR') ? Number(fd.get('avgHR')) : null,
      rpe: fd.get('rpe') ? Number(fd.get('rpe')) : null,
      testSeconds: paceStrToSec(fd.get('testTime')),
      note: fd.get('note') || null,
    };
  }
  saveLogs();
  renderAll();
}

function renderProfile() {
  const el = document.getElementById('profile-body');
  el.innerHTML = `
    <div class="log-form-row">
      <label>Age <input type="number" id="p-age" min="10" max="90" value="${profile.age ?? ''}" /></label>
      <label>Max HR (overrides age estimate) <input type="number" id="p-hrmax" min="120" max="220" value="${profile.hrMax ?? ''}" /></label>
      <label>Resting HR (optional, improves accuracy) <input type="number" id="p-hrrest" min="30" max="100" value="${profile.hrRest ?? ''}" /></label>
    </div>
    <p class="muted small">Used only to turn zone %s into bpm targets — UT2 ≈ 60–72%, AT ≈ 80–87%, VO2/race ≈ 88–98%. Nothing leaves this browser.</p>
  `;
  const save = () => {
    profile.age = document.getElementById('p-age').value ? Number(document.getElementById('p-age').value) : null;
    profile.hrMax = document.getElementById('p-hrmax').value ? Number(document.getElementById('p-hrmax').value) : null;
    profile.hrRest = document.getElementById('p-hrrest').value ? Number(document.getElementById('p-hrrest').value) : null;
    saveProfile();
    renderAll();
  };
  el.querySelectorAll('input').forEach((inp) => inp.addEventListener('change', save));
}

function renderWeeks() {
  const el = document.getElementById('weeks');
  const todayMid = todayMidnight();
  const todayKey = engine.all.find((i) => i.date.getTime() === todayMid.getTime())?.week?.id;
  el.innerHTML = WEEKS.map((week) => {
    const items = DAY_KEYS.map((dk) => ({ dayKey: dk, session: week.days[dk] })).filter((x) => x.session);
    if (!items.length) return '';
    const isCurrent = week.id === todayKey;
    const isPast = items.every((x) => engine.all.find((i) => i.week.id === week.id && i.dayKey === x.dayKey).date < todayMid);
    const needsBackfill = !week.preseason && isPast && items.some((x) => {
      const it = engine.all.find((i) => i.week.id === week.id && i.dayKey === x.dayKey);
      const bucket = bucketOf(it.session);
      const l = logs[it.key];
      return bucket !== 'optional' && (!l || !l.status || l.status === 'unlogged');
    });
    return `
      <details class="week-card ${isCurrent ? 'is-current' : ''}" ${isCurrent || needsBackfill ? 'open' : ''}>
        <summary>
          <span class="week-title">${week.label}${week.weekNum ? ` · Week ${week.weekNum}` : ''}${isCurrent ? ' <span class="pill">this week</span>' : ''}</span>
          <span class="week-phase">${week.phase}${week.deload ? ' · deload' : ''}</span>
        </summary>
        <div class="day-rows">
          ${items.map(({ dayKey, session }) => {
            const item = engine.all.find((i) => i.week.id === week.id && i.dayKey === dayKey);
            const log = logs[item.key];
            const adj = computeAdjustmentBadge(item, todayMid);
            return `
              <button type="button" class="day-row" data-key="${item.key}">
                <span class="day-date">${fmtDate(item.date)}</span>
                <span class="day-session">
                  <span class="badge badge-kind">${kindLabel(session.kind)}</span>
                  ${session.label}
                  ${session.structure ? `<span class="muted small block">${session.structure}</span>` : ''}
                </span>
                <span class="day-badges">
                  ${statusBadge(log)}
                  ${adj ? `<span class="badge ${adj.cls}">${adj.text}</span>` : ''}
                </span>
              </button>
              ${log && log.note ? `<p class="day-note">“${log.note}”</p>` : ''}
            `;
          }).join('')}
        </div>
      </details>
    `;
  }).join('');

  el.querySelectorAll('.day-row').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.getElementById('log-picker').value = btn.dataset.key;
      mountLogForm(btn.dataset.key);
      document.getElementById('log-card').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });
}

function renderMotivation() {
  const el = document.getElementById('motivation-grid');
  el.innerHTML = MOTIVATION_CARDS.map((c, idx) => `
    <a class="moti-card" href="${c.link}" target="_blank" rel="noopener" style="--card-colour:${c.colour}; --card-accent:${c.accent}">
      <div class="moti-media" id="moti-media-${idx}">
        ${c.img ? `<img src="${c.img}" alt="${c.club}" loading="lazy" onerror="this.parentElement.classList.add('moti-fallback'); this.remove();" />` : ''}
      </div>
      <div class="moti-body">
        <span class="moti-tag">${c.tag}</span>
        <p class="moti-quote">${c.quote}</p>
        <span class="moti-link">${c.linkLabel} ↗</span>
      </div>
    </a>
  `).join('');
  MOTIVATION_CARDS.forEach((c, idx) => {
    if (!c.img) document.getElementById(`moti-media-${idx}`).classList.add('moti-fallback');
  });
}

function renderAll() {
  recompute();
  renderGoalStat();
  renderModeBanner();
  renderNextSession();
  renderLogCard();
  renderInsights();
  renderProfile();
  renderWeeks();
}

function renderStorageNotice() {
  if (persistent) return;
  const el = document.querySelector('.site-footer .wrap');
  if (el) el.innerHTML = '⚠️ This preview can\'t persist to local storage (sandboxed context) — logs will reset on reload. Open the deployed site directly to keep your data.';
}

renderMotivation();
renderAll();
renderStorageNotice();
