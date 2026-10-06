// Minimal HTTP wrapper around createCheckout (no dependencies).
//   POST /checkout  { amount, frequency, email?, name? } → { url }
//   GET  /health
import http from 'node:http';
import { createCheckout } from './checkout.js';

const PORT = Number(process.env.PORT || 8787);
const env = {
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || '',
    SITE_URL: process.env.SITE_URL || 'http://localhost:2368'
};
const allowed = (process.env.ALLOWED_ORIGINS || env.SITE_URL).split(',').map((s) => s.trim().replace(/\/$/, ''));

function send(res, status, body, origin) {
    const headers = { 'Content-Type': 'application/json; charset=utf-8' };
    if (origin && allowed.includes(origin)) {
        headers['Access-Control-Allow-Origin'] = origin;
        headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
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
        console.log(`[checkout] ${input.frequency} ${input.amount} Ft${input.campaign ? ` [${input.campaign}]` : ''} → ${env.STRIPE_SECRET_KEY ? 'stripe' : 'mock'}`);
        send(res, 200, result, origin);
    } catch (err) {
        send(res, err.status || 500, { error: err.status ? err.message : 'Szerver hiba' }, origin);
        if (!err.status) console.error(err);
    }
});

server.listen(PORT, () => {
    console.log(`vf-donate-api listening on :${PORT} (stripe: ${env.STRIPE_SECRET_KEY ? 'on' : 'MOCK – no STRIPE_SECRET_KEY'}), allowed origins: ${allowed.join(', ')}`);
});
