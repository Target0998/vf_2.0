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
    // [data-progress]: data-raised = total collected so far (editors type it, e.g. "9 350 000"),
    // data-goal = target. The bar has two halves; the first fills up to goal/2, the second beyond it.
    function initCampaign() {
        Array.prototype.forEach.call(document.querySelectorAll('[data-progress]'), function (el) {
            var goal = parseAmount(el.getAttribute('data-goal'));
            var raised = Math.min(parseAmount(el.getAttribute('data-raised')), goal);
            if (!goal) return;
            var half = goal / 2;
            var set = function (sel, text) { var t = el.querySelector(sel); if (t) t.textContent = text; };
            set('[data-total]', fmt(raised) + ' Ft');
            set('[data-second]', fmt(Math.max(0, raised - half)) + ' / ' + fmt(half) + ' Ft');
            set('[data-first]', raised >= half ? fmt(half) + ' Ft · közösen elértük!' : fmt(raised) + ' / ' + fmt(half) + ' Ft');
            set('[data-missing]', raised >= goal ? 'A célt elértük – köszönjük!' : 'Még ' + fmt(goal - raised) + ' Ft hiányzik.');
            el.style.setProperty('--p1', Math.min(100, raised / half * 100).toFixed(1) + '%');
            el.style.setProperty('--p2', Math.max(0, (raised - half) / half * 100).toFixed(1) + '%');
            el.classList.add('is-ready');
        });
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
        Array.prototype.forEach.call(document.querySelectorAll('[data-donate]'), initDonate);
        initThanks();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
