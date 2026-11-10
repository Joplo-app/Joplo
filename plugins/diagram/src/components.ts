import { component, type Bind } from '@joplo-app/kit/node';
import type { JoploProps } from '@joplo-app/kit/plugin';
const c = (name: string) => component(name, '@joplo-app/plugin-diagram') as unknown as (props: JoploProps) => any;
// ---------- 关系类图表（Joplo 自有，D41 / D69） ----------
/** 节点 kind（决定图标与外形）。 */
export type DiagramKind = 'client' | 'service' | 'model' | 'database' | 'queue' | 'storage' | 'external' | 'tool' | 'user';
/** 分组图标：节点 kind 之外再加几种常用的“域”图标。 */
export type DiagramIcon = DiagramKind | 'cloud' | 'gateway' | 'lock' | 'network' | 'device' | 'box' | 'brain';
/** 分组色调（跟随主题：blue = --jp-info，green = --jp-ok，orange = --jp-warn，red = --jp-danger）。 */
export type DiagramTone = 'gray' | 'blue' | 'green' | 'orange' | 'red' | 'purple' | 'teal';
type DState = 'idle' | 'active' | 'ok' | 'error' | 'dim';
type Common = JoploProps;
/** 布局提示：pin 把元素放到所在分组（或整张图）的第一层 / 最后一层；同层顺序就是源码顺序。 */
type Hints = { pin?: 'start' | 'end' };
/** direction 不写 = 按舞台比例自动选（D69 补充）；aspect = 想要的外框宽高比（缺省按舞台与 h 推算）。 */
export type DiagramProps = Common & { id?: string; direction?: 'right' | 'down'; h?: number | string; aspect?: number; scale?: number };
export type DiagramGroupProps = Common & Hints & { id?: string; label?: string; icon?: DiagramIcon; tone?: DiagramTone; group?: string };
export type DiagramNodeProps = Common & Hints & { id: string; label?: string | Bind; description?: string | Bind; kind?: DiagramKind; group?: string; state?: DState | Bind };
export type DiagramEdgeProps = Common & { id?: string; from: string; to: string; label?: string | Bind; async?: boolean; state?: DState | Bind };

/**
 * 架构图（D41 / D69）：布局在编译期算好（ELK 分层 + 分组 + 正交走线），每一步坐标都相同。按业务域分组：
 *   <Diagram id="arch" h="100%">                               // 不写 direction：按舞台比例自动选
 *     <Diagram.Group id="gw" label="网关" icon="gateway" tone="blue"><Diagram.Node id="api" label="API" kind="service" /></Diagram.Group>
 *     <Diagram.Group id="data" label="存储" icon="database"><Diagram.Node id="pg" label="PostgreSQL" kind="database" /></Diagram.Group>
 *     <Diagram.Edge from="api" to="pg" label="读写" />            // 连线也可以连到分组：to="data"
 *   </Diagram>
 * 节点也可以不嵌套、用 group="data" 归到分组里。调用链用步骤里的 trace('api', 'pg')，不要手写 state。
 */
export const Diagram = Object.assign(c('diagram:Diagram') as (p: DiagramProps) => any, {
  Group: c('diagram:Diagram.Group') as (p: DiagramGroupProps) => any,
  Node: c('diagram:Diagram.Node') as (p: DiagramNodeProps) => any,
  Edge: c('diagram:Diagram.Edge') as (p: DiagramEdgeProps) => any,
});

export type StateMachineProps = Common & { id?: string; direction?: 'right' | 'down'; h?: number | string; aspect?: number; value?: string | Bind };
export type StateProps = Common & Hints & { id: string; label?: string | Bind; description?: string | Bind; initial?: boolean; final?: boolean; group?: string; state?: DState | Bind };
export type TransitionProps = Common & { id?: string; from: string; to: string; label?: string | Bind; state?: DState | Bind };
/**
 * 状态机（D69）：实体的生命周期。value 绑定当前状态（高亮）；这一步 value 变化时，对应的转换自动点亮。
 *   <StateMachine id="order" value={$.data.order.status}>
 *     <StateMachine.State id="created" label="已创建" initial />
 *     <StateMachine.State id="paid" label="已支付" />
 *     <StateMachine.State id="closed" label="已关闭" final />
 *     <StateMachine.Transition from="created" to="paid" label="支付成功" />
 *     <StateMachine.Transition from="created" to="closed" label="超时 30 分钟" />
 *   </StateMachine>
 */
export const StateMachine = Object.assign(c('diagram:StateMachine') as (p: StateMachineProps) => any, {
  Group: c('diagram:StateMachine.Group') as (p: DiagramGroupProps) => any,
  State: c('diagram:StateMachine.State') as (p: StateProps) => any,
  Transition: c('diagram:StateMachine.Transition') as (p: TransitionProps) => any,
});

export type SequenceProps = Common & { id?: string; h?: number | string; numbered?: boolean; scale?: number };
export type ActorProps = Common & { id: string; label?: string | Bind; description?: string | Bind; kind?: DiagramKind; state?: DState | Bind };
export type MessageProps = Common & { id?: string; from: string; to: string; label?: string | Bind; reply?: boolean; async?: boolean; state?: DState | Bind };
export type BlockProps = Common & { id?: string; label?: string; kind?: 'alt' | 'opt' | 'loop' | 'par' | 'break' | 'critical' };
/**
 * 时序图（D69）：一次调用链按时间先后。参与者按源码顺序成列，消息按源码顺序成行，自动编号；
 * 步骤里 trace('m_login') 点亮这一行（之前的变为完成），镜头对准这一行。
 *   <Sequence id="login">
 *     <Sequence.Group label="客户端"><Sequence.Actor id="web" label="Web" kind="client" /></Sequence.Group>
 *     <Sequence.Actor id="api" label="API" /><Sequence.Actor id="db" label="DB" kind="database" />
 *     <Sequence.Message id="m_login" from="web" to="api" label="POST /login" />
 *     <Sequence.Block kind="alt" label="密码错误"><Sequence.Message id="m_401" from="api" to="web" label="401" reply /></Sequence.Block>
 *   </Sequence>
 */
export const Sequence = Object.assign(c('diagram:Sequence') as (p: SequenceProps) => any, {
  Group: c('diagram:Sequence.Group') as (p: Common & { id?: string; label?: string; icon?: DiagramIcon }) => any,
  Actor: c('diagram:Sequence.Actor') as (p: ActorProps) => any,
  Message: c('diagram:Sequence.Message') as (p: MessageProps) => any,
  Block: c('diagram:Sequence.Block') as (p: BlockProps) => any,
});
