# Tracker – changes, missing pieces, bugs

Shared to-do list for the site. Project overview: [PROJECT.md](PROJECT.md).

**How to use it**
- New request or idea? Drop it in **Inbox** as one line, including who asked. We sort it later.
- Every sorted item gets an ID (`VF-###`, never reused) and a type: `bug` · `feature` · `page` · `design` · `content` · `infra`.
- Line format: `- [ ] VF-###  type · short title — who asked / source · notes or design link`
- When work starts, move the item to **In progress**. When it's on staging and checked, tick it and move it to **Done** with the date.
- Content tasks (texts, photos) are for the association to fill in Ghost Admin. They're tracked here so nothing gets forgotten.

---

## Inbox (unsorted)
<!-- One line per request: what, who asked, any link. -->
- (empty – sorted 2026-10-06)

## In progress
**Live since 2026-10-06** on https://vilagitanifogok.hu (former staging server and DB, live Stripe key). The server now runs the `prod` branch; a new staging environment will be set up elsewhere.

**Next round – sorted 2026-10-06** (B = Benedek's decision)
- [ ] VF-068  feature · Map on Kapcsolat (the old site linked Google Maps). Must work without cookies: static map image (no third-party request) or an OpenStreetMap embed — B
- [ ] VF-072  content · Photos: Judit's new set (`UjKepek/`, 27 files). Strong images in key places without a child's face in focus (e.g. home hero); volunteer-focused photos only where the topic is volunteering. Benedek picks the placements, then I resize and swap them in — Judit, B
- [ ] VF-033  content · Partner logos: list is incomplete. Add **Appy** now; Müller (just donated) and the Áldás utca people later. Current logos came from the old website; Judit uploads new ones to a shared Drive "PARTNEREINK" folder. Not blocking launch — Judit, B

**After launch**
- [ ] VF-078  infra · New **staging environment** on another server (the old staging server is now production). Branches: `staging` → staging env, `prod` → vilagitanifogok.hu, `main` = same as prod — Benedek
- [ ] VF-079  feature · Futás donate box defaults to **Havi** (monthly) · ✅ built + tested locally 2026-10-06 — Benedek
- [ ] VF-081  content · Tevékenységünk video → https://youtube.com/watch?v=fqbGNXKUvt8 (privacy-mode embed); live page via `content.mjs --only=video` (swaps only the video) · ✅ tested locally 2026-10-06 — Benedek
- [ ] VF-080  content · **Association sign-off on the privacy policy** (`Adatvédelmi.md`, live on /adatvedelem/). It's my draft, not legal advice; PDF export once approved — Marci
- [ ] VF-052  infra · Stripe: Settings → Payment methods: cards, Apple Pay, Google Pay on; anything that can't do recurring HUF off
- [ ] VF-054  infra · Stripe: public business details (Settings → Business → Public details: name, support email, statement descriptor e.g. `VILAGITANIFOGOK`)
- [ ] VF-015  feature · Stripe: Customer Portal (Settings → Billing → Customer portal): enable cancel subscription, set the link, then update the "Hogyan mondhatom le…" FAQ
- [ ] VF-077  infra · Tinybird follow-ups for the privacy policy: sign Tinybird's DPA, check EU–US Data Privacy Framework status, and make the promised 2-year retention true (TTL on the datasources or a yearly delete)
- [ ] VF-057  infra · Ghost Admin → Settings → Navigation: secondary (footer) menu, optional: add Kapcsolat, TOP Plusz

## Up next

### Missing pages
- [ ] VF-060  design · **Tevékenységünk**: needs a design. Planned: table overview of activities and their schedule, a description opens on click; based on last year's table that Kata updates (from next week). Open: show funding sources? (Judit: no, Kata: yes, for transparency). Each programme gets a short description — Judit, Kata, B
- [ ] VF-061  design · **Galéria**: needs a design. Decide on Ghost gallery cards in one page, or albums as posts with a tag
- [ ] VF-062  design · **Kapcsolat**: needs a design. Address, email, map? Contact form? (Ghost has no forms; options: mailto, Formspree, or an endpoint in donate-api)
- [ ] VF-073  page · **Önkéntesség**: own page (like bagazs.org/onkentesseg): programmes you can volunteer in, the community, application form. Until then the Rólunk tile "Csatlakoznál önkéntesként?" keeps pointing to Kapcsolat — Judit, B: future, when the material is ready
- [ ] VF-074  design · **Átláthatóság**: concept for how documents are presented on the site. Not urgent — Judit
- [ ] VF-075  content · Támogatás "Miért havi?" section: rewrite once there's a clear brief — Judit, B
- [ ] VF-006  page · **EN version**: the HU/EN switch links to `/en/`, which is a 404. Decide on full translation or a single English summary page; until then hide the switch (see VF-020)

### Design refinement
- [ ] VF-014  design · Copyright line sits in the "Adatok" footer column; move it to its own bottom row? — Marci
- [ ] VF-010  design · Collect the refinement notes from review here, one item per page or component
- [ ] VF-011  design · Final `logo-mark.svg` from the association's designer (the handoff marked it "not final")
- [ ] VF-012  design · Rólunk values (Értékeink): explanation texts are missing in the design and content
- [ ] VF-013  design · Post page (`post.hbs`) was never designed, only derived from the system. Review it

### Features / donations
- [ ] VF-016  feature · Stripe receipt and tax-certificate wording, agree with the association
- [ ] VF-017  feature · Stripe **webhooks**: decide whether we need donation records outside Stripe (thank-you email, adding donors as Ghost members, reports). Today Stripe is the only record
- [ ] VF-018  feature · `/koszonjuk/` shows the amount from the URL, so anyone can make a fake "thank you for 1 000 000 Ft" link. Low risk; could verify `session_id` with Stripe if it matters

### Bugs

### Content (association, in Ghost Admin)
- [ ] VF-035  content · Donation amounts and impact texts (5 000 / 10 000 / 25 000 Ft): **decided 2026-10-06, they stay** until someone has a more precise proposal (Theme settings) — Zsuzsi, B
- [ ] VF-037  content · ✅ fixed by `content.mjs` (full-res original from the old site), on `staging` (`2f54262`) · Rólunk hero photo is blurry on laptops: replace with the original high-res file or another photo — Zsuzsi
- [ ] VF-058  content · Átláthatóság: beszámolók for 2023, 2024, 2025 are missing (the old site stops at 2022)
- [ ] VF-059  content · Galéria: pick more photos from the social media Drive folders (monthly programmes, camp days) — Marci
- [ ] VF-030  content · Replace every `[Helyőrző]` placeholder (search for "Helyőrző" in Ghost Admin → Pages)
- [ ] VF-031  content · Real Napló posts in place of the seeded samples
- [ ] VF-032  content · Check the numbers on the home page (170 gyermek, 300 ügyfél/hó, …) and the 20/30/50% goals
- [ ] VF-034  content · Facebook URL, IBAN and contact details in Theme settings

### Infra / launch
- [ ] VF-040  infra · **Database backups** on the server: nightly `mysqldump` + a copy of the `ghost` volume (images), kept off the server (e.g. Hetzner Storage Box). Nothing is backed up yet
- [ ] VF-041  infra · Staging: turn on Ghost **Private site** (Settings → Access) so search engines don't index it
- [ ] VF-063  infra · Self-host Ghost Portal + search scripts (now loaded from cdn.jsdelivr.net: visitor IP goes to jsDelivr). Ghost config `portal__url`, `sodoSearch__url`, `sodoSearch__styles`. Then delete the jsDelivr paragraph in `Adatvédelmi.md`
- [ ] VF-064  infra · Docker log rotation on the server (`max-size`/`max-file` in compose) and check Ghost's request logs don't keep IPs. The privacy policy says no access log is kept
- [ ] VF-065  content · Monthly: delete unsubscribed members in Ghost Admin → Members. The privacy policy promises deletion within 30 days of unsubscribing
- [ ] VF-043  infra · Cookie/consent: only strictly necessary cookies are used (see the privacy policy), so no banner is needed. Revisit if analytics or embeds change
- [ ] VF-044  infra · Analytics: decide whether we want any (Ghost 6 built-in, Plausible, or none)
- [ ] VF-046  infra · Mailgun: confirm SPF/DKIM verified and newsletters don't land in spam (Gmail + Outlook test)

## Done
- [x] 2026-10-06  VF-067  page · **Futókampány landing page** `/futas/` (design `design/2026-10-futas-kampany/`, colourway piros): progress bar (title of hidden page `futas-gyujtes` = bank transfers etc. by hand, **+ card donations live from Stripe**, refreshed every minute), donate box tagged `campaign=futas` in Stripe, share/copy link, bank transfer box · notice bar points to `/futas/` (`*label*` in notice_text is bold)
- [x] 2026-10-06  VF-076  content · Futás real amount: **9 357 579 Ft** (Benedek, 2026-10-06) → title of `futas-gyujtes`. First half really reached, so the two-halves bar and the "célunk felét elértük" wording are back
- [x] 2026-10-06  VF-069  content · Átláthatóság: replace the full minutes with the **extracts** (`content/dokumentumok/JK_kivonat_KZ_*.pdf`), section title "Jegyzőkönyvi kivonatok" (Judit). The oldest extract's original still comes from Éva. Fix the `..pdf` file names — Judit, B
- [x] 2026-10-06  VF-070  content · Tevékenységünk: work in the Közlemény passages (numbers: 150 család adósságkezelés, 200+ ügyfél munkaerőpiaci mentor, 10 várandós, 60+ 0–3 éves, 170 gyermek, Éjszakai Klub 20–30, kertprogram 45 család, idősek 10–30; and the staff / family mentor paragraph) until Kata's material arrives — Zsuzsi, B: "dolgozd bele"
- [x] 2026-10-06  VF-071  content · Rólunk: hide the Értékeink section until the texts exist (VF-012) — Zsuzsi
- [x] 2026-10-06  VF-042  infra · Fonts self-hosted (`theme/assets/fonts/`, latin + latin-ext woff2), no more Google Fonts requests
- [x] 2026-10-06  VF-020  bug · Hide the HU/EN switch until VF-006 — Marci; Benedek: "egyelőre vegyük ki"
- [x] 2026-10-06  VF-022  bug · Hero: photo and box height jump when the donation amount changes (impact text wraps to a different number of lines) — Benedek
- [x] 2026-10-06  VF-023  bug · Footer "Oldalak" links all go to the home page — Marci
- [x] 2026-10-06  VF-024  feature · Partner logos clickable, links from the old site; add the missing ones (Gál Tibor, TOP Plusz) — Marci
- [x] 2026-10-06  VF-025  bug · /tamogatas/ → Tárgyi adomány "Mire van szükség?" leads to an empty page. Point it at the list on /kapcsolat/ — Marci
- [x] 2026-10-06  VF-026  content · Drop "minden hónapban" from the donate box impact text — Zsuzsi
- [x] 2026-10-06  VF-048  infra · Redirects from old Mobirise URLs (`index.html`, `rolunk.html`, `tevekenyseg.html`, `atlathatosag.html`, `top.html`) in Caddy
- [x] 2026-10-06  VF-049  infra · Content update script (`scripts/content.mjs`): pushes the launch content to a live Ghost through the Admin API key
- [x] 2026-10-06  VF-001  page · Tevékenységünk: text from the old site (generic template; design stays open as VF-060)
- [x] 2026-10-06  VF-002  page · Galéria (interim): the old site's programme photos as a Ghost gallery (design stays open as VF-061) — Marci
- [x] 2026-10-06  VF-003  page · Kapcsolat: contact details, bank data, in-kind donation list, company cooperation (from the old site). mailto, no form (design stays open as VF-062)
- [x] 2026-10-06  VF-004  page · Átláthatóság: all reports, minutes and rules from the old site, PDFs uploaded into Ghost (`content/dokumentumok/`) — Marci
- [x] 2026-10-06  VF-005  page · Adatvédelem: rewritten 2026-10-05 in `Adatvédelmi.md` (Stripe, Mailgun EU, Hetzner DE, Google Workspace, Ghost cookieless analytics, newsletter open/click tracking, YouTube, jsDelivr, cookie table); rendered to /adatvedelem/ by `content.mjs`
- [x] 2026-10-06  VF-007  page · TOP Plusz project page (`/top-plusz/`, old `/top.html`). EU-funded project info page, the old site had it, keep it
- [x] 2026-10-06  VF-036  content · Közlemény "Világíthatunk?" as a Napló post (final text from `Helyzetunk.md`), notice bar links to it — Zsuzsi
- [x] 2026-10-06  VF-038  content · First summer camp: **2000** (Benedek, 2026-10-05). Rólunk title/text and timeline updated — Zsuzsi
- [x] 2026-10-06  VF-039  content · Remove "20 segítő" everywhere until it's clarified internally — Zsuzsi
- [x] 2026-10-06  VF-050  infra · Stripe: **don't** use the Dashboard "Checkout" builder (the site creates its own Checkout Sessions). Developers → API keys → copy the live `sk_live_…` key into the server `.env` as `STRIPE_SECRET_KEY`, then `up -d` · live Stripe key on the server
- [x] 2026-10-06  VF-051  infra · Stripe: Settings → Branding (logo, colours `#…` from `screen.css`, icon) · Stripe branding (live)
- [x] 2026-10-06  VF-053  infra · Stripe: Settings → Customer emails → "Successful payments" receipts on (see VF-016 for wording) · Stripe receipts on (live)
- [x] 2026-10-06  VF-055  infra · Smoke test with live key: one real 500 Ft one-off + one monthly, then refund/cancel in the Dashboard · live smoke test: real payment succeeded
- [x] 2026-10-06  VF-045  infra · **Go-live runbook** (staging server becomes production, same DB). Order: · go-live: DNS → Hetzner, live Stripe, vilagitanifogok.hu
- [x] 2026-10-06  VF-047  infra · Web analytics via **Tinybird Cloud, EU (Frankfurt)**: traffic-analytics service, `tinybird-*` setup services (profile `analytics`), Caddy route `/.ghost/analytics/`, privacy policy section. Self-hosting Tinybird ruled out (self-managed is beta, not for production, needs 4 vCPU / 16 GB). One-time setup on the server: docs/PROJECT.md → Web analytics — Benedek
- [x] 2026-10-06  VF-066  infra · Ghost Admin: Settings → Analytics → web analytics **on** (cookieless, needs VF-047); Settings → Newsletters → email open + click tracking **on**. Both are described in the privacy policy · web analytics on, traffic visible
- [x] 2026-10-06  VF-056  infra · Ghost Admin → Settings → Integrations → add custom integration "Content script", run `scripts/content.mjs --dry-run`, then without it (README → Deploy). Then Design → Theme settings: `show_notice` on, `notice_link` = `/naplo/vilagithatunk-a-megmaradasunkert-kuzdunk/` (integrations can't change theme settings) · content script run on the live site
- [x] 2026-10-06  Test sign-ups in Members: kept (only Benedek), nothing to delete
- [x] 2026-10-02  VF-021  bug · Mobile: hero ray graphic covered the girl's face; hamburger wrapped to its own row (`8ffea36`)
- [x] 2026-10-02  Staging on Hetzner: Caddy + HTTPS, Mailgun SMTP, Stripe sandbox (`0411ffb`)
- [x] 2026-10-02  Theme v1: home, Napló, post, tag, Támogatás, Rólunk, Köszönjük, donate box + Stripe Checkout (`2c32102`)
