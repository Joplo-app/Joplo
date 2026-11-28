import { DIAGRAM_GROUP_ICONS, DIAGRAM_NODE_KINDS, DIAGRAM_TONES, SEQUENCE_BLOCK_KINDS } from './model.ts';

export const skill = `# Joplo diagrams: diagram

Install @joplo-app/plugin-diagram at the same version as Joplo. Explicitly enable the manifest in config.plugins; no plugin is implicitly loaded.
\`\`\`tsx
import { config } from '@joplo-app/kit';
import content from '@joplo-app/plugin-content';
import diagram from '@joplo-app/plugin-diagram';
export default config({ name: 'Architecture', plugins: [content, diagram], theme: 'diagram:juice' });
\`\`\`

## Default First Choice: Manual Rich Composition + FlowEdge (High Readability & Full Customization)
For architecture explanations, system design walkthroughs, whiteboards, data structures, and ER diagrams (typically 3–14 nodes per frame), **prefer intentional manual layout with rich board primitives + \`<FlowEdge>\` over automatic graph layout**. Manual column/row placement with Flex/Grid gives far better reading flow, zero awkward whitespace, authentic official brand logos, custom inner widgets, and complete visual freedom.

- **Architecture & Cloud**: \`<BoardZone>\`, \`<ClusterBox cloud="aws|gcp|cloudflare|kubernetes">\`, \`<ArchNode icon="cloudflare|go|rust|..." replicas metric status fill="solid">\`, 3D \`<Database engine="postgres|clickhouse|...">\`, \`<QueuePipe engine="kafka|rabbitmq|aws-sqs">\`, \`<CacheNode engine="redis" hitRate ttl>\`. Every container forwards \`children\` so you can nest custom content freely.
- **Connectors & Kinetic Steps**: Connect ANY two \`id\`s (nodes, devices, stick figures, ER tables, or custom elements) with \`<FlowEdge id from to route="curve|straight|elbow|arc" fromSide toSide label protocol />\`. In steps, animate packets with \`pulse('edge_id', { label, tone })\` and highlight health/alerts with \`setStatus('node_id', 'hot' | 'down' | 'healthy')\`.
- **86 Authentic Offline Tech/Cloud/K8s/DB/Framework Logos**: \`<TechIcon icon="postgres" variant="tile|badge|mark" />\` (auto-bound inside \`ArchNode\`, \`Database\`, \`QueuePipe\`, \`CacheNode\`, \`ClusterBox\`).
- **Whiteboard Storytelling, Devices, DSA & ER**: \`<StickFigure pose="coding|thinking|team|...">\`, \`<StickyNote color="yellow|pink|mint|sky|lavender|peach">\`, \`<SpeechBubble>\`, \`<Callout>\`, \`<DeviceFrame kind="browser|terminal|phone|server">\`, \`<ArrayStrip>\`/\`<ArrayCell>\`, \`<LinkedList>\`, \`<StackQueue>\`, \`<HashTable>\`, \`<MatrixGrid>\`, \`<FlowNode shape="start|process|decision|io|end">\`, \`<ERTable>\`/\`<ERField>\`, \`<SwimLane>\`.
- **5 Built-In Themes**: \`diagram:juice\` (tactile ceramic, default), \`diagram:sketch\` (Excalidraw hand-drawn whiteboard with Rough.js strokes), \`diagram:juice-dark\`, \`diagram:riso\`, \`diagram:blueprint\`.

\`\`\`tsx
import { ArchNode, BoardZone, CacheNode, ClusterBox, Database, FlowEdge, QueuePipe, StickFigure, pulse, setStatus } from '@joplo-app/plugin-diagram';

<BoardZone id="arch" eyebrow="SYSTEM DESIGN" title="Checkout Pipeline">
  <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 72 }}>
    <StickFigure id="user" pose="coding" label="User" />
    <ClusterBox id="vpc" label="AWS · us-east-1" cloud="aws">
      <ArchNode id="gw" label="API Gateway" icon="aws-apigw" metric="24k rps" fill="solid" />
      <ArchNode id="svc" label="Order Service" icon="go" replicas={6} />
      <Database id="pg" label="Orders Primary" engine="postgres" storage="2.4 TB" />
    </ClusterBox>
    <FlowEdge id="e1" from="user" to="gw" fromSide="right" toSide="left" label="HTTPS" />
    <FlowEdge id="e2" from="gw" to="svc" fromSide="right" toSide="left" label="gRPC" />
    <FlowEdge id="e3" from="svc" to="pg" fromSide="right" toSide="left" label="SQL" />
  </div>
</BoardZone>
// Step: .system('Hot alert', setStatus('svc', 'hot'), pulse('e2', { label: 'POST /order' }))
\`\`\`

## Read Domain Topics On Demand
- \`npx joplo skill diagram/icons\` — Full catalog of 86 built-in authentic tech/cloud/K8s/DB/language/framework/ops logos
- \`npx joplo skill diagram/arch\` — Manual architecture nodes, 3D databases, queues, caches, cluster boxes, FlowEdge & pulse/setStatus
- \`npx joplo skill diagram/whiteboard\` — 10-pose StickFigures, StickyNotes, SpeechBubbles, Callouts & DeviceFrames
- \`npx joplo skill diagram/dsa-flow\` — ArrayStrip, LinkedList, StackQueue, HashTable, MatrixGrid, FlowNode, ERTable & SwimLane
- \`npx joplo skill diagram/patterns\` — Recipes and diagnostic pitfalls

---

## Specialized & Optional Auto-Layout Diagrams (Opt-In)
Use these specialized chart primitives when their specific structure fits better than manual layout:
- **\`Sequence\`**: one request moving between services in strict time order (numbered rows, lifelines, \`alt/opt/loop/par\` blocks, \`trace()\`).
- **\`StateMachine\`**: entity lifecycle bound to data (\`value={$.data.order.status}\`, initial dot, double-border final state, automatic transition highlight).
- **\`TimeLanes\`**: multi-lane concurrent timeline / waterfall spans.
- **\`Diagram\` (opt-in auto-layout, D2 TALA / ELK)**: use **only** when a dense 15+ node graph makes manual placement impractical or you specifically want cumulative \`trace()\` dimming across many crossings. Do not default to \`<Diagram>\` for small curated architecture boards where manual \`ArchNode\` + \`FlowEdge\` reads cleaner.

### Diagram (Opt-In Auto-Layout) & trace()
\`\`\`tsx
import { Diagram, Sequence, StateMachine, TimeLanes, trace } from '@joplo-app/plugin-diagram';
<Diagram id="arch" direction="right" h={520}>
  <Diagram.Group id="g_gw" label="Gateway" icon="gateway" tone="blue">
    <Diagram.Node id="api" label="API" kind="service" description="auth · rate limit" />
  </Diagram.Group>
  <Diagram.Group id="g_data" label="Storage" icon="database">
    <Diagram.Node id="pg" label="PostgreSQL" kind="database" />
  </Diagram.Group>
  <Diagram.Edge from="api" to="pg" label="commit" async />
</Diagram>
\`\`\`
- Inside a content \`Canvas\`, let \`camera()\` own framing and write \`trace('api', 'pg', { focus: false })\`.
- Group props: \`label\`, \`icon\` (${DIAGRAM_GROUP_ICONS.join(', ')}), \`tone\` (${DIAGRAM_TONES.join(', ')}). Node \`kind\`: ${DIAGRAM_NODE_KINDS.join(', ')}.
- \`trace('a', 'b')\` lights \`a → b\` this step and keeps prior traced edges \`ok\`; \`trace.fail(...)\` marks error; \`trace.skip(...)\` dims unused paths.

### Sequence & StateMachine
- \`Sequence\`: \`<Sequence.Group>\`, \`<Sequence.Actor>\`, \`<Sequence.Message reply async>\`, \`<Sequence.Block kind="${SEQUENCE_BLOCK_KINDS.join('|')}">\`.
- \`StateMachine\`: \`<StateMachine value={$.data.status}>\`, \`<StateMachine.State initial final>\`, \`<StateMachine.Transition>\`, \`<StateMachine.Group>\`.
- Framing: \`shot('node_id')\` frames a node with its parent group title; \`shot()\` returns to the full layer.

Diagnostics for diagrams are listed in check (\`DIAGRAM_EDGE_INVALID\`, \`DIAGRAM_EDGE_UNKNOWN\`, \`UNKNOWN_DIAGRAM_NODE\`, \`TRACE_UNKNOWN\`…).`;

export const diagnostics = `- Every node in auto-layout <Diagram> belongs to a domain group; 2–6 groups (check reports DIAGRAM_UNGROUPED).
- DIAGRAM_EDGE_INVALID / DIAGRAM_EDGE_UNKNOWN: <FlowEdge> requires nonempty string from/to ids, and pulse(edgeId) must reference a <FlowEdge id={edgeId}> on the current step.
- DIAGRAM_TARGET_UNKNOWN / DIAGRAM_STATUS_INVALID: setStatus(targetId, status) requires a valid node id and status (idle|healthy|active|hot|degraded|down|cached).
- TRACE_UNKNOWN / TRACE_AMBIGUOUS: Empty trace, unknown id, disconnected path, or multiple candidate edges between the same pair.
- UNKNOWN_DIAGRAM_NODE / UNKNOWN_DIAGRAM_GROUP / DIAGRAM_GROUP_CONFLICT / DIAGRAM_GROUP_CYCLE / DIAGRAM_EDGE_INTO_OWN_GROUP.
- INVALID_DIAGRAM_PROP / INVALID_DIAGRAM_CHILD / DIAGRAM_LAYOUT_FAILED.`;

export const patterns = `# diagram recipes and pitfalls

- **Manual vs Auto-Layout**: For curated 3–14 node system architectures, build with \`ArchNode\` + \`ClusterBox\` + \`Database\` + \`QueuePipe\` + \`FlowEdge\` + \`pulse()\`/\`setStatus()\`. Reserve auto-laid-out \`<Diagram>\` for dense 15+ node topologies or when cumulative \`trace()\` across many groups is needed.
- **Avoid edge crossings manually**: Put \`<FlowEdge>\` inside the same positioned wrapper (\`position: 'relative'\`) as its endpoints, leave 64–84px gaps when an edge carries a pill label, and specify \`fromSide\`/\`toSide\` explicitly.
- **From check**: \`DIAGRAM_EDGE_UNKNOWN\`, \`TRACE_UNKNOWN\`, \`INVALID_DIAGRAM_PROP\`, \`DIAGRAM_UNGROUPED\`.`;

export const boardSkillTopics: Record<string, { description: string; body: string }> = {
  icons: {
    description: '86 authentic offline tech, cloud, AWS, Kubernetes, database, language, framework, and observability SVG logos',
    body: `# diagram/icons
- \`<TechIcon icon="postgres" variant="tile|badge|mark" size label mono />\` and \`<IconGrid title cols>\`.
- **Cloud & Edge (16)**: \`aws\`, \`aws-lambda\`, \`aws-s3\`, \`aws-ec2\`, \`aws-rds\`, \`aws-dynamodb\`, \`aws-sqs\`, \`aws-cloudfront\`, \`aws-apigw\`, \`gcp\`, \`azure\`, \`cloudflare\`, \`workers\`, \`vercel\`, \`supabase\`, \`firebase\`.
- **Containers, K8s & DevOps (22)**: \`docker\`, \`kubernetes\`, \`k8s-pod\`, \`k8s-deploy\`, \`k8s-svc\`, \`k8s-ing\`, \`k8s-cm\`, \`k8s-pv\`, \`helm\`, \`terraform\`, \`nginx\`, \`envoy\`, \`linux\`, \`git\`, \`github\`, \`github-actions\`, \`gitlab\`, \`jenkins\`, \`ansible\`, \`consul\`, \`vault\`, \`argo\`.
- **Databases & Data (15)**: \`postgres\`, \`mysql\`, \`sqlite\`, \`mongodb\`, \`redis\`, \`kafka\`, \`rabbitmq\`, \`elasticsearch\`, \`clickhouse\`, \`duckdb\`, \`snowflake\`, \`spark\`, \`airflow\`, \`prisma\`, \`graphql\`.
- **Languages (12)**: \`typescript\`, \`javascript\`, \`python\`, \`go\`, \`rust\`, \`java\`, \`swift\`, \`cpp\`, \`nodejs\`, \`bun\`, \`deno\`, \`wasm\`.
- **Frameworks (11)**: \`react\`, \`nextjs\`, \`vue\`, \`svelte\`, \`tailwind\`, \`vite\`, \`fastapi\`, \`pytorch\`, \`grpc\`, \`pnpm\`, \`figma\`.
- **Observability & SaaS (10)**: \`prometheus\`, \`grafana\`, \`otel\`, \`datadog\`, \`sentry\`, \`stripe\`, \`slack\`, \`notion\`, \`linear\`, \`discord\`.`,
  },
  arch: {
    description: 'Manual rich architecture nodes, 3D databases, queues, caches, cluster boxes, FlowEdge, and pulse/setStatus effects',
    body: `# diagram/arch
- **Default architecture mode**: compose \`<BoardZone>\`, \`<ClusterBox cloud="aws|gcp|cloudflare|kubernetes">\`, \`<ArchNode icon replicas metric status fill="solid">\`, \`<Database engine role storage>\`, \`<QueuePipe engine partitions lag messages>\`, and \`<CacheNode engine hitRate ttl>\` with Flex/Grid for crisp, intentional reading flow.
- **Custom nesting**: \`ArchNode\`, \`ClusterBox\`, \`BoardZone\`, and \`DeviceFrame\` render arbitrary \`children\` so you can embed any widget, metric, or cross-plugin component inside a node.
- **\`<FlowEdge id from to route="curve|straight|elbow|arc" fromSide toSide label protocol state dashed bidirectional />\`**: measures real \`data-jid\` coordinates inside its parent container; automatically renders hand-drawn Rough.js strokes in \`sketch\` / \`diagram:sketch\` themes.
- **Step Effects**: \`pulse('edge_id', { label, tone, reverse, durationMs })\` sends an animated packet along a \`FlowEdge\`; \`setStatus('node_id', 'healthy|active|hot|degraded|down|cached')\` updates node health state across steps.`,
  },
  whiteboard: {
    description: '10-pose hand-drawn StickFigures, tilted StickyNotes, SpeechBubbles, Callouts, and DeviceFrames',
    body: `# diagram/whiteboard
- \`<StickFigure pose="standing|coding|thinking|pointing|happy|confused|running|presenting|admin|team" label role tone size />\`.
- \`<StickyNote title text author color="yellow|pink|mint|sky|lavender|peach" tilt pin w />\` (supports arbitrary children).
- \`<SpeechBubble text speaker kind="speech|thought|shout" tail="left|right|bottom|top" tone />\`.
- \`<Callout label detail kind="badge|stamp|warning|idea" tone />\`.
- \`<DeviceFrame kind="browser|terminal|phone|tablet|laptop|server" title badge w>\` wraps any icons, nodes, or UI screens.`,
  },
  'dsa-flow': {
    description: 'Data structures (ArrayStrip, LinkedList, StackQueue, HashTable, MatrixGrid), FlowNode diamonds, ERTable, and SwimLane',
    body: `# diagram/dsa-flow
- **Data Structures**: \`<ArrayStrip label meta>\` + \`<ArrayCell value index pointer state="idle|active|compare|swap|sorted|pivot" />\`, \`<LinkedList>\` + \`<ListNode value tag state />\`, \`<StackQueue kind="stack|queue" items />\`, \`<HashTable buckets />\`, \`<MatrixGrid rows highlight />\`.
- **Flowcharts & Swimlanes**: \`<FlowNode shape="start|process|decision|io|end" label sub tone fill="solid" />\` (true SVG diamond & parallelogram) inside \`<SwimLane label tone>\`, connected by \`<FlowEdge />\`.
- **ER Data Models**: \`<ERTable id name engine>\` + \`<ERField name type pk fk nullable />\` connected by \`<FlowEdge label="1 : N" />\`.`,
  },
};
