// End-to-end smoke test of the donate box (mock Stripe) + newsletter signup (Mailpit).
// Run via: npm run e2e   (uses the Playwright Docker image, see package.json)
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:2368';
const MAILPIT = process.env.MAILPIT || 'http://localhost:8025';
const email = `teszt+${Date.now()}@example.com`;
let failed = 0;
const t = async (loc) => (await loc.textContent()).replace(/\u00a0/g, ' ').trim();
const check = (ok, msg) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) failed++; };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

// Home: default state + interactions
await page.goto(BASE + '/');
const cta = page.locator('[data-donate] [data-cta]').first();
check((await t(cta)).includes('havi 5 000'), `home CTA default: "${await t(cta)}"`);
await page.locator('[data-donate] [data-freq="once"]').first().click();
await page.locator('[data-donate] .amount').nth(2).click();
check(await t(cta) === 'Támogatom 25 000 Ft-tal', `once + 25 000: "${await t(cta)}"`);
check(await page.locator('[data-donate] [data-monthly-only]').first().isHidden(), 'cancel note hidden for one-off');
await page.locator('[data-donate] .amount').nth(3).click();
check(await page.locator('[data-donate] .amount-input').first().isVisible(), '"Egyéb" shows amount input');
check(await page.locator('.hero .impact').isHidden(), 'impact note replaced by the amount field');
await page.locator('[data-custom-amount]').first().fill('7500');
check((await t(cta)).includes('7 500'), `custom CTA: "${await t(cta)}"`);

// Támogatás: monthly 10 000 with newsletter → thank-you page
await page.goto(BASE + '/tamogatas/');
await page.locator('[data-donate] .amount').nth(1).click();
await page.fill('#donate-name', 'Teszt Elek');
await page.fill('#donate-email', email);
await Promise.all([page.waitForURL(/\/koszonjuk\//), page.locator('[data-donate] [data-cta]').click()]);
check(page.url().includes('a=10000') && page.url().includes('f=monthly'), `redirected to ${page.url().replace(BASE, '')}`);
const thanks = await t(page.locator('[data-thanks-text]'));
check(thanks.startsWith('Havi 10 000'), `thank-you text: "${thanks}"`);

// Mailpit should have the signup magic link
await new Promise((r) => setTimeout(r, 1500));
const mails = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent('to:' + email)}`)).json();
check(mails.messages_count > 0, `newsletter signup e-mail delivered to Mailpit (${mails.messages_count})`);

check(errors.length === 0, `no JS errors${errors.length ? ': ' + errors.join('; ') : ''}`);
await browser.close();
process.exit(failed ? 1 : 0);
