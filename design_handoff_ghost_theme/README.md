# Handoff: Világítani Fogok Egyesület – Ghost téma

## Áttekintés
A Világítani Fogok Egyesület (Kerecsend) új honlapja **Ghost CMS** alapon. Célja az adománygyűjtés – kiemelten a **havi rendszeres támogatás** Stripe-on keresztül – és a munka bemutatása a **Napló** (Ghost blog) bejegyzéseivel. A régi, Mobirise-alapú statikus oldalt váltja.

## A tervfájlokról
A csomagban lévő HTML fájlok **tervreferenciák** – a kívánt megjelenést és működést mutatják, nem éles kódot. A feladat ezeket **egyedi Ghost témaként** (Handlebars `.hbs` sablonok + CSS + kevés vanilla JS) újraépíteni, a Ghost szokásos szerkezetével (`default.hbs`, `index.hbs`, `post.hbs`, `page-*.hbs`, `partials/`, `routes.yaml`, `package.json`). Ne a `.dc.html` fájlokat másold át – ezek egy prototípus-futtatóra épülnek.

A tervek megnyitása: a csomag gyökeréből indíts egy helyi szervert (`npx serve .`), majd nyisd meg a `templates/honlap-iranyok/HonlapIranyok.dc.html` és `Aloldalak.dc.html` fájlt. A vászon nagyítható/görgethető; minden kör egy szekció, **a legfelső a legfrissebb**.

## Hűség
**High-fidelity.** Végleges színek, betűk, térközök, lekerekítések. Pixelpontosan kell újraépíteni, desktopon 1440px-es szélességre tervezve. Mobil nézet nincs megrajzolva – lásd „Reszponzív viselkedés”.

**A szövegek helyőrzők** (a jelenlegi oldalról és a 2026-os stratégiából). Az ügyfél később cseréli őket – Ghostban szerkeszthetők legyenek, ahol csak lehet (lásd „Tartalom Ghostban”).

## Melyik terv a végleges
| Oldal | Fájl / szekció | Ghost |
|---|---|---|
| Főoldal | `HonlapIranyok.dc.html` → **3a** (legfelső szekció) | `home.hbs` |
| Napló (lista) | `Aloldalak.dc.html` → **3b** | `routes.yaml`: collection `/naplo/` → `naplo.hbs`; címkék: `tag.hbs` |
| Támogatás | `Aloldalak.dc.html` → **3c** | `page-tamogatas.hbs` (slug: `tamogatas`) |
| Rólunk | `Aloldalak.dc.html` → **3d** | `page-rolunk.hbs` (slug: `rolunk`) |
| Bejegyzés (cikk) | **nincs megrajzolva** | `post.hbs` – a rendszerből levezetve (lásd lent) |
| Galéria, Tevékenységünk, Kapcsolat, Átláthatóság, Adatvédelem | **nincs megrajzolva** | `page.hbs` általános sablon |

A régebbi körök (1a–1c, 2a–2b) csak történeti referenciák.

**A 3a hero beállítása:** a Tweaks panelen az ügyfél a **„plain”** hero-t választotta (natúr színes fotó, a fényjel a jobb alsó sarokból lóg be), és a **közleménysáv kikapcsolva**. A „spotlight” (szürke fotó, színes középpel) változat nem kell. A közleménysáv legyen kapcsolható (Ghost custom setting), alapból ki.

## Képernyők

### Közös: fejléc (minden oldal)
- Sötétzöld sáv (`#0E4A43`), padding `18px 64px`, flex, space-between.
- Bal: fényjel `assets/vf/logo-mark.svg` 60×60 + kétsoros név: „Világítani Fogok” (Bricolage Grotesque 800, 23px, letter-spacing -.01em, `#FFFCF7`) / „EGYESÜLET · KERECSEND” (Hanken Grotesk 500, 13px, .04em, `#BFD9D3`).
- Menü (Hanken 600, 16px, gap 30px): Rólunk · Tevékenységünk · Napló · Galéria · Hogyan segíthetsz? · Kapcsolat · `HU / EN` · gomb **Támogatom** (sárga `#F8C818`, szöveg `#1F1A17`, pill, padding `12px 24px`, 700) → `/tamogatas/`.
- Aktív menüpont: sárga szöveg + 2px sárga aláhúzás (`box-shadow: inset 0 -2px 0`), padding-bottom 4px.
- A menü Ghost Navigationből jöjjön. EN: egyelőre csak a kapcsoló látszik (angol oldal később).
- Opcionális közleménysáv a fejléc fölött: sárga háttér, középre igazított egy sor + link.

### Közös: lábléc
- `#1F1A17` háttér, `#F4EEE6` szöveg, padding `56px 64px`, grid `auto 1fr 1fr 1fr`, gap 56px, Hanken 16/1.7.
- 1. oszlop: 150px krém kör (`#FFFCF7`), benne a **teljes színes logó** `assets/vf/logo.svg` 122×115.
- Oszlopok: Oldalak (Rólunk, Tevékenységünk, Napló, Galéria, Átláthatóság) · Kapcsolat (3396 Kerecsend, Fő út 154., info@vilagitanifogok.hu, Facebook, Adatvédelem) · Adatok (Adószám: 19063672-1-10, OTP Bank · 11711096-21456499, © 2026).

### Főoldal (3a)
1. **Hero** – sötétzöld alapon, grid `600px minmax(0,1fr)`, magasság 840px.
   - Bal oszlop (padding `32px 48px 56px 64px`, gap 26px): h1 „Kicsiny kis fényemmel, *világítani fogok!*” (Bricolage 800, 60/1.02, -.025em; a második fele sárga) · lead (Hanken 19/1.55, `#D5E4E1`) · **adománydoboz** (lásd Komponensek).
   - Jobb oszlop: fotó `gyerekek-csodalkoznak.jpg`, `object-fit:cover`, `object-position:62% 50%`, radius 32px, margin `0 24px 24px 0`. A fényjel `logo-mark-hero.svg` 420×420, `right:-150px; bottom:-150px`, a fotó fölött, levágva.
   - **A doboz soha nem takarja a fotót.**
2. **Számok** – 4 oszlop, padding `56px 64px 32px`. Szám: Bricolage 800 56px; címke Hanken 500 17/1.4 `#4A433D`. Színek sorban: `#D2401F`, `#0F7D6E`, `#B07C00`, `#0F7D6E`. (170 gyermek · 300 ügyfél/hó · 60+ 0–3 éves · 45 család kertprogram.)
3. **Jövőkép** – grid `1.05fr 1fr`, gap 72px, padding `64px 64px 88px`. Bal: fotó `setalas.jpg` 500px magas, radius 28. Jobb: kicker „JÖVŐKÉPÜNK” · h2 46px · nagy bekezdés Hanken 500 24/1.45 · bekezdés 19/1.6 · outline gomb „Rólunk és a csapatról →”.
4. **Tevékenységünk** – fejléc (h2 44 + alcím 18px + „Minden program →” link piros), 3 kártya, gap 24: fotó 300px radius 22, h3 26/700, szöveg 17/1.55.
5. **Havi támogatás sáv** – piros (`#D2401F`) blokk, margin `0 24px`, radius 28, padding `72px 64px`, 2 oszlop gap 72. Bal: kicker + h2 50px fehér. Jobb: bekezdés, 3 szám (20% 2027-re · 30% 2030-ra · 50% a célunk; 40px 800, felső 2px fehér 50%-os vonal), fehér gomb „Havi támogató leszek”. Bal alsó sarokban halvány fénykoszorú dekoráció (`logo-rays-light.svg`, opacity .18).
6. **Napló** – kicker „NAPLÓ” + h2 „Hírek a munkánkról” + „Minden bejegyzés →”. Grid `1.4fr 1fr` gap 28: bal nagy kártya (`#FFF3D1`, radius 24, kép 400px), jobb 3 kis kártya (grid `160px 1fr`, kép 160×120 radius 14). **A legfrissebb 4 Ghost bejegyzés**, az elsőt (vagy a `featured`-t) nagyban.
7. **Más módon is segíthetsz** – 4 csempe gap 20, radius 24, padding 28: Adód 1%-a (`#E3F3EF`, adószám `#0B5C51` 20px 700) · Átutalás (számlaszám + IBAN) · Tárgyi adomány · Céges együttműködés (`#F4EEE6`).
8. **Partnereink** – felső 1px `#EDE4D8` vonal, logók sorban, `grayscale(1)` + opacity .7, magasság 36–52px. (`assets/vf/partners/`)
9. Lábléc.

**A főoldalon nincs galéria** – a Galéria csak menüpont.

### Napló (3b)
- Sötétzöld fejléc + cím-blokk: h1 „Napló” 72px, lead `#D5E4E1`, jobbra fent nagy fényjel dekoráció.
- Címkeszűrő chipek (pill, 1.5px `#E2D8CB` keret; aktív: fekete kitöltés, fehér szöveg) – **Ghost tagek**, linkként a `/tag/<slug>/` oldalra.
- Kiemelt bejegyzés: grid `1.3fr 1fr`, `#FFF3D1`, radius 28, kép 460px.
- Lista: 3 oszlop, gap `28px 24px`; kép 260px radius 22, meta (TAG színes 700 + dátum), cím Bricolage 700 24/1.2, kivonat 16/1.5.
- „Korábbi bejegyzések” outline gomb → Ghost lapozás.
- Alul piros CTA-sáv „Szeretnéd, hogy legyen folytatás?” + fehér gomb.

### Támogatás (3c)
- Sötétzöld hero, grid `1fr 540px`, gap 72. Bal: h1 64px (kiemelt szó sárga), lead, 3 soros „mit jelent az összeg” lista (sárga összeg 28px 800 + leírás). Jobb: **nagy adománydoboz** (radius 28, padding 32, árnyék `0 30px 60px rgba(0,0,0,.25)`), plusz név + e-mail mező és „Feliratkozom a Napló hírlevelére” jelölő (→ Ghost member signup).
- „Miért havi?” – fotó + szöveg + 20/30/50% számok.
- „Más módon is segíthetsz” 4 csempe (mint a főoldalon).
- GYIK: bal oldalt h2, jobb oldalt nyitható sorok (`<details>`), 2px fekete felső vonal, `+`/`–` piros jel.

### Rólunk (3d)
- Sötétzöld fej: h1 72px „23 éve Kerecsenden. *Ebbe a körbe mindenki belefér.*”, alatta széles fotó `csapat-fuben.jpg` 560px, felső sarkok kerekek.
- Történetünk: grid `360px 1fr` – kicker + nagy bevezető (26/1.45) + bekezdés.
- Idővonal 4 oszlop (2003 · 2018 · 2023 · 45 önkéntes), elválasztó függőleges vonalak.
- Küldetés: sötétzöld blokk, 2 oszlop, nagy fényjel dekoráció jobb felső sarokban.
- Értékeink: 3×2 csempe (Átláthatóság, Rugalmasság, Tisztelet, Sokszínűség, Empátia, Felelősségvállalás), tónusos hátterek váltakozva. Magyarázat-szövegek még hiányoznak.
- **Csapat szekció nincs** (nincsenek portrék – később bővíthető).
- Két link-csempe: Átláthatóság · Csatlakoznál önkéntesként? (piros).

### Bejegyzés (post.hbs) – levezetendő
Nincs megrajzolva. Javaslat a rendszerből: sötétzöld fejléc; alatta krém alapon max 720px-es szövegoszlop; meta (tag + dátum), h1 52–62px, feature image radius 28 teljes tartalomszélességben; törzs Hanken 19/1.7; Koenig kártyák (kép, galéria, idézet) a rendszer sugaraival; a cikk végén piros havi-támogatás sáv; alatta 3 kapcsolódó bejegyzés `.post` kártyával.

## Interakciók és működés

### Adománydoboz
- **Gyakoriság** (szegmentált): Egyszeri / Havi. Alapból **Havi**.
- **Összegek** (4 gomb): 5 000 Ft · 10 000 Ft · 25 000 Ft · Egyéb. Alapból az 5 000 Ft. Az „Egyéb” megjelenít egy összegmezőt (`Ft` utótaggal).
- **Hatás-üzenet** (sárgás doboz, fényjel ikonnal) a választás szerint:
  - 5 000 Ft → „egy gyerek hétvégi programja”
  - 10 000 Ft → „egy kisgyermekes család havi fejlesztő foglalkozásai”
  - 25 000 Ft → „egy gyerek részvétele a nyári táborban”
  - Havi: „Havonta {összeg}: {hatás}, minden hónapban.” · Egyszeri: „{összeg}: {hatás}.” · Egyéb: „Bármekkora összeg számít – te döntöd el, mennyit adsz.”
- **CTA**: „Támogatom havi 5 000 Ft-tal” / „Támogatom 5 000 Ft-tal” / „Tovább a támogatáshoz”. Havinál alá: „A havi támogatást bármikor lemondhatod.”
- Lábjegyzet: „Biztonságos kártyás fizetés · Stripe” + VISA / Mastercard / Apple Pay jelvények.
- **Az utalás és az adó 1% NEM kerül a dobozba.**
- Kijelölt állapot: `aria-pressed="true"` → sötétzöld kitöltés, fehér szöveg. Kis vanilla JS elég.

### Fizetés – Stripe
- A Ghost beépített „Tips & donations” funkciója **csak egyszeri** fizetést tud, havi ismétlődőt nem. A Ghost tagsági előfizetése (paid membership) nem erre való.
- Javasolt megoldás: egy **kis szerver nélküli függvény** (pl. Cloudflare Worker / Netlify / Vercel function), ami a választott összegből és gyakoriságból Stripe Checkout Sessiont hoz létre (`mode: payment` vagy `mode: subscription`, `price_data` HUF-ban, egyedi összeg is), majd átirányít.
- Egyszerűbb alternatíva: előre létrehozott **Stripe Payment Linkek** az előre megadott összegekre (egyszeri + havi). Az egyedi havi összeg ezzel korlátozottan oldható meg – a fejlesztő ellenőrizze.
- Sikeres fizetés után: vissza a `/koszonjuk/` oldalra (vagy a köszönő ablak – `components/dialog.html`).
- Lemondás: **Stripe Customer Portal** linkje a visszaigazoló e-mailben.
- A pontos Stripe beállításokat (fiók, HUF, adóigazolás szövege) az ügyféllel egyeztetni kell.

### Egyéb
- Hover: gombok egy árnyalattal sötétebbek, linkek 80% átlátszóság. Fókusz: 3px sárga keret (`:focus-visible`).
- GYIK: natív `<details>`.
- Napló chipek: sima linkek a Ghost tag oldalakra.

## Reszponzív viselkedés (nincs megrajzolva – javaslat)
- ≤1100px: a hero egy oszlopba vált – cím, lead, **adománydoboz**, utána a fotó (a doboz maradjon a hajtás közelében). Menü → hamburger, a „Támogatom” gomb mindig látszik.
- Számok 2×2; 3-as kártyarácsok 1 oszlop; 4-es csempék 2×2; lábléc 2 oszlop, majd 1.
- Oldalmargó mobilon 20px, szekcióköz 56px, h1 40–44px, h2 32px.

## Tartalom Ghostban
- Napló = Ghost bejegyzések; címkék: Tábor, Mindennapok, Hétvégi program, Családmentorálás, Közlemény.
- Rólunk, Támogatás, Galéria, Kapcsolat, Átláthatóság, Adatvédelem = Ghost oldalak.
- A főoldal és a Támogatás szekciószövegei, a számok, az adomány-összegek és hatás-szövegek legyenek szerkeszthetők: Ghost **custom theme settings** (`package.json` → `config.custom`) vagy egy-egy rejtett Ghost oldal/bejegyzés tartalma, amit a sablon beolvas.
- Hírlevél-feliratkozás: Ghost Members (ingyenes tagság).

## Design tokenek
Mind a `styles.css` `:root` blokkjában – ezt érdemes egy az egyben átvenni a téma `assets/css/` mappájába.

**Színek**
- Logó: `#E85830` piros · `#38B8A0` türkiz · `#F8C818` sárga (csak dekoráció)
- Primary (adomány): `#D2401F` · hover `#B8361A` · active `#9E2E16`
- Dark (hero, fejléc, kijelölt): `#0E4A43` · `#0B3A35`
- Teal (kicker): `#0F7D6E` · deep `#0B5C51`
- Yellow (kiemelés sötéten, gomb sötéten): `#F8C818` · hover `#E8B800`
- Ochre (sárga szövegként világos alapon): `#B07C00` · `#7A5000`
- Alapok: oldal `#FFFCF7` · doboz `#FFFFFF` · sand `#F4EEE6` · butter `#FFF3D1` · `#FFF5D6` · mint `#E3F3EF` · blush `#FBE2D9`
- Szöveg: `#1F1A17` · törzs `#4A433D` · meta `#6B625A` · sötéten `#FFFCF7` / `#D5E4E1` / `#BFD9D3`
- Vonalak: `#EDE4D8` · `#E2D8CB`

**Tipográfia** (Google Fonts)
- Címek: **Bricolage Grotesque** 700/800 – h1 60–72px/1.0–1.02 (-.025em), h2 44–50px/1.05 (-.02em), h3 26px 700, számok 56px 800.
- Szöveg: **Hanken Grotesk** 400–700 – lead 19/1.55, törzs 17/1.55, meta 14/600, kicker 14/700 nagybetű .1em.

**Térköz:** oldalmargó 64px, szekcióköz 88px, rácsköz 20–28px, nagy oszlopköz 72px. Skála: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 88.
**Lekerekítés:** 6 (jelvény) · 14 (gomb-csempék, mezők, kis képek) · 22 (kártyaképek) · 24 (csempék) · 28 (hero kép, sávok, doboz) · 999 (pill gombok).
**Árnyék:** `0 16px 40px rgba(60,40,20,.08)` (doboz világos alapon) · `0 30px 60px rgba(0,0,0,.25)` (doboz sötét alapon).

## Eszközök (`assets/vf/`)
- `logo.svg` – teljes színes logó (az eredeti, ne módosítsd; csak világos alapon).
- `logo-mark.svg` – egyszerűsített fényjel (14 vastag, lekerekített sugár) – fejléc, ikon, favicon. **Még nem végleges**, az ügyfél grafikusa finomíthatja.
- `logo-mark-hero.svg` – ugyanez vékonyabb vonallal, nagy dekorációnak.
- `logo-rays.svg`, `logo-rays-light.svg`, `logo-text.svg` – az eredeti logó szétbontva (koszorú / felirat).
- Fotók: `gyerekek-csodalkoznak.jpg` (hero), `setalas.jpg`, `kozeli.jpg`, `kesztyu.jpg`, `bicikli.jpg`, `tabor-csoportkep.jpg`, `hulahopp.jpg`, `tura.jpg`, `olelkezes.jpg`, `kislany.jpg`, `csapat-fuben.jpg` – az egyesület saját fotói. Webre optimalizálni (WebP, `srcset`).
- `partners/` – partnerlogók.

## Fájlok a csomagban
- `README.md` – ez a leírás
- `styles.css` – tokenek + komponensosztályok (a design system)
- `templates/honlap-iranyok/HonlapIranyok.dc.html` – főoldal (3a a legfelső)
- `templates/honlap-iranyok/Aloldalak.dc.html` – Napló, Támogatás, Rólunk (3b–3d)
- `components/*.html` – komponensminták (gombok, adománydoboz, űrlap, kártyák, fejléc/lábléc, táblázat, köszönő ablak)
- `foundations/*.html` – szín, tipográfia, térköz, logó, képek
- `assets/vf/` – logók, fotók, partnerlogók

## Javasolt sorrend Claude Code-nak
1. Ghost téma váz (`package.json`, `default.hbs`, partials: header, footer, donate-box, post-card), `styles.css` beemelése.
2. Főoldal (`home.hbs`) a 3a szerint, Ghost bejegyzésekkel a Napló blokkban.
3. Napló: `routes.yaml` + lista + tag oldalak + `post.hbs`.
4. Támogatás és Rólunk oldalsablonok.
5. Adománydoboz JS + Stripe Checkout (szerver nélküli függvény).
6. Reszponzív nézetek, akadálymentesség, képoptimalizálás.
7. A régi oldal tartalmának átvitele (rolunk, tevekenyseg, atlathatosag).
