---
name: joplo-plugin-diagram
description: "Use the Diagrams plugin in Joplo; read its entry, component recipes and recovery rules for this project."
---

# Joplo plugin diagram: Diagrams 0.6.0

Author package: @joplo-app/plugin-diagram
# Joplo diagrams: diagram

Install @joplo-app/plugin-diagram at the same version as Joplo. Explicitly enable the manifest in config.plugins; no plugin is implicitly loaded.
```tsx
import { config } from '@joplo-app/kit';
import diagram from '@joplo-app/plugin-diagram';
export default config({ name: 'Architecture', plugins: [diagram] });
// In author TSX: import { Diagram, Sequence, StateMachine, trace } from '@joplo-app/plugin-diagram';
```
Three diagram components explain backend, architecture, and logic:
- Diagram: what talks to what, grouped by business domain (gateway, runtime, storage…). Default for architecture.
- Sequence: one request moving between services in time order. Use it to walk through a call chain.
- StateMachine: states and transitions of one entity (order, task, run). Use it for lifecycles.
Choose by the question: "what is where" → Diagram; "what happens in what order" → Sequence; "what states can it be in" → StateMachine.

Import trace from @joplo-app/plugin-diagram. IR names are diagram:Diagram, diagram:StateMachine and diagram:Sequence; never hand-edit generated IR. UNKNOWN_PLUGIN means install this package and add diagram to config.plugins, then rerun check. Trace and state-machine transition states are compiled once per step, so seeking and offline playback read the same snapshot.

## Diagram: group by business domain
```tsx
<Diagram id="arch" direction="right" h={520}>
  <Diagram.Group id="g_gw" label="Gateway" icon="gateway" tone="blue">
    <Diagram.Node id="api" label="API" kind="service" description="auth · rate limit" />
  </Diagram.Group>
  <Diagram.Group id="g_run" label="Runtime" icon="service" tone="purple">
    <Diagram.Node id="kernel" label="Kernel" description="model + tool loop" />
    <Diagram.Node id="tools" label="Tools" kind="tool" />
  </Diagram.Group>
  <Diagram.Group id="g_data" label="Storage" icon="database">
    <Diagram.Node id="pg" label="PostgreSQL" kind="database" />
  </Diagram.Group>
  <Diagram.Edge from="api" to="kernel" label="run" />
  <Diagram.Edge from="kernel" to="tools" label="call" />
  <Diagram.Edge from="kernel" to="g_data" label="commit" async />
</Diagram>
```
- Every node belongs to a domain group; 2–6 groups, ~3–15 nodes per diagram. One group around everything says nothing (check reports DIAGRAM_UNGROUPED).
- Group props: label, icon (client, service, model, database, queue, storage, external, tool, user, cloud, gateway, lock, network, device, box, brain), tone (gray, blue, green, orange, red, purple, teal), group (parent id). Groups nest.
- Put a node in a group by nesting, or flat with group="g_run" (not both). Edges may connect to a group: to="g_data".
- Node kind: client, service, model, database, queue, storage, external, tool, user. description says the responsibility in a few words; edge label says what flows.
- Bigger systems: split into layers (overview → one layer per domain) instead of one huge diagram.

## Layout is automatic (compile time)
- Joplo lays the diagram out when compiling (ELK layered: layers, few crossings, orthogonal edges, groups laid out together). Never write coordinates.
- Leave out direction: Joplo tries top → bottom and left → right and keeps the one that fills the stage with the largest text (domain groups end up side by side). direction="right" / "down" forces one; aspect={1.6} sets the wanted width / height; h="100%" fills a layer.
- Source order is the order within a layer: write nodes, groups, and edges in reading order. Write the request edge before its reply (api → kernel before kernel → api): the later one is drawn as a return edge.
- Mark secondary flows async (usage events, audit logs): they may stop pushing their target a layer down, so domains sit side by side instead of in a tall column.
- When two chains feed one node (author → storage → player, and viewer → player), write the upstream chain's groups and edges first, in the direction data flows. An edge written before its upstream chain is drawn as a loop back across the stage.
- pin="start" / pin="end" puts a node or group in the first / last layer of its group. The layout covers every element, including ones hidden with when: nodes never move between steps.
- In each step only the traced call is bold, colored, with a moving dot and its label outlined; other edges turn thin and light. One call per step reads best.

## Traces: light up a call
- trace('api', 'kernel', 'pg') lights api → kernel → pg this step; earlier traces turn ok. trace.fail('kernel', 'pg') marks failure; trace.skip('tools') dims what was not called.
- Ids are nodes, groups, or edge ids. Each segment needs an edge (either direction). For several edges between the same pair, trace the edge id.
- Groups the call passes through are highlighted too, so viewers see which domains a request touches.
- Do not write state props or set() to fake calls; trace does it.

## Sequence: one call chain in time order
```tsx
<Sequence id="login">
  <Sequence.Group label="Client"><Sequence.Actor id="web" label="Web" kind="client" /></Sequence.Group>
  <Sequence.Actor id="api" label="API" />
  <Sequence.Actor id="db" label="DB" kind="database" />
  <Sequence.Message id="m_req" from="web" to="api" label="POST /login" />
  <Sequence.Message id="m_q" from="api" to="db" label="find user" />
  <Sequence.Block kind="alt" label="wrong password">
    <Sequence.Message id="m_401" from="api" to="web" label="401" reply />
  </Sequence.Block>
  <Sequence.Message id="m_ok" from="api" to="web" label="200 + session" reply />
</Sequence>
```
- Participants are columns in source order; messages are rows in source order, numbered (numbered={false} to hide numbers).
- reply = dashed return; async = open arrow; from === to is a self call. Block kind: alt, opt, loop, par, break, critical.
- Give messages ids and trace them per step: trace('m_req'), then trace('m_q'). Earlier rows turn ok; the camera frames the row with both participants.

## StateMachine: a lifecycle
```tsx
<StateMachine id="order_sm" value={$.data.order.status}>
  <StateMachine.State id="created" label="Created" initial />
  <StateMachine.State id="paid" label="Paid" />
  <StateMachine.State id="closed" label="Closed" final />
  <StateMachine.Transition from="created" to="paid" label="pay" />
  <StateMachine.Transition from="created" to="closed" label="timeout 30 min" />
</StateMachine>
```
- value binds the current state (highlighted). When a step changes it (set($.data.order.status, 'paid')), the matching transition lights up by itself.
- trace('created', 'paid') also works. initial adds a start dot; final draws a double border; StateMachine.Group boxes substates.

## Frame with shot (what the camera keeps)
- shot('kernel') frames the node with its parent group; when the whole group would make text too small, it keeps at least the group title. Viewers always see which domain they are in.
- A trace with several nodes frames all of them and their group titles. shot('g_run') frames a whole domain; shot() returns to the whole layer.
- UI cards and panels zoom at most 1.25× (more, up to 3×, only when their text would be under about 15px on screen, e.g. a phone layer) and keep their framed container (Card, Paper, Modal, Table, AppShell side…) in view, so neighbours stay visible.
- Want more context? shot the container or group. Want the reader to compare two places? shot both ids in one step.
- Do not use zoom to read tiny text: if a diagram needs heavy zoom, split it into layers.
- Point at a part without zooming: spotlight / highlight / callout (see focus). A callout on the framed node's group or a message's participant stays in the shot.

## Other diagram types
- C4 context / container: use Diagram with kind="user" for people, Diagram.Group icon="box" for each system boundary, kind="external" for outside systems.
- Data models: show records with DataCard and Table in their own layer (see demo); an ER diagram component is not available yet.

Diagnostics for diagrams are listed in check (UNKNOWN_DIAGRAM_NODE, UNKNOWN_DIAGRAM_GROUP, TRACE_UNKNOWN…). See examples/agent-arch.

- npx joplo skill diagram/patterns: Recipes and individual pitfalls

General engine contracts: npx joplo skill plugins


## Installed references
- [patterns](./topics/patterns.md): Recipes and individual pitfalls

Engine contracts: [plugins](../joplo/topics/plugins.md).
<!-- joplo-skill 0.6.0 sha256:5c1b68cd5749d6d89b3ee01b2b67cf133dab73748c1bab5a82fda7d60b0c7868 -->
