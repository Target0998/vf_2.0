#!/usr/bin/env node
// Seeds a local Ghost with everything the Világítani Fogok theme expects:
//   owner account → theme activation → site settings & navigation → tags →
//   pages (Rólunk, Támogatás, Köszönjük, …) → hidden content-block pages (#blokk) → sample Napló posts.
// Idempotent: anything that already exists (by slug) is left alone. Re-run any time.
//
//   node scripts/seed.mjs   (reads .env; also removes Ghost's default "Coming soon" post and "About" page)

import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// --- env ---------------------------------------------------------------------------------------
const envFile = path.join(ROOT, '.env');
if (existsSync(envFile)) {
    for (const line of readFileSync(envFile, 'utf8').split('\n')) {
        const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
        if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
    }
}
const URL_ = (process.env.GHOST_URL || 'http://localhost:2368').replace(/\/$/, '');
const EMAIL = process.env.GHOST_ADMIN_EMAIL || 'admin@vilagitanifogok.local';
const PASSWORD = process.env.GHOST_ADMIN_PASSWORD || 'Vilagitani-Fogok-2026';
const API = `${URL_}/ghost/api/admin`;
const THEME = 'vilagitani-fogok';
const PHOTOS = path.join(ROOT, 'theme/assets/images/photos');

let cookie = '';

async function api(method, p, body, { form } = {}) {
    const headers = { Origin: URL_, 'Accept-Version': 'v6.0' };
    if (cookie) headers.Cookie = cookie;
    let payload;
    if (form) payload = form;
    else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await fetch(API + p, { method, headers, body: payload });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    const text = await res.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; } // e.g. POST /session/ → "Created"
    if (!res.ok) {
        const err = new Error(`${method} ${p} → ${res.status}: ${data.errors?.[0]?.message || text.slice(0, 200)} ${data.errors?.[0]?.context || ''}`);
        err.status = res.status;
        throw err;
    }
    return data;
}

const log = (...a) => console.log('  ', ...a);

// --- 1. wait for Ghost -------------------------------------------------------------------------
async function waitForGhost() {
    process.stdout.write(`Waiting for Ghost at ${URL_} `);
    for (let i = 0; i < 120; i++) {
        try {
            const r = await fetch(`${API}/site/`, { headers: { Origin: URL_ } });
            if (r.ok) { console.log('✓'); return; }
        } catch { /* not up yet */ }
        process.stdout.write('.');
        await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error('Ghost did not come up in time – check `docker compose logs ghost`.');
}

// --- 2. owner + session ------------------------------------------------------------------------
async function login() {
    const { setup } = await api('GET', '/authentication/setup/');
    if (!setup[0].status) {
        await api('POST', '/authentication/setup/', {
            setup: [{ name: 'VF Admin', email: EMAIL, password: PASSWORD, blogTitle: 'Világítani Fogok Egyesület' }]
        });
        log(`owner created: ${EMAIL}`);
    }
    cookie = '';
    await api('POST', '/session/', { username: EMAIL, password: PASSWORD });
    log('logged in');
}

// --- helpers -----------------------------------------------------------------------------------
const imageCache = new Map();
async function upload(name) {
    if (imageCache.has(name)) return imageCache.get(name);
    const file = path.join(PHOTOS, `${name}.jpg`);
    const form = new FormData();
    form.append('file', new Blob([await readFile(file)], { type: 'image/jpeg' }), `${name}.jpg`);
    form.append('purpose', 'image');
    const { images } = await api('POST', '/images/upload/', undefined, { form });
    imageCache.set(name, images[0].url);
    return images[0].url;
}

async function exists(type, slug) {
    try {
        await api('GET', `/${type}/slug/${encodeURIComponent(slug)}/?formats=html`);
        return true;
    } catch (e) {
        if (e.status === 404) return false;
        throw e;
    }
}

let clock = Date.UTC(2026, 0, 1, 8, 0, 0); // block pages get increasing dates → stable ordering
async function createPage(p) {
    if (await exists('pages', p.slug)) return log(`page exists: /${p.slug}/`);
    const page = {
        status: 'published',
        published_at: new Date((clock += 60_000)).toISOString(),
        ...p
    };
    if (p.image) { page.feature_image = await upload(p.image); delete page.image; }
    await api('POST', '/pages/?source=html', { pages: [page] });
    log(`page: /${p.slug}/`);
}

async function createPost(p) {
    if (await exists('posts', p.slug)) return log(`post exists: ${p.slug}`);
    const post = { status: 'published', ...p };
    if (p.image) { post.feature_image = await upload(p.image); delete post.image; }
    await api('POST', '/posts/?source=html', { posts: [post] });
    log(`post: ${p.slug}`);
}

const block = (...tags) => [{ name: '#blokk' }, ...tags.map((name) => ({ name }))];

// --- 3. content --------------------------------------------------------------------------------
const nav = (items) => JSON.stringify(items.map(([label, url]) => ({ label, url })));

async function settings() {
    await api('PUT', '/settings/', {
        settings: [
            { key: 'title', value: 'Világítani Fogok Egyesület' },
            { key: 'description', value: 'Kerecsenden a nehéz sorsú családok, különösen a gyerekek életesélyeiért dolgozunk – hogy mindannyian aktív, egyenrangú és szabad tagjai lehessünk a társadalomnak.' },
            { key: 'locale', value: 'hu' },
            { key: 'timezone', value: 'Europe/Budapest' },
            { key: 'portal_button', value: false },
            { key: 'navigation', value: nav([
                ['Rólunk', '/rolunk/'],
                ['Tevékenységünk', '/tevekenysegunk/'],
                ['Napló', '/naplo/'],
                ['Galéria', '/galeria/'],
                ['Hogyan segíthetsz?', '/tamogatas/'],
                ['Kapcsolat', '/kapcsolat/']
            ]) },
            { key: 'secondary_navigation', value: nav([
                ['Rólunk', '/rolunk/'],
                ['Tevékenységünk', '/tevekenysegunk/'],
                ['Napló', '/naplo/'],
                ['Galéria', '/galeria/'],
                ['Átláthatóság', '/atlathatosag/']
            ]) }
        ]
    });
    log('settings + navigation');
}

async function siteIcon() {
    const { settings: current } = await api('GET', '/settings/');
    if (current.find((s) => s.key === 'icon')?.value) return;
    const form = new FormData();
    form.append('file', new Blob([await readFile(path.join(ROOT, 'theme/assets/images/vf/icon.png'))], { type: 'image/png' }), 'icon.png');
    form.append('purpose', 'icon');
    const { images } = await api('POST', '/images/upload/', undefined, { form });
    await api('PUT', '/settings/', { settings: [{ key: 'icon', value: images[0].url }] });
    log('site icon');
}

async function activateTheme() {
    await api('PUT', `/themes/${THEME}/activate/`);
    log(`theme active: ${THEME}`);
}

async function tags() {
    const list = [
        ['Tábor', 'tabor', '#0F7D6E'],
        ['Mindennapok', 'mindennapok', '#0F7D6E'],
        ['Hétvégi program', 'hetvegi-program', '#7A5000'],
        ['Családmentorálás', 'csaladmentoralas', '#0F7D6E'],
        ['Közlemény', 'kozlemeny', '#D2401F']
    ];
    for (const [name, slug, accent_color] of list) {
        if (await exists('tags', slug)) continue;
        await api('POST', '/tags/', { tags: [{ name, slug, accent_color }] });
        log(`tag: ${name}`);
    }
}

const P = (...ps) => ps.map((p) => `<p>${p}</p>`).join('\n');

async function pages() {
    // Real pages ------------------------------------------------------------------------------
    await createPage({
        title: '23 éve Kerecsenden. *Ebbe a körbe mindenki belefér.*',
        meta_title: 'Rólunk – Világítani Fogok Egyesület',
        slug: 'rolunk', image: 'csapat-fuben',
        feature_image_alt: 'Önkénteseink körben a fűben',
        html: P(
            '23 évvel ezelőtt, amikor először szerveztünk tábort a kerecsendi hátrányos helyzetű gyerekeknek, a Dankó telepi gyerekek kővel hajigálták meg fiatal önkénteseinket. Egy évvel később alig várták, hogy elinduljon a tábor. A kövek eszükbe sem jutottak.',
            'Ma évente 140 gyereknek adunk élményeket, minőségi időt, figyelmet és feltétlen szeretetet. A kerecsendi családok az elmúlt évben több mint 1000 ügyben fordultak hozzánk segítségért. Három önkéntessel indultunk, ma negyvenöt önkéntessel, húsz segítővel és számos hivatásos munkatárssal dolgozunk.'
        )
    });
    await createPage({
        title: 'Állj a kerecsendi *gyerekek* mellé',
        meta_title: 'Támogatás – Világítani Fogok Egyesület',
        slug: 'tamogatas', image: 'tabor-csoportkep',
        custom_excerpt: 'Egyszeri adományod is hatalmas segítség, rendszeres adományod pedig lehetővé teszi, hogy hosszútávra tervezzünk.',
        html: '<h2>Kevésbé függeni a pályázatoktól</h2>\n' + P('Szeretnénk, ha éves bevételünk egyre nagyobb része saját forrásból, magánszemélyek és cégek támogatásából származna – így a programok akkor is folytatódhatnak, ha egy pályázat késik.')
    });
    await createPage({
        title: 'Köszönjük, hogy világítasz velünk!',
        slug: 'koszonjuk',
        custom_excerpt: 'Támogatásod rögzítettük. A visszaigazolást e-mailben küldjük.',
        html: ''
    });
    await createPage({
        title: 'Tevékenységünk', slug: 'tevekenysegunk',
        custom_excerpt: '7 állandó munkatárs, 7 óradíjas szakember és 3 közfoglalkoztatott dolgozik a programokban.',
        html: '<h2>Családmentorálás és korai fejlesztés</h2>' + P('Helyi családmentorok magzati kortól kísérik az édesanyákat és a kisgyermekeket. [Helyőrző – a régi oldal tartalma ide kerül.]') +
            '<h2>Gyerekek és kamaszok</h2>' + P('Hétvégi programok, nyári napközi, táborok, környezetvédelmi foglalkozások. [Helyőrző]') +
            '<h2>Felnőttek és közösség</h2>' + P('Munkaerőpiaci mentorálás, adósságtanácsadás, egészségügyi szűrések, lakhatási és kertprogram. [Helyőrző]')
    });
    await createPage({ title: 'Galéria', slug: 'galeria', custom_excerpt: 'Pillanatok a táborokból és a mindennapokból.', html: P('[Helyőrző – Ghost galéria kártyával tölthető fel.]') });
    await createPage({
        title: 'Kapcsolat', slug: 'kapcsolat',
        html: P('<strong>Világítani Fogok Egyesület</strong><br>3396 Kerecsend, Fő út 154.<br><a href="mailto:info@vilagitanifogok.hu">info@vilagitanifogok.hu</a>', 'Tárgyi adomány, céges együttműködés vagy önkéntesség ügyében írj nekünk bátran! [Helyőrző]')
    });
    await createPage({
        title: 'Átláthatóság', slug: 'atlathatosag',
        custom_excerpt: 'Beszámolók, közhasznúsági jelentések, alapdokumentumok.',
        html: '<table><thead><tr><th>Dokumentum</th><th>Év</th><th>Formátum</th><th></th></tr></thead><tbody>' +
            [['Közhasznúsági beszámoló', 2025], ['Közhasznúsági beszámoló', 2024], ['Alapszabály', 2023], ['Adatvédelmi tájékoztató', 2026]]
                .map(([d, y]) => `<tr><td>${d}</td><td>${y}</td><td>PDF</td><td><a href="#">Letöltés</a></td></tr>`).join('') +
            '</tbody></table>'
    });
    await createPage({ title: 'Adatvédelem', slug: 'adatvedelem', html: P('[Helyőrző – adatvédelmi tájékoztató.]') });

    // Hidden content blocks (#blokk) – read by the templates with {{#get}} ----------------------
    const stats = [['170', 'gyermeket érintenek programjaink és fejlesztéseink'], ['300', 'ügyfél fordul hozzánk segítségért havonta'], ['60+', '0–3 éves kisgyermeket és családját kísérjük'], ['45', 'család vesz részt a kertprogramban']];
    for (const [i, [num, label]] of stats.entries()) {
        await createPage({ title: num, slug: `szam-${i + 1}`, custom_excerpt: label, tags: block('#szam'), html: '' });
    }
    await createPage({
        title: 'Ilyen Kerecsendért dolgozunk', slug: 'fooldal-jovokep', image: 'setalas', tags: block(),
        feature_image_alt: 'Közös séta Kerecsend utcáin',
        custom_excerpt: 'Egy faluért, ahol érezhetően kisebbek lesznek a szociális helyzetből fakadó különbségek, és ahol az emberek egymást segítő, egyenrangú közösségekben élnek.',
        html: P('Szeretnénk, ha az egyesület és a falu közös munkája országosan ismert és elismert példa lenne. Ebbe a körbe mindenki belefér.')
    });
    const programs = [
        ['Családmentorálás és korai fejlesztés', 'kozeli', 'Helyi családmentorok magzati kortól kísérik az édesanyákat és a kisgyermekeket. Korai mozgásfejlesztés, és magyar nyelvi fejlesztés a harmadik országból érkezett ukrán, vietnámi és filippínó gyerekeknek.'],
        ['Gyerekek és kamaszok', 'kesztyu', 'Két pszichológus, fejlesztőpedagógus, gyógypedagógus és sportedző. Hétvégi programok, nyári napközi, táborok, környezetvédelmi foglalkozások, és a kamasz lányok életre való felkészítése.'],
        ['Felnőttek és közösség', 'bicikli', 'Munkaerőpiaci mentorálás, adósságtanácsadás, egészségügyi szűrések, lakhatási és kertprogram – hogy a családok kevesebb krízissel, biztosabb alapokon éljenek.']
    ];
    for (const [i, [title, image, excerpt]] of programs.entries()) {
        await createPage({ title, slug: `program-${i + 1}`, image, custom_excerpt: excerpt, tags: block('#program'), html: '' });
    }
    await createPage({
        title: 'Rendszeres adományod lehetővé teszi, hogy hosszútávra tervezzünk', slug: 'fooldal-havi-tamogatas', tags: block(),
        custom_excerpt: 'Szeretnénk, ha munkánk egyre kevésbé függne pályázatoktól és állami programoktól. Célunk, hogy éves bevételünk fele saját forrásból, magánszemélyek és cégek támogatásából származzon.',
        html: ''
    });
    const timeline = [['2003', 'az első nyári tábor, laza civil szerveződésként'], ['2018', 'bejegyzett egyesület lettünk'], ['2023', 'közhasznú egyesületként dolgozunk'], ['45', 'önkéntes és húsz segítő ma']];
    for (const [i, [title, excerpt]] of timeline.entries()) {
        await createPage({ title, slug: `idovonal-${i + 1}`, custom_excerpt: excerpt, tags: block('#idovonal'), html: '' });
    }
    await createPage({
        title: 'Küldetésünk', slug: 'rolunk-kuldetes', tags: block(),
        custom_excerpt: 'A Kerecsenden nagy számban élő nehéz sorsú, magára hagyott emberek, különösen a gyerekek életesélyeinek növelése, közösségteremtés és a tágabb társadalom felelősségvállalásának növelése.',
        html: P('Kerecsend Magyarország 300 legszegényebb települése közé tartozik. A gyerekekhez és családokhoz holisztikus szemlélettel fordulunk: a felmerülő kérdéseket összefüggésükben kezeljük, és szerteágazó kapcsolatokat építünk segítőszervezetek, intézmények és emberek között.', 'Mindezt azért, hogy mindannyian aktív, egyenrangú, alkotó és szabad tagjaivá váljunk a társadalomnak.')
    });
    const values = [['Átláthatóság', 'Takarékosan bánunk az adófizetők és a támogatók pénzével.'], ['Rugalmasság'], ['Tisztelet'], ['Sokszínűség'], ['Empátia'], ['Felelősségvállalás']];
    for (const [i, [title, excerpt]] of values.entries()) {
        await createPage({ title, slug: `ertek-${i + 1}`, custom_excerpt: excerpt || '[Helyőrző – pár mondatos kifejtés]', tags: block('#ertek'), html: '' });
    }
    const faq = [
        ['Biztonságos a kártyás fizetés?', 'A fizetést a Stripe kezeli, kártyaadataid nem jutnak el hozzánk.'],
        ['Hogyan mondhatom le a havi támogatást?', 'Az első adomány után kapott e-mailben található linken bármikor, egy kattintással.'],
        ['Kapok igazolást az adományomról?', 'Minden fizetésről automatikus e-mailes nyugtát küldünk. [Helyőrző – pontosítandó]'],
        ['Mire fordítjátok az adományokat?', 'Gyerekprogramokra, táborokra és a családokkal dolgozó munkatársaink bérére. Beszámolóinkat az <a href="/atlathatosag/">Átláthatóság</a> oldalon találod.']
    ];
    for (const [i, [q, a]] of faq.entries()) {
        await createPage({ title: q, slug: `gyik-${i + 1}`, tags: block('#gyik'), html: P(a) });
    }
}

async function posts() {
    const body = () => P(
        'Ez egy minta-bejegyzés a téma kipróbálásához. A szöveg helyőrző – a valódi beszámolók a Ghost szerkesztőben készülnek, képekkel, galériával és idézetekkel.',
        'A gyerekek reggel kilenckor érkeztek, és estig együtt voltunk: játék, közös főzés, beszélgetések. Az önkéntesek közül sokan maguk is a tábor egykori résztvevői.'
    ) + '\n<blockquote>„Kicsiny kis fényemmel, világítani fogok!”</blockquote>\n' + P('Köszönjük mindenkinek, aki támogatásával lehetővé tette ezt a napot.');

    const list = [
        ['Világíthatunk? A megmaradásunkért küzdünk', 'vilagithatunk-a-megmaradasunkert-kuzdunk', 'olelkezes', 'kozlemeny', '2026-09-15', 'Két fő programunk előfinanszírozására összesen 12,78 millió forint saját forrást kellett lekötnünk, s ezzel saját forrásaink kimerültek.', true],
        ['Egy nap a családmentorainkkal', 'egy-nap-a-csaladmentorainkkal', 'hulahopp', 'mindennapok', '2026-08-28', 'Reggeltől estig a családok mellett – mit jelent a kísérés a gyakorlatban.'],
        ['Tábori hétfő: így indult a nyár', 'tabori-hetfo-igy-indult-a-nyar', 'tabor-csoportkep', 'tabor', '2026-07-13', 'Gyerekek és önkéntesek egy héten át – az első nap képekben.'],
        ['Erdei túra a legkisebbekkel', 'erdei-tura-a-legkisebbekkel', 'tura', 'hetvegi-program', '2026-06-21', 'A havi hétvégi program ezúttal az erdőbe vitt minket.'],
        ['Környezetvédelmi nap a faluban', 'kornyezetvedelmi-nap-a-faluban', 'kesztyu', 'tabor', '2026-06-02', 'Kesztyű, zsák és sok nevetés – közösen tettük rendbe a játszóteret.'],
        ['Iskolára készen', 'iskolara-keszen', 'kislany', 'csaladmentoralas', '2026-05-15', 'Hogyan segítjük a gyerekeket az óvoda és az iskola közötti lépésben.'],
        ['Tavasz a Dankó telepen', 'tavasz-a-danko-telepen', 'bicikli', 'mindennapok', '2026-04-30', 'Kertprogram, biciklijavítás és az első meleg napok.']
    ];
    for (const [title, slug, image, tag, date, excerpt, featured] of list) {
        await createPost({
            title, slug, image, custom_excerpt: excerpt, featured: !!featured,
            tags: [{ slug: tag }], published_at: new Date(`${date}T09:00:00+02:00`).toISOString(),
            html: body()
        });
    }
}

async function removeDefaults() {
    for (const [type, slug] of [['posts', 'coming-soon'], ['pages', 'about']]) {
        try {
            const data = await api('GET', `/${type}/slug/${slug}/`);
            await api('DELETE', `/${type}/${data[type][0].id}/`);
            log(`removed default ${type.slice(0, -1)}: ${slug}`);
        } catch (e) { if (e.status !== 404) throw e; }
    }
}

// --- run ---------------------------------------------------------------------------------------
try {
    await waitForGhost();
    console.log('Account');  await login();
    console.log('Theme');    await activateTheme();
    console.log('Settings'); await settings(); await siteIcon();
    console.log('Defaults'); await removeDefaults();
    console.log('Tags');     await tags();
    console.log('Pages');    await pages();
    console.log('Posts');    await posts();
    console.log(`\nDone ✓  Site: ${URL_}   Admin: ${URL_}/ghost/  (${EMAIL} / ${PASSWORD})`);
} catch (e) {
    console.error('\n✗', e.message);
    process.exit(1);
}
