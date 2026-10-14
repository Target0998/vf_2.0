// Donor records in Ghost Members (Stripe keeps the money, Ghost keeps the people).
// A paid Checkout Session from the donate box becomes a Ghost member with labels:
//   "Támogató", "Egyszeri támogató" | "Havi támogató", "Kampány: <slug>", "Beszámolót kér"
// Newsletters only with consent:
//   report newsletter  ← the "Elküldjük, mire fordítottuk…" field on Stripe's checkout page said yes
//   Napló newsletter(s) ← the "Feliratkozom" box was ticked (metadata.newsletter = '1')
// Creating a member through the Admin API sends no email. Used by server.js (webhook) and backfill.js.
import { createHmac, timingSafeEqual } from 'node:crypto';

export const SOURCE = 'vf-ghost-donate-box';
export const REPORT_FIELD = 'beszamolo'; // custom field key on the Checkout page (checkout.js)

export const LABELS = {
    donor: 'Támogató',
    once: 'Egyszeri támogató',
    monthly: 'Havi támogató',
    report: 'Beszámolót kér',
    campaign: (slug) => `Kampány: ${slug}`
};

const NOTE_MAX = 2000; // Ghost's limit for member notes

/**
 * Checks the Stripe-Signature header (https://docs.stripe.com/webhooks#verify-manually) and returns the event.
 * @param {string} raw  request body exactly as received
 */
export function verifyEvent(raw, header, secret, toleranceSec = 300) {
    const parts = {};
    const sigs = [];
    for (const item of String(header || '').split(',')) {
        const [k, v] = item.split('=');
        if (k === 't') parts.t = v;
        if (k === 'v1') sigs.push(v);
    }
    const t = Number(parts.t);
    if (!t || !sigs.length) throw httpError(400, 'Bad signature header');
    if (Math.abs(Date.now() / 1000 - t) > toleranceSec) throw httpError(400, 'Signature too old');
    const expected = createHmac('sha256', secret).update(`${parts.t}.${raw}`).digest();
    const ok = sigs.some((s) => {
        const got = Buffer.from(s, 'hex');
        return got.length === expected.length && timingSafeEqual(got, expected);
    });
    if (!ok) throw httpError(400, 'Bad signature');
    return JSON.parse(raw);
}

/** Checkout Session → donor, or null if it isn't a paid donation from our donate box. */
export function donorFromSession(s) {
    if (s?.object !== 'checkout.session' || s.metadata?.source !== SOURCE || s.payment_status !== 'paid') return null;
    const email = s.customer_details?.email || s.customer_email;
    if (!email) return null;
    const report = (s.custom_fields || []).find((f) => f.key === REPORT_FIELD)?.dropdown?.value === 'igen';
    return {
        session: s.id,
        email: email.toLowerCase(),
        name: s.metadata?.name || s.customer_details?.name || '',
        amount: Math.round((s.amount_total || 0) / 100), // HUF is sent ×100 (see checkout.js)
        monthly: s.mode === 'subscription',
        campaign: s.metadata?.campaign || '',
        date: new Date((s.created || Date.now() / 1000) * 1000).toISOString().slice(0, 10),
        report,
        newsletter: s.metadata?.newsletter === '1'
    };
}

/**
 * Creates or updates the donor's Ghost member. Never removes labels or newsletters.
 * Idempotent: a session already written in the member's note is skipped (Stripe retries webhooks).
 * @param {object} env  { GHOST_ADMIN_API_KEY, GHOST_API_URL, SITE_URL, DONOR_REPORT_NEWSLETTER }
 * @returns {Promise<'created'|'updated'|'skipped'>}
 */
export async function syncDonor(d, env, { dryRun = false } = {}) {
    const ghost = ghostClient(env);
    const { members } = await ghost('GET', `/members/?filter=${encodeURIComponent(`email:'${d.email.replace(/'/g, "\\'")}'`)}&include=labels,newsletters&limit=1`);
    const existing = members[0];
    if (existing?.note?.includes(d.session)) return 'skipped';

    const labels = [LABELS.donor, d.monthly ? LABELS.monthly : LABELS.once];
    if (d.campaign) labels.push(LABELS.campaign(d.campaign));
    if (d.report) labels.push(LABELS.report);

    const newsletters = new Set((existing?.newsletters || []).map((n) => n.id));
    if (d.report || d.newsletter) {
        const all = (await ghost('GET', '/newsletters/?filter=status:active&limit=all')).newsletters;
        const reportSlug = env.DONOR_REPORT_NEWSLETTER || 'beszamolo-tamogatoknak';
        const report = all.find((n) => n.slug === reportSlug);
        if (d.report) {
            if (report) newsletters.add(report.id);
            else console.warn(`[donors] no active newsletter "${reportSlug}" in Ghost – label only`);
        }
        if (d.newsletter) all.filter((n) => n.subscribe_on_signup && n.id !== report?.id).forEach((n) => newsletters.add(n.id));
    }

    const line = `${d.date} · ${String(d.amount).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} Ft ${d.monthly ? 'havi' : 'egyszeri'}${d.campaign ? ` · ${d.campaign}` : ''} · ${d.session}`;
    let note = existing?.note ? `${existing.note}\n${line}` : line;
    while (note.length > NOTE_MAX && note.includes('\n')) note = note.slice(note.indexOf('\n') + 1); // drop the oldest lines

    const member = {
        name: existing?.name || d.name || undefined,
        note,
        labels: [...new Set([...(existing?.labels || []).map((l) => l.name), ...labels])].map((name) => ({ name })),
        newsletters: [...newsletters].map((id) => ({ id }))
    };
    if (dryRun) return existing ? 'updated' : 'created';
    if (existing) {
        await ghost('PUT', `/members/${existing.id}/`, { members: [member] });
        return 'updated';
    }
    // newsletters must be explicit: without it Ghost subscribes new members to every default newsletter
    await ghost('POST', '/members/', { members: [{ email: d.email, ...member }] });
    return 'created';
}

// --- Ghost Admin API ---------------------------------------------------------------------------
function ghostClient(env) {
    const key = String(env.GHOST_ADMIN_API_KEY || '').trim();
    if (!key.includes(':')) throw httpError(500, 'GHOST_ADMIN_API_KEY is not set');
    const [id, secret] = key.split(':');
    const base = String(env.GHOST_API_URL || env.SITE_URL).replace(/\/$/, '') + '/ghost/api/admin';
    // Inside docker we talk to Ghost over plain http; tell it the visitor-facing protocol, or an https
    // site answers with a redirect.
    const https = String(env.SITE_URL || '').startsWith('https:');

    return async (method, path, body) => {
        const headers = { Authorization: `Ghost ${token(id, secret)}`, 'Accept-Version': 'v6.0' };
        if (https) headers['X-Forwarded-Proto'] = 'https';
        if (body) headers['Content-Type'] = 'application/json';
        const res = await fetch(base + path, { method, headers, body: body && JSON.stringify(body), redirect: 'manual' });
        const text = await res.text();
        let data = {};
        try { data = text ? JSON.parse(text) : {}; } catch { /* not JSON */ }
        if (!res.ok) throw new Error(`Ghost ${method} ${path.split('?')[0]} → ${res.status}: ${data.errors?.[0]?.message || text.slice(0, 200)} ${data.errors?.[0]?.context || ''}`);
        return data;
    };
}

// Admin API key → short-lived JWT (https://ghost.org/docs/admin-api/#token-authentication)
function token(id, secret) {
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const unsigned = `${b64({ alg: 'HS256', typ: 'JWT', kid: id })}.${b64({ iat: now, exp: now + 300, aud: '/admin/' })}`;
    return `${unsigned}.${createHmac('sha256', Buffer.from(secret, 'hex')).update(unsigned).digest('base64url')}`;
}

function httpError(status, message) {
    const e = new Error(message);
    e.status = status;
    return e;
}
