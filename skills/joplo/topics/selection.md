# Joplo selection: selection

For live reviewer messages or option confirmation, use npx joplo skill review. This topic locates an element explicitly selected with Alt/Option-click.

When the user points to a board element or step to request an edit, run npx joplo selection [dir].
It reads .joplo/selection.json directly without recompiling, avoiding a whole-page search.

## Read the result and edit locally
- Output includes at (project-relative file:line:column), a label, and numbered source with three lines before and after.
- Open the file at that location (Open in editor in the board). Edit only what the user pointed to; use the label to confirm the target.
- If line content changed, verify the current location. If the file or line is gone, select again in the board.
- A missing file or null content prints "Nothing selected" and exits 0. Ask the user to hold ⌥ (Alt) and click the element in the board.
- Do not guess a location for an object without at. Choose a specific element or step in the board.
- With --format json, data.selection preserves Selection and data.lines provides number/text.

## Full workflow
Edit → npx joplo check → npx joplo dev to view the board (a running board just adds the project) → user ⌥+clicks → npx joplo selection → edit only that location.
Run check again afterward. Preserve other options, pages, and existing user decisions.
.joplo/ is local runtime state, not the design authority. Do not commit it to Git.

Related topics: check, authoring, review
<!-- joplo-skill 0.4.0 sha256:52291362c98dd4468d3bb9dca92751c6843cdebccfae1f9b6bb53163f501a1f6 -->
