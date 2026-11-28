/**
 * Theme-agnostic base styles for @joplo-app/plugin-diagram board primitives.
 * Uses zero-specificity :where(...) selectors so all 5 diagram:* themes override
 * freely via CSS variables / attribute selectors while non-diagram host themes
 * (sketch, clean, dracula, nord, custom) always render crisp node frames,
 * readable fill="solid" contrast, and status rings.
 */
export const BOARD_BASE_CSS = `
:where([data-bd-root]) {
  font-family: var(--bd-font-ui, var(--jp-font, Inter, system-ui, sans-serif));
  color: var(--bd-on, var(--jp-ink, #17181a));
  -webkit-font-smoothing: antialiased;
  box-sizing: border-box;
}
:where([data-bd-root]) *,
:where([data-bd-root]) *::before,
:where([data-bd-root]) *::after {
  box-sizing: border-box;
}

:where([data-bd-slab]) {
  --bd-soft: color-mix(in srgb, var(--bd-on, var(--jp-ink, #17181a)) var(--bd-soft-stop, 74%), var(--bd-slab, var(--jp-surface, #ffffff)));
  --bd-mute: color-mix(in srgb, var(--bd-on, var(--jp-ink, #17181a)) var(--bd-mute-stop, 54%), var(--bd-slab, var(--jp-surface, #ffffff)));
  --bd-faint: color-mix(in srgb, var(--bd-on, var(--jp-ink, #17181a)) var(--bd-faint-stop, 34%), var(--bd-slab, var(--jp-surface, #ffffff)));
  --bd-w4: color-mix(in srgb, var(--bd-on, var(--jp-ink, #17181a)) var(--bd-w4-stop, 4%), var(--bd-slab, var(--jp-surface, #ffffff)));
  --bd-w6: color-mix(in srgb, var(--bd-on, var(--jp-ink, #17181a)) var(--bd-w6-stop, 6.5%), var(--bd-slab, var(--jp-surface, #ffffff)));
  --bd-w12: color-mix(in srgb, var(--bd-on, var(--jp-ink, #17181a)) var(--bd-w12-stop, 12%), var(--bd-slab, var(--jp-surface, #ffffff)));
  --bd-w20: color-mix(in srgb, var(--bd-on, var(--jp-ink, #17181a)) var(--bd-w20-stop, 20%), var(--bd-slab, var(--jp-surface, #ffffff)));
  --bd-edge: color-mix(in srgb, var(--bd-on, var(--jp-ink, #17181a)) var(--bd-edge-stop, 12%), transparent);
  border-radius: var(--bd-r-outer, 16px);
  background: var(--bd-slab, var(--jp-surface, #ffffff));
  color: var(--bd-on, var(--jp-ink, #17181a));
  border: var(--bd-slab-border, 1.25px solid color-mix(in srgb, var(--bd-on, var(--jp-ink, #17181a)) 18%, transparent));
  box-shadow:
    var(--bd-status-ring, 0 0 0 0 transparent),
    var(--bd-slab-ring, 0 0 0 0 transparent),
    var(--bd-slab-shadow, 0 6px 18px -8px rgba(15, 23, 42, 0.11), 0 1px 3px rgba(15, 23, 42, 0.05));
  position: relative;
  isolation: isolate;
}

:where([data-bd-fill="solid"]) {
  --bd-slab: var(--jp-ink, #121316);
  --bd-on: var(--jp-surface, #f5f4f0);
  --bd-signal: #93c5fd;
  --bd-on-signal: #0b1220;
  --bd-ok: #4ade80;
  --bd-on-ok: #08170e;
  --bd-warn: #fbbf24;
  --bd-danger: #fca5a5;
  --bd-info: #7dd3fc;
  --bd-violet: #c4b5fd;
  --bd-soft-stop: 88%;
  --bd-mute-stop: 72%;
  --bd-faint-stop: 48%;
  --bd-w4-stop: 6%;
  --bd-w6-stop: 10%;
  --bd-w12-stop: 18%;
  --bd-w20-stop: 28%;
  --bd-edge-stop: 18%;
  --bd-slab-border: 1.25px solid color-mix(in srgb, var(--bd-on) 20%, transparent);
  --bd-slab-shadow: 0 14px 32px -10px rgba(15, 23, 42, 0.28), 0 3px 8px -2px rgba(15, 23, 42, 0.14);
}

@keyframes bd-dot-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(0.76); }
}
:where(.bd-dot-pulse) {
  animation: bd-dot-pulse 1.5s ease-in-out infinite;
}
:where(.jstage[data-jstill] [data-bd-root]),
:where(.jstage[data-jstill] [data-bd-root] *) {
  transition: none !important;
  animation: none !important;
}
`;

const STYLE_ATTR = 'data-joplo-diagram-base';

/** Inject base board CSS into document.head once before first paint (idempotent, SSR-safe). */
export function ensureBoardBaseCss(): void {
  if (typeof document === 'undefined') return;
  if (document.head.querySelector(`style[${STYLE_ATTR}]`)) return;
  const el = document.createElement('style');
  el.setAttribute(STYLE_ATTR, '');
  el.textContent = BOARD_BASE_CSS;
  document.head.prepend(el);
}
