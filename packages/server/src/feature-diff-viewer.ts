import { readFileSync } from 'node:fs';
import type { FeatureDiffManifest } from '@joplo-app/core';
import { jsonForHtml } from './build.ts';

/** Icons are CSS masks so the runtime can keep replacing button text without touching markup. */
const icon = (paths: string) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`)}")`;
const ICONS = {
  prev: icon('<path d="m15 18-6-6 6-6"/>'),
  next: icon('<path d="m9 18 6-6-6-6"/>'),
  play: icon('<path d="M6 4v16l14-8z"/>'),
  pause: icon('<path d="M8 5v14M16 5v14"/>'),
  reload: icon('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>'),
  align: icon('<path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5M3 21v-5h5"/>'),
  arrow: icon('<path d="M5 12h14m-6-6 6 6-6 6"/>'),
  expand: icon('<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>'),
  single: icon('<rect x="3" y="4" width="18" height="16" rx="2"/>'),
  split: icon('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/>'),
  hidden: icon('<path d="M10.7 5.1A10 10 0 0 1 22 12a13 13 0 0 1-1.7 2.7M6.6 6.6A13.5 13.5 0 0 0 2 12s3 7 10 7a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2M2 2l20 20"/>'),
};
const MARK = '<svg width="24" height="24" viewBox="0 0 128 128" aria-hidden="true"><rect x="4" y="4" width="120" height="120" rx="30" fill="#FFD23F"/><circle cx="40" cy="40" r="9" fill="#1E1E1E"/><circle cx="43" cy="36" r="3" fill="#fff"/><circle cx="87" cy="40" r="9" fill="#1E1E1E"/><circle cx="90" cy="36" r="3" fill="#fff"/><path d="M93 60V72Q93 100 63 100Q41 100 31 82" fill="none" stroke="#1E1E1E" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/></svg>';
/** Tab icon: the same mark, standalone SVG so the viewer needs no extra file. */
const FAVICON = 'data:image/svg+xml,' + encodeURIComponent(MARK.replace('<svg width="24" height="24"', '<svg xmlns="http://www.w3.org/2000/svg"').replace(' aria-hidden="true"', ''));

// Tokens mirror design/joplo-board.pen「设计 Token v1」; layout follows「功能差异 · 单画面（默认）」.
const CSS = `
:root{--app:#f4f1ea;--surface:#fff;--sunken:#ece8de;--selected:#fff2bf;--fg:#1e1e1e;--muted:#6e6a60;--faint:#9c978b;--line:#ddd8cc;--accent:#ffd23f;--accent-press:#e0ae00;
--ok:#2f7a47;--ok-bg:#e5f2e8;--mod:#6b5000;--mod-bg:#fff2bf;--bad:#c8402f;--bad-bg:#fbe7e3;--mono:ui-monospace,"JetBrains Mono",SFMono-Regular,Menlo,monospace}
*{box-sizing:border-box}[hidden]{display:none!important}
html,body{height:100%}body{margin:0;background:var(--app);color:var(--fg);font:14px/1.5 "Noto Sans SC",system-ui,-apple-system,"PingFang SC","Segoe UI",sans-serif;display:flex;flex-direction:column}
button{font:inherit;color:inherit;background:var(--surface);border:1px solid var(--line);border-radius:8px;cursor:pointer}
button:disabled{opacity:.4;cursor:default}button:focus-visible,input:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
code{font-family:var(--mono);font-size:12px}
.i::before,.zoom::before,#view button::before,#prev::before,#next::after,#play::before,#reload::before,#align::before{content:"";width:16px;height:16px;flex:none;background:currentColor;-webkit-mask:var(--i) center/contain no-repeat;mask:var(--i) center/contain no-repeat}
.top{height:52px;flex:none;display:flex;align-items:center;gap:12px;padding:0 16px;background:var(--surface);border-bottom:1px solid var(--line);min-width:0}
.brand{display:flex;align-items:center;gap:7px;font-weight:800;font-size:17px;letter-spacing:-.3px}.sep{width:1px;height:20px;background:var(--line)}
h1{font-size:14px;font-weight:600;margin:0;white-space:nowrap}
.range{display:flex;align-items:center;gap:6px;padding:3px 8px;border-radius:6px;background:var(--sunken);color:var(--muted);white-space:nowrap}.range #head{color:var(--fg)}
.range .i{--i:${ICONS.arrow};display:flex;color:var(--faint)}.range .i::before{width:12px;height:12px}
.totals{display:flex;gap:6px}.pill{display:flex;gap:4px;padding:2px 8px;border-radius:999px;font-size:12px;white-space:nowrap}.pill b{font-weight:700}
.added{--c:var(--ok);--bg:var(--ok-bg)}.modified,.uncertain{--c:var(--mod);--bg:var(--mod-bg)}.removed{--c:var(--bad);--bg:var(--bad-bg)}.unchanged{--c:var(--muted);--bg:var(--sunken)}
.pill,.badge{color:var(--c);background:var(--bg)}
.grow{flex:1;min-width:0}
.switch{display:flex;align-items:center;gap:8px;color:var(--muted);font-size:13px;cursor:pointer;white-space:nowrap}
.switch input{appearance:none;-webkit-appearance:none;margin:0;width:28px;height:16px;border-radius:999px;background:#ddd8cc;position:relative;cursor:pointer;transition:background .15s}
.switch input::after{content:"";position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:50%;background:#fff;transition:transform .15s}
.switch input:checked{background:var(--fg)}.switch input:checked::after{transform:translateX(12px)}#unchanged-count{color:var(--faint);font-size:12px}
.layout{flex:1;min-height:0;display:grid;grid-template-columns:296px minmax(0,1fr)}
aside{background:var(--surface);border-right:1px solid var(--line);display:flex;flex-direction:column;padding:16px 12px;min-height:0;overflow:auto}
nav{display:flex;flex-direction:column;gap:2px}
.group{margin:0;padding:12px 8px 6px;font-size:12px;font-weight:600;color:var(--muted);overflow-wrap:anywhere}.group:first-child{padding-top:0}
.badge{flex:none;display:inline-block;padding:1px 6px;border-radius:4px;font-size:11px;font-weight:600;line-height:18px;white-space:nowrap}
.scenario{display:flex;align-items:center;gap:8px;width:100%;padding:9px 10px;border:0;border-radius:8px;background:none;text-align:left}
.scenario:hover{background:var(--app)}.scenario[aria-current=true]{background:var(--selected)}.scenario[aria-current=true] .name{font-weight:600}
.scenario .name{flex:1;min-width:0;font-size:13.5px;line-height:1.4;overflow-wrap:anywhere}.meta{flex:none;font-size:11px;color:var(--faint)}
.changes{display:flex;flex-direction:column;gap:2px;padding:4px 0 8px 22px}
.row{display:flex;gap:10px;align-items:flex-start;width:100%;padding:7px 10px;border:1px solid transparent;border-radius:6px;background:none;text-align:left}
.row:hover{background:var(--app)}.row[aria-current=true]{background:var(--surface);border-color:var(--fg)}
.num{flex:none;width:18px;height:18px;margin-top:1px;border-radius:50%;background:var(--sunken);color:var(--muted);font-size:11px;font-weight:600;display:grid;place-items:center}
.row[aria-current=true] .num{background:var(--fg);color:#fff}
.row-text{display:flex;flex-direction:column;gap:2px;min-width:0}
.row-caption{font-size:13px;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}.row[aria-current=true] .row-caption{font-weight:600}
.row.unchanged .row-caption{color:var(--muted)}
.row-meta{display:flex;gap:6px;align-items:baseline;font-size:11px;color:var(--faint)}.row-meta b{color:var(--c);font-weight:600}.row-meta code{font-size:11px}
#hidden-note{margin:auto 0 0;padding:16px 10px 8px;display:flex;gap:8px;align-items:center;font-size:12px;color:var(--faint)}
#hidden-note::before{content:"";width:14px;height:14px;flex:none;background:currentColor;-webkit-mask:${ICONS.hidden} center/contain no-repeat;mask:${ICONS.hidden} center/contain no-repeat}
#disclaimer{margin:0;padding:0 10px;font-size:11px;line-height:1.5;color:var(--faint)}#hidden-note[hidden]+#disclaimer{margin-top:auto;padding-top:16px}
main{display:flex;flex-direction:column;gap:12px;padding:16px 24px 14px;min-width:0;min-height:0;overflow:auto}
#feature{margin:0 0 6px;font-size:12px;color:var(--muted);overflow-wrap:anywhere}
.title-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}h2{margin:0;font-size:22px;line-height:1.3;overflow-wrap:anywhere}
.title-row .badge{font-size:12px;padding:2px 8px}#summary{font-size:13px;color:var(--muted)}
.notice{margin:10px 0 0;padding:10px 14px;border-radius:8px;background:var(--mod-bg);color:var(--mod);font-size:13px;overflow-wrap:anywhere}
.change{display:flex;align-items:center;gap:16px;padding:14px 16px;background:var(--surface);border:1px solid var(--line);border-radius:10px}
.change::before{content:"";align-self:stretch;width:4px;border-radius:2px;background:var(--c);flex:none}.change.modified::before{background:var(--accent-press)}
.change-text{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px}
.change-meta{display:flex;gap:8px;align-items:baseline;font-size:12px;color:var(--faint);flex-wrap:wrap}#counter{font-variant-numeric:tabular-nums}#kind{font-weight:600;color:var(--c)}
.quote{margin:0;font-size:16px;font-weight:600;overflow-wrap:anywhere}.quote.gone{text-decoration:line-through;color:var(--bad)}.quote.plain{font-size:15px}
.note{margin:0;font-size:12px;color:var(--muted)}
.line{display:flex;gap:10px;align-items:baseline}.line .tag{flex:none;font-size:12px;color:var(--faint);min-width:36px}
.line .text{padding:1px 6px;border-radius:4px;font-size:15px;font-weight:600;overflow-wrap:anywhere}.line.old .text{background:var(--bad-bg);color:var(--bad);text-decoration:line-through}.line.new .text{background:var(--ok-bg);color:var(--ok)}
.results{display:flex;flex-direction:column;gap:3px;margin:2px 0}
.result{display:flex;align-items:baseline;gap:8px;min-width:0;font-size:13px}.result .key{flex:none;color:var(--muted);font-size:12px}.result .to{flex:none;color:var(--faint)}
.val{padding:0 6px;border-radius:4px;font-weight:600;overflow-wrap:anywhere;min-width:0}.val.old{background:var(--bad-bg);color:var(--bad);text-decoration:line-through}.val.new{background:var(--ok-bg);color:var(--ok)}.val.none{color:var(--faint);font-weight:400}
.transport{display:flex;gap:8px;flex:none}.transport button{height:36px;display:flex;align-items:center;gap:6px;padding:0 12px;font-weight:600}
#prev{--i:${ICONS.prev};font-size:0;gap:0;padding:0 9px}#next{--i:${ICONS.next}}#play{--i:${ICONS.play}}#play.pause{--i:${ICONS.pause}}
.primary{background:var(--accent);border-color:var(--fg)}.primary:not(:disabled):hover{background:var(--accent-press)}
.stage{flex:1;min-height:440px;display:flex;flex-direction:column;gap:8px}
.stage-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;min-height:36px}
.sides{display:flex;gap:2px;padding:3px;border-radius:9px;background:var(--sunken);min-width:0;flex-wrap:wrap}
.tab{display:flex;align-items:center;gap:7px;padding:5px 12px;border:1px solid transparent;border-radius:7px;background:none;color:var(--muted);white-space:nowrap;min-width:0}
.tab:hover{color:var(--fg)}.tab[aria-pressed=true]{background:var(--surface);border-color:var(--fg);color:var(--fg)}
.tab .pane-name{font-weight:600}.tab code{color:var(--faint)}.tab .dot{background:#bdb7a9}
.hl-added{--c:var(--ok)}.hl-removed{--c:var(--bad)}.hl-modified,.hl-uncertain{--c:var(--accent-press)}.tab[class*=hl-] .dot{background:var(--c)}
.hint{font-size:12px;color:var(--faint)}
#view button{display:flex;align-items:center;gap:6px}#view-single{--i:${ICONS.single}}#view-split{--i:${ICONS.split}}#view button::before{width:14px;height:14px}
.players{flex:1;min-height:0;display:grid;gap:12px;grid-template-columns:repeat(2,minmax(0,1fr))}
/* Single view stacks both players in one cell; the back one stays loaded so flipping keeps size and position. */
.players.single{grid-template-columns:minmax(0,1fr)}.players.single .pane{grid-area:1/1}.players.single .pane:not(.front){visibility:hidden}.players.single .pane-head{display:none}
.players.split .pane-head{cursor:zoom-in}.players.split .pane-head:hover .zoom{color:var(--fg)}
.zoom{--i:${ICONS.expand};display:flex;align-items:center;gap:5px;padding:3px 8px;border:0;background:none;color:var(--muted);font-size:12px}.zoom::before{width:13px;height:13px}
.pane{min-width:0;display:flex;flex-direction:column;background:var(--surface);border:1px solid var(--line);border-radius:10px;overflow:hidden}
.pane-head{height:40px;flex:none;display:flex;align-items:center;gap:8px;padding:0 14px;border-bottom:1px solid var(--line);white-space:nowrap;min-width:0}
.pane-head .dot{background:#bdb7a9}.pane-name{font-weight:600}.pane-head code{color:var(--faint)}.pane-step{font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums}
.chip{padding:1px 8px;border-radius:999px;background:var(--sunken);color:var(--muted);font-size:11px;overflow:hidden;text-overflow:ellipsis}
.pane.hl-added,.pane.hl-removed,.pane.hl-modified,.pane.hl-uncertain{border-color:var(--c);box-shadow:0 0 0 .5px var(--c)}
.pane.hl-uncertain{border-style:dashed}
.pane.hl-added .pane-head{background:var(--ok-bg)}.pane.hl-removed .pane-head{background:var(--bad-bg)}.pane.hl-modified .pane-head,.pane.hl-uncertain .pane-head{background:#fffbea}
.pane[class*=hl-] .pane-head .dot{background:var(--c)}
iframe{flex:1;width:100%;min-height:360px;border:0;display:block;background:#fff}.pane.paused iframe{opacity:.9}
.statusbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12px}
.dot{width:8px;height:8px;border-radius:50%;flex:none;background:var(--faint)}.dot.ok{background:var(--ok)}.dot.warn{background:var(--accent-press)}.dot.busy{background:var(--faint);animation:pulse 1s ease-in-out infinite}
@keyframes pulse{50%{opacity:.3}}@media (prefers-reduced-motion:reduce){.dot.busy{animation:none}}
#status{margin:0;color:var(--muted)}.statusbar:has(.dot.warn) #status{color:var(--mod)}
#align{--i:${ICONS.align};height:28px;display:flex;align-items:center;gap:6px;padding:0 10px;font-weight:600;border-color:var(--fg)}#align::before{width:13px;height:13px}
.seg{display:flex;gap:2px;padding:2px;border-radius:8px;background:var(--sunken)}.seg button{border:1px solid transparent;background:none;padding:4px 10px;border-radius:6px;color:var(--muted);font-size:12px}
.seg button[aria-pressed=true]{background:var(--surface);border-color:var(--line);color:var(--fg);font-weight:600}
#reload{--i:${ICONS.reload};border:0;background:none;display:flex;align-items:center;gap:6px;padding:4px 8px;color:var(--muted);font-size:12px}#reload::before{width:14px;height:14px}#reload:hover{color:var(--fg)}
@media(max-width:1100px){.totals,#unchanged-count{display:none}.layout{grid-template-columns:248px minmax(0,1fr)}}
@media(max-width:900px){body{display:block;height:auto}.top{flex-wrap:wrap;height:auto;padding:10px 14px}.layout{display:block}
aside{border-right:0;border-bottom:1px solid var(--line);max-height:none}main{padding:14px;overflow:visible}
.change{flex-wrap:wrap}.transport{width:100%}.transport #play{flex:1;justify-content:center}.players.split{grid-template-columns:minmax(0,1fr)}iframe{min-height:56vh}}
`;

/** A small public shell around the existing shipped players; no authoring runtime is loaded. */
export function diffViewerHtml(manifest: FeatureDiffManifest): string {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" type="image/svg+xml" href="${FAVICON}"><title>Joplo · Feature diff</title>
<style>${CSS}</style>
<header class="top"><span class="brand">${MARK}Joplo</span><span class="sep"></span><h1 id="page-title">Feature diff</h1><span class="range"><code id="base"></code><span class="i"></span><code id="head"></code></span><span id="totals" class="totals"></span><span class="grow"></span><label class="switch"><input id="unchanged" type="checkbox"><span data-label="unchanged">Show unchanged scenarios</span><span id="unchanged-count"></span></label></header>
<div class="layout"><aside><nav aria-label="Scenarios" id="scenarios"></nav><p id="hidden-note"></p><p id="disclaimer">Changes to a concept demo, not verification of the real product. Synchronized playback is muted.</p></aside>
<main><div><p id="feature"></p><div class="title-row"><h2 id="title"></h2><span id="badge" class="badge"></span><span id="summary"></span></div><div id="notice" class="notice"></div></div>
<section id="change" class="change" aria-live="polite"><div class="change-text"><div class="change-meta"><span><span id="counter-label">Change</span> <span id="counter"></span></span><span id="kind"></span></div><div id="detail"></div></div><div class="transport"><button id="prev">Previous</button><button id="play" class="primary play">Play changes</button><button id="next">Next</button></div></section>
<section class="stage"><div id="stage-bar" class="stage-bar"><div id="sides" class="sides" role="group"></div><span id="flip-hint" class="hint">Space flips between versions</span><span class="grow"></span><div id="view" class="seg" role="group"><button id="view-single" aria-pressed="true">Single view</button><button id="view-split" aria-pressed="false">Side by side</button></div></div><div id="players" class="players single"></div></section>
<div class="statusbar"><span id="dot" class="dot"></span><p id="status" role="status"></p><button id="align">Realign</button><span class="grow"></span><div id="scope" class="seg" role="group"><button id="only-changes" aria-pressed="true">Changes only</button><button id="full-context" aria-pressed="false">Full flow</button></div><button id="reload">Reload players</button></div></main></div>
<script type="application/json" id="joplo-diff-locales">${jsonForHtml(JSON.parse(readFileSync(new URL('./feature-diff-locales.json', import.meta.url), 'utf8')))}</script><script type="application/json" id="joplo-feature-diff">${jsonForHtml(manifest)}</script><script>${readFileSync(new URL('./feature-diff-runtime.js', import.meta.url), 'utf8')}</script></html>`;
}
