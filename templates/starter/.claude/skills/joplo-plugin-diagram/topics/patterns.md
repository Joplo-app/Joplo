# diagram recipes and pitfalls

From check:
- TRACE_UNKNOWN: Empty trace, unknown id, ids from different diagrams, or a disconnected path. Use connected ids in one Diagram / StateMachine / Sequence.

From check:
- INVALID_DIAGRAM_PROP / INVALID_DIAGRAM_CHILD: tone, pin, kind, or block kind is not a preset, or a child is in the wrong container (messages in Sequence.Group, actors in Sequence.Block). See diagram.

From check:
- DIAGRAM_UNGROUPED (info): Many nodes and no domain groups. Group them with <Diagram.Group label icon> so viewers see what belongs where.
<!-- joplo-skill 0.6.0 sha256:c658cbafd142366f80950088f36f423e725b57190171a10296f89c98b515a2f4 -->
