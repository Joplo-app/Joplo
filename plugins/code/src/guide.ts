export const skill = `# Joplo code: code

For demos of developer tools, APIs and agents that write code: an editor window that types code, shows a line diff, and highlights lines, all on the engine clock (pause, speed, video export and jumps stay consistent).
Prototype (D96): private in the Joplo monorepo; example: examples/code-change.

## Enable
import code, { Editor, typeCode, editCode, highlightLines } from '@joplo-app/plugin-code'; config({ plugins: [ui, code, …] }).

## Write
- <Editor id="api" file="api.ts" lang="typescript" code={V1} h={420} /> on any screen or layer. code is the initial file (a template string). Languages: typescript, tsx, javascript, json, python, bash, go, rust, sql, css, html, java, text. Highlighting happens at compile time; the browser ships no grammar.
- typeCode('api', snippet, { after: 12 }) types new lines after line 12 (default: at the end). cps = characters per second (default 28). The step stays until typing ends (holdMs), so autoplay never cuts it off.
- editCode('api', V2) replaces the whole file and animates a line diff: removed lines turn red and collapse, added lines turn green and expand. Use it for refactors; use typeCode when the point is "someone writes this".
- highlightLines('api', 14, 16) highlights lines 14–16 for this step only; the editor scrolls to them. highlightLines('api', null) shows none.
- Keep each version of the file as a named constant (V1, V2) next to the option; derive V2 from V1 in TS when it is a small change, so line numbers in later steps stay correct.

## Look and pacing
- One editor per screen; 360–480 px high; put it beside the thing it changes (a terminal, the app, a diagram). Give the step a caption that says what the code does, not which characters change.
- Keep typed snippets short (≤ 8 lines). A long block typed at 28 cps is a slow, empty step; use editCode for big changes.
- Lines are numbered after each change; highlight by the new numbers.

## Pitfalls
- CODE_EDITOR_UNKNOWN: the editor id is not on a screen of this step (wrong layer or id).
- A typed snippet counts its leading spaces; indent it as it will appear in the file.
- Static frames (screenshots, deep links, jumps) show the end state; only playback animates. Check typing in the board with Play, not with Next.
- Editor state is per scenario: a chapter() slice starts from the Editor's initial code, not from the previous chapter's last edit.
`;
