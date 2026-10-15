/* Világítani Fogok – theme JS (vanilla, no build step). */
(function () {
    'use strict';

    var MIN_AMOUNT = 500; // Ft – Stripe minimum for HUF is ~175 Ft; keep a sensible floor.

    function fmt(n) {
        // 5000 → "5 000" (Hungarian thousands separator: non-breaking space)
        return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    }

    function parseAmount(s) {
        var n = parseInt(String(s || '').replace(/\D/g, ''), 10);
        return isNaN(n) ? 0 : n;
    }

    /* ---------------------------------------------------------------- nav */
    function initNav() {
        var toggle = document.querySelector('.nav-toggle');
        var nav = document.getElementById('site-nav');
        if (toggle && nav) {
            toggle.addEventListener('click', function () {
                var open = toggle.getAttribute('aria-expanded') !== 'true';
                toggle.setAttribute('aria-expanded', String(open));
                nav.classList.toggle('is-open', open);
            });
        }

        // Ghost marks only exact URL matches as current. Light up the parent section too:
        // /naplo/… and /tag/… → Napló, /tamogatas/ → „Hogyan segíthetsz?”
        if (document.querySelector('.nav-link[aria-current="page"]')) return;
        var path = window.location.pathname;
        var links = document.querySelectorAll('.nav-link');
        var match = null;
        Array.prototype.forEach.call(links, function (a) {
            var href;
            try { href = new URL(a.href).pathname; } catch (e) { return; }
            if (href !== '/' && path.indexOf(href) === 0) match = a;
        });
        if (!match && /^\/(naplo|tag)\//.test(path)) {
            match = document.querySelector('.nav-link[href$="/naplo/"]');
        }
        if (match) {
            match.classList.add('is-current');
            match.setAttribute('aria-current', 'page');
        }
    }

    /* --------------------------------------------------------- donate box */
    function initDonate(form) {
        var variant = form.getAttribute('data-variant');
        var api = (form.getAttribute('data-api') || '').trim();
        var freqBtns = form.querySelectorAll('[data-freq]');
        var amtBtns = form.querySelectorAll('[data-amount]');
        var customWrap = form.querySelector('.amount-input');
        var customInput = form.querySelector('[data-custom-amount]');
        var impactText = form.querySelector('[data-impact-text]');
        var cta = form.querySelector('[data-cta]');
        var cancelNote = form.querySelector('[data-monthly-only]');
        var errorEl = form.querySelector('.donate-error');

        var state = {
            monthly: form.getAttribute('data-default') !== 'once',
            index: 0
        };

        // Normalise preset labels: "5000" → "5 000 Ft"
        Array.prototype.forEach.call(amtBtns, function (b) {
            var v = b.getAttribute('data-amount');
            if (v !== 'custom') b.textContent = fmt(parseAmount(v)) + ' Ft';
        });

        function current() {
            var b = amtBtns[state.index];
            var raw = b.getAttribute('data-amount');
            if (raw === 'custom') return { custom: true, amount: parseAmount(customInput.value) };
            return { custom: false, amount: parseAmount(raw), impact: b.getAttribute('data-impact') };
        }

        function note(c, monthly) {
            return (monthly ? 'Havonta ' : '') + fmt(c.amount) + ' Ft: ' + c.impact + '.';
        }

        // The impact note and the custom amount field share one slot (only one is shown at a time).
        // Reserve the height of the tallest variant, so the box – and the hero photo next to it –
        // doesn't change height while the visitor clicks through the amounts or picks "Egyéb".
        var impactBox = impactText.parentNode;
        function reserveImpactHeight() {
            var shown = impactText.textContent;
            var boxHidden = impactBox.hidden, wrapHidden = customWrap.hidden;
            var max = 0;
            impactBox.style.minHeight = customWrap.style.minHeight = '';
            impactBox.hidden = false;
            Array.prototype.forEach.call(amtBtns, function (b) {
                var raw = b.getAttribute('data-amount');
                if (raw === 'custom') return;
                var c = { amount: parseAmount(raw), impact: b.getAttribute('data-impact') };
                [true, false].forEach(function (monthly) {
                    impactText.textContent = note(c, monthly);
                    max = Math.max(max, impactBox.offsetHeight);
                });
            });
            customWrap.hidden = false;
            max = Math.max(max, customWrap.offsetHeight);
            impactText.textContent = shown;
            impactBox.hidden = boxHidden;
            customWrap.hidden = wrapHidden;
            if (max) impactBox.style.minHeight = customWrap.style.minHeight = max + 'px';
        }

        function render() {
            Array.prototype.forEach.call(freqBtns, function (b) {
                b.setAttribute('aria-pressed', String((b.getAttribute('data-freq') === 'monthly') === state.monthly));
            });
            Array.prototype.forEach.call(amtBtns, function (b, i) {
                b.setAttribute('aria-pressed', String(i === state.index));
            });

            var c = current();
            customWrap.hidden = !c.custom;
            impactBox.hidden = c.custom;
            cancelNote.hidden = !state.monthly;

            var label = c.amount ? fmt(c.amount) + ' Ft' : '';
            if (!c.custom) impactText.textContent = note(c, state.monthly);

            var text;
            if (variant === 'campaign') {
                text = c.amount ? 'Támogatom · ' + (state.monthly ? 'havi ' : '') + label : 'Tovább a fizetéshez';
            } else if (variant === 'page') {
                text = c.amount ? 'Tovább a fizetéshez · ' + (state.monthly ? 'havi ' : '') + label : 'Tovább a fizetéshez';
            } else if (c.custom && !c.amount) {
                text = 'Tovább a támogatáshoz';
            } else {
                text = 'Támogatom ' + (state.monthly ? 'havi ' : '') + label + '-tal';
            }
            cta.textContent = text;
            showError('');
        }

        function showError(msg) {
            errorEl.textContent = msg;
            errorEl.hidden = !msg;
        }

        Array.prototype.forEach.call(freqBtns, function (b) {
            b.addEventListener('click', function () {
                state.monthly = b.getAttribute('data-freq') === 'monthly';
                render();
            });
        });
        Array.prototype.forEach.call(amtBtns, function (b, i) {
            b.addEventListener('click', function () {
                state.index = i;
                render();
                if (b.getAttribute('data-amount') === 'custom') customInput.focus();
            });
        });
        customInput.addEventListener('input', function () {
            var n = parseAmount(customInput.value);
            customInput.value = n ? fmt(n) : '';
            render();
        });

        form.addEventListener('submit', function (e) {
            e.preventDefault();
            var c = current();

            if (c.custom && !c.amount) {
                if (variant === 'hero' && !api) { window.location.href = '/tamogatas/'; return; }
                showError('Add meg, mekkora összeggel támogatnál.');
                customInput.focus();
                return;
            }
            if (c.amount < MIN_AMOUNT) {
                showError('A legkisebb összeg ' + fmt(MIN_AMOUNT) + ' Ft.');
                customInput.focus();
                return;
            }

            var nameEl = form.querySelector('[name="name"]');
            var emailEl = form.querySelector('[name="email"]');
            var newsletterEl = form.querySelector('[name="newsletter"]');
            var name = nameEl ? nameEl.value.trim() : '';
            var email = emailEl ? emailEl.value.trim() : '';

            if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                showError('Ellenőrizd az e-mail címet.');
                emailEl.focus();
                return;
            }

            if (!api) { window.location.href = '/tamogatas/'; return; }

            cta.setAttribute('aria-busy', 'true');
            cta.disabled = true;
            cta.textContent = 'Átirányítás a fizetéshez…';

            var signup = (newsletterEl && newsletterEl.checked && email) ? subscribe(email, name) : Promise.resolve();

            signup.then(function () {
                return fetch(api, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        amount: c.amount,
                        frequency: state.monthly ? 'monthly' : 'once',
                        name: name || undefined,
                        email: email || undefined,
                        newsletter: !!(newsletterEl && newsletterEl.checked && email),
                        campaign: form.getAttribute('data-campaign') || undefined,
                        return_path: form.getAttribute('data-return') || undefined,
                        site: window.location.origin
                    })
                });
            }).then(function (res) {
                return res.json().then(function (data) {
                    if (!res.ok || !data.url) throw new Error(data.error || 'Ismeretlen hiba');
                    window.location.href = data.url;
                });
            }).catch(function (err) {
                cta.removeAttribute('aria-busy');
                cta.disabled = false;
                render();
                showError('Most nem sikerült elindítani a fizetést. Próbáld újra pár perc múlva! (' + err.message + ')');
            });
        });

        render();
        reserveImpactHeight();
        var resizeTimer;
        window.addEventListener('resize', function () {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(reserveImpactHeight, 150);
        });
        // web fonts change the text width once they arrive
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(reserveImpactHeight);
    }

    /* Ghost Members – free signup for the Napló newsletter. Never blocks the donation. */
    function subscribe(email, name) {
        var base = window.location.origin + '/members/api';
        return fetch(base + '/integrity-token/', { credentials: 'same-origin' })
            .then(function (r) { return r.ok ? r.text() : ''; })
            .catch(function () { return ''; })
            .then(function (token) {
                return fetch(base + '/send-magic-link/', {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: email, name: name, emailType: 'signup', integrityToken: token || undefined })
                });
            })
            .catch(function () { /* ignore – the payment is what matters */ });
    }

    /* ------------------------------------------------------ thank-you page */
    function initThanks() {
        var el = document.querySelector('[data-thanks-text]');
        if (!el) return;
        var q = new URLSearchParams(window.location.search);
        var a = parseAmount(q.get('a'));
        if (!a) return;
        var monthly = q.get('f') === 'monthly';
        el.textContent = (monthly ? 'Havi ' : '') + fmt(a) + ' Ft-os támogatásod rögzítettük. ' +
            'A visszaigazolást e-mailben küldjük' + (monthly ? ', benne a lemondás linkjével.' : '.');
        if (!monthly) el.textContent = el.textContent.charAt(0).toUpperCase() + el.textContent.slice(1);
    }

    /* ------------------------------------------------------ campaign page */
    // [data-progress]: data-raised = the amount editors type in by hand (bank transfers etc., e.g. "9 350 000"),
    // data-goal = target. Card donations are added live from the donate API (/campaign/<slug>), which
    // lives next to the checkout endpoint (data-live = the donate_api_url theme setting).
    function initCampaign() {
        Array.prototype.forEach.call(document.querySelectorAll('[data-progress]'), function (el) {
            var goal = parseAmount(el.getAttribute('data-goal'));
            var manual = parseAmount(el.getAttribute('data-raised'));
            if (!goal) return;
            showProgress(el, goal, manual);

            var api = (el.getAttribute('data-live') || '').trim().replace(/\/checkout\/?$/, '');
            var slug = el.getAttribute('data-campaign');
            if (!api || !slug || !window.fetch) return;
            var refresh = function () {
                if (document.hidden) return;
                fetch(api + '/campaign/' + slug)
                    .then(function (r) { return r.ok ? r.json() : null; })
                    .then(function (d) { if (d && typeof d.total === 'number') showProgress(el, goal, manual + d.total); })
                    .catch(function () { /* keep showing the manual amount */ });
            };
            refresh();
            setInterval(refresh, 60000);
            document.addEventListener('visibilitychange', refresh);
        });
        initCopyLinks();
    }

    function showProgress(el, goal, total) {
        var raised = Math.min(total, goal);
        var set = function (sel, text) { var t = el.querySelector(sel); if (t) t.textContent = text; };
        set('[data-total]', fmt(total) + ' Ft');
        // two halves: the first fills up to goal/2, the second beyond it
        var half = goal / 2;
        set('[data-first]', raised >= half ? fmt(half) + ' Ft · közösen elértük!' : fmt(raised) + ' / ' + fmt(half) + ' Ft');
        set('[data-second]', fmt(Math.max(0, raised - half)) + ' / ' + fmt(half) + ' Ft');
        set('[data-missing]', raised >= goal ? 'A célt elértük – köszönjük!' : 'Még ' + fmt(goal - raised) + ' Ft hiányzik.');
        el.style.setProperty('--p1', Math.min(100, raised / half * 100).toFixed(1) + '%');
        el.style.setProperty('--p2', Math.max(0, (raised - half) / half * 100).toFixed(1) + '%');
        el.classList.add('is-ready');
    }

    /* ------------------------------------------------------ live run map */
    // [data-track] (#elo on /futas/): where the relay's baton phone is, from the donate API (/track/<slug>,
    // see donate-api/track.js), refreshed every 30 s. The section stays hidden until the API answers.
    // Leaflet (theme/assets/vendor) and the OpenStreetMap tiles load only when the section scrolls near.
    function initLiveRun() {
        var el = document.querySelector('[data-track]');
        if (!el || !window.fetch) return;
        var api = (el.getAttribute('data-track') || '').trim().replace(/\/checkout\/?$/, '');
        var slug = el.getAttribute('data-campaign');
        if (!api || !slug) return;
        var url = api + '/track/' + slug;
        var chip = document.querySelector('[data-live-chip]');
        var map = null, route = null, cum = null, data = null, wantMap = false;
        var set = function (sel, text) { var t = el.querySelector(sel); if (t) t.textContent = text; };
        var km = function (n) { return String(n).replace('.', ','); };
        var time = function (iso) {
            try { return new Date(iso).toLocaleTimeString('hu-HU', { timeZone: 'Europe/Budapest', hour: 'numeric', minute: '2-digit' }); }
            catch (e) { var d = new Date(iso); return d.getHours() + ':' + ('0' + d.getMinutes()).slice(-2); }
        };

        function show(d) {
            data = d;
            var len = Math.round(d.length_km);
            var late = d.delay_min ? ' (' + d.delay_min + ' perc késéssel)' : '';
            var texts = {
                before: ['Október 16.', 'Október 16-án kora reggel indulunk Budapestről. Kövesd a futást élőben!'],
                live: ['Élőben', 'Most épp erre járunk. Utolsó jel: ' + (d.last && time(d.last.t)) + late + '.'],
                paused: ['Jelre várunk', 'A jel egy időre elveszett (utolsó: ' + (d.last && time(d.last.t)) + '), de hamarosan újra jelentkezünk!'],
                finished: ['Célba értünk', 'Beértünk Kerecsendre! Köszönjük mindenkinek, aki futott, szurkolt vagy támogatott.']
            }[d.status] || ['', ''];
            var badge = el.querySelector('[data-live-badge]');
            badge.textContent = texts[0];
            badge.classList.toggle('is-live', d.status === 'live');
            set('[data-live-text]', texts[1]);
            set('[data-live-km]', km(d.status === 'finished' ? len : d.km));
            set('[data-live-total]', '/ ' + len + ' km');
            el.style.setProperty('--done', Math.min(100, d.km / d.length_km * 100).toFixed(1) + '%');
            if (chip) {
                chip.hidden = d.status !== 'live' && d.status !== 'paused';
                chip.textContent = 'Élőben: ' + km(d.km) + ' km megtéve – kövesd a térképen';
            }
            el.hidden = false;
            draw();
        }

        function refresh() {
            if (document.hidden) return;
            fetch(url + (route ? '' : '?route=1'))
                .then(function (r) { return r.ok ? r.json() : null; })
                .then(function (d) {
                    if (!d) return;
                    if (d.route) { route = d.route; cum = cumulative(route); }
                    show(d);
                })
                .catch(function () { /* keep the last state */ });
        }

        function loadMap() {
            if (wantMap) return;
            wantMap = true;
            var css = document.createElement('link');
            css.rel = 'stylesheet';
            css.href = el.getAttribute('data-leaflet-css');
            document.head.appendChild(css);
            var js = document.createElement('script');
            js.src = el.getAttribute('data-leaflet-js');
            js.onload = draw;
            document.head.appendChild(js);
        }

        var layers = {};
        function draw() {
            if (!window.L || !route || !data) return;
            var L = window.L;
            var cs = getComputedStyle(el);
            var red = cs.getPropertyValue('--cw-d').trim() || '#b31d1e';
            var dark = cs.getPropertyValue('--cw-o').trim() || '#7a1413';
            if (!map) {
                var touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
                map = L.map(el.querySelector('[data-live-map]'), { scrollWheelZoom: false, dragging: !touch, tap: false });
                L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    maxZoom: 18,
                    attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
                }).addTo(map);
                L.polyline(route, { color: dark, weight: 5, opacity: 0.35, dashArray: '2 9', lineCap: 'round' }).addTo(map);
                layers.done = L.polyline([], { color: red, weight: 6, opacity: 0.95, lineCap: 'round' }).addTo(map);
                [[route[0], 'Budapest'], [route[route.length - 1], 'Kerecsend']].forEach(function (p) {
                    L.circleMarker(p[0], { radius: 6, color: dark, weight: 3, fillColor: '#FFFCF7', fillOpacity: 1 })
                        .bindTooltip(p[1], { permanent: true, direction: 'top', offset: [0, -8], className: 'camp-live-place' }).addTo(map);
                });
                map.fitBounds(L.polyline(route).getBounds(), { padding: [24, 24] });
            }
            layers.done.setLatLngs(routeUpTo(data.km * 1000));
            if (data.last && data.status !== 'finished') {
                var icon = L.divIcon({ className: '', html: '<div class="camp-live-dot' + (data.status === 'live' ? ' is-live' : '') + '"></div>', iconSize: [22, 22], iconAnchor: [11, 11] });
                if (!layers.dot) layers.dot = L.marker([data.last.lat, data.last.lon], { icon: icon, keyboard: false, zIndexOffset: 1000 }).addTo(map);
                else layers.dot.setLatLng([data.last.lat, data.last.lon]).setIcon(icon);
                layers.dot.bindTooltip('Utolsó jel: ' + time(data.last.t) + ' · ' + km(data.km) + ' km');
            } else if (layers.dot) { map.removeLayer(layers.dot); layers.dot = null; }
        }

        // the planned route from the start up to m metres (the "done" line)
        function routeUpTo(m) {
            if (m <= 0) return [];
            var out = [route[0]];
            for (var i = 1; i < route.length; i++) {
                if (cum[i] <= m) { out.push(route[i]); continue; }
                var t = (m - cum[i - 1]) / (cum[i] - cum[i - 1]);
                out.push([route[i - 1][0] + t * (route[i][0] - route[i - 1][0]), route[i - 1][1] + t * (route[i][1] - route[i - 1][1])]);
                break;
            }
            return out;
        }

        function cumulative(pts) {
            var r = Math.PI / 180, c = [0];
            for (var i = 1; i < pts.length; i++) {
                var a = pts[i - 1], b = pts[i];
                var h = Math.pow(Math.sin((b[0] - a[0]) * r / 2), 2) + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.pow(Math.sin((b[1] - a[1]) * r / 2), 2);
                c.push(c[i - 1] + 2 * 6371000 * Math.asin(Math.sqrt(h)));
            }
            return c;
        }

        if ('IntersectionObserver' in window) {
            new IntersectionObserver(function (entries, obs) {
                if (entries.some(function (e) { return e.isIntersecting; })) { obs.disconnect(); loadMap(); }
            }, { rootMargin: '400px' }).observe(el);
        } else loadMap();
        refresh();
        setInterval(refresh, 30000);
        document.addEventListener('visibilitychange', refresh);
    }

    function initCopyLinks() {
        Array.prototype.forEach.call(document.querySelectorAll('[data-copy-link]'), function (b) {
            var label = b.textContent, timer;
            b.addEventListener('click', function () {
                var url = b.getAttribute('data-copy-link') || window.location.href;
                var done = function () {
                    b.textContent = 'Link másolva ✓';
                    clearTimeout(timer);
                    timer = setTimeout(function () { b.textContent = label; }, 1800);
                };
                if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, function () { window.prompt('Link:', url); });
                else window.prompt('Link:', url);
            });
        });
    }

    function init() {
        initNav();
        initCampaign();
        initLiveRun();
        Array.prototype.forEach.call(document.querySelectorAll('[data-donate]'), initDonate);
        initThanks();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
