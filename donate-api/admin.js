// Organisers' page: every card donation from Stripe, filterable by campaign, source, frequency and date.
//   GET /admin/                 the page (HTML, no external files)
//   GET /admin/donations.json   the rows (donations.js); ?fresh=1 skips the 1-minute cache
// Password = ADMIN_PASSWORD, asked by the browser (HTTP Basic auth, any user name). Empty = page off (404).
// On the site: https://<domain>/api/donate/admin/
import { listDonations } from './donations.js';
import { isToken } from './track.js';

export async function adminRoute(req, res, pathname, env) {
    if (!env.ADMIN_PASSWORD || req.method !== 'GET') return plain(res, 404, 'Not found');
    if (!authorised(req, env.ADMIN_PASSWORD)) {
        await new Promise((r) => setTimeout(r, 1000)); // slows down guessing
        return plain(res, 401, 'Jelszó szükséges', { 'WWW-Authenticate': 'Basic realm="VF adomanyok", charset="UTF-8"' });
    }
    // relative links on the page need the trailing slash
    if (pathname === '/admin') return plain(res, 301, '', { Location: 'admin/' });
    if (pathname === '/admin/') {
        res.writeHead(200, { ...HEADERS, 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': CSP });
        return res.end(PAGE);
    }
    if (pathname === '/admin/donations.json') {
        try {
            const fresh = new URL(req.url, 'http://x').searchParams.get('fresh') === '1';
            const data = await listDonations(env, { fresh });
            res.writeHead(200, { ...HEADERS, 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify(data));
        } catch (err) {
            console.error('[admin]', err.message);
            res.writeHead(502, { ...HEADERS, 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({ error: 'Stripe: ' + err.message }));
        }
    }
    return plain(res, 404, 'Not found');
}

function authorised(req, password) {
    const m = /^Basic\s+(\S+)$/i.exec(req.headers.authorization || '');
    if (!m) return false;
    const decoded = Buffer.from(m[1], 'base64').toString('utf8');
    return isToken(decoded.slice(decoded.indexOf(':') + 1), password);
}

const HEADERS = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY' };
const CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'";

function plain(res, status, text, extra = {}) {
    res.writeHead(status, { ...HEADERS, 'Content-Type': 'text/plain; charset=utf-8', ...extra });
    res.end(text);
}

const PAGE = `<!doctype html>
<html lang="hu">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Adományok – Világítani Fogok</title>
<style>
  :root { --bg: #f7f5f0; --card: #fff; --ink: #1d1d1b; --muted: #6b6860; --line: #e3dfd5; --accent: #e8a33d; --bad: #b3261e; }
  @media (prefers-color-scheme: dark) { :root { --bg: #18181a; --card: #222225; --ink: #ececea; --muted: #a09d96; --line: #36363a; --bad: #f2867d; } }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 1200px; margin: 0 auto; padding: 20px 16px 48px; }
  header { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px 16px; margin-bottom: 16px; }
  h1 { font-size: 22px; margin: 0; }
  .meta { color: var(--muted); font-size: 13px; }
  .badge { display: inline-block; padding: 1px 8px; border-radius: 99px; font-size: 12px; font-weight: 600; background: var(--accent); color: #1d1d1b; }
  .badge.test { background: #8ab4f8; }
  button, .btn { font: inherit; padding: 6px 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--card); color: var(--ink); cursor: pointer; }
  button:hover { border-color: var(--muted); }
  .filters { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 14px; }
  .filters label, .filters legend { display: block; font-size: 12px; color: var(--muted); margin-bottom: 4px; }
  .filters fieldset { border: 0; padding: 0; margin: 0; }
  .filters input[type=date], .filters input[type=search], .filters select { width: 100%; font: inherit; padding: 5px 8px; border: 1px solid var(--line); border-radius: 8px; background: var(--bg); color: var(--ink); }
  .checks label { display: inline-flex; gap: 4px; align-items: center; color: var(--ink); font-size: 14px; margin: 0 10px 2px 0; }
  .presets { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 8px; }
  .presets button { font-size: 13px; padding: 4px 10px; }
  .totals { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin: 16px 0; }
  .tile { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; }
  .tile b { display: block; font-size: 22px; font-variant-numeric: tabular-nums; }
  .tile span { color: var(--muted); font-size: 13px; }
  .scroll { overflow-x: auto; background: var(--card); border: 1px solid var(--line); border-radius: 12px; }
  table { border-collapse: collapse; width: 100%; font-size: 14px; }
  th, td { padding: 7px 10px; border-bottom: 1px solid var(--line); text-align: left; white-space: nowrap; }
  th { font-size: 12px; color: var(--muted); font-weight: 600; position: sticky; top: 0; background: var(--card); }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  tr:last-child td { border-bottom: 0; }
  .refund { color: var(--bad); }
  .tag { display: inline-block; padding: 0 7px; border-radius: 6px; background: var(--bg); border: 1px solid var(--line); font-size: 12px; }
  a { color: inherit; }
  #error { color: var(--bad); margin: 12px 0; }
  h2 { font-size: 15px; margin: 24px 0 8px; }
  .row { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
</style>
</head>
<body>
<main>
  <header>
    <h1>Adományok</h1>
    <span id="mode" class="badge" hidden></span>
    <span class="meta" id="updated">Betöltés…</span>
    <button id="refresh" type="button">Frissítés</button>
  </header>

  <form class="filters" id="filters" onsubmit="return false">
    <div><label for="from">Dátumtól</label><input type="date" id="from" name="from"></div>
    <div><label for="to">Dátumig</label><input type="date" id="to" name="to"></div>
    <fieldset><legend>Kampány</legend><div class="checks" id="campaigns"></div></fieldset>
    <div><label for="source">Honnan</label>
      <select id="source" name="source">
        <option value="">Mind</option>
        <option value="box">Az oldal adománydoboza</option>
        <option value="other">Máshonnan (Stripe-ban kézzel, régi oldal…)</option>
      </select></div>
    <div><label for="frequency">Gyakoriság</label>
      <select id="frequency" name="frequency">
        <option value="">Mind</option>
        <option value="once">Egyszeri</option>
        <option value="monthly">Havi (minden befizetett hónap)</option>
      </select></div>
    <div><label for="q">Keresés (név, e-mail, azonosító)</label><input type="search" id="q" name="q"></div>
    <div class="presets">
      <button type="button" data-preset="all">Minden</button>
      <button type="button" data-preset="futas">Csak Futás</button>
      <button type="button" data-preset="notfutas">Minden, ami nem Futás</button>
      <button type="button" data-preset="boxonce">Egyszeri, adománydobozból, kampány nélkül</button>
    </div>
  </form>

  <div id="error" role="alert" hidden></div>

  <section class="totals" aria-label="Összesen">
    <div class="tile"><b id="t-net">–</b><span>Nettó (visszatérítés után)</span></div>
    <div class="tile"><b id="t-count">–</b><span>Befizetés</span></div>
    <div class="tile"><b id="t-gross">–</b><span>Bruttó</span></div>
    <div class="tile"><b id="t-refund">–</b><span>Visszatérítve</span></div>
  </section>

  <div class="row"><h2>Bontás</h2></div>
  <div class="scroll"><table id="breakdown"><thead><tr><th>Kampány</th><th>Honnan</th><th>Gyakoriság</th><th class="num">Db</th><th class="num">Nettó</th></tr></thead><tbody></tbody></table></div>

  <div class="row"><h2 id="list-title">Befizetések</h2><button id="csv" type="button">CSV letöltése</button></div>
  <div class="scroll"><table id="list"><thead><tr><th>Dátum</th><th class="num">Összeg</th><th class="num">Visszat.</th><th>Gyakoriság</th><th>Kampány</th><th>Honnan</th><th>Név</th><th>E-mail</th><th>Stripe</th></tr></thead><tbody></tbody></table></div>
  <p class="meta">Csak a Stripe-on át érkezett kártyás adományok. Az átutalások nincsenek benne. A havi támogatások minden befizetett hónapja külön sor, a kampányt és a forrást az előfizetéstől kapják.</p>
</main>
<script>
(function () {
  var NONE = '(nincs)';
  var data = { rows: [], mode: '' };
  var $ = function (id) { return document.getElementById(id); };
  var fmt = function (n) { return Math.round(n).toLocaleString('hu-HU') + ' Ft'; };
  var day = function (iso) { return new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Europe/Budapest' }); };
  var when = function (iso) { return new Date(iso).toLocaleString('hu-HU', { timeZone: 'Europe/Budapest', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); };
  var srcLabel = function (r) { return r.source === 'vf-ghost-donate-box' ? 'adománydoboz' : (r.source || 'máshonnan'); };
  var freqLabel = function (f) { return f === 'monthly' ? 'havi' : 'egyszeri'; };

  // filters live in the URL hash, so a filtered view can be bookmarked
  function readState() {
    var p = new URLSearchParams(location.hash.slice(1));
    return { from: p.get('from') || '', to: p.get('to') || '', source: p.get('source') || '', frequency: p.get('frequency') || '',
             q: p.get('q') || '', hide: (p.get('hide') || '').split(',').filter(Boolean) };
  }
  function writeState(s) {
    var p = new URLSearchParams();
    ['from', 'to', 'source', 'frequency', 'q'].forEach(function (k) { if (s[k]) p.set(k, s[k]); });
    if (s.hide.length) p.set('hide', s.hide.join(','));
    history.replaceState(null, '', '#' + p.toString());
  }
  function formState() {
    var hide = [];
    Array.prototype.forEach.call(document.querySelectorAll('#campaigns input'), function (c) { if (!c.checked) hide.push(c.value); });
    return { from: $('from').value, to: $('to').value, source: $('source').value, frequency: $('frequency').value, q: $('q').value.trim(), hide: hide };
  }
  function applyState(s) {
    $('from').value = s.from; $('to').value = s.to; $('source').value = s.source; $('frequency').value = s.frequency; $('q').value = s.q;
    Array.prototype.forEach.call(document.querySelectorAll('#campaigns input'), function (c) { c.checked = s.hide.indexOf(c.value) < 0; });
  }

  function campaignsOf(rows) {
    var seen = {};
    rows.forEach(function (r) { seen[r.campaign || NONE] = 1; });
    return Object.keys(seen).sort(function (a, b) { return a === NONE ? -1 : b === NONE ? 1 : a.localeCompare(b); });
  }
  function buildCampaigns() {
    var box = $('campaigns');
    box.textContent = '';
    campaignsOf(data.rows).forEach(function (c) {
      var label = document.createElement('label');
      var input = document.createElement('input');
      input.type = 'checkbox'; input.value = c; input.checked = true;
      label.appendChild(input);
      label.appendChild(document.createTextNode(c === NONE ? 'nincs kampány' : c));
      box.appendChild(label);
    });
  }

  function filtered(s) {
    var q = s.q.toLowerCase();
    return data.rows.filter(function (r) {
      var d = day(r.date);
      if (s.from && d < s.from) return false;
      if (s.to && d > s.to) return false;
      if (s.hide.indexOf(r.campaign || NONE) >= 0) return false;
      if (s.source === 'box' && r.source !== 'vf-ghost-donate-box') return false;
      if (s.source === 'other' && r.source === 'vf-ghost-donate-box') return false;
      if (s.frequency && r.frequency !== s.frequency) return false;
      if (q && (r.name + ' ' + r.email + ' ' + r.id + ' ' + r.subscription).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }

  function cell(tr, text, cls) { var td = document.createElement('td'); td.textContent = text; if (cls) td.className = cls; tr.appendChild(td); return td; }

  function render() {
    var s = formState();
    writeState(s);
    var rows = filtered(s);
    var gross = 0, refund = 0;
    rows.forEach(function (r) { gross += r.amount; refund += r.refunded; });
    $('t-net').textContent = fmt(gross - refund);
    $('t-count').textContent = rows.length.toLocaleString('hu-HU');
    $('t-gross').textContent = fmt(gross);
    $('t-refund').textContent = fmt(refund);
    $('list-title').textContent = 'Befizetések (' + rows.length + ')';

    var groups = {};
    rows.forEach(function (r) {
      var k = [r.campaign || 'nincs kampány', srcLabel(r), freqLabel(r.frequency)].join('\\u0000');
      (groups[k] = groups[k] || { n: 0, net: 0 }); groups[k].n++; groups[k].net += r.net;
    });
    var bt = document.querySelector('#breakdown tbody');
    bt.textContent = '';
    Object.keys(groups).sort().forEach(function (k) {
      var tr = document.createElement('tr');
      k.split('\\u0000').forEach(function (v) { cell(tr, v); });
      cell(tr, groups[k].n, 'num'); cell(tr, fmt(groups[k].net), 'num');
      bt.appendChild(tr);
    });

    var tb = document.querySelector('#list tbody');
    tb.textContent = '';
    var dash = 'https://dashboard.stripe.com/' + (data.mode === 'test' ? 'test/' : '') + 'payments/';
    rows.forEach(function (r) {
      var tr = document.createElement('tr');
      cell(tr, when(r.date));
      cell(tr, fmt(r.amount), 'num');
      cell(tr, r.refunded ? '−' + fmt(r.refunded) : '', 'num refund');
      cell(tr, freqLabel(r.frequency));
      var c = cell(tr, ''); if (r.campaign) { var t = document.createElement('span'); t.className = 'tag'; t.textContent = r.campaign; c.appendChild(t); }
      cell(tr, srcLabel(r));
      cell(tr, r.name);
      cell(tr, r.email);
      var a = document.createElement('a'); a.href = dash + encodeURIComponent(r.id); a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = 'megnyitás';
      cell(tr, '').appendChild(a);
      tb.appendChild(tr);
    });
  }

  function csv() {
    var head = ['datum', 'osszeg_ft', 'visszateritve_ft', 'netto_ft', 'gyakorisag', 'kampany', 'forras', 'nev', 'email', 'stripe_id', 'elofizetes'];
    var esc = function (v) { v = String(v == null ? '' : v); if (/^[=+\\-@\\t\\r]/.test(v)) v = "'" + v; return /[",;\\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var lines = [head.join(',')].concat(filtered(formState()).map(function (r) {
      return [when(r.date), r.amount, r.refunded, r.net, freqLabel(r.frequency), r.campaign, srcLabel(r), r.name, r.email, r.id, r.subscription].map(esc).join(',');
    }));
    var blob = new Blob(['\\ufeff' + lines.join('\\r\\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'adomanyok-' + day(new Date().toISOString()) + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
  }

  var PRESETS = {
    all: function () { return { hide: [], source: '', frequency: '' }; },
    futas: function () { return { hide: campaignsOf(data.rows).filter(function (c) { return c !== 'futas'; }), source: '', frequency: '' }; },
    notfutas: function () { return { hide: ['futas'], source: '', frequency: '' }; },
    boxonce: function () { return { hide: campaignsOf(data.rows).filter(function (c) { return c !== NONE; }), source: 'box', frequency: 'once' }; }
  };

  function load(fresh) {
    $('updated').textContent = 'Betöltés…';
    $('error').hidden = true;
    return fetch('donations.json' + (fresh ? '?fresh=1' : ''), { credentials: 'same-origin' })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || r.status); return d; }); })
      .then(function (d) {
        var state = location.hash.length > 1 ? readState() : formState();
        data = d;
        buildCampaigns();
        applyState(state);
        $('mode').hidden = false;
        $('mode').textContent = d.mode === 'live' ? 'éles' : d.mode === 'test' ? 'teszt' : 'nincs Stripe-kulcs';
        $('mode').className = 'badge' + (d.mode === 'live' ? '' : ' test');
        $('updated').textContent = 'Frissítve: ' + when(d.updated);
        render();
      })
      .catch(function (err) { $('error').textContent = 'Nem sikerült betölteni: ' + err.message; $('error').hidden = false; $('updated').textContent = ''; });
  }

  $('filters').addEventListener('input', render);
  $('filters').addEventListener('change', render);
  window.addEventListener('hashchange', function () { applyState(readState()); render(); });
  $('refresh').addEventListener('click', function () { load(true); });
  $('csv').addEventListener('click', csv);
  Array.prototype.forEach.call(document.querySelectorAll('[data-preset]'), function (b) {
    b.addEventListener('click', function () {
      var p = PRESETS[b.getAttribute('data-preset')]();
      var s = formState();
      s.hide = p.hide; s.source = p.source; s.frequency = p.frequency;
      applyState(s); render();
    });
  });
  load(false);
})();
</script>
</body>
</html>`;
