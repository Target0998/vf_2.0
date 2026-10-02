// Platform-independent core: builds a Stripe Checkout Session for a donation.
// Used by server.js (Docker/Node) – the same function can be dropped into a
// Cloudflare Worker / Netlify / Vercel function unchanged (it only needs fetch).

export const MIN_AMOUNT = 500;       // Ft
export const MAX_AMOUNT = 5_000_000; // Ft – sanity cap

/**
 * @param {object} input  { amount: number (Ft), frequency: 'once'|'monthly', email?, name? }
 * @param {object} env    { STRIPE_SECRET_KEY, SITE_URL }
 * @returns {Promise<{url: string}>}
 */
export async function createCheckout(input, env) {
    const amount = Math.round(Number(input.amount));
    const monthly = input.frequency === 'monthly';
    const site = String(env.SITE_URL || '').replace(/\/$/, '');

    if (!Number.isFinite(amount) || amount < MIN_AMOUNT || amount > MAX_AMOUNT) {
        throw httpError(400, `Az összeg ${MIN_AMOUNT} és ${MAX_AMOUNT} Ft között lehet.`);
    }
    if (input.frequency !== 'monthly' && input.frequency !== 'once') {
        throw httpError(400, 'Ismeretlen gyakoriság.');
    }
    const email = typeof input.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email) ? input.email : undefined;

    const thanks = `${site}/koszonjuk/?a=${amount}&f=${monthly ? 'monthly' : 'once'}`;

    // Mock mode: no Stripe key → skip payment so the whole flow can be tested locally.
    if (!env.STRIPE_SECRET_KEY) {
        return { url: `${thanks}&mock=1` };
    }

    const label = monthly ? 'Havi támogatás – Világítani Fogok Egyesület' : 'Adomány – Világítani Fogok Egyesület';

    const params = {
        mode: monthly ? 'subscription' : 'payment',
        locale: 'hu',
        success_url: `${thanks}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${site}/tamogatas/`,
        'line_items[0][quantity]': 1,
        'line_items[0][price_data][currency]': 'huf',
        // Stripe expects HUF in two-decimal units (×100) and the value must be divisible by 100.
        'line_items[0][price_data][unit_amount]': amount * 100,
        'line_items[0][price_data][product_data][name]': label,
        'metadata[source]': 'vf-ghost-donate-box',
        'metadata[frequency]': monthly ? 'monthly' : 'once',
        'metadata[name]': input.name ? String(input.name).slice(0, 200) : ''
    };
    if (monthly) {
        params['line_items[0][price_data][recurring][interval]'] = 'month';
        params['subscription_data[metadata][source]'] = 'vf-ghost-donate-box';
    } else {
        params.submit_type = 'donate';
        params['payment_intent_data[metadata][source]'] = 'vf-ghost-donate-box';
        params.customer_creation = 'always';
    }
    if (email) params.customer_email = email;

    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))
    });
    const data = await res.json();
    if (!res.ok) {
        console.error('Stripe error', data.error);
        throw httpError(502, data.error?.message || 'Stripe hiba');
    }
    return { url: data.url };
}

function httpError(status, message) {
    const e = new Error(message);
    e.status = status;
    return e;
}
