#!/usr/bin/env node
// Launch content for a running Ghost (local or live): Tevékenységünk, Kapcsolat, Átláthatóság,
// Adatvédelem, Galéria, TOP Plusz, the "Világíthatunk?" Közlemény post, Rólunk fixes.
//
// Safe to re-run. It only overwrites a page that doesn't exist yet or still holds the seed's
// placeholder text ("Helyőrző", sample post text). A page someone already edited in Ghost Admin is
// skipped, unless you pass --force. Rólunk is patched in place (a few phrases), never overwritten.
//
//   Live site (staging/prod): Ghost Admin → Settings → Integrations → Add custom integration
//   → copy the Admin API key, then:
//     GHOST_URL=https://vilagitanifogok.hu GHOST_ADMIN_API_KEY=<id:secret> node scripts/content.mjs --dry-run
//     GHOST_URL=https://vilagitanifogok.hu GHOST_ADMIN_API_KEY=<id:secret> node scripts/content.mjs
//   Local: node scripts/content.mjs   (logs in with the seed's owner account from .env)
//   One page only, overwriting hand edits:  node scripts/content.mjs --only=atlathatosag --force
//   Steps: tevekenysegunk kapcsolat atlathatosag adatvedelem top-plusz galeria rolunk ertekek futas kozlemeny samples notice

import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force');
// --only=atlathatosag,tevekenysegunk → run just these steps (combine with --force to update hand-edited pages)
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const run = async (name, fn) => { if (!ONLY.length || ONLY.includes(name)) await fn(); };

// --- env ---------------------------------------------------------------------------------------
const envFile = path.join(ROOT, '.env');
if (existsSync(envFile)) {
    for (const line of readFileSync(envFile, 'utf8').split('\n')) {
        const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
        if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
    }
}
const URL_ = (process.env.GHOST_URL || 'http://localhost:2368').replace(/\/$/, '');
const KEY = process.env.GHOST_ADMIN_API_KEY || '';
const EMAIL = process.env.GHOST_ADMIN_EMAIL || 'admin@vilagitanifogok.local';
const PASSWORD = process.env.GHOST_ADMIN_PASSWORD || 'Vilagitani-Fogok-2026';
const API = `${URL_}/ghost/api/admin`;

let cookie = '';

// Admin API key → short-lived JWT (https://ghost.org/docs/admin-api/#token-authentication)
function token() {
    const parts = KEY.trim().split(':');
    const [id, secret] = [parts[0], parts[parts.length - 1]];
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const unsigned = `${b64({ alg: 'HS256', typ: 'JWT', kid: id })}.${b64({ iat: now, exp: now + 300, aud: '/admin/' })}`;
    const sig = createHmac('sha256', Buffer.from(secret, 'hex')).update(unsigned).digest('base64url');
    return `${unsigned}.${sig}`;
}

async function api(method, p, body, { form } = {}) {
    const headers = { Origin: URL_, 'Accept-Version': 'v6.0' };
    if (KEY) headers.Authorization = `Ghost ${token()}`;
    else if (cookie) headers.Cookie = cookie;
    let payload;
    if (form) payload = form;
    else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await fetch(API + p, { method, headers, body: payload });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie && !KEY) cookie = setCookie.split(';')[0];
    const text = await res.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    if (!res.ok) {
        const err = new Error(`${method} ${p} → ${res.status}: ${data.errors?.[0]?.message || text.slice(0, 200)} ${data.errors?.[0]?.context || ''}`);
        err.status = res.status;
        throw err;
    }
    return data;
}

const log = (...a) => console.log('  ', ...a);
const write = (what) => (DRY ? `[dry-run] would ${what}` : what);

async function login() {
    if (KEY) return log('auth: Admin API key');
    await api('POST', '/session/', { username: EMAIL, password: PASSWORD });
    log(`auth: session (${EMAIL})`);
}

async function get(type, slug) {
    try {
        const data = await api('GET', `/${type}/slug/${encodeURIComponent(slug)}/?formats=html&include=tags`);
        return data[type][0];
    } catch (e) {
        if (e.status === 404) return null;
        throw e;
    }
}

async function upload(file, name = path.basename(file)) {
    if (DRY) return `${URL_}/content/images/dry-run/${name}`;
    const ext = path.extname(file).slice(1).toLowerCase();
    const type = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[ext];
    const form = new FormData();
    form.append('file', new Blob([await readFile(file)], { type }), name);
    form.append('purpose', 'image');
    const { images } = await api('POST', '/images/upload/', undefined, { form });
    return images[0].url;
}

// PDFs are uploaded into Ghost (Settings → content/files), so every document is hosted by Ghost itself.
const fileCache = new Map();
async function uploadFile(file) {
    if (fileCache.has(file)) return fileCache.get(file);
    if (DRY) return `${URL_}/content/files/dry-run/${path.basename(file)}`;
    const form = new FormData();
    form.append('file', new Blob([await readFile(file)], { type: 'application/pdf' }), path.basename(file));
    const { files } = await api('POST', '/files/upload/', undefined, { form });
    fileCache.set(file, files[0].url);
    return files[0].url;
}

const PLACEHOLDER = /Helyőrző|Ez egy minta-bejegyzés|href="#"/;
const isPlaceholder = (doc) => !doc.html || !doc.html.trim() || PLACEHOLDER.test(doc.html);

// Create, or replace a page/post that still holds placeholder content. `build` runs only when
// something will be written, so uploads don't happen for skipped pages.
async function upsert(type, slug, build) {
    const one = type.slice(0, -1);
    const existing = await get(type, slug);
    if (existing && !isPlaceholder(existing) && !FORCE) {
        return log(`${one} /${slug}/ already has real content – skipped (--force overwrites)`);
    }
    const doc = await build(existing);
    if (DRY) return log(write(`${existing ? 'replace' : 'create'} ${one} /${slug}/`));
    if (existing) {
        await api('PUT', `/${type}/${existing.id}/?source=html`, { [type]: [{ ...doc, updated_at: existing.updated_at }] });
        log(`${one} replaced: /${slug}/`);
    } else {
        await api('POST', `/${type}/?source=html`, { [type]: [{ status: 'published', ...doc, slug }] });
        log(`${one} created: /${slug}/`);
    }
}

// Replace a few phrases in an existing page without touching the rest of it.
async function patch(type, slug, pairs) {
    const doc = await get(type, slug);
    if (!doc) return log(`${type.slice(0, -1)} /${slug}/ not found – skipped`);
    const next = {};
    for (const field of ['title', 'custom_excerpt', 'html']) {
        let v = doc[field];
        if (!v) continue;
        for (const [from, to] of pairs) v = v.split(from).join(to);
        if (v !== doc[field]) next[field] = v;
    }
    if (!Object.keys(next).length) return log(`/${slug}/ already up to date`);
    if (DRY) return log(write(`patch /${slug}/: ${Object.keys(next).join(', ')}`));
    const q = next.html ? '?source=html' : '';
    await api('PUT', `/${type}/${doc.id}/${q}`, { [type]: [{ ...next, updated_at: doc.updated_at }] });
    log(`patched /${slug}/: ${Object.keys(next).join(', ')}`);
}

// --- content helpers ---------------------------------------------------------------------------
const P = (...ps) => ps.map((p) => `<p>${p}</p>`).join('\n');
const H2 = (t) => `<h2>${t}</h2>`;
// Raw HTML card – keeps tables and iframes exactly as written (Ghost's editor has no table block)
const HTML = (h) => `<!--kg-card-begin: html-->\n${h}\n<!--kg-card-end: html-->`;
const DOCS = path.join(ROOT, 'content/dokumentumok');

async function docTable(rows) {
    const trs = [];
    for (const [label, file] of rows) {
        if (file.startsWith('/')) { trs.push(`<tr><td>${label}</td><td>Oldal</td><td><a href="${file}">Megnyitás</a></td></tr>`); continue; }
        const kb = Math.round(readFileSync(path.join(DOCS, file)).length / 1024);
        const size = kb >= 1024 ? `${(kb / 1024).toFixed(1).replace('.', ',')} MB` : `${kb} KB`;
        trs.push(`<tr><td>${label}</td><td>PDF, ${size}</td><td><a href="${await uploadFile(path.join(DOCS, file))}" target="_blank" rel="noopener">Letöltés</a></td></tr>`);
    }
    return HTML('<table><thead><tr><th>Dokumentum</th><th>Formátum</th><th></th></tr></thead><tbody>' + trs.join('') + '</tbody></table>');
}

// --- pages -------------------------------------------------------------------------------------
async function tevekenysegunk() {
    await upsert('pages', 'tevekenysegunk', async (old) => ({
        title: 'Tevékenységünk',
        meta_title: 'Tevékenységünk – Világítani Fogok Egyesület',
        custom_excerpt: old?.custom_excerpt || 'Táborok, családmentorálás, adósságtanácsadás, ifjúsági programok – szerteágazó munka Kerecsenden, a legkisebbektől az idősekig.',
        feature_image: old?.feature_image || await upload(path.join(ROOT, 'content/galeria/20-elso1000nap.jpg')),
        feature_image_alt: 'Családmentorok és édesanyák biciklivel Kerecsenden',
        html: [
            H2('Számokban'),
            P('Havonta átlagosan 300 ügyfél fordul hozzánk segítségért. Programjaink és fejlesztéseink összességében mintegy 170 gyermeket érintenek.'),
            '<ul>' + [
                'Adósságkezelésben eddig <strong>150 család</strong> kért támogatást.',
                'Munkaerőpiaci mentorunk <strong>több mint 200 ügyféllel</strong> foglalkozott, és több képzést is megszervezett.',
                'Munkatársaink jelenleg <strong>10 várandóst</strong> és <strong>több mint 60, 0–3 éves kisgyermeket</strong> és családját kísérik.',
                'Éjszakai Klubunkat <strong>20–30 fiatal</strong> látogatja.',
                'Kertprogramunkban <strong>45 család</strong> vesz részt.',
                'Az idős korosztályt segítő alkalmakon <strong>10–30 fővel</strong> dolgozunk.'
            ].map((li) => `<li>${li}</li>`).join('') + '</ul>',
            H2('Munkatársaink és a családok kísérése'),
            P('Munkatársaink alapos kiválasztási folyamat eredményeként dolgoznak velünk. Többen közülük a mi támogatásunkkal szereztek megfelelő végzettséget, szerteágazó szociális munkát végeznek.',
                'A gyermekek fejlődését már magzati kortól követjük: a helyi roma közösségből származó családmentorok figyelnek az édesanyák és gyermekeik egészségére, fejlődésére. Áldozatos, védőnőket támogató munkájuknak köszönhetően számos csecsemő hazagondozását sikerült megoldani, és reménytelen családi körülmények közé születő babák is családba kerülhettek nyílt örökbeadás támogatásával, ahelyett, hogy a kórházban maradtak volna. Az óvodás- és iskoláskorúakat pszichológus és fejlesztőpedagógus segíti.'),
            H2('Táborok és élménypedagógia'),
            P('Egyesületünk Kerecsenden szerteágazó munkát folytat. Önkénteseink hosszú évek óta szerveznek a gyerekek számára hosszúhétvégéket, nyári táborokat, őszi nagyfiú-nagylány tábort, színházlátogatásokat, kirándulásokat. Ezek az élménypedagógiai alkalmak teret nyitnak az egyes sorsok mélyebb megismerésének, az elakadások föltárásának, a személyes kapcsolatok elmélyítésének.',
                'E munka során kerültek látóterünkbe azok a fiúk is, akik a Pannonhalmi Bencés Gimnázium diákjaivá válhattak, illetve létrejöhetett az együttműködés a Gimnázium és a helyi általános iskola között. Ennek eredményeképp évente egy diák juthat be a nagy múltú iskolába, hogy ott érettségit szerezhessen.'),
            H2('Felzárkózó Települések program'),
            P('Magyarország 300 legszegényebb településén indulhatott el a Belügyminisztérium döntése alapján a Magyar Máltai Szeretetszolgálat által közvetített Felzárkózó Települések és Fókuszban a gyermek program. Ennek keretében zajlik évek óta kemény, terepi szociális munka, adósságtanácsadás, drogprevenció, lakhatási program, kertprogram, munkaerőpiaci mentorálás, a gyerekek felzárkóztatásának megsegítése fejlesztőpedagógus és gyermekpszichológus által, sportprogramok működtetése, mosási és fürdési lehetőség biztosítása a családoknak, az egészséges táplálkozás támogatása és köztisztasági tevékenység.',
                'Mindenekelőtt pedig a születendő gyermekek életesélyeinek javítása: az első 1000 napra vonatkozó kísérés, támogatás, családmentori munka, melyben gyógyszerekkel, vitaminokkal is ellátjuk a várandós anyukákat és a kisgyermekeket. Mentoraink munkájának eredményeképp e családok szükség esetén támaszkodhatnak a Felzárkózó Települések program minden szolgáltatására.'),
            H2('Ifjúsági és bűnmegelőzési programok'),
            P('A Nemzeti Bűnmegelőzési Tanáccsal együttműködve létrehoztunk és működtetünk egy ifjúsági terepi segítőcsoportot, mely az országban egyedülálló vállalkozás. Délutáni programokat szervezünk az iskolás korosztálynak, amelyekkel jobb szocializációjukat, biztosabb önértékelésüket, környezettudatosabb létüket igyekszünk segíteni. Ennek keretében zajlottak zenei foglalkozások fellépéssel együtt, működnek utcaőr csapatok és gyerekkert program.'),
            H2('Helyi humán fejlesztések – TOP Plusz'),
            P('A Kerecsendi Önkormányzat konzorciumi partnereként veszünk részt a „Helyi humán fejlesztések Kerecsenden” projektben: egészségügyi szűrések, ifjúsági klub, sportprogramok, közösségi és kulturális események, bűnmegelőzési és digitális programok. <a href="/top-plusz/">A projektről bővebben →</a>'),
            H2('Ismerj meg minket'),
            HTML('<div class="video-embed"><iframe src="https://www.youtube-nocookie.com/embed/deO2cUtChPw" title="Ismerj meg minket – Világítani Fogok Egyesület" loading="lazy" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>'),
            P('Képek programjainkról: <a href="/galeria/">Galéria →</a>')
        ].join('\n')
    }));
}

async function kapcsolat() {
    await upsert('pages', 'kapcsolat', async (old) => ({
        title: 'Kapcsolat',
        meta_title: 'Kapcsolat – Világítani Fogok Egyesület',
        custom_excerpt: old?.custom_excerpt || 'Írj nekünk bátran – tárgyi adomány, céges együttműködés, önkéntesség vagy bármilyen kérdés ügyében.',
        html: [
            H2('Elérhetőségek'),
            P('<strong>Világítani Fogok Egyesület</strong><br>3396 Kerecsend, Fő út 154. (<a href="https://maps.app.goo.gl/AGnAqncQd4NSMbxFA" target="_blank" rel="noopener">térkép</a>)<br>E-mail: <a href="mailto:info@vilagitanifogok.hu">info@vilagitanifogok.hu</a><br>Facebook: <a href="https://www.facebook.com/vilagitanifogok" target="_blank" rel="noopener">facebook.com/vilagitanifogok</a>'),
            H2('Adatok'),
            P('Adószám: 19063672-1-10<br>Bankszámlaszám: 11711096-21456499 (OTP Bank Nyrt.)<br>IBAN: HU68 1171 1096 2145 6499 0000 0000'),
            P('Közhasznú szervezetként céges pénzadomány után adókedvezményre jogosító igazolást tudunk kiállítani. Bankkártyás adományt a <a href="/tamogatas/">Támogatás</a> oldalon adhatsz.'),
            HTML('<span id="targyi-adomany"></span>'), // anchor for the Támogatás tile
            H2('Tárgyi adomány'),
            P('A következő adományokkal is segítheted munkánkat, könnyebbé teheted a gyerekek és családjaik életét:'),
            '<ul><li>cipő, ruha, ágynemű, törölköző</li><li>bútorok</li><li>tartós élelmiszerek</li><li>gyerekápolási holmik, tisztító- és tisztálkodószerek</li><li>focilabdák, röplabdák, gumilabdák, ugrálókötelek, frizbik</li></ul>',
            P('Ha ezek közül valamit adni szeretnél, kérünk, előbb egyeztess velünk az <a href="mailto:info@vilagitanifogok.hu">info@vilagitanifogok.hu</a> címen.'),
            HTML('<span id="egyuttmukodes"></span>'),
            H2('Céges együttműködés'),
            P('Cégként fontosnak tartjátok a társadalmi felelősségvállalást? Szeretnétek tenni az egyenlőtlenségek felszámolásáért? Nálunk minden befektetett munka vagy támogatásként adott forint megtérül. Az önkéntesen vállalt munka csapatépítésre is kiváló alkalom. Van olyan elektronikai eszközötök, amit már nem használtok, de szeretnétek, ha jó helyre kerülne? Írjatok nekünk az <a href="mailto:info@vilagitanifogok.hu">info@vilagitanifogok.hu</a> címre.')
        ].join('\n')
    }));
}

async function atlathatosag() {
    await upsert('pages', 'atlathatosag', async (old) => ({
        title: 'Átláthatóság',
        meta_title: 'Átláthatóság – Világítani Fogok Egyesület',
        custom_excerpt: old?.custom_excerpt || 'Beszámolók, jegyzőkönyvi kivonatok, szabályzatok.',
        html: [
            H2('Beszámolók'),
            P('Éves beszámolók és közhasznúsági mellékletek.'),
            await docTable([
                ['Beszámoló 2022', '2023.pdf'],
                ['Beszámoló 2021', '2022.pdf'],
                ['Beszámoló 2020', '2021.pdf']
            ]),
            H2('Jegyzőkönyvi kivonatok'),
            P('Kivonatok a közgyűlések jegyzőkönyveiből.'),
            await docTable([
                ['Jegyzőkönyvi kivonat – 2026. május 18.', 'JK_kivonat_KZ_2026.05.18.pdf'],
                ['Jegyzőkönyvi kivonat – 2026. február 15.', 'JK_kivonat_KZ_2026.02.15.pdf'],
                ['Jegyzőkönyvi kivonat – 2025. október 12.', 'JK_kivonat_KZ_2025.10.12.pdf'],
                ['Jegyzőkönyvi kivonat – 2024. július 7.', 'JK_kivonat_KZ_2024.07.07.pdf'],
                ['Jegyzőkönyvi kivonat – 2023. december 3.', 'JK_kivonat_KZ_2023.12.03.pdf'],
                ['Jegyzőkönyvi kivonat – 2023. április 15.', 'JK_kivonat_KZ_2023.04.15.pdf'],
                ['Jegyzőkönyvi kivonat – 2023. március 4.', 'JK_kivonat_KZ_2023.03.04.pdf'],
                ['Jegyzőkönyvi kivonat – 2022. július 10.', 'JK_kivonat_KZ_2022.07.10.pdf']
            ]),
            H2('Szabályzatok'),
            await docTable([
                ['Alapszabály', 'Alapszabaly_2023.04.15.pdf'],
                ['Befektetési szabályzat', 'Befektetesi_szabalyzat_2024.03.03.pdf'],
                ['Beszerzési szabályzat', 'Beszerzesi_szabalyzat_2024.03.03.pdf'],
                ['Csalás elleni eljárásrend és etikai kódex', 'Csalas_elleni_eljarasrend_es_etikai_kodex.pdf'],
                ['Kitüntetési szabályzat', 'Kituntetesi_Szabalyzat_VFE.pdf'],
                ['Adatkezelési tájékoztató', '/adatvedelem/']
            ])
        ].join('\n')
    }));
}

// Adatvédelem (VF-005): the source of truth is Adatvédelmi.md in the repo root. Edit the .md, not the page:
// the page is rewritten whenever the rendered text differs.
const PRIVACY_MD = path.join(ROOT, 'Adatvédelmi.md');

const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (t) => esc(t)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(?<![*\w])\*(?!\s)(.+?)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|mailto:[^)\s]+|\/[^)\s]*)\)/g, '<a href="$2">$1</a>')
    .replace(/(^|[\s(])(https?:\/\/[^\s)<]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');

// Small Markdown subset: #/##/### headings, - and 1. lists, | tables |, **bold**, *italic*, [links](…). Every line is
// its own paragraph. <!-- one-line comments --> are skipped (internal notes). A line in ALL CAPS also becomes a heading (the current file is text pasted from the old PDF).
function markdown(src) {
    const out = [];
    let list = null, table = null, para = [];
    const flushPara = () => { if (para.length) out.push(...para.map((l) => `<p>${inline(l)}</p>`)); para = []; };
    const flushList = () => { if (list) out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`); list = null; };
    const flushTable = () => {
        if (table) {
            const [head, ...body] = table.filter((r) => !r.every((c) => /^:?-+:?$/.test(c)));
            const thead = head.some((c) => c) ? `<thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead>` : '';
            out.push(HTML(`<table>${thead}<tbody>` +
                body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('') + '</tbody></table>'));
        }
        table = null;
    };
    const flush = () => { flushPara(); flushList(); flushTable(); };
    for (const raw of src.split('\n')) {
        const line = raw.trim();
        let m;
        if (!line) { flush(); continue; }
        if (line.startsWith('<!--') && line.endsWith('-->')) continue; // internal note, not published
        if (line.startsWith('|')) { flushPara(); flushList(); (table ||= []).push(line.replace(/^\||\|$/g, '').split('|').map((c) => c.trim())); continue; }
        flushTable();
        if ((m = line.match(/^(#{1,3})\s+(.*)$/))) { flush(); const n = Math.min(m[1].length + 1, 4); out.push(`<h${n}>${inline(m[2])}</h${n}>`); continue; }
        if ((m = line.match(/^[-*•]\s+(.*)$/)) || (m = line.match(/^\d{1,2}[.)]\s+(.*)$/))) {
            flushPara();
            const tag = /^\d/.test(line) ? 'ol' : 'ul';
            if (list && list.tag !== tag) flushList();
            (list ||= { tag, items: [] }).items.push(m[1]);
            continue;
        }
        flushList();
        if (line.length > 3 && /\p{Lu}/u.test(line) && !/\p{Ll}/u.test(line)) { flush(); out.push(`<h2>${inline(line)}</h2>`); continue; }
        para.push(line);
    }
    flush();
    return out.join('\n');
}

async function adatvedelem() {
    if (!existsSync(PRIVACY_MD)) return log('Adatvédelmi.md not found – /adatvedelem/ skipped');
    const html = markdown(readFileSync(PRIVACY_MD, 'utf8'));
    const old = await get('pages', 'adatvedelem');
    const doc = { title: 'Adatkezelési tájékoztató', meta_title: 'Adatkezelési tájékoztató – Világítani Fogok Egyesület', custom_excerpt: 'Hogyan kezeljük a személyes adataidat.', html };
    if (old) {
        // compare the text only: Ghost re-serialises the HTML, so markup never matches byte for byte
        const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, '');
        if (text(old.html || '') === text(html) && old.title === doc.title) return log('page /adatvedelem/ already matches Adatvédelmi.md');
        if (DRY) return log(write('replace page /adatvedelem/ from Adatvédelmi.md'));
        await api('PUT', `/pages/${old.id}/?source=html`, { pages: [{ ...doc, updated_at: old.updated_at }] });
        return log('page replaced from Adatvédelmi.md: /adatvedelem/');
    }
    if (DRY) return log(write('create page /adatvedelem/ from Adatvédelmi.md'));
    await api('POST', '/pages/?source=html', { pages: [{ status: 'published', slug: 'adatvedelem', ...doc }] });
    log('page created from Adatvédelmi.md: /adatvedelem/');
}

async function galeria() {
    const dir = path.join(ROOT, 'content/galeria');
    const files = readdirSync(dir).filter((f) => f.endsWith('.jpg')).sort();
    await upsert('pages', 'galeria', async (old) => {
        const imgs = [];
        for (const f of files) {
            const src = await upload(path.join(dir, f));
            const buf = readFileSync(path.join(dir, f));
            imgs.push({ src, ...jpegSize(buf) });
        }
        const rows = [];
        for (let i = 0; i < imgs.length; i += 3) rows.push(imgs.slice(i, i + 3));
        const gallery = '<figure class="kg-card kg-gallery-card kg-width-wide"><div class="kg-gallery-container">' +
            rows.map((r) => '<div class="kg-gallery-row">' + r.map((im) =>
                `<div class="kg-gallery-image"><img src="${im.src}" width="${im.width}" height="${im.height}" loading="lazy" alt=""></div>`).join('') + '</div>').join('') +
            '</div></figure>';
        return {
            title: 'Galéria',
            meta_title: 'Galéria – Világítani Fogok Egyesület',
            custom_excerpt: old?.custom_excerpt || 'Pillanatok a táborokból és a mindennapokból.',
            html: gallery
        };
    });
}

function jpegSize(buf) {
    for (let i = 2; i < buf.length;) {
        const marker = buf[i + 1];
        const len = buf.readUInt16BE(i + 2);
        if (marker >= 0xc0 && marker <= 0xc2) return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
        i += 2 + len;
    }
    return {};
}

async function topPlusz() {
    await upsert('pages', 'top-plusz', async () => ({
        title: 'Helyi humán fejlesztések Kerecsenden',
        meta_title: 'TOP Plusz – Helyi humán fejlesztések Kerecsenden',
        custom_excerpt: 'TOP_PLUSZ-3.1.3-23-HE1-2024-00014',
        html: [
            `<figure class="kg-card kg-image-card"><img src="${await upload(path.join(ROOT, 'theme/assets/images/vf/partners/szechenyi-terv-plusz.webp'))}" alt="Széchenyi Terv Plusz – Magyarország Kormánya – Az Európai Unió társfinanszírozásával" width="750" height="224"></figure>`,
            P('<strong>Kedvezményezett neve:</strong> Kerecsend Község Önkormányzata<br><strong>Projekt címe:</strong> Helyi humán fejlesztések Kerecsenden<br><strong>Szerződött támogatás összege:</strong> 299 999 999 Ft<br><strong>Támogatás mértéke:</strong> 100%<br><strong>Projekt tervezett fizikai befejezési dátuma:</strong> 2029.06.30.<br><strong>Projekt azonosító száma:</strong> TOP_PLUSZ-3.1.3-23-HE1-2024-00014'),
            H2('A projekt tartalmának bemutatása'),
            P('Kerecsend Község Önkormányzata, mint konzorciumvezető, sikeresen pályázott a Terület- és Településfejlesztési Operatív Program Plusz támogatási rendszer keretében megjelent TOP_PLUSZ-3.1.3-23-HE1 számú, „Helyi humán fejlesztések” című Felhívásra. Ennek keretében a „Helyi humán fejlesztések Kerecsenden” (TOP_PLUSZ-3.1.3-23-HE1-2024-00014) című projekt megvalósításához 300 millió forint vissza nem térítendő támogatást nyert el. A fejlesztés forrását az Európai Szociális Alap és Magyarország költségvetése társfinanszírozásban biztosítja.',
                'A konzorcium további tagjai: Agria Térségfejlesztési Nonprofit Kft. és a Világítani Fogok Egyesület.',
                'A projekt azon önkormányzati feladatokhoz kapcsolódó helyi fejlesztéseket támogatja, amelyek a helyi közszolgáltatások egyenlő esélyű hozzáférését, a humán szolgáltatások színvonalának javítását szolgálják. A beavatkozások illeszkednek a Megyei Esélyteremtő Paktumokhoz, a megvalósításra kerülő programok a megállapított szolgáltatáshiányokra kívánnak választ adni. A projekt célja a közszolgáltatásokhoz való hozzáférés javítása, magas színvonalú szolgáltatás kialakítása. A tervezés, előkészítés és a megvalósítás folyamata az önkormányzat és a helyi civil szervezetek, helyi intézmények bevonásával történik, a kapacitások fejlesztésével a helyi és regionális fejlesztések érdekében.',
                'Kerecsend községben jelentős mértékű a hátrányos helyzetben lévő egyének, családok száma. A településen élő hátrányos helyzetű lakosság életkörülményeinek javítása, társadalmi integrációjuk elősegítése a projekt által megvalósítandó szolgáltatásfejlesztések és társadalmi kohéziót erősíteni szándékozó kulturális események, programok, programfolyamatok révén elősegíthető.'),
            H2('A tervezett célok és programok'),
            '<ul>' + [
                'A nehezen mobilizálható mélyszegénységben élők, idősek számára az egészségmegőrzéshez alapvető szűrővizsgálatok helyben történő biztosítása, egészségvédő prevenciós programok megszervezése.',
                'Ifjúsági klubjellegű foglalkozások megvalósítása régi igény, a fiatalok hasznos szabadidő eltöltését szolgáló, szemléletformáló előadásokkal beszélgetésekkel, hasznos információk, ismeretek megosztásával, a fiatalok közösségi önszerveződéseinek fontos bázisa lehet.',
                'A szociális alapszolgáltatásban dolgozók mentális egészségének támogatása fontos, ugyanakkor elhanyagolt terület, amelynek eredménye sok esetben a kiégés és a pálya elhagyása lehet, szakember hiányában pedig a hátrányos helyzetű családok szakértő támogatása szűnhet meg. A projekt keretében erre biztosít lehetőséget a rendszeres szupervízió.',
                'Az egészséges életmódra nevelés kiemelt intézkedési terület a település élete és jövője szempontjából. Cél a sportolási kedv felébresztése és fenntartása a gyermekek, fiatalok körében az iskolásokat érintő sportrendezvények, rendszeres sportolást, a mozgásfejlesztés lehetőségét biztosító eseményekkel, fakultatív programokkal. Ökölvívó szakkör létrehozása fiúk és lányok részére is, szabadidős tevékenységként.',
                'A térségben a gazdasági hátrányok súlyos társadalmi problémákkal párosulnak, melyek megoldása nem pusztán gazdasági kérdés. Az elvándorlás, a térség elöregedése az önkormányzat tudatos, stratégiai fejlesztő munkájával csökkenthető, megállítható, melynek alapja a gyenge helyi identitástudat erősítése. A lakóhelyhez, lakókörnyezethez való kötődés a helyi értékek felismerésével, azok ápolásával, megőrzésével szoros összefüggésben állnak. A helyi társadalom önszerveződésére építve kulturális, közösségszervező, identitást erősítő események, programfolyamatok biztosításával erősíthető ezen kötődés, és hosszabb távon erősödik a település népességmegtartó ereje is.',
                'Kerecsendi újság megjelentetése, Kerecsend közösségi életét bemutató, a projekt programjainak nyilvánossá tételét, támogató eredményeit bemutató, a lakosságot tájékoztató rendszeresen megjelenő kiadvány megjelentetése szintén a projekt része.',
                'Az áldozattá válás elkerülésének támogatása megfelelő tájékoztatást nyújtó, közbiztonság érzetet növelő programsorozatokkal. Fontos szempont, hogy az egyes bűncselekmény elkövetés típusoknak megfelelően a különböző generációk számára specifikus programok kerülnek megvalósításra. Az idősebbek esetében jellemzőbb trükkös csalások elkerülésének módjai esetükben hangsúlyozottan kerülnek megjelenítésre, míg a fiatalok esetében a droghasználat veszélyei, a drogprevenció kérdésköre kerül kiemelésre.',
                'A közlekedési balesetek elkerülése, a biztonságos közlekedés kultúrájának kialakítása is a projekt eleme. A településen hagyományosan elterjedt a kerékpáros közlekedés, egészségfejlesztési-egészségmegőrzési okokból is indokolt ezen közlekedési forma népszerűségének fenntartása, további népszerűsítése szemléletformáló programok megvalósításával, szem előtt tartva a biztonságos közlekedés szabályait.',
                'A XXI. század információs társadalma a digitális eszközök használatát nélkülözhetetlenné tette, az emberek közötti információáramlás, kapcsolattartás legfőbb eszközeivé váltak. A gyors változásokhoz nehezebben alkalmazkodó idősebb nemzedék, valamint a hátrányos helyzetű lakosság számára a digitális kompetenciák hiánya nemcsak a modern világ megkövetelte ismeretek hiányát, hanem a társadalmi kirekesztődés veszélyét is rejthetik, ezért szükséges számukra is közérthető módon, sajátos igényeikre reagálva megvalósított digitális kompetenciafejlesztő programok lehetőségének biztosítása. Információs pont létrehozása is tervezett.'
            ].map((li) => `<li>${li}</li>`).join('') + '</ul>',
            P('A programok megvalósításának célcsoportja a település hátrányos helyzetű lakosai, köztük a mélyszegénységben élők. Cél a társadalmi elfogadás, kohézió, helyi közösségépítő folyamatok erősítése, a hátrányok és előítéletek csökkentése. További cél a településen szolgáltatáshiányként jelentkező elemek erősítése, a szolgáltatásokhoz való hozzáférés megkönnyítése, helyben történő biztosítása.',
                'A projekt a Széchenyi Terv Plusz program keretében valósul meg.')
        ].join('\n')
    }));
}

// VF-038 / VF-039: first camp in 2000; "20 segítő" out until it's clarified.
async function rolunk() {
    await patch('pages', 'rolunk', [
        ['23 éve Kerecsenden', '26 éve Kerecsenden'],
        ['23 évvel ezelőtt', '26 évvel ezelőtt'],
        ['negyvenöt önkéntessel, húsz segítővel és számos', 'negyvenöt önkéntessel és számos']
    ]);
    await patch('pages', 'idovonal-1', [['2003', '2000']]);
    await patch('pages', 'idovonal-4', [['önkéntes és húsz segítő ma', 'önkéntes ma']]);

    // VF-037: the seeded Rólunk photo was a 1200px copy – swap in the full-resolution one
    const page = await get('pages', 'rolunk');
    if (page?.feature_image && /\/csapat-fuben(-\d+)?\.jpg$/.test(page.feature_image)) {
        if (DRY) return log(write('replace Rólunk photo with the high-res version'));
        const src = await upload(path.join(ROOT, 'theme/assets/images/photos/csapat-fuben.jpg'), 'rolunk-csapat-2000.jpg');
        await api('PUT', `/pages/${page.id}/`, { pages: [{ feature_image: src, updated_at: page.updated_at }] });
        log('Rólunk photo replaced (high-res)');
    }
}

// VF-071: the Rólunk "Értékeink" section only shows published #ertek pages. While any value still has
// placeholder text, all of them stay drafts; publish them in Ghost Admin once the texts are written.
async function ertekek() {
    const { pages } = await api('GET', '/pages/?filter=' + encodeURIComponent('tag:hash-ertek+status:published') + '&limit=all&fields=id,slug,custom_excerpt,updated_at');
    if (!pages.length) return log('Értékeink: no published value pages – section hidden');
    if (!pages.some((pg) => !pg.custom_excerpt || PLACEHOLDER.test(pg.custom_excerpt))) return log('Értékeink: all texts written – section shown');
    for (const pg of pages) {
        if (DRY) { log(write(`set value page ${pg.slug} to draft`)); continue; }
        await api('PUT', `/pages/${pg.id}/`, { pages: [{ status: 'draft', updated_at: pg.updated_at }] });
        log(`value page → draft: ${pg.slug}`);
    }
}

// --- Futás kampány (VF-067) --------------------------------------------------------------------
// /futas/ uses page-futas.hbs. Progress = TITLE of the hidden "futas-gyujtes" page (everything NOT paid by card on
// the site, e.g. bank transfers – confirmed amounts only, by hand) + card donations, live from Stripe (donate-api).
const FUTAS_IMG = path.join(ROOT, 'content/futas/kezenallas.jpg');
const FUTAS_COUNTER_NOTE = 'CÍM = a NEM a honlapon, kártyával érkezett összeg forintban (átutalások, korábbi gyűjtés – csak ellenőrzött összeg!), pl. 350 000. A honlapon kártyával adott adományokat a /futas/ oldal magától hozzáadja a Stripe-ból – azokat ide ne írd be!';
const NOTICE_TEXT = '*Futás kampány* A célunk felét közösen elértük! Október 16-án Budapestről Kerecsendig futunk váltóban, hogy a második felét is összegyűjtsük. Fuss velünk – támogasd te is!';

async function futas() {
    await upsert('pages', 'futas', async (old) => ({
        title: 'Futni is fogunk, hogy *világíthassunk!*',
        meta_title: 'Futni is fogunk, hogy világíthassunk! – adománygyűjtő váltófutás',
        meta_description: 'A 18 milliós cél felét közösen elértük! Október 16-án önkénteseink Budapestről Kerecsendig futnak váltóban, hogy a második felét is összegyűjtsük. Támogasd te is!',
        custom_excerpt: 'Adománygyűjtő váltófutás Budapestről Kerecsendre',
        ...(existsSync(FUTAS_IMG) && !old?.feature_image ? { feature_image: await upload(FUTAS_IMG), feature_image_alt: 'Kézenálló kisfiú árnyéka az úton, a kerecsendi templom rajzával' } : {}),
        html: [
            P('Csupaszív és elkötelezett önkénteseink ezúttal sem ismernek lehetetlent!',
                'A Világítani Fogok Egyesülettel hiszünk abban, hogy minden gyermek egyaránt értékes. Célunk ezért a kerecsendi nehéz sorsú családok, különösen a gyerekek életesélyeinek növelése, közösségteremtés és a tágabb társadalom felelősségvállalásának erősítése.',
                'Az elmúlt hónapokban a megmaradásunkért küzdöttünk, mert az állami programok szerződés szerinti támogatásai ismét hosszú hónapokat késtek. Feléltük a tartalékainkat, veszélybe került a teljes működésünk. Az Egyesületnek és a családoknak biztonságra van szüksége, ezért három havi működési költségünk, <strong>összesen 18 millió forint</strong> összegyűjtését tűztük ki célul, hogy a működési tartalékkal a kerecsendi gyerekek és családok támogatását kiszámíthatóan folytathassuk. A támogatásotokkal már <strong>több mint 9 millió forint összegyűlt: a célunk felét közösen elértük!</strong> Hálásak vagyunk mindenkinek, aki hozzájárult.'),
            H2('Most azért indulunk útnak, hogy a második felét is összegyűjtsük.'),
            P('Önkénteseink újra nagyot álmodtak: <strong>október 16-án Budapestről kora reggeltől egészen Kerecsendig fognak futni váltóban</strong>, hogy felhívják a figyelmet munkánk fontosságára és segítsenek a cél második felét összegyűjteni!')
        ].join('\n')
    }));
    // feature image arrives later than the page → add it once, never replace an editor's choice
    const page = await get('pages', 'futas');
    if (page && !page.feature_image && existsSync(FUTAS_IMG)) {
        if (DRY) log(write('add the Futás photo'));
        else {
            await api('PUT', `/pages/${page.id}/`, { pages: [{ feature_image: await upload(FUTAS_IMG), feature_image_alt: 'Kézenálló kisfiú árnyéka az úton, a kerecsendi templom rajzával', updated_at: page.updated_at }] });
            log('Futás photo added');
        }
    } else if (!existsSync(FUTAS_IMG)) log('content/futas/kezenallas.jpg missing – /futas/ has no photo yet');

    const counter = await get('pages', 'futas-gyujtes');
    if (counter) {
        // the unconfirmed 9 000 000 we seeded goes back to 0; any other value was typed in by someone – keep it
        const next = { ...(counter.custom_excerpt !== FUTAS_COUNTER_NOTE ? { custom_excerpt: FUTAS_COUNTER_NOTE } : {}), ...(counter.title === '9 000 000' ? { title: '0' } : {}) };
        if (!Object.keys(next).length) return log(`page /futas-gyujtes/ exists (manual amount: ${counter.title})`);
        if (DRY) return log(write(`update futas-gyujtes: ${Object.keys(next).join(', ')}`));
        await api('PUT', `/pages/${counter.id}/`, { pages: [{ ...next, updated_at: counter.updated_at }] });
        return log(`futas-gyujtes updated: ${Object.keys(next).join(', ')}${next.title ? ' (unconfirmed 9 000 000 → 0)' : ''}`);
    }
    if (DRY) return log(write('create hidden page futas-gyujtes (amount 0)'));
    await api('POST', '/pages/', { pages: [{
        title: '0', slug: 'futas-gyujtes', status: 'published', tags: [{ name: '#blokk' }],
        custom_excerpt: FUTAS_COUNTER_NOTE
    }] });
    log('page created: futas-gyujtes (amount 0)');
}

// --- Közlemény post (VF-036) -------------------------------------------------------------------
const KOZLEMENY_SLUG = 'vilagithatunk-a-megmaradasunkert-kuzdunk';

async function kozlemeny() {
    await upsert('posts', KOZLEMENY_SLUG, async (old) => ({
        title: 'Világíthatunk? A megmaradásunkért küzdünk',
        custom_excerpt: 'Rossz hírünk van: a megmaradásunkért küzdünk, hogy tovább támogathassuk a kerecsendi családokat.',
        featured: true,
        tags: [{ slug: 'kozlemeny', name: 'Közlemény' }],
        ...(old ? {} : { published_at: new Date('2026-09-15T09:00:00+02:00').toISOString() }),
        feature_image: old?.feature_image || await upload(path.join(ROOT, 'theme/assets/images/photos/olelkezes.jpg')),
        html: [
            `<figure class="kg-card kg-image-card"><img src="${await upload(path.join(ROOT, 'content/vilagithatunk.jpg'))}" alt="Világíthatunk?" width="1400" height="1400"></figure>`,
            P('Az állami programok szerződés szerinti forrásai már hosszú hónapok óta késnek. A hiányt sokáig saját forrásból igyekeztünk áthidalni, ez azonban már nem fenntartható: változás nélkül a feladatainkat nem tudjuk tovább ellátni.',
                '<strong>Munkánkat több évtizede végezzük Kerecsenden</strong>, kezdetben lazábban szervezett csapatként, majd a civil szerveződésből közhasznú egyesületté válva. 2020-tól pedig a Belügyminisztérium és a Magyar Máltai Szeretetszolgálat által közvetített Felzárkózó Települések Program (FeTe) helyi megvalósítójaként dolgozunk.',
                'Hitvallásunk szerint célunk a Kerecsenden nagy számban élő nehéz sorsú, magukra maradt emberek, különösen a gyerekek életesélyeinek növelése, közösségteremtés és a tágabb társadalom felelősségvállalásának erősítése – azért, hogy mindannyian aktív, egyenrangú, alkotó és szabad tagjaivá válhassunk a társadalomnak.',
                'Munkatársaink alapos kiválasztási folyamat eredményeként dolgoznak velünk. Többen közülük a mi támogatásunkkal szereztek megfelelő végzettséget, szerteágazó szociális munkát végeznek. A gyermekek fejlődését már magzati kortól követjük: a helyi roma közösségből származó családmentorok figyelnek az édesanyák és gyermekeik egészségére, fejlődésére. Áldozatos, védőnőket támogató munkájuknak köszönhetően számos csecsemő hazagondozását sikerült megoldani, és reménytelen családi körülmények közé születő babák is családba kerülhettek nyílt örökbeadás támogatásával, ahelyett, hogy a kórházban maradtak volna. Az óvodás- és iskoláskorúakat pszichológus és fejlesztőpedagógus segíti. A felnőtt családtagokat adósságtanácsadással, munkaerőpiaci mentorálással, egészségügyi szűrésekkel, lakhatási és kertprogrammal, szükség esetén drogprevencióval támogatjuk önálló életvezetésük kialakításában. A falu egész közösségét köztisztasági programmal segítjük élhetőbb élettérhez, szabadidős programjaink, nyári napközink és táboraink pedig lassan a település minden korosztályát elérik.',
                '<strong>Egyesületünk munkája sajnos nem kis részben a hiányzó vagy elégtelen állami szolgáltatások pótlását, kiegészítését jelenti.</strong>',
                'Munkánk néhány év alatt komplex rendszerré épült; a hiányok betöltésére saját elemekkel bővítettük, és több olyan korábbi FeTe-programelem finanszírozását is átvállaltuk, amelyet a program már nem tudott tovább finanszírozni. Hisszük és tapasztaljuk, hogy minden szociális támogatás és fejlesztő tevékenység alapja a hosszú távú kiszámíthatóság.',
                'A FeTe forrásai, amik a megvalósító szervezetekhez jutottak, eleve szűkösek voltak a problémák nagyságához képest, ráadásul a program finanszírozása a kezdeti, tisztán hazai forrásokról később uniós alapokra terelődött át. Ez komoly likviditási kockázatokat és szakmai nehézségeket eredményezett. Az eredeti támogatási összeg 2020 óta nem változott, miközben jelentősen emelkedett a minimálbér, a rezsi, a programok eszközeinek és az élelmiszereknek az ára. Mára a kezdeti támogatás a bérek kifizetésére is kevés.',
                'Ezért plusz forrásokat kellett keresnünk.',
                'Ez nagy kihívás volt egy olyan környezetben, ahol a civil szervezetek finanszírozási lehetőségei és működési keretei egyre szűkebb, főként állami keretek közé szorultak, miközben a független, kritikus vagy külföldi donorokra támaszkodó szervezetek súlyos adminisztratív és politikai korlátozásokkal szembesültek. Ezért – hogy ne kerüljünk „fekete listára” és így tovább segíthessük támogatottjainkat – sok más civil szervezethez hasonlóan főként az állami szférából érkező forrásokat kellett felkutatnunk és megpályáznunk.',
                'A fejlesztő programok működtetését rendszeres gyűjtéseink mellett a TOP Plusz program és a Nemzeti Bűnmegelőzési Tanáccsal való együttműködés tette lehetővé; a TOP Pluszban a Kerecsendi Önkormányzat konzorciumi partnereként veszünk részt, az NBT egyedi támogatásai pedig számos, gyermekek javára megvalósuló programot és fejlesztést támogattak.',
                'A TOP Plusz program utófinanszírozású. Bár a szerződés szerint még nem járt le a folyósítási határidő, a helyzet azért vált tarthatatlanná, mert a FeTe Programmal egy időben, három hónapja ezt a forrást is előfinanszíroznunk kell.',
                'A Nemzeti Bűnmegelőzési Tanács átalakításával egy már befogadott egyedi kérelemben szereplő, 10 millió forintos fejlesztési támogatás sorsa is bizonytalanná vált. Emiatt szeptembertől nem tudjuk folytatni gyógypedagógusunk és főállású munkaerőpiaci mentorunk munkáját – utóbbi szolgáltatás a FeTe keretei között is megszűnt –, nem tudjuk folytatni a hátrányos helyzetű gyermekek környezetvédelmi és köztisztasági csoportfoglalkozásait, és nem valósulhat meg munkatársaink Alapozó terápiás és KRISZKÁD képzése sem.',
                'Közép- és hosszú távú stratégiai célunk éppen ezért az Egyesület anyagi függetlenedése: szeretnénk, ha működésünk nem lenne kiszolgáltatva egy-egy támogatási rendszer változásainak és a finanszírozások csúszásának.',
                'Most azonban kritikus helyzetbe kerültünk.',
                'A Felzárkózó Települések Programot mintegy 9,1 millió, a TOP Plusz-t pedig mintegy 3,7 millió forinttal, saját forrásunkból előfinanszíroztuk. <strong>Mostanra minden saját tartalékunkat felhasználtuk.</strong>',
                'Ezek a tartalékok ráadásul nem felesleges pénzek: amellett, hogy ezek képeznek likviditási tartalékot az utófinanszírozásos pályázatokhoz, ebből fedezzük a Jelenlét Pont rezsiköltségeit, tartjuk fenn az egyetlen szolgálati autónkat, ebből tudjuk a krízisalapunkat kiegészíteni (amelyből azonnali segítséget tudunk nyújtani a családoknak – és előttünk a tél, amikor a krízisszám ugrásszerűen megnövekszik). Ebből a tartalékból finanszírozzuk a szabadidős foglalkozások jelentős részét, ebből kell szervezetünket fejlesztenünk és a belső képzéseinket biztosítanunk. Minderre most, ha a helyzet nem változik, nem lesz lehetőségünk.',
                '<strong>A likviditási probléma lehetetlen döntés elé állít minket.</strong> Ha folytatjuk a munkát anélkül, hogy biztosan tudnánk fizetni a kollégákat, annak a Btk. 373. §-a alapján akár rosszhiszemű foglalkoztatásként, csalásként való minősítés is lehet a következménye. Ha viszont leállunk, a pályázatokban vállalt feladatok elmulasztásával szegünk szerződést. Bármelyik utat választjuk, az Egyesület és munkatársaink kerülnek veszélybe – önhibánkon kívül.',
                'A helyzet rendezése érdekében a Szociális és Családügyi Minisztériumot és országgyűlési képviselőnket is megkerestük – válaszukra várunk. Közben mindent megteszünk, hogy csökkentsük a kiadásokat: néhány kisebb, nem pótolhatatlan programelemet ideiglenesen felfüggesztettünk, és munkatársaink, bár félve néznek a következő időszak elé, rendületlenül dolgoznak, sokszor saját, szerény fizetésükből vásárolva élelmet, hozzávalókat a gyerekprogramokhoz.'),
            H2('Mi válik semmivé, ha a helyzet nem rendeződik?'),
            P('Havonta átlagosan 300 ügyfél fordul hozzánk segítségért. Adósságkezelésben eddig 150 család kért támogatást. Munkaerőpiaci mentorunk több mint 200 ügyféllel foglalkozott, és több képzést is megszervezett. Jelenleg munkatársaink 10 várandóst és több mint 60, 0–3 éves kisgyermeket és családját kísérik. Programjaink és fejlesztéseink összességében mintegy 170 gyermeket érintenek. Éjszakai Klubunkat 20-30 fiatal látogatja, kertprogramunkban 45 család vesz részt, az idős korosztályt segítő alkalmakon 10-30 fővel dolgozunk.',
                '<strong>A Világítani Fogok Egyesület a lehetőségei végére ért. Nincs tovább.</strong> Ha ellehetetlenül mindaz, amit megfeszített munkával építünk, a veszteség éppen a legkiszolgáltatottabbakat – a kerecsendi gyerekeket és családokat – fogja legsúlyosabban érinteni.',
                'A jelenlegi helyzetben nincs más választásunk: <strong>a nyilvánossághoz fordulunk, és gyűjtést indítunk</strong>, hogy a pótolhatatlan munkát végző munkatársainkat a következő hónapokban is fizetni tudjuk, tartalékainkat visszapótoljuk – amíg reményeink szerint a szerződéses forrásaink rendeződnek.',
                '<strong>Köszönjük, hogy ügyünk mellé állsz, hírünket viszed és támogatsz minket!</strong>',
                '<em>A Világítani Fogok Egyesület vezetősége</em>'),
            H2('Így segíthetsz'),
            P('<a href="/tamogatas/">Bankkártyás adomány – egyszeri vagy havi →</a>',
                'Átutalással: 11711096-21456499 (OTP Bank Nyrt.)<br>Közlemény: <em>világíthatunk? támogatás</em>')
        ].join('\n')
    }));
}

// Sample posts from the seed must not go live. They become drafts (nothing is deleted).
async function draftSamples() {
    const { posts } = await api('GET', '/posts/?filter=status:published&limit=all&formats=html&fields=id,slug,html,updated_at');
    for (const p of posts) {
        if (p.slug === KOZLEMENY_SLUG || !/Ez egy minta-bejegyzés/.test(p.html || '')) continue;
        if (DRY) { log(write(`unpublish sample post ${p.slug}`)); continue; }
        await api('PUT', `/posts/${p.id}/`, { posts: [{ status: 'draft', updated_at: p.updated_at }] });
        log(`sample post → draft: ${p.slug}`);
    }
}

// Notice bar → the Futás campaign (VF-067). *label* at the start of the text is shown in bold. Integrations may not be allowed to change theme settings;
// then it prints what to set by hand.
async function notice() {
    const link = '/futas/';
    const text = NOTICE_TEXT;
    const manual = () => log(`set by hand: Design → Theme settings → show_notice = on, notice_link = ${link}, notice_text = ${text}`);
    try {
        const { custom_theme_settings: list } = await api('GET', '/custom_theme_settings/');
        const val = (k) => list.find((s) => s.key === k)?.value;
        if (val('notice_link') === link && val('show_notice') === true && val('notice_text') === text) return log('notice bar already points to the campaign');
        if (DRY) return log(write(`turn the notice bar on and point it to ${link}`));
        const next = { notice_link: link, show_notice: true, notice_text: text };
        const updated = list.map(({ key, value }) => ({ key, value: key in next ? next[key] : value }));
        await api('PUT', '/custom_theme_settings/', { custom_theme_settings: updated });
        log(`notice bar on → ${link}`);
    } catch (e) {
        if (e.status === 403 || e.status === 401) return manual();
        throw e;
    }
}

// --- run ---------------------------------------------------------------------------------------
try {
    console.log(`Content → ${URL_}${DRY ? '  (dry run, nothing is written)' : ''}${FORCE ? '  (--force)' : ''}${ONLY.length ? `  (only: ${ONLY.join(', ')})` : ''}`);
    await login();
    console.log('Pages');
    await run('tevekenysegunk', tevekenysegunk);
    await run('kapcsolat', kapcsolat);
    await run('atlathatosag', atlathatosag);
    await run('adatvedelem', adatvedelem);
    await run('top-plusz', topPlusz);
    await run('galeria', galeria);
    await run('rolunk', rolunk);
    await run('ertekek', ertekek);
    await run('futas', futas);
    console.log('Napló');
    await run('kozlemeny', kozlemeny);
    await run('samples', draftSamples);
    console.log('Theme settings');
    await run('notice', notice);
    console.log('\nDone ✓');
} catch (e) {
    console.error('\n✗', e.message);
    process.exit(1);
}
