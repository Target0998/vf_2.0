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
| **donate-api** | Small Node service, no dependencies. Turns {amount, frequency} into a Stripe Checkout Session URL; `GET /campaign/<slug>` sums a campaign's card donations from Stripe (cached 1 min); `POST /webhook` saves each donor as a Ghost member (`donors.js`) | `donate-api/` |
| **MySQL** | Ghost's database: content, settings, members, staff accounts | Docker volume `db` |
| **Caddy** | HTTPS (automatic Let's Encrypt) and reverse proxy. Staging/prod only | `Caddyfile` |
| **traffic-analytics** | Ghost's analytics proxy: page views → Tinybird Cloud (EU), IP removed. Staging/prod, profile `analytics` | `docker-compose.prod.yml`, `tinybird/` |
| **Mailpit** | Catches all email locally so nothing is really sent. Local only | http://localhost:8025 |

**Not in git, so it doesn't move between machines:** the database (content, admin passwords, settings and theme settings), uploaded images, and `.env`. Local, staging and prod are **separate sites with separate content**. How content moves between them: "Environments" → "Content".

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
donate-api/               server.js (HTTP wrapper) + checkout.js (Stripe logic, portable) + donors.js (webhook → Ghost member) + backfill.js
scripts/seed.mjs          sets up a fresh Ghost: owner, theme, nav, tags, pages, content blocks, sample posts
scripts/content.mjs       launch content for a live Ghost via Admin API key (see README → Deploy)
content/                  files content.mjs uploads into Ghost: dokumentumok/ (Átláthatóság PDFs), galeria/, Közlemény image
Adatvédelmi.md            privacy policy source; content.mjs renders it as /adatvedelem/ (edit here, not in Ghost)
scripts/e2e.mjs           browser test: donate box + newsletter signup
scripts/webhook-test.mjs  signed fake Stripe events → checks the donor's Ghost member
scripts/screenshots.mjs   full-page desktop (1440) + mobile (390) screenshots → screenshots/
scripts/backup.sh         database + uploads backup;  scripts/restore-staging.sh  copy of production → staging, without members
scripts/release.sh        code: main → staging → prod (fast-forward);  scripts/promote.mjs  content: pages/posts/settings + their images one stage up
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
| `/futas/` | `page-futas.hbs` | Futás campaign (design `design/2026-10-futas-kampany/`). Page `futas`: title (`*…*` highlighted), excerpt = subtitle, content = story (first paragraph large, `##` = highlighted sentence), feature image = photo + share image. **Raised amount = title of the hidden page `futas-gyujtes` (by hand: bank transfers and other confirmed non-card amounts) + card donations live from Stripe** (`donate-api` `GET /campaign/futas`, refreshed every minute). Donations are tagged `campaign=futas` in Stripe; cancel returns to `/futas/`. **Live map** (`#elo`): see "Live run map" below |
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

Money is recorded **only in Stripe**. The campaign counter reads totals from Stripe's Search API (`donate-api/campaign.js`); search results can lag about a minute behind a payment.

### Donor records (Stripe webhook → Ghost Members)
Stripe keeps the money, **Ghost Members keeps the people**. After a paid checkout Stripe calls `POST /api/donate/webhook`. `donate-api/donors.js` checks the signature and creates or updates the donor as a Ghost member (no email is sent):
- **Labels:** `Támogató`, `Egyszeri támogató` / `Havi támogató`, `Kampány: <slug>` (e.g. `Kampány: futas`), `Beszámolót kér`. Labels and newsletters are only ever added, never removed.
- **Note:** one line per donation: date · amount · once/monthly · campaign · Checkout Session id. The id makes Stripe's retries harmless.
- **Newsletters only with consent.** Stripe's checkout page asks "Elküldjük, mire fordítottuk az adományod?" (optional dropdown, `custom_fields` in `checkout.js`). "Igen" → newsletter **Beszámoló támogatóknak** (slug `beszamolo-tamogatoknak`, not subscribed on normal sign-up). Ticking "Feliratkozom" in the donate box → the Napló newsletter too. Anyone else gets labels only and can't be emailed.
- **End of a campaign:** write a post → Publish → newsletter *Beszámoló támogatóknak* → recipients: label `Kampány: <slug>`.
- **Past donations:** `docker compose exec donate-api node backfill.js [--campaign=futas] [--since=2026-09-01]` is a dry run; add `--apply` to write. Old sessions have no consent answer, so it adds labels and notes only. Bank transfers aren't in Stripe: import them as a CSV in Ghost Admin → Members, with labels.
- **Ghost's "unsubscribed" filter** also lists donors without a newsletter. Exclude the `Támogató` label when cleaning up members (VF-065).
- Monthly renewals and cancellations aren't tracked in Ghost (Stripe has them).

Setup per environment (once):
1. Ghost Admin → Settings → Newsletters → **Add newsletter** "Beszámoló támogatóknak", slug `beszamolo-tamogatoknak`, "Subscribe new members on sign-up" **off**. (Locally `npm run seed` does steps 1–2.)
2. Ghost Admin → Settings → Integrations → **Add custom integration** "Donate API" → copy the Admin API key into `.env` as `GHOST_ADMIN_API_KEY`.
3. Stripe Dashboard (test mode on staging, live on prod) → Developers → Webhooks → **Add endpoint** `https://<domain>/api/donate/webhook`, events `checkout.session.completed` and `checkout.session.async_payment_succeeded` → copy the signing secret into `.env` as `STRIPE_WEBHOOK_SECRET`.
4. `docker compose … up -d donate-api`. The log line says `webhook: on`. Make a test donation; `docker compose logs donate-api` shows `[webhook] donor created`.

### Newsletter / members
- Ticking "Feliratkozom" on /tamogatas/ signs the visitor up as a free Ghost member. Ghost emails a magic link through Mailgun SMTP. The signup can't block the payment.
- Newsletters are sent from Ghost Admin and go out through the Mailgun **API**.

### Live run map (Futás relay)
The relay's "baton" is a phone running **Traccar Client** (free, iOS/Android). It sends its position every 30 s to `POST /api/donate/track/futas` → `donate-api/track.js`, which matches it to the planned route (`donate-api/routes/futas.gpx`) to get the km done and saves the positions to the `track` volume. The `#elo` section on `/futas/` polls `GET /api/donate/track/futas` every 30 s and draws the route, the part already run and the phone's last position (Leaflet from `theme/assets/vendor/`, OpenStreetMap tiles, loaded only when the visitor scrolls to the map). The section stays hidden if the API doesn't answer; during the run a "Élőben: x km" chip appears in the hero.

- **Public view:** ignores positions before `TRACK_START` (default 2026-10-16 00:00, so test runs don't show) and lags `TRACK_DELAY_MIN` (default 5) minutes behind. Status: `before` → `live` → `paused` (no fix for 10 min: handover, no signal) → `finished` (within 300 m of the end).
- **Organisers' view:** `https://vilagitanifogok.hu/api/donate/track/futas?token=<TRACK_TOKEN>`: all positions, no delay, phone battery, last raw fix. Use it to check the phone works before and during the run.
- **GPX export:** `https://vilagitanifogok.hu/api/donate/track/futas.gpx?token=<TRACK_TOKEN>` downloads the whole run (times, elevation) from `TRACK_START`, one segment per stretch without a 10-minute gap; add `&all=1` for the test positions too. Every position is saved as it arrives (`futas.jsonl` in the `track` volume), so the export can be taken any time, also during the run. Take it before the raw positions are deleted (see `Adatvédelmi.md`).
- **Progress** only moves forward, and only for fixes within 250 m of the route that are reachable at ≤ 43 km/h from the last progress (or right on the route, ≤ 100 m, after a long gap). A detour or a ride in the support car doesn't count, and the dot still shows where the phone is.

**Setting up the phone (once):**
1. `.env` on the server: `TRACK_TOKEN=` a long random string (`openssl rand -hex 16`), then `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d donate-api`.
2. Install **Traccar Client**. Settings: *Device identifier* = the `TRACK_TOKEN`; *Server URL* = `https://vilagitanifogok.hu/api/donate/track/futas`; *Location accuracy* = high; *Frequency* = 30 s; *Distance* = 0; *Offline buffering* = on. Turn on tracking.
3. Allow location access **always** (iOS: "Always"; Android: "Allow all the time", and switch battery optimisation off for the app).
4. Walk around for a few minutes, then open the organisers' view: `points` should grow and `last_fix` should be you.

**On the day:** full battery plus a power bank in the runners' belt, swapped at the longer breaks. Check the organisers' view now and then. Point the notice bar to `/futas/#elo`. Tracking can stay on during handovers: positions off the route don't move the km.

**Changing the route:** replace `donate-api/routes/futas.gpx` (a GPX with a track, e.g. exported from BRouter), commit, deploy, restart donate-api. Saved positions are re-matched to the new route on start.

**Test locally:** `TRACK_TOKEN=test TRACK_START= TRACK_DELAY_MIN=0 docker compose up -d donate-api`, then send a fix: `curl -X POST "localhost:8787/track/futas?id=test&lat=47.5005&lon=19.0825"`. Clear local positions: `docker compose exec donate-api rm /data/futas.jsonl` and restart donate-api.

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

Three stages. **Code** moves up through git branches, **content** mostly moves down from prod.

| | Local (branch `main`) | Staging (branch `staging`) | Production (branch `prod`) |
|---|---|---|---|
| Purpose | development: experiments, breaking changes | review by the team before going live | the live site |
| URL | http://localhost:2368 | https://staging.vilagitanifogok.hu | https://vilagitanifogok.hu |
| Runs on | your laptop | lepusprime (Benedek's server): checkout in `/srv/vf-staging/repo`, Caddy vhost in nixos-dotfiles | Hetzner server |
| Start / deploy | `npm run up` (+ `npm run seed` on a fresh DB) | by hand: `git pull && docker compose up -d` | `git pull` + compose, see below |
| Ghost mode | development: theme edits show on reload | development | production: templates cached, **restart Ghost after theme changes** |
| Email | Mailpit at :8025, nothing really sent | Mailgun SMTP (own SMTP user), real emails | Mailgun, real emails |
| Analytics | – | – | Tinybird Cloud (EU), profile `analytics` |
| Stripe | mock, or `sk_test_…` in `.env` | `sk_test_…` (sandbox) | **live** key |
| Content | seed, or a copy of prod | copy of prod without members | **source of truth**: the association edits here |

### Code: `main` → `staging` → `prod`
Every commit is made on `main`. Releasing is a fast-forward of the next branch, so `staging` and `prod` are always a point on `main`'s history and never have commits of their own:
```sh
scripts/release.sh staging   # main → staging, then deploy on lepusprime ↓, the team reviews it
scripts/release.sh prod      # staging → prod: then on the production server ↓
```
On lepusprime (staging) – never commit there, fixes go on `main` and come back with the next release:
```sh
cd /srv/vf-staging/repo && git pull && docker compose up -d   # docker-compose.override.yml (untracked) adds Mailgun + loopback ports
docker compose restart ghost                                  # after theme/package.json or ghost/routes.yaml changes
```
On the production server:
```sh
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d          # picks up compose/.env changes
docker compose -f docker-compose.yml -f docker-compose.prod.yml restart ghost  # picks up theme / routes.yaml changes
```
Changes to `theme/package.json` (theme settings) or `ghost/routes.yaml` always need a Ghost restart, even locally.

### Content: down by default, up on purpose
Ghost content (pages, posts, settings, theme settings, uploaded images) lives in each site's database and `content/` volume, not in git.
- **Down** (prod → staging → local): a full copy without members, see "Backups and copying production to staging" below. Do this before starting work that touches content, so you work on what's live.
- **Up** (local → staging → prod): only the items we changed on purpose, with `scripts/promote.mjs`. It copies pages/posts (text, tags, feature image, settings), theme settings and allowed site settings, plus every image/PDF/media file they use. It also rewrites links to the source site. It shows a dry run first, writes only with `--apply`, and skips an item that was edited on the target after the source (someone changed it there; `--force` overrides). `donate_api_url`, Stripe, Mailgun and member settings are never copied.
```sh
node scripts/promote.mjs staging prod page:tamogatas post:<slug> theme:hero_image setting:navigation          # dry run
node scripts/promote.mjs staging prod page:tamogatas post:<slug> theme:hero_image setting:navigation --apply
```
  Keys go in your local `.env`: `STAGING_ADMIN_API_KEY`, `PROD_ADMIN_API_KEY`. A custom integration's Admin API key (Settings → Integrations → "Promote") covers pages, posts and site settings. **Theme settings** (e.g. `hero_image`) need a **staff access token** instead (Ghost Admin → your profile → Staff access token; same format, acts as you). `local` logs in with the seed's owner account.
- **Photos:** originals (full-size camera files) are kept outside git, in the shared Drive. Locally they can sit in `UjKepek/` (git-ignored). Resize to at most 2400 px, upload into Ghost on local or staging, and promote the page/setting that uses them. The promote script carries the files along.

## Backups and copying production to staging
- `scripts/backup.sh` (on a server, in the repo folder): database dump (`utf8mb4`) + uploaded images, PDFs and media → `backups/vf-<date>-db.sql.gz` and `…-content.tar.gz`. Contains members' personal data: `backups/` is git-ignored, keep the files private.
- `scripts/restore-staging.sh <db.sql.gz> <content.tar.gz>` (on the **staging** server): replaces staging with that copy, then **deletes all members and their e-mail/payment history**, removes the Mailgun and Ghost-Stripe keys (staging can't send newsletters), points `donate_api_url` at staging and turns on **private site** (prints the password). Refuses to run if `.env` has the production `GHOST_URL`.

```sh
# production server
scripts/backup.sh
# laptop: copy the two files across
scp prod:vf_2.0/backups/vf-<date>-* staging:vf_2.0/backups/
# staging server
scripts/restore-staging.sh backups/vf-<date>-db.sql.gz backups/vf-<date>-content.tar.gz
```
On lepusprime the stack isn't the prod compose: run it with `DC="docker compose"` (the checkout's `.env` and `docker-compose.override.yml` do the rest). Staff logins are the same as on production afterwards. Run it again whenever staging should catch up with live content.

## How to test

### Automated (local)
- `npm run theme:test`: gscan, Ghost's theme validator. Run it before deploying theme changes.
- `npm run e2e`: browser test of the donate box and newsletter signup.
- `node scripts/webhook-test.mjs`: donor webhook → Ghost member, without Stripe (needs `STRIPE_WEBHOOK_SECRET`, any text locally, and `GHOST_ADMIN_API_KEY` in `.env`).
- `npm run screenshots`: full-page desktop and mobile PNGs of every main page in `screenshots/`. It also warns about horizontal overflow on mobile.

### Manual checklist (staging)
**Donations** (Stripe sandbox: any future expiry date, any CVC):
- [ ] One-off 5 000 Ft with `4242 4242 4242 4242` → /koszonjuk/ says the right amount → shows up in Stripe Dashboard → Payments
- [ ] Monthly 10 000 Ft → Stripe Dashboard → Subscriptions shows an active monthly subscription
- [ ] Custom amount ("Egyéb"): 499 Ft is rejected, 1 234 Ft works
- [ ] 3D Secure card `4000 0027 6000 3184` → authentication popup → success
- [ ] Declined card `4000 0000 0000 0002` → error shown on Stripe's page, nothing charged
- [ ] Cancel on Stripe's page → back to /tamogatas/
- [ ] Donation with "Elküldjük…" = Igen → Ghost Admin → Members: labels `Támogató`, `Kampány: …`, `Beszámolót kér`, newsletter Beszámoló támogatóknak; without answer → labels only, no newsletter
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
