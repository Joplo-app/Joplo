import { useLayoutEffect, useState } from 'react';
import { topbarMeasurements, type TopbarContents, type TopbarMeasurements } from './layout';

/** Measure an offscreen DOM clone with the same fonts, padding, icons and keycaps. */
function naturalWidth(element: HTMLElement, action = false): number {
  const clone = element.cloneNode(true) as HTMLElement;
  Object.assign(clone.style, {
    position: 'fixed', left: '-10000px', top: '0', visibility: 'hidden',
    width: 'max-content', maxWidth: 'none', font: getComputedStyle(element).font,
  });
  clone.setAttribute('aria-hidden', 'true');
  if (action) {
    const padding = Number(element.dataset.fullPadding ?? 20) / 2;
    Object.assign(clone.style, { paddingLeft: `${padding}px`, paddingRight: `${padding}px` });
    const label = clone.querySelector<HTMLElement>('[data-jb-label]');
    if (label) {
      label.textContent = element.dataset.fullLabel ?? '';
      label.style.display = 'inline';
    }
    for (const keycap of clone.querySelectorAll<HTMLElement>('kbd')) keycap.style.display = 'inline-flex';
    if (Number(element.dataset.fullChevron) > 0 && !element.querySelector('[data-jb-chevron]')) {
      const chevron = document.createElement('span');
      chevron.style.width = `${element.dataset.fullChevron}px`;
      chevron.style.flexShrink = '0';
      clone.append(chevron);
    }
  }
  document.body.append(clone);
  const width = clone.getBoundingClientRect().width;
  clone.remove();
  return width;
}

/** React may inspect the DOM; layout.ts remains a pure geometry calculation. */
export function useTopbarMeasurements(): TopbarMeasurements | undefined {
  const [measurements, setMeasurements] = useState<TopbarMeasurements>();
  useLayoutEffect(() => {
    const bar = document.querySelector<HTMLElement>('[data-testid="topbar"]');
    const actions = bar?.querySelector<HTMLElement>('[data-topbar-actions]');
    if (!bar || !actions) return;
    const update = () => {
      const style = getComputedStyle(bar);
      const brand = bar.querySelector<HTMLElement>('[data-testid="brand"]');
      const breadcrumbs = [...bar.children].filter((el): el is HTMLElement =>
        el instanceof HTMLElement && el !== brand && el !== actions && el.getAttribute('aria-hidden') !== 'true');
      const otherActions: number[] = [];
      const content: TopbarContents = {
        brand: brand?.getBoundingClientRect().width ?? 0,
        breadcrumbs: breadcrumbs.map((el) => naturalWidth(el)),
        gap: Number.parseFloat(style.columnGap) || 0,
        padding: Number.parseFloat(style.paddingLeft) || 0,
        otherActions,
      };
      const ids: Record<string, 'language' | 'inspect' | 'appearance' | 'export' | 'copyLink'> = {
        language: 'language', 'inspect-toggle': 'inspect', appearance: 'appearance', 'more-menu': 'export', 'copy-link': 'copyLink',
      };
      for (const element of actions.children) {
        if (!(element instanceof HTMLElement)) continue;
        const id = element.dataset.testid ?? '';
        if (ids[id]) content[ids[id]] = { full: naturalWidth(element, true), collapsed: 32 };
        else otherActions.push(element.getBoundingClientRect().width);
      }
      const next = topbarMeasurements(content);
      setMeasurements((prev) => JSON.stringify(prev) === JSON.stringify(next) ? prev : next);
    };
    update();
    const resize = new ResizeObserver(update);
    resize.observe(bar);
    for (const child of bar.querySelectorAll<HTMLElement>('button,[data-testid="crumbs"]')) resize.observe(child);
    const mutation = new MutationObserver(update);
    mutation.observe(actions, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['data-full-label'] });
    return () => { resize.disconnect(); mutation.disconnect(); };
  });
  return measurements;
}
