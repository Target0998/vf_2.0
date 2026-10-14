// Past donations → Ghost members, the same way the webhook does it (donors.js).
// Reads paid Checkout Sessions from our donate box in Stripe. Old sessions have no consent answer,
// so nobody is subscribed to a newsletter: they only get labels and a note.
//
// Runs inside the donate-api container (it has the keys):
//   docker compose exec donate-api node backfill.js                      dry run: prints what would change
//   docker compose exec donate-api node backfill.js --apply              writes to Ghost
//   options: --campaign=futas   --since=2026-09-01
// (on a server add -f docker-compose.yml -f docker-compose.prod.yml)
import { donorFromSession, syncDonor } from './donors.js';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
}));
const apply = args.apply === true;
const env = {
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || '',
    SITE_URL: process.env.SITE_URL || 'http://localhost:2368',
    GHOST_ADMIN_API_KEY: process.env.GHOST_ADMIN_API_KEY || '',
    GHOST_API_URL: process.env.GHOST_API_URL || '',
    DONOR_REPORT_NEWSLETTER: process.env.DONOR_REPORT_NEWSLETTER || ''
};
if (!env.STRIPE_SECRET_KEY) fail('STRIPE_SECRET_KEY is not set (mock mode has no donations to read).');
if (!env.GHOST_ADMIN_API_KEY) fail('GHOST_ADMIN_API_KEY is not set.');

const since = args.since ? Math.floor(Date.parse(args.since) / 1000) : 0;
if (args.since && !since) fail(`Bad --since date: ${args.since}`);

console.log(`${apply ? 'APPLY' : 'DRY RUN'} · Stripe ${env.STRIPE_SECRET_KEY.startsWith('sk_live') ? 'LIVE' : 'test'}` +
    `${args.campaign ? ` · campaign ${args.campaign}` : ''}${since ? ` · since ${args.since}` : ''}`);

const counts = { created: 0, updated: 0, skipped: 0, failed: 0 };
for await (const session of sessions()) {
    const d = donorFromSession(session);
    if (!d || (args.campaign && d.campaign !== args.campaign)) continue;
    try {
        const result = await syncDonor(d, env, { dryRun: !apply });
        counts[result]++;
        console.log(`  ${result.padEnd(7)} ${d.date}  ${String(d.amount).padStart(7)} Ft  ${d.monthly ? 'havi    ' : 'egyszeri'}  ${(d.campaign || '-').padEnd(8)}  ${d.email}`);
    } catch (err) {
        counts.failed++;
        console.error(`  FAILED  ${d.session} ${d.email}: ${err.message}`);
    }
}
console.log(`\n${Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(' · ')}${apply ? '' : '\nNothing written. Run again with --apply.'}`);
if (counts.failed) process.exit(1);

async function* sessions() {
    let after;
    for (;;) {
        const params = new URLSearchParams({ status: 'complete', limit: '100' });
        if (since) params.set('created[gte]', String(since));
        if (after) params.set('starting_after', after);
        const res = await fetch(`https://api.stripe.com/v1/checkout/sessions?${params}`, { headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` } });
        const data = await res.json();
        if (!res.ok) fail(`Stripe: ${data.error?.message || res.status}`);
        yield* data.data;
        if (!data.has_more || !data.data.length) return;
        after = data.data[data.data.length - 1].id;
    }
}

function fail(msg) {
    console.error(`✗ ${msg}`);
    process.exit(1);
}
