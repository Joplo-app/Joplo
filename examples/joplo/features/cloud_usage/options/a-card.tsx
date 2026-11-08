import { option } from '@joplo-app/kit';

import { withDesignRecord } from '../../../shared/design/record.ts';
import { designRecords } from '../../../shared/design/records.ts';
import { initialUi, layers, scenarios } from '../common.tsx';

export default withDesignRecord(option({
  name: 'A · 首页的账号卡片',
  idea: '看板首页左栏底部一张 Joplo Cloud 账号卡片：套餐、空间和朗读用量、去控制台的链接',
  focus: '打开看板就能看到，不用点',
  tradeoffs: ['一眼可见', '只在首页；在演示页里要看用量得回首页或打开声音浮层'],
  layers: layers(),
  state: { ui: initialUi('a') },
  scenarios: scenarios('a'),
}), designRecords.cloud_usage);
