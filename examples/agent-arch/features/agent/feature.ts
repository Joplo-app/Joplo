import { feature, question, rule } from '@joplo-app/kit';

export default feature({
  name: '一次 Agent 任务的完整链路',
  goal: '讲清楚脑手分离：大脑在云端规划、只产出工具调用；手负责执行；工具定义与实现分离；Biz Server 把关；Billing 先预检、后计量',
  roles: ['用户', 'Agent 大脑', '端侧执行器（手）', '云端沙箱（手）', 'Biz Server', 'Billing'],
  cases: {
    happy: { title: '整理本机的报销发票并生成汇总表', dimension: 'main', priority: 'high', expected: '读本机文件在端侧执行，生成表格在云端沙箱执行，回答后用量异步入账' },
    local_files: { title: '任务需要访问用户本机的文件', dimension: 'main', priority: 'high', expected: '文件不必先上传到云端' },
    quota: { title: '额度不足', dimension: 'permission', priority: 'high', expected: '在调用模型之前拦截，不产生费用，提示升级' },
    approval: { title: '危险工具（删除文件）需要用户确认', dimension: 'permission', priority: 'high', expected: '客户端弹出确认；拒绝后大脑收到“已拒绝”并改计划' },
    client_offline: { title: '端侧工具执行时客户端掉线', dimension: 'async', priority: 'high', expected: '大脑收到超时结果并告诉用户；失败的工具调用不计费' },
    schema_mismatch: { title: '工具定义升级了，客户端的实现还是旧版本', dimension: 'consistency' },
    usage_retry: { title: '用量事件投递失败', dimension: 'async', expected: '自动重试，按幂等键扣费，不重复扣' },
  },
  constraints: {
    brain_hand: '大脑和手分离部署',
    def_impl: '工具定义与工具实现分离',
  },
  rules: {
    brain_no_exec: rule('大脑只产出工具调用（名称 + 参数），从不自己执行工具', { origin: 'user', status: 'confirmed', cases: ['happy'], elements: ['brain'] }),
    def_impl_split: rule('工具定义（名称、参数 schema、危险级别、单价）集中在 Tool Registry；实现分布在端侧执行器和云端沙箱，按“名称@版本”匹配', { origin: 'user', status: 'confirmed', cases: ['happy', 'schema_mismatch'], elements: ['registry'] }),
    biz_gate: rule('客户端请求和工具结果都经过 Biz Server 鉴权与审计；大脑不直接暴露给客户端', { cases: ['happy'], elements: ['biz'] }),
    billing_precheck: rule('每次任务调用模型之前，Biz Server 先向 Billing 预检额度', { cases: ['quota'], elements: ['billing'] }),
    usage_async: rule('token 用量和工具调用次数以事件写入 SQS，Billing 按幂等键异步扣费，不阻塞回答', { cases: ['happy', 'usage_retry'], elements: ['queue'] }),
    approval_rule: rule('定义里标为 dangerous 的工具，执行前必须由用户在客户端确认', { cases: ['approval'] }),
    failed_not_billed: rule('执行失败或被拒绝的工具调用不计费', { cases: ['client_offline', 'approval'] }),
  },
  questions: {
    old_client: question('工具定义升级后，旧客户端怎么办：继续下发旧版本定义，还是不下发这个工具并提示升级？', { severity: 'major', refs: ['schema_mismatch'] }),
    pricing: question('计费按 token、按工具调用次数，还是两者都算？', { severity: 'major', refs: ['usage_retry'] }),
  },
});
