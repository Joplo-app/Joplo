export const studio = `/* 讲解类视频风格：深靛蓝舞台、暖白文字、一个琥珀色强调色、无手绘描边。 */
:root {
  --jp-font: "PingFang SC", "Noto Sans SC", "Inter", "Helvetica Neue", system-ui, sans-serif;
  --jp-font-mono: "JetBrains Mono", "SF Mono", ui-monospace, monospace;
  --jp-ink: #f3f1ec;
  --jp-bg: #0d1020;
  --jp-surface: #161a30;
  --jp-subtle: #1c2140;
  --jp-muted: #9aa3c0;
  --jp-faint: #5c6485;
  --jp-line: #262c4d;
  --jp-line-strong: #3a4270;
  --jp-border: #2e355c;
  --jp-accent: #ffb020;
  --jp-select: #ffb020;
  --jp-info: #5b8cff;
  --jp-ok: #34d399;
  --jp-warn: #ffb020;
  --jp-danger: #ff6b6b;
  --jp-radius: 10px;
  --jp-shadow: 0 12px 32px rgba(0, 0, 0, .45);
  --jp-stroke: clean;
}

/* 出场动画（作者元素用 className 引用）：静态画面里 Joplo 会直接显示终态 */
@keyframes x-pop { from { opacity: 0; transform: scale(.6); } to { opacity: 1; transform: none; } }
@keyframes x-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes x-flip { from { transform: perspective(600px) rotateY(90deg); } to { transform: none; } }
@keyframes x-rise { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: none; } }
.x-pop { animation: x-pop 500ms cubic-bezier(.2, .8, .2, 1) both; }
.x-fade { animation: x-fade 600ms ease both; }
.x-flip { animation: x-flip 650ms cubic-bezier(.2, .8, .2, 1) both; }
.x-rise { animation: x-rise 600ms cubic-bezier(.2, .8, .2, 1) both; }
/* 逐字出现：每个字一个 x-type，animation-delay 按序号错开 */
.x-type { animation: x-fade 80ms linear both; }
`;
