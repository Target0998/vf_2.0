# Világítani Fogok – project context

How the site is built, how it works, and how to test it. For the to-do list see [TRACKER.md](TRACKER.md).

## What this is

A new website for the **Világítani Fogok Egyesület** (Kerecsend), replacing the old Mobirise static site. It has two goals:

1. **Fundraising**, mainly **monthly recurring donations**, through Stripe.
2. **Showing the work** through the **Napló**, a blog run on Ghost posts.

It's built on **Ghost 6** with a custom theme. Editors change content in Ghost Admin. Developers change the theme in this repo.

## Architecture

```
                      ┌──────────────────────── Hetzner server (docker compose) ────────────────────────┐
 browser ──HTTPS──▶   │  Caddy :80/:443 ──/api/donate/*──▶ donate-api :8787 ──▶ Stripe API (Checkout)   │
                      │        │                                                                         │
                      │        └──── everything else ──▶ Ghost :2368 ──▶ MySQL 8 (volume "db")           │
                      │                                    │   theme/  (bind-mounted from the repo)      │
                      │                                    │   content (volume "ghost": images, files)   │
                      │                                    └──▶ Mailgun SMTP (login links, sign-ups)     │
                      └──────────────────────────────────────────────────────────────────────────────────┘
 Stripe Checkout (hosted by Stripe) ──success──▶ /koszonjuk/?a=…&f=…   ·  cancel ──▶ /tamogatas/
 Newsletters: Ghost ──▶ Mailgun API (key set in Ghost Admin, not in .env)
```

| Piece | What it does | Where |
|---|---|---|
| **Ghost** | CMS: pages, posts, members, newsletters, admin UI | `ghost:6-alpine` image |
| **Theme** | All HTML, CSS and JS of the public site | `theme/` |
| **donate-api** | Small Node service, no dependencies. Turns {amount, frequency} into a Stripe Checkout Session URL; `GET /campaign/<slug>` sums a campaign's card donations from Stripe (cached 1 min) | `donate-api/` |
| **MySQL** | Ghost's database: content, settings, members, staff accounts | Docker volume `db` |
| **Caddy** | HTTPS (automatic Let's Encrypt) and reverse proxy. Staging/prod only | `Caddyfile` |
| **traffic-analytics** | Ghost's analytics proxy: page views → Tinybird Cloud (EU), IP removed. Staging/prod, profile `analytics` | `docker-compose.prod.yml`, `tinybird/` |
| **Mailpit** | Catches all email locally so nothing is really sent. Local only | http://localhost:8025 |

**Not in git, so it doesn't move between machines:** the database (content, admin passwords, settings and theme settings), uploaded images, and `.env`. Local and staging are **separate sites with separate content**. To copy content between them, use Ghost Admin → Settings → Labs → Export/Import. Images have to be copied separately.

## Repo map

```
theme/                    the Ghost theme "vilagitani-fogok"
  default.hbs             page shell: <head>, notice bar, footer, JS
  home.hbs                front page (design 3a)
  naplo.hbs               /naplo/ list (3b); tag.hbs = /tag/<slug>/; post.hbs = single post
  page-tamogatas.hbs      /tamogatas/ (3c)    page-rolunk.hbs  /rolunk/ (3d)
  page-koszonjuk.hbs      /koszonjuk/ – Stripe success page
  page.hbs                every other page (Galéria, Kapcsolat, …) – generic, not designed
  partials/               header, footer, donate-box, post cards, help tiles, …
  assets/css/screen.css   ALL styles: tokens → components → pages → responsive (@media at the bottom)
  assets/js/main.js       nav toggle, donate box logic, newsletter signup, thank-you text
  assets/images/          logos (vf/), photos (webp 800/1600 + jpg), partner logos
  package.json            theme metadata + **custom theme settings** (what editors see in Design → Theme settings)
ghost/routes.yaml         URL structure: / uses home.hbs, posts live under /naplo/
donate-api/               server.js (HTTP wrapper) + checkout.js (Stripe logic, portable)
scripts/seed.mjs          sets up a fresh Ghost: owner, theme, nav, tags, pages, content blocks, sample posts
scripts/content.mjs       launch content for a live Ghost via Admin API key (see README → Deploy)
content/                  files content.mjs uploads into Ghost: dokumentumok/ (Átláthatóság PDFs), galeria/, Közlemény image
Adatvédelmi.md            privacy policy source; content.mjs renders it as /adatvedelem/ (edit here, not in Ghost)
scripts/e2e.mjs           browser test: donate box + newsletter signup
scripts/screenshots.mjs   full-page desktop (1440) + mobile (390) screenshots → screenshots/
docker-compose.yml        local stack           docker-compose.prod.yml  staging/prod override
Caddyfile                 HTTPS + routing for staging/prod, www → bare domain, redirects from old Mobirise URLs, /.ghost/analytics
tinybird/                 helper image for the one-time Tinybird setup (from TryGhost/ghost-docker, MIT)
design_handoff_ghost_theme/  original design handoff (see "Design workflow")
docs/                     this file + TRACKER.md
```

## Pages and where their content lives

| URL | Template | Content edited in |
|---|---|---|
| `/` | `home.hbs` | Theme settings (hero title/image, donate box, amounts), General → Description (lead), plus `#blokk` pages (numbers, Jövőkép, programs, monthly band, partners). Napló block = latest 4 posts |
| `/naplo/`, `/naplo/<slug>/` | `naplo.hbs`, `post.hbs` | Posts. Primary tag = coloured label. One **featured** post becomes the big card |
| `/tag/<slug>/` | `tag.hbs` | Tags (Tábor, Mindennapok, Hétvégi program, Családmentorálás, Közlemény) |
| `/tamogatas/` | `page-tamogatas.hbs` | Page `tamogatas` + FAQ pages tagged `#gyik` + theme settings |
| `/rolunk/` | `page-rolunk.hbs` | Page `rolunk` + `#idovonal`, `#ertek`, `rolunk-kuldetes` block pages |
| `/koszonjuk/` | `page-koszonjuk.hbs` | Page `koszonjuk` (excerpt = fallback text) |
| `/futas/` | `page-futas.hbs` | Futás campaign (design `design/2026-10-futas-kampany/`). Page `futas`: title (`*…*` highlighted), excerpt = subtitle, content = story (first paragraph large, `##` = highlighted sentence), feature image = photo + share image. **Raised amount = title of the hidden page `futas-gyujtes` (by hand: bank transfers and other confirmed non-card amounts) + card donations live from Stripe** (`donate-api` `GET /campaign/futas`, refreshed every minute). Donations are tagged `campaign=futas` in Stripe; cancel returns to `/futas/` |
| `/tevekenysegunk/`, `/galeria/`, `/kapcsolat/`, `/atlathatosag/`, `/adatvedelem/`, `/top-plusz/` | `page.hbs` | The page itself (filled by `scripts/content.mjs` from the old site; not designed yet). All content and PDFs are hosted by Ghost (uploaded by the script). New documents: add a Ghost file card or a row in the table. `/adatvedelem/` is generated from `Adatvédelmi.md` |
| `/en/` | – | **Doesn't exist yet**; the HU/EN switch is hidden |

**How templates are chosen:** a page with slug `xyz` uses `page-xyz.hbs` if that file exists, otherwise `page.hbs`. A new designed page usually means a new `page-<slug>.hbs`.

**Content blocks:** structured sections (numbers, values, FAQ, …) are hidden Ghost pages tagged `#blokk` plus a second tag. The theme reads them in publish-date order. The full table is in the README under "Editing content".

**Menus:** Settings → Navigation. Primary = header menu, secondary = footer "Oldalak" column.

## How the main flows work

### Donation
1. In the donate box (`partials/donate-box.hbs` + `main.js`) the visitor picks Egyszeri/Havi and an amount. The impact text and button label update as they choose.
2. On submit, JS POSTs `{amount, frequency, name?, email?, campaign?, return_path?}` to the **donate_api_url** theme setting (staging: `https://staging.vilagitanifogok.hu/api/donate/checkout`).
3. `checkout.js` checks the amount (500 – 5 000 000 Ft) and creates a Stripe Checkout Session. One-off uses `mode: payment`; monthly uses `mode: subscription` with interval month. It returns the session URL.
4. The browser goes to Stripe's hosted checkout. On success Stripe sends it back to `/koszonjuk/?a=<amount>&f=<once|monthly>&session_id=…`, and `main.js` writes the thank-you text from those parameters.
5. With no `STRIPE_SECRET_KEY`, **mock mode** skips Stripe and goes straight to `/koszonjuk/…&mock=1`.

Donations are recorded **only in Stripe**. There are no webhooks yet, so the site itself doesn't know who donated. The campaign counter reads totals from Stripe's Search API instead (`donate-api/campaign.js`); search results can lag about a minute behind a payment.

### Newsletter / members
- Ticking "Feliratkozom" on /tamogatas/ signs the visitor up as a free Ghost member. Ghost emails a magic link through Mailgun SMTP. The signup can't block the payment.
- Newsletters are sent from Ghost Admin and go out through the Mailgun **API**.

### Staff login
- `/ghost/`. In production, logging in from a new device needs an email code (`staffDeviceVerification`), so Mailgun must be working.

### Web analytics (Tinybird)
Ghost 6's built-in, cookieless statistics (Admin → Analytics). Page views go from the browser to `/.ghost/analytics/` on our own domain → **traffic-analytics** (container on our server: drops the IP, adds a daily-salted session id) → **Tinybird Cloud, EU (Frankfurt)**, where Ghost reads the stats from. Self-hosting Tinybird isn't an option: its self-managed version is beta, "not for production", and needs 4 vCPU / 16 GB RAM.

What reaches Tinybird per page view: page URL, referrer, utm parameters, browser user agent / device type, language, country, the salted session id and, **for logged-in newsletter subscribers, their Ghost member id and status**. No IP address, no cookies. Covered in `Adatvédelmi.md`.

One-time setup on the server (needs a free account at tinybird.co; pick **Europe (Frankfurt)**):
```sh
C="docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile analytics"
$C build tinybird-login
$C run --rm tinybird-login              # prints a code + URL: open it, log in, choose the workspace
$C run --rm tinybird-sync               # "Tinybird files synced into shared volume."
$C run --rm tinybird-deploy             # wait for "Deployment #1 is live!"
$C run --rm tinybird-login get-tokens   # prints 4 lines → paste them into .env
# in .env also: COMPOSE_PROFILES=analytics
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
docker compose -f docker-compose.yml -f docker-compose.prod.yml restart ghost caddy
```
Then Ghost Admin → Settings → Analytics → turn on **Web analytics**, open the home page in a private window, and check that a visit appears on the Analytics page within a minute or two. After a Ghost upgrade that changes the analytics schema, re-run `tinybird-sync` and `tinybird-deploy`.

## Environments

| | Local | Production (branch `prod`) |
|---|---|---|
| URL | http://localhost:2368 | https://vilagitanifogok.hu |
| Admin | http://localhost:2368/ghost/ | https://vilagitanifogok.hu/ghost/ |
| Start | `npm run up` (+ `npm run seed` on a fresh DB) | `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d` |
| Ghost mode | development: theme edits show on reload | production: templates cached, **restart Ghost after theme changes** |
| Email | Mailpit at :8025, nothing really sent | Mailgun, real emails |
| Analytics | – | Tinybird Cloud (EU), profile `analytics` |
| Stripe | mock, or `sk_test_…` in `.env` | **live** key in `.env` |

**Branches:** `staging` = work in progress (a new staging environment is coming, on another server); `prod` = what runs on vilagitanifogok.hu. Release = merge/push `staging` → `prod`, then on the server:

**Deploying a change (server runs `prod`):**
```sh
# locally: commit + push
# on the server:
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d          # picks up compose/.env changes
docker compose -f docker-compose.yml -f docker-compose.prod.yml restart ghost  # picks up theme / routes.yaml changes
```
Changes to `theme/package.json` (theme settings) or `ghost/routes.yaml` always need a Ghost restart, even locally.

## How to test

### Automated (local)
- `npm run theme:test`: gscan, Ghost's theme validator. Run it before deploying theme changes.
- `npm run e2e`: browser test of the donate box and newsletter signup.
- `npm run screenshots`: full-page desktop and mobile PNGs of every main page in `screenshots/`. It also warns about horizontal overflow on mobile.

### Manual checklist (staging)
**Donations** (Stripe sandbox: any future expiry date, any CVC):
- [ ] One-off 5 000 Ft with `4242 4242 4242 4242` → /koszonjuk/ says the right amount → shows up in Stripe Dashboard → Payments
- [ ] Monthly 10 000 Ft → Stripe Dashboard → Subscriptions shows an active monthly subscription
- [ ] Custom amount ("Egyéb"): 499 Ft is rejected, 1 234 Ft works
- [ ] 3D Secure card `4000 0027 6000 3184` → authentication popup → success
- [ ] Declined card `4000 0000 0000 0002` → error shown on Stripe's page, nothing charged
- [ ] Cancel on Stripe's page → back to /tamogatas/
- [ ] Receipt email: Stripe doesn't send receipts automatically in sandbox. Preview it from the payment in the Dashboard ("Send receipt") and check the wording
- [ ] Monthly cancellation through the Customer Portal link (once the portal is set up)

**Email:**
- [ ] /tamogatas/ with "Feliratkozom" ticked → magic-link email arrives → member listed in Ghost Admin → Members
- [ ] Staff login from a new browser → verification code email arrives
- [ ] Test newsletter from Ghost Admin arrives and isn't in spam

**Pages and layout:** every menu and footer link opens; check each page at phone width (Chrome DevTools → device toolbar, e.g. iPhone 12/SE) and on a real phone.

## Design workflow

- The original design came from a **Claude Design** handoff in `design_handoff_ghost_theme/`. The theme already contains everything it needs from it (tokens are copied into `screen.css`, photos and logos into `theme/assets/images/`). Deleting the folder doesn't break anything, and git history keeps it (`git show 2c32102:design_handoff_ghost_theme/README.md`).
- For new or refined designs, export the Claude Design handoff into `design/<yyyy-mm>-<topic>/` (e.g. `design/2026-10-galeria-kapcsolat/`). Each batch should say which screens are final, as the first handoff's README did. Link the batch from the tracker item it belongs to.
- The design tokens (colours, type, spacing, radii) are at the top of `theme/assets/css/screen.css`. If a new design changes a token, change it there once instead of per page.
- The handoff only covered desktop (1440px). Mobile layouts are worked out in the `@media` blocks at the bottom of `screen.css`. If Claude Design can produce mobile frames, include them.

## Gotchas
- **Admin passwords, settings and content live in the database**, not in files. Nothing to commit for them.
- `routes.yaml` is bind-mounted in Docker. On a Ghost install without Docker it has to be uploaded under Settings → Labs → Routes.
- The seed script is idempotent and skips anything that exists by slug. It's meant for fresh local setups; check what it creates before running it against staging.
- Docker publishes ports even past `ufw`. That's why the prod override publishes nothing except Caddy's 80/443.
