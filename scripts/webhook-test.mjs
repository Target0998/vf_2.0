#!/usr/bin/env node
// Local test of the donor webhook without Stripe: sends signed fake "checkout.session.completed" events
// to donate-api, then checks the Ghost member it made. Needs in .env: STRIPE_WEBHOOK_SECRET (any text locally)
// and GHOST_ADMIN_API_KEY (npm run seed prints it). Deletes its test member afterwards.
//
//   node scripts/webhook-test.mjs
import { createHmac } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envFile = path.join(ROOT, '.env');
if (existsSync(envFile)) {
    for (const line of readFileSync(envFile, 'utf8').split('\n')) {
        const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
        if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
    }
}
const SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const KEY = process.env.GHOST_ADMIN_API_KEY || '';
const HOOK = process.env.WEBHOOK_URL || 'http://localhost:8787/webhook';
const GHOST = (process.env.GHOST_URL || 'http://localhost:2368').replace(/\/$/, '') + '/ghost/api/admin';
if (!SECRET || !KEY) { console.error('✗ set STRIPE_WEBHOOK_SECRET and GHOST_ADMIN_API_KEY in .env, then docker compose up -d donate-api'); process.exit(1); }

const email = `webhook-test-${Date.now()}@example.com`;
let n = 0;
const session = (over = {}) => ({
    id: `cs_test_local_${Date.now()}_${n++}`, object: 'checkout.session', created: Math.floor(Date.now() / 1000),
    mode: 'payment', payment_status: 'paid', amount_total: 500000,
    customer_details: { email, name: 'Kártya Név' },
    metadata: { source: 'vf-ghost-donate-box', frequency: 'once', name: 'Teszt Árvíztűrő', newsletter: '', campaign: 'futas' },
    custom_fields: [{ key: 'beszamolo', type: 'dropdown', dropdown: { value: 'nem' } }],
    ...over
});

async function send(obj, { secret = SECRET, type = 'checkout.session.completed' } = {}) {
    const raw = JSON.stringify({ id: 'evt_local', type, data: { object: obj } });
    const t = Math.floor(Date.now() / 1000);
    const sig = createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex');
    const res = await fetch(HOOK, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': `t=${t},v1=${sig}` }, body: raw });
    return { status: res.status, body: await res.json() };
}

function token() {
    const [id, secret] = KEY.trim().split(':');
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const unsigned = `${b64({ alg: 'HS256', typ: 'JWT', kid: id })}.${b64({ iat: now, exp: now + 300, aud: '/admin/' })}`;
    return `${unsigned}.${createHmac('sha256', Buffer.from(secret, 'hex')).update(unsigned).digest('base64url')}`;
}
async function ghost(method, p) {
    const res = await fetch(GHOST + p, { method, headers: { Authorization: `Ghost ${token()}`, 'Accept-Version': 'v6.0' } });
    return res.status === 204 ? {} : res.json();
}
const member = async () => (await ghost('GET', `/members/?filter=${encodeURIComponent(`email:'${email}'`)}&include=labels,newsletters`)).members[0];
const labels = (m) => m.labels.map((l) => l.name).sort();
const newsletters = (m) => m.newsletters.map((x) => x.name).sort(); // member's newsletters come without slug

const step = (s) => console.log(`  ✓ ${s}`);
try {
    // 1. bad signature → 400, nothing saved
    let r = await send(session(), { secret: 'wrong' });
    assert.equal(r.status, 400);
    assert.equal(await member(), undefined);
    step('bad signature rejected');

    // 2. other event types and unpaid / foreign sessions are ignored
    assert.ok((await send(session(), { type: 'payment_intent.created' })).body.ignored);
    assert.ok((await send(session({ payment_status: 'unpaid' }))).body.ignored);
    assert.ok((await send(session({ metadata: { source: 'ghost-members' } }))).body.ignored);
    assert.equal(await member(), undefined);
    step('other events, unpaid and non-donate-box sessions ignored');

    // 3. one-off, no consent → member with labels, no newsletters
    const first = session();
    r = await send(first);
    assert.deepEqual(r.body, { donor: 'created' });
    let m = await member();
    assert.equal(m.name, 'Teszt Árvíztűrő');
    assert.deepEqual(labels(m), ['Egyszeri támogató', 'Kampány: futas', 'Támogató']);
    assert.deepEqual(newsletters(m), []);
    assert.match(m.note, /5 000 Ft egyszeri · futas · cs_test_local_/);
    step('one-off donor created: labels, no newsletter, note');

    // 4. Stripe retry of the same event → skipped
    assert.deepEqual((await send(first)).body, { donor: 'skipped' });
    step('retry of the same session skipped');

    // 5. monthly, report "igen" + Napló box ticked → labels added, both newsletters, nothing removed
    r = await send(session({
        mode: 'subscription', amount_total: 1000000, metadata: { source: 'vf-ghost-donate-box', newsletter: '1' },
        custom_fields: [{ key: 'beszamolo', type: 'dropdown', dropdown: { value: 'igen' } }]
    }));
    assert.deepEqual(r.body, { donor: 'updated' });
    m = await member();
    assert.deepEqual(labels(m), ['Beszámolót kér', 'Egyszeri támogató', 'Havi támogató', 'Kampány: futas', 'Támogató']);
    assert.ok(newsletters(m).includes('Beszámoló támogatóknak'), 'report newsletter');
    assert.ok(newsletters(m).length >= 2, 'Napló newsletter');
    assert.equal(m.note.split('\n').length, 2);
    step(`second donation (monthly, consent): labels merged, newsletters ${newsletters(m).join(', ')}`);

    console.log('\nAll webhook tests passed ✓');
} catch (e) {
    console.error('\n✗', e.message);
    process.exitCode = 1;
} finally {
    const m = await member().catch(() => null);
    if (m) await ghost('DELETE', `/members/${m.id}/`);
}
