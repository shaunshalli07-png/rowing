# Sub-7 Erg Tracker — Trinity '26

An adaptive tracker for the Trinity '26 11-week erg training block (Erg sessions
only, transcribed from `SHALLI_VAC_TRAINING (TRINITY 26) Schedule.pdf`), built
around one goal: **a sub-7:00 2k by the final test**.

Static site, no build step, no backend — open `index.html` in a browser or serve
the folder (e.g. `python3 -m http.server`, or GitHub Pages). All data lives in
the browser's `localStorage`; nothing is sent anywhere.

## What it does

- **Logs what you actually did** per Erg session (completed / partial / skipped,
  actual minutes, avg split, avg HR, RPE, a note) — including the deviations
  already visible in your own schedule notes (the missed baseline test, the
  cut-short session, the "mental block" Saturday), seeded in on first load.
- **Two separate guards, not one adherence score:**
  - *Volume guard* — tracks trailing-14-day UT2 (steady-state) minutes only.
    Wednesdays are marked optional throughout the plan and are **excluded
    entirely** — skipping one is never treated as a miss.
  - *Fatigue guard* — tracks cut-short/skipped AT/VO2/race-pace sessions, RPE,
    hot-running UT2 heart rate, and fatigue language in your notes. It needs
    **two independent signals** (or one very high RPE) before it trips, so a
    single rough day doesn't flip the whole programme into recovery mode.
  - When both would fire, **fatigue always wins** — the plan never piles
    catch-up volume onto a fatigued athlete. When only volume is behind and
    you're also behind sub-7 pace, the next quality sessions are
    **intensified** instead of just padded with more base miles.
- **Idealised next-session targets** — pace range (/500m) and HR zone for
  whatever's next on the plan, built off your most recent 2k test time (or,
  lacking one, extrapolated from your latest AT/VO2/race-pace splits), scaled
  toward the sub-7:00 (≈1:44.8/500m) goal pace.
- **HR profile** — enter age (Tanaka estimate) or a known max/resting HR to
  turn the zone percentages into real bpm targets. UT2 is capped low on
  purpose; running hot on a steady piece is flagged as a fatigue signal.
- **Motivation board** — OUBC & Exeter College Boat Club. This build
  environment has no live internet access, so the photo URLs are
  best-effort (Wikimedia Commons) and every card has a graceful club-colour
  fallback if an image 404s — plus a link straight through to the club's own
  site/Instagram. Swap in your own photo URLs in `motivation.js` any time.

## Files

- `data.js` — the plan itself (11 structured weeks + the 2 preseason weeks),
  transcribed session-by-session from the PDF.
- `calc.js` — pace/HR math, the volume & fatigue guards, the goal model.
- `motivation.js` — motivation board content.
- `app.js` — state (localStorage) + rendering + event wiring.
- `styles.css`, `index.html`.
