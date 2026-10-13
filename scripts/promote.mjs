#!/usr/bin/env node
// Copies CONTENT one stage up (local → staging → prod) through the Ghost Admin API: pages, posts, theme
// settings and site settings that we changed on purpose during development and had reviewed.
// Everyday content is edited by the association on prod and flows *down* (backup.sh → restore-staging.sh);
// this script is for the other direction. Code goes up with scripts/release.sh.
//
//   node scripts/promote.mjs <from> <to> <item>... [--apply] [--force]
//     from, to:  local | staging | prod
//     items:     page:<slug>  post:<slug>  theme:<key>  setting:<key>
//   e.g.  node scripts/promote.mjs staging prod page:tamogatas theme:hero_image
//
// Without --apply it only shows what would change. A page/post edited on the target after its last edit on
// the source is skipped (someone changed it there), unless --force. Images, PDFs and media the item uses are
// copied as well (the original upload, not Ghost's resized copy); a file the target already has is reused.
// Links to the source site are rewritten to the target site.
//
// Auth, in .env: <SITE>_ADMIN_API_KEY (Ghost Admin → Settings → Integrations → Add custom integration →
// Admin API key), e.g. STAGING_ADMIN_API_KEY, PROD_ADMIN_API_KEY. local falls back to the seed's owner login.

import { existsSync, readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envFile = path.join(ROOT, '.env');
if (existsSync(envFile)) {
    for (const line of readFileSync(envFile, 'utf8').split('\n')) {
        const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
        if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
    }
}
const env = process.env;

const SITES = {
    local: { url: env.GHOST_URL || 'http://localhost:2368', email: env.GHOST_ADMIN_EMAIL || 'admin@vilagitanifogok.local', password: env.GHOST_ADMIN_PASSWORD || 'Vilagitani-Fogok-2026' },
    staging: { url: 'https://staging.vilagitanifogok.hu' },
    prod: { url: 'https://vilagitanifogok.hu' },
};
for (const [name, s] of Object.entries(SITES)) {
    const P = name.toUpperCase();
    s.name = name;
    s.url = s.url.replace(/\/$/, '');
    s.key = env[`${P}_ADMIN_API_KEY`] || '';
    s.email = env[`${P}_ADMIN_EMAIL`] || s.email;
    s.password = env[`${P}_ADMIN_PASSWORD`] || s.password;
}

// Never copied: they differ per environment on purpose (or are secrets).
const THEME_SKIP = new Set(['donate_api_url']);
const SETTINGS_ALLOWED = new Set(['title', 'description', 'navigation', 'secondary_navigation', 'logo', 'icon', 'cover_image',
    'accent_color', 'meta_title', 'meta_description', 'og_image', 'og_title', 'og_description', 'twitter_image', 'twitter_title',
    'twitter_description', 'codeinjection_head', 'codeinjection_foot', 'facebook', 'twitter', 'locale', 'timezone']);
// Page/post fields that are copied. Authors, dates, ids and slugs stay as they are on the target.
const FIELDS = ['title', 'lexical', 'custom_excerpt', 'status', 'featured', 'visibility', 'custom_template', 'feature_image',
    'feature_image_alt', 'feature_image_caption', 'show_title_and_feature_image', 'meta_title', 'meta_description', 'og_image',
    'og_title', 'og_description', 'twitter_image', 'twitter_title', 'twitter_description', 'codeinjection_head',
    'codeinjection_foot', 'canonical_url'];

// --- args --------------------------------------------------------------------------------------
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const FORCE = args.includes('--force');
const [fromName, toName, ...items] = args.filter((a) => !a.startsWith('--'));
const usage = 'usage: node scripts/promote.mjs <local|staging|prod> <local|staging|prod> page:<slug>|post:<slug>|theme:<key>|setting:<key>... [--apply] [--force]';
if (!SITES[fromName] || !SITES[toName] || fromName === toName || !items.length) { console.error(usage); process.exit(1); }
for (const it of items) if (!/^(page|post|theme|setting):[\w-]+$/.test(it)) { console.error(`✗ bad item "${it}"\n${usage}`); process.exit(1); }

// --- Ghost Admin API client ---------------------------------------------------------------------
function client(site) {
    let cookie = '';
    const token = () => {
        const parts = site.key.trim().split(':');
        const [id, secret] = [parts[0], parts[parts.length - 1]];
        const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
        const now = Math.floor(Date.now() / 1000);
        const unsigned = `${b64({ alg: 'HS256', typ: 'JWT', kid: id })}.${b64({ iat: now, exp: now + 300, aud: '/admin/' })}`;
        return `${unsigned}.${createHmac('sha256', Buffer.from(secret, 'hex')).update(unsigned).digest('base64url')}`;
    };
    async function api(method, p, body, form) {
        const headers = { Origin: site.url, 'Accept-Version': 'v6.0' };
        if (site.key) headers.Authorization = `Ghost ${token()}`;
        else if (cookie) headers.Cookie = cookie;
        if (body !== undefined) headers['Content-Type'] = 'application/json';
        const res = await fetch(`${site.url}/ghost/api/admin${p}`, { method, headers, body: form || (body !== undefined ? JSON.stringify(body) : undefined) });
        const sc = res.headers.get('set-cookie');
        if (sc && !site.key) cookie = sc.split(';')[0];
        const text = await res.text();
        let data = {};
        try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
        if (!res.ok) {
            const err = new Error(`${site.name}: ${method} ${p} → ${res.status} ${data.errors?.[0]?.message || text.slice(0, 200)} ${data.errors?.[0]?.context || ''}`);
            err.status = res.status;
            throw err;
        }
        return data;
    }
    api.login = async () => {
        if (site.key) return;
        if (site.name !== 'local' && !site.password) throw new Error(`${site.name}: set ${site.name.toUpperCase()}_ADMIN_API_KEY in .env`);
        await api('POST', '/session/', { username: site.email, password: site.password });
    };
    return api;
}

const from = SITES[fromName], to = SITES[toName];
const src = client(from), dst = client(to);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// <site>/content/images/size/w600/format/webp/2026/10/x.jpg → kind "images", path "2026/10/x.jpg"
const mediaRe = (site) => new RegExp(`${esc(site.url)}/content/(images|files|media)/(?:size/w\\d+(?:h\\d+)?/(?:format/\\w+/)?)?([^"'\\s)?#\\\\]+)`, 'g');

// --- media ------------------------------------------------------------------------------------------
async function download(site, kind, p) {
    // Ghost keeps the uploaded original as name_o.ext next to its own resized copy: copy the original
    const tries = kind === 'images' ? [p.replace(/(\.\w+)$/, '_o$1'), p] : [p];
    for (const t of tries) {
        const res = await fetch(`${site.url}/content/${kind}/${t}`);
        if (res.ok) return Buffer.from(await res.arrayBuffer());
    }
    return null;
}

const mediaMap = new Map();   // source URL path → target URL
let copied = 0, reused = 0;
async function copyMedia(kind, p) {
    const k = `${kind}/${p}`;
    if (mediaMap.has(k)) return mediaMap.get(k);
    const same = `${to.url}/content/${kind}/${p}`;
    const orig = await download(from, kind, p);
    if (!orig) throw new Error(`${from.name}: /content/${kind}/${p} not found`);
    const there = await download(to, kind, p);
    let url;
    if (there && there.equals(orig)) { url = same; reused++; }
    else if (!APPLY) { url = same; copied++; }
    else {
        const name = path.basename(decodeURIComponent(p));
        const type = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml', pdf: 'application/pdf', mp4: 'video/mp4' }[path.extname(name).slice(1).toLowerCase()] || 'application/octet-stream';
        const form = new FormData();
        form.append('file', new Blob([orig], { type }), name);
        if (kind === 'images') form.append('purpose', 'image');
        const r = await dst('POST', `/${kind}/upload/`, undefined, form);
        url = r[kind][0].url;
        copied++;
    }
    mediaMap.set(k, url);
    return url;
}

// Copies every file a value uses, then points it (and any link to the source site) at the target.
async function carry(value) {
    let json = JSON.stringify(value);
    for (const [, kind, p] of json.matchAll(mediaRe(from))) await copyMedia(kind, p);
    json = json.replace(mediaRe(from), (m, kind, p) => mediaMap.get(`${kind}/${p}`));
    json = json.replaceAll(from.url, to.url);
    return JSON.parse(json);
}

// --- items --------------------------------------------------------------------------------------------
const short = (v) => {
    if (v === null || v === undefined || v === '') return '–';
    const s = typeof v === 'string' ? v : JSON.stringify(v);
    return s.length > 70 ? s.slice(0, 67) + '…' : s;
};
const lexText = (lex) => {
    try {
        const out = [];
        const walk = (n) => { if (n.text) out.push(n.text); (n.children || []).forEach(walk); };
        walk(JSON.parse(lex).root);
        return out.join(' ');
    } catch { return ''; }
};
const lexImages = (lex) => [...String(lex || '').matchAll(/"src":"([^"]+)"/g)].map((m) => path.basename(m[1]));

async function getDoc(api, type, slug) {
    try { return (await api('GET', `/${type}/slug/${slug}/?formats=lexical&include=tags`))[type][0]; }
    catch (e) { if (e.status === 404) return null; throw e; }
}

async function promoteDoc(type, slug) {
    const one = type.slice(0, -1);
    const a = await getDoc(src, type, slug);
    if (!a) return console.log(`✗ ${one} ${slug}: not on ${from.name}`);
    const b = await getDoc(dst, type, slug);
    if (b && new Date(b.updated_at) > new Date(a.updated_at) && !FORCE) {
        return console.log(`! ${one} ${slug}: edited on ${to.name} (${b.updated_at}) after ${from.name} (${a.updated_at}) – skipped, --force overwrites`);
    }
    const doc = {};
    for (const f of FIELDS) if (a[f] !== undefined) doc[f] = a[f];
    doc.tags = (a.tags || []).map((t) => ({ name: t.name, slug: t.slug }));
    const next = await carry(doc);

    const changes = [];
    for (const f of [...FIELDS, 'tags']) {
        if (next[f] === undefined) continue;
        const was = f === 'tags' ? (b?.tags || []).map((t) => t.slug) : b?.[f];
        const now = f === 'tags' ? next.tags.map((t) => t.slug) : next[f];
        if (JSON.stringify(was ?? null) === JSON.stringify(now ?? null)) continue;
        if (f === 'lexical') {
            const [tw, tn] = [lexText(was), lexText(now)];
            const [iw, inn] = [lexImages(was), lexImages(now)];
            const bits = [];
            if (tw !== tn) bits.push(`text ${tw.length} → ${tn.length} chars`);
            if (iw.join() !== inn.join()) bits.push(`images [${iw.join(', ')}] → [${inn.join(', ')}]`);
            changes.push(`content: ${bits.join('; ') || 'formatting/cards'}`);
        } else if (/image$/.test(f)) changes.push(`${f}: ${was ? path.basename(was) : '–'} → ${now ? path.basename(now) : '–'}`);
        else changes.push(`${f}: ${short(was)} → ${short(now)}`);
    }
    if (b && !changes.length) return console.log(`= ${one} ${slug}: same on both`);
    console.log(`${b ? '~' : '+'} ${one} ${slug}${b ? '' : ' (new)'}`);
    changes.forEach((c) => console.log(`    ${c}`));
    if (!APPLY) return;
    if (b) await dst('PUT', `/${type}/${b.id}/`, { [type]: [{ ...next, updated_at: b.updated_at }] });
    else await dst('POST', `/${type}/`, { [type]: [{ ...next, slug }] });
}

async function promoteTheme(keys) {
    const [{ custom_theme_settings: a }, { custom_theme_settings: b }] = await Promise.all([src('GET', '/custom_theme_settings/'), dst('GET', '/custom_theme_settings/')]);
    const out = b.map(({ key, value }) => ({ key, value }));
    let dirty = false;
    for (const key of keys) {
        if (THEME_SKIP.has(key)) { console.log(`✗ theme ${key}: differs per environment, never copied`); continue; }
        const sa = a.find((s) => s.key === key), sb = out.find((s) => s.key === key);
        if (!sa || !sb) { console.log(`✗ theme ${key}: no such theme setting on ${sa ? to.name : from.name}`); continue; }
        const value = await carry(sa.value);
        if (JSON.stringify(value) === JSON.stringify(sb.value)) { console.log(`= theme ${key}: same on both`); continue; }
        const show = (v) => (typeof v === 'string' && v.includes('/content/') ? path.basename(v) : short(v));
        console.log(`~ theme ${key}: ${show(sb.value)} → ${show(value)}`);
        sb.value = value;
        dirty = true;
    }
    if (dirty && APPLY) await dst('PUT', '/custom_theme_settings/', { custom_theme_settings: out });
}

async function promoteSettings(keys) {
    const [{ settings: a }, { settings: b }] = await Promise.all([src('GET', '/settings/'), dst('GET', '/settings/')]);
    const out = [];
    for (const key of keys) {
        if (!SETTINGS_ALLOWED.has(key)) { console.log(`✗ setting ${key}: not on the allow list (secrets, members and payment settings stay per environment)`); continue; }
        const sa = a.find((s) => s.key === key), sb = b.find((s) => s.key === key);
        if (!sa) { console.log(`✗ setting ${key}: not on ${from.name}`); continue; }
        const value = await carry(sa.value);
        if (JSON.stringify(value) === JSON.stringify(sb?.value)) { console.log(`= setting ${key}: same on both`); continue; }
        console.log(`~ setting ${key}: ${short(sb?.value)} → ${short(value)}`);
        out.push({ key, value });
    }
    if (out.length && APPLY) await dst('PUT', '/settings/', { settings: out });
}

// --- run ------------------------------------------------------------------------------------------
console.log(`${APPLY ? 'Promoting' : 'Dry run'}: ${from.name} (${from.url}) → ${to.name} (${to.url})`);
await src.login();
await dst.login();
const pick = (kind) => items.filter((i) => i.startsWith(kind + ':')).map((i) => i.slice(kind.length + 1));
for (const slug of pick('page')) await promoteDoc('pages', slug);
for (const slug of pick('post')) await promoteDoc('posts', slug);
if (pick('theme').length) await promoteTheme(pick('theme'));
if (pick('setting').length) await promoteSettings(pick('setting'));
console.log(`files: ${copied} ${APPLY ? 'copied' : 'to copy'}, ${reused} already on ${to.name}`);
if (!APPLY) console.log('Nothing written. Add --apply to do it.');
