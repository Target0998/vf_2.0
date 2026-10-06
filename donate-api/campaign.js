// Live total of a fundraising campaign, from Stripe (no webhooks, no database).
//   one-off:  succeeded PaymentIntents tagged metadata.campaign = <slug>, minus refunds
//   monthly:  every paid invoice of Subscriptions tagged metadata.campaign = <slug>
// Uses Stripe's Search API (results can lag ~1 minute behind a payment). The result is cached
// for CACHE_MS, so page views don't each hit Stripe. Bank transfers are not in Stripe: the site adds
// those by hand (theme: the "futas-gyujtes" page title).

const CACHE_MS = 60_000;
const cache = new Map();   // slug → { at, value, pending }
const mockTotals = new Map();

/** Mock mode (no STRIPE_SECRET_KEY): count mock donations in memory so the flow can be tested locally. */
export function recordMock(slug, amount) {
    if (isSlug(slug)) mockTotals.set(slug, (mockTotals.get(slug) || 0) + amount);
}

/**
 * @returns {Promise<{campaign: string, total: number, donations: number, updated: string, mock?: true}>}  total in Ft
 */
export async function campaignTotal(slug, env) {
    if (!isSlug(slug)) throw httpError(400, 'Ismeretlen kampány.');
    if (!env.STRIPE_SECRET_KEY) {
        return { campaign: slug, total: mockTotals.get(slug) || 0, donations: 0, updated: new Date().toISOString(), mock: true };
    }
    const hit = cache.get(slug);
    if (hit?.value && Date.now() - hit.at < CACHE_MS) return hit.value;
    if (hit?.pending) return hit.pending;

    const pending = compute(slug, env)
        .then((value) => { cache.set(slug, { at: Date.now(), value }); return value; })
        .catch((err) => {
            console.error('[campaign]', slug, err.message);
            if (hit?.value) { cache.set(slug, hit); return hit.value; } // Stripe hiccup → serve the last known total
            cache.delete(slug);
            throw httpError(502, 'A kampány összege most nem elérhető.');
        });
    cache.set(slug, { ...hit, pending });
    return pending;
}

async function compute(slug, env) {
    let total = 0;
    let donations = 0;

    // One-off donations. Subscription invoices create PaymentIntents too, but without this metadata,
    // so nothing is counted twice.
    for await (const pi of search('payment_intents', `metadata['campaign']:'${slug}' AND status:'succeeded'`, env, ['data.latest_charge'])) {
        const refunded = typeof pi.latest_charge === 'object' && pi.latest_charge ? pi.latest_charge.amount_refunded || 0 : 0;
        const net = (pi.amount_received - refunded) / 100; // HUF is sent ×100 (see checkout.js)
        if (net > 0) { total += net; donations++; }
    }

    // Monthly donations: everything paid so far on each tagged subscription.
    for await (const sub of search('subscriptions', `metadata['campaign']:'${slug}'`, env)) {
        let paid = 0;
        for await (const inv of list('invoices', { subscription: sub.id, status: 'paid' }, env)) paid += inv.amount_paid / 100;
        if (paid > 0) { total += paid; donations++; }
    }

    return { campaign: slug, total: Math.round(total), donations, updated: new Date().toISOString() };
}

async function* search(resource, query, env, expand = []) {
    let page;
    for (let i = 0; i < 50; i++) { // 50 × 100 results is far beyond any campaign here
        const params = new URLSearchParams({ query, limit: '100' });
        expand.forEach((e) => params.append('expand[]', e));
        if (page) params.set('page', page);
        const data = await stripe(`/v1/${resource}/search?${params}`, env);
        yield* data.data;
        if (!data.has_more) return;
        page = data.next_page;
    }
}

async function* list(resource, filters, env) {
    let after;
    for (let i = 0; i < 50; i++) {
        const params = new URLSearchParams({ ...filters, limit: '100' });
        if (after) params.set('starting_after', after);
        const data = await stripe(`/v1/${resource}?${params}`, env);
        yield* data.data;
        if (!data.has_more || !data.data.length) return;
        after = data.data[data.data.length - 1].id;
    }
}

async function stripe(path, env) {
    const res = await fetch('https://api.stripe.com' + path, { headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` } });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || `Stripe ${res.status}`);
    return data;
}

const isSlug = (s) => typeof s === 'string' && /^[a-z0-9-]{1,40}$/.test(s);

function httpError(status, message) {
    const e = new Error(message);
    e.status = status;
    return e;
}
