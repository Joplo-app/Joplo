---
name: joplo-feedback
description: Apply Joplo review results when reviewers have commented on or decided about a Joplo review link and the user says the review has conclusions or asks to update the demo as reviewed (评审有结论了、按评审意见修改演示); pulls decisions with npx joplo feedback and writes them back into the source.
---
# Joplo review feedback

Reviewers open the review link from npx joplo share --review, compare every option, comment, and the owner decides. Decisions come back to you; apply them to the source.

## When to use
- The user says the review has conclusions, or asks you to update the Joplo demo according to the review.
- Requires a project that was shared (.joplo/cloud.json) or a share id from the user.

## Steps
1. npx joplo feedback --format json. It reads the review share in .joplo/cloud.json, else the main share; pass --share <id> for another. data.decisions are decisions not yet applied (id, kind, featureId, targetId, note); data.comments are unresolved comments with scenario, step, stepId, and element.
2. Apply each decision to the source:
   - pick: set pick in features/<feature>/feature.ts to the option file name (targetId without the "<feature>." prefix).
   - confirm_rule: set that rule to origin: 'user', status: 'confirmed'.
   - reject_rule: rewrite the rule as the note says. If the note does not say what to do instead, set status: 'conflict' and ask the user; do not guess.
   - answer: delete the question and add a rule stating the answer with origin: 'user', status: 'confirmed'.
   - Comments are discussion input only; change the source from a comment only when the user asks.
3. npx joplo check until 0 errors.
4. Republish when the user wants: npx joplo share --review --format json updates the review version (every option); npx joplo share --format json publishes picked options only.
5. npx joplo feedback --applied <decision ids, comma-separated> --ref <git commit sha>. Mark only decisions you actually wrote back.

AUTH_REQUIRED or AUTH_EXPIRED (exit 3): ask the user to run npx joplo login in their own terminal; never log in or out for them.
Details: npx joplo skill publish (Review and feedback).
<!-- joplo-skill 0.2.10 sha256:6d6fe572364889328c53ff2b0278ec3be92dce48f8b964fc221acced0122d6bd -->
