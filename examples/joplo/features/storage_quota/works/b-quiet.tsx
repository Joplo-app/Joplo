import { work } from '@joplo-app/kit';

import { withDesignRecord } from '../../../shared/design/record.ts';
import { designRecords } from '../../../shared/design/records.ts';
import { initialUi, layers, scenarios } from '../common.tsx';

export default withDesignRecord(work({
  title: 'B · 快满了才出现',
  summary: '平时只在账号下面写一行“已用 38 MB / 100 MB · 链接永久有效”；用到八成才出现黄色用量条和提醒，超出时变红',
  focus: '平时不打扰，需要时才提醒',
  tradeoffs: ['浮层平时更干净', '一行小字容易被忽略，第一次快满时才意识到有上限'],
  layers: layers(),
  state: { ui: initialUi('b') },
  scenarios: scenarios('b'),
}), designRecords.storage_quota);
