/** Public diff shell. Keep this independent: embedded verbatim, never executed by the publisher. */
"use strict";
// Self-contained so the same function works from source and packed server builds.
function viewer() {
    const m = JSON.parse(document.getElementById('joplo-feature-diff').textContent);
    const locales = JSON.parse(document.getElementById('joplo-diff-locales').textContent);
    const requested = new URLSearchParams(location.search).get('locale');
    const tag = (requested || navigator.language || 'en').toLowerCase();
    const locale = Object.keys(locales).find(l => l.toLowerCase() === tag) || (tag.startsWith('zh') ? (/hant|tw|hk|mo/.test(tag) ? 'zh-TW' : 'zh-CN') : tag.startsWith('pt') ? 'pt-BR' : tag.split('-')[0]);
    const words = locales[locale] || locales.en;
    const plural = (n, one, many) => t(n === 1 ? one : many, { n });
    const t = (en, vars) => { let s = words[en] || en; for (const k in vars || {}) s = s.split(`{${k}}`).join(String(vars[k])); return s; };
    document.documentElement.lang = locales[locale] ? locale : 'en';
    const $ = (id) => document.getElementById(id);
    const button = (id) => $(id);
    const check = (id) => $(id);
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
    const labels = { added: t("Added"), modified: t("Modified"), removed: t("Removed"), unchanged: t("Unchanged"), uncertain: t("Uncertain match") };
    const reasons = { 'initial-state': t("Initial state"), scenes: t("Screens"), theme: t("Theme"), 'layers-roles': t("Layers / roles"), description: t("Description"), 'project-presentation': t("Project presentation") };
    const stepReasons = { action: t("Action"), effects: t("Result"), caption: t("Caption"), explain: t("Explanation"), camera: t("Camera"), annotations: t("Annotations"), voice: t("Voice"), timing: t("Timing"), trace: t("Call trace"), forks: t("Branches"), kind: t("Step type"), order: t("Order"), presentation: t("Presentation"), 'ambiguous-match': t("Uncertain match") };
    for (const [id, en] of [['prev', 'Previous'], ['next', 'Next'], ['align', 'Realign'], ['reload', 'Reload players'], ['only-changes', 'Changes only'], ['view-single', 'Single view'], ['view-split', 'Side by side']])
        $(id).textContent = t(en);
    document.querySelector('[data-label="unchanged"]').textContent = t("Show unchanged scenarios");
    $('page-title').textContent = t('Feature diff');
    document.title = 'Joplo · ' + t('Feature diff');
    $('counter-label').textContent = t('Change');
    $('scenarios').setAttribute('aria-label', t('Scenarios'));
    $('sides').setAttribute('aria-label', t('Versions'));
    $('view').setAttribute('aria-label', t('Layout'));
    $('disclaimer').textContent = t("Changes to a concept demo, not verification of the real product. Synchronized playback is muted.");
    $('base').textContent = m.base.sha?.slice(0, 8) ?? t("Local baseline");
    $('head').textContent = m.head.sha?.slice(0, 8) ?? t("Local current");
    const shas = { before: $('base').textContent, after: $('head').textContent };
    const count = (status) => m.scenarios.filter(s => status.includes(s.status)).length;
    $('totals').replaceChildren(...[['added', ['added']], ['modified', ['modified', 'uncertain']], ['removed', ['removed']]].filter(([, s]) => count(s)).map(([k, s]) => {
        const pill = el('span', `pill ${k}`);
        pill.append(el('b', '', String(count(s))), el('span', '', labels[k]));
        return pill;
    }));
    const unchangedCount = count(['unchanged']);
    $('unchanged-count').textContent = unchangedCount ? String(unchangedCount) : '';
    let selected = -1, rows = [], index = 0, panes = [], playing = false, waiting = false, misaligned = false, fullContext = false, rowButtons = [];
    let timeout, advance;
    // One large stage by default: both players stay loaded and stacked, so flipping keeps size and position.
    let layout = 'single', focus = 'after';
    try { if (localStorage.getItem('joplo-diff-layout') === 'split') layout = 'split'; } catch { /* storage unavailable */ }
    const position = (r) => r ? r.position : null;
    const where = (step) => [step.before && `${t('Old')} ${step.before.position}`, step.after && `${t('New')} ${step.after.position}`].filter(Boolean).join(' → ');
    const caption = (step) => step.after?.caption ?? step.before?.caption ?? t('Step {n}', { n: position(step.after) ?? position(step.before) });
    function stop() { playing = false; clearTimeout(advance); button('play').textContent = t("Play changes"); button('play').className = 'primary play'; }
    function state(kind) { $('dot').className = `dot ${kind}`; $('align').hidden = kind !== 'warn'; }
    function paneStep(p) {
        const total = p.scenarios.get(p.scenario);
        // After drift, show where the player actually is so the realign prompt is credible.
        const step = misaligned && p.actual?.scenario === p.scenario ? p.actual.step : p.target;
        const text = step === 0 ? t("Initial state") : total === undefined ? t('Step {n}', { n: step }) : t('Step {n} / {total}', { n: step, total });
        for (const e of p.stepEls) e.textContent = text;
    }
    function controls() {
        button('prev').disabled = waiting || index <= 0;
        button('next').disabled = waiting || index >= rows.length - 1;
        button('play').disabled = misaligned || (waiting && !playing) || !rows.length;
        $('counter').textContent = rows.length ? `${index + 1} / ${rows.length}` : '';
        rowButtons.forEach((b, i) => b.setAttribute('aria-current', String(i === index)));
        for (const p of panes) paneStep(p);
        renderChange();
    }
    function invalidate() {
        stop();
        clearTimeout(timeout);
        waiting = false;
        misaligned = true;
        for (const p of panes) p.confirmed = false;
        state('warn');
        controls();
    }
    function independentMove() {
        invalidate();
        $('status').textContent = t("Player moved independently. Realign to continue comparing.");
    }
    function positioned() {
        if (!waiting || misaligned || !panes.every(p => p.ready && p.confirmed && p.actual?.scenario === p.scenario && p.actual.step === p.target))
            return;
        waiting = false;
        clearTimeout(timeout);
        $('status').textContent = t("Aligned · full preceding state restored");
        state('ok');
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
        // Added steps exist only in the new version, removed ones only in the old: show that side.
        const only = rows[i].step?.status === 'added' ? 'after' : rows[i].step?.status === 'removed' ? 'before' : null;
        if (only && panes.some(p => p.side === only)) focus = only;
        waiting = true;
        misaligned = false;
        $('status').textContent = t("Restoring both versions…");
        state('busy');
        for (const p of panes) {
            p.target = rows[i][p.side];
            p.confirmed = false;
        }
        // Even a pane that stays on the same step must confirm this goto again.
        for (const p of panes) send(p);
        controls();
        positioned();
        if (waiting)
            timeout = setTimeout(() => { invalidate(); $('status').textContent = t("Player did not confirm its position. Reload players or realign to retry."); }, 12000);
    }
    function forcedContext(s) { return s.status === 'unchanged' || s.reasons.length > 0; }
    function makeRows() {
        const s = m.scenarios[selected];
        let b = 0, a = 0;
        const all = [{ before: 0, after: 0, step: null, changed: s.reasons.length > 0 || s.steps.length === 0 }];
        for (const r of s.steps) {
            b = r.before?.position ?? b;
            a = r.after?.position ?? a;
            all.push({ before: b, after: a, step: r, changed: r.status !== 'unchanged' });
        }
        // Shared screen / theme changes affect the entire scenario, including otherwise identical steps.
        rows = fullContext || forcedContext(s) ? all : all.filter(r => r.changed);
        // The toggle only matters when it would hide something.
        $('scope').hidden = forcedContext(s) || all.slice(1).every(r => r.changed);
        $('full-context').textContent = `${t('Full flow')} · ${plural(all.length - 1, '{n} step', '{n} steps')}`;
        button('only-changes').setAttribute('aria-pressed', String(!fullContext));
        button('full-context').setAttribute('aria-pressed', String(fullContext));
    }
    function renderChange() { renderCard(); renderPanes(); }
    /** Visible result values that changed (state, toast, outcome): at most three rows, the rest counted. */
    function resultsEl(results) {
        const box = el('div', 'results');
        const value = (v, cls) => v === null ? Object.assign(el('span', 'val none', '—'), { title: t("Not produced by this step") }) : el('span', `val ${cls}`, v);
        for (const r of results.slice(0, 3)) {
            const line = el('div', 'result');
            line.append(r.kind === 'state' ? el('code', 'key', r.label) : el('span', 'key', r.kind === 'message' ? t("Message") : t("Outcome")), value(r.before, 'old'), el('span', 'to', '→'), value(r.after, 'new'));
            box.append(line);
        }
        if (results.length > 3) box.append(el('p', 'note', t('+{n} more', { n: results.length - 3 })));
        return box;
    }
    function renderCard() {
        const s = m.scenarios[selected], r = rows[index];
        const detail = $('detail');
        detail.replaceChildren();
        if (!s || !r) { $('change').hidden = true; return; }
        $('change').hidden = false;
        const step = r.step, status = step ? step.status : r.changed ? 'modified' : 'unchanged';
        $('change').className = `change ${status}`;
        const quote = (text, cls = '') => el('p', `quote ${cls}`, `“${text}”`);
        const note = (text) => el('p', 'note', text);
        if (!step) {
            $('kind').textContent = t("Initial state");
            detail.append(s.reasons.length ? el('p', 'quote plain', s.reasons.map(x => reasons[x] ?? x).join(' · ')) : note(t("Starting point before the first step.")));
            if (s.reasons.length) detail.append(note(t("These changes apply to the whole scenario, so every step is shown.")));
            return;
        }
        if (status === 'added') {
            $('kind').textContent = s.before ? t("New step inserted") : t("New scenario");
            detail.append(quote(caption(step)));
            if (s.before) detail.append(note(t("The old version has no such step; it pauses just before it.")));
        }
        else if (status === 'removed') {
            $('kind').textContent = s.after ? t("Step removed in the new version") : t("Removed scenario");
            detail.append(quote(caption(step), 'gone'));
            if (s.after) detail.append(note(t("The new version no longer has this step; it pauses just before it.")));
        }
        else if (status === 'modified' && step.before?.caption && step.after?.caption && step.before.caption !== step.after.caption) {
            $('kind').textContent = `${t("This step changed:")} ${step.reasons.map(x => stepReasons[x] ?? x).join(' · ')}`;
            for (const [side, cls] of [['before', 'old'], ['after', 'new']]) {
                const line = el('div', `line ${cls}`);
                line.append(el('span', 'tag', `${side === 'before' ? t('Old') : t('New')} ${step[side].position}`), el('span', 'text', step[side].caption));
                detail.append(line);
            }
            if (step.results?.length) detail.append(resultsEl(step.results));
        }
        else {
            $('kind').textContent = status === 'modified' ? `${t("This step changed:")} ${step.reasons.map(x => stepReasons[x] ?? x).join(' · ')}` : labels[status];
            detail.append(quote(caption(step)));
            if (step.results?.length) detail.append(resultsEl(step.results));
            detail.append(note(where(step)));
        }
    }
    function select(i) {
        stop();
        clearTimeout(timeout);
        selected = i;
        // Each scenario starts on the new version; added/removed steps then pick the side that has them.
        focus = 'after';
        panes = [];
        $('players').replaceChildren();
        $('sides').replaceChildren();
        const s = m.scenarios[i];
        $('feature').textContent = s.entryTitle;
        $('title').textContent = s.name;
        $('badge').textContent = labels[s.status];
        $('badge').className = `badge ${s.status}`;
        $('badge').hidden = false;
        const n = (st) => s.steps.filter(x => x.status === st).length;
        const parts = !s.before || !s.after ? [plural(s.steps.length, '{n} step', '{n} steps')] : [
            n('added') && t('{n} added', { n: n('added') }), n('modified') && t('{n} modified', { n: n('modified') }),
            n('removed') && t('{n} removed', { n: n('removed') }), n('uncertain') && t('{n} uncertain', { n: n('uncertain') }),
            ...s.reasons.map(r => reasons[r] ?? r),
        ].filter(Boolean);
        $('summary').textContent = parts.join(' · ');
        $('notice').textContent = s.status === 'uncertain' ? t("Repeated actions cannot be aligned reliably. Unmatched steps are shown separately; add stable keys to resolve.") : '';
        $('notice').hidden = s.status !== 'uncertain';
        for (const side of ['before', 'after']) {
            const scenario = s[side];
            if (!scenario)
                continue;
            const wrap = el('div', 'pane');
            const head = el('div', 'pane-head');
            const name = el('span', 'pane-name', side === 'before' ? t("Before") : t("After"));
            const chip = el('span', 'chip', t("No counterpart · paused before"));
            const stepEl = el('span', 'pane-step');
            const zoom = el('button', 'zoom', t("Show only this version"));
            head.append(el('span', 'dot'), name, el('code', '', shas[side]), el('span', 'grow'), chip, stepEl, zoom);
            // Like a multi-stream view: clicking a pane's bar enlarges just that version.
            head.onclick = () => show(side, 'single');
            head.title = t("Show only this version");
            zoom.onclick = (e) => { e?.stopPropagation?.(); show(side, 'single'); };
            const tab = el('button', 'tab');
            const tabChip = el('span', 'chip', chip.textContent), tabStep = el('span', 'pane-step');
            tab.append(el('span', 'dot'), el('span', 'pane-name', name.textContent), el('code', '', shas[side]), tabStep, tabChip);
            tab.onclick = () => show(side);
            tab.onmousedown = keepFocus;
            head.onmousedown = keepFocus;
            $('sides').append(tab);
            const iframe = document.createElement('iframe');
            iframe.title = name.textContent;
            // Opaque sandbox keeps untrusted scripts in either build away from the viewer and its sibling.
            iframe.setAttribute('sandbox', 'allow-scripts');
            iframe.setAttribute('allow', "autoplay 'none'");
            const pane = { iframe, side, scenario, ready: false, scenarios: new Map(), actual: null, confirmed: false, target: 0, wrap, tab, chips: [chip, tabChip], stepEls: [stepEl, tabStep] };
            panes.push(pane);
            iframe.src = `${side}/index.html?embed=1&review=1&diff=1&locale=${encodeURIComponent(locale)}&scenario=${encodeURIComponent(scenario)}`;
            wrap.append(head, iframe);
            $('players').append(wrap);
        }
        makeRows();
        navigation();
        go(0);
    }
    function renderPanes() {
        const r = rows[index], step = r?.step, two = panes.length > 1;
        if (!panes.some(p => p.side === focus) && panes.length) focus = panes[panes.length - 1].side;
        const single = !two || layout === 'single';
        $('players').className = `players ${single ? 'single' : 'split'}`;
        $('sides').hidden = !single;
        $('view').hidden = !two;
        $('flip-hint').hidden = !two;
        $('flip-hint').textContent = single ? t("Space flips between versions") : t("Click a version's bar to enlarge it");
        button('view-single').setAttribute('aria-pressed', String(single));
        button('view-split').setAttribute('aria-pressed', String(!single));
        for (const p of panes) {
            const missing = !!step && !step[p.side];
            for (const c of p.chips) c.hidden = !missing || !two;
            const hl = !step ? (r?.changed ? 'modified' : '') : step.status === 'added' ? (p.side === 'after' ? 'added' : '') : step.status === 'removed' ? (p.side === 'before' ? 'removed' : '') : step.status === 'unchanged' ? '' : step.status;
            const front = p.side === focus;
            p.wrap.className = `pane${hl ? ' hl-' + hl : ''}${missing ? ' paused' : ''}${front ? ' front' : ''}`;
            p.tab.className = `tab${hl ? ' hl-' + hl : ''}`;
            p.tab.setAttribute('aria-pressed', String(front));
            // The stacked player behind is only hidden visually; keep it out of the accessibility tree and tab order.
            p.wrap.setAttribute('aria-hidden', String(single && !front));
            p.iframe.setAttribute('tabindex', single && !front ? '-1' : '0');
        }
    }
    // Mouse clicks on stage controls must not keep focus there, or the next Space re-clicks the control
    // instead of flipping. Keyboard focus (Tab) still works and keeps native Space/Enter activation.
    function keepFocus(e) { e?.preventDefault?.(); }
    /** Bring one version to the front; optionally switch layout (side-by-side → enlarge one). */
    function show(side, nextLayout) {
        if (!panes.some(p => p.side === side)) return;
        focus = side;
        if (nextLayout) setLayout(nextLayout);
        else renderPanes();
    }
    function setLayout(next) {
        layout = next;
        try { localStorage.setItem('joplo-diff-layout', next); } catch { /* storage unavailable */ }
        renderPanes();
    }
    function flip() {
        if (panes.length < 2) return;
        show(focus === 'after' ? 'before' : 'after', 'single');
    }
    function navigation() {
        const nav = $('scenarios');
        nav.replaceChildren();
        rowButtons = [];
        let group = null, hidden = 0;
        m.scenarios.forEach((s, i) => {
            if (s.status === 'unchanged' && !check('unchanged').checked) {
                hidden++;
                return;
            }
            if (!group || group.id !== s.entryId) {
                group = { id: s.entryId };
                nav.append(el('p', 'group', s.entryTitle));
            }
            const b = el('button', 'scenario');
            const changes = s.steps.filter(x => x.status !== 'unchanged').length;
            const meta = !s.before || !s.after ? plural(s.steps.length, '{n} step', '{n} steps') : s.status === 'unchanged' ? '' : plural(changes + (s.reasons.length ? 1 : 0), '{n} change', '{n} changes');
            b.append(el('span', `badge ${s.status}`, labels[s.status]), el('span', 'name', s.name), el('span', 'meta', meta));
            b.setAttribute('aria-current', String(selected === i));
            b.onclick = () => select(i);
            nav.append(b);
            if (selected !== i)
                return;
            const list = el('div', 'changes');
            rows.forEach((r, j) => {
                const c = el('button', `row ${r.step ? r.step.status : r.changed ? 'modified' : 'unchanged'}`);
                const text = el('span', 'row-text');
                text.append(el('span', 'row-caption', r.step ? caption(r.step) : t("Initial state")));
                const sub = el('span', 'row-meta');
                sub.append(el('b', '', r.step ? labels[r.step.status] : r.changed ? labels.modified : labels.unchanged));
                if (r.step) sub.append(el('code', '', where(r.step)));
                text.append(sub);
                c.append(el('span', 'num', String(j + 1)), text);
                c.setAttribute('aria-current', String(j === index));
                c.onclick = () => { stop(); go(j); };
                rowButtons.push(c);
                list.append(c);
            });
            nav.append(list);
        });
        $('hidden-note').textContent = hidden ? t('{n} unchanged scenarios hidden', { n: hidden }) : '';
        $('hidden-note').hidden = !hidden;
    }
    window.addEventListener('message', e => {
        const p = panes.find(p => p.iframe.contentWindow === e.source);
        if (!p || !e.data || e.data.protocol !== 1)
            return;
        if (e.data.type === 'joplo:ready' && Array.isArray(e.data.scenarios) && e.data.scenarios.every(s => s && typeof s.id === 'string' && s.id && Number.isSafeInteger(s.steps) && s.steps >= 0)) {
            if (p.ready && !waiting) independentMove();
            p.scenarios = new Map(e.data.scenarios.map(s => [s.id, s.steps]));
            p.ready = p.scenarios.has(p.scenario) && p.scenarios.get(p.scenario) >= p.target;
            p.actual = null;
            p.confirmed = false;
            paneStep(p);
            send(p);
        }
        if (e.data.type === 'joplo:position' && p.ready && typeof e.data.scenario === 'string' && p.scenarios.has(e.data.scenario) && Number.isSafeInteger(e.data.step) && e.data.step >= 0 && e.data.step <= p.scenarios.get(e.data.scenario)) {
            const previous = p.actual;
            p.actual = { scenario: e.data.scenario, step: e.data.step };
            const matches = p.actual.scenario === p.scenario && p.actual.step === p.target;
            if (!matches) {
                // An initial/previous step can arrive while goto is pending. A different
                // scenario or a newly observed independent step must stop synchronization.
                if (p.actual.scenario !== p.scenario || !waiting || p.confirmed || (previous && (previous.scenario !== p.actual.scenario || previous.step !== p.actual.step))) independentMove();
                p.confirmed = false;
            }
            else if (waiting && !misaligned) {
                p.confirmed = true;
                positioned();
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
        button('play').className = 'primary pause';
        go(index === rows.length - 1 ? 0 : index);
    } };
    button('align').onclick = () => { stop(); go(index); };
    button('reload').onclick = () => { if (selected >= 0)
        select(selected); };
    const scope = (full) => { if (fullContext === full) return; stop(); fullContext = full; if (selected >= 0) {
        makeRows();
        navigation();
        go(0);
    } };
    button('only-changes').onclick = () => scope(false);
    button('view-single').onmousedown = keepFocus;
    button('view-split').onmousedown = keepFocus;
    button('view-single').onclick = () => setLayout('single');
    button('view-split').onclick = () => setLayout('split');
    // Space flips versions while the page (not a control or a player) has focus; players handle their own keys.
    document.onkeydown = (e) => {
        if (e.key !== ' ' || e.metaKey || e.ctrlKey || e.altKey || e.target?.closest?.('button,input,select,textarea,a,iframe,[contenteditable]')) return;
        if (panes.length < 2) return;
        e.preventDefault();
        flip();
    };
    button('full-context').onclick = () => scope(true);
    check('unchanged').onchange = navigation;
    stop();
    state('idle');
    $('change').hidden = true;
    $('notice').hidden = true;
    $('badge').hidden = true;
    $('scope').hidden = true;
    navigation();
    const first = m.scenarios.findIndex(s => s.status !== 'unchanged');
    if (m.status === 'incompatible') {
        $('title').textContent = t("Incompatible builds");
        $('notice').textContent = t("Rebuild both versions with compatible Joplo versions. Missing baselines are never treated as new features.");
        $('notice').hidden = false;
    }
    else if (first >= 0)
        select(first);
    else {
        $('title').textContent = m.status === 'unchanged' ? t("No feature changes") : t("Project presentation changed");
        $('notice').textContent = t("No changed scenario to play. Show unchanged scenarios for context.");
        $('notice').hidden = false;
    }
    controls();
}

viewer();
