import { feature, rule } from '@joplo-app/kit';
export default feature({
  order: 19,
  name: '配乐：离线音色与章节起播',
  goal: '作者用曲式和章节 marker 对齐配乐；观众离线听到真实 GM 乐器与鼓组，检查失败时知道如何恢复',
  // D93 已决定的实现路线；此 pick 选择公开流程示意，不代表新一轮 UI 评审已获批准。
  pick: 'a-render',
  cases: {
    marker: { title: '从章节 marker 开始', dimension: 'main', expected: 'check 打印精确 marker 时间，起播、跳步、深链使用同一个数字偏移' },
    offline: { title: '离线且没有音色缓存', dimension: 'async', expected: '提示联网预安装或复制经校验的音色及许可缓存，不静默换回近似合成器' },
    missing: { title: 'marker 名拼错后修复', dimension: 'input', expected: '编译 error 锚定 play 步骤；修复后 check 通过，其他结构检查仍可运行' },
  },
  rules: {
    rendered: rule('本机 Alda → SoundFont → MP3 96kbps（FLAC 仅本机母版）；站点只有音频字节和署名，不带谱子、音色文件或作者路径。来源 D93。', {origin:'user',status:'confirmed',cases:['marker','offline']}),
    timing: rule('from 由本机检查解析为毫秒，IR 只有数字；当前 host 不在此功能中新增跨章继承或交叉淡化。来源 D93 与实现边界。', {origin:'code_observed',status:'confirmed',cases:['marker','missing']}),
    recovery: rule('未知 marker 在检查器可用时阻止编译；缺 Alda 只告警，继续其他检查。联网取得音色缓存不等于上传或发布。来源 D93。', {origin:'code_observed',status:'confirmed',cases:['offline','missing']}),
  },
});
