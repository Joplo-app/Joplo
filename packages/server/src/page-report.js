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
    return owner ? `「${owner.dataset.jlabel ?? ''}」(${owner.dataset.jid})` : el.closest('[data-jtoast]') ? 'Toast' : el.closest('[data-jbackdrop]') ? '弹窗遮罩' : el.tagName.toLowerCase();
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
      warnings.push(`超出画框：「${e.label}」(${e.id}) 的中心点不在画框内`);
      return;
    }
    // 视口小于舞台时，视口外的点 elementFromPoint 返回 null——那不是遮挡，单独汇总
    if (cx < 0 || cy < 0 || cx >= vw || cy >= vh) {
      offViewport.push(e.id);
      return;
    }
    const hit = document.elementFromPoint(cx, cy);
    if (hit && (hit === el || el.contains(hit))) return;
    // 弹窗打开时，背景被遮罩或弹窗面板覆盖是预期的层次，不算遮挡（窄屏下面板常盖住背景按钮）
    if ((hit?.closest('[data-jbackdrop]') || (dialogOpen && hit?.closest('[role="dialog"]'))) && !el.closest('[role="dialog"]')) return;
    warnings.push(`被遮挡：「${e.label}」(${e.id}) 的中心点被 ${hit ? name(hit) : '画框外内容'} 覆盖`);
  });

  if (offViewport.length)
    warnings.push(`不在视口内：视口 ${vw}×${vh} 小于舞台，${offViewport.length} 个可交互元素的中心点在视口外，未做遮挡检查（${offViewport.join(', ')}）`);

  // 2. 标签文字溢出
  stage.querySelectorAll('[data-jtext], .jtrunc').forEach((t) => {
    if (t.scrollWidth > t.clientWidth + 1) warnings.push(`标签文字溢出：${name(t)} 的文字「${(t.textContent ?? '').slice(0, 40)}」显示不全`);
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
      warnings.push(e.id === args.nextTargetId ? `Toast 遮挡了下一步操作的目标：${name(el)}` : `Toast 覆盖了可交互元素：${name(el)}`);
    });
  }

  // 4. 字体
  if (args.theme === 'sketch') {
    const text = stage.innerText || '中文';
    if (!document.fonts.check('16px "Joplo Excalifont"', text) || !document.fonts.check('16px "Joplo Xiaolai"', text)) warnings.push('字体未加载：手写字体（Excalifont / Xiaolai）尚未就绪，截图可能使用了后备字体');
  }
  const failed = Array.from(document.fonts).filter((f) => f.status === 'error');
  if (failed.length) warnings.push(`字体未加载：${failed.length} 个字体文件加载失败（${failed[0].family}）`);

  return { elements, warnings };
}
