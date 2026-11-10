export const docs: Record<string, string> = {
  Diagram: "h (height, default 420; h=\"100%\" fills a layer), direction: 'right'|'down' (omit it: chosen to fit the stage), aspect (target width/height), scale (requested native diagram size, default 1, shrinks to fit); architecture / relationship diagram. Layout is computed at compile time (ELK layered with groups, orthogonal edges), deterministic, and identical in every step: state, when and trace never move nodes. Group nodes by business domain with Diagram.Group. Details: npx joplo skill diagram",
  'Diagram.Group': "id (required when referenced), label, icon (preset: client|service|model|database|queue|storage|external|tool|user|cloud|gateway|lock|network|device|box|brain), tone: gray|blue|green|orange|red|purple|teal, group (parent group id, instead of nesting), pin: 'start'|'end'; nestable; edges may connect to a group; a trace through its nodes highlights it",
  'Diagram.Node': "id (required for edges and trace), label, description (small second line), kind: 'client'|'service'|'model'|'database'|'queue'|'storage'|'external'|'tool'|'user', group (group id, instead of nesting), pin: 'start'|'end' (first / last layer within its group); optional state: 'idle'|'active'|'ok'|'error'|'dim' (omit it: trace() derives state)",
  'Diagram.Edge': "from, to (Node or Group ids in the same Diagram), label, async (dashed), optional state; id defaults to \"from->to\". Use trace('app', 'biz') in steps (active, then ok), trace.fail(...) (error), trace.skip(...) (dim); for multiple edges in the same direction use trace('edge_id')",
  StateMachine: "direction: 'right'|'down' (omit it: chosen to fit the stage), h, aspect, scale (default 1), value (current state id, usually value={$.data.order.status}); lifecycle diagram with StateMachine.State / StateMachine.Transition / StateMachine.Group; the current state is highlighted and the transition taken this step lights up. Details: npx joplo skill diagram",
  'StateMachine.Group': 'id, label, icon, tone, group; composite state box (substates inside)',
  'StateMachine.State': 'id (required), label, description, initial (start dot points to it), final (double border), group, pin',
  'StateMachine.Transition': "from, to (state ids), label (event [guard] / action); id defaults to \"from->to\" (\"from->to~2\" for repeats); trace('paid', 'shipped') or trace('transition_id')",
  Sequence: 'h, scale (default 1), numbered (default true: messages numbered in source order); sequence diagram: lifelines in source order, one row per message; trace message ids to light rows. Details: npx joplo skill diagram',
  'Sequence.Group': 'id, label, icon; box around participant columns (business domain)',
  'Sequence.Actor': "id (required), label, description, kind (same kinds as Diagram.Node); a participant column",
  'Sequence.Message': "id (recommended for trace), from, to (actor ids; from === to is a self call), label, reply (dashed return), async (open arrow); rows follow source order",
  'Sequence.Block': "label, kind: 'alt'|'opt'|'loop'|'par'|'break'|'critical' (default opt); fragment box around the messages inside it; nestable",
};
export const examples: Record<string, string> = {
  // 关系类图表（D69）：npx joplo components Diagram / Sequence / StateMachine 也给一个能直接用的例子；分组、布局、取景的细节在 npx joplo skill diagram
  Diagram: `<Diagram id="arch" direction="right" h={420}>
  <Diagram.Group id="g_gw" label="Gateway" icon="gateway" tone="blue">
    <Diagram.Node id="api" label="API" description="auth · rate limit" />
  </Diagram.Group>
  <Diagram.Group id="g_run" label="Runtime" icon="service" tone="purple">
    <Diagram.Node id="kernel" label="Kernel" description="model + tool loop" />
  </Diagram.Group>
  <Diagram.Group id="g_data" label="Storage" icon="database">
    <Diagram.Node id="pg" label="PostgreSQL" kind="database" />
  </Diagram.Group>
  <Diagram.Edge from="api" to="kernel" label="run" />
  <Diagram.Edge from="kernel" to="pg" label="commit" async />
</Diagram>
// steps: .system('Run starts', trace('api', 'kernel', 'pg'), shot('kernel')); groups, layout, framing: npx joplo skill diagram`,
  Sequence: `<Sequence id="login">
  <Sequence.Actor id="web" label="Web" kind="client" />
  <Sequence.Actor id="api" label="API" />
  <Sequence.Actor id="db" label="DB" kind="database" />
  <Sequence.Message id="m_req" from="web" to="api" label="POST /login" />
  <Sequence.Message id="m_q" from="api" to="db" label="find user" />
  <Sequence.Message id="m_ok" from="api" to="web" label="200 + session" reply />
</Sequence>
// steps: .system('Sign in', trace('m_req')).system('Look up the user', trace('m_q'))`,
  StateMachine: `<StateMachine id="order_sm" value={$.data.order.status}>
  <StateMachine.State id="created" label="Created" initial />
  <StateMachine.State id="paid" label="Paid" />
  <StateMachine.State id="closed" label="Closed" final />
  <StateMachine.Transition from="created" to="paid" label="pay" />
  <StateMachine.Transition from="created" to="closed" label="timeout 30 min" />
</StateMachine>
// steps: .system('Payment received', set($.data.order.status, 'paid')) lights created → paid`,
};
/** Diagram 节点与连线的 state（D41）；节点 kind 等见 diagram/model.ts。 */
export const DIAGRAM_STATES = ['idle', 'active', 'ok', 'error', 'dim'] as const;
