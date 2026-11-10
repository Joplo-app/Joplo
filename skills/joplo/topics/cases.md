# Joplo case checklist: cases

This topic applies only to works attached to a feature. Standalone work() has no cases, coverage or uses(); use chapter expected for what viewers should understand.

Before starting, read user requirements and project material. Use these dimensions to find gaps; ask only key questions that change the design.
Record unanswered items as question or rules with status `pending`. Do not confirm AI assumptions on the user's behalf.

## Eight dimensions: Pick one or two relevant questions each
- `main` Main flow: Who needs to achieve what? What should the user see afterward?
- `input` Input: What happens when empty, invalid, or at a limit? Can input be preserved and corrected in place?
- `permission` Permission: Who can view and act? Without permission, hide the entry or disable it with a reason?
- `lifecycle` Lifecycle: What happens after expiry, revocation, or deletion? Is recovery allowed?
- `async` Async: What appears during waiting, timeout, and failure? Does retry preserve input?
- `interrupt` Interruption: What is preserved when closing a modal, going back, or leaving? Confirm unsaved changes?
- `conflict` Conflict: What happens with repeated clicks or concurrent edits? How are duplicate submissions prevented?
- `consistency` Consistency: When one route changes, when do others update? How are partial results kept understandable?

## Presets by product type
Pick relevant cases to ask the user before starting. Do not include every preset; these are question seeds, not `confirmed` product rules.

### Forms / CRUD / permission (source: examples/invite)
- no_permission · permission · How should non-admin actions be blocked and explained?
- invalid_input · input · How should empty or invalid input be explained inline?
- revoked · lifecycle · How should reopening after revocation work?
- expired · lifecycle · How should access after expiry be presented?
- already_exists · conflict · How should an existing object be reported?
- duplicate_submit · conflict · How should repeated submit clicks avoid duplicate creation?
- request_failed · async · How should input be preserved and retry allowed after failure?

### Agent / AI products (source: examples/agent-arch)
- quota · permission · How should insufficient quota be blocked before calling the model?
- dangerous_tool · permission · How should the user confirm a dangerous tool before execution?
- hand_offline · async · How should failure be reported when the tool execution client disconnects or times out?
- local_data · main · How should data on the user's machine be accessed?
- tool_version · consistency · How should upgraded definitions work with an older tool implementation?
- usage_retry · async · How should failed billing event delivery retry with idempotency?
- model_failed · async · How should model failure or timeout be explained and recovered from?

### CLI / developer tools (source: examples/joplo/features/npm)
- first_run · main · How should a new user succeed within three commands?
- env_old · input · How should an outdated runtime be explained and fixed?
- version_skew · consistency · How should global and project version mismatches prompt alignment?
- optional_dep · async · How should missing optional dependencies affect only related commands?
- dir_not_empty · conflict · How should existing files in the target directory be protected from overwriting?
- typo · input · How should a command or argument typo suggest the closest match?
- user_modified · conflict · How should user edits be protected from overwriting?
- offline · async · How should offline limitations and recovery be explained?

### Local tools / multiple projects (source: examples/joplo/features/home)
- first_open · main · How should a first visit with no data offer a starting point?
- single_instance · conflict · How should an existing instance be reused instead of starting another?
- stale_resource · lifecycle · How should records for missing directories or resources be cleaned up?
- one_broken · consistency · How should other projects keep working when one fails?
- public_view · consistency · How should the public view hide private paths, gaps, and errors?
- recent · main · How should the home page switch among previously opened projects?

## Turn answers into cases and scenarios
- feature.cases: { happy: 'Complete successfully', denied: { title: 'No permission', dimension: 'permission', priority: 'high', expected: 'Explain why' } }.
- dimension uses the keys above; priority is high/medium/low; expected is the visible result the scenario must end on (the Then of an acceptance criterion; the title is the Given). Write it for every high-priority case; see story for the PM method.
- Each option uses flow(..., { cases: ['happy'] }) to reference the shared cases for comparison.
- A case with a scenario is automatically `expressed`; one with neither a scenario nor a declaration is `missing`.
- After adding a case, run check: reconsider it in every option.
- Start with two scenarios per work, the happy path and one error-and-recovery case; add the rest after the user has seen them in the board.
- A rule the user stated in this conversation is origin: 'user', status: 'confirmed'; a rule you inferred stays ai_assumption, pending.

## Declare coverage without a scenario
Coverage applies only to works attached to a feature.
Coverage status values: `expressed`, `undecided`, `missing`, `not_applicable`, `excluded`.
- work.coverage: { case_key: undecided('Why this is undecided') }.
- missing('What is missing'): leave the gap explicit; do not pretend it is `expressed`.
- notApplicable('Why not applicable') / excluded('Why excluded'): require a nonempty reason.
- Explicit declarations override inference. Use scenarios for cases that need a demo. Author work.coverage is stored in IR v3 as feature.alternatives[workId].coverage; work focus becomes decisionFocus in that same review record, beside tradeoffs.
- Do not invent business rules for full coverage. Keep asking about undecided behavior.

See authoring for flow and rule syntax; check for locating coverage diagnostics.
No mobile example yet; create a separate demo when mobile is needed (D44).

Related topics: story, authoring, check
<!-- joplo-skill 0.5.0 sha256:de6af6255bebc0f91467f3db278b78478389b8c1879a5f29f415baabb6e82a06 -->
