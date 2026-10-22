// Every card donation in Stripe as one flat, filterable list, for the organisers' page (admin.js).
// Stripe's Dashboard can't filter payments by metadata, so this does it here.
//   one row per succeeded PaymentIntent: one-off donations and every paid month of a subscription.
//   tags: campaign + source from the PaymentIntent's metadata (checkout.js), or for monthly payments from
//   their subscription's metadata (subscription invoices' PaymentIntents carry none).
// Uses the list APIs, not search, so a payment shows up at once. Cached for CACHE_MS.

const CACHE_MS = 60_000;
// Pinned, so the invoice → subscription / payment links below keep their shape whatever the account's default is.
const STRIPE_VERSION = '2025-03-31.basil';
let cache = { at: 0, value: null, pending: null };

/**
 * @param {{fresh?: boolean}} opts  fresh: skip the cache (still at most one Stripe round per 10 s)
 * @returns {Promise<{rows: object[], updated: string, mode: 'live'|'test'|'mock'}>}
 */
export async function listDonations(env, { fresh = false } = {}) {
    if (!env.STRIPE_SECRET_KEY) return { rows: [], updated: new Date().toISOString(), mode: 'mock' };
    const maxAge = fresh ? 10_000 : CACHE_MS;
    if (cache.value && Date.now() - cache.at < maxAge) return cache.value;
    if (cache.pending) return cache.pending;
    cache.pending = load(env)
        .then((value) => { cache = { at: Date.now(), value, pending: null }; return value; })
        .catch((err) => { cache.pending = null; throw err; });
    return cache.pending;
}

async function load(env) {
    // monthly: PaymentIntent → its subscription, via the paid invoices
    const subMeta = new Map();   // sub id → metadata
    for await (const sub of list('subscriptions', { status: 'all' }, env)) subMeta.set(sub.id, sub.metadata || {});
    const piSub = new Map();     // pi id → sub id
    for await (const inv of list('invoices', { status: 'paid', 'expand[]': 'data.payments' }, env)) {
        const sub = inv.parent?.subscription_details?.subscription;
        if (!sub) continue;
        for (const p of inv.payments?.data || []) if (p.payment?.payment_intent) piSub.set(p.payment.payment_intent, sub);
    }

    const rows = [];
    for await (const pi of list('payment_intents', { 'expand[]': 'data.latest_charge' }, env)) {
        if (pi.status !== 'succeeded') continue;
        const charge = typeof pi.latest_charge === 'object' && pi.latest_charge ? pi.latest_charge : {};
        const sub = piSub.get(pi.id);
        const meta = sub ? subMeta.get(sub) || {} : pi.metadata || {};
        const amount = pi.amount_received / 100;              // HUF is sent ×100 (see checkout.js)
        const refunded = (charge.amount_refunded || 0) / 100;
        rows.push({
            id: pi.id,
            date: new Date(pi.created * 1000).toISOString(),
            amount,
            refunded,
            net: amount - refunded,
            currency: pi.currency,
            frequency: sub ? 'monthly' : 'once',
            campaign: meta.campaign || '',
            source: meta.source || '',
            subscription: sub || '',
            name: charge.billing_details?.name || '',
            email: charge.billing_details?.email || pi.receipt_email || ''
        });
    }
    rows.sort((a, b) => (a.date < b.date ? 1 : -1)); // newest first
    return {
        rows,
        updated: new Date().toISOString(),
        mode: /^(sk|rk)_live_/.test(env.STRIPE_SECRET_KEY) ? 'live' : 'test'
    };
}

async function* list(resource, filters, env) {
    let after;
    for (let i = 0; i < 100; i++) { // 10 000 objects: far beyond this site's volume
        const params = new URLSearchParams({ ...filters, limit: '100' });
        if (after) params.set('starting_after', after);
        const data = await stripe(`/v1/${resource}?${params}`, env);
        yield* data.data;
        if (!data.has_more || !data.data.length) return;
        after = data.data[data.data.length - 1].id;
    }
}

async function stripe(path, env) {
    const res = await fetch('https://api.stripe.com' + path, {
        headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'Stripe-Version': STRIPE_VERSION }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || `Stripe ${res.status}`);
    return data;
}
