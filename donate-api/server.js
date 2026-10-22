// Minimal HTTP wrapper around createCheckout (no dependencies).
//   POST /checkout  { amount, frequency, email?, name?, campaign?, return_path? } → { url }
//   GET  /campaign/<slug>  → { total, donations, updated }  live card total of a campaign (see campaign.js)
//   POST /webhook  Stripe events → donor as Ghost member (see donors.js)
//   GET|POST /track/<slug>  live position of a campaign run;  GET /track/<slug>.gpx?token=…  the run as GPX (see track.js)
//   GET  /admin/  organisers' list of all card donations, filterable; password ADMIN_PASSWORD (see admin.js)
//   GET  /health
import http from 'node:http';
import { createCheckout } from './checkout.js';
import { campaignTotal, recordMock } from './campaign.js';
import { verifyEvent, donorFromSession, syncDonor } from './donors.js';
import { adminRoute } from './admin.js';
import { trackConfig, isToken, parseFixes, addFixes, trackStatus, trackGpx, hasRoute } from './track.js';

const PORT = Number(process.env.PORT || 8787);
const env = {
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || '',
    SITE_URL: process.env.SITE_URL || 'http://localhost:2368',
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || '',
    GHOST_ADMIN_API_KEY: process.env.GHOST_ADMIN_API_KEY || '',
    GHOST_API_URL: process.env.GHOST_API_URL || '',
    DONOR_REPORT_NEWSLETTER: process.env.DONOR_REPORT_NEWSLETTER || '',
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || '',
    STRIPE_READ_KEY: process.env.STRIPE_READ_KEY || ''
};
const track = trackConfig();
const allowed = (process.env.ALLOWED_ORIGINS || env.SITE_URL).split(',').map((s) => s.trim().replace(/\/$/, ''));

function send(res, status, body, origin, extra = {}) {
    const headers = { 'Content-Type': 'application/json; charset=utf-8', ...extra };
    if (origin && allowed.includes(origin)) {
        headers['Access-Control-Allow-Origin'] = origin;
        headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
        headers['Access-Control-Allow-Headers'] = 'Content-Type';
        headers.Vary = 'Origin';
    }
    res.writeHead(status, headers);
    res.end(body === null ? '' : JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    const { pathname } = new URL(req.url, 'http://x');

    if (req.method === 'OPTIONS') return send(res, 204, null, origin);
    if (req.method === 'GET' && pathname === '/health') {
        return send(res, 200, { ok: true, stripe: env.STRIPE_SECRET_KEY ? (env.STRIPE_SECRET_KEY.startsWith('sk_live') ? 'live' : 'test') : 'mock' }, origin);
    }
    const camp = pathname.match(/^\/campaign\/([a-z0-9-]{1,40})\/?$/);
    if (req.method === 'GET' && camp) {
        try {
            // campaign.js caches for a minute, so browsers may always ask
            return send(res, 200, await campaignTotal(camp[1], env), origin, { 'Cache-Control': 'no-cache' });
        } catch (err) {
            return send(res, err.status || 500, { error: err.message }, origin);
        }
    }
    const run = pathname.match(/^\/track\/([a-z0-9-]{1,40})\/?$/);
    if (run) return trackRoute(req, res, run[1], origin);
    const gpx = pathname.match(/^\/track\/([a-z0-9-]{1,40})\.gpx$/);
    if (gpx && req.method === 'GET' && hasRoute(gpx[1])) {
        const query = new URL(req.url, 'http://x').searchParams;
        if (!isToken(query.get('token'), track.token)) return send(res, 403, { error: 'Forbidden' });
        res.writeHead(200, { 'Content-Type': 'application/gpx+xml; charset=utf-8', 'Content-Disposition': `attachment; filename="${gpx[1]}.gpx"`, 'Cache-Control': 'no-store' });
        return res.end(trackGpx(gpx[1], track, { all: query.get('all') === '1' }));
    }
    if (pathname === '/admin' || pathname.startsWith('/admin/')) return adminRoute(req, res, pathname, env);
    if (req.method === 'POST' && pathname === '/webhook') return webhook(req, res);
    if (req.method !== 'POST' || pathname !== '/checkout') return send(res, 404, { error: 'Not found' }, origin);
    if (origin && !allowed.includes(origin)) return send(res, 403, { error: 'Origin not allowed' }, origin);

    let raw = '';
    for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 10_000) return send(res, 413, { error: 'Too large' }, origin);
    }
    try {
        const input = JSON.parse(raw || '{}');
        const result = await createCheckout(input, env);
        if (!env.STRIPE_SECRET_KEY && input.campaign) recordMock(input.campaign, Math.round(Number(input.amount)));
        console.log(`[checkout] ${input.frequency} ${input.amount} Ft${input.campaign ? ` [${input.campaign}]` : ''} → ${env.STRIPE_SECRET_KEY ? 'stripe' : 'mock'}`);
        send(res, 200, result, origin);
    } catch (err) {
        send(res, err.status || 500, { error: err.status ? err.message : 'Szerver hiba' }, origin);
        if (!err.status) console.error(err);
    }
});

// Phone (Traccar Client) → POST; the /futas/ map → GET. See track.js.
async function trackRoute(req, res, slug, origin) {
    if (!hasRoute(slug)) return send(res, 404, { error: 'Not found' }, origin);
    const query = new URL(req.url, 'http://x').searchParams;
    if (req.method === 'GET') {
        const full = isToken(query.get('token'), track.token);
        return send(res, 200, trackStatus(slug, track, { full, withRoute: query.get('route') === '1' }), origin, { 'Cache-Control': 'no-cache' });
    }
    if (req.method !== 'POST' || !track.token) return send(res, 404, { error: 'Not found' });
    let raw = '';
    for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 200_000) return send(res, 413, { error: 'Too large' });
    }
    try {
        const { id, fixes } = parseFixes(query, raw, req.headers['content-type']);
        if (!isToken(id, track.token) && !isToken(query.get('token'), track.token)) return send(res, 403, { error: 'Unknown device' });
        const n = addFixes(slug, fixes, track);
        if (n) console.log(`[track] ${slug}: +${n}`);
        send(res, 200, { ok: true, added: n });
    } catch (err) {
        console.warn('[track] bad request:', err.message);
        send(res, 400, { error: 'Bad request' });
    }
}

// Stripe → here (no Origin, no CORS). Answers 500 when Ghost fails, so Stripe retries later.
async function webhook(req, res) {
    if (!env.STRIPE_WEBHOOK_SECRET) return send(res, 404, { error: 'Not found' });
    // bytes, not string chunks: a multi-byte character split between chunks would break the signature
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
        chunks.push(chunk);
        if ((size += chunk.length) > 500_000) return send(res, 413, { error: 'Too large' });
    }
    const raw = Buffer.concat(chunks).toString('utf8');
    let event;
    try {
        event = verifyEvent(raw, req.headers['stripe-signature'], env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        console.warn('[webhook] rejected:', err.message);
        return send(res, 400, { error: err.message });
    }
    if (event.type !== 'checkout.session.completed' && event.type !== 'checkout.session.async_payment_succeeded') {
        return send(res, 200, { ignored: event.type });
    }
    const donor = donorFromSession(event.data?.object);
    if (!donor) return send(res, 200, { ignored: 'not a paid donation' });
    if (!env.GHOST_ADMIN_API_KEY) {
        console.warn('[webhook] GHOST_ADMIN_API_KEY not set – donor not saved', donor.session);
        return send(res, 200, { ignored: 'ghost not configured' });
    }
    try {
        const result = await syncDonor(donor, env);
        console.log(`[webhook] donor ${result}: ${donor.monthly ? 'monthly' : 'once'} ${donor.amount} Ft${donor.campaign ? ` [${donor.campaign}]` : ''}${donor.report ? ' +report' : ''}${donor.newsletter ? ' +napló' : ''}`);
        send(res, 200, { donor: result });
    } catch (err) {
        console.error('[webhook]', donor.session, err.message);
        send(res, 500, { error: 'Ghost sync failed' });
    }
}

server.listen(PORT, () => {
    console.log(`vf-donate-api listening on :${PORT} (stripe: ${env.STRIPE_SECRET_KEY ? 'on' : 'MOCK – no STRIPE_SECRET_KEY'}, webhook: ${env.STRIPE_WEBHOOK_SECRET ? 'on' : 'off'}, track: ${track.token ? 'on' : 'off'}, admin: ${env.ADMIN_PASSWORD ? 'on' : 'off'}), allowed origins: ${allowed.join(', ')}`);
});
