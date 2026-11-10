/* Browser-only read-only geometry audit; source-injected to avoid transpiler helpers. */
(options) => {
  const root = document.querySelector('[data-jexport],[data-jshot],[data-jrender]') || document.querySelector('[data-joplo-stage]');
  if (!root) throw new Error('Layout audit has no render surface');
  const box = r => ({ x: r.left ?? r.x, y: r.top ?? r.y, width: r.width, height: r.height });
  const right = r => r.x + r.width, bottom = r => r.y + r.height;
  const outside = (a, b) => a.x < b.x - 1 || a.y < b.y - 1 || right(a) > right(b) + 1 || bottom(a) > bottom(b) + 1;
  const intersection = (a, b) => Math.max(0, Math.min(right(a), right(b)) - Math.max(a.x, b.x)) * Math.max(0, Math.min(bottom(a), bottom(b)) - Math.max(a.y, b.y));
  const unknowns = [], rootBox = box(root.getBoundingClientRect());
  const matches = selector => Array.from(root.querySelectorAll(selector)).concat(root.matches(selector) ? [root] : []);
  const area = value => {
    if (typeof value !== 'string') return { ...value, x: rootBox.x + value.x, y: rootBox.y + value.y };
    const elements = matches(value);
    if (elements.length !== 1) throw new Error(`Layout area ${value} must match exactly one element inside the render surface`);
    return box(elements[0].getBoundingClientRect());
  };
  const content = options.content ? area(options.content) : options.crop ? area(options.crop) : rootBox;
  if (content.width <= 0 || content.height <= 0 || outside(content, rootBox)) throw new Error('Layout content area must be inside the render surface');
  const safeAreas = (options.safeAreas ?? []).map(area);
  const exclude = (options.exclude ?? []).flatMap(matches);
  const ignored = el => exclude.some(x => x === el || x.contains(el));
  const styledVisible = el => {
    for (let e = el; e; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.display === 'none' || s.visibility === 'hidden' || s.visibility === 'collapse' || Number(s.opacity) === 0 || e.hasAttribute('hidden')) return false;
      if (e === root) break;
    }
    return true;
  };
  const identity = el => {
    const owner = el.closest('[data-jid]:not([data-jtype="#text"])');
    return { elementId: owner?.getAttribute('data-jid') ?? null, source: owner?.getAttribute('data-jat') ?? null, tag: el.tagName.toLowerCase() };
  };
  const unsupportedClip = el => {
    for (let e = el; e; e = e.parentElement) {
      const s = getComputedStyle(e), matrix = s.transform === 'none' ? null : new DOMMatrixReadOnly(s.transform);
      if (s.clipPath !== 'none' || s.maskImage !== 'none' || (matrix && (Math.abs(matrix.b) > .0001 || Math.abs(matrix.c) > .0001))) return true;
      if (e === root) break;
    }
    return false;
  };
  const important = [...new Set((options.important ?? []).flatMap(selector => {
    const found = matches(selector);
    if (!found.length) unknowns.push({ elementId: null, source: null, reason: `Important selector ${selector} matched no rendered elements; visibility is unknown` });
    return found;
  }))].filter(el => !ignored(el));
  const importantSet = important.filter(styledVisible);
  for (const el of important.filter(el => !styledVisible(el))) unknowns.push({ ...identity(el), reason: 'Important element is hidden or transparent at this sample; no visible geometry claim is made' });
  const isImportant = el => importantSet.some(x => x === el || x.contains(el));
  const findings = [], textBoxes = [], seen = new Set(), unknownOwners = new Set();
  const add = (code, el, rect, detail, other) => {
    const id = identity(el), key = `${code}:${id.elementId}:${detail}`;
    if (seen.has(key)) return;
    seen.add(key); findings.push({ code, severity: 'warning', ...id, box: rect, detail, ...(other ? { relatedBox: other } : {}) });
  };
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node, count = 0;
  while ((node = walker.nextNode())) {
    if (++count > 5000) break;
    if (!node.textContent?.trim()) continue;
    const el = node.parentElement;
    if (!el || ignored(el) || !styledVisible(el) || /^(script|style|noscript)$/.test(el.tagName.toLowerCase())) continue;
    if (unsupportedClip(el)) {
      const owner = identity(el);
      if (!unknownOwners.has(owner.elementId)) { unknownOwners.add(owner.elementId); unknowns.push({ ...owner, reason: 'Rotation, mask or nonrectangular clipping makes exact text visibility unknown; inspect the evidence' }); }
      continue;
    }
    const range = document.createRange(); range.selectNodeContents(node);
    for (const r of range.getClientRects()) {
      if (r.width < .1 || r.height < .1) continue;
      const rect = box(r); textBoxes.push({ ...identity(el), box: rect, text: node.textContent.trim().slice(0, 100) });
      if (outside(rect, content)) add('TEXT_OUTSIDE_CONTENT', el, rect, 'Rendered text line exceeds the declared content frame', content);
      for (let parent = el; parent && parent !== root.parentElement; parent = parent.parentElement) {
        const style = getComputedStyle(parent), clipX = /hidden|clip|auto|scroll/.test(style.overflowX), clipY = /hidden|clip|auto|scroll/.test(style.overflowY);
        if (!clipX && !clipY) continue;
        const r = parent.getBoundingClientRect(), sx = parent.offsetWidth ? r.width / parent.offsetWidth : 1, sy = parent.offsetHeight ? r.height / parent.offsetHeight : 1;
        const boundary = { x: r.left + parent.clientLeft * sx, y: r.top + parent.clientTop * sy, width: parent.clientWidth * sx, height: parent.clientHeight * sy };
        if ((clipX && (rect.x < boundary.x - 1 || right(rect) > right(boundary) + 1)) || (clipY && (rect.y < boundary.y - 1 || bottom(rect) > bottom(boundary) + 1))) {
          add('TEXT_CLIPPED', el, rect, 'Rendered text line crosses an ancestor padding-box clipping boundary', boundary); break;
        }
      }
      if (isImportant(el)) for (const region of safeAreas) if (intersection(rect, region) > 1) add('IMPORTANT_IN_SAFE_AREA', el, rect, 'Declared important text intersects a reserved safe area', region);
    }
    range.detach();
  }
  const elements = importantSet.slice(0, 500).map(el => ({ el, ...identity(el), box: box(el.getBoundingClientRect()) }));
  for (let i = 0; i < elements.length; i++) {
    const a = elements[i];
    if (a.box.width <= 0 || a.box.height <= 0) continue;
    if (unsupportedClip(a.el)) { unknowns.push({ ...identity(a.el), reason: 'Declared important geometry has rotation/masking; visibility is unknown' }); continue; }
    if (outside(a.box, content)) add('IMPORTANT_OUTSIDE_CONTENT', a.el, a.box, 'Declared important element exceeds the content frame', content);
    for (const region of safeAreas) if (intersection(a.box, region) > 1) add('IMPORTANT_IN_SAFE_AREA', a.el, a.box, 'Declared important element intersects a reserved safe area', region);
    for (let j = i + 1; j < elements.length; j++) {
      const b = elements[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const overlap = intersection(a.box, b.box), smaller = Math.min(a.box.width * a.box.height, b.box.width * b.box.height);
      if (smaller > 0 && overlap / smaller > .1) add('POSSIBLE_OCCLUSION', a.el, a.box, `Geometry-only heuristic overlaps ${b.elementId ?? b.tag}; paint order and actual occlusion are not proven`, b.box);
    }
  }
  const phases = [];
  for (const animation of root.getAnimations({ subtree: true })) {
    if (animation.id !== 'jenter') continue;
    const current = animation.currentTime, end = animation.effect?.getComputedTiming().endTime;
    if (typeof current === 'number' && typeof end === 'number' && Number.isFinite(end) && end >= current) phases.push({ phase: 'enter-end', afterMs: end - current });
  }
  for (const el of [...root.querySelectorAll('[data-joplo-audit-phases]'), ...(root.hasAttribute('data-joplo-audit-phases') ? [root] : [])]) {
    try {
      const hints = JSON.parse(el.getAttribute('data-joplo-audit-phases'));
      if (!Number.isFinite(hints.clockMs) || !Array.isArray(hints.phases)) throw new Error();
      for (const hint of hints.phases) if (['camera-end', 'camera-waypoint', 'drift-mid', 'drift-end'].includes(hint.phase) && Number.isFinite(hint.atMs) && hint.atMs >= hints.clockMs) phases.push({ phase: hint.phase, afterMs: hint.atMs - hints.clockMs });
    } catch { unknowns.push({ ...identity(el), reason: 'Invalid plugin audit phase hints were ignored' }); }
  }
  return { root: rootBox, content, safeAreas, elements: elements.map(({ el, ...rest }) => rest), textBoxes, findings, unknowns, phases, truncated: count > 5000 || important.length > 500, coordinates: 'page-css-pixels', fonts: { status: document.fonts.status, families: [...new Set(textBoxes.map(t => t.elementId).filter(Boolean).map(id => { const el = root.querySelector(`[data-jid="${CSS.escape(id)}"]`); return el ? getComputedStyle(el).fontFamily : ''; }))] } };
}
