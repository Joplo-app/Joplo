/**
 * 上传过程用录屏片段展示，完成时播放成功动画
 */
import { $, done, chapter, narrate, work, set } from '@joplo-app/kit';
import { playClip } from '@joplo-app/plugin-av';

const happy = chapter('上传成功', { expected: '看到进度走完，并出现成功的提示', description: '进度走完，出现成功的勾' })
  .click('pick', '选择文件', set($.ui.state, 'uploading'),
    narrate('选好文件，上传马上开始。'))
  .system('上传中', '进度一点点走完', playClip('rec'),
    narrate('两百多兆的视频，进度条一直在走，不用猜它卡没卡住。'))
  .system('上传完成', '出现成功的勾', set($.ui.state, 'done'), playClip('ok'),
    narrate('传完立刻打一个勾，同时开始生成预览。'), done('上传完成'));

export default work({
  title: '上传产品演示视频',
  summary: '大文件上传时能看到进度，完成后马上知道成功了',
  audience: '做产品发布的运营',
  // 复用项目里承载真实画面的 / 页面，此处不追加插槽内容。
  on: { '/': {} },
  state: { ui: { state: 'idle' } },
  scenarios: { happy },
});
