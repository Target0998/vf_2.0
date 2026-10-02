# Világítani Fogok – Ghost theme

Custom Ghost 6 theme for the Világítani Fogok Egyesület, built from `design_handoff_ghost_theme/` (designs 3a–3d). Includes a local Docker stack and a small Stripe Checkout service for one-off and monthly donations.

```
theme/              Ghost theme "vilagitani-fogok" (Handlebars + plain CSS/JS, no build step)
donate-api/         Stripe Checkout service (Node, no deps) – checkout.js is portable to a Worker/function
ghost/routes.yaml   Napló collection at /naplo/, home template at /
scripts/seed.mjs    Owner account, theme activation, settings, nav, tags, pages, content blocks, sample posts
scripts/e2e.mjs     Browser test of the donate box + newsletter signup
docker-compose.yml  Ghost 6 + MySQL 8 + Mailpit + donate-api
```

## Run locally

Requires Docker (Docker Desktop or `colima start`) and Node 20+.

```sh
cp .env.example .env        # optional: add a Stripe sk_test_… key
npm run up                  # starts everything (first boot ≈ 1 min)
npm run seed                # idempotent – safe to re-run
```

| | |
|---|---|
| Site | http://localhost:2368 |
| Admin | http://localhost:2368/ghost/ (login is in `.env`: `GHOST_ADMIN_EMAIL` / `GHOST_ADMIN_PASSWORD`) |
| Mailpit (catches all Ghost e-mail) | http://localhost:8025 |
| Donate API | http://localhost:8787/health |

The theme folder is bind-mounted and Ghost runs with `NODE_ENV=development`, so edits to `.hbs`, CSS and JS show up on reload. **Exception:** after changing `theme/package.json` (custom settings), restart Ghost with `docker compose restart ghost`.

Other commands: `npm run logs`, `npm run down`, `npm run reset` (wipes the DB), `npm run theme:test` (gscan), `npm run theme:zip` (→ `dist/vilagitani-fogok.zip` for upload), `npm run e2e`, `npm run screenshots` (full-page desktop and mobile PNGs → `screenshots/`).

## Donations / Stripe

The donate box (`partials/donate-box.hbs` + `assets/js/main.js`) POSTs `{amount, frequency, name?, email?}` to the URL in the **donate_api_url** theme setting. The service creates a Stripe Checkout Session: `mode: payment` for one-off, `mode: subscription` with `recurring.interval=month` for monthly. It uses `price_data` in HUF, so any custom amount works, and the minimum is 500 Ft. After payment Stripe redirects to `/koszonjuk/?a=…&f=…`.

- **Without `STRIPE_SECRET_KEY`** the API runs in mock mode and skips straight to the thank-you page.
- **With a test key** (`sk_test_…` in `.env`, then `docker compose up -d donate-api`) you get real Stripe Checkout with test cards.
- **Cancelling a monthly donation:** enable the Customer Portal and the "link to customer portal" option on receipt e-mails in the Stripe Dashboard. Nothing in the code needs to change.
- **Production:** deploy `donate-api/checkout.js` as a Cloudflare Worker (or Netlify/Vercel function) with `STRIPE_SECRET_KEY` and `SITE_URL`, then put its URL into the **donate_api_url** theme setting. Leave the setting empty to make the button just link to `/tamogatas/`.
- Still to agree with the client: Stripe account, receipt and tax-certificate wording.

If the newsletter box is ticked on /tamogatas/, the visitor is also signed up as a free Ghost member (magic-link e-mail) before the redirect.

## Editing content (for the client)

| What | Where in Ghost Admin |
|---|---|
| Hero title (`*stars*` make text yellow), hero photo, donate box title, amounts and impact texts, default frequency, notice bar, bank/tax/contact details | Settings → Design → Theme settings |
| Hero lead text | Settings → General → Description |
| Main menu / footer "Oldalak" | Settings → Navigation (primary / secondary) |
| Napló | Posts. Primary tag = coloured label (tag colour = label colour). One **featured** post becomes the large card. |
| Rólunk, Támogatás, Köszönjük, Galéria, Kapcsolat, Átláthatóság, Adatvédelem | Pages (slug decides the template: `rolunk`, `tamogatas`, `koszonjuk`, otherwise generic) |

**Content blocks.** Sections with repeating or structured content live in pages tagged with the internal tag `#blokk`, which are hidden from search engines. Edit them like any page. They appear in order of publish date.

| Section | Pages | Fields used |
|---|---|---|
| Home – numbers | tag `#szam` (4) | title = number, excerpt = label |
| Home – Jövőkép | slug `fooldal-jovokep` | title, excerpt (large text), content, feature image |
| Home – Tevékenységünk | tag `#program` (3) | title, excerpt, feature image |
| Home – monthly band | slug `fooldal-havi-tamogatas` | title, excerpt |
| Home – partners | tag `#partner` (optional) | title = alt text, feature image = logo. The bundled logos are used when none exist |
| Rólunk – timeline | tag `#idovonal` (4) | title, excerpt |
| Rólunk – Küldetés | slug `rolunk-kuldetes` | excerpt (statement), content |
| Rólunk – values | tag `#ertek` (6) | title, excerpt |
| Támogatás – FAQ | tag `#gyik` | title = question, content = answer |

Every section falls back to the design's placeholder text if its pages don't exist yet.

`routes.yaml` is not part of the theme upload. In production, upload `ghost/routes.yaml` under Settings → Labs → Routes. Locally it is bind-mounted.

## Not done yet (handoff steps 6–7 and open items)

- EN version: only the HU / EN switch is shown, and `/en/` doesn't exist yet.
- Content from the old site (Tevékenységünk, Átláthatóság, …) still needs migrating. The seeded pages contain `[Helyőrző]` markers.
- Value descriptions on Rólunk are still placeholders (the design has none yet).
- `logo-mark.svg` is not final according to the handoff and may be refined by the client's designer.
