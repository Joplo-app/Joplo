import { $, done, flow, option, set } from '@tokenroll/joplo-kit';
import { Diagram } from '@tokenroll/joplo-kit/ui';

export default option({
  name: 'A · 脑手分离',
  idea: '大脑只发出工具调用，工具实现在业务侧',
  on: {
    '/': {
      main: (
        <Diagram id="arch" direction="right" h={700}>
          <Diagram.Node id="client" label="客户端" kind="client" state={$.ui.n_client} />
          <Diagram.Group id="aws" label="AWS">
            <Diagram.Node id="brain" label="Agent 大脑" description="推理循环，只发出工具调用" kind="service" state={$.ui.n_brain} />
            <Diagram.Node id="llm" label="Bedrock" kind="model" state={$.ui.n_llm} />
            <Diagram.Group id="defs" label="工具定义">
              <Diagram.Node id="registry" label="工具注册表" kind="storage" />
            </Diagram.Group>
          </Diagram.Group>
          <Diagram.Node id="impl" label="工具实现" kind="tool" state={$.ui.n_impl} />
          <Diagram.Node id="biz" label="Biz Server" kind="service" state={$.ui.n_biz} />
          <Diagram.Node id="queue" label="用量队列" kind="queue" />
          <Diagram.Node id="billing" label="Billing" kind="database" />
          <Diagram.Node id="user" label="终端用户" kind="user" />
          {/* 逐段出现：最后一步才出现的审计分组、节点与连线（布局一开始就算好位置） */}
          <Diagram.Group id="audit_grp" label="审计" when={$.ui.audit}>
            <Diagram.Node id="audit" label="审计日志" kind="database" />
          </Diagram.Group>
          <Diagram.Edge from="user" to="client" label="提问" />
          <Diagram.Edge from="client" to="brain" label="发送消息" state={$.ui.e_msg} />
          <Diagram.Edge from="brain" to="llm" label="推理" state={$.ui.e_llm} />
          <Diagram.Edge from="brain" to="registry" label="查工具定义" />
          <Diagram.Edge id="call_tool" from="brain" to="impl" label="工具调用" state={$.ui.e_tool} />
          <Diagram.Edge from="impl" to="biz" label="业务 API" state={$.ui.e_biz} />
          <Diagram.Edge from="brain" to="queue" label="用量事件" async state={$.ui.e_usage} />
          <Diagram.Edge from="queue" to="billing" async />
          <Diagram.Edge from="brain" to="audit" label="写审计" async when={$.ui.audit} />
        </Diagram>
      ),
    },
  },
  state: { ui: { n_client: 'idle', n_brain: 'idle', n_llm: 'idle', n_impl: 'idle', n_biz: 'dim', e_msg: 'idle', e_llm: 'idle', e_tool: 'idle', e_biz: 'idle', e_usage: 'idle', audit: false } },
  scenarios: {
    call: flow('一次调用', { cases: ['call'], start: '/' })
      .system('客户端发出消息', set($.ui.n_client, 'active'), set($.ui.e_msg, 'active'))
      .system('大脑请求模型推理', set($.ui.e_msg, 'ok'), set($.ui.n_brain, 'active'), set($.ui.e_llm, 'active'), set($.ui.n_llm, 'active'))
      .system('大脑发出工具调用，工具实现调用业务 API 失败', set($.ui.e_llm, 'ok'), set($.ui.n_llm, 'ok'), set($.ui.e_tool, 'active'), set($.ui.n_impl, 'active'), set($.ui.n_biz, 'error'), set($.ui.e_biz, 'error'))
      .system('记录用量，审计出现', set($.ui.e_tool, 'ok'), set($.ui.e_usage, 'active'), set($.ui.n_brain, 'ok'), set($.ui.audit, true), done('调用链走完')),
  },
});
