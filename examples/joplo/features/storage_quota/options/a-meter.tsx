import { option } from '@joplo-app/kit';

import { withDesignRecord } from '../../../shared/design/record.ts';
import { designRecords } from '../../../shared/design/records.ts';
import { initialUi, layers, scenarios } from '../common.tsx';

export default withDesignRecord(option({
  name: 'A · 一直显示用量条',
  idea: '发布浮层里一直有一条用量条：已用 / 上限；快满变黄，超出变红',
  focus: '每次发布前都知道自己用了多少',
  tradeoffs: ['一眼就知道还剩多少', '浮层多一块，空间很宽裕时有点多余'],
  layers: layers(),
  state: { ui: initialUi('a') },
  scenarios: scenarios('a'),
}), designRecords.storage_quota);
