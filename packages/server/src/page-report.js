/* 在渲染页面内执行（Playwright page.evaluate），生成元素索引与渲染告警（PRD 8.8 / AC-22）。
 * 纯 JS，运行时以文本注入，避免转译器注入辅助函数。参数：{ nextTargetId, theme }。 */
(args) => {
  const stage = document.querySelector('[data-joplo-stage]');
  const sr = stage.getBoundingClientRect();
  const warnings = [];
  // 文本节点（#text）不进索引：它们属于父元素
  const els = Array.from(stage.querySelectorAll('[data-jid]:not([data-jtype="#text"])'));
  const name = (el) => {
    const owner = el.closest('[data-jid]:not([data-jtype="#text"])');
    return owner ? `"${owner.dataset.jlabel ?? ''}"(${owner.dataset.jid})` : el.closest('[data-jtoast]') ? 'Toast' : el.closest('[data-jbackdrop]') ? 'Modal backdrop' : el.tagName.toLowerCase();
  };
  const elements = els.map((el) => {
    const r = el.getBoundingClientRect();
    const box = { x: Math.round(r.left - sr.left), y: Math.round(r.top - sr.top), width: Math.round(r.width), height: Math.round(r.height) };
    const style = getComputedStyle(el);
    const intersects = r.right > sr.left && r.left < sr.right && r.bottom > sr.top && r.top < sr.bottom;
    const visible = r.width > 0 && r.height > 0 && intersects && style.visibility !== 'hidden' && style.display !== 'none';
    return { id: el.dataset.jid, type: el.dataset.jtype, label: el.dataset.jlabel ?? '', visible, disabled: el.hasAttribute('data-jdisabled'), at: el.dataset.jat ?? null, box };
  });

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const offViewport = [];
  const dialogOpen = !!stage.querySelector('[data-jbackdrop]');
  const overlap = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2;

  // 1. 可见的可交互元素：中心点必须命中它自身
  els.forEach((el, i) => {
    const e = elements[i];
    if (!el.hasAttribute('data-jinteractive') || !e.visible) return;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    if (cx < sr.left || cx > sr.right || cy < sr.top || cy > sr.bottom) {
      // 画布（Canvas）里的元素被镜头移出画面是常态：只在它是下一步要操作的目标时才提示
      if (el.closest('[data-jcanvas-world]') && el.dataset.jid !== args.nextTargetId) return;
      warnings.push(`Outside frame: "${e.label}"(${e.id}) has its center outside the frame`);
      return;
    }
    // 视口小于舞台时，视口外的点 elementFromPoint 返回 null——那不是遮挡，单独汇总
    if (cx < 0 || cy < 0 || cx >= vw || cy >= vh) {
      offViewport.push(e.id);
      return;
    }
    const hit = document.elementFromPoint(cx, cy);
    if (hit && (hit === el || el.contains(hit))) return;
    // 插件组件（D86）的锚点在插件自己的画布上方、不接收指针：被同一个插件根里的画布“盖住”是预期的，命中由插件自己判断
    const pluginRoot = el.closest('[data-jplugin]');
    if (pluginRoot && hit && pluginRoot.contains(hit)) return;
    // 弹窗打开时，背景被遮罩或弹窗面板覆盖是预期的层次，不算遮挡（窄屏下面板常盖住背景按钮）
    if ((hit?.closest('[data-jbackdrop]') || (dialogOpen && hit?.closest('[role="dialog"]'))) && !el.closest('[role="dialog"]')) return;
    warnings.push(`Occluded: "${e.label}"(${e.id}) has its center covered by ${hit ? name(hit) : 'content outside the frame'}`);
  });

  if (offViewport.length)
    warnings.push(`Outside viewport: viewport ${vw}×${vh} is smaller than the stage; ${offViewport.length} interactive elements have centers outside the viewport; occlusion checks skipped (${offViewport.join(', ')})`);

  // 1b. 画布（Canvas）没有尺寸：放在没有宽 / 高的容器里时整块不可见
  stage.querySelectorAll('[data-jcanvas]').forEach((c) => {
    if (c.clientWidth < 1 || c.clientHeight < 1) warnings.push(`Canvas has no size: ${name(c)} is ${c.clientWidth}×${c.clientHeight}px, so nothing in it is visible; give its container a width and height (h="100%" in a layer) or let it size from its view ratio`);
  });

  // 2. 标签文字溢出
  stage.querySelectorAll('[data-jtext], .jtrunc').forEach((t) => {
    if (t.scrollWidth > t.clientWidth + 1) warnings.push(`Label text overflow: ${name(t)} text "${(t.textContent ?? '').slice(0, 40)}" is clipped`);
  });

  // 3. Toast 等浮层（pointer-events:none，elementFromPoint 看不到）与可交互元素按几何相交检测
  const toasts = Array.from(stage.querySelectorAll('[data-jtoast]')).map((t) => t.getBoundingClientRect());
  if (toasts.length) {
    els.forEach((el, i) => {
      const e = elements[i];
      if (!el.hasAttribute('data-jinteractive') || !e.visible) return;
      if (dialogOpen && !el.closest('[role="dialog"]')) return; // 被弹窗遮罩盖住的背景本来就不可操作
      const r = el.getBoundingClientRect();
      if (!toasts.some((b) => overlap(b, r))) return;
      warnings.push(e.id === args.nextTargetId ? `Toast obscures the next action target: ${name(el)}` : `Toast covers an interactive element: ${name(el)}`);
    });
  }

  // 4. 字体
  // Check the selected stack, including author themes and system fallbacks.
  const family = getComputedStyle(stage).fontFamily;
  if (!document.fonts.check(`16px ${family}`, stage.innerText || 'Aa')) {
    warnings.push('Fonts not loaded: The selected font is not ready; the screenshot may use fallback fonts');
  }
  const failed = Array.from(document.fonts).filter((f) => f.status === 'error');
  if (failed.length) warnings.push(`Fonts not loaded: ${failed.length} font files failed to load (${failed[0].family})`);

  return { elements, warnings };
}
