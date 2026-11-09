import { $, done, explain, flow, narrate, option, set } from '@joplo-app/kit';
import { editCode, highlightLines, typeCode } from '@joplo-app/plugin-code';
import { CHECK, V3 } from '../../../shared/code.ts';

const happy = flow('修好偶发的 503', { cases: ['happy'], start: '/', description: '先让失败被看见，再加重试' })
  .system('测试挂了', '503 时整页白屏', set($.ui.run, 'fail'), highlightLines('api', 2),
    narrate('线上偶尔会拿到 503，这个请求一失败，整页就白了。'))
  .system('先检查状态码', '状态码不对就抛出来', typeCode('api', CHECK, { after: 2 }),
    narrate('先别急着重试，失败要先被看见：状态码不对就抛出来。'))
  .system('加上重试', '最多三次，每次多等一会儿', editCode('api', V3),
    narrate('然后把请求包进重试：最多三次，每次多等一会儿。'))
  .system('只重试 5xx', '4xx 直接抛出', highlightLines('api', 7, 8), explain('4xx 是请求本身的问题，重试也没用'),
    narrate('只有服务端的 5xx 才值得重试，4xx 是请求本身错了，重试也没用。'))
  .system('再跑一次测试', '三个用例都通过', set($.ui.run, 'pass'),
    narrate('再跑一次测试，三个用例都过了。'), done('请求失败会自动重试'));

export default option({
  name: '先检查再重试',
  idea: '先让失败抛出来，再用有上限的指数退避重试，只重试 5xx',
  state: { ui: { run: 'none' } },
  scenarios: { happy },
});
