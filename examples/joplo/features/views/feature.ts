import { feature, question, rule } from '@joplo-app/kit';

export default feature({
  order: 5,
  name: '视角（层级）与分镜',
  goal: '同一个场景、同一步，可以从不同层级去看（客户端视角、后端流转、全景）；每层有自己的镜头，可以切换层级，也可以只重放某一层',
  roles: ['作者', '观众'],
  cases: {
    switch_layer: { title: '同一步换一个层级看', dimension: 'main', priority: 'high', expected: '停在同一步，画面换成该层，镜头对准这一步在该层的焦点' },
    replay_layer: { title: '只在某一层里重放整个场景', dimension: 'main', priority: 'high', expected: '从第 0 步开始，只用这一层的镜头播放；这一层没有变化的步骤快速带过' },
    crowded: { title: '画面里东西太多，看不清', dimension: 'main', priority: 'high', expected: '每层只放大自己的那部分，不再把客户端和架构图挤在一屏' },
    no_shot: { title: '作者没写镜头', dimension: 'input', expected: '该层显示整层全景，不报错' },
    shot_unknown: { title: '镜头里引用了不存在的元素', dimension: 'input', expected: 'joplo check 报 文件:行' },
    publish_layers: { title: '观众在发布站上切换层级', dimension: 'consistency', expected: '和本地一样可以切换、重放' },
  },
  rules: {
    shot_in_step: rule('镜头写在步骤里：shot(...ids)；它只影响包含这些元素的层级，其他层保持各自上一次的镜头', { origin: 'user', status: 'confirmed', cases: ['switch_layer'] }),
    layer_decl: rule('层级在方案里声明：layers: { client: layer("客户端视角", ["client"]), backend: layer("后端流转", ["arch"]) }，另有一个自动的“全景”层', { cases: ['switch_layer', 'no_shot'] }),
    same_step: rule('切换层级不改变当前步骤和产品状态，只换“怎么看”', { origin: 'user', status: 'confirmed', cases: ['switch_layer'] }),
    shot_checked: rule('shot 和 layer 引用的元素必须存在，否则 check 报错', { cases: ['shot_unknown'] }),
  },
  questions: {
    skip_idle: question('只重放某一层时，这一层没有变化的步骤是快速带过、直接跳过，还是照常停留？', { severity: 'major', refs: ['replay_layer'] }),
  },
  pick: 'a-switch',
});
