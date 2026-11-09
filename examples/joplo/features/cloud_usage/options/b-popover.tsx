import { option } from '@joplo-app/kit';

import { initialUi, layers, scenarios } from '../common.tsx';

export default option({
  name: 'B · 顶栏的账号浮层',
  idea: '顶栏一个账号按钮，上面直接写已用空间；点开是一个小浮层：空间、朗读用量和去控制台的链接',
  focus: '每一页都能看到，按钮本身就带着空间用量',
  tradeoffs: ['首页和演示页都在', '朗读用量要点开才看到；顶栏多一个按钮'],
  layers: layers(),
  state: { ui: initialUi('b') },
  scenarios: scenarios('b'),
});
