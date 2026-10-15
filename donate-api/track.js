// Live position of a campaign run (the Futás relay), sent by a phone running the Traccar Client app.
//   POST /track/<slug>            from the phone, OsmAnd protocol (query params, form body or JSON).
//                                 The app's "device identifier" must equal TRACK_TOKEN.
//   GET  /track/<slug>[?route=1]  public: progress along the planned route (+ the route itself with route=1).
//                                 Only positions after TRACK_START, shown TRACK_DELAY_MIN minutes late.
//   GET  /track/<slug>?token=…    organisers: the same without start filter or delay, plus battery and raw fixes.
//   GET  /track/<slug>.gpx?token=…  organisers: the run as a GPX track (times, elevation) from TRACK_START;
//                                 &all=1 includes the test positions before it.
// Planned route = routes/<slug>.gpx (replace the file and restart to change it). Positions are kept in memory
// and appended to TRACK_DIR/<slug>.jsonl, so a restart keeps them. No database, no dependencies.
import fs from 'node:fs';
import { timingSafeEqual } from 'node:crypto';

const ROUTE_DIR = new URL('./routes/', import.meta.url);
const MAX_ACCURACY_M = 150;   // fixes worse than this are dropped
const ON_ROUTE_M = 250;       // a fix this close to the route counts as progress
const MAX_SPEED_MS = 12;      // ~43 km/h: anything faster along the route is a mismatch, not progress
const LIVE_MS = 10 * 60_000;  // no fix for this long → "paused" (phone handed over, no signal, …)

const runs = new Map();       // slug → { route, points, file }

export function trackConfig() {
    return {
        token: process.env.TRACK_TOKEN || '',
        dir: process.env.TRACK_DIR || new URL('./data/', import.meta.url).pathname,
        start: Date.parse(process.env.TRACK_START || '') || 0,
        delayMs: Math.max(0, Number(process.env.TRACK_DELAY_MIN || 0)) * 60_000
    };
}

export const isToken = (given, token) => {
    if (!token || typeof given !== 'string') return false;
    const a = Buffer.from(given), b = Buffer.from(token);
    return a.length === b.length && timingSafeEqual(a, b);
};

/** Fixes from one OsmAnd request: query params, a form body or Traccar Client's JSON ({location} or [{…}]). */
export function parseFixes(query, raw, contentType) {
    if ((contentType || '').includes('json')) {
        const body = JSON.parse(raw || '{}');
        const list = [].concat(body.location || body.locations || []);
        return { id: body.device_id || query.get('id') || query.get('deviceid'), fixes: list.map((l) => ({
            t: l.timestamp, lat: l.coords?.latitude, lon: l.coords?.longitude, acc: l.coords?.accuracy, alt: l.coords?.altitude,
            batt: l.battery?.level >= 0 ? Math.round(l.battery.level * 100) : undefined, mock: l.mock
        })) };
    }
    const p = [...query].length ? query : new URLSearchParams(raw || '');
    const [lat, lon] = p.get('location') ? p.get('location').split(',') : [p.get('lat'), p.get('lon')];
    return { id: p.get('id') || p.get('deviceid'), fixes: [{ t: p.get('timestamp'), lat, lon, acc: p.get('accuracy'), alt: p.get('altitude'), batt: p.get('batt') }] };
}

/** @returns {number} how many fixes were stored */
export function addFixes(slug, fixes, cfg) {
    const run = load(slug, cfg);
    const now = Date.now();
    const added = [];
    for (const f of fixes) {
        const fix = {
            t: parseTime(f.t) ?? now,
            lat: Number(f.lat), lon: Number(f.lon),
            acc: f.acc == null || f.acc === '' ? undefined : Number(f.acc),
            alt: f.alt == null || f.alt === '' || !Number.isFinite(Number(f.alt)) ? undefined : Math.round(Number(f.alt) * 10) / 10,
            batt: f.batt == null || f.batt === '' ? undefined : Number(f.batt)
        };
        if (f.mock || !(Math.abs(fix.lat) <= 90 && Math.abs(fix.lon) <= 180) || (!fix.lat && !fix.lon)) continue;
        if (fix.acc > MAX_ACCURACY_M || fix.t > now + 5 * 60_000) continue;
        if (run.points.some((p) => p.t === fix.t)) continue;
        added.push(fix);
    }
    if (!added.length) return 0;

    const inOrder = added.every((f, i) => f.t > (i ? added[i - 1].t : run.points.at(-1)?.t ?? 0));
    run.points.push(...added);
    if (inOrder) added.forEach((f, i) => progress(run, run.points.length - added.length + i));
    else { run.points.sort((a, b) => a.t - b.t); run.points.forEach((_, i) => progress(run, i)); }

    if (run.file) {
        try { fs.appendFileSync(run.file, added.map(({ m, ...f }) => JSON.stringify(f)).join('\n') + '\n'); }
        catch (err) { console.warn('[track] could not save to', run.file, err.message); run.file = null; }
    }
    return added.length;
}

/** Public (or, with full = true, organisers') view of the run. */
export function trackStatus(slug, cfg, { full = false, withRoute = false } = {}) {
    const run = load(slug, cfg);
    const now = Date.now();
    const shown = full ? run.points : run.points.filter((p) => p.t >= cfg.start && p.t <= now - cfg.delayMs);
    const last = shown.at(-1);
    const first = shown.find((p) => p.t >= cfg.start);
    const lengthKm = run.route.total / 1000;
    const km = last ? last.m / 1000 : 0;
    const status = !first ? 'before'
        : km >= lengthKm - 0.3 ? 'finished'
        : now - cfg.delayMs - last.t < LIVE_MS ? 'live' : 'paused';
    const out = {
        campaign: slug,
        status,
        length_km: round(lengthKm, 1),
        km: round(km, 1),
        started: first ? new Date(first.t).toISOString() : null,
        last: last ? { lat: round(last.lat, 5), lon: round(last.lon, 5), t: new Date(last.t).toISOString() } : null,
        delay_min: full ? 0 : cfg.delayMs / 60_000,
        updated: new Date(now).toISOString()
    };
    if (full) {
        out.points = run.points.length;
        out.battery = run.points.findLast((p) => p.batt != null)?.batt ?? null;
        out.last_fix = run.points.at(-1) || null;
        out.start_filter = cfg.start ? new Date(cfg.start).toISOString() : null;
    }
    if (withRoute) out.route = run.route.pts.map(([lat, lon]) => [round(lat, 5), round(lon, 5)]);
    return out;
}

/** The run as GPX 1.1: one track, a new segment after every gap of 10+ minutes (handover, no signal). */
export function trackGpx(slug, cfg, { all = false } = {}) {
    const run = load(slug, cfg);
    const pts = all ? run.points : run.points.filter((p) => p.t >= cfg.start);
    const segs = [];
    pts.forEach((p, i) => {
        if (!i || p.t - pts[i - 1].t >= LIVE_MS) segs.push([]);
        segs.at(-1).push(`      <trkpt lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}">${p.alt != null ? `<ele>${p.alt}</ele>` : ''}<time>${new Date(p.t).toISOString()}</time></trkpt>`);
    });
    return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="vilagitanifogok.hu donate-api" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>Világítani Fogok – ${slug}</name>${pts.length ? `<time>${new Date(pts[0].t).toISOString()}</time>` : ''}</metadata>
  <trk>
    <name>Világítani Fogok – ${slug}</name>
${segs.map((s) => `    <trkseg>\n${s.join('\n')}\n    </trkseg>`).join('\n')}
  </trk>
</gpx>
`;
}

export function hasRoute(slug) {
    return /^[a-z0-9-]{1,40}$/.test(slug) && fs.existsSync(new URL(`${slug}.gpx`, ROUTE_DIR));
}

// ─── internals ───────────────────────────────────────────────────────────────────────────────

function load(slug, cfg) {
    let run = runs.get(slug);
    if (run) return run;
    run = { route: readRoute(slug), points: [], file: null };
    try {
        fs.mkdirSync(cfg.dir, { recursive: true });
        run.file = `${cfg.dir.replace(/\/$/, '')}/${slug}.jsonl`;
        if (fs.existsSync(run.file)) {
            run.points = fs.readFileSync(run.file, 'utf8').split('\n').filter(Boolean)
                .map((l) => { try { return JSON.parse(l); } catch { return null; } })
                .filter(Boolean).sort((a, b) => a.t - b.t);
        }
        fs.accessSync(cfg.dir, fs.constants.W_OK);
    } catch (err) {
        console.warn(`[track] ${slug}: no writable TRACK_DIR (${cfg.dir}), positions kept in memory only –`, err.message);
        run.file = null;
    }
    run.points.forEach((_, i) => progress(run, i)); // the route may have changed since they were saved
    runs.set(slug, run);
    console.log(`[track] ${slug}: route ${(run.route.total / 1000).toFixed(1)} km, ${run.points.length} saved positions`);
    return run;
}

function readRoute(slug) {
    const gpx = fs.readFileSync(new URL(`${slug}.gpx`, ROUTE_DIR), 'utf8');
    let pts = [...gpx.matchAll(/<trkpt\b[^>]*?lat="([-\d.]+)"[^>]*?lon="([-\d.]+)"/g)].map((m) => [+m[1], +m[2]]);
    if (!pts.length) pts = [...gpx.matchAll(/<rtept\b[^>]*?lat="([-\d.]+)"[^>]*?lon="([-\d.]+)"/g)].map((m) => [+m[1], +m[2]]);
    if (pts.length < 2) throw new Error(`routes/${slug}.gpx has no track`);
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum[i] = cum[i - 1] + dist(pts[i - 1], pts[i]);
    return { pts, cum, total: cum.at(-1) };
}

// Distance along the route (metres) of point i, stored as .m (derived, not saved). Progress never goes backwards: a fix only
// advances it when it is on the route, within reach of the previous progress given the time since. If the
// phone was off for long, a fix far ahead still counts when it is right on the route (≤ 100 m).
function progress(run, i) {
    const p = run.points[i];
    const prev = i ? run.points[i - 1] : null;
    const prevM = prev?.m ?? 0;
    let m = prevM;
    if (prev) {
        const reach = 2000 + MAX_SPEED_MS * Math.max(0, (p.t - prev.t) / 1000);
        const near = nearest(run.route, p, prevM - 2000, prevM + reach);
        if (near && near.d <= ON_ROUTE_M) m = Math.max(prevM, near.m);
        else {
            const any = nearest(run.route, p, 0, Infinity);
            if (any && any.d <= 100 && any.m > prevM) m = any.m;
        }
    } else {
        const any = nearest(run.route, p, 0, Infinity);
        if (any && any.d <= ON_ROUTE_M) m = any.m;
    }
    p.m = m;
}

/** Closest point on the route segments that start between fromM and toM metres. */
function nearest(route, p, fromM, toM) {
    const { pts, cum } = route;
    const kx = 111_320 * Math.cos(p.lat * Math.PI / 180), ky = 110_540;
    let best = null;
    for (let i = 0; i < pts.length - 1; i++) {
        if (cum[i + 1] < fromM) continue;
        if (cum[i] > toM) break;
        const ax = (pts[i][1] - p.lon) * kx, ay = (pts[i][0] - p.lat) * ky;
        const bx = (pts[i + 1][1] - p.lon) * kx, by = (pts[i + 1][0] - p.lat) * ky;
        const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
        const t = len2 ? Math.min(1, Math.max(0, -(ax * dx + ay * dy) / len2)) : 0;
        const d = Math.hypot(ax + t * dx, ay + t * dy);
        if (!best || d < best.d) best = { d, m: cum[i] + t * (cum[i + 1] - cum[i]) };
    }
    return best;
}

function dist(a, b) {
    const r = Math.PI / 180;
    const h = Math.sin((b[0] - a[0]) * r / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin((b[1] - a[1]) * r / 2) ** 2;
    return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

function parseTime(v) {
    if (v == null || v === '') return null;
    if (/^\d+(\.\d+)?$/.test(String(v))) { const n = Number(v); return n < 1e11 ? n * 1000 : n; }
    const t = Date.parse(String(v).replace(' ', 'T'));
    return Number.isNaN(t) ? null : t;
}

const round = (n, d) => Math.round(n * 10 ** d) / 10 ** d;
