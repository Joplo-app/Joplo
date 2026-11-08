/** Public diff shell. Keep this standalone: embedded verbatim, never executed by the publisher. */
"use strict";
// Self-contained so the same function works from source and packed server builds.
function viewer() {
    const m = JSON.parse(document.getElementById('joplo-feature-diff').textContent);
    const locales = JSON.parse(document.getElementById('joplo-diff-locales').textContent);
    const requested = new URLSearchParams(location.search).get('locale');
    const tag = (requested || navigator.language || 'en').toLowerCase();
    const locale = Object.keys(locales).find(l => l.toLowerCase() === tag) || (tag.startsWith('zh') ? (/hant|tw|hk|mo/.test(tag) ? 'zh-TW' : 'zh-CN') : tag.startsWith('pt') ? 'pt-BR' : tag.split('-')[0]);
    const words = locales[locale] || locales.en;
    const t = en => words[en] || en;
    document.documentElement.lang = locales[locale] ? locale : 'en';
    const $ = (id) => document.getElementById(id);
    const button = (id) => $(id);
    const check = (id) => $(id);
    const labels = { added: t("Added"), modified: t("Modified"), removed: t("Removed"), unchanged: t("Unchanged"), uncertain: t("Uncertain match") };
    const reasons = { 'initial-state': t("Initial state"), scenes: t("Screens"), theme: t("Theme"), 'layers-roles': t("Layers / roles"), description: t("Description"), 'project-presentation': t("Project presentation") };
    for (const [id, en] of [['prev', 'Previous'], ['next', 'Next'], ['align', 'Realign'], ['reload', 'Reload players']])
        $(id).textContent = t(en);
    document.querySelector('[data-label="context"]').textContent = t("Full context");
    document.querySelector('[data-label="unchanged"]').textContent = t("Show unchanged scenarios");
    document.querySelector('h1').textContent = 'Joplo · ' + t('Feature diff');
    $('scenarios').setAttribute('aria-label', t('Scenarios'));
    $('steps').setAttribute('aria-label', t('Change position'));
    $('disclaimer').textContent = t("Changes to a concept demo, not verification of the real product. Synchronized playback is muted.");
    $('source').textContent = `${m.base.sha?.slice(0, 8) ?? t("Local baseline")} → ${m.head.sha?.slice(0, 8) ?? t("Local current")}`;
    let selected = -1, rows = [], index = 0, panes = [], playing = false, waiting = false;
    let timeout, advance;
    function stop() { playing = false; clearTimeout(advance); button('play').textContent = t("Play changes"); }
    function controls() {
        button('prev').disabled = waiting || index <= 0;
        button('next').disabled = waiting || index >= rows.length - 1;
        button('play').disabled = (waiting && !playing) || !rows.length;
        $('counter').textContent = rows.length ? `${index + 1} / ${rows.length}` : '';
        $('steps').value = String(index);
    }
    function positioned() {
        if (!panes.every(p => p.ready && p.position === p.target))
            return;
        waiting = false;
        clearTimeout(timeout);
        $('status').textContent = t("Aligned \u00b7 full preceding state restored");
        controls();
        if (playing) {
            clearTimeout(advance);
            advance = setTimeout(() => { if (index + 1 < rows.length)
                go(index + 1);
            else
                stop(); }, 1800);
        }
    }
    function send(p) { if (p.ready)
        p.iframe.contentWindow?.postMessage({ type: 'joplo:goto', protocol: 1, scenario: p.scenario, step: p.target }, '*'); }
    function go(i) {
        if (!rows[i])
            return;
        clearTimeout(timeout);
        clearTimeout(advance);
        index = i;
        waiting = true;
        $('status').textContent = t("Restoring both versions\u2026");
        for (const p of panes) {
            p.target = rows[i][p.side];
            send(p);
        }
        controls();
        positioned();
        if (waiting)
            timeout = setTimeout(() => { waiting = false; stop(); controls(); $('status').textContent = t("Player did not confirm its position. Reload players or realign to retry."); }, 12000);
    }
    function makeRows() {
        const s = m.scenarios[selected];
        let b = 0, a = 0;
        const all = [{ before: 0, after: 0, text: t("Initial state"), changed: s.reasons.length > 0 || s.steps.length === 0 }];
        for (const r of s.steps) {
            b = r.before?.position ?? b;
            a = r.after?.position ?? a;
            all.push({ before: b, after: a, text: `${labels[r.status]} · ${r.before?.position ?? '—'} → ${r.after?.position ?? '—'}`, changed: r.status !== 'unchanged' });
        }
        // Shared screen / theme changes affect the entire scenario, including otherwise identical steps.
        rows = check('context').checked || s.status === 'unchanged' || s.reasons.length ? all : all.filter(r => r.changed);
        const select = $('steps');
        select.replaceChildren();
        rows.forEach((r, i) => { const o = document.createElement('option'); o.value = String(i); o.textContent = r.text; select.append(o); });
    }
    function select(i) {
        stop();
        clearTimeout(timeout);
        selected = i;
        panes = [];
        $('players').replaceChildren();
        const s = m.scenarios[i];
        $('title').textContent = `${s.featureName} / ${s.name}`;
        $('notice').textContent = `${labels[s.status]}${s.reasons.length ? ' · ' + s.reasons.map(r => reasons[r] ?? r).join(', ') : ''}${s.status === 'uncertain' ? t(" \u00b7 Repeated actions cannot be aligned reliably. Unmatched steps are shown separately; add stable keys to resolve.") : ''}`;
        $('players').className = `players${s.before && s.after ? '' : ' single'}`;
        for (const side of ['before', 'after']) {
            const scenario = s[side];
            if (!scenario)
                continue;
            const wrap = document.createElement('div');
            wrap.className = 'pane';
            const h = document.createElement('h3');
            h.textContent = side === 'before' ? t("Before") : t("After");
            const iframe = document.createElement('iframe');
            iframe.title = h.textContent;
            // Opaque sandbox keeps untrusted scripts in either build away from the viewer and its sibling.
            iframe.setAttribute('sandbox', 'allow-scripts');
            iframe.setAttribute('allow', "autoplay 'none'");
            const pane = { iframe, side, scenario, ready: false, position: null, target: 0 };
            panes.push(pane);
            iframe.src = `${side}/index.html?embed=1&review=1&diff=1&locale=${encodeURIComponent(locale)}&scenario=${encodeURIComponent(scenario)}`;
            wrap.append(h, iframe);
            $('players').append(wrap);
        }
        makeRows();
        go(0);
        navigation();
    }
    function navigation() {
        $('scenarios').replaceChildren();
        m.scenarios.forEach((s, i) => {
            if (s.status === 'unchanged' && !check('unchanged').checked)
                return;
            const b = document.createElement('button');
            b.textContent = `${s.featureName} / ${s.name} · ${labels[s.status]}`;
            b.setAttribute('aria-current', String(selected === i));
            b.onclick = () => select(i);
            $('scenarios').append(b);
        });
    }
    window.addEventListener('message', e => {
        const p = panes.find(p => p.iframe.contentWindow === e.source);
        if (!p || !e.data || e.data.protocol !== 1)
            return;
        if (e.data.type === 'joplo:ready' && Array.isArray(e.data.scenarios) && e.data.scenarios.some((s) => s.id === p.scenario && Number.isInteger(s.steps) && s.steps >= p.target)) {
            p.ready = true;
            send(p);
        }
        if (e.data.type === 'joplo:position' && e.data.scenario === p.scenario && Number.isInteger(e.data.step)) {
            p.position = e.data.step;
            if (waiting)
                positioned();
            else if (p.position !== p.target) {
                stop();
                $('status').textContent = t("Player moved independently. Realign to continue comparing.");
            }
        }
    });
    button('prev').onclick = () => { stop(); go(index - 1); };
    button('next').onclick = () => { stop(); go(index + 1); };
    button('play').onclick = () => { if (playing)
        stop();
    else {
        playing = true;
        button('play').textContent = t("Pause");
        go(index === rows.length - 1 ? 0 : index);
    } };
    button('align').onclick = () => { stop(); go(index); };
    button('reload').onclick = () => { if (selected >= 0)
        select(selected); };
    check('context').onchange = () => { stop(); if (selected >= 0) {
        makeRows();
        go(0);
    } };
    check('unchanged').onchange = navigation;
    $('steps').onchange = e => { stop(); go(Number(e.target.value)); };
    stop();
    navigation();
    const first = m.scenarios.findIndex(s => s.status !== 'unchanged');
    if (m.status === 'incompatible') {
        $('title').textContent = t("Incompatible builds");
        $('notice').textContent = t("Rebuild both versions with compatible Joplo versions. Missing baselines are never treated as new features.");
    }
    else if (first >= 0)
        select(first);
    else {
        $('title').textContent = m.status === 'unchanged' ? t("No feature changes") : t("Project presentation changed");
        $('notice').textContent = t("No changed scenario to play. Show unchanged scenarios for context.");
    }
    controls();
}

viewer();
