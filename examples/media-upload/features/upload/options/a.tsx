import { $, done, flow, narrate, option, set } from '@joplo-app/kit';
import { playClip } from '@joplo-app/plugin-media';

const happy = flow('上传成功', { cases: ['happy'], start: '/', description: '进度走完，出现成功的勾' })
  .click('pick', '选择文件', set($.ui.state, 'uploading'),
    narrate('选好文件，上传马上开始。'))
  .system('上传中', '进度一点点走完', playClip('rec'),
    narrate('两百多兆的视频，进度条一直在走，不用猜它卡没卡住。'))
  .system('上传完成', '出现成功的勾', set($.ui.state, 'done'), playClip('ok'),
    narrate('传完立刻打一个勾，同时开始生成预览。'), done('上传完成'));

export default option({
  name: '进度 + 成功动画',
  idea: '上传过程用录屏片段展示，完成时播放成功动画',
  state: { ui: { state: 'idle' } },
  scenarios: { happy },
});
