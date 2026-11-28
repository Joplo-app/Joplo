/**
 * 5 Stylized Themes exported by @joplo-app/plugin-diagram:
 * diagram:juice, diagram:sketch, diagram:juice-dark, diagram:riso, diagram:blueprint.
 */
const SHARED_RULES = `
[data-bd-root] {
  font-family: var(--bd-font-ui);
  color: var(--bd-on);
  -webkit-font-smoothing: antialiased;
  box-sizing: border-box;
}
[data-bd-root] *, [data-bd-root] *::before, [data-bd-root] *::after {
  box-sizing: border-box;
}

:root,
[data-bd-slab],
[data-bd-fill="solid"] {
  --bd-soft: color-mix(in srgb, var(--bd-on) var(--bd-soft-stop, 74%), var(--bd-slab));
  --bd-mute: color-mix(in srgb, var(--bd-on) var(--bd-mute-stop, 54%), var(--bd-slab));
  --bd-faint: color-mix(in srgb, var(--bd-on) var(--bd-faint-stop, 34%), var(--bd-slab));
  --bd-w4: color-mix(in srgb, var(--bd-on) var(--bd-w4-stop, 4%), var(--bd-slab));
  --bd-w6: color-mix(in srgb, var(--bd-on) var(--bd-w6-stop, 6.5%), var(--bd-slab));
  --bd-w12: color-mix(in srgb, var(--bd-on) var(--bd-w12-stop, 12%), var(--bd-slab));
  --bd-w20: color-mix(in srgb, var(--bd-on) var(--bd-w20-stop, 20%), var(--bd-slab));
  --bd-edge: color-mix(in srgb, var(--bd-on) var(--bd-edge-stop, 8%), transparent);
}

[data-bd-slab] {
  border-radius: var(--bd-r-outer, 18px);
  background: var(--bd-slab);
  color: var(--bd-on);
  border: var(--bd-slab-border, none);
  box-shadow: var(--bd-slab-ring, 0 0 0 1px var(--bd-edge)), var(--bd-slab-shadow, 0 12px 28px -10px rgba(15, 23, 42, 0.09));
  position: relative;
  isolation: isolate;
}

[data-jcanvas] {
  background-color: var(--bd-bg);
  background-image: var(--bd-canvas-pattern, none);
  background-size: var(--bd-canvas-grid, 22px 22px);
}

@keyframes bd-dot-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(0.76); }
}
.bd-dot-pulse {
  animation: bd-dot-pulse 1.5s ease-in-out infinite;
}

.jstage[data-jstill] [data-bd-root],
.jstage[data-jstill] [data-bd-root] * {
  transition: none !important;
  animation: none !important;
}
`;

export const juiceLightTheme = `/* diagram:juice — Warm Tactile Ceramic Studio */
:root {
  --jp-font: "Inter", "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "PingFang SC", "Noto Sans SC", sans-serif;
  --jp-font-mono: "JetBrains Mono", "SF Mono", ui-monospace, Menlo, monospace;
  --jp-bg: #f3f2ee;
  --jp-surface: #ffffff;
  --jp-subtle: #e9e8e3;
  --jp-ink: #17181a;
  --jp-muted: #686c75;
  --jp-faint: #9aa0aa;
  --jp-line: rgba(23, 24, 26, 0.08);
  --jp-line-strong: rgba(23, 24, 26, 0.14);
  --jp-border: rgba(23, 24, 26, 0.09);
  --jp-accent: #2231dd;
  --jp-select: #2231dd;
  --jp-info: #0284c7;
  --jp-ok: #15803d;
  --jp-warn: #d97706;
  --jp-danger: #dc2626;
  --jp-stroke: clean;
  --jp-radius: 18px;

  --bd-font-ui: var(--jp-font);
  --bd-font-hand: "Virgil", "Caveat", "Segoe Print", "Bradley Hand", "PingFang SC", cursive;
  --bd-font-mono: var(--jp-font-mono);
  --bd-bg: #f3f2ee;
  --bd-canvas-pattern: radial-gradient(rgba(23, 24, 26, 0.075) 1px, transparent 1px);
  --bd-canvas-grid: 22px 22px;
  --bd-on: #17181a;
  --bd-slab: #ffffff;
  --bd-r-outer: 18px;
  --bd-r-inner: 13px;
  --bd-r-row: 10px;
  --bd-slab-border: none;
  --bd-slab-ring: 0 0 0 1px var(--bd-edge);
  --bd-slab-shadow: 0 12px 30px -10px rgba(15, 23, 42, 0.09), 0 2px 6px -1px rgba(15, 23, 42, 0.04);

  --bd-signal: #2231dd;
  --bd-on-signal: #ffffff;
  --bd-ok: #15803d;
  --bd-on-ok: #ffffff;
  --bd-warn: #d97706;
  --bd-danger: #dc2626;
  --bd-info: #0284c7;
  --bd-violet: #6d28d9;

  --bd-soft-stop: 74%;
  --bd-mute-stop: 54%;
  --bd-faint-stop: 34%;
  --bd-w4-stop: 3.8%;
  --bd-w6-stop: 6.2%;
  --bd-w12-stop: 11.5%;
  --bd-w20-stop: 19%;
  --bd-edge-stop: 7.5%;
}

[data-bd-fill="solid"] {
  --bd-on: #f5f4f0;
  --bd-slab: #121316;
  --bd-signal: #93c5fd;
  --bd-ok: #4ade80;
  --bd-on-ok: #08170e;
  --bd-warn: #fbbf24;
  --bd-danger: #fca5a5;
  --bd-info: #7dd3fc;
  --bd-violet: #c4b5fd;
  --bd-soft-stop: 88%;
  --bd-mute-stop: 70%;
  --bd-faint-stop: 48%;
  --bd-w4-stop: 6%;
  --bd-w6-stop: 10%;
  --bd-w12-stop: 18%;
  --bd-w20-stop: 28%;
  --bd-edge-stop: 15%;
  --bd-slab-shadow: 0 18px 40px -10px rgba(0, 0, 0, 0.34), 0 4px 12px -2px rgba(0, 0, 0, 0.18);
}
${SHARED_RULES}
`;

export const sketchTheme = `/* diagram:sketch — Authentic Excalidraw Hand-Drawn Whiteboard */
:root {
  --jp-font: "Virgil", "Comic Neue", "Bradley Hand", "Chalkboard SE", "PingFang SC", "Noto Sans SC", cursive, sans-serif;
  --jp-font-mono: "JetBrains Mono", "SF Mono", ui-monospace, Menlo, monospace;
  --jp-bg: #fcfbf7;
  --jp-surface: #ffffff;
  --jp-subtle: #f3f0e6;
  --jp-ink: #1e1e24;
  --jp-muted: #5a5b66;
  --jp-faint: #8e909e;
  --jp-line: #1e1e24;
  --jp-line-strong: #1e1e24;
  --jp-border: #1e1e24;
  --jp-accent: #1971c2;
  --jp-select: #1971c2;
  --jp-info: #1971c2;
  --jp-ok: #2f9e44;
  --jp-warn: #f08c00;
  --jp-danger: #e03131;
  --jp-stroke: rough;
  --jp-radius: 14px;

  --bd-font-ui: var(--jp-font);
  --bd-font-hand: var(--jp-font);
  --bd-font-mono: var(--jp-font-mono);
  --bd-bg: #fcfbf7;
  --bd-canvas-pattern: radial-gradient(rgba(30, 30, 36, 0.11) 1px, transparent 1px);
  --bd-canvas-grid: 20px 20px;
  --bd-on: #1e1e24;
  --bd-slab: #ffffff;
  --bd-r-outer: 18px 12px 20px 14px / 14px 20px 12px 18px;
  --bd-r-inner: 11px 14px 10px 13px / 13px 10px 14px 11px;
  --bd-r-row: 8px 11px 9px 10px;
  --bd-slab-border: 1.85px solid #1e1e24;
  --bd-slab-ring: 0 0 0 0 transparent;
  --bd-slab-shadow: 3px 3px 0 rgba(30, 30, 36, 0.13);

  --bd-signal: #1971c2;
  --bd-on-signal: #ffffff;
  --bd-ok: #2f9e44;
  --bd-on-ok: #ffffff;
  --bd-warn: #e67700;
  --bd-danger: #e03131;
  --bd-info: #0c8599;
  --bd-violet: #6741d9;

  --bd-soft-stop: 80%;
  --bd-mute-stop: 58%;
  --bd-faint-stop: 36%;
  --bd-w4-stop: 4%;
  --bd-w6-stop: 7%;
  --bd-w12-stop: 13%;
  --bd-w20-stop: 22%;
  --bd-edge-stop: 24%;
}

[data-bd-fill="solid"] {
  --bd-on: #fcfbf7;
  --bd-slab: #1e1e24;
  --bd-slab-border: 1.85px solid #1e1e24;
  --bd-slab-shadow: 4px 4px 0 rgba(25, 113, 194, 0.45);
  --bd-signal: #74c0fc;
  --bd-ok: #69db7c;
  --bd-on-ok: #122917;
  --bd-warn: #ffd43b;
  --bd-danger: #ff8787;
  --bd-info: #66d9e8;
  --bd-violet: #b197fc;
  --bd-mute-stop: 74%;
}
${SHARED_RULES}
`;

export const juiceDarkTheme = `/* diagram:juice-dark — Tactile Anodized Obsidian Studio */
:root {
  --jp-font: "Inter", "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "PingFang SC", "Noto Sans SC", sans-serif;
  --jp-font-mono: "JetBrains Mono", "SF Mono", ui-monospace, Menlo, monospace;
  --jp-bg: #0b0c0f;
  --jp-surface: #16181d;
  --jp-subtle: #1f2229;
  --jp-ink: #f4f3f1;
  --jp-muted: #989ba6;
  --jp-faint: #626673;
  --jp-line: rgba(244, 243, 241, 0.09);
  --jp-line-strong: rgba(244, 243, 241, 0.16);
  --jp-border: rgba(244, 243, 241, 0.1);
  --jp-accent: #5b8aff;
  --jp-select: #5b8aff;
  --jp-info: #38bdf8;
  --jp-ok: #34d17a;
  --jp-warn: #f59e0b;
  --jp-danger: #f87171;
  --jp-stroke: clean;
  --jp-radius: 18px;

  --bd-font-ui: var(--jp-font);
  --bd-font-hand: "Virgil", "Caveat", "PingFang SC", cursive;
  --bd-font-mono: var(--jp-font-mono);
  --bd-bg: #0b0c0f;
  --bd-canvas-pattern: radial-gradient(rgba(244, 243, 241, 0.07) 1px, transparent 1px);
  --bd-canvas-grid: 24px 24px;
  --bd-on: #f4f3f1;
  --bd-slab: #16181d;
  --bd-r-outer: 18px;
  --bd-r-inner: 13px;
  --bd-r-row: 10px;
  --bd-slab-border: none;
  --bd-slab-ring: 0 0 0 1px var(--bd-edge);
  --bd-slab-shadow: 0 16px 40px -10px rgba(0, 0, 0, 0.6), 0 2px 8px -2px rgba(0, 0, 0, 0.35);

  --bd-signal: #5b8aff;
  --bd-on-signal: #ffffff;
  --bd-ok: #34d17a;
  --bd-on-ok: #08170e;
  --bd-warn: #f59e0b;
  --bd-danger: #f87171;
  --bd-info: #38bdf8;
  --bd-violet: #a78bfa;

  --bd-soft-stop: 84%;
  --bd-mute-stop: 64%;
  --bd-faint-stop: 40%;
  --bd-w4-stop: 5%;
  --bd-w6-stop: 9%;
  --bd-w12-stop: 17%;
  --bd-w20-stop: 27%;
  --bd-edge-stop: 11%;
}

[data-bd-fill="solid"] {
  --bd-on: #f8f7f4;
  --bd-slab: #0d111a;
  --bd-slab-ring: 0 0 0 1.5px rgba(91, 138, 255, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.1);
  --bd-slab-shadow: 0 20px 44px -10px rgba(0, 0, 0, 0.72), 0 0 28px -12px rgba(91, 138, 255, 0.32);
  --bd-signal: #93c5fd;
  --bd-mute-stop: 74%;
}
${SHARED_RULES}
`;

export const risoTheme = `/* diagram:riso — Bold Editorial Risograph Print */
:root {
  --jp-font: "Inter", "Plus Jakarta Sans", "PingFang SC", "Noto Sans SC", sans-serif;
  --jp-font-mono: "JetBrains Mono", "SF Mono", ui-monospace, Menlo, monospace;
  --jp-bg: #f8f2e4;
  --jp-surface: #fffdf8;
  --jp-subtle: #efe7d5;
  --jp-ink: #18181b;
  --jp-muted: #52525b;
  --jp-faint: #8f8a7d;
  --jp-line: #18181b;
  --jp-line-strong: #18181b;
  --jp-border: #18181b;
  --jp-accent: #e03e2d;
  --jp-select: #1d4ed8;
  --jp-info: #1d4ed8;
  --jp-ok: #0f766e;
  --jp-warn: #d97706;
  --jp-danger: #e03e2d;
  --jp-stroke: clean;
  --jp-radius: 14px;

  --bd-font-ui: var(--jp-font);
  --bd-font-hand: "Virgil", "Caveat", "PingFang SC", cursive;
  --bd-font-mono: var(--jp-font-mono);
  --bd-bg: #f8f2e4;
  --bd-canvas-pattern: radial-gradient(rgba(24, 24, 27, 0.11) 1.1px, transparent 1.1px);
  --bd-canvas-grid: 18px 18px;
  --bd-on: #18181b;
  --bd-slab: #fffdf8;
  --bd-r-outer: 14px;
  --bd-r-inner: 9px;
  --bd-r-row: 8px;
  --bd-slab-border: 2px solid #18181b;
  --bd-slab-ring: 0 0 0 0 transparent;
  --bd-slab-shadow: 4px 4px 0px #18181b;

  --bd-signal: #1d4ed8;
  --bd-on-signal: #fffdf8;
  --bd-ok: #0f766e;
  --bd-on-ok: #fffdf8;
  --bd-warn: #d97706;
  --bd-danger: #e03e2d;
  --bd-info: #1d4ed8;
  --bd-violet: #7c3aed;

  --bd-soft-stop: 80%;
  --bd-mute-stop: 58%;
  --bd-faint-stop: 36%;
  --bd-w4-stop: 4.5%;
  --bd-w6-stop: 8%;
  --bd-w12-stop: 14%;
  --bd-w20-stop: 22%;
  --bd-edge-stop: 24%;
}

[data-bd-fill="solid"] {
  --bd-on: #fffdf8;
  --bd-slab: #18181b;
  --bd-slab-border: 2px solid #18181b;
  --bd-slab-shadow: 4px 4px 0px #e03e2d;
  --bd-signal: #fbbf24;
  --bd-on-signal: #18181b;
  --bd-ok: #2dd4bf;
  --bd-on-ok: #18181b;
  --bd-warn: #fbbf24;
  --bd-danger: #fb7185;
  --bd-info: #60a5fa;
  --bd-violet: #c084fc;
  --bd-mute-stop: 74%;
}
${SHARED_RULES}
`;

export const blueprintTheme = `/* diagram:blueprint — Architectural Cyanotype Drafting Grid */
:root {
  --jp-font: "Inter", "Plus Jakarta Sans", "PingFang SC", "Noto Sans SC", sans-serif;
  --jp-font-mono: "JetBrains Mono", "SF Mono", ui-monospace, Menlo, monospace;
  --jp-bg: #0c2340;
  --jp-surface: #112d52;
  --jp-subtle: #163763;
  --jp-ink: #f0f7ff;
  --jp-muted: #93c5fd;
  --jp-faint: #60a5fa;
  --jp-line: rgba(147, 197, 253, 0.22);
  --jp-line-strong: rgba(147, 197, 253, 0.42);
  --jp-border: rgba(147, 197, 253, 0.34);
  --jp-accent: #38bdf8;
  --jp-select: #38bdf8;
  --jp-info: #38bdf8;
  --jp-ok: #4ade80;
  --jp-warn: #facc15;
  --jp-danger: #fb7185;
  --jp-stroke: clean;
  --jp-radius: 6px;

  --bd-font-ui: var(--jp-font);
  --bd-font-hand: var(--jp-font);
  --bd-font-mono: var(--jp-font-mono);
  --bd-bg: #0c2340;
  --bd-canvas-pattern:
    linear-gradient(rgba(147, 197, 253, 0.08) 1px, transparent 1px),
    linear-gradient(90deg, rgba(147, 197, 253, 0.08) 1px, transparent 1px);
  --bd-canvas-grid: 28px 28px;
  --bd-on: #f0f7ff;
  --bd-slab: #112d52;
  --bd-r-outer: 8px;
  --bd-r-inner: 5px;
  --bd-r-row: 4px;
  --bd-slab-border: 1px solid rgba(147, 197, 253, 0.34);
  --bd-slab-ring: 0 0 0 0 transparent;
  --bd-slab-shadow: 0 12px 28px -10px rgba(3, 12, 27, 0.55);

  --bd-signal: #38bdf8;
  --bd-on-signal: #082f49;
  --bd-ok: #4ade80;
  --bd-on-ok: #052e16;
  --bd-warn: #facc15;
  --bd-danger: #fb7185;
  --bd-info: #38bdf8;
  --bd-violet: #c084fc;

  --bd-soft-stop: 86%;
  --bd-mute-stop: 68%;
  --bd-faint-stop: 46%;
  --bd-w4-stop: 6%;
  --bd-w6-stop: 10%;
  --bd-w12-stop: 18%;
  --bd-w20-stop: 28%;
  --bd-edge-stop: 28%;
}

[data-bd-fill="solid"] {
  --bd-on: #f0f7ff;
  --bd-slab: #08182e;
  --bd-slab-border: 1.5px solid #38bdf8;
}
${SHARED_RULES}
`;
